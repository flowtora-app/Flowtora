// Page 64 — Logs & Errors.
//
// Five tabs: Live Tail · Search · Errors · Saved Queries · Alerts · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadLogsPage, loadRecentLogs, loadLogHistogram, loadIssues, loadIssueDetail,
  SEVERITY_LABEL, SEVERITY_TONE,
  ISSUE_STATUS_TONE,
  ALERT_CHANNEL_LABEL, ALERT_STATUS_TONE,
  IGNORE_TYPE_LABEL,
  relativeFromNow, timeHHMMSS,
} from "@/server/platform/logs";
import {
  resolveIssue, reopenIssue, ignoreIssue, assignIssue, linkIssueToLinear,
  saveSavedQuery, deleteSavedQuery,
  saveAlert, deleteAlert, setAlertStatus,
  saveLogSettings,
} from "@/app/actions/platform-logs";
import type {
  LogSeverity,
  LogIssueStatus,
  LogIssueIgnoreType,
  LogAlertChannel,
  LogAlertStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["live", "search", "errors", "saved", "alerts", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  live:     "Live tail",
  search:   "Search",
  errors:   "Errors",
  saved:    "Saved queries",
  alerts:   "Alerts",
  settings: "Settings",
};

const SEVERITIES: LogSeverity[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
const STATUSES: LogIssueStatus[] = ["UNRESOLVED", "RESOLVED", "IGNORED"];
const IGNORE_TYPES: LogIssueIgnoreType[] = ["NONE", "UNTIL_VERSION", "UNTIL_N_EVENTS", "UNTIL_N_DAYS"];
const CHANNELS: LogAlertChannel[] = ["SLACK", "PAGERDUTY", "EMAIL", "WEBHOOK"];
const ALERT_STATUSES: LogAlertStatus[] = ["ACTIVE", "PAUSED", "FIRING"];

export default async function LogsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("logs.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Logs &amp; Errors.
        </p>
      </main>
    );
  }
  const canManage  = ctx.can("logs.manage");
  const canResolve = ctx.can("logs.resolve");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "live";

  // Common filters
  const severityFilter = asString(sp.severity) as LogSeverity | undefined;
  const serviceFilter  = asString(sp.service);
  const search         = asString(sp.search) ?? "";

  // Issue filters
  const issueStatusFilter = asString(sp.status) as LogIssueStatus | undefined;
  const issueProjectFilter = asString(sp.project);
  const issueAssigneeFilter = asString(sp.assignee);
  const selectedIssueId = asString(sp.id);

  const data = await loadLogsPage();
  const { kpis, savedQueries, alerts, settings, facets, histogram } = data;

  const recentLogs = (tab === "live" || tab === "search")
    ? await loadRecentLogs({ severity: severityFilter, service: serviceFilter, search, limit: tab === "live" ? 100 : 200 })
    : [];

  const issues = tab === "errors"
    ? await loadIssues({
        status: issueStatusFilter,
        project: issueProjectFilter,
        assignee: issueAssigneeFilter,
        search,
      })
    : [];
  const selectedIssue = (tab === "errors" && selectedIssueId)
    ? await loadIssueDetail(selectedIssueId)
    : null;

  const services = facets.find((f) => f.field === "service")?.values.map((v) => v.value) ?? [];

  return (
    <main className="mx-auto w-full max-w-[1620px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Logs &amp; errors</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Structured log search, error grouping, saved queries, and alerts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Events (24h)" value={kpis.events24h.toLocaleString()}
             sub={kpis.errorRatePctChange === 0 ? "no change vs 24h prior"
                  : `${kpis.errorRatePctChange > 0 ? "+" : ""}${kpis.errorRatePctChange}% vs prior`}
             tone={kpis.errorRatePctChange > 25 ? "warning" : "default"} />
        <Kpi label="Errors / Fatals (24h)" value={`${kpis.errors24h.toLocaleString()} / ${kpis.fatals24h.toLocaleString()}`}
             sub={kpis.fatals24h > 0 ? "fatals need investigation" : "—"}
             tone={kpis.fatals24h > 0 ? "danger" : kpis.errors24h > 0 ? "warning" : "good"} />
        <Kpi label="Open issues" value={String(kpis.openIssues)}
             sub={`${kpis.criticalIssues} critical`}
             tone={kpis.criticalIssues > 0 ? "danger" : kpis.openIssues > 0 ? "warning" : "good"} />
        <Kpi label="Alerts firing" value={String(kpis.firingAlerts)}
             sub={`${kpis.pausedAlerts} paused`}
             tone={kpis.firingAlerts > 0 ? "danger" : "default"} />
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

      {tab === "live" && (
        <LiveTailTab rows={recentLogs} services={services} search={search}
                     severityFilter={severityFilter} serviceFilter={serviceFilter} />
      )}
      {tab === "search" && (
        <SearchTab rows={recentLogs} services={services} histogram={histogram}
                   facets={facets} savedQueries={savedQueries}
                   search={search} severityFilter={severityFilter} serviceFilter={serviceFilter}
                   canManage={canManage} />
      )}
      {tab === "errors" && (
        <ErrorsTab issues={issues} selectedIssue={selectedIssue}
                   search={search} status={issueStatusFilter}
                   project={issueProjectFilter} assignee={issueAssigneeFilter}
                   canResolve={canResolve} />
      )}
      {tab === "saved" && (
        <SavedQueriesTab rows={savedQueries} canManage={canManage} />
      )}
      {tab === "alerts" && (
        <AlertsTab rows={alerts} canManage={canManage} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canManage={canManage} />
      )}
    </main>
  );
}

