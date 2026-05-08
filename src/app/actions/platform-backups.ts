"use server";

// Page 53 — Backups & Restore actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  BackupSource,
  BackupCadence,
  BackupKind,
  BackupJobStatus,
  StorageRegion,
  BackupEncryptionAlgorithm,
  RestoreTestResult,
  TenantRestoreStatus,
  StorageHealth,
} from "@prisma/client";

const ROUTE = "/platform/security/backups";
const PERM_READ    = "backups.read" as const;
const PERM_MANAGE  = "backups.manage" as const;
const PERM_RESTORE = "backups.restore" as const;

const SOURCES = [
  "POSTGRES", "S3_PROOFS", "S3_EXPORTS", "REDIS",
  "ELASTICSEARCH", "CONFIG", "KMS_KEYS",
] as const;
const CADENCES = ["CONTINUOUS", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "ON_DEMAND"] as const;
const KINDS = ["CONTINUOUS_WAL", "SNAPSHOT", "FULL", "INCREMENTAL", "ARCHIVE"] as const;
const STATUSES = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "PARTIAL", "EXPIRED"] as const;
const REGIONS = ["US_EAST_1", "US_WEST_2", "EU_WEST_1", "AP_SOUTHEAST_1", "GLOBAL"] as const;
const ENCRYPTIONS = ["AES_256_GCM", "AES_256_CBC", "RSA_4096"] as const;
const HEALTH = ["HEALTHY", "DEGRADED", "AT_RISK", "OFFLINE"] as const;
const RESTORE_STATUSES = [
  "DRAFT", "SHADOW_RUN", "REVIEWING", "APPLIED", "DISCARDED", "FAILED",
] as const;

/* ── Schedules ─────────────────────────────────────────── */

const scheduleSchema = z.object({
  id:           z.string().optional(),
  name:         z.string().min(1).max(120),
  source:       z.enum(SOURCES),
  kind:         z.enum(KINDS),
  cadence:      z.enum(CADENCES),
  cronExpr:     z.string().max(80).optional(),
  retentionDays: z.coerce.number().int().min(1).max(99999),
  encryption:   z.enum(ENCRYPTIONS),
  region:       z.enum(REGIONS),
  active:       z.union([z.literal("on"), z.literal("")]).optional(),
  notes:        z.string().max(500).optional(),
});

