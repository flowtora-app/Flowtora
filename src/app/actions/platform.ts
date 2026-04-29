"use server";

// Phase 17 Slice A — tenant admin actions used from /platform/tenants/[id].
//
// Every mutation goes through requirePlatformAdmin (SUPER_ADMIN or
// SITE_MANAGER). Support agents can read the page but the server actions
// they can fire are limited to notes updates (below) — the rest redirect
// them away with ?error=forbidden via requirePlatformAdmin.
//
// We also intentionally log every mutation via logPlatformAudit with
// tenantId set so the per-tenant activity feed on the detail page shows
// both tenant-self activity AND what platform staff have done to the
// account (suspensions, plan bumps, notes edits) in one timeline.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  requirePlatformAdmin,
  requirePlatformStaff,
  requirePlatformPermission,
  logPlatformAudit,
} from "@/lib/platform";
import { rankPlatformRole } from "@/lib/rbac";
import {
  startImpersonationSession,
  stopImpersonationSession,
  getActiveImpersonation,
} from "@/lib/impersonation";
import type { TenantStatus, Plan, SupportTicketCategory } from "@prisma/client";
import {
  platformReplyToSupportTicket as _reply,
  platformUpdateSupportTicket as _update,
} from "@/app/actions/support";
import {
  clearSampleDataForTenant,
  loadSampleDataForTenant,
} from "@/app/actions/sample-data";

const TENANT_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "ARCHIVED"] as const;
const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;
const TENANT_ENVIRONMENTS = ["LIVE", "DEMO", "TEST"] as const;
// Phase 19 — release cohort values. Kept in sync with the BetaCohort
// enum in schema.prisma.
const BETA_COHORTS = ["NONE", "ALPHA", "BETA", "PILOT"] as const;
// Phase 1 — grace window between archiving and hard delete. Long enough
// that a miscommunication with the owner can be reversed; short enough
// that data doesn't linger forever. Tweak as we get ops signal.
const DEFAULT_ARCHIVE_GRACE_DAYS = 30;

const statusSchema = z.object({
  status: z.enum(TENANT_STATUSES),
  suspensionReason: z.string().max(500).optional().or(z.literal("")),
});

export async function updateTenantStatus(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Invalid status")}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true, suspensionReason: true, name: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }

  const nextStatus: TenantStatus = parsed.data.status;
  const reason = parsed.data.suspensionReason?.trim() || null;

  // Only keep a reason around if we're actually in a suspended state — clearing
  // it on reactivation matches what the /account-suspended page expects.
  const nextReason = nextStatus === "SUSPENDED" ? reason : null;

  if (tenant.status === nextStatus && tenant.suspensionReason === nextReason) {
    revalidatePath(`/platform/tenants/${tenantId}`);
    return;
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { status: nextStatus, suspensionReason: nextReason },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: nextStatus === "SUSPENDED"
      ? "platform.tenant_suspended"
      : tenant.status === "SUSPENDED"
        ? "platform.tenant_reactivated"
        : "platform.tenant_status_changed",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: {
      from: tenant.status,
      to: nextStatus,
      reason: nextReason,
      actor: ctx.email,
    },
  });

  revalidatePath(`/platform/tenants`);
  revalidatePath(`/platform/tenants/${tenantId}`);
}

const planSchema = z.object({
  plan: z.enum(PLANS),
});

export async function updateTenantPlan(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Invalid plan")}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, plan: true, name: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }

  const nextPlan: Plan = parsed.data.plan;
  if (tenant.plan === nextPlan) {
    revalidatePath(`/platform/tenants/${tenantId}`);
    return;
  }

  await db.tenant.update({ where: { id: tenantId }, data: { plan: nextPlan } });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_plan_changed",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { from: tenant.plan, to: nextPlan, actor: ctx.email },
  });

  revalidatePath(`/platform/tenants`);
  revalidatePath(`/platform/tenants/${tenantId}`);
}

// Support agents CAN leave notes (they're not destructive) — use
// requirePlatformStaff here and not requirePlatformAdmin. This is the one
// mutation the support tier is trusted with day-to-day.
const notesSchema = z.object({
  notes: z.string().max(8000).optional().or(z.literal("")),
});

export async function updateTenantNotes(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = notesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Notes too long")}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, notes: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }

  const next = parsed.data.notes?.length ? parsed.data.notes : null;
  if (tenant.notes === next) {
    revalidatePath(`/platform/tenants/${tenantId}`);
    return;
  }

  await db.tenant.update({ where: { id: tenantId }, data: { notes: next } });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_notes_updated",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { actor: ctx.email, length: next?.length ?? 0 },
  });

  revalidatePath(`/platform/tenants/${tenantId}`);
}

// ────────────────────────────────────────────────────────────
// Slice B — Impersonation
// ────────────────────────────────────────────────────────────

const impersonationStartSchema = z.object({
  reason: z.string().max(500).optional().or(z.literal("")),
});

