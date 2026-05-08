// Page 53 — Backups & Restore data layer.

import { db } from "@/lib/db";
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

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const SOURCE_LABEL: Record<BackupSource, string> = {
  POSTGRES:      "PostgreSQL",
  S3_PROOFS:     "S3 (proofs)",
  S3_EXPORTS:    "S3 (exports)",
  REDIS:         "Redis",
  ELASTICSEARCH: "Elasticsearch",
  CONFIG:        "Configuration",
  KMS_KEYS:      "KMS keys",
};

export const CADENCE_LABEL: Record<BackupCadence, string> = {
  CONTINUOUS: "Continuous",
  HOURLY:     "Hourly",
  DAILY:      "Daily",
  WEEKLY:     "Weekly",
  MONTHLY:    "Monthly",
  ON_DEMAND:  "On demand",
};

export const KIND_LABEL: Record<BackupKind, string> = {
  CONTINUOUS_WAL: "WAL stream",
  SNAPSHOT:       "Snapshot",
  FULL:           "Full",
  INCREMENTAL:    "Incremental",
  ARCHIVE:        "Archive",
};

export const REGION_LABEL: Record<StorageRegion, string> = {
  US_EAST_1:      "us-east-1",
  US_WEST_2:      "us-west-2",
  EU_WEST_1:      "eu-west-1",
  AP_SOUTHEAST_1: "ap-southeast-1",
  GLOBAL:         "global",
};

export const ENCRYPTION_LABEL: Record<BackupEncryptionAlgorithm, string> = {
  AES_256_GCM: "AES-256-GCM",
  AES_256_CBC: "AES-256-CBC",
  RSA_4096:    "RSA-4096",
};

export const JOB_STATUS_TONE: Record<
  BackupJobStatus,
  { bg: string; fg: string; label: string }
> = {
  SUCCESS: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Success" },
  RUNNING: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Running" },
  PENDING: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  PARTIAL: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Partial" },
  FAILED:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  EXPIRED: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Expired" },
};

export const RESTORE_TEST_TONE: Record<
  RestoreTestResult,
  { bg: string; fg: string; label: string }
