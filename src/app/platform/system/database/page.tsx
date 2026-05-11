// Page 60 — Database Health.
//
// KPI strip + 11 tabs:
//   Overview · Slow Queries · Index Usage · Tables & Bloat · Replication · Locks ·
//   Cache Hit Ratio · Vacuum/Analyze · Connections · Backups · Settings.
//
// Backups tab links over to Page 53; we render a quick summary card.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadDatabasePage,
  ROLE_LABEL,
  INSTANCE_STATUS_TONE,
  SYNC_TONE,
  VACUUM_KIND_LABEL,
  SESSION_STATE_TONE,
  LOCK_MODE_LABEL,
  relativeFromNow,
  shortDateTime,
  formatBytes,
  formatMs,
  type InstanceCard,
  type ReplicationRow,
} from "@/server/platform/database-health";
import {
  killSession, killAllStale, runVacuum, markSlowQueryReviewed, flagIndex, saveDbSettings,
} from "@/app/actions/platform-database";
import type { DbInstanceStatus, DbReplicationSyncState, DbSessionState, DbLockMode, DbVacuumKind } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["overview", "slow", "indexes", "tables", "replication", "locks", "cache", "vacuum", "connections", "backups", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  overview:    "Overview",
  slow:        "Slow queries",
  indexes:     "Index usage",
  tables:      "Tables & bloat",
  replication: "Replication",
  locks:       "Locks",
  cache:       "Cache hit ratio",
  vacuum:      "Vacuum / Analyze",
  connections: "Connections",
  backups:     "Backups",
  settings:    "Settings",
};

const VACUUM_KINDS: DbVacuumKind[] = ["AUTO", "MANUAL", "FULL", "ANALYZE_ONLY"];

export default async function DatabasePage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("database.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Database Health.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("database.manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "overview";

  const data = await loadDatabasePage();
  const { kpis, instances, replication, slow, indexes, tables, locks, cache, vacuum, sessions, settings } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Database Health</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            PostgreSQL — primary + replicas · slow queries · indexes · tables · locks · vacuum · connections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Connections" value={`${kpis.connectionsUsed}/${kpis.connectionsMax}`}
             sub={`${kpis.connectionsPct.toFixed(1)}% · warn ≥${kpis.connWarnPct}%`}
             tone={kpis.connectionsPct > kpis.connWarnPct ? "danger" : kpis.connectionsPct > kpis.connWarnPct - 10 ? "warning" : "good"} />
        <Kpi label="Replication lag" value={kpis.maxReplicationLagSec != null ? `${kpis.maxReplicationLagSec}s` : "—"}
             sub={`Warn ≥${kpis.lagWarnSec}s`}
             tone={kpis.maxReplicationLagSec != null && kpis.maxReplicationLagSec > kpis.lagWarnSec ? "danger" : "good"} />
        <Kpi label="Slow queries (24h)" value={kpis.slowQueries24h.toLocaleString()}
             sub={`Threshold ≥${kpis.slowMs}ms`}
             tone={kpis.slowQueries24h > 20 ? "warning" : "default"} />
        <Kpi label="Disk usage" value={`${kpis.diskUsedPct.toFixed(1)}%`}
             sub={`Buffer hit ${kpis.bufferHitPct.toFixed(2)}% · target ≥${kpis.bufferTargetPct}%`}
             tone={kpis.diskUsedPct > 85 ? "danger" : kpis.diskUsedPct > 70 ? "warning" : "good"} />
      </section>

      {/* Tabs */}
      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <a key={t} href={`?tab=${t}`}
             className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
             style={{
               borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
               color: tab === t ? "var(--text-default)" : "var(--text-muted)",
             }}>
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {tab === "overview"    && <OverviewTab instances={instances} replication={replication} kpis={kpis} />}
      {tab === "slow"        && <SlowQueriesTab rows={slow} canManage={canManage} />}
      {tab === "indexes"     && <IndexUsageTab rows={indexes} canManage={canManage} />}
      {tab === "tables"      && <TablesTab rows={tables} canManage={canManage} />}
      {tab === "replication" && <ReplicationTab rows={replication} kpis={kpis} />}
      {tab === "locks"       && <LocksTab rows={locks} canManage={canManage} />}
      {tab === "cache"       && <CacheTab rows={cache} kpis={kpis} />}
      {tab === "vacuum"      && <VacuumTab rows={vacuum} instances={instances} canManage={canManage} />}
      {tab === "connections" && <ConnectionsTab rows={sessions} instances={instances} canManage={canManage} />}
      {tab === "backups"     && <BackupsTab />}
      {tab === "settings"    && <SettingsTab settings={settings} canManage={canManage} />}
    </main>
  );
}

