"use server";

// Page 62 — Feature Flags actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  PlatformFlagType,
  PlatformFlagEnv,
  PlatformFlagChangeKind,
} from "@prisma/client";

const ROUTE = "/platform/system/feature-flags";
const PERM_MANAGE = "feature_flag.write" as const;

const TYPES        = ["BOOLEAN", "MULTIVARIATE", "STRING", "NUMBER", "JSON_VALUE"] as const;
const ENVS         = ["PRODUCTION", "STAGING", "SANDBOX", "PREVIEW"] as const;

/* ── Helpers ───────────────────────────────────────────── */

async function recordChange(args: {
  flagId: string; kind: PlatformFlagChangeKind; actorEmail: string;
  summary: string; env?: PlatformFlagEnv;
  diffJson?: unknown;
}) {
  await db.platformFlagChange.create({
    data: {
      flagId: args.flagId,
      kind: args.kind,
      actorEmail: args.actorEmail,
      summary: args.summary,
      env: args.env,
      diffJson: args.diffJson as never,
    },
  });
}

/* ── Flags — create / update ───────────────────────────── */

const flagSchema = z.object({
  id:          z.string().optional(),
  key:         z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9_.-]*$/i, "Use letters, digits, ., -, _"),
  name:        z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  type:        z.enum(TYPES),
  ownerEmail:  z.string().email().optional().or(z.literal("")),
  tags:        z.string().max(500).optional(),
  defaultValue: z.string().max(500),
  prodRolloutPct:    z.coerce.number().int().min(0).max(100),
  stagingRolloutPct: z.coerce.number().int().min(0).max(100),
  sandboxRolloutPct: z.coerce.number().int().min(0).max(100),
  prodEnabled:    z.union([z.literal("on"), z.literal("")]).optional(),
  stagingEnabled: z.union([z.literal("on"), z.literal("")]).optional(),
  sandboxEnabled: z.union([z.literal("on"), z.literal("")]).optional(),
  notes:       z.string().max(2000).optional(),
});

export async function saveFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = flagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const tags = (d.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  const data = {
    name: d.name,
    description: d.description || null,
    type: d.type as PlatformFlagType,
    ownerEmail: d.ownerEmail ? d.ownerEmail : null,
    tags,
    defaultValue: d.defaultValue,
    prodRolloutPct:    d.prodRolloutPct,
    stagingRolloutPct: d.stagingRolloutPct,
    sandboxRolloutPct: d.sandboxRolloutPct,
    prodEnabled:    d.prodEnabled === "on",
    stagingEnabled: d.stagingEnabled === "on",
    sandboxEnabled: d.sandboxEnabled === "on",
    notes: d.notes || null,
  };
  const created = await db.platformFlag.findUnique({ where: { key: d.key } });
  const row = await db.platformFlag.upsert({
    where: { key: d.key },
    create: { key: d.key, ...data },
    update: data,
  });
  await recordChange({
    flagId: row.id,
    kind: created ? "UPDATED" : "CREATED",
    actorEmail: ctx.email ?? "platform",
    summary: created ? `Updated flag ${d.key}` : `Created flag ${d.key}`,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.saved",
    entityType: "PlatformFlag", entityId: row.id,
    metadata: { actor: ctx.email, key: d.key, created: !created },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${d.key}&ok=flag-saved`);
}

const idSchema = z.object({ id: z.string().min(1) });

export async function archiveFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.platformFlag.update({
    where: { id: parsed.data.id },
    data: { archived: true },
  });
  await recordChange({ flagId: row.id, kind: "ARCHIVED", actorEmail: ctx.email ?? "platform", summary: `Archived flag ${row.key}` });
  await logPlatformAudit({ userId: ctx.userId, action: "platform.flag.archived", entityType: "PlatformFlag", entityId: row.id, metadata: { actor: ctx.email, key: row.key } });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=archived`);
}

export async function unarchiveFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.platformFlag.update({
    where: { id: parsed.data.id },
    data: { archived: false },
  });
  await recordChange({ flagId: row.id, kind: "UPDATED", actorEmail: ctx.email ?? "platform", summary: `Restored flag ${row.key}` });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=restored`);
}

/* ── Rollout per env ───────────────────────────────────── */

const rolloutSchema = z.object({
  flagId: z.string().min(1),
  env: z.enum(ENVS),
  rolloutPct: z.coerce.number().int().min(0).max(100),
  enabled: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveRollout(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = rolloutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const enabled = d.enabled === "on";
  const data: Record<string, unknown> =
    d.env === "PRODUCTION" ? { prodEnabled: enabled, prodRolloutPct: d.rolloutPct }
    : d.env === "STAGING"  ? { stagingEnabled: enabled, stagingRolloutPct: d.rolloutPct }
    : d.env === "SANDBOX"  ? { sandboxEnabled: enabled, sandboxRolloutPct: d.rolloutPct }
    : {};
  const row = await db.platformFlag.update({
    where: { id: d.flagId },
    data,
  });
  await recordChange({
    flagId: row.id, kind: "ROLLOUT_CHANGED", actorEmail: ctx.email ?? "platform",
    summary: `${d.env} rollout → ${d.rolloutPct}% (${enabled ? "on" : "off"})`,
    env: d.env as PlatformFlagEnv,
    diffJson: { rolloutPct: d.rolloutPct, enabled },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.rollout_changed",
    entityType: "PlatformFlag", entityId: row.id,
    metadata: { actor: ctx.email, env: d.env, pct: d.rolloutPct, enabled },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${row.key}&ok=rollout-saved`);
}