> = {
  PASS:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Pass" },
  PARTIAL: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Partial" },
  FAIL:    { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Fail" },
  RUNNING: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Running" },
};

export const TENANT_RESTORE_TONE: Record<
  TenantRestoreStatus,
  { bg: string; fg: string; label: string }
> = {
  APPLIED:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Applied" },
  REVIEWING:  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Reviewing diff" },
  SHADOW_RUN: { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Shadow run" },
  DRAFT:      { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Draft" },
  DISCARDED:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Discarded" },
  FAILED:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
};

export const STORAGE_HEALTH_TONE: Record<
  StorageHealth,
  { bg: string; fg: string; label: string }
> = {
  HEALTHY:  { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Healthy" },
  DEGRADED: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Degraded" },
  AT_RISK:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "At risk" },
  OFFLINE:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Offline" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface BackupKpis {
  /** Most recent successful job timestamp. */
  lastSuccessAt: Date | null;
  /** Hours since the last success. */
  lastSuccessHoursAgo: number | null;
  /** Total bytes stored across all hot+archive locations. */
  totalSizeBytes: number;
  successPct30d: number;
  totalJobs30d: number;
  failedJobs30d: number;
  /** Current RPO (computed from continuous-WAL lag, in minutes). */
  currentRpoMinutes: number | null;
  /** Last drill RTO in minutes. */
  lastRtoMinutes: number | null;
  rpoTargetMinutes: number;
  rtoTargetMinutes: number;
  successTargetPct: number;
}

export async function loadBackupKpis(): Promise<BackupKpis> {
  const since30d = new Date(Date.now() - 30 * DAY);
  const [settings, lastSuccess, agg30d, success30d, totalSizeAgg, lastDrill, lastWal, buckets] = await Promise.all([
    db.backupSettings.findUnique({ where: { id: "default" } }),
    db.backupJob.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.backupJob.count({ where: { startedAt: { gte: since30d } } }),
    db.backupJob.count({ where: { startedAt: { gte: since30d }, status: "SUCCESS" } }),
    db.backupJob.aggregate({
      where: { status: "SUCCESS" },
      _sum: { sizeBytes: true },
    }),
    db.restoreTest.findFirst({
      orderBy: { startedAt: "desc" },
      select: { durationSec: true },
    }),
    db.backupJob.findFirst({
      where: { kind: "CONTINUOUS_WAL", status: "SUCCESS" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
    db.backupStorageBucket.findMany({
      select: { hotBytes: true, archiveBytes: true },
    }),
  ]);
  const lastSuccessAt = lastSuccess?.completedAt ?? null;
  const lastSuccessHoursAgo = lastSuccessAt
    ? Math.round((Date.now() - lastSuccessAt.getTime()) / 3_600_000)
    : null;
  const totalBucketBytes = buckets.reduce((s, b) => s + Number(b.hotBytes) + Number(b.archiveBytes), 0);
  return {
    lastSuccessAt,
    lastSuccessHoursAgo,
    totalSizeBytes: totalBucketBytes || Number(totalSizeAgg._sum.sizeBytes ?? 0),
    successPct30d: agg30d === 0 ? 100 : Math.round((success30d / agg30d) * 100),
    totalJobs30d: agg30d,
    failedJobs30d: agg30d - success30d,
    currentRpoMinutes: lastWal?.completedAt
      ? Math.round((Date.now() - lastWal.completedAt.getTime()) / 60_000)
      : null,
    lastRtoMinutes: lastDrill?.durationSec ? Math.round(lastDrill.durationSec / 60) : null,
    rpoTargetMinutes: settings?.rpoMinutes ?? 60,
    rtoTargetMinutes: settings?.rtoMinutes ?? 240,
    successTargetPct: settings?.successTarget ?? 99,
  };
}

/* ── Schedules tab ──────────────────────────────────────── */

export interface ScheduleRow {
  id: string;
  name: string;
  source: BackupSource;
  kind: BackupKind;
  cadence: BackupCadence;
  cronExpr: string | null;
  retentionDays: number;
  encryption: BackupEncryptionAlgorithm;
  region: StorageRegion;
  active: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  notes: string | null;
}

export async function loadSchedules(): Promise<ScheduleRow[]> {
  const rows = await db.backupSchedule.findMany({
    orderBy: [{ source: "asc" }, { kind: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id, name: s.name, source: s.source, kind: s.kind, cadence: s.cadence,
    cronExpr: s.cronExpr, retentionDays: s.retentionDays,
    encryption: s.encryption, region: s.region,
    active: s.active, lastRunAt: s.lastRunAt, nextRunAt: s.nextRunAt,
    notes: s.notes,
  }));
}

/* ── Jobs tab ───────────────────────────────────────────── */

export interface JobsFilters {
  source?: BackupSource | "ALL";
  status?: BackupJobStatus | "ALL";
  region?: StorageRegion | "ALL";
  /** Hours back to include. */
  since?: number;
}

export interface JobRow {
  id: string;
  source: BackupSource;
  kind: BackupKind;
  status: BackupJobStatus;
  region: StorageRegion;
  encryption: BackupEncryptionAlgorithm;
  startedAt: Date;
  completedAt: Date | null;
  durationSec: number | null;
  sizeBytes: number | null;
  manifestHash: string | null;
  manifestUrl: string | null;
  logsUrl: string | null;
  errorMessage: string | null;
  verified: boolean;
  scheduleId: string | null;
}

export async function loadJobs(filters: JobsFilters): Promise<JobRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.source && filters.source !== "ALL") conditions.push({ source: filters.source });
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.region && filters.region !== "ALL") conditions.push({ region: filters.region });
  if (filters.since && filters.since > 0)         conditions.push({ startedAt: { gte: new Date(Date.now() - filters.since * 3_600_000) } });
  const where = conditions.length === 0 ? {} : { AND: conditions };
  const rows = await db.backupJob.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  return rows.map((j) => ({
    id: j.id, source: j.source, kind: j.kind, status: j.status,
    region: j.region, encryption: j.encryption,
    startedAt: j.startedAt, completedAt: j.completedAt,
    durationSec: j.durationSec,
    sizeBytes: j.sizeBytes != null ? Number(j.sizeBytes) : null,
    manifestHash: j.manifestHash, manifestUrl: j.manifestUrl, logsUrl: j.logsUrl,
    errorMessage: j.errorMessage, verified: j.verified,
    scheduleId: j.scheduleId,
  }));
}

/* ── Restore tests tab ──────────────────────────────────── */

export interface RestoreTestRow {
  id: string;
  name: string;
  source: BackupSource;
  startedAt: Date;
  completedAt: Date | null;
  durationSec: number | null;
  result: RestoreTestResult;
  sampleQueriesPassed: number;
  sampleQueriesTotal: number;
  reportUrl: string | null;
  summary: string | null;
  region: StorageRegion;
}

export async function loadRestoreTests(): Promise<RestoreTestRow[]> {
  const rows = await db.restoreTest.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, source: r.source,
    startedAt: r.startedAt, completedAt: r.completedAt, durationSec: r.durationSec,
    result: r.result,
    sampleQueriesPassed: r.sampleQueriesPassed, sampleQueriesTotal: r.sampleQueriesTotal,
    reportUrl: r.reportUrl, summary: r.summary, region: r.region,
  }));
}

/* ── Tenant restore tab ─────────────────────────────────── */

export interface TenantRestoreRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  targetAt: Date;
  status: TenantRestoreStatus;
  rowsAffected: number;
  rowsAdded: number;
  rowsChanged: number;
  rowsRemoved: number;
  reason: string | null;
  reviewNotes: string | null;
  initiatedById: string | null;
  approvedById: string | null;
  appliedAt: Date | null;
  createdAt: Date;
}

