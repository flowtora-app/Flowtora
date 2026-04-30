"use server";

// Tenant Detail (Page 4a) server actions.
//
// Notes, integrations, IP allowlist/blocklist, health-snapshot
// recompute, settings (rename / change-slug / transfer ownership),
// and the danger-zone destructive operations.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { isReservedSlug, slugify } from "@/lib/slug";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import { recordTenantCanceled, recordTenantPlanChanged } from "@/server/billing/subscription-events";
import { findIntegration } from "@/lib/integrations";

/* ── Notes ───────────────────────────────────────────────── */

const noteCreateSchema = z.object({
  tenantId: z.string().min(1),
  body:     z.string().min(1).max(10_000),
  pinned:   z.union([z.literal("on"), z.literal("")]).optional(),
  isPrivate: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function createTenantNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  // Notes use tenant.tag perm — every staff role with read access
  // who can also tag can also note. Auditor stays read-only.
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't add notes" } as const;
  const parsed = noteCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const { tenantId, body } = parsed.data;
  const pinned = parsed.data.pinned === "on";
  const isPrivate = parsed.data.isPrivate === "on";

  const note = await db.tenantNote.create({
    data: { tenantId, authorId: ctx.userId, body, pinned, isPrivate },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_note_created",
    entityType: "TenantNote",
    entityId: note.id,
    metadata: { actor: ctx.email, pinned, isPrivate },
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { ok: true, id: note.id } as const;
}

const noteUpdateSchema = z.object({
  noteId:    z.string().min(1),
  body:      z.string().max(10_000).optional(),
  pinned:    z.union([z.literal("on"), z.literal("off")]).optional(),
  isPrivate: z.union([z.literal("on"), z.literal("off")]).optional(),
});

export async function updateTenantNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = noteUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const note = await db.tenantNote.findUnique({
    where: { id: parsed.data.noteId },
    select: { id: true, tenantId: true, authorId: true },
  });
  if (!note) return { ok: false, error: "Not found" } as const;
  // Author can always edit; admins with tenant.tag can edit any
  // non-private note.
  const isAuthor = note.authorId === ctx.userId;
  if (!isAuthor && !ctx.can("tenant.tag")) {
    return { ok: false, error: "Forbidden" } as const;
  }
  const data: { body?: string; pinned?: boolean; isPrivate?: boolean } = {};
  if (parsed.data.body != null) data.body = parsed.data.body;
  if (parsed.data.pinned != null) data.pinned = parsed.data.pinned === "on";
  if (parsed.data.isPrivate != null) data.isPrivate = parsed.data.isPrivate === "on";
  await db.tenantNote.update({ where: { id: note.id }, data });
  revalidatePath(`/platform/tenants/${note.tenantId}`);
  return { ok: true } as const;
}

export async function deleteTenantNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const id = String(formData.get("noteId") ?? "");
  if (!id) return { ok: false, error: "Missing id" } as const;
  const note = await db.tenantNote.findUnique({
    where: { id },
    select: { id: true, tenantId: true, authorId: true },
  });
  if (!note) return { ok: false, error: "Not found" } as const;
  if (note.authorId !== ctx.userId && !ctx.can("tenant.tag")) {
    return { ok: false, error: "Forbidden" } as const;
  }
  await db.tenantNote.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: note.tenantId,
    action: "platform.tenant_note_deleted",
    entityType: "TenantNote",
    entityId: note.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`/platform/tenants/${note.tenantId}`);
  return { ok: true } as const;
}

/* ── Integrations ───────────────────────────────────────── */

const integrationConnectSchema = z.object({
  tenantId: z.string().min(1),
  provider: z.string().min(1),
  scope:    z.string().max(200).optional(),
});

