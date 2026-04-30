"use server";

// Bulk-action server actions for the Page 4 Tenants list.
//
// Every action takes a `ids` CSV-string + an optional payload. All
// gated through requirePlatformPermission for the relevant fine-
// grained perm. Writes go through the existing helpers (subscription
// events, audit log) so MRR-movement reports stay accurate.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import {
  recordTenantPlanChanged,
  recordTenantCanceled,
  recordTenantReactivated,
} from "@/server/billing/subscription-events";

const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;

const idsField = z.string().min(1).max(20_000);

function parseIds(formData: FormData): string[] {
  const raw = String(formData.get("ids") ?? "");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/* ── Add / remove tags ─────────────────────────────────── */

const tagSchema = z.object({
  ids: idsField,
  tag: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/, "Tags must be lowercase alphanumeric with - or _"),
});

export async function bulkAddTag(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't tag tenants" } as const;
  const parsed = tagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;
  const tag = parsed.data.tag.toLowerCase();

  // Per-row update — Prisma's array-push isn't expressible in updateMany,
  // and we want to dedupe per-row.
  let count = 0;
  for (const id of ids) {
    const t = await db.tenant.findUnique({ where: { id }, select: { adminTags: true } });
    if (!t) continue;
    if (t.adminTags.includes(tag)) continue;
    await db.tenant.update({ where: { id }, data: { adminTags: { push: tag } } });
    count += 1;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_tag_added",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, tag, count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count } as const;
}

export async function bulkRemoveTag(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't tag tenants" } as const;
  const parsed = tagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;
  const tag = parsed.data.tag.toLowerCase();

  let count = 0;
  for (const id of ids) {
    const t = await db.tenant.findUnique({ where: { id }, select: { adminTags: true } });
    if (!t) continue;
    const next = t.adminTags.filter((x) => x !== tag);
    if (next.length === t.adminTags.length) continue;
    await db.tenant.update({ where: { id }, data: { adminTags: { set: next } } });
    count += 1;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_tag_removed",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, tag, count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count } as const;
}

/* ── Suspend / reactivate ─────────────────────────────── */

const reasonField = z.string().max(500).optional();

export async function bulkSuspend(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.suspend")) return { ok: false, error: "Your role can't suspend tenants" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;
  const reason = reasonField.parse(String(formData.get("reason") ?? "") || undefined);

  const updated = await db.tenant.updateMany({
    where: { id: { in: ids }, status: { in: ["ACTIVE", "TRIAL", "PAST_DUE"] } },
    data: { status: "SUSPENDED", suspensionReason: reason ?? "Bulk suspend" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_suspended",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, count: updated.count, reason },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count: updated.count } as const;
}

export async function bulkReactivate(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.suspend")) return { ok: false, error: "Your role can't reactivate tenants" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  // Snapshot statuses so we know which ones come back from CANCELED
  // (those need a REACTIVATED subscription event).
  const snapshots = await db.tenant.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, plan: true },
  });
  const updated = await db.tenant.updateMany({
    where: { id: { in: ids }, status: { in: ["SUSPENDED", "CANCELED", "PAST_DUE"] } },
    data: { status: "ACTIVE", suspensionReason: null },
  });
  for (const s of snapshots) {
    if (s.status === "CANCELED") {
      await recordTenantReactivated({
        tenantId: s.id,
        plan: s.plan,
        source: "MANUAL",
        actorUserId: ctx.userId,
        reason: "Bulk reactivate",
      });
    }
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_reactivated",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, count: updated.count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count: updated.count } as const;
}

/* ── Move plan ─────────────────────────────────────────── */

const planSchema = z.object({ plan: z.enum(PLANS), ids: idsField });

export async function bulkMovePlan(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.plan_change")) return { ok: false, error: "Your role can't change tenant plans" } as const;
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid plan" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;
  const nextPlan = parsed.data.plan as Plan;

  const snaps = await db.tenant.findMany({
    where: { id: { in: ids } },
    select: { id: true, plan: true },
  });
  let count = 0;
  for (const s of snaps) {
    if (s.plan === nextPlan) continue;
    await db.tenant.update({ where: { id: s.id }, data: { plan: nextPlan } });
    await recordTenantPlanChanged({
      tenantId: s.id,
      fromPlan: s.plan,
      toPlan: nextPlan,
      source: "MANUAL",
      actorUserId: ctx.userId,
      reason: "Bulk plan change",
    });
    count += 1;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_plan_changed",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, plan: nextPlan, count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count } as const;
}

/* ── Apply coupon ──────────────────────────────────────── */

const couponSchema = z.object({ code: z.string().min(1).max(64), ids: idsField });

export async function bulkApplyCoupon(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.coupon")) return { ok: false, error: "Your role can't apply coupons" } as const;
  const parsed = couponSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid coupon" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  const coupon = await db.coupon.findUnique({
    where: { code: parsed.data.code.toUpperCase() },
    select: { id: true, status: true, code: true },
  });
  if (!coupon || coupon.status !== "ACTIVE") {
    return { ok: false, error: "Coupon not found or not active" } as const;
  }
  const updated = await db.tenant.updateMany({
    where: { id: { in: ids } },
    data: { activeCouponId: coupon.id },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_coupon_applied",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, code: coupon.code, count: updated.count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count: updated.count } as const;
}

/* ── Assign CSM ─────────────────────────────────────────── */

const csmSchema = z.object({
  ids: idsField,
  /** Empty / "none" → unassign. */
  csmUserId: z.string().max(40).optional(),
});

export async function bulkAssignCsm(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) return { ok: false, error: "Your role can't assign CSMs" } as const;
  const parsed = csmSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  const csmId = parsed.data.csmUserId && parsed.data.csmUserId !== "none" ? parsed.data.csmUserId : null;
  if (csmId) {
    const exists = await db.user.findUnique({ where: { id: csmId }, select: { id: true } });
    if (!exists) return { ok: false, error: "User not found" } as const;
  }
  const updated = await db.tenant.updateMany({
    where: { id: { in: ids } },
    data: { accountManagerId: csmId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_csm_assigned",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, csmId, count: updated.count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count: updated.count } as const;
}

/* ── Email selected (templated) ─────────────────────────── */

const emailSchema = z.object({
  ids: idsField,
  subject: z.string().min(1).max(200),
  body:    z.string().min(1).max(8_000),
});

export async function bulkEmailOwners(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't broadcast emails" } as const;
  // We piggy-back on tenant.tag perm — broadcasting is a low-stakes
  // mutation that doesn't fit any existing perm cleanly. A future
  // slice can add a `tenant.broadcast_email` perm if needed.
  const parsed = emailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  // Resolve OWNER emails only — we don't broadcast to every member.
  const tenants = await db.tenant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true,
      memberships: { where: { role: "OWNER" }, select: { user: { select: { email: true } } } },
    },
  });

  let count = 0;
  for (const t of tenants) {
    for (const m of t.memberships) {
      if (!m.user?.email) continue;
      // Avoid pulling the email lib into this action — defer to the
      // dispatcher's `sendEmail` via dynamic import so the action
      // stays lightweight.
      const { sendEmail } = await import("@/lib/email");
      await sendEmail({
        to: m.user.email,
        subject: parsed.data.subject,
        text: parsed.data.body,
        html: `<p>${escapeHtml(parsed.data.body).replace(/\n/g, "<br/>")}</p>`,
      });
      count += 1;
    }
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_email_sent",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, subject: parsed.data.subject, count },
  });
  return { ok: true, count } as const;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

/* ── Delete (typed confirmation) ────────────────────────── */

const deleteSchema = z.object({
  ids: idsField,
  /** User must type "DELETE" (uppercase) to confirm. */
  confirmation: z.literal("DELETE"),
});

export async function bulkHardDelete(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.delete")) return { ok: false, error: "Only Super Admins can hard-delete tenants" } as const;
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: 'Type DELETE to confirm' } as const;
  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  // Snapshot what we're about to nuke for the audit log + cancel
  // events for any active payers (so MRR-movement reports show
  // the churn).
  const snaps = await db.tenant.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, slug: true, status: true, plan: true },
  });
  for (const s of snaps) {
    if (s.status === "ACTIVE" || s.status === "PAST_DUE") {
      await recordTenantCanceled({
        tenantId: s.id,
        lastPlan: s.plan,
        source: "MANUAL",
        actorUserId: ctx.userId,
        reason: "Bulk hard-delete",
      });
    }
  }
  // Actual hard-delete cascades to all FKs that have onDelete: Cascade.
  const result = await db.tenant.deleteMany({ where: { id: { in: ids } } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_bulk_hard_deleted",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, names: snaps.map((s) => s.name), count: result.count },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, count: result.count } as const;
}