/* ── Overview ──────────────────────────────────────────── */

function OverviewTab({
  instances, replication, kpis,
}: {
  instances: InstanceCard[];
  replication: ReplicationRow[];
  kpis: { connectionsPct: number; diskUsedPct: number; bufferHitPct: number; slowMs: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {instances.map((i) => (
        <section key={i.id} className="rounded-xl border p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{i.name}</h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {ROLE_LABEL[i.role]} · {i.region}{i.version && ` · pg ${i.version}`}
              </p>
            </div>
            <Pill tone={INSTANCE_STATUS_TONE[i.status]} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Gauge label="Connections" value={i.connectionsPct} max={100}
                   detail={`${i.connectionsUsed}/${i.connectionsMax}`} />
            <Gauge label="Disk" value={i.diskUsedPct} max={100}
                   detail={`${formatBytes(i.diskUsedBytes)}/${formatBytes(i.diskTotalBytes)}`} />
          </div>
          {i.replicationLagSec != null && (
            <div className="mt-2 text-[11px]"
                 style={{ color: i.replicationLagSec > 30 ? "var(--rose-700)" : "var(--text-muted)" }}>
              Replication lag: <span className="tabular-nums">{i.replicationLagSec}s</span>
            </div>
          )}
          <div className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {i.restartCount24h > 0
              ? <>{i.restartCount24h} restart{i.restartCount24h === 1 ? "" : "s"} in 24h · last {relativeFromNow(i.lastRestartAt)}</>
              : <>Stable since {relativeFromNow(i.lastRestartAt) || "—"}</>}
          </div>
          {i.walPosition && (
            <div className="mt-1 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              WAL: <code>{i.walPosition}</code>
            </div>
          )}
        </section>
      ))}
      {instances.length === 0 && (
        <div className="col-span-full rounded-md border border-dashed p-8 text-center text-[12px]"
             style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No database instances registered yet.
        </div>
      )}
    </div>
  );
}

function Gauge({ label, value, max, detail }: { label: string; value: number; max: number; detail: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct > 85 ? "var(--rose-500)" : pct > 70 ? "var(--amber-500)" : "var(--emerald-500)";
  return (
    <div className="rounded-md border px-2 py-1.5"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-baseline justify-between text-[10px]">
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="tabular-nums" style={{ color: "var(--text-default)" }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-1)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-0.5 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{detail}</div>
    </div>
  );
}

/* ── Slow queries ──────────────────────────────────────── */

function SlowQueriesTab({
  rows, canManage,
}: {
  rows: { id: string; queryId: string; queryText: string; calls: number; meanTimeMs: number; maxTimeMs: number; totalTimeMs: number; rows: number; reviewed: boolean; externalRef: string | null; lastSeenAt: Date; instance: { slug: string; name: string }; fullQueryUrl: string | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Slow queries (pg_stat_statements)</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} queries · sorted by mean time desc.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No slow queries — green.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Query</Th><Th>Calls</Th><Th>Mean</Th><Th>Max</Th><Th>Total</Th><Th>Rows</Th>
                <Th>Last seen</Th><Th>Instance</Th><Th>Status</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <code title={q.queryText} className="block max-w-[520px] truncate text-[11px] tabular-nums"
                          style={{ color: "var(--text-default)" }}>
                      {q.queryText}
                    </code>
                    {q.externalRef && (
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>tracker: {q.externalRef}</div>
                    )}
                  </Td>
                  <Td><Num n={q.calls} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: q.meanTimeMs > 500 ? "var(--rose-700)" : "var(--text-default)" }}>{formatMs(q.meanTimeMs)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatMs(q.maxTimeMs)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatMs(q.totalTimeMs)}</span></Td>
                  <Td><Num n={q.rows} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(q.lastSeenAt)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{q.instance.slug}</span></Td>
                  <Td>
                    {q.reviewed
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Reviewed</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--amber-100)", color: "var(--amber-700)" }}>Open</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={markSlowQueryReviewed} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={q.id} />
                        <input type="hidden" name="reviewed" value={q.reviewed ? "0" : "1"} />
                        {!q.reviewed && (
                          <input name="externalRef" placeholder="LIN-?"
                                 className="w-20 rounded-md border px-1.5 py-0.5 text-[11px]"
                                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                        )}
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                          {q.reviewed ? "Reopen" : "Reviewed"}
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Index usage ───────────────────────────────────────── */

function IndexUsageTab({
  rows, canManage,
}: {
  rows: { id: string; tableName: string; indexName: string; scans: number; tuplesRead: number; tuplesFetched: number; sizeBytes: bigint; hitRatio: number; unused: boolean; instance: { slug: string } }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Index usage</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} indexes · unused flagged first.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No index stats yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Table</Th><Th>Index</Th><Th>Scans</Th><Th>Tuples read</Th><Th>Tuples fetched</Th>
                <Th>Size</Th><Th>Hit %</Th><Th>Instance</Th><Th>Flag</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((idx) => (
                <tr key={idx.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{idx.tableName}</code></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{idx.indexName}</code></Td>
                  <Td><Num n={idx.scans} /></Td>
                  <Td><Num n={idx.tuplesRead} /></Td>
                  <Td><Num n={idx.tuplesFetched} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatBytes(Number(idx.sizeBytes))}</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{ color: idx.hitRatio >= 95 ? "var(--emerald-700)" : idx.hitRatio >= 80 ? "var(--amber-700)" : "var(--rose-700)" }}>
                    {idx.hitRatio.toFixed(1)}%
                  </span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{idx.instance.slug}</span></Td>
                  <Td>
                    {idx.unused
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Unused</span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={flagIndex}>
                        <input type="hidden" name="id" value={idx.id} />
                        <input type="hidden" name="unused" value={idx.unused ? "0" : "1"} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: idx.unused ? "var(--accent-default)" : "var(--rose-700)" }}>
                          {idx.unused ? "Clear flag" : "Flag unused"}
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Tables & bloat ────────────────────────────────────── */

function TablesTab({
  rows, canManage,
}: {
  rows: { id: string; schemaName: string; tableName: string; rowCount: bigint; sizeBytes: bigint; bloatPct: number; seqScans: number; idxScans: number; lastVacuumAt: Date | null; lastAnalyzeAt: Date | null; vacuumOverdue: boolean; instance: { slug: string } }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Tables &amp; bloat</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} tables · vacuum-overdue + high-bloat first.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No table stats.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Schema.Table</Th><Th>Rows</Th><Th>Size</Th><Th>Bloat %</Th>
                <Th>Seq scans</Th><Th>Idx scans</Th>
                <Th>Last vacuum</Th><Th>Last analyze</Th>
                <Th>Instance</Th><Th>Vacuum</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{t.schemaName}.{t.tableName}</code></Td>
                  <Td><Num n={Number(t.rowCount)} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(Number(t.sizeBytes))}</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{ color: t.bloatPct > 30 ? "var(--rose-700)" : t.bloatPct > 15 ? "var(--amber-700)" : "var(--text-default)" }}>
                    {t.bloatPct.toFixed(1)}%
                  </span></Td>
                  <Td><Num n={t.seqScans} /></Td>
                  <Td><Num n={t.idxScans} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(t.lastVacuumAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(t.lastAnalyzeAt)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.instance.slug}</span></Td>
                  <Td>
                    {t.vacuumOverdue
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Overdue</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>OK</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Replication ───────────────────────────────────────── */

function ReplicationTab({
  rows, kpis,
}: {
  rows: ReplicationRow[];
  kpis: { lagWarnSec: number };
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Replication</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} replicas.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No replicas configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Replica</Th><Th>Region</Th><Th>Lag</Th><Th>Sync</Th>
                <Th>Receive LSN</Th><Th>Replay LSN</Th><Th>Restarts 24h</Th><Th>Last restart</Th>
                <Th>24h lag</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.name}</div>
                    <Pill tone={INSTANCE_STATUS_TONE[r.status]} />
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.region}</span></Td>
                  <Td>
                    <span className="text-[12px] font-semibold tabular-nums"
                          style={{ color: r.lagSec != null && r.lagSec > kpis.lagWarnSec ? "var(--rose-700)" : "var(--text-default)" }}>
                      {r.lagSec != null ? `${r.lagSec}s` : "—"}
                    </span>
                  </Td>
                  <Td><Pill tone={SYNC_TONE[r.syncState]} /></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.receiveLsn ?? "—"}</code></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.replayLsn ?? "—"}</code></Td>
                  <Td><Num n={r.restartCount24h} tone={r.restartCount24h > 0 ? "warning" : undefined} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.lastRestartAt)}</span></Td>
                  <Td>
                    <Spark values={r.lagSpark} color={r.lagSec != null && r.lagSec > kpis.lagWarnSec ? "var(--rose-500)" : "var(--emerald-500)"} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>—</span>;
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-5 w-20 items-end gap-[1px]">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm"
             style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: color, opacity: 0.85 }} />
      ))}
    </div>
  );
}