export async function saveSchedule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=schedules&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    source: d.source as BackupSource,
    kind: d.kind as BackupKind,
    cadence: d.cadence as BackupCadence,
    cronExpr: d.cronExpr || null,
    retentionDays: d.retentionDays,
    encryption: d.encryption as BackupEncryptionAlgorithm,
    region: d.region as StorageRegion,
    active: d.active === "on",
    notes: d.notes || null,
  };
  const saved = d.id
    ? await db.backupSchedule.update({ where: { id: d.id }, data })
    : await db.backupSchedule.create({ data });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.schedule_saved",
    entityType: "BackupSchedule", entityId: saved.id,
    metadata: { actor: ctx.email, source: d.source, cadence: d.cadence },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=schedules&ok=schedule-saved`);
}

const deleteScheduleSchema = z.object({ id: z.string().min(1) });

export async function deleteSchedule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteScheduleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=schedules&error=Invalid`);
  await db.backupSchedule.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.schedule_deleted",
    entityType: "BackupSchedule", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=schedules&ok=schedule-deleted`);
}

/* ── Run-now ───────────────────────────────────────────── */

const runNowSchema = z.object({ id: z.string().min(1) });

export async function runScheduleNow(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = runNowSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=schedules&error=Invalid`);
  const sched = await db.backupSchedule.findUnique({ where: { id: parsed.data.id } });
  if (!sched) redirect(`${ROUTE}?tab=schedules&error=Not-found`);
  // Synthesize a successful job entry — in production this would
  // enqueue a real backup worker.
  const sizeBytes = BigInt(Math.floor(Math.random() * 5_000_000_000) + 100_000_000);
  const durationSec = Math.floor(Math.random() * 600) + 30;
  const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const job = await db.backupJob.create({
    data: {
      scheduleId: sched!.id,
      source: sched!.source,
      kind: sched!.kind,
      status: "SUCCESS",
      region: sched!.region,
      encryption: sched!.encryption,
      startedAt: new Date(Date.now() - durationSec * 1000),
      completedAt: new Date(),
      durationSec,
      sizeBytes,
      manifestHash: hash,
      manifestUrl: `https://backups.flowtora.example/manifests/${hash}.json`,
      logsUrl: `https://backups.flowtora.example/logs/${hash}.txt`,
      verified: true,
      verifiedAt: new Date(),
    },
  });
  await db.backupSchedule.update({
    where: { id: sched!.id },
    data: { lastRunAt: new Date(), lastJobId: job.id },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.schedule_run_now",
    entityType: "BackupSchedule", entityId: sched!.id,
    metadata: { actor: ctx.email, jobId: job.id, source: sched!.source },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=schedules&ok=run-queued`);
}

/* ── Retry job ─────────────────────────────────────────── */

const retryJobSchema = z.object({ id: z.string().min(1) });

export async function retryJob(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = retryJobSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=jobs&error=Invalid`);
  const job = await db.backupJob.findUnique({ where: { id: parsed.data.id } });
  if (!job) redirect(`${ROUTE}?tab=jobs&error=Not-found`);
  // Synthesize a successful retry result.
  const durationSec = Math.floor(Math.random() * 400) + 30;
  const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
  await db.backupJob.update({
    where: { id: parsed.data.id },
    data: {
      status: "SUCCESS",
      startedAt: new Date(Date.now() - durationSec * 1000),
      completedAt: new Date(),
      durationSec,
      manifestHash: hash,
      manifestUrl: `https://backups.flowtora.example/manifests/${hash}.json`,
      logsUrl: `https://backups.flowtora.example/logs/${hash}.txt`,
      errorMessage: null,
      verified: true,
      verifiedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.job_retried",
    entityType: "BackupJob", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=jobs&ok=job-retried`);
}

/* ── Restore tests ─────────────────────────────────────── */

const restoreTestSchema = z.object({
  name:    z.string().min(1).max(160),
  source:  z.enum(SOURCES),
  region:  z.enum(REGIONS),
  result:  z.enum(["PASS", "FAIL", "PARTIAL"]),
  passed:  z.coerce.number().int().min(0).max(10000),
  total:   z.coerce.number().int().min(0).max(10000),
  duration: z.coerce.number().int().min(0).max(86400),
  reportUrl: z.string().url().optional().or(z.literal("")),
  summary: z.string().max(2000).optional(),
});

export async function recordRestoreTest(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = restoreTestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=restore-tests&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const startedAt = new Date(Date.now() - d.duration * 1000);
  const created = await db.restoreTest.create({
    data: {
      name: d.name,
      source: d.source as BackupSource,
      region: d.region as StorageRegion,
      result: d.result as RestoreTestResult,
      sampleQueriesPassed: d.passed,
      sampleQueriesTotal: d.total,
      durationSec: d.duration,
      reportUrl: d.reportUrl || null,
      summary: d.summary || null,
      startedAt,
      completedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.restore_test_recorded",
    entityType: "RestoreTest", entityId: created.id,
    metadata: { actor: ctx.email, source: d.source, result: d.result },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=restore-tests&ok=restore-test-recorded`);
}

/* ── Tenant restore wizard ─────────────────────────────── */

const wizardSchema = z.object({
  tenantId: z.string().min(1),
  targetAt: z.string().min(1),
  reason:   z.string().max(2000).optional(),
});

export async function startTenantRestore(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESTORE);
  const parsed = wizardSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=tenant-restore&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const targetAt = new Date(d.targetAt);
  if (Number.isNaN(targetAt.getTime())) {
    redirect(`${ROUTE}?tab=tenant-restore&error=Invalid-timestamp`);
  }
  // Synthesize a shadow-run diff.
  const rowsAdded   = Math.floor(Math.random() * 50);
  const rowsChanged = Math.floor(Math.random() * 200) + 50;
  const rowsRemoved = Math.floor(Math.random() * 30);
  const rowsAffected = rowsAdded + rowsChanged + rowsRemoved;
  const created = await db.tenantRestore.create({
    data: {
      tenantId: d.tenantId,
      targetAt,
      status: "REVIEWING",
      rowsAffected, rowsAdded, rowsChanged, rowsRemoved,
      tablesAffected: [
        { table: "Customer",     added: Math.min(rowsAdded, 10), changed: Math.min(rowsChanged, 40), removed: 0 },
        { table: "Order",        added: 0,                       changed: Math.min(rowsChanged, 60), removed: Math.min(rowsRemoved, 5) },
        { table: "Invoice",      added: 0,                       changed: Math.min(rowsChanged, 30), removed: 0 },
        { table: "ProductionStage", added: 0,                    changed: Math.min(rowsChanged, 25), removed: 0 },
      ] as never,
      initiatedById: ctx.userId,
      reason: d.reason || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.tenant_restore_started",
    entityType: "TenantRestore", entityId: created.id,
    metadata: { actor: ctx.email, tenantId: d.tenantId, targetAt: targetAt.toISOString() },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenant-restore&ok=shadow-run-complete`);
}

const applyRestoreSchema = z.object({
  id:        z.string().min(1),
  confirm:   z.string().min(1),
  expected:  z.string().min(1),
  reviewNotes: z.string().max(2000).optional(),
});

export async function applyTenantRestore(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESTORE);
  const parsed = applyRestoreSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=tenant-restore&error=Invalid`);
  const d = parsed.data;
  if (d.confirm !== d.expected) {
    redirect(`${ROUTE}?tab=tenant-restore&error=${encodeURIComponent(`Confirm phrase must equal "${d.expected}"`)}`);
  }
  const r = await db.tenantRestore.update({
    where: { id: d.id },
    data: {
      status: "APPLIED",
      appliedAt: new Date(),
      approvedById: ctx.userId,
      approvedAt: new Date(),
      reviewNotes: d.reviewNotes || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.tenant_restore_applied",
    entityType: "TenantRestore", entityId: r.id,
    metadata: { actor: ctx.email, rowsAffected: r.rowsAffected },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenant-restore&ok=restore-applied`);
}

const discardRestoreSchema = z.object({ id: z.string().min(1), reason: z.string().max(500).optional() });

export async function discardTenantRestore(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_RESTORE);
  const parsed = discardRestoreSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=tenant-restore&error=Invalid`);
  await db.tenantRestore.update({
    where: { id: parsed.data.id },
    data: {
      status: "DISCARDED",
      discardedAt: new Date(),
      reviewNotes: parsed.data.reason || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.tenant_restore_discarded",
    entityType: "TenantRestore", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenant-restore&ok=restore-discarded`);
}

/* ── Storage buckets ───────────────────────────────────── */

const bucketSchema = z.object({
  id:           z.string().optional(),
  provider:     z.string().min(1).max(40),
  bucketName:   z.string().min(1).max(120),
  region:       z.enum(REGIONS),
  hotBytes:     z.coerce.number().min(0),
  archiveBytes: z.coerce.number().min(0),
  monthlyCostCents: z.coerce.number().int().min(0),
  crrEnabled:   z.union([z.literal("on"), z.literal("")]).optional(),
  crrHealth:    z.enum(HEALTH),
  bucketHealth: z.enum(HEALTH),
  notes:        z.string().max(500).optional(),
});

export async function saveBucket(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = bucketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=storage&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    provider: d.provider,
    bucketName: d.bucketName,
    region: d.region as StorageRegion,
    hotBytes: BigInt(d.hotBytes),
    archiveBytes: BigInt(d.archiveBytes),
    monthlyCostCents: d.monthlyCostCents,
    crrEnabled: d.crrEnabled === "on",
    crrHealth: d.crrHealth as StorageHealth,
    bucketHealth: d.bucketHealth as StorageHealth,
    notes: d.notes || null,
    lastRefreshedAt: new Date(),
  };
  const saved = d.id
    ? await db.backupStorageBucket.update({ where: { id: d.id }, data })
    : await db.backupStorageBucket.create({ data });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.bucket_saved",
    entityType: "BackupStorageBucket", entityId: saved.id,
    metadata: { actor: ctx.email, provider: d.provider, bucket: d.bucketName },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=storage&ok=bucket-saved`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  kmsProvider:  z.string().min(1).max(80),
  kmsKeyId:     z.string().min(1).max(160),
  vendor:       z.string().min(1).max(80),
  rpoMinutes:   z.coerce.number().int().min(1).max(10080),
  rtoMinutes:   z.coerce.number().int().min(1).max(20160),
  successTarget: z.coerce.number().int().min(50).max(100),
  crossAccountReplication: z.union([z.literal("on"), z.literal("")]).optional(),
  rotateKey:    z.union([z.literal("on"), z.literal("")]).optional(),
  notes:        z.string().max(1000).optional(),
});

export async function saveBackupSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const now = new Date();
  const rotated = d.rotateKey === "on";
  await db.backupSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      kmsProvider: d.kmsProvider,
      kmsKeyId: d.kmsKeyId,
      vendor: d.vendor,
      rpoMinutes: d.rpoMinutes,
      rtoMinutes: d.rtoMinutes,
      successTarget: d.successTarget,
      crossAccountReplication: d.crossAccountReplication === "on",
      keyLastRotatedAt: rotated ? now : null,
      keyRotationDueIn: rotated ? 90 : null,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      kmsProvider: d.kmsProvider,
      kmsKeyId: d.kmsKeyId,
      vendor: d.vendor,
      rpoMinutes: d.rpoMinutes,
      rtoMinutes: d.rtoMinutes,
      successTarget: d.successTarget,
      crossAccountReplication: d.crossAccountReplication === "on",
      keyLastRotatedAt: rotated ? now : undefined,
      keyRotationDueIn: rotated ? 90 : undefined,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.backups.settings_saved",
    entityType: "BackupSettings", entityId: "default",
    metadata: { actor: ctx.email, rotated },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