export async function startImpersonation(tenantId: string, formData: FormData) {
  // Support agents cannot impersonate — only SUPER_ADMIN and SITE_MANAGER.
  // requirePlatformAdmin enforces this.
  const ctx = await requirePlatformAdmin();
  const parsed = impersonationStartSchema.safeParse(Object.fromEntries(formData.entries()));
  const reason = parsed.success ? parsed.data.reason?.trim() || null : null;

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, status: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }

  // Suspended tenants can still be impersonated — that's when support
  // most needs access. (The requireTenant redirect to /account-suspended
  // only fires for regular users; platform staff bypass it via synthetic
  // membership.)

  const session = await startImpersonationSession({
    platformUserId: ctx.userId,
    tenantId: tenant.id,
    reason,
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: tenant.id,
    action: "platform.impersonation_started",
    entityType: "ImpersonationSession",
    entityId: session.id,
    metadata: { actor: ctx.email, reason, tenantName: tenant.name },
  });

  redirect(`/t/${tenant.slug}/dashboard`);
}

// ────────────────────────────────────────────────────────────
// Health admin — bulk kill switch for impersonation. Used by the
// /platform/health admin actions panel as the "if something looks
// wrong, end every active impersonation right now" lever.
// ────────────────────────────────────────────────────────────

export async function endAllActiveImpersonations() {
  const ctx = await requirePlatformAdmin();
  const now = new Date();

  // Pull the active rows first so we can audit-log each one. (No bulk
  // updateMany audit since logs need per-row entityId.)
  const active = await db.impersonationSession.findMany({
    where:  { endedAt: null },
    select: { id: true, tenantId: true, platformUserId: true },
  });

  await db.impersonationSession.updateMany({
    where: { endedAt: null },
    data:  { endedAt: now },
  });

  for (const s of active) {
    await logPlatformAudit({
      userId:     ctx.userId,
      tenantId:   s.tenantId,
      action:     "platform.impersonation_ended_bulk",
      entityType: "ImpersonationSession",
      entityId:   s.id,
      metadata:   { actor: ctx.email, viaHealth: true },
    });
  }

  revalidatePath("/platform/health");
  redirect(`/platform/health?ok=imp_ended&count=${active.length}`);
}

// ────────────────────────────────────────────────────────────
// Platform settings — maintenance mode + feature freeze toggles.
// Singleton row in PlatformSetting, audit-logged on every change.
// ────────────────────────────────────────────────────────────

const platformSettingsSchema = z.object({
  maintenanceMode:     z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean()),
  maintenanceMessage:  z.string().max(500).optional().or(z.literal("")),
  featureFreezeMode:   z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean()),
  featureFreezeReason: z.string().max(500).optional().or(z.literal("")),
});

