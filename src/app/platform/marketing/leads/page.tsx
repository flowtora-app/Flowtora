// Page 44 — Lead Inbox (list).
//
// Filterable table of inbound leads with bulk actions. URL-state-driven
// filter row (q, status, source, owner, score range, region, industry,
// tag, created from/to). Bulk actions: Assign, Tag, Disqualify.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadLeadKpis,
  loadLeadInbox,
  loadLeadFilterFacets,
  sourceLabel,
  type LeadInboxRow,
  type LeadKpis,
  type LeadFilterFacets,
  type LeadInboxFilters,
} from "@/server/platform/leads-inbox";
import {
  bulkAssignLeads,
  bulkTagLeads,
  bulkDisqualifyLeads,
} from "@/app/actions/platform-leads-inbox";
import type { MarketingLeadKind, MarketingLeadStatus } from "@prisma/client";
import { Kpi, StatusPill, ScoreBadge, FormError, FormOk, relativeFromNow, Field } from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const asNum = (v: string | string[] | undefined): number | undefined => {
  const s = asString(v);
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
};

const STATUS_OPTIONS: ("ALL" | MarketingLeadStatus)[] = ["ALL", "NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED", "SPAM"];
const SOURCE_OPTIONS: ("ALL" | MarketingLeadKind)[]  = ["ALL", "INQUIRY", "DEMO", "NEWSLETTER", "TRIAL_ABANDON"];

const PAGE_SIZE = 50;

