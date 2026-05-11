// Page 60 — Database Health data layer.

import { db } from "@/lib/db";
import type {
  DbInstanceRole,
  DbInstanceStatus,
  DbReplicationSyncState,
  DbVacuumKind,
  DbSessionState,
  DbLockMode,
} from "@prisma/client";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const ROLE_LABEL: Record<DbInstanceRole, string> = {
  PRIMARY:       "Primary",
  REPLICA:       "Replica",
  STANDBY:       "Standby",
  CACHE_REPLICA: "Cache replica",
};

export const INSTANCE_STATUS_TONE: Record<
  DbInstanceStatus,
  { bg: string; fg: string; label: string }
> = {
  ONLINE:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Online" },
  DEGRADED:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Degraded" },
  RECOVERING:  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Recovering" },
  MAINTENANCE: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Maintenance" },
  OFFLINE:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Offline" },
};

export const SYNC_TONE: Record<
  DbReplicationSyncState,
  { bg: string; fg: string; label: string }
> = {
  SYNC:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Sync" },
  POTENTIAL: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Potential" },
  ASYNC:     { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Async" },
  PENDING:   { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  LOST:      { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Lost" },
};

export const VACUUM_KIND_LABEL: Record<DbVacuumKind, string> = {
  AUTO:         "Auto",
  MANUAL:       "Manual",
  FULL:         "Full",
  ANALYZE_ONLY: "Analyze only",
};

export const SESSION_STATE_TONE: Record<
  DbSessionState,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:                       { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Active" },
  IDLE:                         { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Idle" },
  IDLE_IN_TRANSACTION:          { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Idle in txn" },
  IDLE_IN_TRANSACTION_ABORTED:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Aborted in txn" },
  FASTPATH:                     { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Fastpath" },
  DISABLED:                     { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Disabled" },
};

export const LOCK_MODE_LABEL: Record<DbLockMode, string> = {
  ACCESS_SHARE:           "AccessShare",
  ROW_SHARE:              "RowShare",
  ROW_EXCLUSIVE:          "RowExclusive",
  SHARE_UPDATE_EXCLUSIVE: "ShareUpdate",
  SHARE:                  "Share",
  SHARE_ROW_EXCLUSIVE:    "ShareRow",
  EXCLUSIVE:              "Exclusive",
  ACCESS_EXCLUSIVE:       "AccessExclusive",
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface DbKpis {
  connectionsUsed: number;
  connectionsMax: number;
  connectionsPct: number;
  maxReplicationLagSec: number | null;
  slowQueries24h: number;
  diskUsedPct: number;
  bufferHitPct: number;
  /** Thresholds. */
  connWarnPct: number;
  lagWarnSec: number;
  slowMs: number;
  bufferTargetPct: number;
}

export async function loadDbKpis(): Promise<DbKpis> {
  const since24 = new Date(Date.now() - DAY);
  const [instances, settings, slow24h, latestCacheRow] = await Promise.all([
    db.dbInstance.findMany({
      select: {
        connectionsUsed: true, connectionsMax: true,
        diskUsedPct: true, replicationLagSec: true, role: true,
      },
    }),
    db.dbHealthSettings.findUnique({ where: { id: "default" } }),
    db.dbSlowQuery.count({ where: { lastSeenAt: { gte: since24 } } }),
    db.dbCacheRatioSample.findFirst({ orderBy: { occurredAt: "desc" } }),
  ]);
  const connectionsUsed = instances.reduce((s, i) => s + i.connectionsUsed, 0);
  const connectionsMax  = instances.reduce((s, i) => s + i.connectionsMax,  0);
  const connectionsPct  = connectionsMax === 0 ? 0 : Math.round((connectionsUsed / connectionsMax) * 1000) / 10;
  const diskUsedPct     = instances.length === 0 ? 0
    : Math.round((instances.reduce((s, i) => s + i.diskUsedPct, 0) / instances.length) * 10) / 10;
  const maxReplicationLagSec = instances
    .filter((i) => i.role !== "PRIMARY" && i.replicationLagSec != null)
    .reduce<number | null>((m, i) => Math.max(m ?? 0, i.replicationLagSec ?? 0), null);
  return {
    connectionsUsed, connectionsMax, connectionsPct,
    maxReplicationLagSec,
    slowQueries24h: slow24h,
    diskUsedPct,
    bufferHitPct: latestCacheRow ? Math.round(latestCacheRow.bufferHitPct * 100) / 100 : 0,
    connWarnPct:    settings?.connectionWarnPct ?? 80,
    lagWarnSec:     settings?.replicationLagWarnSec ?? 30,
    slowMs:         settings?.slowQueryThresholdMs ?? 500,
    bufferTargetPct: settings?.bufferHitTargetPct ?? 99,
  };
}

/* ── Instances ─────────────────────────────────────────── */

export interface InstanceCard {
  id: string;
  slug: string;
  name: string;
  role: DbInstanceRole;
  region: string;
  version: string | null;
  status: DbInstanceStatus;
  connectionsUsed: number;
  connectionsMax: number;
  connectionsPct: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskUsedPct: number;
  replicationLagSec: number | null;
  walPosition: string | null;
  lastRestartAt: Date | null;
  restartCount24h: number;
  notes: string | null;
}

export async function loadInstances(): Promise<InstanceCard[]> {
  const rows = await db.dbInstance.findMany({
    orderBy: [{ role: "asc" }, { region: "asc" }],
  });
  return rows.map((i) => ({
    id: i.id, slug: i.slug, name: i.name, role: i.role, region: i.region, version: i.version,
    status: i.status,
    connectionsUsed: i.connectionsUsed,
    connectionsMax: i.connectionsMax,
    connectionsPct: i.connectionsMax === 0 ? 0 : Math.round((i.connectionsUsed / i.connectionsMax) * 1000) / 10,
    diskUsedBytes: Number(i.diskUsedBytes),
    diskTotalBytes: Number(i.diskTotalBytes),
    diskUsedPct: i.diskUsedPct,
    replicationLagSec: i.replicationLagSec,
    walPosition: i.walPosition,
    lastRestartAt: i.lastRestartAt,
    restartCount24h: i.restartCount24h,
    notes: i.notes,
  }));
}

/* ── Replication ───────────────────────────────────────── */

export interface ReplicationRow {
  id: string;
  name: string;
  region: string;
  status: DbInstanceStatus;
  lagSec: number | null;
  syncState: DbReplicationSyncState;
  receiveLsn: string | null;
  replayLsn: string | null;
  restartCount24h: number;
  lastRestartAt: Date | null;
  /** Last 24h lag series for sparkline. */
  lagSpark: number[];
}

export async function loadReplication(): Promise<ReplicationRow[]> {
  const since24 = new Date(Date.now() - DAY);
  const replicas = await db.dbInstance.findMany({
    where: { role: { in: ["REPLICA", "STANDBY", "CACHE_REPLICA"] } },
    orderBy: [{ region: "asc" }, { name: "asc" }],
  });
  const ids = replicas.map((r) => r.id);
  const samples = ids.length === 0 ? [] : await db.dbReplicationSample.findMany({
    where: { instanceId: { in: ids }, occurredAt: { gte: since24 } },
    orderBy: { occurredAt: "asc" },
    select: { instanceId: true, lagSec: true, syncState: true, receiveLsn: true, replayLsn: true, occurredAt: true },
  });
  const sparkMap = new Map<string, number[]>();
  const latestMap = new Map<string, { syncState: DbReplicationSyncState; receiveLsn: string | null; replayLsn: string | null }>();
  for (const s of samples) {
    if (!sparkMap.has(s.instanceId)) sparkMap.set(s.instanceId, []);
    sparkMap.get(s.instanceId)!.push(s.lagSec);
    latestMap.set(s.instanceId, { syncState: s.syncState, receiveLsn: s.receiveLsn, replayLsn: s.replayLsn });
  }
  return replicas.map((r) => ({
    id: r.id, name: r.name, region: r.region, status: r.status,
    lagSec: r.replicationLagSec,
    syncState: latestMap.get(r.id)?.syncState ?? "ASYNC",
    receiveLsn: latestMap.get(r.id)?.receiveLsn ?? r.walPosition,
    replayLsn: latestMap.get(r.id)?.replayLsn ?? r.walPosition,
    restartCount24h: r.restartCount24h,
    lastRestartAt: r.lastRestartAt,
    lagSpark: sparkMap.get(r.id) ?? [],
  }));
}

/* ── Slow queries ──────────────────────────────────────── */

export async function loadSlowQueries(limit = 100) {
  return db.dbSlowQuery.findMany({
    orderBy: { meanTimeMs: "desc" },
    take: limit,
    include: { instance: { select: { slug: true, name: true } } },
  });
}

/* ── Index usage ───────────────────────────────────────── */

export async function loadIndexUsage(limit = 100) {
  return db.dbIndexUsage.findMany({
    orderBy: [{ unused: "desc" }, { sizeBytes: "desc" }],
    take: limit,
    include: { instance: { select: { slug: true, name: true } } },
  });
}

/* ── Table stats ───────────────────────────────────────── */

export async function loadTableStats(limit = 100) {
  return db.dbTableStats.findMany({
    orderBy: [{ vacuumOverdue: "desc" }, { bloatPct: "desc" }, { sizeBytes: "desc" }],
    take: limit,
    include: { instance: { select: { slug: true, name: true } } },
  });
}

/* ── Locks ─────────────────────────────────────────────── */

export async function loadLocks(limit = 100) {
  return db.dbLock.findMany({
    orderBy: [{ granted: "asc" }, { waitSeconds: "desc" }],
    take: limit,
    include: { instance: { select: { slug: true, name: true } } },
  });
}

/* ── Cache hit ratio ──────────────────────────────────── */

export async function loadCacheRatio() {
  const since24 = new Date(Date.now() - DAY);
  const rows = await db.dbCacheRatioSample.findMany({
    where: { occurredAt: { gte: since24 } },
    orderBy: { occurredAt: "asc" },
    include: { instance: { select: { slug: true, name: true } } },
  });
  // Group by instance.
  const map = new Map<string, { instanceSlug: string; instanceName: string; samples: { occurredAt: Date; bufferHitPct: number; indexHitPct: number; bufferCacheSize: bigint }[] }>();
  for (const r of rows) {
    const k = r.instance.slug;
    if (!map.has(k)) map.set(k, { instanceSlug: k, instanceName: r.instance.name, samples: [] });
    map.get(k)!.samples.push({
      occurredAt: r.occurredAt,
      bufferHitPct: r.bufferHitPct,
      indexHitPct: r.indexHitPct,
      bufferCacheSize: r.bufferCacheSize,
    });
  }
  return Array.from(map.values());
}

/* ── Vacuum runs ───────────────────────────────────────── */

export async function loadVacuumRuns(limit = 100) {
  return db.dbVacuumRun.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { instance: { select: { slug: true, name: true } } },
  });
}

/* ── Sessions ──────────────────────────────────────────── */

export async function loadSessions(limit = 200) {
  return db.dbSession.findMany({
    orderBy: [{ staleIdle: "desc" }, { stateSec: "desc" }],
    take: limit,
    include: { instance: { select: { slug: true, name: true } } },
  });
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadDbSettings() {
  return db.dbHealthSettings.findUnique({ where: { id: "default" } });
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

export function formatMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const min = Math.floor(ms / 60_000);
  return `${min}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function shortDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadDatabasePage() {
  const [kpis, instances, replication, slow, indexes, tables, locks, cache, vacuum, sessions, settings] = await Promise.all([
    loadDbKpis(),
    loadInstances(),
    loadReplication(),
    loadSlowQueries(100),
    loadIndexUsage(100),
    loadTableStats(100),
    loadLocks(100),
    loadCacheRatio(),
    loadVacuumRuns(100),
    loadSessions(200),
    loadDbSettings(),
  ]);
  return { kpis, instances, replication, slow, indexes, tables, locks, cache, vacuum, sessions, settings };
}
