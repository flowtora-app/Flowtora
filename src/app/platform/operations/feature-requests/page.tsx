// Page 36 — Feature Requests / Roadmap (admin command center).
//
// Tab-driven (Board / List / Roadmap timeline / Submitted) with a
// header KPI strip, filter row, and "+ New request" + "Public
// roadmap" affordances.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadFeatureRequestKpis,
  loadFeatureRequestList,
  loadFeatureRequestBoard,
  loadFeatureRequestFilterOptions,
  loadRoadmapLanes,
  TAB_KEYS,
  type FeatureRequestFilters,
  type FeatureRequestTab,
} from "@/server/platform/feature-requests";
import { createFeatureRequest } from "@/app/actions/platform-feature-requests";
import type {
  FeatureRequestStatus,
  EngineeringEffort,
} from "@prisma/client";
import { FormError, FormOk, Kpi, STATUS_LABEL } from "./_components/shared";
import { TabsBar } from "./_components/TabsBar";
import { KanbanBoard } from "./_components/KanbanBoard";
import { RequestList } from "./_components/RequestList";
import { RoadmapTimeline } from "./_components/RoadmapTimeline";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const STATUSES: FeatureRequestStatus[] = [
  "SUBMITTED", "BACKLOG", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "BETA", "SHIPPED", "WONT_DO",
];
const EFFORTS: EngineeringEffort[] = ["XS", "S", "M", "L", "XL"];

type SP = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseTab(v: string | undefined): FeatureRequestTab {
  return (TAB_KEYS as readonly string[]).includes(v ?? "") ? (v as FeatureRequestTab) : "board";
}

