// Page 57 — Background Jobs / Queues.
//
// KPI strip + 8 tabs: Overview · Queues · Workers · Failed · DLQ · Schedules · Slowest · Settings.

import * as React from "react";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadQueuesPage,
  loadJobs,
  BACKEND_LABEL,
  QUEUE_STATUS_TONE,
  WORKER_STATUS_TONE,
  JOB_STATUS_TONE,
  CRON_STATUS_TONE,
  formatDurationMs,
  relativeFromNow,
  shortDateTime,
  type QueueRow,
  type WorkerRow,
  type JobRow,
  type CronRow,
  type JobFilters,
} from "@/server/platform/queues";
import {
  pauseQueue, resumeQueue, drainQueue, flushQueue, replayFailedJobs, setQueueConcurrency,
  retryJob, skipJob, deadLetterJob, deleteJob,
  restartWorker,
  toggleCron, runCronNow, saveCron,
} from "@/app/actions/platform-queues";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["overview", "queues", "workers", "failed", "dlq", "schedules", "slowest", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  overview:  "Overview",
  queues:    "Queues",
  workers:   "Workers",
  failed:    "Failed jobs",
  dlq:       "Dead-letter",
  schedules: "Schedules",
  slowest:   "Slowest",
  settings:  "Settings",
};

export default async function QueuesPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("queues.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view queues.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("queues.manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "overview";

  const filters: JobFilters = {
    q:          asString(sp.q),
    queueId:    asString(sp.queue),
    jobName:    asString(sp.job),
    errorClass: asString(sp.errorClass),
    tenantId:   asString(sp.tenant),
  };

  const data = await loadQueuesPage(filters);
  const { kpis, queues, workers, failed, dlq, schedules, slowest } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Background jobs &amp; queues</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            BullMQ / SQS / Cloud Tasks · queue depth · worker health · failed + DLQ · cron schedules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Queue depth" value={kpis.totalDepth.toLocaleString()}
             sub={`${kpis.totalActive.toLocaleString()} active · ${kpis.totalCompleted24h.toLocaleString()}/24h done`}
             tone={kpis.totalDepth > 1000 ? "warning" : "default"} />
        <Kpi label="Throughput (jpm)" value={kpis.throughputJpm.toLocaleString()}
             sub="Jobs / minute" />
        <Kpi label="Error rate (24h)" value={`${kpis.errorPct24h.toFixed(2)}%`}
             sub={`Target ≤${kpis.errorTargetPct.toFixed(1)}%`}
             tone={kpis.errorPct24h > kpis.errorTargetPct * 2 ? "danger" : kpis.errorPct24h > kpis.errorTargetPct ? "warning" : "good"} />
        <Kpi label="Dead-letter" value={kpis.deadLetterCount.toLocaleString()}
             sub={`${kpis.runningWorkers}/${kpis.totalWorkers} workers running`}
             tone={kpis.deadLetterCount > 0 ? "danger" : "good"} />
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

      {tab === "overview"  && <OverviewTab queues={queues} workers={workers} failed={failed} />}
      {tab === "queues"    && <QueuesTab rows={queues} canManage={canManage} />}
      {tab === "workers"   && <WorkersTab rows={workers} canManage={canManage} />}
      {tab === "failed"    && <JobsTab rows={failed} title="Failed jobs"
                                       subtitle={`${failed.length} jobs · retry, skip, DLQ, or delete inline`}
                                       canManage={canManage}
                                       queues={queues} filters={filters} mode="failed" />}
      {tab === "dlq"       && <JobsTab rows={dlq} title="Dead-letter queue"
                                       subtitle={`${dlq.length} jobs · bulk replay or delete`}
                                       canManage={canManage}
                                       queues={queues} filters={filters} mode="dlq" />}
      {tab === "schedules" && <SchedulesTab rows={schedules} queues={queues} canManage={canManage} />}
      {tab === "slowest"   && <SlowestTab rows={slowest} />}
      {tab === "settings"  && <SettingsTab queues={queues} canManage={canManage} />}
    </main>
  );
}

/* ── Overview ──────────────────────────────────────────── */

