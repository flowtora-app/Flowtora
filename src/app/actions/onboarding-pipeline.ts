"use server";

// Onboarding pipeline server actions — Page 5 of the admin spec.
//
// Every button on /platform/tenants/onboarding goes through one of
// the actions in this file. Single nudge / batch enrol /
// mark-stuck / override-stage / update-funnel-config / send-nudge-
// campaign each have their own gate + audit event so we can drop
// nothing on the floor.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  STAGES,
  loadFunnelSettings,
  type StageId,
} from "@/server/platform/onboarding-pipeline";

const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];

/* ── Send a single nudge to one tenant's owner ─────────────── */

const singleNudgeSchema = z.object({
  tenantId: z.string().min(1),
});

export async function sendOnboardingNudge(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't send nudges" } as const;
  const parsed = singleNudgeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const tenant = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: {
      id: true, name: true,
      memberships: { where: { role: "OWNER" }, select: { user: { select: { email: true, name: true } } }, take: 1 },
    },
  });
  if (!tenant) return { ok: false, error: "Tenant not found" } as const;
  const owner = tenant.memberships[0]?.user;
  if (!owner?.email) return { ok: false, error: "No OWNER email on file" } as const;

  const settings = await loadFunnelSettings();
  await sendEmail({
    to: owner.email,
    subject: settings.nudgeSubject,
    text: settings.nudgeBody,
    html: `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;">${escapeHtml(settings.nudgeBody)}</pre>`,
  });
  await db.tenant.update({
    where: { id: tenant.id },
    data: { lastOnboardingNudgeAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: tenant.id,
    action: "platform.onboarding_nudge_sent",
    entityType: "Tenant",
    entityId: tenant.id,
    metadata: { actor: ctx.email, recipient: owner.email },
  });
  revalidatePath("/platform/tenants/onboarding");
  return { ok: true } as const;
}

/* ── Enrol many tenants in the nudge drip ─────────────────── */

const enrolSchema = z.object({
  tenantIds: z.string().min(1), // CSV
});

export async function enrolInNudgeSequence(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't enrol tenants" } as const;
  const parsed = enrolSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.tenantIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  const updated = await db.tenant.updateMany({
    where: { id: { in: ids } },
    data: { onboardingNudgeEnrolledAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.onboarding_nudge_enrolled",
    entityType: "Tenant",
    metadata: { actor: ctx.email, ids, count: updated.count },
  });
  revalidatePath("/platform/tenants/onboarding");
  return { ok: true, count: updated.count } as const;
}

/* ── Toggle "Mark stuck" ───────────────────────────────────── */

const stuckSchema = z.object({
  tenantId: z.string().min(1),
  stuck:    z.union([z.literal("on"), z.literal("off")]),
});

export async function markTenantStuck(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't mark tenants" } as const;
  const parsed = stuckSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const stamp = parsed.data.stuck === "on" ? new Date() : null;
  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { onboardingMarkedStuckAt: stamp },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: stamp ? "platform.onboarding_marked_stuck" : "platform.onboarding_unmarked_stuck",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/onboarding");
  return { ok: true } as const;
}

/* ── Override stage ────────────────────────────────────────── */

const overrideSchema = z.object({
  tenantId: z.string().min(1),
  /** The empty string means "clear override and go back to computed stage". */
  stage:    z.string().max(40),
});

export async function overrideTenantStage(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't override stage" } as const;
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const next = parsed.data.stage === "" ? null : parsed.data.stage;
  if (next != null && !(STAGE_IDS as string[]).includes(next)) {
    return { ok: false, error: "Unknown stage id" } as const;
  }
  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { onboardingStageOverride: next },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: next ? "platform.onboarding_stage_overridden" : "platform.onboarding_stage_override_cleared",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, stage: next ?? null },
  });
  revalidatePath("/platform/tenants/onboarding");
  return { ok: true } as const;
}

/* ── Update funnel config (WIP limits + thresholds + nudge copy) ─ */

const configSchema = z.object({
  stuckThresholdDays:   z.coerce.number().int().min(1).max(365).optional(),
  stuckCriticalDays:    z.coerce.number().int().min(1).max(365).optional(),
  nudgeCadenceDays:     z.coerce.number().int().min(1).max(60).optional(),
  nudgeSubject:         z.string().max(200).optional(),
  nudgeBody:            z.string().max(8_000).optional(),
  /** JSON string: { [stageId]: number | null } */
  wipLimitsJson:        z.string().max(2_000).optional(),
});

export async function updateFunnelConfig(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) return { ok: false, error: "Your role can't edit the funnel" } as const;
  const parsed = configSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;

  let wipLimits: Record<string, number | null> | undefined;
  if (parsed.data.wipLimitsJson) {
    try {
      wipLimits = JSON.parse(parsed.data.wipLimitsJson);
    } catch {
      return { ok: false, error: "WIP limits must be valid JSON" } as const;
    }
  }

  await db.onboardingFunnelSettings.upsert({
    where: { id: "default" },
    update: {
      stuckThresholdDays: parsed.data.stuckThresholdDays,
      stuckCriticalDays:  parsed.data.stuckCriticalDays,
      nudgeCadenceDays:   parsed.data.nudgeCadenceDays,
      nudgeSubject:       parsed.data.nudgeSubject,
      nudgeBody:          parsed.data.nudgeBody,
      wipLimits:          wipLimits === undefined ? undefined : (wipLimits as never),
      updatedBy:          ctx.userId,
    },
    create: {
      id: "default",
      stuckThresholdDays: parsed.data.stuckThresholdDays ?? 7,
      stuckCriticalDays:  parsed.data.stuckCriticalDays ?? 14,
      nudgeCadenceDays:   parsed.data.nudgeCadenceDays ?? 3,
      nudgeSubject:       parsed.data.nudgeSubject ?? null,
      nudgeBody:          parsed.data.nudgeBody ?? null,
      wipLimits:          wipLimits === undefined ? undefined : (wipLimits as never),
      updatedBy:          ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.onboarding_funnel_settings_updated",
    entityType: "OnboardingFunnelSettings",
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/onboarding");
  return { ok: true } as const;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