export async function updatePlatformSettings(formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = platformSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/settings?error=${encodeURIComponent("Invalid input")}`);
  }
  const d = parsed.data;

  // Read previous to know what actually changed (for audit metadata).
  const prev = await db.platformSetting.findUnique({ where: { id: "singleton" } });

  await db.platformSetting.upsert({
    where: { id: "singleton" },
    update: {
      maintenanceMode:     d.maintenanceMode,
      maintenanceMessage:  d.maintenanceMessage && d.maintenanceMessage.length > 0 ? d.maintenanceMessage : null,
      featureFreezeMode:   d.featureFreezeMode,
      featureFreezeReason: d.featureFreezeReason && d.featureFreezeReason.length > 0 ? d.featureFreezeReason : null,
      updatedBy: ctx.userId,
    },
    create: {
      id: "singleton",
      maintenanceMode:     d.maintenanceMode,
      maintenanceMessage:  d.maintenanceMessage && d.maintenanceMessage.length > 0 ? d.maintenanceMessage : null,
      featureFreezeMode:   d.featureFreezeMode,
      featureFreezeReason: d.featureFreezeReason && d.featureFreezeReason.length > 0 ? d.featureFreezeReason : null,
      updatedBy: ctx.userId,
    },
  });

  // Audit log — emit a discrete event for each toggle that actually
  // flipped, so /platform/audit can show a clean before/after.
  if (prev?.maintenanceMode !== d.maintenanceMode) {
    await logPlatformAudit({
      userId:     ctx.userId,
      tenantId:   null,
      action:     d.maintenanceMode ? "platform.setting_maintenance_on" : "platform.setting_maintenance_off",
      entityType: "PlatformSetting",
      entityId:   "singleton",
      metadata:   { actor: ctx.email, message: d.maintenanceMessage ?? null },
    });
  }
  if (prev?.featureFreezeMode !== d.featureFreezeMode) {
    await logPlatformAudit({
      userId:     ctx.userId,
      tenantId:   null,
      action:     d.featureFreezeMode ? "platform.setting_freeze_on" : "platform.setting_freeze_off",
      entityType: "PlatformSetting",
      entityId:   "singleton",
      metadata:   { actor: ctx.email, reason: d.featureFreezeReason ?? null },
    });
  }
  // Catch-all event for message / reason text edits where the toggle
  // didn't change — keeps the history complete.
  const messageChanged = (prev?.maintenanceMessage ?? null) !== (d.maintenanceMessage || null);
  const reasonChanged = (prev?.featureFreezeReason ?? null) !== (d.featureFreezeReason || null);
  if (
    messageChanged && prev?.maintenanceMode === d.maintenanceMode ||
    reasonChanged && prev?.featureFreezeMode === d.featureFreezeMode
  ) {
    await logPlatformAudit({
      userId:     ctx.userId,
      tenantId:   null,
      action:     "platform.setting_text_updated",
      entityType: "PlatformSetting",
      entityId:   "singleton",
      metadata:   {
        actor: ctx.email,
        messageChanged,
        reasonChanged,
      },
    });
  }

  revalidatePath("/platform/settings");
  // Maintenance mode reaches into every tenant layout, so flush those too.
  revalidatePath("/", "layout");
  redirect(`/platform/settings?ok=settings_saved`);
}

// ────────────────────────────────────────────────────────────
// Slice C — Feature flags / entitlement overrides
// ────────────────────────────────────────────────────────────

const featureFlagSchema = z.object({
  key:      z.string().min(1).max(80),
  enabled:  z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean()),
  note:     z.string().max(500).optional().or(z.literal("")),
  // When tenantId is empty string / missing, this is a GLOBAL row.
  tenantId: z.string().optional().or(z.literal("")),
  // Partial-rollout percentage. Empty / undefined = full enabled-as-stated.
  rolloutPct: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : undefined),
    z.number().int().min(0).max(100).optional(),
  ),
  // Auto-expire datetime; ISO string from <input type="datetime-local">.
  expiresAt: z.string().optional().or(z.literal("")),
});

export async function upsertFeatureFlag(formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = featureFlagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/feature-flags?error=${encodeURIComponent("Invalid input")}`);
  }
  const { key, enabled, note } = parsed.data;
  const tenantId = parsed.data.tenantId?.length ? parsed.data.tenantId : null;
  const rolloutPct = parsed.data.rolloutPct ?? null;
  const expiresAt = parsed.data.expiresAt && parsed.data.expiresAt.length > 0
    ? new Date(parsed.data.expiresAt)
    : null;

  // Prisma's composite unique with a nullable column is awkward (the
  // generated `key_tenantId` where input doesn't accept null cleanly), so
  // we do a manual find-then-write. Two round trips per write is fine at
  // the volume platform staff toggle flags.
  const existing = await db.featureFlag.findFirst({
    where: { key, tenantId: tenantId ?? null },
    select: { id: true },
  });
  if (existing) {
    await db.featureFlag.update({
      where: { id: existing.id },
      data: {
        enabled,
        note: note?.length ? note : null,
        updatedBy: ctx.userId,
        rolloutPct,
        expiresAt,
      },
    });
  } else {
    await db.featureFlag.create({
      data: {
        key,
        tenantId,
        enabled,
        note: note?.length ? note : null,
        updatedBy: ctx.userId,
        rolloutPct,
        expiresAt,
      },
    });
  }

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.feature_flag_set",
    entityType: "FeatureFlag",
    metadata: {
      key, enabled, scope: tenantId ? "tenant" : "global",
      actor: ctx.email, note, rolloutPct, expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  revalidatePath("/platform/feature-flags");
  if (tenantId) revalidatePath(`/platform/tenants/${tenantId}`);
}

export async function deleteFeatureFlag(flagId: string) {
  const ctx = await requirePlatformAdmin();
  const flag = await db.featureFlag.findUnique({
    where: { id: flagId },
    select: { key: true, tenantId: true },
  });
  if (!flag) return;

  await db.featureFlag.delete({ where: { id: flagId } });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: flag.tenantId,
    action: "platform.feature_flag_cleared",
    entityType: "FeatureFlag",
    metadata: { key: flag.key, scope: flag.tenantId ? "tenant" : "global", actor: ctx.email },
  });

  revalidatePath("/platform/feature-flags");
  if (flag.tenantId) revalidatePath(`/platform/tenants/${flag.tenantId}`);
}

// ────────────────────────────────────────────────────────────
// Slice D — Support ticket staff-side wrappers
// ────────────────────────────────────────────────────────────

export async function replyToSupportTicketAsStaff(ticketId: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  await _reply({ ticketId, authorUserId: ctx.userId, authorEmail: ctx.email, formData });
}

export async function updateSupportTicketAsStaff(ticketId: string, formData: FormData) {
  // Status / priority / assignment are admin-tier concerns — support agents
  // can reply but shouldn't close or escalate.
  const ctx = await requirePlatformAdmin();
  await _update({ ticketId, authorUserId: ctx.userId, authorEmail: ctx.email, formData });
}

// ────────────────────────────────────────────────────────────
// Phase 20 Slice D — Canned reply library (platform-wide)
// ────────────────────────────────────────────────────────────

const CANNED_CATEGORIES = ["BILLING", "BUG", "FEATURE_REQUEST", "QUESTION", "OTHER"] as const;

const cannedCreateSchema = z.object({
  title:    z.string().min(2).max(120),
  body:     z.string().min(1).max(8000),
  category: z.enum(CANNED_CATEGORIES).optional().or(z.literal("")),
});