function OverviewTab({
  queues, workers, failed,
}: { queues: QueueRow[]; workers: WorkerRow[]; failed: JobRow[] }) {
  const sortedQueues = queues.slice().sort((a, b) => (b.active + b.waiting) - (a.active + a.waiting)).slice(0, 6);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top queues by depth</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{queues.length} queues total.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {sortedQueues.length === 0 ? <Empty>No queues yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Queue</Th><Th>Status</Th><Th>Active</Th><Th>Waiting</Th><Th>Failed 24h</Th><Th>Throughput</Th>
                </tr>
              </thead>
              <tbody>
                {sortedQueues.map((q) => (
                  <tr key={q.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{q.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{BACKEND_LABEL[q.backend]}</div>
                    </Td>
                    <Td><Pill tone={QUEUE_STATUS_TONE[q.status]} /></Td>
                    <Td><Num n={q.active} /></Td>
                    <Td><Num n={q.waiting} /></Td>
                    <Td><Num n={q.failed24h} tone={q.failed24h > 0 ? "danger" : undefined} /></Td>
                    <Td><Num n={q.throughputJpm} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Workers</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{workers.length} processes.</p>
        </header>
        <ul className="space-y-1 p-4">
          {workers.slice(0, 8).map((w) => (
            <li key={w.id} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div>
                <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{w.workerId}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {w.pool} · {relativeFromNow(w.lastHeartbeatAt)}
                </div>
              </div>
              <Pill tone={WORKER_STATUS_TONE[w.status]} />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border lg:col-span-3"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Recent failures</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Most recent {Math.min(failed.length, 8)} of {failed.length}.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {failed.length === 0 ? <Empty>No recent failures — green.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Job</Th><Th>Queue</Th><Th>Tenant</Th><Th>Error</Th><Th>Attempts</Th><Th>Failed</Th>
                </tr>
              </thead>
              <tbody>
                {failed.slice(0, 8).map((j) => (
                  <tr key={j.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{j.jobName}</div>
                      <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{j.externalId}</div>
                    </Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{j.queueName}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{j.tenantId ?? "—"}</span></Td>
                    <Td>
                      <div className="text-[11px] font-medium" style={{ color: "var(--rose-700)" }}>{j.errorClass ?? "—"}</div>
                      {j.errorMessage && <div className="max-w-[420px] truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{j.errorMessage}</div>}
                    </Td>
                    <Td><Num n={j.attempts} /></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(j.failedAt)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Queues tab ────────────────────────────────────────── */

function QueuesTab({
  rows, canManage,
}: { rows: QueueRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Queues</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} queues across BullMQ / SQS / Cloud Tasks.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No queues yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Queue</Th><Th>Backend</Th><Th>Status</Th><Th>Conc.</Th>
                <Th>Active</Th><Th>Wait</Th><Th>Delayed</Th>
                <Th>Done 24h</Th><Th>Failed 24h</Th>
                <Th>Throughput</Th><Th>Avg ms</Th><Th>p95 ms</Th>
                <Th>DLQ</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{q.name}</div>
                    <code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{q.slug}</code>
                    {q.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{q.description}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{BACKEND_LABEL[q.backend]}</span></Td>
                  <Td><Pill tone={QUEUE_STATUS_TONE[q.status]} /></Td>
                  <Td><Num n={q.concurrency} /></Td>
                  <Td><Num n={q.active} /></Td>
                  <Td><Num n={q.waiting} tone={q.waiting > 500 ? "warning" : undefined} /></Td>
                  <Td><Num n={q.delayed} /></Td>
                  <Td><Num n={q.completed24h} /></Td>
                  <Td><Num n={q.failed24h} tone={q.failed24h > 0 ? "danger" : undefined} /></Td>
                  <Td><Num n={q.throughputJpm} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{q.avgDurationMs}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{q.p95Ms}</span></Td>
                  <Td><Num n={q.deadLetters} tone={q.deadLetters > 0 ? "danger" : undefined} /></Td>
                  {canManage && (
                    <Td right>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {q.status === "ACTIVE" && (
                          <ActionForm action={pauseQueue} id={q.id} label="Pause" />
                        )}
                        {q.status !== "ACTIVE" && (
                          <ActionForm action={resumeQueue} id={q.id} label="Resume" />
                        )}
                        <ActionForm action={drainQueue} id={q.id} label="Drain" />
                        <ActionForm action={flushQueue} id={q.id} label="Flush" />
                        <ActionForm action={replayFailedJobs} id={q.id} label="Replay" />
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

/* ── Workers tab ───────────────────────────────────────── */

function WorkersTab({
  rows, canManage,
}: { rows: WorkerRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Workers</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} processes online.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No workers reporting.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Worker</Th><Th>Pool</Th><Th>Queues</Th><Th>Heartbeat</Th>
                <Th>Active</Th><Th>Mem</Th><Th>CPU</Th><Th>Version</Th><Th>Host</Th>
                <Th>Status</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{w.workerId}</code>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{w.pool}</span></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {w.queues.length === 0
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                        : w.queues.slice(0, 4).map((q) => (
                          <span key={q} className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>{q}</span>
                        ))}
                      {w.queues.length > 4 && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>+{w.queues.length - 4}</span>}
                    </div>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(w.lastHeartbeatAt)}</span></Td>
                  <Td><Num n={w.activeJobs} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{w.memMb} MB</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{ color: w.cpuPct > 85 ? "var(--rose-700)" : "var(--text-default)" }}>
                    {w.cpuPct.toFixed(1)}%
                  </span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{w.version ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{w.hostname ?? "—"}{w.pid ? ` · ${w.pid}` : ""}</span></Td>
                  <Td><Pill tone={WORKER_STATUS_TONE[w.status]} /></Td>
                  {canManage && (
                    <Td right>
                      <ActionForm action={restartWorker} id={w.id} label="Restart" />
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

/* ── Jobs tab (failed / DLQ) ───────────────────────────── */

function JobsTab({
  rows, title, subtitle, canManage, queues, filters, mode,
}: {
  rows: JobRow[];
  title: string;
  subtitle: string;
  canManage: boolean;
  queues: QueueRow[];
  filters: JobFilters;
  mode: "failed" | "dlq";
}) {
  const tabName = mode === "failed" ? "failed" : "dlq";
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
      </header>
      <form className="grid grid-cols-2 gap-2 px-4 pt-4 md:grid-cols-5" method="get">
        <input type="hidden" name="tab" value={tabName} />
        <Input name="q" label="Search" defaultValue={filters.q ?? ""} />
        <Select name="queue" label="Queue" defaultValue={filters.queueId ?? ""}
                options={[{ value: "", label: "Any queue" }, ...queues.map((q) => ({ value: q.id, label: q.name }))]} />
        <Input name="job"        label="Job name"    defaultValue={filters.jobName ?? ""} />
        <Input name="errorClass" label="Error class" defaultValue={filters.errorClass ?? ""} />
        <Input name="tenant"     label="Tenant id"   defaultValue={filters.tenantId ?? ""} />
        <div className="md:col-span-5 flex justify-end gap-2">
          <a href={`?tab=${tabName}`} className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
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
        {rows.length === 0 ? <Empty>No jobs in this view.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Job ID</Th><Th>Queue</Th><Th>Job name</Th><Th>Tenant</Th>
                <Th>{mode === "failed" ? "Failed" : "DLQ"}</Th>
                <Th>Attempts</Th><Th>Error</Th><Th>Payload</Th>
                <Th>Status</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{j.externalId}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{j.queueName}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{j.jobName}</code></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{j.tenantId ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(mode === "failed" ? j.failedAt : j.deadLetteredAt)}
                  </span></Td>
                  <Td><Num n={j.attempts} /></Td>
                  <Td>
                    <div className="text-[11px] font-medium" style={{ color: "var(--rose-700)" }}>{j.errorClass ?? "—"}</div>
                    {j.errorMessage && <div className="max-w-[280px] truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{j.errorMessage}</div>}
                  </Td>
                  <Td><span className="max-w-[260px] truncate inline-block text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{j.payloadSummary ?? "—"}</span></Td>
                  <Td><Pill tone={JOB_STATUS_TONE[j.status]} /></Td>
                  {canManage && (
                    <Td right>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <ActionForm action={retryJob} id={j.id} label="Retry" />
                        <ActionForm action={skipJob} id={j.id} label="Skip" />
                        {mode === "failed" && <ActionForm action={deadLetterJob} id={j.id} label="DLQ" />}
                        <ActionForm action={deleteJob} id={j.id} label="Delete" muted />
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

/* ── Schedules tab ─────────────────────────────────────── */

function SchedulesTab({
  rows, queues, canManage,
}: { rows: CronRow[]; queues: QueueRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Cron schedules</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} schedules.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No schedules yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Cron</Th><Th>Timezone</Th><Th>Owner</Th>
                <Th>Queue</Th><Th>Last run</Th><Th>Next run</Th><Th>Result</Th><Th>Status</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{c.name}</div>
                    <code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{c.slug}</code>
                  </Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.expression}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.timezone}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.ownerEmail ?? "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.queueName ?? "—"}</span></Td>
                  <Td>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.lastRunAt)}</div>
                    {c.lastDurationMs != null && (
                      <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDurationMs(c.lastDurationMs)}</div>
                    )}
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.nextRunAt)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.lastResult ?? "—"}</span></Td>
                  <Td><Pill tone={CRON_STATUS_TONE[c.status]} /></Td>
                  {canManage && (
                    <Td right>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <ActionForm action={runCronNow} id={c.id} label="Run now" />
                        <ActionForm action={toggleCron} id={c.id} label={c.enabled ? "Disable" : "Enable"} />
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
              + Save schedule
            </summary>
            <form action={saveCron} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="slug" label="Slug" defaultValue="" required />
              <Input name="name" label="Name" defaultValue="" required />
              <Input name="expression" label="Cron expression" defaultValue="0 3 * * *" required />
              <Input name="timezone" label="Timezone" defaultValue="UTC" required />
              <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" />
              <Select name="queueId" label="Queue (optional)" defaultValue=""
                      options={[{ value: "", label: "—" }, ...queues.map((q) => ({ value: q.id, label: q.name }))]} />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <input name="description" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="enabled" defaultChecked /> Enabled
              </label>
              <div className="md:col-span-2 flex justify-end">
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

/* ── Slowest tab ───────────────────────────────────────── */

function SlowestTab({ rows }: { rows: JobRow[] }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Slowest jobs</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Top 100 by duration · payloads PII-redacted.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No completed jobs yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Job ID</Th><Th>Queue</Th><Th>Job name</Th><Th>Tenant</Th>
                <Th>Duration</Th><Th>Status</Th><Th>When</Th><Th>Payload</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={j.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{j.externalId}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{j.queueName}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{j.jobName}</code></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{j.tenantId ?? "—"}</span></Td>
                  <Td>
                    <span className="text-[12px] font-semibold tabular-nums"
                          style={{ color: (j.durationMs ?? 0) > 30_000 ? "var(--rose-700)" : (j.durationMs ?? 0) > 5_000 ? "var(--amber-700)" : "var(--text-default)" }}>
                      {formatDurationMs(j.durationMs)}
                    </span>
                  </Td>
                  <Td><Pill tone={JOB_STATUS_TONE[j.status]} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(j.failedAt ?? j.enqueuedAt)}</span></Td>
                  <Td><span className="max-w-[280px] truncate inline-block text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{j.payloadSummary ?? "—"}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Settings tab ──────────────────────────────────────── */

function SettingsTab({
  queues, canManage,
}: { queues: QueueRow[]; canManage: boolean }) {
  if (!canManage) {
    return (
      <div className="rounded-md border p-6 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
        Read access only — settings management requires <code>queues.manage</code>.
      </div>
    );
  }
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Per-queue concurrency</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Tweak worker concurrency without redeploys.</p>
      </header>
      <div className="overflow-x-auto p-4">
        <table className="w-full">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <Th>Queue</Th><Th>Backend</Th><Th>Status</Th><Th>Concurrency</Th><Th right>Save</Th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <Td><div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{q.name}</div></Td>
                <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{BACKEND_LABEL[q.backend]}</span></Td>
                <Td><Pill tone={QUEUE_STATUS_TONE[q.status]} /></Td>
                <Td>
                  <form action={setQueueConcurrency} className="inline-flex items-center gap-1">
                    <input type="hidden" name="id" value={q.id} />
                    <input type="number" name="concurrency" defaultValue={q.concurrency}
                           min={1} max={10000}
                           className="w-20 rounded-md border px-2 py-1 text-[12px] tabular-nums"
                           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                    <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                      Save
                    </button>
                  </form>
                </Td>
                <Td right><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function ActionForm({
  action, id, label, muted,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <form action={action} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-[11px] font-medium underline"
              style={{ color: muted ? "var(--text-muted)" : "var(--accent-default)" }}>
        {label}
      </button>
    </form>
  );
}

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
