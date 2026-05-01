"use server";

// Impersonation admin server actions — Page 8 of the admin spec.
//
// Permissions:
//   • End any session (force-end): tenant.impersonate (Admin).
//   • Add note to ongoing session: must be the impersonator
//     themselves (we check ctx.userId).
//   • Update settings: system.write_settings (Super Admin only).
//   • Approve a pending session: must be in approverIds.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";

/* ── Force-end any active session ────────────────────────── */

const endSchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function forceEndImpersonationSession(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.impersonate")) {
    return { ok: false, error: "Your role can't end impersonation sessions" } as const;
  }
  const parsed = endSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const session = await db.impersonationSession.findUnique({
    where: { id: parsed.data.sessionId },
    select: { id: true, endedAt: true, platformUserId: true, tenantId: true },
  });
  if (!session) return { ok: false, error: "Session not found" } as const;
  if (session.endedAt) return { ok: false, error: "Session already ended" } as const;

  // Default to "completed" if the impersonator ended their own
  // session; otherwise treat as a force-end.
  const endedReason = session.platformUserId === ctx.userId ? "COMPLETED" : "FORCE_ENDED";
  await db.impersonationSession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(),
      endedReason,
      endedById: ctx.userId,
      notes: parsed.data.reason
        ? `[ended by ${ctx.email}] ${parsed.data.reason}`
        : undefined,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: session.tenantId,
    action: endedReason === "FORCE_ENDED"
      ? "platform.impersonation_force_ended"
      : "platform.impersonation_ended",
    entityType: "ImpersonationSession",
    entityId: session.id,
    metadata: { actor: ctx.email, reason: parsed.data.reason ?? null },
  });
  revalidatePath("/platform/tenants/impersonation");
  return { ok: true } as const;
}

/* ── Add a note to a session ─────────────────────────────── */

const noteSchema = z.object({
  sessionId: z.string().min(1),
  note: z.string().min(1).max(2_000),
});

export async function addImpersonationNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = noteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const session = await db.impersonationSession.findUnique({
    where: { id: parsed.data.sessionId },
    select: { id: true, platformUserId: true, notes: true, tenantId: true },
  });
  if (!session) return { ok: false, error: "Session not found" } as const;

  // Notes are scoped to the session's owner OR an admin with
  // tenant.impersonate (so a compliance reviewer can annotate).
  if (session.platformUserId !== ctx.userId && !ctx.can("tenant.impersonate")) {
    return { ok: false, error: "Forbidden" } as const;
  }

  const stamp = `[${new Date().toISOString()} · ${ctx.email}]`;
  const appended = session.notes
    ? `${session.notes}\n\n${stamp} ${parsed.data.note}`
    : `${stamp} ${parsed.data.note}`;

  await db.impersonationSession.update({
    where: { id: session.id },
    data: { notes: appended },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: session.tenantId,
    action: "platform.impersonation_note_added",
    entityType: "ImpersonationSession",
    entityId: session.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/impersonation");
  return { ok: true } as const;
}

/* ── Update compliance settings ──────────────────────────── */

const settingsSchema = z.object({
  maxDurationMin: z.coerce.number().int().min(5).max(480),
  idleTimeoutMin: z.coerce.number().int().min(1).max(120),
  reasonRequired: z.union([z.literal("on"), z.literal("off")]).optional(),
  approvalRequired: z.union([z.literal("on"), z.literal("off")]).optional(),
  /** CSV of user ids. */
  approverIds: z.string().optional(),
  bannerCopy: z.string().max(500).optional(),
  recordingRetentionDays: z.coerce.number().int().min(1).max(3_650),
  auditOnlyMode: z.union([z.literal("on"), z.literal("off")]).optional(),
  /** CSV of action keys. */
  disabledActions: z.string().optional(),
});

export async function updateImpersonationSettings(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't edit impersonation settings" } as const;
  }
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const approverIds = (parsed.data.approverIds ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const disabledActions = (parsed.data.disabledActions ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  await db.impersonationSettings.upsert({
    where: { id: "default" },
    update: {
      maxDurationMin: parsed.data.maxDurationMin,
      idleTimeoutMin: parsed.data.idleTimeoutMin,
      reasonRequired: parsed.data.reasonRequired === "on",
      approvalRequired: parsed.data.approvalRequired === "on",
      approverIds,
      bannerCopy: parsed.data.bannerCopy?.trim() || null,
      recordingRetentionDays: parsed.data.recordingRetentionDays,
      auditOnlyMode: parsed.data.auditOnlyMode === "on",
      disabledActions,
      updatedBy: ctx.userId,
    },
    create: {
      id: "default",
      maxDurationMin: parsed.data.maxDurationMin,
      idleTimeoutMin: parsed.data.idleTimeoutMin,
      reasonRequired: parsed.data.reasonRequired === "on",
      approvalRequired: parsed.data.approvalRequired === "on",
      approverIds,
      bannerCopy: parsed.data.bannerCopy?.trim() || null,
      recordingRetentionDays: parsed.data.recordingRetentionDays,
      auditOnlyMode: parsed.data.auditOnlyMode === "on",
      disabledActions,
      updatedBy: ctx.userId,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.impersonation_settings_updated",
    entityType: "ImpersonationSettings",
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/impersonation");
  return { ok: true } as const;
}