export default async function LeadInboxPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("leads.manage");
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const filters: LeadInboxFilters = {
    q:           asString(sp.q),
    status:      ((asString(sp.status) ?? "ALL") as "ALL" | MarketingLeadStatus),
    source:      ((asString(sp.source) ?? "ALL") as "ALL" | MarketingLeadKind),
    ownerId:     asString(sp.owner) ?? "ALL",
    scoreMin:    asNum(sp.scoreMin),
    scoreMax:    asNum(sp.scoreMax),
    region:      asString(sp.region),
    industry:    asString(sp.industry),
    tag:         asString(sp.tag),
    createdFrom: asString(sp.from) ? new Date(asString(sp.from)!) : undefined,
    createdTo:   asString(sp.to)   ? new Date(asString(sp.to)!)   : undefined,
  };
  const page = Math.max(1, asNum(sp.page) ?? 1);

  const [kpis, list, facets] = await Promise.all([
    loadLeadKpis(30),
    loadLeadInbox(filters, { page, pageSize: PAGE_SIZE, viewerId: ctx.userId }),
    loadLeadFilterFacets(),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="space-y-5">
      <Header />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiStrip kpis={kpis} />

      <FilterRow filters={filters} facets={facets} />

      <BulkActionBar facets={facets} canWrite={canWrite} />

      <Table rows={list.rows} canWrite={canWrite} />

      <Pagination page={page} totalPages={totalPages} total={list.total} pageSize={list.pageSize} />
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────── */

function Header() {
  return (
    <div>
      <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Marketing</div>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Lead inbox
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Inbound leads from contact, demo, newsletter, and trial-signup forms — with scoring,
        ownership, MQL/SQL gates, and per-lead activity timelines.
      </p>
    </div>
  );
}

/* ── KPI strip ──────────────────────────────────────────── */

function KpiStrip({ kpis }: { kpis: LeadKpis }) {
  const mqlSql = kpis.mqlToSqlConvRate;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Leads · period" value={kpis.leadsThisPeriod.toLocaleString()} sub={`Last ${kpis.periodDays}d`} />
      <Kpi label="New · today" value={String(kpis.byStatus.NEW)} sub="Awaiting first touch"
           tone={kpis.byStatus.NEW > 5 ? "warning" : "default"} />
      <Kpi label="Qualified" value={String(kpis.qualified)} sub="QUALIFIED + CONVERTED" tone={kpis.qualified > 0 ? "good" : "default"} />
      <Kpi label="MQL → SQL"
           value={mqlSql == null ? "—" : `${(mqlSql * 100).toFixed(1)}%`}
           sub="90-day conversion"
           tone={mqlSql == null ? "default" : mqlSql >= 0.4 ? "good" : mqlSql >= 0.2 ? "warning" : "danger"} />
      <Kpi label="Avg first touch"
           value={kpis.avgFirstTouchHours == null ? "—" :
                  kpis.avgFirstTouchHours < 1 ? `${Math.round(kpis.avgFirstTouchHours * 60)}m` :
                  `${kpis.avgFirstTouchHours.toFixed(1)}h`}
           sub="Lead → first contact"
           tone={kpis.avgFirstTouchHours == null ? "default" :
                 kpis.avgFirstTouchHours <= 2 ? "good" :
                 kpis.avgFirstTouchHours <= 24 ? "warning" : "danger"} />
      <Kpi label="Unassigned" value={String(kpis.unassigned)} sub="NEW without owner"
           tone={kpis.unassigned > 0 ? "warning" : "good"} />
    </div>
  );
}

/* ── Filter row ─────────────────────────────────────────── */

function FilterRow({ filters, facets }: { filters: LeadInboxFilters; facets: LeadFilterFacets }) {
  return (
    <form className="rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          method="get">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Search">
          <input type="text" name="q" defaultValue={filters.q ?? ""}
                 placeholder="Name, email, or company"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={filters.status ?? "ALL"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "ALL" ? "All statuses" : s.toLowerCase()}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select name="source" defaultValue={filters.source ?? "ALL"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="ALL">All sources</option>
            {SOURCE_OPTIONS.filter((s) => s !== "ALL").map((s) => (
              <option key={s} value={s}>{sourceLabel(s as MarketingLeadKind)}</option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <select name="owner" defaultValue={typeof filters.ownerId === "string" ? filters.ownerId : "ALL"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="ALL">All owners</option>
            <option value="MINE">My leads</option>
            <option value="UNASSIGNED">Unassigned</option>
            {facets.owners.map((o) => (
              <option key={o.id} value={o.id}>{(o.name ?? o.email)} ({o.count})</option>
            ))}
          </select>
        </Field>
        <Field label="Score min">
          <input type="number" name="scoreMin" min={0} max={100}
                 defaultValue={filters.scoreMin ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Score max">
          <input type="number" name="scoreMax" min={0} max={100}
                 defaultValue={filters.scoreMax ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Created from">
          <input type="date" name="from"
                 defaultValue={filters.createdFrom ? filters.createdFrom.toISOString().slice(0, 10) : ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Created to">
          <input type="date" name="to"
                 defaultValue={filters.createdTo ? filters.createdTo.toISOString().slice(0, 10) : ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Region">
          <select name="region" defaultValue={filters.region ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">All regions</option>
            {facets.regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Industry">
          <select name="industry" defaultValue={filters.industry ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">All industries</option>
            {facets.industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Tag">
          <select name="tag" defaultValue={filters.tag ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">All tags</option>
            {facets.tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <div className="flex items-end gap-2 md:col-span-1 lg:col-span-1">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Apply
          </button>
          <Link href="/platform/marketing/leads"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Reset
          </Link>
        </div>
      </div>
    </form>
  );
}

/* ── Bulk action bar ────────────────────────────────────── */

function BulkActionBar({ facets, canWrite }: { facets: LeadFilterFacets; canWrite: boolean }) {
  if (!canWrite) return null;
  return (
    <div className="rounded-lg border p-2 flex flex-wrap items-center gap-2"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Bulk actions:
      </span>

      <form action={bulkAssignLeads} className="flex items-center gap-1">
        <input type="hidden" name="ids" value="" data-bulk-target="ids" />
        <select name="ownerId"
                className="ts-focus rounded-md border px-2 py-1 text-[11px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">Unassign</option>
          {facets.owners.map((o) => <option key={o.id} value={o.id}>{o.name ?? o.email}</option>)}
        </select>
        <button type="submit" data-bulk-submit
                className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Assign
        </button>
      </form>

      <form action={bulkTagLeads} className="flex items-center gap-1">
        <input type="hidden" name="ids" value="" data-bulk-target="ids" />
        <input type="text" name="tag" placeholder="Tag" maxLength={50}
               className="ts-focus rounded-md border px-2 py-1 text-[11px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", width: 120 }} />
        <button type="submit" data-bulk-submit
                className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Tag
        </button>
      </form>

      <form action={bulkDisqualifyLeads} className="flex items-center gap-1">
        <input type="hidden" name="ids" value="" data-bulk-target="ids" />
        <input type="text" name="reason" placeholder="Disqualify reason" maxLength={500}
               className="ts-focus rounded-md border px-2 py-1 text-[11px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", width: 180 }} />
        <button type="submit" data-bulk-submit
                className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
          Disqualify
        </button>
      </form>

      <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }} data-bulk-counter>
        Select rows below to enable
      </span>

      {/* Tiny inline script: collects the checked row IDs into all
          [data-bulk-target=ids] hidden inputs, and updates the counter. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function(){
  function collect(){
    var checks = document.querySelectorAll('[data-lead-check]:checked');
    var ids = Array.from(checks).map(function(el){ return el.value; });
    document.querySelectorAll('[data-bulk-target="ids"]').forEach(function(input){ input.value = ids.join(','); });
    var counter = document.querySelector('[data-bulk-counter]');
    if (counter) {
      counter.textContent = ids.length === 0
        ? 'Select rows below to enable'
        : ids.length + ' lead' + (ids.length === 1 ? '' : 's') + ' selected';
    }
  }
  document.addEventListener('change', function(e){
    if (e.target && e.target.matches && e.target.matches('[data-lead-check]')) collect();
    if (e.target && e.target.matches && e.target.matches('[data-lead-check-all]')) {
      var all = document.querySelectorAll('[data-lead-check]');
      all.forEach(function(el){ el.checked = e.target.checked; });
      collect();
    }
  });
  document.addEventListener('DOMContentLoaded', collect);
  collect();
})();
          `,
        }}
      />
    </div>
  );
}

/* ── Table ──────────────────────────────────────────────── */

function Table({ rows, canWrite }: { rows: LeadInboxRow[]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border overflow-x-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {rows.length === 0 ? (
        <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          No leads match these filters.
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              {canWrite && (
                <th className="px-2 py-2 w-6 text-left">
                  <input type="checkbox" data-lead-check-all className="ts-focus h-3.5 w-3.5" aria-label="Select all" />
                </th>
              )}
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Lead</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Company</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Phone</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Source</th>
              <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Score</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Owner</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tags</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Created</th>
              <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Last touch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                {canWrite && (
                  <td className="px-2 py-1.5">
                    <input type="checkbox" data-lead-check value={r.id}
                           className="ts-focus h-3.5 w-3.5" aria-label={`Select ${r.email}`} />
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <Link href={`/platform/marketing/leads/${r.id}`}
                        className="ts-focus underline font-medium"
                        style={{ color: "var(--text-default)" }}>
                    {r.name ?? r.email}
                  </Link>
                  <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.email}</div>
                </td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{r.company ?? "—"}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.phone ?? "—"}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{sourceLabel(r.source)}</td>
                <td className="px-2 py-1.5 text-right"><ScoreBadge score={r.score} /></td>
                <td className="px-2 py-1.5"><StatusPill status={r.status} /></td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>
                  {r.ownerName ?? r.ownerEmail ?? <span style={{ color: "var(--text-faint)" }}>Unassigned</span>}
                </td>
                <td className="px-2 py-1.5">
                  {r.tags.length === 0 ? (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  ) : (
                    <div className="flex flex-wrap gap-0.5">
                      {r.tags.slice(0, 3).map((t) => (
                        <span key={t}
                              className="rounded-full px-1.5 py-0.5 text-[9px]"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                          {t}
                        </span>
                      ))}
                      {r.tags.length > 3 && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          +{r.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.createdAt)}</td>
                <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.lastTouchAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Pagination ───────────────────────────────────────── */

function Pagination({ page, totalPages, total, pageSize }: {
  page: number; totalPages: number; total: number; pageSize: number;
}) {
  if (totalPages <= 1) {
    return (
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {total.toLocaleString()} lead{total === 1 ? "" : "s"}
      </p>
    );
  }
  const linkBase = (p: number) => `?page=${p}`;
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 && (
          <Link href={linkBase(page - 1)} scroll={false}
                className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            ← Prev
          </Link>
        )}
        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
          Page {page} of {totalPages}
        </span>
        {page < totalPages && (
          <Link href={linkBase(page + 1)} scroll={false}
                className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