/* ── Kill switch ───────────────────────────────────────── */

const killSchema = z.object({
  flagId: z.string().min(1),
  enable: z.enum(["on", "off"]),
  confirm: z.string().min(1),
  key: z.string().min(1),
});

export async function setKillSwitch(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = killSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  if (d.confirm !== `KILL-${d.key}`) {
    redirect(`${ROUTE}?key=${d.key}&error=${encodeURIComponent(`Type "KILL-${d.key}" to confirm`)}`);
  }
  const wantOn = d.enable === "on";
  const row = await db.platformFlag.update({
    where: { id: d.flagId },
    data: { killSwitchActive: wantOn },
  });
  await recordChange({
    flagId: row.id, kind: "KILL_SWITCH",
    actorEmail: ctx.email ?? "platform",
    summary: wantOn ? `Kill-switched ${row.key} (production OFF)` : `Restored ${row.key} from kill-switch`,
    env: "PRODUCTION",
    diffJson: { killSwitchActive: wantOn },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.kill_switch",
    entityType: "PlatformFlag", entityId: row.id,
    metadata: { actor: ctx.email, on: wantOn, key: row.key },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${row.key}&ok=${wantOn ? "killed" : "restored"}`);
}

/* ── Variants ──────────────────────────────────────────── */

const variantSchema = z.object({
  id:     z.string().optional(),
  flagId: z.string().min(1),
  key:    z.string().min(1).max(60),
  value:  z.string().max(500),
  weightPct:   z.coerce.number().int().min(0).max(100),
  description: z.string().max(300).optional(),
});

export async function saveVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = variantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const data = {
    flagId: d.flagId, key: d.key, value: d.value,
    weightPct: d.weightPct, description: d.description || null,
  };
  const existing = d.id ? await db.platformFlagVariant.findUnique({ where: { id: d.id } }) : null;
  if (existing) {
    await db.platformFlagVariant.update({ where: { id: d.id! }, data });
  } else {
    await db.platformFlagVariant.upsert({
      where: { flagId_key: { flagId: d.flagId, key: d.key } },
      create: data,
      update: data,
    });
  }
  const flag = await db.platformFlag.findUnique({ where: { id: d.flagId }, select: { key: true } });
  await recordChange({ flagId: d.flagId, kind: "VARIANT_CHANGED", actorEmail: ctx.email ?? "platform", summary: `Saved variant "${d.key}" (${d.weightPct}%)` });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${flag?.key ?? ""}&ok=variant-saved`);
}

const deleteVariantSchema = z.object({ id: z.string().min(1), flagKey: z.string().min(1) });

export async function deleteVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteVariantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.platformFlagVariant.delete({ where: { id: parsed.data.id } });
  await recordChange({ flagId: row.flagId, kind: "VARIANT_CHANGED", actorEmail: ctx.email ?? "platform", summary: `Deleted variant "${row.key}"` });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${parsed.data.flagKey}&ok=variant-deleted`);
}

/* ── Rules ─────────────────────────────────────────────── */

const ruleSchema = z.object({
  id:     z.string().optional(),
  flagId: z.string().min(1),
  env:    z.enum(ENVS),
  order:  z.coerce.number().int().min(0).max(100),
  description: z.string().max(300).optional(),
  returnValue: z.string().max(200),
  conditionsJson: z.string().max(2000), // JSON string from textarea
  active: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  let conditions: unknown = [];
  try { conditions = JSON.parse(d.conditionsJson || "[]"); }
  catch { redirect(`${ROUTE}?error=${encodeURIComponent("Invalid JSON in conditions")}`); }
  const data = {
    flagId: d.flagId,
    env: d.env as PlatformFlagEnv,
    order: d.order,
    description: d.description || null,
    returnValue: d.returnValue,
    conditionsJson: conditions as never,
    active: d.active === "on",
  };
  let savedId = d.id;
  if (d.id) {
    await db.platformFlagRule.update({ where: { id: d.id }, data });
  } else {
    const row = await db.platformFlagRule.create({ data });
    savedId = row.id;
  }
  const flag = await db.platformFlag.findUnique({ where: { id: d.flagId }, select: { key: true } });
  await recordChange({
    flagId: d.flagId,
    kind: d.id ? "UPDATED" : "RULE_ADDED",
    actorEmail: ctx.email ?? "platform",
    summary: d.id ? `Updated rule (order ${d.order}) in ${d.env}` : `Added rule (order ${d.order}) in ${d.env}`,
    env: d.env as PlatformFlagEnv,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.rule_saved",
    entityType: "PlatformFlagRule", entityId: savedId ?? "",
    metadata: { actor: ctx.email, flagKey: flag?.key, env: d.env },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${flag?.key ?? ""}&ok=rule-saved`);
}