/* ── Locks ─────────────────────────────────────────────── */

function LocksTab({
  rows, canManage,
}: {
  rows: { id: string; pid: number; blockingPid: number | null; granted: boolean; mode: DbLockMode; relation: string | null; queryText: string | null; waitSeconds: number; appName: string | null; userName: string | null; startedAt: Date; instance: { slug: string } }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Active locks</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} locks · waiting first, then longest waits.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No active locks of interest.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>PID</Th><Th>Mode</Th><Th>Granted</Th><Th>Wait</Th>
                <Th>Blocking PID</Th><Th>Relation</Th><Th>Query</Th><Th>App / User</Th>
                <Th>Instance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{l.pid}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{LOCK_MODE_LABEL[l.mode]}</span></Td>
                  <Td>
                    {l.granted
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Held</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--amber-100)", color: "var(--amber-700)" }}>Waiting</span>}
                  </Td>
                  <Td>
                    <span className="text-[11px] tabular-nums"
                          style={{ color: l.waitSeconds > 30 ? "var(--rose-700)" : l.waitSeconds > 10 ? "var(--amber-700)" : "var(--text-default)" }}>
                      {l.waitSeconds}s
                    </span>
                  </Td>
                  <Td>
                    {l.blockingPid
                      ? <code className="text-[11px] tabular-nums" style={{ color: "var(--rose-700)" }}>{l.blockingPid}</code>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{l.relation ?? "—"}</code></Td>
                  <Td>
                    <code title={l.queryText ?? ""}
                          className="block max-w-[320px] truncate text-[11px] tabular-nums"
                          style={{ color: "var(--text-default)" }}>
                      {l.queryText ?? "—"}
                    </code>
                  </Td>
                  <Td>
                    <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{l.appName ?? "—"}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l.userName ?? "—"}</div>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{l.instance.slug}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Cache hit ratio ──────────────────────────────────── */

function CacheTab({
  rows, kpis,
}: {
  rows: { instanceSlug: string; instanceName: string; samples: { occurredAt: Date; bufferHitPct: number; indexHitPct: number; bufferCacheSize: bigint }[] }[];
  kpis: { bufferTargetPct: number };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {rows.length === 0 && (
        <div className="col-span-full rounded-md border border-dashed p-8 text-center text-[12px]"
             style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No cache-ratio samples yet.
        </div>
      )}
      {rows.map((r) => {
        const last = r.samples[r.samples.length - 1];
        const bufferSpark = r.samples.map((s) => s.bufferHitPct);
        const indexSpark  = r.samples.map((s) => s.indexHitPct);
        return (
          <section key={r.instanceSlug} className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{r.instanceName}</h3>
              <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                last {relativeFromNow(last?.occurredAt)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <RatioCard label="Buffer hit" value={last?.bufferHitPct ?? 0} target={kpis.bufferTargetPct} spark={bufferSpark} />
              <RatioCard label="Index hit"  value={last?.indexHitPct  ?? 0} target={kpis.bufferTargetPct} spark={indexSpark} />
            </div>
            {last && (
              <div className="mt-2 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                Buffer cache: {formatBytes(Number(last.bufferCacheSize))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RatioCard({ label, value, target, spark }: { label: string; value: number; target: number; spark: number[] }) {
  const color = value >= target ? "var(--emerald-500)" : value >= target - 1 ? "var(--amber-500)" : "var(--rose-500)";
  const fg = value >= target ? "var(--emerald-700)" : value >= target - 1 ? "var(--amber-700)" : "var(--rose-700)";
  return (
    <div className="rounded-md border px-3 py-2"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>target ≥{target}%</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[20px] font-semibold tabular-nums" style={{ color: fg }}>{value.toFixed(2)}%</span>
        <Spark values={spark} color={color} />
      </div>
    </div>
  );
}

/* ── Vacuum / Analyze ──────────────────────────────────── */

function VacuumTab({
  rows, instances, canManage,
}: {
  rows: { id: string; kind: DbVacuumKind; schemaName: string; tableName: string | null; startedAt: Date; completedAt: Date | null; durationSec: number | null; rowsRemoved: number | null; triggeredBy: string | null; instance: { slug: string } }[];
  instances: InstanceCard[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Vacuum &amp; analyze history</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} runs · most recent first.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No runs recorded.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Started</Th><Th>Kind</Th><Th>Table</Th><Th>Duration</Th>
                <Th>Rows removed</Th><Th>Triggered by</Th><Th>Instance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{shortDateTime(v.startedAt)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{VACUUM_KIND_LABEL[v.kind]}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{v.tableName ?? "all"}</code></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{v.durationSec ? `${v.durationSec}s` : "—"}</span></Td>
                  <Td><Num n={v.rowsRemoved ?? 0} /></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.triggeredBy ?? "scheduler"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.instance.slug}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && instances.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Manual run
            </summary>
            <form action={runVacuum} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Select name="instanceId" label="Instance"
                      options={instances.map((i) => ({ value: i.id, label: i.name }))} />
              <Input name="tableName" label="Table" defaultValue="" required />
              <Select name="kind" label="Kind"
                      options={VACUUM_KINDS.map((k) => ({ value: k, label: VACUUM_KIND_LABEL[k] }))} />
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Run
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Connections ───────────────────────────────────────── */

function ConnectionsTab({
  rows, instances, canManage,
}: {
  rows: { id: string; pid: number; appName: string | null; userName: string | null; clientAddr: string | null; state: DbSessionState; queryText: string | null; stateSec: number; staleIdle: boolean; startedAt: Date; instance: { slug: string; id?: string } }[];
  instances: InstanceCard[];
  canManage: boolean;
}) {
  const staleByInstance = new Map<string, number>();
  for (const r of rows) {
    if (r.staleIdle) {
      const slug = r.instance.slug;
      staleByInstance.set(slug, (staleByInstance.get(slug) ?? 0) + 1);
    }
  }
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Active sessions</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} sessions · {Array.from(staleByInstance.values()).reduce((s, n) => s + n, 0)} stale idle-in-txn (red flag).
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No sessions reporting.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>PID</Th><Th>State</Th><Th>App / User</Th><Th>Client</Th>
                <Th>Query</Th><Th>State age</Th><Th>Instance</Th><Th>Stale?</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{s.pid}</code></Td>
                  <Td><Pill tone={SESSION_STATE_TONE[s.state]} /></Td>
                  <Td>
                    <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{s.appName ?? "—"}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.userName ?? "—"}</div>
                  </Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{s.clientAddr ?? "—"}</code></Td>
                  <Td>
                    <code title={s.queryText ?? ""}
                          className="block max-w-[320px] truncate text-[11px] tabular-nums"
                          style={{ color: "var(--text-default)" }}>
                      {s.queryText ?? "—"}
                    </code>
                  </Td>
                  <Td>
                    <span className="text-[11px] tabular-nums"
                          style={{ color: s.stateSec > 300 ? "var(--rose-700)" : s.stateSec > 60 ? "var(--amber-700)" : "var(--text-default)" }}>
                      {s.stateSec}s
                    </span>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.instance.slug}</span></Td>
                  <Td>
                    {s.staleIdle
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Stale</span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <details className="inline-block">
                        <summary className="cursor-pointer text-[11px] font-medium underline" style={{ color: "var(--rose-700)" }}>
                          Kill
                        </summary>
                        <form action={killSession} className="absolute right-4 mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-1.5"
                              style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)" }}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="expected" value={`KILL-${s.pid}`} />
                          <input name="confirm" placeholder={`KILL-${s.pid}`}
                                 className="w-24 rounded-md border px-1.5 py-0.5 text-[11px]"
                                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                          <button type="submit" className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--rose-600, var(--rose-500))", color: "white" }}>
                            Kill
                          </button>
                        </form>
                      </details>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && instances.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--rose-700)" }}>
              ⚠ Kill all stale idle-in-transaction sessions
            </summary>
            <form action={killAllStale} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Select name="instanceId" label="Instance"
                      options={instances.map((i) => ({ value: i.id, label: i.name }))} />
              <Input name="confirm" label="Type KILL-STALE" defaultValue="" required />
              <div className="flex items-end justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold"
                        style={{ background: "var(--rose-600, var(--rose-500))", color: "white" }}>
                  Kill all stale
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Backups (cross-link to Page 53) ────────────────────── */

function BackupsTab() {
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Backups</h3>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Backup oversight, restore drills, and point-in-time recovery live in the dedicated Backups page.
      </p>
      <Link href="/platform/security/backups"
            className="mt-3 inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
            style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        Go to Backups & Restore →
      </Link>
    </section>
  );
}

/* ── Settings ──────────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: { connectionWarnPct: number; replicationLagWarnSec: number; slowQueryThresholdMs: number; bufferHitTargetPct: number; autoVacuumCadenceDays: number; notes: string | null } | null;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <div className="rounded-md border p-6 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
        Read access only — settings management requires <code>database.manage</code>.
      </div>
    );
  }
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Database health settings</h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Thresholds for connection / replication / slow-query / buffer hit / vacuum cadence.
      </p>
      <form action={saveDbSettings} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Input name="connectionWarnPct"     label="Connection warn (%)"     type="number" defaultValue={String(settings?.connectionWarnPct ?? 80)} />
        <Input name="replicationLagWarnSec" label="Replication lag warn (s)" type="number" defaultValue={String(settings?.replicationLagWarnSec ?? 30)} />
        <Input name="slowQueryThresholdMs"  label="Slow query threshold (ms)" type="number" defaultValue={String(settings?.slowQueryThresholdMs ?? 500)} />
        <Input name="bufferHitTargetPct"    label="Buffer hit target (%)"   type="number" defaultValue={String(settings?.bufferHitTargetPct ?? 99)} />
        <Input name="autoVacuumCadenceDays" label="Auto-vacuum cadence (d)" type="number" defaultValue={String(settings?.autoVacuumCadenceDays ?? 1)} />
        <label className="md:col-span-3 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea name="notes" rows={3} defaultValue={settings?.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        <div className="md:col-span-3 flex justify-end">
          <button type="submit" className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function Pill({ tone }: { tone: { bg: string; fg: string; label: string } }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {tone.label}
    </span>
  );
}

function Num({ n, tone }: { n: number; tone?: "danger" | "warning" }) {
  const color =
    tone === "danger"  ? "var(--rose-700)" :
    tone === "warning" ? "var(--amber-700)" :
                          "var(--text-default)";
  return <span className="text-[11px] tabular-nums" style={{ color }}>{n.toLocaleString()}</span>;
}

function Kpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`pb-2 text-${right ? "right" : "left"} text-[11px] font-medium uppercase tracking-wide`}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`py-2 pr-3 align-top ${right ? "text-right" : ""}`}>{children}</td>;
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
      {decodeURIComponent(msg)}
    </div>
  );
}
function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {decodeURIComponent(msg.replace(/-/g, " "))}
    </div>
  );
}

function Input({
  name, label, type, defaultValue, required,
}: { name: string; label: string; type?: string; defaultValue: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}{required && <span style={{ color: "var(--rose-500)" }}> *</span>}
      </span>
      <input
        type={type ?? "text"}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}
function Select({
  name, label, options, defaultValue,
}: {
  name: string; label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