export default async function FeatureRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("features.manage");
  const tab = parseTab(asString(sp.tab));
  const page = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const filters: FeatureRequestFilters = {};
  const q = asString(sp.q);                if (q) filters.q = q;
  const status = asString(sp.status);      if (status && (STATUSES as string[]).includes(status)) filters.status = status as FeatureRequestStatus;
  const effort = asString(sp.effort);      if (effort && (EFFORTS as string[]).includes(effort)) filters.effort = effort as EngineeringEffort;
  const swimlane = asString(sp.swimlane);  if (swimlane) filters.swimlane = swimlane;
  const tag = asString(sp.tag);            if (tag) filters.tag = tag;
  const isPublic = asString(sp.isPublic);
  if (isPublic === "yes") filters.isPublic = true;
  if (isPublic === "no")  filters.isPublic = false;
  if (tab === "submitted") filters.pinSubmitted = true;

  const [kpis, list, boardData, options, lanes] = await Promise.all([
    loadFeatureRequestKpis(),
    tab === "list" || tab === "submitted"
      ? loadFeatureRequestList({ filters, page, pageSize: PAGE_SIZE })
      : Promise.resolve({ rows: [], total: 0, filteredTotal: 0 }),
    tab === "board"
      ? loadFeatureRequestBoard(filters)
      : Promise.resolve({ rows: [], total: 0, filteredTotal: 0 }),
    loadFeatureRequestFilterOptions(),
    tab === "roadmap" ? loadRoadmapLanes() : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (tab !== "board")    u.set("tab", tab);
    if (q)                  u.set("q", q);
    if (status)             u.set("status", status);
    if (effort)             u.set("effort", effort);
    if (swimlane)           u.set("swimlane", swimlane);
    if (tag)                u.set("tag", tag);
    if (isPublic)           u.set("isPublic", isPublic);
    if (page > 1)           u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/operations/feature-requests?${qs}` : "/platform/operations/feature-requests";
  };
  const hrefForTab = (next: FeatureRequestTab) =>
    next === "board"
      ? "/platform/operations/feature-requests"
      : `/platform/operations/feature-requests?tab=${next}`;
  const hasFiltersApplied = !!(q || status || effort || swimlane || tag || isPublic);
  const returnTo = buildHref({});

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
            Feature requests
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Roadmap board with voting, ICE prioritization, swimlanes, and tenant linkage.{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.submittedCount}</b> awaiting triage ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.inProgressCount}</b> in progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/roadmap"
            target="_blank"
            rel="noopener"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            🗺 Public roadmap
          </Link>
          <Link
            href="/roadmap/rss.xml"
            target="_blank"
            rel="noopener"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            📰 RSS
          </Link>
        </div>
      </div>

      <FormOk msg={ok} />
      <FormError msg={error} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Submitted"           value={kpis.submittedCount.toLocaleString()} tone={kpis.submittedCount > 0 ? "warning" : "default"} />
        <Kpi label="In progress"         value={kpis.inProgressCount.toLocaleString()} tone={kpis.inProgressCount > 0 ? "good" : "default"} />
        <Kpi label="Beta"                value={kpis.betaCount.toLocaleString()} />
        <Kpi label="Shipped this quarter" value={kpis.shippedThisQuarterCount.toLocaleString()} tone="good" />
        <Kpi label="Total upvotes"       value={kpis.totalVotes.toLocaleString()} />
        <Kpi label="Public on roadmap"   value={kpis.publicCount.toLocaleString()} />
      </div>

      <TabsBar active={tab} hrefFor={hrefForTab} submittedCount={kpis.submittedCount} />

      {/* Filter row */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        {tab !== "board" && <input type="hidden" name="tab" value={tab} />}
        <Field label="Search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Title, body, tag…"
            className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        {tab !== "submitted" && tab !== "board" && (
          <Field label="Status">
            <Select name="status" defaultValue={status ?? ""}>
              <option value="">Any</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Effort">
          <Select name="effort" defaultValue={effort ?? ""}>
            <option value="">Any</option>
            {EFFORTS.map((e) => <option key={e} value={e}>{e}</option>)}
          </Select>
        </Field>
        <Field label="Swimlane">
          <Select name="swimlane" defaultValue={swimlane ?? ""}>
            <option value="">Any</option>
            {options.swimlanes.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Tag">
          <Select name="tag" defaultValue={tag ?? ""}>
            <option value="">Any</option>
            {options.tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Public">
          <Select name="isPublic" defaultValue={isPublic ?? ""}>
            <option value="">Any</option>
            <option value="yes">Public only</option>
            <option value="no">Private only</option>
          </Select>
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
            href={tab === "board"
              ? "/platform/operations/feature-requests"
              : `/platform/operations/feature-requests?tab=${tab}`}
            className="self-center text-[11px] underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </a>
        )}
      </form>

      {/* "+ New request" form for staff */}
      {canWrite && (
        <form
          action={createFeatureRequest}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <Field label="New request — title">
            <input
              name="title"
              required
              placeholder="e.g. Bulk export of completed jobs as CSV"
              className="ts-focus w-[300px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Swimlane">
            <input
              name="swimlane"
              maxLength={40}
              placeholder="Sales / Production / Reports"
              className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Tags">
            <input
              name="tags"
              placeholder="comma, separated"
              className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="isPublic" className="ts-focus h-3 w-3" />
            Public on roadmap
          </label>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + Create
          </button>
        </form>
      )}

      {tab === "board" && (
        <KanbanBoard
          initialCards={boardData.rows.map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            upvoteCount: r.upvoteCount,
            voteCount: r.voteCount,
            iceScore: r.iceScore,
            effort: r.effort,
            plannedRelease: r.plannedRelease,
            tags: r.tags,
            swimlane: r.swimlane,
            submitterTenantName: r.submitterTenantName,
            linkedSupportTicketIds: r.linkedSupportTicketIds,
            isPublic: r.isPublic,
          }))}
          returnTo={returnTo}
          canWrite={canWrite}
        />
      )}

      {(tab === "list" || tab === "submitted") && (
        <>
          <RequestList rows={list.rows} />
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              <span>
                Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
                {list.filteredTotal.toLocaleString()} request{list.filteredTotal === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={page > 1 ? buildHref({ page: String(page - 1) }) : null}>‹ Prev</PageLink>
                <PageLink href={page < totalPages ? buildHref({ page: String(page + 1) }) : null}>Next ›</PageLink>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "roadmap" && <RoadmapTimeline lanes={lanes} />}
    </div>
  );
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
