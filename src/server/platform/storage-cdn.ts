// Page 59 — Storage & CDN data layer.

import { db } from "@/lib/db";
import type {
  StorageBucketProvider,
  StorageEncryptionMode,
  StoragePublicAccess,
  StorageLifecycleAction,
  CdnHealth,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const PROVIDER_LABEL: Record<StorageBucketProvider, string> = {
  AWS_S3:          "AWS S3",
  CLOUDFLARE_R2:   "Cloudflare R2",
  GCS:             "Google Cloud Storage",
  AZURE_BLOB:      "Azure Blob",
  BACKBLAZE_B2:    "Backblaze B2",
  OTHER:           "Other",
};

export const ENCRYPTION_LABEL: Record<StorageEncryptionMode, string> = {
  NONE:    "None",
  SSE_S3:  "SSE-S3",
  SSE_KMS: "SSE-KMS",
  SSE_CMK: "SSE-CMK",
  CSE:     "Client-side",
};

export const PUBLIC_ACCESS_TONE: Record<
  StoragePublicAccess,
  { bg: string; fg: string; label: string }
> = {
  PRIVATE:           { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Private" },
  TENANT_GATED:      { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Tenant-gated" },
  PUBLIC_READ:       { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Public read" },
  PUBLIC_READ_WRITE: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Public RW" },
};

export const LIFECYCLE_ACTION_LABEL: Record<StorageLifecycleAction, string> = {
  ARCHIVE:                 "Archive",
  DELETE:                  "Delete",
  TRANSITION_IA:           "Transition → IA",
  TRANSITION_GLACIER:      "Transition → Glacier",
  TRANSITION_DEEP_ARCHIVE: "Transition → Deep Archive",
  EXPIRE_VERSIONS:         "Expire old versions",
};

export const CDN_HEALTH_TONE: Record<
  CdnHealth,
  { bg: string; fg: string; label: string }
> = {
  HEALTHY:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Healthy" },
  DEGRADED:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Degraded" },
  WARNING:   { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Warning" },
  OFFLINE:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Offline" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface StorageKpis {
  totalBytes: number;
  totalObjects: number;
  bandwidth24hBytes: number;
  hitRatePct: number;
  hitRateTargetPct: number;
  mtdCostCents: number;
  monthlyBudgetCents: number;
  budgetUsedPct: number;
  bucketCount: number;
  anomalyTenants: number;
  hotlinkTenants: number;
}

export async function loadStorageKpis(): Promise<StorageKpis> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const since24h = new Date(Date.now() - DAY);

  const [bucketsAgg, popAgg, bucketCount, settings, mtdEgress, anomalyCount, hotlinkCount] = await Promise.all([
    db.storageBucketEntry.aggregate({
      _sum: { sizeBytes: true, objectCount: true, monthlyCostCents: true },
    }),
    db.cdnPopStats.aggregate({
      _sum: { bandwidthBytes: true, requests24h: true },
      _avg: { hitRate: true },
    }),
    db.storageBucketEntry.count(),
    db.storageSettings.findUnique({ where: { id: "default" } }),
    db.egressDailySample.aggregate({
      where: { day: { gte: monthStart } },
      _sum: { costCents: true },
    }),
    db.tenantStorageUsage.count({ where: { anomalyFlag: true } }),
    db.egressTenantUsage.count({ where: { suspectedHotlink: true } }),
  ]);

  const totalCost = (mtdEgress._sum.costCents ?? 0) + (bucketsAgg._sum.monthlyCostCents ?? 0);
  const budget = settings?.monthlyBudgetCents ?? 0;
  return {
    totalBytes:        Number(bucketsAgg._sum.sizeBytes ?? 0),
    totalObjects:      Number(bucketsAgg._sum.objectCount ?? 0),
    bandwidth24hBytes: Number(popAgg._sum.bandwidthBytes ?? 0),
    hitRatePct:        Math.round((popAgg._avg.hitRate ?? 0) * 100) / 100,
    hitRateTargetPct:  settings?.hitRateTargetPct ?? 95,
    mtdCostCents:      totalCost,
    monthlyBudgetCents: budget,
    budgetUsedPct:     budget === 0 ? 0 : Math.round((totalCost / budget) * 1000) / 10,
    bucketCount,
    anomalyTenants:    anomalyCount,
    hotlinkTenants:    hotlinkCount,
  };
}

/* ── Buckets ───────────────────────────────────────────── */

export interface BucketRow {
  id: string;
  name: string;
  provider: StorageBucketProvider;
  region: string;
  encryption: StorageEncryptionMode;
  versioning: boolean;
  publicAccess: StoragePublicAccess;
  objectCount: number;
  sizeBytes: number;
  hotBytes: number;
  archiveBytes: number;
  monthlyCostCents: number;
  lifecyclePolicyName: string | null;
  tag: string | null;
  lastRefreshedAt: Date | null;
}

export async function loadBuckets(): Promise<BucketRow[]> {
  const rows = await db.storageBucketEntry.findMany({
    orderBy: [{ provider: "asc" }, { name: "asc" }],
    include: { lifecyclePolicy: { select: { name: true } } },
  });
  return rows.map((b) => ({
    id: b.id, name: b.name, provider: b.provider, region: b.region,
    encryption: b.encryption, versioning: b.versioning, publicAccess: b.publicAccess,
    objectCount: Number(b.objectCount), sizeBytes: Number(b.sizeBytes),
    hotBytes: Number(b.hotBytes), archiveBytes: Number(b.archiveBytes),
    monthlyCostCents: b.monthlyCostCents,
    lifecyclePolicyName: b.lifecyclePolicy?.name ?? null,
    tag: b.tag, lastRefreshedAt: b.lastRefreshedAt,
  }));
}

/* ── Per-tenant usage ──────────────────────────────────── */

export interface TenantUsageRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  storageBytes: number;
  limitBytes: number;
  pctUsed: number;
  bandwidth30dBytes: number;
  fileCount: number;
  largestFolder: string | null;
  anomalyFlag: boolean;
  anomalyReason: string | null;
}

export async function loadTenantUsage(): Promise<TenantUsageRow[]> {
  const rows = await db.tenantStorageUsage.findMany({
    orderBy: { storageBytes: "desc" },
    take: 100,
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((r) => {
    const used = Number(r.storageBytes);
    const limit = Number(r.limitBytes);
    return {
      id: r.id,
      tenantId: r.tenant.id, tenantName: r.tenant.name, tenantSlug: r.tenant.slug,
      storageBytes: used,
      limitBytes: limit,
      pctUsed: limit === 0 ? 0 : Math.round((used / limit) * 1000) / 10,
      bandwidth30dBytes: Number(r.bandwidth30dBytes),
      fileCount: r.fileCount, largestFolder: r.largestFolder,
      anomalyFlag: r.anomalyFlag, anomalyReason: r.anomalyReason,
    };
  });
}

/* ── CDN ───────────────────────────────────────────────── */

export interface CdnPopRow {
  id: string;
  popCode: string;
  region: string;
  city: string | null;
  health: CdnHealth;
  hitRate: number;
  bandwidthBytes: number;
  requests24h: number;
  avgLatencyMs: number;
}

export async function loadCdnPops(): Promise<CdnPopRow[]> {
  const rows = await db.cdnPopStats.findMany({
    orderBy: [{ health: "asc" }, { bandwidthBytes: "desc" }],
  });
  return rows.map((p) => ({
    id: p.id, popCode: p.popCode, region: p.region, city: p.city, health: p.health,
    hitRate: p.hitRate, bandwidthBytes: Number(p.bandwidthBytes),
    requests24h: p.requests24h, avgLatencyMs: p.avgLatencyMs,
  }));
}

export interface CdnUrlRow {
  id: string;
  url: string;
  bandwidthBytes: number;
  requests24h: number;
  hitRate: number;
  contentType: string | null;
  suspectedHotlink: boolean;
}

export async function loadCdnTopUrls(limit = 20): Promise<CdnUrlRow[]> {
  const rows = await db.cdnTopUrl.findMany({
    orderBy: { bandwidthBytes: "desc" },
    take: limit,
  });
  return rows.map((u) => ({
    id: u.id, url: u.url, bandwidthBytes: Number(u.bandwidthBytes),
    requests24h: u.requests24h, hitRate: u.hitRate, contentType: u.contentType,
    suspectedHotlink: u.suspectedHotlink,
  }));
}

/* ── Image optimization ────────────────────────────────── */

export async function loadImageStats() {
  return db.imageOptimizationStats.findUnique({ where: { id: "default" } });
}

/* ── Lifecycle policies ────────────────────────────────── */

export async function loadLifecyclePolicies() {
  return db.storageLifecyclePolicy.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { buckets: true } } },
  });
}

/* ── Egress ────────────────────────────────────────────── */

export async function loadEgressDaily(days: number) {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.egressDailySample.findMany({
    where: { day: { gte: since } },
    orderBy: { day: "asc" },
  });
  return rows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    bytes: Number(r.bytes),
    costCents: r.costCents,
  }));
}