/* ── Live tail ─────────────────────────────────────────── */

function LiveTailTab({
  rows, services, search, severityFilter, serviceFilter,
}: {
  rows: Awaited<ReturnType<typeof loadRecentLogs>>;
  services: string[];
  search: string;
  severityFilter?: LogSeverity;
  serviceFilter?: string;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Live tail</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Most recent log lines · auto-refresh on reload.
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value="live" />
          <input name="search" placeholder="grep…" defaultValue={search}
                 className="rounded-md border px-2 py-1 text-[11px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)", width: 180 }} />
          <select name="severity" defaultValue={severityFilter ?? ""}
                  className="rounded-md border px-2 py-1 text-[11px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <option value="">All levels</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
          </select>
          <select name="service" defaultValue={serviceFilter ?? ""}
                  className="rounded-md border px-2 py-1 text-[11px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <option value="">All services</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit"
                  className="rounded-md px-2 py-1 text-[11px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Apply
          </button>
        </form>
      </header>
      <div className="overflow-y-auto p-3" style={{ maxHeight: "720px" }}>
        {rows.length === 0 ? <Empty>No log entries match the current filters.</Empty> : (
          <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed"
               style={{ color: "var(--text-default)" }}>
            {rows.map((r) => (
              <div key={r.id} className="border-b py-1" style={{ borderColor: "var(--border-subtle)" }}>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{timeHHMMSS(r.timestamp)}</span>
                {" "}
                <span style={{ color: SEVERITY_TONE[r.severity].fg, fontWeight: 600 }}>
                  [{SEVERITY_LABEL[r.severity].toUpperCase()}]
                </span>
                {" "}
                <span style={{ color: "var(--text-default)" }}>{r.service}</span>
                {r.traceId && <span style={{ color: "var(--text-muted)" }}>{" "}trace={r.traceId.slice(0, 12)}</span>}
                {r.tenantId && <span style={{ color: "var(--text-muted)" }}>{" "}tenant={r.tenantId.slice(0, 12)}</span>}
                {"  "}
                <span style={{ color: "var(--text-default)" }}>{r.message}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </section>
  );
}

/* ── Search ────────────────────────────────────────────── */

function SearchTab({
  rows, services, histogram, facets, savedQueries,
  search, severityFilter, serviceFilter, canManage,
}: {
  rows: Awaited<ReturnType<typeof loadRecentLogs>>;
  services: string[];
  histogram: Awaited<ReturnType<typeof loadLogHistogram>>;
  facets: Awaited<ReturnType<typeof loadLogsPage>>["facets"];
  savedQueries: Awaited<ReturnType<typeof loadLogsPage>>["savedQueries"];
  search: string;
  severityFilter?: LogSeverity;
  serviceFilter?: string;
  canManage: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
      {/* Main: query bar + histogram + table */}
      <div className="space-y-4">
        <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <form className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <input type="hidden" name="tab" value="search" />
            <input name="search" placeholder='Lucene-style: severity:ERROR AND service:"api" AND message:"timeout"'
                   defaultValue={search}
                   className="min-w-0 flex-1 rounded-md border px-3 py-1.5 font-mono text-[11px]"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            <select name="severity" defaultValue={severityFilter ?? ""}
                    className="rounded-md border px-2 py-1.5 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All levels</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
            <select name="service" defaultValue={serviceFilter ?? ""}
                    className="rounded-md border px-2 py-1.5 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="submit"
                    className="rounded-md px-3 py-1.5 text-[11px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Search
            </button>
          </form>
          {/* Histogram */}
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <Histogram buckets={histogram} />
          </div>
          {/* Results */}
          <div className="overflow-y-auto p-3" style={{ maxHeight: "620px" }}>
            {rows.length === 0 ? <Empty>No log entries match the query.</Empty> : (
              <table className="w-full">
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <Th>Time</Th><Th>Sev</Th><Th>Service</Th><Th>Trace</Th><Th>Message</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                      <Td><span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{timeHHMMSS(r.timestamp)}</span></Td>
                      <Td><Pill tone={SEVERITY_TONE[r.severity]} label={SEVERITY_LABEL[r.severity]} /></Td>
                      <Td><code className="text-[11px]" style={{ color: "var(--text-default)" }}>{r.service}</code></Td>
                      <Td><code className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.traceId?.slice(0, 12) ?? "—"}</code></Td>
                      <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{r.message}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        {canManage && (
          <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Save this query</h3>
            </header>
            <form action={saveSavedQuery} className="grid grid-cols-2 gap-2 p-4 md:grid-cols-3">
              <Input name="name" label="Query name" defaultValue="" />
              <Input name="team" label="Team" defaultValue="" />
              <Input name="description" label="Description" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Query</span>
                <input name="query" defaultValue={search}
                       className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="pinned" /> Pin to top
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit"
                        className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save query
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      {/* Sidebar: facets + pinned queries */}
      <aside className="space-y-4">
        <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <header className="border-b px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Facets · last 24h</h3>
          </header>
          <div className="space-y-3 p-3">
            {facets.map((f) => (
              <div key={f.field}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {f.field}
                </div>
                <ul className="space-y-1 text-[11px]">
                  {f.values.length === 0 ? (
                    <li style={{ color: "var(--text-muted)" }}>—</li>
                  ) : f.values.map((v) => (
                    <li key={v.value} className="flex items-center justify-between gap-2">
                      <a href={`?tab=search&${f.field === "severity" ? "severity" : "service"}=${encodeURIComponent(v.value)}`}
                         className="truncate underline"
                         style={{ color: "var(--text-default)" }}>{v.value}</a>
                      <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{v.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <header className="border-b px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Pinned queries</h3>
          </header>
          <ul className="space-y-1 p-3 text-[11px]">
            {savedQueries.filter((q) => q.pinned).length === 0 ? (
              <li style={{ color: "var(--text-muted)" }}>No pinned queries.</li>
            ) : savedQueries.filter((q) => q.pinned).map((q) => (
              <li key={q.id}>
                <a href={`?tab=search&search=${encodeURIComponent(q.query)}`}
                   className="font-medium underline"
                   style={{ color: "var(--text-default)" }}>{q.name}</a>
                {q.description && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{q.description}</div>}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </section>
  );
}

/* ── Errors tab ────────────────────────────────────────── */

function ErrorsTab({
  issues, selectedIssue, search, status, project, assignee, canResolve,
}: {
  issues: Awaited<ReturnType<typeof loadIssues>>;
  selectedIssue: Awaited<ReturnType<typeof loadIssueDetail>>;
  search: string;
  status?: LogIssueStatus;
  project?: string;
  assignee?: string;
  canResolve: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[440px_1fr]">
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <form className="border-b p-3" style={{ borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="tab" value="errors" />
          <input name="search" placeholder="Search title / message / type…" defaultValue={search}
                 className="mb-2 w-full rounded-md border px-2 py-1.5 text-[12px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select name="status" defaultValue={status ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{ISSUE_STATUS_TONE[s].label}</option>)}
            </select>
            <Input name="project" label="" defaultValue={project ?? ""} />
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <Input name="assignee" label="" defaultValue={assignee ?? ""} />
            <button type="submit"
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Filter
            </button>
          </div>
        </form>
        <ul className="max-h-[680px] overflow-y-auto">
          {issues.length === 0 ? (
            <li className="p-5 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              No issues match the current filters.
            </li>
          ) : issues.map((i) => {
            const active = selectedIssue && selectedIssue.id === i.id;
            return (
              <li key={i.id}>
                <a href={`?tab=errors&id=${encodeURIComponent(i.id)}`}
                   className="block border-b px-3 py-2 transition hover:bg-[var(--surface-2)]"
                   style={{
                     borderColor: "var(--border-subtle)",
                     background: active ? "var(--accent-surface)" : "transparent",
                   }}>
                  <div className="flex items-center justify-between gap-2">
                    <code className="truncate text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{i.errorType}</code>
                    <Pill tone={ISSUE_STATUS_TONE[i.status]} label={ISSUE_STATUS_TONE[i.status].label} />
                  </div>
                  <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{i.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <span>{i.project}</span>
                    <span>·</span>
                    <span>{i.env}</span>
                    <span>·</span>
                    <span>{i.eventCount.toLocaleString()} events</span>
                    <span>·</span>
                    <span>{i.usersAffected} users · {i.tenantsAffected} tenants</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <span>{i.assigneeEmail ?? "unassigned"}</span>
                    <span>·</span>
                    <span>last {relativeFromNow(i.lastSeenAt)}</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <div>
        {selectedIssue
          ? <IssueDetail issue={selectedIssue} canResolve={canResolve} />
          : <EmptyDetail count={issues.length} />}
      </div>
    </section>
  );
}

function EmptyDetail({ count }: { count: number }) {
  return (
    <section className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Pick an issue</h3>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {count === 0
          ? "No issues match the current filters."
          : "Select an issue from the left to inspect stacktrace, breadcrumbs, and recent occurrences."}
      </p>
    </section>
  );
}

function IssueDetail({
  issue, canResolve,
}: {
  issue: NonNullable<Awaited<ReturnType<typeof loadIssueDetail>>>;
  canResolve: boolean;
}) {
  return (
    <article className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="flex flex-wrap items-start gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{issue.errorType}</code>
            <Pill tone={ISSUE_STATUS_TONE[issue.status]} label={ISSUE_STATUS_TONE[issue.status].label} />
            {issue.tags.includes("critical") && (
              <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label="Critical" />
            )}
          </div>
          <h2 className="mt-0.5 text-[15px] font-semibold" style={{ color: "var(--text-default)" }}>{issue.title}</h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{issue.message}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Project: <strong style={{ color: "var(--text-default)" }}>{issue.project}</strong></span>
            <span>·</span>
            <span>Env: <strong style={{ color: "var(--text-default)" }}>{issue.env}</strong></span>
            <span>·</span>
            <span>{issue.eventCount.toLocaleString()} events</span>
            <span>·</span>
            <span>{issue.usersAffected} users · {issue.tenantsAffected} tenants</span>
            <span>·</span>
            <span>First {relativeFromNow(issue.firstSeenAt)}</span>
            <span>·</span>
            <span>Last {relativeFromNow(issue.lastSeenAt)}</span>
            {issue.release && (<><span>·</span><span>Release {issue.release}</span></>)}
          </div>
          {issue.linearUrl && (
            <div className="mt-1 text-[11px]">
              <a href={issue.linearUrl} target="_blank" rel="noreferrer noopener"
                 className="underline"
                 style={{ color: "var(--accent-default)" }}>
                Linked Linear issue ↗
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Quick actions */}
      {canResolve && (
        <section className="grid grid-cols-1 gap-3 border-b p-5 md:grid-cols-2" style={{ borderColor: "var(--border-subtle)" }}>
          {issue.status === "UNRESOLVED" && (
            <form action={resolveIssue} className="rounded-lg border p-3"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <input type="hidden" name="id" value={issue.id} />
              <h4 className="mb-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Mark resolved</h4>
              <input name="note" placeholder="Optional note (deploy SHA, fix summary…)"
                     className="mb-2 w-full rounded-md border px-2 py-1 text-[11px]"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              <button type="submit"
                      className="w-full rounded-md px-2 py-1 text-[11px] font-semibold"
                      style={{ background: "var(--emerald-600)", color: "white" }}>
                Resolve
              </button>
            </form>
          )}
          {issue.status !== "UNRESOLVED" && (
            <form action={reopenIssue} className="rounded-lg border p-3"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <input type="hidden" name="id" value={issue.id} />
              <h4 className="mb-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Reopen</h4>
              <p className="mb-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                {issue.resolvedByEmail && `Resolved by ${issue.resolvedByEmail} ${relativeFromNow(issue.resolvedAt)}`}
                {issue.resolvedNote && ` — “${issue.resolvedNote}”`}
              </p>
              <button type="submit"
                      className="w-full rounded-md border px-2 py-1 text-[11px] font-semibold"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                Reopen
              </button>
            </form>
          )}
          <form action={ignoreIssue} className="rounded-lg border p-3"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <input type="hidden" name="id" value={issue.id} />
            <h4 className="mb-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Ignore</h4>
            <Select name="ignoreType" label="Ignore strategy" defaultValue={issue.ignoreType}
                    options={IGNORE_TYPES.map((t) => ({ value: t, label: IGNORE_TYPE_LABEL[t] }))} />
            <div className="mt-2 grid grid-cols-3 gap-1">
              <Input name="ignoreUntilVersion" label="Version" defaultValue={issue.ignoreUntilVersion ?? ""} />
              <Input name="ignoreUntilEvents"  label="N events" type="number" defaultValue={String(issue.ignoreUntilEvents ?? 100)} />
              <Input name="ignoreUntilDays"    label="N days"   type="number" defaultValue="7" />
            </div>
            <button type="submit"
                    className="mt-2 w-full rounded-md border px-2 py-1 text-[11px] font-semibold"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              Save ignore
            </button>
          </form>
          <form action={assignIssue} className="rounded-lg border p-3"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <input type="hidden" name="id" value={issue.id} />
            <h4 className="mb-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Assign</h4>
            <input name="email" type="email" defaultValue={issue.assigneeEmail ?? ""}
                   placeholder="dev@flowtora.com"
                   className="mb-2 w-full rounded-md border px-2 py-1 text-[11px]"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            <button type="submit"
                    className="w-full rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Assign
            </button>
          </form>
          <form action={linkIssueToLinear} className="rounded-lg border p-3 md:col-span-2"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <input type="hidden" name="id" value={issue.id} />
            <h4 className="mb-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Link to Linear</h4>
            <input name="linearUrl" type="url" defaultValue={issue.linearUrl ?? ""}
                   placeholder="https://linear.app/flowtora/issue/ENG-123"
                   className="mb-2 w-full rounded-md border px-2 py-1 text-[11px]"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            <button type="submit"
                    className="rounded-md px-2 py-1 text-[11px] font-semibold"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save link
            </button>
          </form>
        </section>
      )}

      {/* Stacktrace */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Stacktrace</h3>
        {issue.stacktrace
          ? (
            <pre className="m-0 max-h-72 overflow-y-auto rounded-md p-3 font-mono text-[11px]"
                 style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
              {issue.stacktrace}
            </pre>
          )
          : <Empty>No stacktrace captured.</Empty>}
      </section>

      {/* Recent occurrences */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recent occurrences <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>({issue.occurrences.length})</span>
        </h3>
        {issue.occurrences.length === 0
          ? <Empty>No recent occurrences logged.</Empty>
          : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Time</Th><Th>Env</Th><Th>Browser</Th><Th>Device</Th><Th>Region</Th><Th>Release</Th>
                </tr>
              </thead>
              <tbody>
                {issue.occurrences.map((o) => (
                  <tr key={o.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{relativeFromNow(o.timestamp)}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{o.env}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{o.browser ?? "—"}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{o.device ?? "—"}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{o.region ?? "—"}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{o.release ?? "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </section>

      {/* Tags */}
      {issue.tags.length > 0 && (
        <section className="px-5 py-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Tags: {issue.tags.map((t) => (
            <span key={t} className="ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]"
                  style={{ background: "var(--surface-2)" }}>{t}</span>
          ))}
        </section>
      )}
    </article>
  );
}

/* ── Saved queries tab ────────────────────────────────── */

function SavedQueriesTab({
  rows, canManage,
}: {
  rows: Awaited<ReturnType<typeof loadLogsPage>>["savedQueries"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Saved queries</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} saved · pinned queries surface in the Search sidebar.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No saved queries yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Query</Th><Th>Team</Th><Th>Owner</Th><Th>Updated</Th><Th>Notify</Th>
                {canManage && <Th right>Delete</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="flex items-center gap-2">
                      {q.pinned && <Pill tone={{ bg: "var(--amber-100)", fg: "var(--amber-700)" }} label="Pinned" />}
                      <a href={`?tab=search&search=${encodeURIComponent(q.query)}`}
                         className="text-[12px] font-semibold underline" style={{ color: "var(--text-default)" }}>{q.name}</a>
                    </div>
                    {q.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{q.description}</div>}
                  </Td>
                  <Td><code className="text-[11px]" style={{ color: "var(--text-default)" }}>{q.query.length > 60 ? q.query.slice(0, 60) + "…" : q.query}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{q.team ?? "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{q.ownerEmail ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(q.updatedAt)}</span></Td>
                  <Td>
                    {q.notifyChannel
                      ? <span className="text-[11px]" style={{ color: "var(--text-default)" }}>{ALERT_CHANNEL_LABEL[q.notifyChannel]} → {q.notifyTarget}</span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteSavedQuery}>
                        <input type="hidden" name="id" value={q.id} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>Delete</button>
                      </form>
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
              + Save query
            </summary>
            <form action={saveSavedQuery} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Name" defaultValue="" />
              <Input name="team" label="Team" defaultValue="" />
              <Input name="description" label="Description" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Query</span>
                <input name="query" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <Select name="notifyChannel" label="Notify channel (optional)" defaultValue=""
                      options={[{ value: "", label: "—" }, ...CHANNELS.map((c) => ({ value: c, label: ALERT_CHANNEL_LABEL[c] }))]} />
              <Input name="notifyTarget" label="Notify target" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="pinned" /> Pin
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit"
                        className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save query
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Alerts tab ────────────────────────────────────────── */

function AlertsTab({
  rows, canManage,
}: {
  rows: Awaited<ReturnType<typeof loadLogsPage>>["alerts"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Log alerts</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} alerts · routes to Slack / PagerDuty / Email / Webhook.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No alerts configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Condition</Th><Th>Threshold</Th><Th>Channel</Th><Th>Status</Th><Th>Last fired</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{a.name}</div>
                    {a.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{a.description}</div>}
                  </Td>
                  <Td>
                    <div className="text-[11px]" style={{ color: "var(--text-default)" }}>
                      {a.service ?? "any service"}{a.severity && ` · ${SEVERITY_LABEL[a.severity]}`}
                    </div>
                    {a.query && <code className="text-[10px]" style={{ color: "var(--text-muted)" }}>{a.query}</code>}
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{a.threshold} / {a.windowMin}m</span></Td>
                  <Td>
                    <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{ALERT_CHANNEL_LABEL[a.channel]}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{a.channelTarget}</div>
                  </Td>
                  <Td><Pill tone={ALERT_STATUS_TONE[a.status]} label={ALERT_STATUS_TONE[a.status].label} /></Td>
                  <Td>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(a.lastTriggeredAt)}</span>
                    {a.triggerCount24h > 0 && (
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{a.triggerCount24h} fires today</div>
                    )}
                  </Td>
                  {canManage && (
                    <Td right>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {a.status !== "PAUSED" && (
                          <form action={setAlertStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="PAUSED" />
                            <button type="submit" className="text-[10px] underline" style={{ color: "var(--text-muted)" }}>Pause</button>
                          </form>
                        )}
                        {a.status !== "ACTIVE" && (
                          <form action={setAlertStatus}>
                            <input type="hidden" name="id" value={a.id} />
                            <input type="hidden" name="status" value="ACTIVE" />
                            <button type="submit" className="text-[10px] underline" style={{ color: "var(--text-default)" }}>Resume</button>
                          </form>
                        )}
                        <form action={deleteAlert}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="text-[10px] underline" style={{ color: "var(--rose-700)" }}>Delete</button>
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
              + Save alert
            </summary>
            <form action={saveAlert} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Name" defaultValue="" />
              <Input name="service" label="Service (optional)" defaultValue="" />
              <Select name="severity" label="Severity (optional)" defaultValue=""
                      options={[{ value: "", label: "—" }, ...SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))]} />
              <Input name="threshold" type="number" label="Threshold (count)" defaultValue="10" />
              <Input name="windowMin" type="number" label="Window (min)" defaultValue="5" />
              <Select name="channel" label="Channel" defaultValue="SLACK"
                      options={CHANNELS.map((c) => ({ value: c, label: ALERT_CHANNEL_LABEL[c] }))} />
              <Input name="channelTarget" label="Channel target" defaultValue="" />
              <Select name="status" label="Status" defaultValue="ACTIVE"
                      options={ALERT_STATUSES.map((s) => ({ value: s, label: ALERT_STATUS_TONE[s].label }))} />
              <Input name="description" label="Description" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Query (optional)</span>
                <input name="query" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit"
                        className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save alert
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
  settings: Awaited<ReturnType<typeof loadLogsPage>>["settings"];
  canManage: boolean;
}) {
  const s = settings ?? {
    retentionDays: 30,
    sampleRate: 1.0,
    defaultEnv: "PRODUCTION",
    sourcemapsEnabled: true,
    autoGroupErrors: true,
    autoResolveStaleDays: 14,
    notes: null,
  };
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Program settings</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Retention, sampling, grouping, and auto-resolve.</p>
      </header>
      <form action={saveLogSettings} className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
        <Input name="retentionDays"        type="number" label="Retention (days)" defaultValue={String(s.retentionDays)} />
        <Input name="sampleRate"           label="Sample rate (0..1)" defaultValue={String(s.sampleRate)} />
        <Input name="defaultEnv"           label="Default env"        defaultValue={s.defaultEnv} />
        <Input name="autoResolveStaleDays" type="number" label="Auto-resolve stale issues after N days" defaultValue={String(s.autoResolveStaleDays)} />
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="sourcemapsEnabled" defaultChecked={s.sourcemapsEnabled} /> Source maps enabled
        </label>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="autoGroupErrors" defaultChecked={s.autoGroupErrors} /> Auto-group errors
        </label>
        <label className="md:col-span-3 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea name="notes" rows={3} defaultValue={s.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        {canManage && (
          <div className="md:col-span-3 flex justify-end">
            <button type="submit"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save settings
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

/* ── Histogram (SVG) ──────────────────────────────────── */

function Histogram({ buckets }: { buckets: Awaited<ReturnType<typeof loadLogHistogram>> }) {
  if (buckets.length === 0) return null;
  const W = 1100, H = 100, PAD = 4;
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const barW = (W - 2 * PAD) / buckets.length - 2;
  return (
    <div>
      <div className="mb-1 text-[11px]" style={{ color: "var(--text-muted)" }}>Events per hour · last 24h</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {buckets.map((b, i) => {
          const x = PAD + i * (barW + 2);
          const totalH  = (b.total / max) * (H - 2 * PAD);
          const errorH  = (b.errors / max) * (H - 2 * PAD);
          const fatalH  = (b.fatals / max) * (H - 2 * PAD);
          return (
            <g key={b.hour}>
              <rect x={x} y={H - PAD - totalH} width={barW} height={totalH}
                    fill="var(--sky-200)" />
              <rect x={x} y={H - PAD - errorH} width={barW} height={errorH}
                    fill="var(--amber-400)" />
              <rect x={x} y={H - PAD - fatalH} width={barW} height={fatalH}
                    fill="var(--rose-500)" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Reusable UI primitives ────────────────────────────── */

function Kpi({
  label, value, sub, tone = "default",
}: {
  label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette = tone === "good"    ? { fg: "var(--emerald-700)", chip: "var(--emerald-100)" }
                : tone === "warning" ? { fg: "var(--amber-700)",   chip: "var(--amber-100)" }
                : tone === "danger"  ? { fg: "var(--rose-700)",    chip: "var(--rose-100)" }
                :                      { fg: "var(--text-default)", chip: "var(--surface-2)" };
  return (
    <div className="rounded-xl border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
              style={{ background: palette.chip }} />
      </div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: palette.fg }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Pill({ tone, label }: { tone: { bg: string; fg: string }; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}>{label}</span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ textAlign: right ? "right" : "left", color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className="px-2 py-1.5"
        style={{ textAlign: right ? "right" : "left", verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function Input({
  name, label, defaultValue, type = "text",
}: {
  name: string; label: string; defaultValue?: string;
  type?: "text" | "number" | "email" | "url";
}) {
  return (
    <label className="block">
      {label && <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>}
      <input name={name} type={type} defaultValue={defaultValue}
             placeholder={!label ? name : undefined}
             className="w-full rounded-md border px-2 py-1.5 text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
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
      {label && <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>}
      <select name={name} defaultValue={defaultValue}
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>{msg}</span>
  );
}

function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>{msg}</span>
  );
}