export async function createCannedReply(formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = cannedCreateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/support/templates?error=${encodeURIComponent("Title and body are required.")}`);
  }
  const category = parsed.data.category
    ? (parsed.data.category as SupportTicketCategory)
    : null;
  const reply = await db.supportCannedReply.create({
    data: { title: parsed.data.title, body: parsed.data.body, category, createdBy: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.support_canned_created",
    entityType: "SupportCannedReply",
    entityId: reply.id,
    metadata: { title: reply.title, actor: ctx.email },
  });
  revalidatePath("/platform/support/templates");
}

const cannedUpdateSchema = cannedCreateSchema.extend({
  id: z.string().min(1),
});

export async function updateCannedReply(formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = cannedUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/support/templates?error=${encodeURIComponent("Invalid update")}`);
  }
  const category = parsed.data.category
    ? (parsed.data.category as SupportTicketCategory)
    : null;
  await db.supportCannedReply.update({
    where: { id: parsed.data.id },
    data: { title: parsed.data.title, body: parsed.data.body, category },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.support_canned_updated",
    entityType: "SupportCannedReply",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/support/templates");
}

export async function archiveCannedReply(id: string) {
  const ctx = await requirePlatformAdmin();
  await db.supportCannedReply.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.support_canned_archived",
    entityType: "SupportCannedReply",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/support/templates");
}

export async function restoreCannedReply(id: string) {
  const ctx = await requirePlatformAdmin();
  await db.supportCannedReply.update({
    where: { id },
    data: { archivedAt: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.support_canned_restored",
    entityType: "SupportCannedReply",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/support/templates");
}

// ────────────────────────────────────────────────────────────
// Phase 1 — lifecycle: archive / restore / environment
// ────────────────────────────────────────────────────────────

const archiveSchema = z.object({
  reason:     z.string().max(500).optional().or(z.literal("")),
  graceDays:  z.string().optional().or(z.literal("")),
  // Categorized reason for analytics rollups. UI offers a select with
  // ArchiveReasonCode values; free-form `reason` stays alongside.
  reasonCode: z.enum([
    "NOT_A_FIT", "TOO_EXPENSIVE", "MISSING_FEATURES", "SWITCHED_TO_COMPETITOR",
    "BUSINESS_CLOSED", "TEMPORARY_PAUSE", "TECHNICAL_ISSUES", "POOR_SUPPORT",
    "ADMIN_DECISION", "OTHER",
  ]).optional().or(z.literal("")),
});

/**
 * Soft-delete a tenant. Flips status to ARCHIVED, stamps `archivedAt` /
 * `archivedBy`, and sets `scheduledDeletionAt` for a permanent-delete
 * cron to pick up later. Restorable via `restoreTenant`.
 */
export async function archiveTenant(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData.entries()));
  const reason = parsed.success && parsed.data.reason?.trim() ? parsed.data.reason.trim() : null;
  const graceDays = parsed.success && parsed.data.graceDays && /^\d+$/.test(parsed.data.graceDays)
    ? Math.max(1, Math.min(365, parseInt(parsed.data.graceDays, 10)))
    : DEFAULT_ARCHIVE_GRACE_DAYS;

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true, archivedAt: true, name: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }
  if (tenant.status === "ARCHIVED") {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Already archived")}`);
  }

  const scheduledDeletionAt = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);

  const reasonCode = parsed.success && parsed.data.reasonCode && parsed.data.reasonCode.length > 0
    ? (parsed.data.reasonCode as
        | "NOT_A_FIT" | "TOO_EXPENSIVE" | "MISSING_FEATURES" | "SWITCHED_TO_COMPETITOR"
        | "BUSINESS_CLOSED" | "TEMPORARY_PAUSE" | "TECHNICAL_ISSUES" | "POOR_SUPPORT"
        | "ADMIN_DECISION" | "OTHER")
    : null;

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: ctx.userId,
      archiveReason: reason,
      archiveReasonCode: reasonCode,
      scheduledDeletionAt,
      // Clear suspension reason — archive is its own thing.
      suspensionReason: null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_archived",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: {
      actor: ctx.email,
      reason,
      graceDays,
      scheduledDeletionAt: scheduledDeletionAt.toISOString(),
      previousStatus: tenant.status,
    },
  });

  revalidatePath(`/platform/tenants`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?ok=${encodeURIComponent(`Archived. Restorable until ${scheduledDeletionAt.toISOString().slice(0, 10)}.`)}`);
}

const restoreSchema = z.object({
  nextStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE"]).default("ACTIVE"),
});

/**
 * Undo an archive. Clears `archivedAt`/`archivedBy`/`scheduledDeletionAt`
 * and flips status back to the caller-selected state (usually ACTIVE).
 */
export async function restoreTenant(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = restoreSchema.safeParse(Object.fromEntries(formData.entries()));
  const nextStatus = parsed.success ? parsed.data.nextStatus : "ACTIVE";

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }
  if (tenant.status !== "ARCHIVED") {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Tenant is not archived")}`);
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      status: nextStatus,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
      scheduledDeletionAt: null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_restored",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { actor: ctx.email, nextStatus },
  });

  revalidatePath(`/platform/tenants`);
  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?ok=${encodeURIComponent("Restored.")}`);
}

const environmentSchema = z.object({
  environment: z.enum(TENANT_ENVIRONMENTS),
});

/**
 * Flip a tenant between LIVE / DEMO / TEST. The workspace shell renders
 * a ribbon on non-LIVE tenants so nobody confuses a sandbox for prod.
 */
export async function updateTenantEnvironment(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = environmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Invalid environment")}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, environment: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }
  if (tenant.environment === parsed.data.environment) {
    redirect(`/platform/tenants/${tenantId}`);
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { environment: parsed.data.environment },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId,
    action: "platform.tenant_environment_changed",
    entityType: "Tenant",
    entityId: tenantId,
    metadata: { actor: ctx.email, from: tenant.environment, to: parsed.data.environment },
  });

  revalidatePath(`/platform/tenants`);
  revalidatePath(`/platform/tenants/${tenantId}`);
}

const cohortSchema = z.object({
  betaCohort: z.enum(BETA_COHORTS),
});

/**
 * Phase 19 — flip a tenant into a release cohort (alpha / beta / pilot) or
 * back to general availability. Feature-flag rollouts and staged comms can
 * target by cohort instead of touching each tenant individually.
 */
export async function updateTenantCohort(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = cohortSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Invalid cohort")}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, betaCohort: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }
  if (tenant.betaCohort === parsed.data.betaCohort) {
    redirect(`/platform/tenants/${tenantId}`);
  }

  await db.tenant.update({
    where: { id: tenantId },
    data:  { betaCohort: parsed.data.betaCohort },
  });

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId,
    action:     "platform.tenant_cohort_changed",
    entityType: "Tenant",
    entityId:   tenantId,
    metadata:   { actor: ctx.email, from: tenant.betaCohort, to: parsed.data.betaCohort },
  });

  revalidatePath(`/platform/tenants`);
  revalidatePath(`/platform/tenants/${tenantId}`);
}

/**
 * Phase 19 Slice D — sandbox reset for DEMO / TEST tenants.
 *
 * Intended for sales-demo tenants that accumulate stale records between
 * prospect walkthroughs. Wipes everything the seeder created (customers
 * tagged "demo" and products with DEMO- SKUs, plus their cascading
 * quotes / orders / invoices / tasks / install events), then re-seeds
 * the fresh sample set so the next demo starts clean. Real tenant data
 * is never touched because deletion keys only on the seeder's markers.
 *
 * Guard: environment must not be LIVE — production tenants must never
 * have their data wiped through this path, regardless of intent.
 */
export async function resetTenantSandbox(tenantId: string, _formData?: FormData) {
  const ctx = await requirePlatformAdmin();

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      name: true,
      environment: true,
      quoteNumberPrefix: true,
      orderNumberPrefix: true,
      invoiceNumberPrefix: true,
      defaultTaxRate: true,
    },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Tenant not found")}`);
  }
  if (tenant.environment === "LIVE") {
    redirect(
      `/platform/tenants/${tenantId}?error=${encodeURIComponent(
        "Sandbox reset is only allowed on DEMO or TEST tenants.",
      )}`,
    );
  }

  const cleared = await clearSampleDataForTenant(tenant.id);
  await loadSampleDataForTenant(tenant, ctx.userId);

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId,
    action:     "platform.sandbox_reset",
    entityType: "Tenant",
    entityId:   tenantId,
    metadata: {
      actor:       ctx.email,
      environment: tenant.environment,
      cleared,
    },
  });

  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/t/${tenant.slug}`, "layout");
  redirect(`/platform/tenants/${tenantId}?ok=sandbox_reset`);
}

export async function stopImpersonation() {
  // Resolve the current user directly instead of via requirePlatformStaff
  // so we don't fight with redirect()'s internal throw contract. A caller
  // without a session (e.g. cookie replayed after sign out) gets the
  // cookie cleared and a bounce to home — no DB write, no audit noise.
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? "";
  const active = await getActiveImpersonation(userId);

  await stopImpersonationSession(userId);

  if (active && userId) {
    await logPlatformAudit({
      userId,
      tenantId: active.tenantId,
      action: "platform.impersonation_stopped",
      entityType: "ImpersonationSession",
      entityId: active.id,
      metadata: {
        actor: email,
        durationSeconds: Math.round((Date.now() - active.startedAt.getTime()) / 1000),
      },
    });
    redirect(`/platform/tenants/${active.tenantId}`);
  }
  redirect(userId ? "/platform/tenants" : "/");
}

// ────────────────────────────────────────────────────────────
// Phase 2 polish — tenant tags, bulk operations.
// ────────────────────────────────────────────────────────────

const TAG_RX = /^[a-z0-9][a-z0-9-]{0,30}$/;

const setTagsSchema = z.object({
  tags: z.string().max(500).optional().or(z.literal("")),
});

/**
 * Replace the full set of admin-side tags on a tenant. Tags are
 * lowercase kebab-case (e.g. "vip", "beta-pilot", "at-risk"); invalid
 * entries are silently dropped. Submitting an empty string clears all.
 */
export async function setTenantTags(tenantId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = setTagsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants/${tenantId}?error=${encodeURIComponent("Invalid tags")}`);
  }
  const raw = parsed.data.tags ?? "";
  const tags = Array.from(new Set(
    raw.split(/[,\s]/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && TAG_RX.test(t))
      .slice(0, 20),
  ));

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, adminTags: true },
  });
  if (!tenant) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Not found")}`);
  }

  await db.tenant.update({
    where: { id: tenantId },
    data:  { adminTags: tags },
  });

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   tenant.id,
    action:     "platform.tenant_tags_set",
    entityType: "Tenant",
    entityId:   tenant.id,
    metadata:   { actor: ctx.email, before: tenant.adminTags, after: tags },
  });

  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
  redirect(`/platform/tenants/${tenantId}?ok=tags_saved`);
}

