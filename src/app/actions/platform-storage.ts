"use server";

// Page 59 — Storage & CDN actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  StorageBucketProvider,
  StorageEncryptionMode,
  StoragePublicAccess,
  StorageLifecycleAction,
} from "@prisma/client";

const ROUTE = "/platform/system/storage";
const PERM_MANAGE = "storage.manage" as const;

const PROVIDERS = ["AWS_S3", "CLOUDFLARE_R2", "GCS", "AZURE_BLOB", "BACKBLAZE_B2", "OTHER"] as const;
const ENCRYPTIONS = ["NONE", "SSE_S3", "SSE_KMS", "SSE_CMK", "CSE"] as const;
const PUBLIC_ACCESS = ["PRIVATE", "TENANT_GATED", "PUBLIC_READ", "PUBLIC_READ_WRITE"] as const;
const LIFECYCLE_ACTIONS = ["ARCHIVE", "DELETE", "TRANSITION_IA", "TRANSITION_GLACIER", "TRANSITION_DEEP_ARCHIVE", "EXPIRE_VERSIONS"] as const;

/* ── Bucket CRUD ───────────────────────────────────────── */

const bucketSchema = z.object({
  id:           z.string().optional(),
  name:         z.string().min(1).max(120),
  provider:     z.enum(PROVIDERS),
  region:       z.string().min(1).max(60),
  encryption:   z.enum(ENCRYPTIONS),
  versioning:   z.union([z.literal("on"), z.literal("")]).optional(),
  publicAccess: z.enum(PUBLIC_ACCESS),
  monthlyCostCents: z.coerce.number().int().min(0),
  lifecyclePolicyId: z.string().optional().or(z.literal("")),
  tag:          z.string().max(40).optional(),
  notes:        z.string().max(500).optional(),
});

export async function saveBucket(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = bucketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=buckets&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    provider: d.provider as StorageBucketProvider,
    region: d.region,
    encryption: d.encryption as StorageEncryptionMode,
    versioning: d.versioning === "on",
    publicAccess: d.publicAccess as StoragePublicAccess,
    monthlyCostCents: d.monthlyCostCents,
    lifecyclePolicyId: d.lifecyclePolicyId || null,
    tag: d.tag || null,
    notes: d.notes || null,
    lastRefreshedAt: new Date(),
  };
  await db.storageBucketEntry.upsert({
    where: { name: d.name },
    create: { name: d.name, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.bucket_saved",
    entityType: "StorageBucketEntry", entityId: d.name,
    metadata: { actor: ctx.email, provider: d.provider, region: d.region },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=buckets&ok=bucket-saved`);
}

const deleteBucketSchema = z.object({ id: z.string().min(1) });

export async function deleteBucketEntry(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteBucketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=buckets&error=Invalid`);
  await db.storageBucketEntry.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.bucket_deleted",
    entityType: "StorageBucketEntry", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=buckets&ok=bucket-deleted`);
}

/* ── Lifecycle policies ────────────────────────────────── */

const policySchema = z.object({
  id:                     z.string().optional(),
  name:                   z.string().min(1).max(120),
  description:            z.string().max(500).optional(),
  scope:                  z.string().max(80).optional(),
  action:                 z.enum(LIFECYCLE_ACTIONS),
  thresholdDays:          z.coerce.number().int().min(1).max(99999),
  secondaryThresholdDays: z.coerce.number().int().min(0).max(99999).optional(),
  active:                 z.union([z.literal("on"), z.literal("")]).optional(),
  notes:                  z.string().max(500).optional(),
});

export async function saveLifecyclePolicy(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = policySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=lifecycle&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    description: d.description || null,
    scope: d.scope || null,
    action: d.action as StorageLifecycleAction,
    thresholdDays: d.thresholdDays,
    secondaryThresholdDays: d.secondaryThresholdDays ?? null,
    active: d.active === "on",
    notes: d.notes || null,
  };
  await db.storageLifecyclePolicy.upsert({
    where: { name: d.name },
    create: { name: d.name, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.lifecycle_saved",
    entityType: "StorageLifecyclePolicy", entityId: d.name,
    metadata: { actor: ctx.email, action: d.action },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=lifecycle&ok=lifecycle-saved`);
}

/* ── CDN purge ─────────────────────────────────────────── */

const purgeSchema = z.object({
  pattern: z.string().min(1).max(500),
});

export async function purgeCdn(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = purgeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=cdn&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  // Synthesize purge — we don't own a real CDN, just record the action.
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.cdn_purged",
    entityType: "Cdn", entityId: parsed.data.pattern,
    metadata: { actor: ctx.email, pattern: parsed.data.pattern },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=cdn&ok=cdn-purge-queued`);
}

/* ── Tenant flags ──────────────────────────────────────── */

const tenantAnomalySchema = z.object({
  id:    z.string().min(1),
  clear: z.union([z.literal("1"), z.literal("0")]),
});

export async function clearAnomalyFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = tenantAnomalySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=tenants&error=Invalid`);
  await db.tenantStorageUsage.update({
    where: { id: parsed.data.id },
    data: {
      anomalyFlag: parsed.data.clear === "1" ? false : true,
      anomalyReason: parsed.data.clear === "1" ? null : "Re-flagged by SRE",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.anomaly_flag_set",
    entityType: "TenantStorageUsage", entityId: parsed.data.id,
    metadata: { actor: ctx.email, cleared: parsed.data.clear === "1" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenants&ok=anomaly-${parsed.data.clear === "1" ? "cleared" : "flagged"}`);
}

const hotlinkSchema = z.object({
  id:        z.string().min(1),
  suspected: z.union([z.literal("1"), z.literal("0")]),
  domain:    z.string().max(160).optional(),
});

export async function setHotlinkFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = hotlinkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=egress&error=Invalid`);
  const suspected = parsed.data.suspected === "1";
  await db.egressTenantUsage.update({
    where: { id: parsed.data.id },
    data: {
      suspectedHotlink: suspected,
      hotlinkSourceDomain: suspected ? parsed.data.domain || null : null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.hotlink_flag_set",
    entityType: "EgressTenantUsage", entityId: parsed.data.id,
    metadata: { actor: ctx.email, suspected },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=egress&ok=hotlink-${suspected ? "flagged" : "cleared"}`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  monthlyBudgetCents:    z.coerce.number().int().min(0),
  hitRateTargetPct:      z.coerce.number().int().min(0).max(100),
  defaultLifecyclePolicyId: z.string().optional().or(z.literal("")),
  notes:                 z.string().max(500).optional(),
});

export async function saveStorageSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.storageSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      monthlyBudgetCents: d.monthlyBudgetCents,
      hitRateTargetPct: d.hitRateTargetPct,
      defaultLifecyclePolicyId: d.defaultLifecyclePolicyId || null,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      monthlyBudgetCents: d.monthlyBudgetCents,
      hitRateTargetPct: d.hitRateTargetPct,
      defaultLifecyclePolicyId: d.defaultLifecyclePolicyId || null,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.storage.settings_saved",
    entityType: "StorageSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
