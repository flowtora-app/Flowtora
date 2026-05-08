// Page 54 — Incident Log (list).
//
// KPI strip + 6 tabs:
//   Active · Resolved · Postmortems · Status Page · Runbooks · On-Call.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadIncidentsPage,
  SEVERITY_TONE,
  STATUS_TONE,
  COMPONENT_STATUS_TONE,
  MAINT_STATE_TONE,
  RUNBOOK_STATUS_TONE,
  formatDuration,
  relativeFromNow,
  shortDateTime,
  type IncidentTab,
  type IncidentFilters,
  type IncidentRow,
} from "@/server/platform/incidents";
import {
  declareIncident,
  saveStatusPageComponent,
  saveMaintenance,
  saveRunbook,
  createOnCallOverride,
} from "@/app/actions/platform-incidents";
import {
  Kpi, SeverityPill, StatusPill, ComponentStatusPill, MaintStatePill, RunbookStatusPill,
  DetectedByChip, FormError, FormOk,
} from "./_shared";
import type {
  IncidentSeverity, IncidentStatus, StatusPageComponentStatus,
  StatusPageMaintenanceState, RunbookStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS: IncidentTab[] = ["active", "resolved", "postmortems", "status_page", "runbooks", "on_call"];
const TAB_LABEL: Record<IncidentTab, string> = {
  active:       "Active",
  resolved:     "Resolved",
  postmortems:  "Postmortems",
  status_page:  "Status page",
  runbooks:     "Runbooks",
  on_call:      "On-call",
};

const SEVERITIES: IncidentSeverity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];
const STATUSES: IncidentStatus[] = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"];
const COMPONENT_STATUSES: StatusPageComponentStatus[] = ["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"];
const MAINT_STATES: StatusPageMaintenanceState[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const RUNBOOK_STATUSES: RunbookStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

export default async function IncidentsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("incidents.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view the Incident Log.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("incidents.manage");
  const canSp     = ctx.can("incidents.statuspage.write");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as IncidentTab | undefined;
  const tab: IncidentTab = tabRaw && TABS.includes(tabRaw) ? tabRaw : "active";

  const filters: IncidentFilters = {
    q:        asString(sp.q),
    severity: (asString(sp.severity) as IncidentSeverity | "ALL" | undefined) ?? "ALL",
    status:   (asString(sp.status)   as IncidentStatus   | "ALL" | undefined) ?? "ALL",
    service:  asString(sp.service),
    assigneeId: asString(sp.assignee),
    postmortemDue: asString(sp.postmortemDue) === "1",
  };

  const data = await loadIncidentsPage(tab, filters);
  const { kpis, list, statusPage, runbooks, onCall, staff } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Incident Log</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Active incidents · postmortem queue · status page · runbooks · on-call.
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
          label="Open incidents"
          value={String(kpis.openCount)}
          sub={kpis.openBySev.filter((b) => b.count > 0).map((b) => `${b.count} ${SEVERITY_TONE[b.sev].label}`).join(" · ") || "all clear"}
          tone={kpis.openCount === 0 ? "good" : kpis.openBySev.find((b) => b.sev === "SEV1" && b.count > 0) ? "danger" : "warning"}
        />
        <Kpi
          label="MTTR (30d)"
          value={kpis.mttr30dMinutes != null ? formatDuration(kpis.mttr30dMinutes) : "—"}
          sub="Mean time to recover"
        />
        <Kpi
          label="MTTD (30d)"
          value={kpis.mttd30dMinutes != null ? formatDuration(kpis.mttd30dMinutes) : "—"}
          sub="Mean time to detect"
        />
        <Kpi
          label="Incidents (90d)"
          value={String(kpis.count90d)}
          sub="Last 90 days"
        />
      </section>

      {/* Sparkline */}
      <Sparkline rows={kpis.byDay90d} />

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

      {(tab === "active" || tab === "resolved" || tab === "postmortems") && (
        <IncidentTable rows={list} tab={tab} filters={filters} canManage={canManage} />
      )}
      {tab === "status_page" && <StatusPageTab data={statusPage} canSp={canSp} />}
      {tab === "runbooks"    && <RunbooksTab rows={runbooks} canManage={canManage} />}
      {tab === "on_call"     && <OnCallTab data={onCall} staff={staff} canManage={canManage} />}
    </main>
  );
}

