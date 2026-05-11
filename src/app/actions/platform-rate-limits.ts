"use server";

// Page 61 — Rate Limits & Quotas actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  RateLimitAlgorithm,
  RateLimitScope,
  RateLimitAction,
  AbuseAlertSeverity,
  AbuseAlertStatus,
  Plan,
} from "@prisma/client";

const ROUTE = "/platform/system/rate-limits";
const PERM_MANAGE = "ratelimits.manage" as const;

const ALGORITHMS = ["TOKEN_BUCKET", "SLIDING_WINDOW", "FIXED_WINDOW", "LEAKY_BUCKET"] as const;
const SCOPES = ["PER_KEY", "PER_IP", "PER_TENANT", "PER_USER", "GLOBAL"] as const;
const ACTIONS = ["THROTTLE", "CHALLENGE", "BLOCK", "LOG_ONLY"] as const;
const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;
const ABUSE_STATUSES = ["OPEN", "ACKNOWLEDGED", "ACTION_TAKEN", "DISMISSED"] as const;

/* ── Rules ─────────────────────────────────────────────── */

const ruleSchema = z.object({
  id:          z.string().optional(),
  endpoint:    z.string().min(1).max(200),
  name:        z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  rps:         z.coerce.number().int().min(0).max(1_000_000),
  burst:       z.coerce.number().int().min(0).max(1_000_000),
  dailyCap:    z.coerce.number().int().min(0).max(1_000_000_000),
  scope:       z.enum(SCOPES),
  algorithm:   z.enum(ALGORITHMS),
  action:      z.enum(ACTIONS),
  active:      z.union([z.literal("on"), z.literal("")]).optional(),
  notes:       z.string().max(500).optional(),
});

export async function saveRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=rules&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    description: d.description || null,
    rps: d.rps,
    burst: d.burst,
    dailyCap: d.dailyCap,
    scope: d.scope as RateLimitScope,
    algorithm: d.algorithm as RateLimitAlgorithm,
    action: d.action as RateLimitAction,
    active: d.active === "on",
    notes: d.notes || null,
  };
  await db.rateLimitRule.upsert({
    where: { endpoint: d.endpoint },
    create: { endpoint: d.endpoint, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.rule_saved",
    entityType: "RateLimitRule", entityId: d.endpoint,
    metadata: { actor: ctx.email, endpoint: d.endpoint, rps: d.rps, action: d.action },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=rules&ok=rule-saved`);
}

const deleteRuleSchema = z.object({ id: z.string().min(1) });

export async function deleteRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=rules&error=Invalid`);
  await db.rateLimitRule.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.rule_deleted",
    entityType: "RateLimitRule", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=rules&ok=rule-deleted`);
}

/* ── Plan quotas ───────────────────────────────────────── */

const planQuotaSchema = z.object({
  plan:             z.enum(PLANS),
  apiCallsPerMonth: z.coerce.number().int().min(0),
  storageBytes:     z.coerce.number().min(0),
  users:            z.coerce.number().int().min(0),
  webhooksPerMonth: z.coerce.number().int().min(0),
  overageRateCents: z.coerce.number().int().min(0),
  softCap:          z.union([z.literal("on"), z.literal("")]).optional(),
  hardCap:          z.union([z.literal("on"), z.literal("")]).optional(),
  notes:            z.string().max(500).optional(),
});

export async function savePlanQuota(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = planQuotaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=quotas&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    apiCallsPerMonth: d.apiCallsPerMonth,
    storageBytes: BigInt(d.storageBytes),
    users: d.users,
    webhooksPerMonth: d.webhooksPerMonth,
    overageRateCents: d.overageRateCents,
    softCap: d.softCap === "on",
    hardCap: d.hardCap === "on",
    notes: d.notes || null,
  };
  await db.planQuota.upsert({
    where: { plan: d.plan as Plan },
    create: { plan: d.plan as Plan, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.plan_quota_saved",
    entityType: "PlanQuota", entityId: d.plan,
    metadata: { actor: ctx.email, plan: d.plan },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=quotas&ok=quota-saved`);
}

/* ── Tenant overrides ──────────────────────────────────── */

