// Page 33 — Support Tickets command center.
//
// 3-pane helpdesk inbox: left rail (saved views + folders), center
// ticket list with multi-select, right preview pane. Detail page +
// reply composer + status mutations live at /platform/support/[id]
// (existing route reused — no need to duplicate).

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadTicketKpis,
  loadTicketList,
  loadTicketPreview,
  loadSavedViewCounts,
  loadTicketFilterOptions,
  SAVED_VIEW_KEYS,
  type SavedViewKey,
  type TicketFilters,
} from "@/server/platform/support-tickets";
import type {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
  SupportTicketModule,
} from "@prisma/client";
import { DeferredNote, Kpi, formatDurationShort } from "./_components/shared";
import { ViewsRail } from "./_components/ViewsRail";
import { TicketsToolbar } from "./_components/TicketsToolbar";
import { TicketsTable } from "./_components/TicketsTable";
import { TicketPreviewPane } from "./_components/TicketPreviewPane";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
const PRIORITIES: SupportTicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];
const CATEGORIES: SupportTicketCategory[] = ["BILLING", "BUG", "FEATURE_REQUEST", "QUESTION", "OTHER"];
const MODULES: SupportTicketModule[] = [
  "BILLING", "AUTH", "PROOFS", "ORDERS", "INVOICES", "QUOTES",
  "PRODUCTS", "REPORTS", "INTEGRATIONS", "PORTAL", "EMAIL", "ADMIN", "OTHER",
];

type SP = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseView(v: string | undefined): SavedViewKey {
  return (SAVED_VIEW_KEYS as readonly string[]).includes(v ?? "")
    ? (v as SavedViewKey)
    : "all_active";
}

function parseFilters(sp: SP): TicketFilters {
  const view = parseView(asString(sp.view));
  const f: TicketFilters = { view };
  const q = asString(sp.q);                 if (q) f.q = q;
  const priority = asString(sp.priority);   if (priority && (PRIORITIES as string[]).includes(priority)) {
    f.priority = priority as SupportTicketPriority;
  }
  const status = asString(sp.status);       if (status && (STATUSES as string[]).includes(status)) {
    f.status = status as SupportTicketStatus;
  }
  const category = asString(sp.category);   if (category && (CATEGORIES as string[]).includes(category)) {
    f.category = category as SupportTicketCategory;
  }
  const mod = asString(sp.module);          if (mod && (MODULES as string[]).includes(mod)) {
    f.module = mod as SupportTicketModule;
  }
  const tenantId = asString(sp.tenant);     if (tenantId) f.tenantId = tenantId;
  const assignedTo = asString(sp.assignedTo); if (assignedTo) f.assignedTo = assignedTo;
  return f;
}

export default async function SupportTicketsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const page = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);
  const selectedId = asString(sp.selected) ?? null;

  const [kpis, list, viewCounts, options, preview] = await Promise.all([
    loadTicketKpis(),
    loadTicketList({ filters, currentUserId: ctx.userId, page, pageSize: PAGE_SIZE }),
    loadSavedViewCounts(ctx.userId),
    loadTicketFilterOptions(),
    selectedId ? loadTicketPreview(selectedId) : Promise.resolve(null),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  /** Build a same-page href with overrides applied. `undefined` deletes a key. */
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (filters.view !== "all_active") u.set("view", filters.view);
    if (filters.q)          u.set("q", filters.q);
    if (filters.priority)   u.set("priority", filters.priority);
    if (filters.status)     u.set("status", filters.status);
    if (filters.category)   u.set("category", filters.category);
    if (filters.module)     u.set("module", filters.module);
    if (filters.tenantId)   u.set("tenant", filters.tenantId);
    if (filters.assignedTo) u.set("assignedTo", filters.assignedTo);
    if (page > 1)           u.set("page", String(page));
    if (selectedId)         u.set("selected", selectedId);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/operations/tickets?${qs}` : "/platform/operations/tickets";
  };

  const hasFiltersApplied = !!(
    filters.q || filters.priority || filters.status || filters.category ||
    filters.module || filters.tenantId || filters.assignedTo
  );

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Operations
          </div>
          <h1
            className="mt-1 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            Support tickets
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Helpdesk inbox across every tenant.{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.open.toLocaleString()}</b> open ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.breachingSla.toLocaleString()}</b>{" "}
            breaching SLA.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/platform/support"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
            title="Legacy support queue (kept for muscle memory)"
          >
            Legacy queue
          </Link>
          <Link
            href="/platform/support/templates"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Macros
          </Link>
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="Open"
          value={kpis.open.toLocaleString()}
          tone={kpis.open > 0 ? "warning" : "default"}
        />
        <Kpi
          label="Pending customer"
          value={kpis.pendingCustomer.toLocaleString()}
        />
        <Kpi
          label="Solved today"
          value={kpis.solvedToday.toLocaleString()}
          tone={kpis.solvedToday > 0 ? "good" : "default"}
        />
        <Kpi
          label="Breaching SLA"
          value={kpis.breachingSla.toLocaleString()}
          tone={kpis.breachingSla > 0 ? "danger" : "good"}
        />
        <Kpi
          label="Avg first reply · 30d"
          value={formatDurationShort(kpis.avgFirstResponseMs)}
          sub="From created to first staff reply"
        />
        <Kpi
          label="CSAT · 30d"
          value={kpis.csatPct == null ? "—" : `${Math.round(kpis.csatPct * 100)}%`}
          sub={kpis.csatSampleSize === 0
            ? "No ratings yet"
            : `${kpis.csatSampleSize.toLocaleString()} rated`}
          tone={
            kpis.csatPct == null   ? "default" :
            kpis.csatPct >= 0.85   ? "good"    :
            kpis.csatPct >= 0.6    ? "warning" :
                                     "danger"
          }
        />
      </div>

      {/* ── 3-pane layout ──────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        {/* Left rail */}
        <ViewsRail
          active={filters.view}
          counts={viewCounts}
          buildHref={buildHref}
        />

        {/* Center */}
        <div className="flex flex-col gap-3">
          <TicketsToolbar
            view={filters.view}
            q={filters.q}
            status={filters.status}
            priority={filters.priority}
            category={filters.category}
            mod={filters.module}
            tenantId={filters.tenantId}
            assignedTo={filters.assignedTo}
            options={options}
            resetHref={`/platform/operations/tickets?view=${filters.view}`}
            hasFiltersApplied={hasFiltersApplied}
          />

          <DeferredNote>
            <strong>Bulk actions, macros editor, SLA settings, AI suggested replies, and
            real-time collision detection are deferred.</strong> Multi-select checkboxes are
            visual placeholders — bulk assign / status / tag flows ship in a follow-up alongside
            macro variables and the SLA targeting matrix. Reply composer + status changes are
            live at <code>/platform/support/[id]</code>.
          </DeferredNote>

          <TicketsTable
            rows={list.rows}
            selectedId={selectedId}
            buildHref={buildHref}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              <span>
                Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
                {list.filteredTotal.toLocaleString()} ticket
                {list.filteredTotal === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-1">
                <PageLink href={page > 1 ? buildHref({ page: String(page - 1) }) : null}>
                  ‹ Prev
                </PageLink>
                <PageLink href={page < totalPages ? buildHref({ page: String(page + 1) }) : null}>
                  Next ›
                </PageLink>
              </div>
            </div>
          )}
        </div>

        {/* Right preview */}
        <TicketPreviewPane ticket={preview} />
      </div>
    </div>
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