const bulkActionSchema = z.object({
  action: z.enum(["ARCHIVE", "ADD_TAG", "REMOVE_TAG"]),
  ids:    z.string().min(1),
  tag:    z.string().max(40).optional().or(z.literal("")),
});

/**
 * Bulk operation across selected tenants. Supports:
 *   • ARCHIVE      — soft-delete all selected (skips already-archived)
 *   • ADD_TAG      — append a single tag to all selected
 *   • REMOVE_TAG   — remove a single tag from all selected
 */
export async function bulkUpdateTenants(formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const parsed = bulkActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Invalid bulk action")}`);
  }
  const ids = parsed.data.ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    redirect(`/platform/tenants?error=${encodeURIComponent("No tenants selected")}`);
  }

  if (parsed.data.action === "ARCHIVE") {
    const scheduledDeletionAt = new Date(Date.now() + DEFAULT_ARCHIVE_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const updated = await db.tenant.updateMany({
      where: { id: { in: ids }, status: { not: "ARCHIVED" } },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedBy: ctx.userId,
        archiveReasonCode: "ADMIN_DECISION",
        scheduledDeletionAt,
      },
    });
    await logPlatformAudit({
      userId:     ctx.userId,
      tenantId:   null,
      action:     "platform.tenants_bulk_archived",
      entityType: "Tenant",
      metadata:   { actor: ctx.email, ids, count: updated.count },
    });
    revalidatePath("/platform/tenants");
    redirect(`/platform/tenants?ok=bulk_archived&count=${updated.count}`);
  }

  // Tag operations
  const tag = parsed.data.tag?.trim().toLowerCase() ?? "";
  if (!tag || !TAG_RX.test(tag)) {
    redirect(`/platform/tenants?error=${encodeURIComponent("Invalid tag")}`);
  }
  const targets = await db.tenant.findMany({
    where:  { id: { in: ids } },
    select: { id: true, adminTags: true },
  });
  for (const t of targets) {
    const next = parsed.data.action === "ADD_TAG"
      ? Array.from(new Set([...t.adminTags, tag])).slice(0, 20)
      : t.adminTags.filter((existing) => existing !== tag);
    if (JSON.stringify(next) === JSON.stringify(t.adminTags)) continue;
    await db.tenant.update({ where: { id: t.id }, data: { adminTags: next } });
  }
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     parsed.data.action === "ADD_TAG"
      ? "platform.tenants_bulk_tag_added"
      : "platform.tenants_bulk_tag_removed",
    entityType: "Tenant",
    metadata:   { actor: ctx.email, ids, tag, count: targets.length },
  });
  revalidatePath("/platform/tenants");
  redirect(`/platform/tenants?ok=bulk_tag_${parsed.data.action === "ADD_TAG" ? "added" : "removed"}&count=${targets.length}`);
}

