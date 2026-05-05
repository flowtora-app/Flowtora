// Page 37 — Bug Reports list view.
//
// Filter row · KPI strip · "+ New bug" inline form · table.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadBugKpis,
  loadBugList,
  loadBugFilterOptions,
  type BugFilters,
} from "@/server/platform/bugs";
import { createBug } from "@/app/actions/platform-bugs";
import type {
  BugSeverity,
  BugStatus,
  BugEnvironment,
  SupportTicketModule,
} from "@prisma/client";
import {
  FormError,
  FormOk,
  Kpi,
  MODULE_LABEL,
  SEVERITY_DESC,
  STATUS_LABEL,
} from "./_components/shared";
import { BugTable } from "./_components/BugTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const SEVERITIES: BugSeverity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];
const STATUSES: BugStatus[] = ["NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW", "RESOLVED", "RELEASED", "WONT_FIX", "DUPLICATE"];
const ENVS: BugEnvironment[] = ["PRODUCTION", "STAGING", "SANDBOX"];
const MODULES: SupportTicketModule[] = [
  "BILLING", "AUTH", "PROOFS", "ORDERS", "INVOICES", "QUOTES",
  "PRODUCTS", "REPORTS", "INTEGRATIONS", "PORTAL", "EMAIL", "ADMIN", "OTHER",
];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function BugsListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("support.respond");

  const page = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const filters: BugFilters = { currentUserId: ctx.userId };
  const q = asString(sp.q);                          if (q) filters.q = q;
  const severity = asString(sp.severity);            if (severity && (SEVERITIES as string[]).includes(severity)) filters.severity = severity as BugSeverity;
  const status = asString(sp.status);                if (status && (STATUSES as string[]).includes(status)) filters.status = status as BugStatus;
  const moduleParam = asString(sp.module);           if (moduleParam && (MODULES as string[]).includes(moduleParam)) filters.module = moduleParam as SupportTicketModule;
  const environment = asString(sp.environment);      if (environment && (ENVS as string[]).includes(environment)) filters.environment = environment as BugEnvironment;
  const tenantId = asString(sp.tenant);              if (tenantId) filters.reporterTenantId = tenantId;
  const assignee = asString(sp.assignee);            if (assignee) filters.assigneeUserId = assignee;
  const hasSentry = asString(sp.hasSentry);          if (hasSentry === "yes" || hasSentry === "no") filters.hasSentry = hasSentry;
  const tag = asString(sp.tag);                      if (tag) filters.tag = tag;
  const since = parseInt(asString(sp.since) ?? "0", 10) || 0; if (since > 0) filters.sinceDays = since;
  const scope = asString(sp.scope);
  filters.scope = scope === "open" || scope === "closed" || scope === "mine" ? scope : "open";

  const [kpis, list, options] = await Promise.all([
    loadBugKpis(),
    loadBugList({ filters, page, pageSize: PAGE_SIZE }),
    loadBugFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (filters.scope !== "open") u.set("scope", filters.scope ?? "");
    if (q) u.set("q", q);
    if (severity) u.set("severity", severity);
    if (status) u.set("status", status);
    if (moduleParam) u.set("module", moduleParam);
    if (environment) u.set("environment", environment);
    if (tenantId) u.set("tenant", tenantId);
    if (assignee) u.set("assignee", assignee);
    if (hasSentry) u.set("hasSentry", hasSentry);
    if (tag) u.set("tag", tag);
    if (since) u.set("since", String(since));
    if (page > 1) u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/operations/bugs?${qs}` : "/platform/operations/bugs";
  };
  const hasFiltersApplied = !!(q || severity || status || moduleParam || environment || tenantId || assignee || hasSentry || tag || since);

  const sentrySync = kpis.lastSentrySync
    ? `Synced ${relativeFromNowRough(kpis.lastSentrySync)}`
    : "Not synced yet";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Operations
          </div>
          <h1
            className="mt-1 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            Bug reports
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Engineering bug tracker integrated with Sentry, Linear, Jira, and the support inbox.{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.open.toLocaleString()}</b> open ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.sev1 + kpis.sev2}</b> SEV1/SEV2.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
            title={`Last successful Sentry sync across any bug${kpis.lastSentrySync ? ` — ${kpis.lastSentrySync.toISOString()}` : ""}`}
          >
            📡 Sentry · {sentrySync}
          </span>
          <span
            className="rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
            title="Linear/Jira link-out is per-bug — see the Linked tab on each report."
          >
            ↗ Linear · Jira
          </span>
        </div>
      </div>

      <FormOk msg={ok} />
      <FormError msg={error} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
        <Kpi label="Open" value={kpis.open.toLocaleString()} tone={kpis.open > 0 ? "warning" : "default"} />
        <Kpi label="SEV1" value={kpis.sev1.toLocaleString()} tone={kpis.sev1 > 0 ? "danger" : "good"} />
        <Kpi label="SEV2" value={kpis.sev2.toLocaleString()} tone={kpis.sev2 > 0 ? "warning" : "default"} />
        <Kpi label="In progress" value={kpis.inProgress.toLocaleString()} />
        <Kpi
          label="Avg triage time · 30d"
          value={kpis.avgTimeToTriageHrs == null ? "—" : `${kpis.avgTimeToTriageHrs.toFixed(1)}h`}
          tone={kpis.avgTimeToTriageHrs == null ? "default" : kpis.avgTimeToTriageHrs <= 4 ? "good" : kpis.avgTimeToTriageHrs <= 24 ? "warning" : "danger"}
        />
        <Kpi
          label="Avg resolve time · 30d"
          value={kpis.avgTimeToResolveHrs == null ? "—" : `${kpis.avgTimeToResolveHrs.toFixed(1)}h`}
        />
        <Kpi
          label="Resolved/released · 7d"
          value={`${kpis.resolvedThisWeek}/${kpis.releasedThisWeek}`}
          sub={`Intake: ${kpis.intake7d}`}
          tone={kpis.resolvedThisWeek >= kpis.intake7d ? "good" : "default"}
        />
      </div>

      {/* Scope chips */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {[
          { key: "open" as const,   label: "Open" },
          { key: "mine" as const,   label: "Assigned to me" },
          { key: "closed" as const, label: "Closed" },
          { key: "all" as const,    label: "All" },
        ].map((s) => {
          const selected = filters.scope === s.key;
          return (
            <Link
              key={s.key}
              href={buildHref({ scope: s.key === "open" ? undefined : s.key, page: undefined })}
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{
                background: selected ? "var(--surface-2)" : "transparent",
                color: selected ? "var(--text-default)" : "var(--text-muted)",
              }}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* Filter row */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        {filters.scope !== "open" && <input type="hidden" name="scope" value={filters.scope ?? ""} />}
        <Field label="Search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Title, body, repro, Sentry id…"
            className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Severity">
          <Select name="severity" defaultValue={severity ?? ""}>
            <option value="">Any</option>
            {SEVERITIES.map((s) => <option key={s} value={s} title={SEVERITY_DESC[s]}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Module">
          <Select name="module" defaultValue={moduleParam ?? ""}>
            <option value="">Any</option>
            {MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Environment">
          <Select name="environment" defaultValue={environment ?? ""}>
            <option value="">Any</option>
            {ENVS.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
        </Field>
        <Field label="Tenant">
          <Select name="tenant" defaultValue={tenantId ?? ""}>
            <option value="">Any</option>
            {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select name="assignee" defaultValue={assignee ?? ""}>
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {options.staff.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </Select>
        </Field>
        <Field label="Sentry link">
          <Select name="hasSentry" defaultValue={hasSentry ?? ""}>
            <option value="">Any</option>
            <option value="yes">Linked</option>
            <option value="no">Unlinked</option>
          </Select>
        </Field>
        <Field label="Tag">
          <Select name="tag" defaultValue={tag ?? ""}>
            <option value="">Any</option>
            {options.tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Since (days)">
          <input
            type="number"
            name="since"
            defaultValue={since || ""}
            min={0}
            max={365}
            className="ts-focus w-[80px] rounded-md px-2 py-1.5 text-[12px] tabular-nums outline-none"
            style={inputStyle()}
          />
        </Field>
        <button
          type="submit"
          className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {hasFiltersApplied && (
          <a
            href="/platform/operations/bugs"
            className="self-center text-[11px] underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </a>
        )}
      </form>

      {/* + New bug */}
      {canWrite && (
        <form
          action={createBug}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <Field label="New bug — title">
            <input
              name="title"
              required
              placeholder="e.g. Stripe webhooks 4xx after upgrade"
              className="ts-focus w-[300px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Severity">
            <Select name="severity" defaultValue="SEV3">
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Module">
            <Select name="module" defaultValue="OTHER">
              {MODULES.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
            </Select>
          </Field>
          <Field label="Environment">
            <Select name="environment" defaultValue="PRODUCTION">
              {ENVS.map((e) => <option key={e} value={e}>{e}</option>)}
            </Select>
          </Field>
          <Field label="Tenant (optional)">
            <Select name="reporterTenantId" defaultValue="">
              <option value="">— None —</option>
              {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + Create
          </button>
        </form>
      )}

      <BugTable rows={list.rows} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
            {list.filteredTotal.toLocaleString()} bug{list.filteredTotal === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={page > 1 ? buildHref({ page: String(page - 1) }) : null}>‹ Prev</PageLink>
            <PageLink href={page < totalPages ? buildHref({ page: String(page + 1) }) : null}>Next ›</PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function relativeFromNowRough(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  name, defaultValue, children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={inputStyle()}
    >
      {children}
    </select>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span
        className="rounded-md px-2 py-1"
        style={{
          color: "var(--text-faint)",
          border: "1px solid var(--border-subtle)",
          opacity: 0.5,
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="ts-focus rounded-md px-2 py-1"
      style={{ color: "var(--text-default)", border: "1px solid var(--border-default)" }}
    >
      {children}
    </Link>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