export async function loadTenantRestores(): Promise<TenantRestoreRow[]> {
  const rows = await db.tenantRestore.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((t) => ({
    id: t.id, tenantId: t.tenant.id, tenantName: t.tenant.name, tenantSlug: t.tenant.slug,
    targetAt: t.targetAt, status: t.status,
    rowsAffected: t.rowsAffected, rowsAdded: t.rowsAdded,
    rowsChanged: t.rowsChanged, rowsRemoved: t.rowsRemoved,
    reason: t.reason, reviewNotes: t.reviewNotes,
    initiatedById: t.initiatedById, approvedById: t.approvedById,
    appliedAt: t.appliedAt, createdAt: t.createdAt,
  }));
}

/* ── Storage tab ────────────────────────────────────────── */

export interface BucketRow {
  id: string;
  provider: string;
  bucketName: string;
  region: StorageRegion;
  hotBytes: number;
  archiveBytes: number;
  crrEnabled: boolean;
  crrHealth: StorageHealth;
  bucketHealth: StorageHealth;
  monthlyCostCents: number;
  lastRefreshedAt: Date | null;
  notes: string | null;
}

export async function loadBuckets(): Promise<BucketRow[]> {
  const rows = await db.backupStorageBucket.findMany({
    orderBy: [{ provider: "asc" }, { bucketName: "asc" }],
  });
  return rows.map((b) => ({
    id: b.id, provider: b.provider, bucketName: b.bucketName, region: b.region,
    hotBytes: Number(b.hotBytes), archiveBytes: Number(b.archiveBytes),
    crrEnabled: b.crrEnabled, crrHealth: b.crrHealth, bucketHealth: b.bucketHealth,
    monthlyCostCents: b.monthlyCostCents, lastRefreshedAt: b.lastRefreshedAt,
    notes: b.notes,
  }));
}

/* ── Settings tab ───────────────────────────────────────── */

export async function loadBackupSettings() {
  return db.backupSettings.findUnique({ where: { id: "default" } });
}

/* ── Helpers ───────────────────────────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadBackupsPage(jobsFilters: JobsFilters) {
  const [kpis, schedules, jobs, restoreTests, tenantRestores, buckets, settings, tenants] = await Promise.all([
    loadBackupKpis(),
    loadSchedules(),
    loadJobs(jobsFilters),
    loadRestoreTests(),
    loadTenantRestores(),
    loadBuckets(),
    loadBackupSettings(),
    db.tenant.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);
  return { kpis, schedules, jobs, restoreTests, tenantRestores, buckets, settings, tenants };
}
