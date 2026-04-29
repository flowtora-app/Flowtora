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
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requirePlatformAdmin, requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
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

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: ctx.userId,
      archiveReason: reason,
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