export interface EgressTenantRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  bytes30d: number;
  cost30dCents: number;
  suspectedHotlink: boolean;
  hotlinkSourceDomain: string | null;
  notes: string | null;
}

export async function loadEgressTenants(): Promise<EgressTenantRow[]> {
  const rows = await db.egressTenantUsage.findMany({
    orderBy: { bytes30d: "desc" },
    take: 100,
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant.id, tenantName: r.tenant.name, tenantSlug: r.tenant.slug,
    bytes30d: Number(r.bytes30d),
    cost30dCents: r.cost30dCents,
    suspectedHotlink: r.suspectedHotlink,
    hotlinkSourceDomain: r.hotlinkSourceDomain,
    notes: r.notes,
  }));
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadStorageSettings() {
  return db.storageSettings.findUnique({ where: { id: "default" } });
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

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadStoragePage() {
  const [kpis, buckets, tenantUsage, pops, topUrls, imageStats, lifecycle, egressDaily, egressTenants, settings] = await Promise.all([
    loadStorageKpis(),
    loadBuckets(),
    loadTenantUsage(),
    loadCdnPops(),
    loadCdnTopUrls(20),
    loadImageStats(),
    loadLifecyclePolicies(),
    loadEgressDaily(30),
    loadEgressTenants(),
    loadStorageSettings(),
  ]);
  return { kpis, buckets, tenantUsage, pops, topUrls, imageStats, lifecycle, egressDaily, egressTenants, settings };
}
