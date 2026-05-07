"use server";

// Page 50 — Security Center actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  SecurityFindingStatus,
  SuspiciousActivityStatus,
  EncryptionState,
} from "@prisma/client";

const ROUTE = "/platform/security/center";
const PERM_MANAGE  = "security.manage" as const;
const PERM_RESOLVE = "security.findings.resolve" as const;

/* ── Resolve / dismiss finding ─────────────────────────── */

const resolveSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(["REMEDIATED", "ACCEPTED_RISK", "FALSE_POSITIVE", "WONT_FIX", "IN_PROGRESS"]),
  note:   z.string().max(500).optional(),
});

export async function resolveFinding(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const before = await db.securityFinding.findUnique({
    where: { id: d.id },
    select: { detectedAt: true, status: true },
  });
  if (!before) redirect(`${ROUTE}?error=Finding-not-found`);

  const now = new Date();
  const isRemediated = d.status === "REMEDIATED";
  const days = isRemediated && before
    ? Math.max(0, Math.round((now.getTime() - before.detectedAt.getTime()) / 86_400_000))
    : null;

  await db.securityFinding.update({
    where: { id: d.id },
    data: {
      status: d.status as SecurityFindingStatus,
      resolutionNote: d.note ?? null,
      resolvedById: ctx.userId,
      remediatedAt: isRemediated ? now : null,
      daysToRemediate: days,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.security.finding_resolved",
    entityType: "SecurityFinding",
    entityId: d.id,
    metadata: { actor: ctx.email, status: d.status, days },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=finding-updated`);
}

/* ── Assign finding to admin ───────────────────────────── */

const assignSchema = z.object({
  id:     z.string().min(1),
  userId: z.string().min(1).optional().or(z.literal("")),
});

export async function assignFinding(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Invalid input")}`);
  }
  const d = parsed.data;
  await db.securityFinding.update({
    where: { id: d.id },
    data: { assignedToId: d.userId && d.userId !== "" ? d.userId : null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.security.finding_assigned",
    entityType: "SecurityFinding",
    entityId: d.id,
    metadata: { actor: ctx.email, assignedTo: d.userId ?? null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=assigned`);
}

/* ── Update suspicious-activity status ────────────────── */

const susSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(["INVESTIGATING", "DISMISSED", "ACTION_TAKEN"]),
});

export async function updateSuspiciousActivity(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESOLVE);
  const parsed = susSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Invalid input")}`);
  }
  const d = parsed.data;
  await db.suspiciousActivity.update({
    where: { id: d.id },
    data: {
      status: d.status as SuspiciousActivityStatus,
      resolvedAt: d.status === "DISMISSED" || d.status === "ACTION_TAKEN" ? new Date() : null,
      resolvedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.security.suspicious_activity_updated",
    entityType: "SuspiciousActivity",
    entityId: d.id,
    metadata: { actor: ctx.email, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=activity-updated`);
}

/* ── Save Security Center settings ─────────────────────── */

const settingsSchema = z.object({
  failedLoginThreshold: z.coerce.number().int().min(1).max(100),
  failedLoginWindowMin: z.coerce.number().int().min(1).max(1440),
  bannerOnHighSeverity: z.union([z.literal("on"), z.literal("")]).optional(),
  realtimeFeedEnabled:  z.union([z.literal("on"), z.literal("")]).optional(),
  mttrTargetDays:       z.coerce.number().int().min(1).max(365),
  passwordMinLength:    z.coerce.number().int().min(6).max(64),
  passwordRequireMixed: z.union([z.literal("on"), z.literal("")]).optional(),
  passwordMaxAgeDays:   z.coerce.number().int().min(0).max(3650),
  passwordHistoryDepth: z.coerce.number().int().min(0).max(50),
  passwordBreachCheck:  z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveSecuritySettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.securityCenterSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      failedLoginThreshold: d.failedLoginThreshold,
      failedLoginWindowMin: d.failedLoginWindowMin,
      bannerOnHighSeverity: d.bannerOnHighSeverity === "on",
      realtimeFeedEnabled:  d.realtimeFeedEnabled === "on",
      mttrTargetDays:       d.mttrTargetDays,
      passwordMinLength:    d.passwordMinLength,
      passwordRequireMixed: d.passwordRequireMixed === "on",
      passwordMaxAgeDays:   d.passwordMaxAgeDays,
      passwordHistoryDepth: d.passwordHistoryDepth,
      passwordBreachCheck:  d.passwordBreachCheck === "on",
      updatedById:          ctx.userId,
    },
    update: {
      failedLoginThreshold: d.failedLoginThreshold,
      failedLoginWindowMin: d.failedLoginWindowMin,
      bannerOnHighSeverity: d.bannerOnHighSeverity === "on",
      realtimeFeedEnabled:  d.realtimeFeedEnabled === "on",
      mttrTargetDays:       d.mttrTargetDays,
      passwordMinLength:    d.passwordMinLength,
      passwordRequireMixed: d.passwordRequireMixed === "on",
      passwordMaxAgeDays:   d.passwordMaxAgeDays,
      passwordHistoryDepth: d.passwordHistoryDepth,
      passwordBreachCheck:  d.passwordBreachCheck === "on",
      updatedById:          ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.security.settings_updated",
    entityType: "SecurityCenterSettings",
    entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}

/* ── Recompute cached score ────────────────────────────── */

export async function recomputeSecurityScore() {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const { loadSecurityHeroAndKpis } = await import("@/server/platform/security-center");
  const { hero } = await loadSecurityHeroAndKpis();
  await db.securityCenterSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      cachedScore: hero.score,
      cachedGrade: hero.grade,
      scoreComputedAt: new Date(),
    },
    update: {
      cachedScore: hero.score,
      cachedGrade: hero.grade,
      scoreComputedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.security.score_recomputed",
    entityType: "SecurityCenterSettings",
    entityId: "default",
    metadata: { actor: ctx.email, score: hero.score, grade: hero.grade },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=score-recomputed`);
}

/* ── Update encryption status (manual override) ────────── */

const encryptionSchema = z.object({
  atRestState:    z.enum(["HEALTHY", "WARNING", "STALE", "FAILED"]),
  inTransitState: z.enum(["HEALTHY", "WARNING", "STALE", "FAILED"]),
  kmsState:       z.enum(["HEALTHY", "WARNING", "STALE", "FAILED"]),
  rotateNow:      z.union([z.literal("on"), z.literal("")]).optional(),
  notes:          z.string().max(500).optional(),
});

export async function updateEncryptionStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = encryptionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent("Invalid input")}`);
  }
  const d = parsed.data;
  const now = new Date();
  const rotated = d.rotateNow === "on";
  await db.encryptionStatus.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      atRestState:    d.atRestState as EncryptionState,
      inTransitState: d.inTransitState as EncryptionState,
      kmsState:       d.kmsState as EncryptionState,
      keyLastRotatedAt: rotated ? now : null,
      keyRotationDueIn: rotated ? 90 : null,
      notes:          d.notes ?? null,
    },
    update: {
      atRestState:    d.atRestState as EncryptionState,
      inTransitState: d.inTransitState as EncryptionState,
      kmsState:       d.kmsState as EncryptionState,
      keyLastRotatedAt: rotated ? now : undefined,
      keyRotationDueIn: rotated ? 90 : undefined,
      notes:          d.notes ?? null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.security.encryption_updated",
    entityType: "EncryptionStatus",
    entityId: "default",
    metadata: { actor: ctx.email, rotated },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=encryption-updated`);
}