/* ── Sparkline ──────────────────────────────────────────── */

function Sparkline({ rows }: { rows: { day: string; sev1: number; sev2: number; sev3: number; sev4: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sev1 + r.sev2 + r.sev3 + r.sev4));
  return (
    <section className="mb-5 rounded-xl border p-4"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Last 90 days · daily by severity</h3>
        <div className="flex gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <Legend swatch="var(--rose-500)" label="SEV1" />
          <Legend swatch="var(--amber-500)" label="SEV2" />
          <Legend swatch="var(--sky-500)" label="SEV3" />
          <Legend swatch="var(--surface-3, var(--text-muted))" label="SEV4" />
        </div>
      </div>
      <div className="flex h-16 items-end gap-[2px]">
        {rows.map((r, i) => {
          const total = r.sev1 + r.sev2 + r.sev3 + r.sev4;
          const heightPct = (total / max) * 100;
          return (
            <div key={i} className="flex flex-1 flex-col-reverse"
                 title={`${r.day}: ${total} total`}
                 style={{ height: `${heightPct}%` }}>
              {r.sev1 > 0 && <div style={{ flex: r.sev1, background: "var(--rose-500)" }} />}
              {r.sev2 > 0 && <div style={{ flex: r.sev2, background: "var(--amber-500)" }} />}
              {r.sev3 > 0 && <div style={{ flex: r.sev3, background: "var(--sky-500)" }} />}
              {r.sev4 > 0 && <div style={{ flex: r.sev4, background: "var(--text-muted)" }} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}

/* ── Incident table ─────────────────────────────────────── */

function IncidentTable({
  rows, tab, filters, canManage,
}: {
  rows: IncidentRow[];
  tab: IncidentTab;
  filters: IncidentFilters;
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          {tab === "active" ? "Active incidents" : tab === "resolved" ? "Resolved incidents" : "Postmortem queue"}
        </h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} rows</p>
      </header>

      <form className="grid grid-cols-2 gap-2 px-4 pt-4 md:grid-cols-5" method="get">
        <input type="hidden" name="tab" value={tab} />
        <Input name="q" label="Search" defaultValue={filters.q ?? ""} />
        <Select name="severity" label="Severity" defaultValue={filters.severity as string ?? "ALL"}
                options={[{ value: "ALL", label: "All severities" }, ...SEVERITIES.map((s) => ({ value: s, label: s }))]} />
        <Select name="status" label="Status" defaultValue={filters.status as string ?? "ALL"}
                options={[{ value: "ALL", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_TONE[s].label }))]} />
        <Input name="service" label="Service" defaultValue={filters.service ?? ""} />
        <Select name="postmortemDue" label="Postmortem" defaultValue={filters.postmortemDue ? "1" : "0"}
                options={[
                  { value: "0", label: "Any" },
                  { value: "1", label: "Postmortem due only" },
                ]} />
        <div className="md:col-span-5 flex justify-end gap-2">
          <a href={`?tab=${tab}`} className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
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
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center text-[12px]"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
            No incidents match this view.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Incident</Th><Th>Title</Th><Th>SEV</Th><Th>Status</Th>
                <Th>Started</Th><Th>Detected by</Th><Th>Commander</Th>
                <Th>Services</Th><Th>Tenants</Th><Th>Duration</Th><Th>Postmortem</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <Link href={`/platform/security/incidents/${r.id}`}
                          className="text-[12px] font-semibold underline tabular-nums"
                          style={{ color: "var(--accent-default)" }}>
                      {r.externalId}
                    </Link>
                  </Td>
                  <Td>
                    <div className="text-[12px]" style={{ color: "var(--text-default)" }}>{r.title}</div>
                  </Td>
                  <Td><SeverityPill severity={r.severity} /></Td>
                  <Td><StatusPill status={r.status} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.startedAt)}</span></Td>
                  <Td><DetectedByChip d={r.detectedBy} /></Td>
                  <Td>
                    <span className="text-[11px]" style={{ color: "var(--text-default)" }}>
                      {r.commanderEmail ?? r.commanderName ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {r.services.length === 0
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                        : r.services.slice(0, 3).map((s) => (
                          <span key={s} className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                            {s}
                          </span>
                        ))}
                      {r.services.length > 3 && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>+{r.services.length - 3}</span>
                      )}
                    </div>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.affectedTenantsCount}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{formatDuration(r.durationMin)}</span></Td>
                  <Td>
                    {r.postmortemPublishedAt ? (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>
                        Published
                      </span>
                    ) : r.hasPostmortem ? (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "var(--amber-100)", color: "var(--amber-700)" }}>
                        Draft
                      </span>
                    ) : r.postmortemDueAt ? (
                      <span className="text-[11px]"
                            style={{ color: r.postmortemDueAt < new Date() ? "var(--rose-700)" : "var(--text-muted)" }}>
                        due {relativeFromNow(r.postmortemDueAt)}
                      </span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canManage && tab === "active" && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Declare new incident
            </summary>
            <form action={declareIncident} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="title" label="Title" defaultValue="" required />
              <Select name="severity" label="Severity"
                      options={SEVERITIES.map((s) => ({ value: s, label: s }))} />
              <Select name="detectedBy" label="Detected by"
                      options={[
                        { value: "ALERT", label: "Alert" },
                        { value: "CUSTOMER_REPORT", label: "Customer report" },
                        { value: "INTERNAL", label: "Internal" },
                        { value: "SYNTHETIC_CHECK", label: "Synthetic check" },
                        { value: "MANUAL", label: "Manual" },
                        { value: "PARTNER", label: "Partner" },
                        { value: "SECURITY_FEED", label: "Security feed" },
                      ]} />
              <Input name="services" label="Services (comma-separated)" defaultValue="" />
              <Input name="tags" label="Tags (comma-separated)" defaultValue="" />
              <Input name="startedAt" label="Started at (optional)" type="datetime-local" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Summary</span>
                <textarea name="summary" rows={3} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--rose-600, var(--rose-500))", color: "white" }}>
                  Declare incident
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Status page tab ───────────────────────────────────── */

function StatusPageTab({
  data, canSp,
}: {
  data: { components: { id: string; slug: string; name: string; description: string | null; position: number; status: StatusPageComponentStatus; publiclyListed: boolean; subscribers: number; region: string | null }[]; maintenance: { id: string; title: string; body: string; startsAt: Date; endsAt: Date; state: StatusPageMaintenanceState; componentSlugs: string[]; notifiedCount: number }[] };
  canSp: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Public components</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{data.components.length} components</p>
        </header>
        <div className="overflow-x-auto p-4">
          {data.components.length === 0 ? (
            <Empty>No components configured.</Empty>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Slug</Th><Th>Name</Th><Th>Status</Th><Th>Public</Th><Th>Subs</Th><Th>Region</Th>
                </tr>
              </thead>
              <tbody>
                {data.components.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.slug}</code></Td>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{c.name}</div>
                      {c.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.description}</div>}
                    </Td>
                    <Td><ComponentStatusPill status={c.status} /></Td>
                    <Td>
                      {c.publiclyListed ? (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Public</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Internal</span>
                      )}
                    </Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{c.subscribers.toLocaleString()}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.region ?? "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canSp && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Save component
              </summary>
              <form action={saveStatusPageComponent} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                <Input name="slug" label="Slug" defaultValue="" required />
                <Input name="name" label="Name" defaultValue="" required />
                <Input name="position" label="Position" type="number" defaultValue="0" />
                <Select name="status" label="Status"
                        options={COMPONENT_STATUSES.map((s) => ({ value: s, label: COMPONENT_STATUS_TONE[s].label }))} />
                <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                  <input type="checkbox" name="publiclyListed" defaultChecked /> Public
                </label>
                <Input name="region" label="Region" defaultValue="" />
                <label className="md:col-span-3 block">
                  <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                  <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                </label>
                <div className="md:col-span-3 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save component
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>

      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Maintenance windows</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{data.maintenance.length} entries</p>
        </header>
        <div className="space-y-2 p-4">
          {data.maintenance.length === 0 ? (
            <Empty>No maintenance windows scheduled.</Empty>
          ) : (
            data.maintenance.map((m) => (
              <div key={m.id} className="rounded-md border px-3 py-2"
                   style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{m.title}</span>
                  <MaintStatePill state={m.state} />
                </div>
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {shortDateTime(m.startsAt)} → {shortDateTime(m.endsAt)} · {m.componentSlugs.join(", ") || "all"} · {m.notifiedCount} notified
                </div>
                <div className="mt-1 line-clamp-2 text-[12px]" style={{ color: "var(--text-default)" }}>{m.body}</div>
              </div>
            ))
          )}
        </div>
        {canSp && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Schedule maintenance window
              </summary>
              <form action={saveMaintenance} className="mt-3 grid grid-cols-2 gap-2">
                <Input name="title" label="Title" defaultValue="" required />
                <Select name="state" label="State"
                        options={MAINT_STATES.map((s) => ({ value: s, label: MAINT_STATE_TONE[s].label }))} />
                <Input name="startsAt" label="Starts" type="datetime-local"
                       defaultValue={new Date().toISOString().slice(0, 16)} required />
                <Input name="endsAt" label="Ends" type="datetime-local"
                       defaultValue={new Date(Date.now() + 3_600_000).toISOString().slice(0, 16)} required />
                <Input name="componentSlugs" label="Components (comma-separated slugs)" defaultValue="" />
                <label className="col-span-2 block">
                  <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Body (Markdown)</span>
                  <textarea name="body" rows={3} className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                </label>
                <div className="col-span-2 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save window
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Runbooks tab ──────────────────────────────────────── */

function RunbooksTab({
  rows, canManage,
}: {
  rows: { id: string; slug: string; title: string; description: string | null; status: RunbookStatus; service: string | null; tags: string[]; ownerEmail: string | null; nextReviewAt: Date | null; openedCount: number; lastReviewedAt: Date | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Runbooks</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} runbooks</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No runbooks yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Slug</Th><Th>Title</Th><Th>Service</Th><Th>Status</Th><Th>Owner</Th>
                <Th>Last reviewed</Th><Th>Next review</Th><Th>Opens</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rb) => (
                <tr key={rb.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{rb.slug}</code></Td>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{rb.title}</div>
                    {rb.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rb.description}</div>}
                    {rb.tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {rb.tags.map((t) => (
                          <span key={t} className="inline-flex items-center rounded-md px-1 py-0.5 text-[10px]"
                                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rb.service ?? "—"}</span></Td>
                  <Td><RunbookStatusPill status={rb.status} /></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rb.ownerEmail ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(rb.lastReviewedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(rb.nextReviewAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{rb.openedCount}</span></Td>
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
              + Save runbook
            </summary>
            <form action={saveRunbook} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="slug" label="Slug" defaultValue="" required />
              <Input name="title" label="Title" defaultValue="" required />
              <Select name="status" label="Status"
                      options={RUNBOOK_STATUSES.map((s) => ({ value: s, label: s.toLowerCase() }))} />
              <Input name="service" label="Service" defaultValue="" />
              <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" />
              <Input name="tags" label="Tags (comma-separated)" defaultValue="" />
              <Input name="nextReviewAt" label="Next review (YYYY-MM-DD)" type="date" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Body (Markdown)</span>
                <textarea name="body" rows={6} className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save runbook
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── On-call tab ───────────────────────────────────────── */

function OnCallTab({
  data, staff, canManage,
}: {
  data: { shifts: { id: string; level: "PRIMARY" | "SECONDARY" | "TERTIARY"; startsAt: Date; endsAt: Date; isOverride: boolean; notes: string | null; team: { id: string; name: string; key: string; color: string | null }; user: { id: string; email: string | null; name: string | null } }[]; teams: { id: string; name: string; key: string; color: string | null; notifySlack: boolean; notifyPagerDuty: boolean; notifySms: boolean }[] };
  staff: { id: string; email: string | null; name: string | null }[];
  canManage: boolean;
}) {
  // Group shifts by team for display.
  const grouped = new Map<string, typeof data.shifts>();
  for (const sh of data.shifts) {
    if (!grouped.has(sh.team.id)) grouped.set(sh.team.id, []);
    grouped.get(sh.team.id)!.push(sh);
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Active rotations</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {data.shifts.length} upcoming shifts across {grouped.size} teams · primary → secondary → tertiary escalation.
          </p>
        </header>
        <div className="space-y-3 p-4">
          {data.teams.length === 0 ? <Empty>No teams configured.</Empty> : (
            data.teams.map((team) => {
              const list = grouped.get(team.id) ?? [];
              const primaryNow = list.find((s) => s.level === "PRIMARY" && s.startsAt <= new Date() && s.endsAt >= new Date());
              return (
                <div key={team.id} className="rounded-md border px-3 py-2"
                     style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="inline-block h-2 w-2 rounded-sm align-middle"
                            style={{ background: team.color ? `#${team.color}` : "var(--accent-default)" }} />
                      <span className="ml-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{team.name}</span>
                      <span className="ml-2 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{team.key}</span>
                    </div>
                    <div className="flex gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {team.notifyPagerDuty && <span>PagerDuty</span>}
                      {team.notifySlack && <span>Slack</span>}
                      {team.notifySms && <span>SMS</span>}
                    </div>
                  </div>
                  {primaryNow && (
                    <div className="mt-1 text-[11px]" style={{ color: "var(--text-default)" }}>
                      <strong>On-call now:</strong> {primaryNow.user.email ?? primaryNow.user.name ?? "—"}
                    </div>
                  )}
                  {list.length === 0 ? (
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>No upcoming shifts in the next 30 days.</div>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {list.slice(0, 5).map((sh) => (
                        <li key={sh.id} className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          <span className="inline-block w-12 font-semibold" style={{ color: "var(--text-default)" }}>{sh.level}</span>
                          {" "}{sh.user.email ?? sh.user.name ?? "—"}{" "}
                          <span style={{ color: "var(--text-muted)" }}>· {shortDateTime(sh.startsAt)} → {shortDateTime(sh.endsAt)}</span>
                          {sh.isOverride && <span className="ml-1" style={{ color: "var(--amber-700)" }}>(override)</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
      {canManage && (
        <section className="rounded-xl border p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Schedule override</h3>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            One-off swap (vacation cover, illness). Existing rotation resumes after the override window.
          </p>
          <form action={createOnCallOverride} className="mt-3 grid grid-cols-2 gap-2">
            <Select name="teamId" label="Team"
                    options={data.teams.map((t) => ({ value: t.id, label: t.name }))} />
            <Select name="userId" label="Member"
                    options={staff.map((s) => ({ value: s.id, label: s.email ?? s.name ?? s.id }))} />
            <Select name="level" label="Level"
                    options={[
                      { value: "PRIMARY",   label: "Primary" },
                      { value: "SECONDARY", label: "Secondary" },
                      { value: "TERTIARY",  label: "Tertiary" },
                    ]} />
            <div />
            <Input name="startsAt" label="Starts" type="datetime-local"
                   defaultValue={new Date().toISOString().slice(0, 16)} required />
            <Input name="endsAt" label="Ends" type="datetime-local"
                   defaultValue={new Date(Date.now() + 12 * 3_600_000).toISOString().slice(0, 16)} required />
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
              <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <div className="col-span-2 flex justify-end">
              <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Create override
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-3 align-top">{children}</td>;
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