const deleteRuleSchema = z.object({ id: z.string().min(1), flagKey: z.string().min(1) });

export async function deleteRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.platformFlagRule.delete({ where: { id: parsed.data.id } });
  await recordChange({
    flagId: row.flagId, kind: "RULE_REMOVED",
    actorEmail: ctx.email ?? "platform",
    summary: `Removed rule (${row.env})`,
    env: row.env,
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${parsed.data.flagKey}&ok=rule-deleted`);
}

/* ── Segments ──────────────────────────────────────────── */

const segmentSchema = z.object({
  id:          z.string().optional(),
  key:         z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  name:        z.string().min(1).max(160),
  description: z.string().max(300).optional(),
  tenantIds:   z.string().max(2000).optional(),
  userEmails:  z.string().max(2000).optional(),
});

export async function saveSegment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = segmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=segments&error=Invalid`);
  const d = parsed.data;
  const tenantIds = (d.tenantIds ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const userEmails = (d.userEmails ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const data = {
    name: d.name, description: d.description || null,
    tenantIds, userEmails,
  };
  await db.platformFlagSegment.upsert({
    where: { key: d.key },
    create: { key: d.key, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.segment_saved",
    entityType: "PlatformFlagSegment", entityId: d.key,
    metadata: { actor: ctx.email, key: d.key, members: tenantIds.length + userEmails.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=segments&ok=segment-saved`);
}

export async function deleteSegment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=segments&error=Invalid`);
  await db.platformFlagSegment.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.segment_deleted",
    entityType: "PlatformFlagSegment", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=segments&ok=segment-deleted`);
}

/* ── Schedule steps ────────────────────────────────────── */

const scheduleSchema = z.object({
  flagId: z.string().min(1),
  env: z.enum(ENVS),
  rolloutPct: z.coerce.number().int().min(0).max(100),
  scheduledAt: z.string().min(1),
  notes: z.string().max(300).optional(),
});

export async function saveScheduleStep(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const scheduledAt = new Date(d.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Invalid schedule date")}`);
  }
  const row = await db.platformFlagScheduleStep.create({
    data: {
      flagId: d.flagId, env: d.env as PlatformFlagEnv,
      rolloutPct: d.rolloutPct, scheduledAt, notes: d.notes || null,
    },
  });
  const flag = await db.platformFlag.findUnique({ where: { id: d.flagId }, select: { key: true } });
  await recordChange({
    flagId: d.flagId, kind: "SCHEDULED",
    actorEmail: ctx.email ?? "platform",
    summary: `Scheduled ${d.env} → ${d.rolloutPct}% for ${scheduledAt.toISOString().slice(0,16)}`,
    env: d.env as PlatformFlagEnv,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.scheduled",
    entityType: "PlatformFlagScheduleStep", entityId: row.id,
    metadata: { actor: ctx.email, env: d.env, pct: d.rolloutPct },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${flag?.key ?? ""}&ok=scheduled`);
}

const deleteScheduleSchema = z.object({ id: z.string().min(1), flagKey: z.string().min(1) });

export async function deleteScheduleStep(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteScheduleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.platformFlagScheduleStep.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.schedule_deleted",
    entityType: "PlatformFlagScheduleStep", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${parsed.data.flagKey}&ok=schedule-deleted`);
}

/* ── Dependencies ──────────────────────────────────────── */

const dependencySchema = z.object({
  flagId: z.string().min(1),
  dependsOnId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

export async function addDependency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = dependencySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  if (d.flagId === d.dependsOnId) redirect(`${ROUTE}?error=${encodeURIComponent("A flag cannot depend on itself")}`);
  try {
    await db.platformFlagDependency.create({
      data: { flagId: d.flagId, dependsOnId: d.dependsOnId, reason: d.reason || null },
    });
  } catch {
    redirect(`${ROUTE}?error=${encodeURIComponent("Dependency already exists")}`);
  }
  const flag = await db.platformFlag.findUnique({ where: { id: d.flagId }, select: { key: true } });
  await recordChange({
    flagId: d.flagId, kind: "DEPENDENCY_ADDED",
    actorEmail: ctx.email ?? "platform",
    summary: `Added dependency on ${d.dependsOnId}`,
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${flag?.key ?? ""}&ok=dependency-added`);
}

const deleteDependencySchema = z.object({ id: z.string().min(1), flagKey: z.string().min(1) });

export async function deleteDependency(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteDependencySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.platformFlagDependency.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.dependency_removed",
    entityType: "PlatformFlagDependency", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?key=${parsed.data.flagKey}&ok=dependency-removed`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  defaultEnv: z.enum(ENVS),
  propagationTargetSec: z.coerce.number().int().min(1).max(60),
  approvalRequiredForKill: z.union([z.literal("on"), z.literal("")]).optional(),
  autoArchiveStaleDays: z.coerce.number().int().min(0).max(3650),
  notes: z.string().max(2000).optional(),
});

export async function saveFlagSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=settings&error=Invalid`);
  const d = parsed.data;
  await db.platformFlagSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultEnv: d.defaultEnv as PlatformFlagEnv,
      propagationTargetSec: d.propagationTargetSec,
      approvalRequiredForKill: d.approvalRequiredForKill === "on",
      autoArchiveStaleDays: d.autoArchiveStaleDays,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      defaultEnv: d.defaultEnv as PlatformFlagEnv,
      propagationTargetSec: d.propagationTargetSec,
      approvalRequiredForKill: d.approvalRequiredForKill === "on",
      autoArchiveStaleDays: d.autoArchiveStaleDays,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.flag.settings_saved",
    entityType: "PlatformFlagSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