// ────────────────────────────────────────────────────────────
// Phase 23 — admin self-service profile + preferences.
// ────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name:     z.string().max(120).optional().or(z.literal("")),
  bio:      z.string().max(500).optional().or(z.literal("")),
  timezone: z.string().max(60).optional().or(z.literal("")),
});

export async function updatePlatformProfile(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/profile?error=${encodeURIComponent("Invalid input")}`);
  }
  await db.user.update({
    where: { id: ctx.userId },
    data: {
      name:     parsed.data.name && parsed.data.name.length > 0 ? parsed.data.name : null,
      bio:      parsed.data.bio && parsed.data.bio.length > 0 ? parsed.data.bio : null,
      timezone: parsed.data.timezone && parsed.data.timezone.length > 0 ? parsed.data.timezone : null,
    },
  });
  revalidatePath("/platform/profile");
  redirect(`/platform/profile?ok=profile_saved`);
}

const themeSchema = z.object({
  themePreference: z.enum(["AUTO", "LIGHT", "DARK"]),
});

export async function updateThemePreference(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = themeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/profile?error=${encodeURIComponent("Invalid theme")}`);
  }

  // Persist on the User row (cross-device durable) AND set the
  // `ts_theme` cookie so the existing theme boot script in the root
  // layout picks it up on the next render. Mapping:
  //   DB enum  →  cookie value
  //   AUTO     →  "system"
  //   LIGHT    →  "light"
  //   DARK     →  "dark"
  const cookieValue =
    parsed.data.themePreference === "AUTO"  ? "system"
    : parsed.data.themePreference === "LIGHT" ? "light"
    : "dark";

  await db.user.update({
    where: { id: ctx.userId },
    data:  { themePreference: parsed.data.themePreference },
  });

  const jar = await cookies();
  jar.set("ts_theme", cookieValue, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // one year
    httpOnly: false,            // the boot script reads it to avoid FOUC
    sameSite: "lax",
  });

  revalidatePath("/platform/profile");
  // Force every layout to re-render so the data-theme attribute reflects
  // the new value without an extra hard refresh.
  revalidatePath("/", "layout");
  redirect(`/platform/profile?ok=theme_saved`);
}