export async function connectTenantIntegration(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't manage integrations" } as const;
  const parsed = integrationConnectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const def = findIntegration(parsed.data.provider);
  if (!def) return { ok: false, error: "Unknown integration" } as const;
  await db.tenantIntegration.upsert({
    where: { tenantId_provider: { tenantId: parsed.data.tenantId, provider: parsed.data.provider } },
    update: { status: "CONNECTED", scope: parsed.data.scope ?? null, errorCount: 0, lastError: null },
    create: {
      tenantId: parsed.data.tenantId,
      provider: parsed.data.provider,
      status: "CONNECTED",
      scope: parsed.data.scope ?? null,
      connectedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.tenant_integration_connected",
    entityType: "TenantIntegration",
    metadata: { actor: ctx.email, provider: parsed.data.provider, scope: parsed.data.scope },
  });
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

export async function disconnectTenantIntegration(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't manage integrations" } as const;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id" } as const;
  const row = await db.tenantIntegration.findUnique({ where: { id }, select: { id: true, tenantId: true, provider: true } });
  if (!row) return { ok: false, error: "Not found" } as const;
  await db.tenantIntegration.update({ where: { id }, data: { status: "DISCONNECTED" } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: row.tenantId,
    action: "platform.tenant_integration_disconnected",
    entityType: "TenantIntegration",
    entityId: id,
    metadata: { actor: ctx.email, provider: row.provider },
  });
  revalidatePath(`/platform/tenants/${row.tenantId}`);
  return { ok: true } as const;
}

/** "Force resync" — placeholder that bumps lastSyncAt + records the
 *  trigger to the audit log. Real per-integration sync paths wire
 *  up in the integration's own handler. */
export async function resyncTenantIntegration(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't manage integrations" } as const;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id" } as const;
  const row = await db.tenantIntegration.findUnique({ where: { id }, select: { id: true, tenantId: true, provider: true } });
  if (!row) return { ok: false, error: "Not found" } as const;
  await db.tenantIntegration.update({
    where: { id },
    data: { lastSyncAt: new Date(), errorCount: 0, lastError: null, status: "CONNECTED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: row.tenantId,
    action: "platform.tenant_integration_resync_triggered",
    entityType: "TenantIntegration",
    entityId: id,
    metadata: { actor: ctx.email, provider: row.provider },
  });
  revalidatePath(`/platform/tenants/${row.tenantId}`);
  return { ok: true } as const;
}

/* ── IP rules ─────────────────────────────────────────── */

const ipRuleSchema = z.object({
  tenantId: z.string().min(1),
  kind:     z.enum(["ALLOW", "BLOCK"]),
  cidr:     z.string().min(1).max(64),
  note:     z.string().max(200).optional(),
});

export async function addTenantIpRule(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't change IP rules" } as const;
  const parsed = ipRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.tenantIpRule.create({
    data: {
      tenantId: parsed.data.tenantId,
      kind: parsed.data.kind,
      cidr: parsed.data.cidr.trim(),
      note: parsed.data.note ?? null,
      createdById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.tenant_ip_rule_added",
    entityType: "TenantIpRule",
    metadata: { actor: ctx.email, kind: parsed.data.kind, cidr: parsed.data.cidr },
  });
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

export async function deleteTenantIpRule(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't change IP rules" } as const;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing id" } as const;
  const row = await db.tenantIpRule.findUnique({ where: { id }, select: { id: true, tenantId: true, kind: true, cidr: true } });
  if (!row) return { ok: false, error: "Not found" } as const;
  await db.tenantIpRule.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: row.tenantId,
    action: "platform.tenant_ip_rule_deleted",
    entityType: "TenantIpRule",
    entityId: id,
    metadata: { actor: ctx.email, kind: row.kind, cidr: row.cidr },
  });
  revalidatePath(`/platform/tenants/${row.tenantId}`);
  return { ok: true } as const;
}

/* ── Health snapshot recompute ─────────────────────────── */

export async function recomputeTenantHealth(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't recompute" } as const;
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { ok: false, error: "Missing tenantId" } as const;
  const reason = String(formData.get("reason") ?? "Manual recompute") || "Manual recompute";

  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, lastActivityAt: true },
  });
  if (!t) return { ok: false, error: "Not found" } as const;

  // Same heuristic the list view uses, but split into sub-scores so
  // the trend chart has component data.
  const baseScore = t.status === "ACTIVE" ? 90 : t.status === "PAST_DUE" ? 40 : t.status === "TRIAL" ? 70 : 30;
  const lastDays = t.lastActivityAt
    ? Math.floor((Date.now() - t.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const loginRecency = lastDays == null ? 50 : Math.max(0, Math.min(100, 100 - lastDays * 3));
  const paymentHealth = t.status === "PAST_DUE" ? 30 : t.status === "ACTIVE" ? 95 : 70;
  const score = Math.round(0.4 * loginRecency + 0.3 * paymentHealth + 0.3 * baseScore);

  await db.tenantHealthSnapshot.create({
    data: {
      tenantId,
      score,
      subscores: {
        loginRecency, paymentHealth, baseScore,
      },
      trigger: "manual",
      note: reason,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_health_recomputed",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { actor: ctx.email, score, reason },
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { ok: true, score } as const;
}

/* ── Settings: rename / change slug / transfer ownership ─── */

const renameSchema = z.object({ tenantId: z.string().min(1), name: z.string().min(1).max(120) });

export async function renameTenant(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't rename tenants" } as const;
  const parsed = renameSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.tenant.update({ where: { id: parsed.data.tenantId }, data: { name: parsed.data.name.trim() } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.tenant_renamed",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, name: parsed.data.name },
  });
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

const slugSchema = z.object({ tenantId: z.string().min(1), slug: z.string().min(2).max(40) });

export async function changeTenantSlug(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't change slugs" } as const;
  const parsed = slugSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const next = slugify(parsed.data.slug);
  if (isReservedSlug(next) || next.length < 2) {
    return { ok: false, error: "Reserved or invalid slug" } as const;
  }
  const taken = await db.tenant.findUnique({ where: { slug: next }, select: { id: true } });
  if (taken && taken.id !== parsed.data.tenantId) return { ok: false, error: "Slug already taken" } as const;
  const prev = await db.tenant.findUnique({ where: { id: parsed.data.tenantId }, select: { slug: true } });
  if (!prev) return { ok: false, error: "Not found" } as const;
  await db.tenant.update({ where: { id: parsed.data.tenantId }, data: { slug: next } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.tenant_slug_changed",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, from: prev.slug, to: next },
  });
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

const transferSchema = z.object({
  tenantId: z.string().min(1),
  newOwnerEmail: z.string().email().max(254),
});

export async function transferTenantOwnership(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.transfer")) return { ok: false, error: "Your role can't transfer ownership" } as const;
  const parsed = transferSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const newOwner = await db.user.findUnique({ where: { email: parsed.data.newOwnerEmail }, select: { id: true } });
  if (!newOwner) return { ok: false, error: "User not found — new owner must already have an account" } as const;
  // Demote any existing OWNER memberships to ADMIN, then upsert the
  // target user as the new OWNER.
  await db.$transaction(async (tx) => {
    await tx.membership.updateMany({
      where: { tenantId: parsed.data.tenantId, role: "OWNER" },
      data: { role: "ADMIN" },
    });
    await tx.membership.upsert({
      where: { userId_tenantId: { userId: newOwner.id, tenantId: parsed.data.tenantId } },
      update: { role: "OWNER", status: "ACTIVE" },
      create: { userId: newOwner.id, tenantId: parsed.data.tenantId, role: "OWNER" },
    });
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.tenant_ownership_transferred",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, newOwnerEmail: parsed.data.newOwnerEmail },
  });
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

/* ── Mark VIP ─────────────────────────────────────────── */

export async function toggleTenantVip(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't tag tenants" } as const;
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { ok: false, error: "Missing tenantId" } as const;
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { adminTags: true } });
  if (!t) return { ok: false, error: "Not found" } as const;
  const has = t.adminTags.includes("vip");
  const next = has ? t.adminTags.filter((x) => x !== "vip") : [...t.adminTags, "vip"];
  await db.tenant.update({ where: { id: tenantId }, data: { adminTags: { set: next } } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: has ? "platform.tenant_vip_unset" : "platform.tenant_vip_set",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { ok: true, isVip: !has } as const;
}

/* ── Danger zone: cancel subscription immediately + hard delete ── */

const cancelSchema = z.object({
  tenantId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function cancelTenantSubscription(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) return { ok: false, error: "Your role can't cancel subscriptions" } as const;
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, status: true, plan: true },
  });
  if (!t) return { ok: false, error: "Not found" } as const;
  if (t.status === "CANCELED" || t.status === "ARCHIVED") {
    return { ok: false, error: "Already cancelled" } as const;
  }
  await db.tenant.update({
    where: { id: t.id },
    data: { status: "CANCELED", suspensionReason: parsed.data.reason ?? null },
  });
  if (t.status === "ACTIVE" || t.status === "PAST_DUE") {
    await recordTenantCanceled({
      tenantId: t.id,
      lastPlan: t.plan,
      source: "MANUAL",
      actorUserId: ctx.userId,
      reason: parsed.data.reason ?? "Cancelled from tenant detail",
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.tenant_subscription_canceled",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { actor: ctx.email, reason: parsed.data.reason ?? null },
  });
  revalidatePath(`/platform/tenants/${t.id}`);
  return { ok: true } as const;
}

const hardDeleteSchema = z.object({
  tenantId: z.string().min(1),
  /** Caller must type the slug exactly to confirm. */
  confirmSlug: z.string().min(1),
});

export async function hardDeleteTenant(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.delete")) return { ok: false, error: "Only Super Admins can hard-delete tenants" } as const;
  const parsed = hardDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const t = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, name: true, slug: true, status: true, plan: true },
  });
  if (!t) return { ok: false, error: "Not found" } as const;
  if (parsed.data.confirmSlug !== t.slug) {
    return { ok: false, error: "Confirmation slug doesn't match" } as const;
  }
  if (t.status === "ACTIVE" || t.status === "PAST_DUE") {
    await recordTenantCanceled({
      tenantId: t.id,
      lastPlan: t.plan,
      source: "MANUAL",
      actorUserId: ctx.userId,
      reason: "Hard delete from tenant detail",
    });
  }
  await db.tenant.delete({ where: { id: t.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: null,
    action: "platform.tenant_hard_deleted",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { actor: ctx.email, name: t.name, slug: t.slug },
  });
  revalidatePath("/platform/tenants");
  redirect("/platform/tenants?ok=deleted");
}

/** Force a plan change directly from the tenant detail page (without
 *  going through the bulk picker). Mirrors the legacy `updateTenantPlan`
 *  but emits a real SubscriptionEvent. */
const planSchema = z.object({
  tenantId: z.string().min(1),
  plan:     z.enum(["STARTER", "GROWTH", "PRO", "ENTERPRISE"]),
});

export async function changeTenantPlanSingle(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) return { ok: false, error: "Your role can't change plans" } as const;
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid plan" } as const;
  const t = await db.tenant.findUnique({ where: { id: parsed.data.tenantId }, select: { id: true, plan: true } });
  if (!t) return { ok: false, error: "Not found" } as const;
  if (t.plan === parsed.data.plan) return { ok: true } as const;
  await db.tenant.update({ where: { id: t.id }, data: { plan: parsed.data.plan as Plan } });
  await recordTenantPlanChanged({
    tenantId: t.id,
    fromPlan: t.plan,
    toPlan: parsed.data.plan as Plan,
    source: "MANUAL",
    actorUserId: ctx.userId,
    reason: "Tenant detail plan change",
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: t.id,
    action: "platform.tenant_plan_changed_single",
    entityType: "Tenant",
    entityId: t.id,
    metadata: { actor: ctx.email, from: t.plan, to: parsed.data.plan },
  });
  revalidatePath(`/platform/tenants/${t.id}`);
  return { ok: true } as const;
}
