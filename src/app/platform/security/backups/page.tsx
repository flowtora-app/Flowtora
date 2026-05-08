// Page 53 — Backups & Restore.
//
// KPI strip + six tabs:
//   Schedules · Backup Jobs · Restore Tests · Per-Tenant Restore · Storage · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadBackupsPage,
  SOURCE_LABEL,
  CADENCE_LABEL,
  KIND_LABEL,
  REGION_LABEL,
  ENCRYPTION_LABEL,
  JOB_STATUS_TONE,
  RESTORE_TEST_TONE,
  TENANT_RESTORE_TONE,
  STORAGE_HEALTH_TONE,
  relativeFromNow,
  formatBytes,
  formatDuration,
  formatCents,
  type ScheduleRow,
  type JobRow,
  type RestoreTestRow,
  type TenantRestoreRow,
  type BucketRow,
} from "@/server/platform/backups";
import {
  saveSchedule,
  deleteSchedule,
  runScheduleNow,
  retryJob,
  recordRestoreTest,
  startTenantRestore,
  applyTenantRestore,
  discardTenantRestore,
  saveBucket,
  saveBackupSettings,
} from "@/app/actions/platform-backups";
import type {
  BackupSource,
  BackupCadence,
  BackupKind,
  BackupJobStatus,
  StorageRegion,
  BackupEncryptionAlgorithm,
  StorageHealth,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const asNum = (v: string | string[] | undefined, fallback?: number) => {
  const s = asString(v);
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
};

const TABS = ["schedules", "jobs", "restore-tests", "tenant-restore", "storage", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  schedules:        "Schedules",
  jobs:             "Backup jobs",
  "restore-tests":  "Restore tests",
  "tenant-restore": "Per-tenant restore",
  storage:          "Storage",
  settings:         "Settings",
};

const SOURCES: BackupSource[] = ["POSTGRES", "S3_PROOFS", "S3_EXPORTS", "REDIS", "ELASTICSEARCH", "CONFIG", "KMS_KEYS"];
const CADENCES: BackupCadence[] = ["CONTINUOUS", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "ON_DEMAND"];
const KINDS: BackupKind[] = ["CONTINUOUS_WAL", "SNAPSHOT", "FULL", "INCREMENTAL", "ARCHIVE"];
const STATUSES: BackupJobStatus[] = ["PENDING", "RUNNING", "SUCCESS", "FAILED", "PARTIAL", "EXPIRED"];
const REGIONS: StorageRegion[] = ["US_EAST_1", "US_WEST_2", "EU_WEST_1", "AP_SOUTHEAST_1", "GLOBAL"];
const ENCRYPTIONS: BackupEncryptionAlgorithm[] = ["AES_256_GCM", "AES_256_CBC", "RSA_4096"];
const HEALTH: StorageHealth[] = ["HEALTHY", "DEGRADED", "AT_RISK", "OFFLINE"];

export default async function BackupsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("backups.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Backups & Restore.
        </p>
      </main>
    );
  }
  const canManage  = ctx.can("backups.manage");
  const canRestore = ctx.can("backups.restore");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "schedules";

  const jobsFilters = {
    source: (asString(sp.source) as BackupSource | "ALL" | undefined) ?? "ALL",
    status: (asString(sp.status) as BackupJobStatus | "ALL" | undefined) ?? "ALL",
    region: (asString(sp.region) as StorageRegion | "ALL" | undefined) ?? "ALL",
    since:  asNum(sp.since, 168),
  };

  const data = await loadBackupsPage(jobsFilters);
  const { kpis, schedules, jobs, restoreTests, tenantRestores, buckets, settings, tenants } = data;

  const lastSuccessTone =
    kpis.lastSuccessHoursAgo == null ? "danger" :
    kpis.lastSuccessHoursAgo > 24 ? "danger" :
    kpis.lastSuccessHoursAgo > 6  ? "warning" :
                                     "good";

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Backups & Restore</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Backup oversight, restore drills, point-in-time tenant recovery, storage health, and KMS settings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          label="Last successful backup"
          value={kpis.lastSuccessAt ? relativeFromNow(kpis.lastSuccessAt) : "—"}
          sub={kpis.lastSuccessHoursAgo != null ? `${kpis.lastSuccessHoursAgo}h ago` : "No success on file"}
          tone={lastSuccessTone}
        />
        <Kpi
          label="Total storage"
          value={formatBytes(kpis.totalSizeBytes)}
          sub="Hot + archive"
        />
        <Kpi
          label="Successful jobs (30d)"
          value={`${kpis.successPct30d}%`}
          sub={`${kpis.totalJobs30d - kpis.failedJobs30d}/${kpis.totalJobs30d} · target ≥${kpis.successTargetPct}%`}
          tone={kpis.successPct30d >= kpis.successTargetPct ? "good" : kpis.successPct30d >= 90 ? "warning" : "danger"}
        />
        <Kpi
          label="RPO / RTO"
          value={
            (kpis.currentRpoMinutes != null ? `${kpis.currentRpoMinutes}m` : "—") +
            " / " +
            (kpis.lastRtoMinutes != null ? `${kpis.lastRtoMinutes}m` : "—")
          }
          sub={`Target ${kpis.rpoTargetMinutes}m / ${kpis.rtoTargetMinutes}m`}
          tone={
            kpis.currentRpoMinutes != null && kpis.currentRpoMinutes > kpis.rpoTargetMinutes
              ? "danger"
              : "good"
          }
        />
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

      {tab === "schedules"        && <SchedulesTab schedules={schedules} canManage={canManage} />}
      {tab === "jobs"             && <JobsTab jobs={jobs} canManage={canManage} jobsFilters={jobsFilters} />}
      {tab === "restore-tests"    && <RestoreTestsTab rows={restoreTests} canManage={canManage} />}
      {tab === "tenant-restore"   && <TenantRestoreTab rows={tenantRestores} tenants={tenants} canRestore={canRestore} />}
      {tab === "storage"          && <StorageTab rows={buckets} canManage={canManage} />}
      {tab === "settings"         && <SettingsTab settings={settings} canManage={canManage} />}
    </main>
  );
}