// ─────────────────────────────────────────────────────────────────────
// Phase 1 — Platform staff & role administration.
//
// Lives in /platform/staff. Three concerns:
//   1. Assign / change a staff user's durable role.
//   2. Invite a new staff user (creates a User row with a platformRole
//      and emails them a password-reset link — no magic-link yet).
//   3. Temporary role elevation: bounded-time bump for incident or
//      vacation cover. Bumping `sessionVersion` on grant/revoke so
//      the change is picked up on the next request without waiting
//      for the JWT to expire.
//
// Every mutation here logs a `platform.staff_*` audit row, so the audit
// page tells the full story of who changed what and when.
// ─────────────────────────────────────────────────────────────────────

const PLATFORM_ROLE_VALUES = [
  "SUPER_ADMIN", "SITE_MANAGER", "SUPPORT_AGENT",
  "ADMIN", "MANAGER", "SUPPORT_LEAD", "BILLING_MANAGER",
  "DEVELOPER", "MARKETING_MANAGER", "CONTENT_MANAGER",
  "ANALYST", "READ_ONLY_VIEWER",
] as const;

const assignRoleSchema = z.object({
  role: z.enum(PLATFORM_ROLE_VALUES),
});

export async function assignPlatformRole(userId: string, formData: FormData) {

  const ctx = await requirePlatformPermission("staff.assign_role");

  const parsed = assignRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/staff?error=${encodeURIComponent("Invalid role")}`);
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true, sessionVersion: true },
  });
  if (!target) redirect(`/platform/staff?error=${encodeURIComponent("User not found")}`);

  // Self-demotion guard: don't let an admin lock themselves out.
  if (target.id === ctx.userId && parsed.data.role !== ctx.baseRole) {
    redirect(`/platform/staff?error=${encodeURIComponent("Use another admin account to change your own role")}`);
  }

  // Last-super-admin guard: refuse to demote the only remaining
  // SUPER_ADMIN. Without this, a mis-click can lock everyone out.
  if (target.platformRole === "SUPER_ADMIN" && parsed.data.role !== "SUPER_ADMIN") {
    const otherSupers = await db.user.count({
      where: { platformRole: "SUPER_ADMIN", id: { not: target.id } },
    });
    if (otherSupers === 0) {
      redirect(`/platform/staff?error=${encodeURIComponent("Cannot demote the only Super Admin — promote another user first")}`);
    }
  }

  // No-op short circuit so we don't write a useless audit row.
  if (target.platformRole === parsed.data.role) {
    redirect(`/platform/staff?ok=role_unchanged`);
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      platformRole: parsed.data.role,
      // Bump session version so any open session must reauth. NextAuth
      // session callback compares this against the JWT copy.
      sessionVersion: { increment: 1 },
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.staff_role_assigned",
    entityType: "User",
    entityId: target.id,
    metadata: {
      targetEmail: target.email,
      from: target.platformRole,
      to: parsed.data.role,
    },
  });

  revalidatePath("/platform/staff");
  redirect(`/platform/staff?ok=role_assigned`);
}

const removeStaffSchema = z.object({
  confirm: z.string().min(1),
});

export async function removePlatformStaff(userId: string, formData: FormData) {

  const ctx = await requirePlatformPermission("staff.assign_role");

  const parsed = removeStaffSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || parsed.data.confirm.toLowerCase() !== "remove") {
    redirect(`/platform/staff?error=${encodeURIComponent("Type 'remove' to confirm")}`);
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true },
  });
  if (!target?.platformRole) {
    redirect(`/platform/staff?error=${encodeURIComponent("User is not staff")}`);
  }
  if (target.id === ctx.userId) {
    redirect(`/platform/staff?error=${encodeURIComponent("Cannot remove yourself")}`);
  }
  if (target.platformRole === "SUPER_ADMIN") {
    const otherSupers = await db.user.count({
      where: { platformRole: "SUPER_ADMIN", id: { not: target.id } },
    });
    if (otherSupers === 0) {
      redirect(`/platform/staff?error=${encodeURIComponent("Cannot remove the only Super Admin")}`);
    }
  }

  await db.$transaction([
    // Revoke any active elevations the user might be sitting on.
    db.platformRoleElevation.updateMany({
      where: { userId: target.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), revokedById: ctx.userId },
    }),
    db.user.update({
      where: { id: target.id },
      data: { platformRole: null, sessionVersion: { increment: 1 } },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.staff_removed",
    entityType: "User",
    entityId: target.id,
    metadata: { targetEmail: target.email, previousRole: target.platformRole },
  });

  revalidatePath("/platform/staff");
  redirect(`/platform/staff?ok=staff_removed`);
}

const inviteStaffSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(PLATFORM_ROLE_VALUES),
  name: z.string().trim().max(120).optional(),
});

export async function inviteStaff(formData: FormData) {

  const ctx = await requirePlatformPermission("staff.invite");

  const raw = Object.fromEntries(formData.entries());
  const parsed = inviteStaffSchema.safeParse({
    email: typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "",
    role: raw.role,
    name: typeof raw.name === "string" ? raw.name : undefined,
  });
  if (!parsed.success) {
    redirect(`/platform/staff?error=${encodeURIComponent("Invalid invite — check email + role")}`);
  }

  const existing = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, platformRole: true },
  });

  let targetId: string;
  let action: "platform.staff_invited" | "platform.staff_role_assigned";

  if (existing) {
    if (existing.platformRole === parsed.data.role) {
      redirect(`/platform/staff?ok=already_has_role`);
    }
    await db.user.update({
      where: { id: existing.id },
      data: { platformRole: parsed.data.role, sessionVersion: { increment: 1 } },
    });
    targetId = existing.id;
    action = "platform.staff_role_assigned";
  } else {
    const created = await db.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name?.trim() || null,
        platformRole: parsed.data.role,
        // No passwordHash — the invitee uses /reset-password to set one.
      },
      select: { id: true },
    });
    targetId = created.id;
    action = "platform.staff_invited";
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action,
    entityType: "User",
    entityId: targetId,
    metadata: { targetEmail: parsed.data.email, role: parsed.data.role, isNew: !existing },
  });

  revalidatePath("/platform/staff");
  redirect(`/platform/staff?ok=invited`);
}

// Bounded windows for temporary elevation. Anything longer should be a
// durable role change; anything shorter is busywork.
const ELEVATION_MIN_HOURS = 1;
const ELEVATION_MAX_HOURS = 30 * 24; // 30 days

const grantElevationSchema = z.object({
  elevatedTo: z.enum(PLATFORM_ROLE_VALUES),
  hours: z.coerce.number().int().min(ELEVATION_MIN_HOURS).max(ELEVATION_MAX_HOURS),
  reason: z.string().trim().min(8, "Give a reason (8+ chars)").max(500),
});

export async function grantPlatformElevation(userId: string, formData: FormData) {

  const ctx = await requirePlatformPermission("staff.elevate");

  const parsed = grantElevationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid elevation request";
    redirect(`/platform/staff?error=${encodeURIComponent(msg)}`);
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true },
  });
  if (!target?.platformRole) {
    redirect(`/platform/staff?error=${encodeURIComponent("User is not staff")}`);
  }
  if (target.id === ctx.userId) {
    redirect(`/platform/staff?error=${encodeURIComponent("Cannot elevate yourself")}`);
  }

  // Elevation must actually be more powerful than the baseline.

  if (rankPlatformRole(parsed.data.elevatedTo) >= rankPlatformRole(target.platformRole)) {
    redirect(`/platform/staff?error=${encodeURIComponent("Elevation must be a higher role than baseline")}`);
  }

  // SUPER_ADMIN elevation is reserved for SUPER_ADMINs themselves —
  // a SITE_MANAGER cannot mint root-of-trust access.
  if (parsed.data.elevatedTo === "SUPER_ADMIN" && ctx.role !== "SUPER_ADMIN") {
    redirect(`/platform/staff?error=${encodeURIComponent("Only Super Admins can elevate to Super Admin")}`);
  }

  const expiresAt = new Date(Date.now() + parsed.data.hours * 60 * 60 * 1000);

  await db.$transaction([
    db.platformRoleElevation.create({
      data: {
        userId: target.id,
        originalRole: target.platformRole,
        elevatedTo: parsed.data.elevatedTo,
        reason: parsed.data.reason,
        grantedById: ctx.userId,
        expiresAt,
      },
    }),
    // Bump session version so the elevation takes effect on the next
    // request, not after the JWT TTL.
    db.user.update({
      where: { id: target.id },
      data: { sessionVersion: { increment: 1 } },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.staff_elevation_granted",
    entityType: "User",
    entityId: target.id,
    metadata: {
      targetEmail: target.email,
      from: target.platformRole,
      to: parsed.data.elevatedTo,
      hours: parsed.data.hours,
      reason: parsed.data.reason,
      expiresAt: expiresAt.toISOString(),
    },
  });

  revalidatePath("/platform/staff");
  redirect(`/platform/staff?ok=elevation_granted`);
}

export async function revokePlatformElevation(elevationId: string) {

  const ctx = await requirePlatformPermission("staff.revoke_elevation");

  const row = await db.platformRoleElevation.findUnique({
    where: { id: elevationId },
    select: {
      id: true, userId: true, elevatedTo: true, revokedAt: true, expiresAt: true,
      user: { select: { email: true } },
    },
  });
  if (!row) redirect(`/platform/staff?error=${encodeURIComponent("Elevation not found")}`);
  if (row.revokedAt) redirect(`/platform/staff?ok=already_revoked`);

  await db.$transaction([
    db.platformRoleElevation.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), revokedById: ctx.userId },
    }),
    db.user.update({
      where: { id: row.userId },
      data: { sessionVersion: { increment: 1 } },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.staff_elevation_revoked",
    entityType: "User",
    entityId: row.userId,
    metadata: {
      elevationId: row.id,
      targetEmail: row.user.email,
      elevatedTo: row.elevatedTo,
    },
  });

  revalidatePath("/platform/staff");
  redirect(`/platform/staff?ok=elevation_revoked`);
}