const overrideSchema = z.object({
  id:             z.string().optional(),
  tenantId:       z.string().min(1),
  ruleId:         z.string().optional().or(z.literal("")),
  endpoint:       z.string().max(200).optional(),
  rps:            z.coerce.number().int().min(0).optional(),
  burst:          z.coerce.number().int().min(0).optional(),
  dailyCap:       z.coerce.number().int().min(0).optional(),
  action:         z.enum(ACTIONS).optional(),
  reason:         z.string().min(1).max(500),
  expiresAt:      z.string().optional(),
  grantedByEmail: z.string().email().optional().or(z.literal("")),
  active:         z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveOverride(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=overrides&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    tenantId: d.tenantId,
    ruleId: d.ruleId || null,
    endpoint: d.endpoint || null,
    rps: d.rps,
    burst: d.burst,
    dailyCap: d.dailyCap,
    action: d.action as RateLimitAction | undefined,
    reason: d.reason,
    expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    grantedByEmail: d.grantedByEmail || ctx.email,
    active: d.active === "on",
  };
  if (d.id) {
    await db.tenantRateLimitOverride.update({ where: { id: d.id }, data });
  } else {
    await db.tenantRateLimitOverride.create({ data });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.override_saved",
    entityType: "TenantRateLimitOverride", entityId: d.id ?? "(new)",
    metadata: { actor: ctx.email, tenantId: d.tenantId, reason: d.reason },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=overrides&ok=override-saved`);
}

const deleteOverrideSchema = z.object({ id: z.string().min(1) });

export async function deleteOverride(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteOverrideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=overrides&error=Invalid`);
  await db.tenantRateLimitOverride.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.override_deleted",
    entityType: "TenantRateLimitOverride", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=overrides&ok=override-deleted`);
}

/* ── Top consumers — notify ────────────────────────────── */

const notifySchema = z.object({ id: z.string().min(1) });

export async function notifyConsumer(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = notifySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=consumers&error=Invalid`);
  await db.rateLimitConsumer.update({
    where: { id: parsed.data.id },
    data: { notified: true },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.consumer_notified",
    entityType: "RateLimitConsumer", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=consumers&ok=consumer-notified`);
}

/* ── Abuse alerts ──────────────────────────────────────── */

const alertStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(ABUSE_STATUSES),
});

export async function setAlertStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = alertStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=alerts&error=Invalid`);
  const d = parsed.data;
  await db.abuseAlert.update({
    where: { id: d.id },
    data: {
      status: d.status as AbuseAlertStatus,
      acknowledgedAt: d.status === "ACKNOWLEDGED" || d.status === "ACTION_TAKEN" ? new Date() : null,
      resolvedAt: d.status === "DISMISSED" || d.status === "ACTION_TAKEN" ? new Date() : null,
      resolvedById: d.status === "DISMISSED" || d.status === "ACTION_TAKEN" ? ctx.userId : null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.abuse_status_set",
    entityType: "AbuseAlert", entityId: d.id,
    metadata: { actor: ctx.email, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=alerts&ok=alert-${d.status.toLowerCase()}`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  defaultRps:       z.coerce.number().int().min(0).max(1_000_000),
  defaultBurst:     z.coerce.number().int().min(0).max(1_000_000),
  spikeMultiplier:  z.coerce.number().int().min(2).max(1000),
  notifyOnHighUsage: z.union([z.literal("on"), z.literal("")]).optional(),
  consumerRefreshH:  z.coerce.number().int().min(1).max(168),
  notes:             z.string().max(500).optional(),
});

export async function saveRateLimitSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.rateLimitSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRps: d.defaultRps,
      defaultBurst: d.defaultBurst,
      spikeMultiplier: d.spikeMultiplier,
      notifyOnHighUsage: d.notifyOnHighUsage === "on",
      consumerRefreshH: d.consumerRefreshH,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      defaultRps: d.defaultRps,
      defaultBurst: d.defaultBurst,
      spikeMultiplier: d.spikeMultiplier,
      notifyOnHighUsage: d.notifyOnHighUsage === "on",
      consumerRefreshH: d.consumerRefreshH,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.ratelimits.settings_saved",
    entityType: "RateLimitSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