/* ── Schedules tab ──────────────────────────────────────── */

function SchedulesTab({
  schedules, canManage,
}: { schedules: ScheduleRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Schedules</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {schedules.length} active schedules · WAL stream + snapshots + archives.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {schedules.length === 0 ? <Empty>No schedules configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Schedule</Th><Th>Source</Th><Th>Kind</Th><Th>Cadence</Th>
                <Th>Retention</Th><Th>Encryption</Th><Th>Region</Th>
                <Th>Last run</Th><Th>Next run</Th><Th>State</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{s.name}</div>
                    {s.cronExpr && <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{s.cronExpr}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{SOURCE_LABEL[s.source]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{KIND_LABEL[s.kind]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{CADENCE_LABEL[s.cadence]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{s.retentionDays > 9000 ? "forever" : `${s.retentionDays}d`}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{ENCRYPTION_LABEL[s.encryption]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{REGION_LABEL[s.region]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(s.lastRunAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(s.nextRunAt)}</span></Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: s.active ? "var(--emerald-100)" : "var(--surface-2)",
                            color: s.active ? "var(--emerald-700)" : "var(--text-muted)",
                          }}>
                      {s.active ? "Active" : "Paused"}
                    </span>
                  </Td>
                  {canManage && (
                    <Td right>
                      <div className="flex justify-end gap-2">
                        <form action={runScheduleNow}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                            Run now
                          </button>
                        </form>
                        <form action={deleteSchedule}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                            Delete
                          </button>
                        </form>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add schedule
            </summary>
            <form action={saveSchedule} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Display name" defaultValue="" required />
              <Select name="source" label="Source" options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
              <Select name="kind"   label="Kind"   options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
              <Select name="cadence" label="Cadence" options={CADENCES.map((c) => ({ value: c, label: CADENCE_LABEL[c] }))} />
              <Input name="cronExpr" label="Cron expression (display)" defaultValue="0 3 * * *" />
              <Input name="retentionDays" label="Retention (days)" type="number" defaultValue="30" required />
              <Select name="encryption" label="Encryption"
                      options={ENCRYPTIONS.map((e) => ({ value: e, label: ENCRYPTION_LABEL[e] }))} />
              <Select name="region" label="Region"
                      options={REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] }))} />
              <label className="inline-flex items-center gap-2 text-[12px]"
                     style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save schedule
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Jobs tab ──────────────────────────────────────────── */

function JobsTab({
  jobs, canManage, jobsFilters,
}: {
  jobs: JobRow[];
  canManage: boolean;
  jobsFilters: { source: string; status: string; region: string; since: number | undefined };
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Backup jobs</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{jobs.length} jobs in window</p>
      </header>
      <form className="grid grid-cols-2 gap-2 px-4 pt-4 md:grid-cols-4" method="get">
        <input type="hidden" name="tab" value="jobs" />
        <Select name="source" label="Source" defaultValue={jobsFilters.source}
                options={[{ value: "ALL", label: "All sources" }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))]} />
        <Select name="status" label="Status" defaultValue={jobsFilters.status}
                options={[{ value: "ALL", label: "Any status" }, ...STATUSES.map((s) => ({ value: s, label: JOB_STATUS_TONE[s].label }))]} />
        <Select name="region" label="Region" defaultValue={jobsFilters.region}
                options={[{ value: "ALL", label: "Any region" }, ...REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] }))]} />
        <Select name="since"  label="Since" defaultValue={String(jobsFilters.since ?? 168)}
                options={[
                  { value: "24",  label: "Last 24h" },
                  { value: "168", label: "Last 7d" },
                  { value: "720", label: "Last 30d" },
                  { value: "0",   label: "All time" },
                ]} />
        <div className="md:col-span-4 flex justify-end gap-2">
          <a href="?tab=jobs" className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
            Clear
          </a>
          <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Apply
          </button>
        </div>
      </form>
      <div className="overflow-x-auto p-4">
        {jobs.length === 0 ? <Empty>No jobs match your filters.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Job</Th><Th>Source</Th><Th>Kind</Th><Th>Status</Th>
                <Th>Started</Th><Th>Duration</Th><Th>Size</Th>
                <Th>Region</Th><Th>Encryption</Th><Th>Verification</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{j.id.slice(-8)}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{SOURCE_LABEL[j.source]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{KIND_LABEL[j.kind]}</span></Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: JOB_STATUS_TONE[j.status].bg, color: JOB_STATUS_TONE[j.status].fg }}>
                      {JOB_STATUS_TONE[j.status].label}
                    </span>
                    {j.errorMessage && (
                      <div className="mt-0.5 max-w-[260px] truncate text-[10px]" style={{ color: "var(--rose-700)" }}>
                        {j.errorMessage}
                      </div>
                    )}
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(j.startedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDuration(j.durationSec)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{j.sizeBytes != null ? formatBytes(j.sizeBytes) : "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{REGION_LABEL[j.region]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{ENCRYPTION_LABEL[j.encryption]}</span></Td>
                  <Td>
                    {j.manifestHash ? (
                      <code className="text-[10px] tabular-nums" title={j.manifestHash} style={{ color: "var(--text-default)" }}>
                        {j.verified ? "✓ " : ""}{j.manifestHash.slice(0, 10)}…
                      </code>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </Td>
                  {canManage && (
                    <Td right>
                      <div className="flex flex-col items-end gap-0.5">
                        {j.manifestUrl && (
                          <a href={j.manifestUrl} target="_blank" rel="noopener noreferrer"
                             className="text-[11px] underline" style={{ color: "var(--accent-default)" }}>
                            Manifest
                          </a>
                        )}
                        {j.logsUrl && (
                          <a href={j.logsUrl} target="_blank" rel="noopener noreferrer"
                             className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>
                            Logs
                          </a>
                        )}
                        {(j.status === "FAILED" || j.status === "PARTIAL") && (
                          <form action={retryJob}>
                            <input type="hidden" name="id" value={j.id} />
                            <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                              Retry
                            </button>
                          </form>
                        )}
                      </div>
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

/* ── Restore tests tab ─────────────────────────────────── */

function RestoreTestsTab({
  rows, canManage,
}: { rows: RestoreTestRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Restore tests</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Monthly restore-to-isolated-env drills with sample-query validation.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No drills yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Source</Th><Th>Started</Th><Th>Duration</Th>
                <Th>Sample queries</Th><Th>Result</Th><Th>Region</Th>
                <Th right>Report</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.name}</div>
                    {r.summary && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.summary}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{SOURCE_LABEL[r.source]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.startedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDuration(r.durationSec)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{
                            color: r.sampleQueriesPassed === r.sampleQueriesTotal ? "var(--emerald-700)" : "var(--amber-700)",
                          }}>
                    {r.sampleQueriesPassed}/{r.sampleQueriesTotal}
                  </span></Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: RESTORE_TEST_TONE[r.result].bg, color: RESTORE_TEST_TONE[r.result].fg }}>
                      {RESTORE_TEST_TONE[r.result].label}
                    </span>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{REGION_LABEL[r.region]}</span></Td>
                  <Td right>
                    {r.reportUrl ? (
                      <a href={r.reportUrl} target="_blank" rel="noopener noreferrer"
                         className="text-[11px] underline" style={{ color: "var(--accent-default)" }}>PDF</a>
                    ) : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Record drill result
            </summary>
            <form action={recordRestoreTest} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Drill name" defaultValue="" required />
              <Select name="source" label="Source"
                      options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
              <Select name="region" label="Region"
                      options={REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] }))} />
              <Select name="result" label="Result"
                      options={[
                        { value: "PASS",    label: "Pass" },
                        { value: "PARTIAL", label: "Partial" },
                        { value: "FAIL",    label: "Fail" },
                      ]} />
              <Input name="passed" label="Sample queries passed" type="number" defaultValue="0" />
              <Input name="total"  label="Sample queries total" type="number" defaultValue="0" />
              <Input name="duration" label="Duration (sec)" type="number" defaultValue="0" />
              <Input name="reportUrl" label="Report URL" type="url" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Summary</span>
                <textarea name="summary" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Record drill
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Per-tenant restore tab ────────────────────────────── */

function TenantRestoreTab({
  rows, tenants, canRestore,
}: {
  rows: TenantRestoreRow[];
  tenants: { id: string; name: string; slug: string }[];
  canRestore: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Recent restores</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} runs</p>
        </header>
        <div className="overflow-x-auto p-4">
          {rows.length === 0 ? <Empty>No tenant restores recorded yet.</Empty> : (
            <ul className="space-y-3">
              {rows.slice(0, 10).map((r) => (
                <li key={r.id} className="rounded-md border px-3 py-2"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.tenantName}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        target {r.targetAt.toISOString().slice(0, 19).replace("T", " ")} · {r.rowsAffected.toLocaleString()} rows
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: TENANT_RESTORE_TONE[r.status].bg, color: TENANT_RESTORE_TONE[r.status].fg }}>
                      {TENANT_RESTORE_TONE[r.status].label}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    <span>+{r.rowsAdded} added</span>
                    <span>~{r.rowsChanged} changed</span>
                    <span>-{r.rowsRemoved} removed</span>
                  </div>
                  {r.reason && (
                    <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>Reason: {r.reason}</div>
                  )}
                  {r.status === "REVIEWING" && canRestore && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                        Review &amp; apply
                      </summary>
                      <form action={applyTenantRestore} className="mt-2 space-y-1.5">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="expected" value={`APPLY-${r.tenantSlug}`} />
                        <code className="block rounded-md border px-2 py-1 text-[11px]"
                              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          APPLY-{r.tenantSlug}
                        </code>
                        <input name="confirm" placeholder="Type the phrase exactly"
                               className="w-full rounded-md border px-2 py-1 text-[11px]"
                               style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)", color: "var(--text-default)" }} />
                        <textarea name="reviewNotes" rows={2} placeholder="Review notes (optional)"
                                  className="w-full rounded-md border px-2 py-1 text-[11px]"
                                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                        <div className="flex justify-end gap-2">
                          <form action={discardTenantRestore} className="inline-flex">
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                              Discard
                            </button>
                          </form>
                          <button type="submit" className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                                  style={{ background: "var(--rose-600, var(--rose-500))", color: "white" }}>
                            Apply restore
                          </button>
                        </div>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {canRestore && (
        <section className="rounded-xl border p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Start point-in-time restore</h3>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Pick a tenant and a target timestamp. We&apos;ll run a shadow diff against the current state. You review, then type the confirmation phrase to apply.
          </p>
          <form action={startTenantRestore} className="mt-3 grid grid-cols-2 gap-2">
            <Select name="tenantId" label="Tenant"
                    options={tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))} />
            <Input name="targetAt" label="Target timestamp" type="datetime-local"
                   defaultValue={new Date(Date.now() - 86_400_000).toISOString().slice(0, 16)} required />
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Reason</span>
              <textarea name="reason" rows={3} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <div className="col-span-2 flex justify-end">
              <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Run shadow restore
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/* ── Storage tab ───────────────────────────────────────── */

function StorageTab({
  rows, canManage,
}: { rows: BucketRow[]; canManage: boolean }) {
  const totalHot = rows.reduce((s, b) => s + b.hotBytes, 0);
  const totalArchive = rows.reduce((s, b) => s + b.archiveBytes, 0);
  const totalCost = rows.reduce((s, b) => s + b.monthlyCostCents, 0);
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Storage buckets</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} buckets · {formatBytes(totalHot)} hot + {formatBytes(totalArchive)} archive · {formatCents(totalCost)}/mo
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No buckets registered.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Provider</Th><Th>Bucket</Th><Th>Region</Th>
                <Th>Hot</Th><Th>Archive</Th><Th>Cost/mo</Th>
                <Th>CRR</Th><Th>Health</Th><Th>Last refreshed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{b.provider}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.bucketName}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{REGION_LABEL[b.region]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(b.hotBytes)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatBytes(b.archiveBytes)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatCents(b.monthlyCostCents)}</span></Td>
                  <Td>
                    {b.crrEnabled ? (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: STORAGE_HEALTH_TONE[b.crrHealth].bg, color: STORAGE_HEALTH_TONE[b.crrHealth].fg }}>
                        CRR · {STORAGE_HEALTH_TONE[b.crrHealth].label}
                      </span>
                    ) : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>off</span>}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: STORAGE_HEALTH_TONE[b.bucketHealth].bg, color: STORAGE_HEALTH_TONE[b.bucketHealth].fg }}>
                      {STORAGE_HEALTH_TONE[b.bucketHealth].label}
                    </span>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(b.lastRefreshedAt)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add storage bucket
            </summary>
            <form action={saveBucket} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="provider" label="Provider" defaultValue="AWS S3" required />
              <Input name="bucketName" label="Bucket name" defaultValue="" required />
              <Select name="region" label="Region"
                      options={REGIONS.map((r) => ({ value: r, label: REGION_LABEL[r] }))} />
              <Input name="hotBytes"     label="Hot bytes"     type="number" defaultValue="0" />
              <Input name="archiveBytes" label="Archive bytes" type="number" defaultValue="0" />
              <Input name="monthlyCostCents" label="Cost/mo (cents)" type="number" defaultValue="0" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="crrEnabled" defaultChecked /> Cross-region replication
              </label>
              <Select name="crrHealth"    label="CRR health"
                      options={HEALTH.map((h) => ({ value: h, label: STORAGE_HEALTH_TONE[h].label }))} />
              <Select name="bucketHealth" label="Bucket health"
                      options={HEALTH.map((h) => ({ value: h, label: STORAGE_HEALTH_TONE[h].label }))} />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save bucket
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Settings tab ──────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadBackupsPage>>["settings"];
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <div className="rounded-md border p-6 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
        Read access only — settings management requires <code>backups.manage</code>.
      </div>
    );
  }
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Backup program settings</h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        KMS provider, key rotation, replication, RPO/RTO targets, vendor.
      </p>
      <form action={saveBackupSettings} className="mt-4 grid grid-cols-2 gap-3">
        <Input name="kmsProvider" label="KMS provider"   defaultValue={settings?.kmsProvider ?? "AWS KMS"} required />
        <Input name="kmsKeyId"    label="KMS key id"     defaultValue={settings?.kmsKeyId ?? "alias/flowtora-backups"} required />
        <Input name="vendor"      label="Backup vendor"  defaultValue={settings?.vendor ?? "AWS Backup"} required />
        <Input name="rpoMinutes"  label="RPO target (min)"  type="number" defaultValue={String(settings?.rpoMinutes ?? 60)} />
        <Input name="rtoMinutes"  label="RTO target (min)"  type="number" defaultValue={String(settings?.rtoMinutes ?? 240)} />
        <Input name="successTarget" label="Success target (%)" type="number" defaultValue={String(settings?.successTarget ?? 99)} />
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="crossAccountReplication" defaultChecked={settings?.crossAccountReplication ?? true} />
          Cross-account replication
        </label>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="rotateKey" /> Rotate KMS key on save
        </label>
        <label className="col-span-2 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Runbook notes</span>
          <textarea name="notes" rows={3} defaultValue={settings?.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        <div className="col-span-2 flex justify-end">
          <button type="submit" className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Save settings
          </button>
        </div>
      </form>
      {settings?.keyLastRotatedAt && (
        <div className="mt-3 rounded-md border px-3 py-2 text-[11px]"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
          KMS key last rotated {relativeFromNow(settings.keyLastRotatedAt)}
          {settings.keyRotationDueIn != null && <> · next rotation due in {settings.keyRotationDueIn}d</>}
        </div>
      )}
    </section>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

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
