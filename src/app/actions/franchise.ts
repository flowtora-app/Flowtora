"use server";

// Phase 15 Slice D — franchise group settings actions.
//
// Owner-only knobs that flip a tenant's role within a franchise group:
//   - become a group root (host the shared catalog/templates)
//   - stop being a group root (only when no children point at us)
//   - leave a parent group (children can detach themselves)
//
// We deliberately do NOT support setting `parentTenantId` from the UI yet —
// that's a cross-tenant operation that needs an invite-token flow to prevent
// hostile re-parenting. For now, attaching a child to a parent is a platform-
// staff operation done out-of-band.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { isEntitled } from "@/lib/entitlements";

function asBool(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true" || v === "1";
}

// Any mutation under franchise settings must re-verify the entitlement —
// hiding the tab in the layout isn't enough because these form actions
// are reachable by POST regardless of nav.
async function requireFranchiseEntitlement(slug: string, tenantId: string, plan: Parameters<typeof isEntitled>[1]) {
  const allowed = await isEntitled(tenantId, plan, "franchiseGroup");
  if (!allowed) {
    redirect(`/t/${slug}/settings/billing?error=${encodeURIComponent("Franchise groups require the Enterprise plan.")}`);
  }
}

export async function updateGroupRoot(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  await requireFranchiseEntitlement(slug, ctx.tenant.id, ctx.tenant.plan);
  const desired = asBool(formData.get("isGroupRoot"));

  const me = await db.tenant.findUnique({
    where: { id: ctx.tenant.id },
    select: { id: true, isGroupRoot: true, parentTenantId: true },
  });
  if (!me) redirect(`/t/${slug}/settings/franchise?error=${encodeURIComponent("Tenant not found")}`);

  if (desired === me.isGroupRoot) {
    revalidatePath(`/t/${slug}/settings/franchise`);
    return;
  }

  if (desired && me.parentTenantId) {
    redirect(
      `/t/${slug}/settings/franchise?error=${encodeURIComponent(
        "Leave the parent group before becoming a group root yourself.",
      )}`,
    );
  }

  if (!desired) {
    // Refuse to demote a root that still has children — they would silently
    // stop inheriting, which is exactly the kind of surprise the toggle UI
    // shouldn't allow without an explicit cleanup step.
    const childCount = await db.tenant.count({ where: { parentTenantId: me.id } });
    if (childCount > 0) {
      redirect(
        `/t/${slug}/settings/franchise?error=${encodeURIComponent(
          `Detach ${childCount} child tenant${childCount === 1 ? "" : "s"} before stepping down as group root.`,
        )}`,
      );
    }
  }

  await db.tenant.update({
    where: { id: me.id },
    data: { isGroupRoot: desired },
  });

  await logAudit({
    tenantId: me.id,
    userId: ctx.userId,
    action: desired ? "tenant.group_root_enabled" : "tenant.group_root_disabled",
    entityType: "Tenant",
    entityId: me.id,
  });

  revalidatePath(`/t/${slug}/settings/franchise`);
}

export async function leaveParentGroup(slug: string) {
  const ctx = await requirePermission(slug, "tenant:manage");
  await requireFranchiseEntitlement(slug, ctx.tenant.id, ctx.tenant.plan);
  const me = await db.tenant.findUnique({
    where: { id: ctx.tenant.id },
    select: { id: true, parentTenantId: true },
  });
  if (!me?.parentTenantId) {
    revalidatePath(`/t/${slug}/settings/franchise`);
    return;
  }

  await db.tenant.update({
    where: { id: me.id },
    data: { parentTenantId: null },
  });

  await logAudit({
    tenantId: me.id,
    userId: ctx.userId,
    action: "tenant.group_left",
    entityType: "Tenant",
    entityId: me.id,
    metadata: { previousParentTenantId: me.parentTenantId },
  });

  revalidatePath(`/t/${slug}/settings/franchise`);
}
