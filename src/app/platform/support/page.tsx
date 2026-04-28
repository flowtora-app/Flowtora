import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { slaChip, slaChipStyle } from "@/lib/support-sla";
import type { Prisma, SupportTicketStatus, SupportTicketPriority, SupportTicketCategory } from "@prisma/client";
import { SupportKPIBand, type SupportKpi } from "@/components/platform/SupportKPIBand";
import { SupportQuickFilters, type SupportChip } from "@/components/platform/SupportQuickFilters";
import { SupportRowActions } from "@/components/platform/SupportRowActions";

// Phase 17 Slice D (transformation rewrite) — platform support command
// center.
//
// Replaces the previous flat list with:
//   1. KPI band — open / unassigned / urgent / today / avg first reply
//   2. Search input (?q=) — subject, ticket id, tenant slug
//   3. Quick-filter chip rows — scope (status group) + priority
//   4. "Mine only" toggle
//   5. Polished inbox rows — priority dot, status pill, category badge,
//      SLA chip, subject, tenant + plan, message count, last update,
//      assignee, ⋯ row-actions menu
//
// The detail page at /platform/support/[id] is unchanged; this is purely
// a queue UX redesign.

const SCOPE_KEYS = ["ACTIVE", "ALL", "OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"] as const;
type ScopeKey = (typeof SCOPE_KEYS)[number];

const PRIORITY_KEYS = ["ALL", "URGENT", "HIGH", "NORMAL", "LOW"] as const;
type PriorityKey = (typeof PRIORITY_KEYS)[number];

const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;

const STATUS_TONE: Record<SupportTicketStatus, { bg: string; fg: string }> = {
  OPEN:             { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  IN_PROGRESS:      { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  WAITING_CUSTOMER: { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  RESOLVED:         { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  CLOSED:           { bg: "var(--surface-2)",       fg: "var(--text-faint)"     },
};

const PRIORITY_TONE: Record<SupportTicketPriority, { dot: string; text: string }> = {
  URGENT: { dot: "var(--danger-fg)",    text: "var(--danger-fg)"    },
  HIGH:   { dot: "var(--warning-fg)",   text: "var(--warning-fg)"   },
  NORMAL: { dot: "var(--accent-primary)", text: "var(--text-default)" },
  LOW:    { dot: "var(--border-default)", text: "var(--text-muted)" },
};

const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  BILLING:         "Billing",
  BUG:             "Bug",
  FEATURE_REQUEST: "Feature",
  QUESTION:        "Question",
  OTHER:           "Other",
};

export default async function PlatformSupportPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    priority?: string;
    mine?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const scopeRaw = (sp.scope ?? "ACTIVE").toUpperCase();
  const scope: ScopeKey = (SCOPE_KEYS as readonly string[]).includes(scopeRaw)
    ? (scopeRaw as ScopeKey)
    : "ACTIVE";
  const priorityRaw = (sp.priority ?? "ALL").toUpperCase();
  const priority: PriorityKey = (PRIORITY_KEYS as readonly string[]).includes(priorityRaw)
    ? (priorityRaw as PriorityKey)
    : "ALL";
  const onlyMine = sp.mine === "1";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // ── Build the where clause ───────────────────────────────────
  const where: Prisma.SupportTicketWhereInput = {};
  if (scope === "ACTIVE")            where.status = { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] };
  else if (scope === "OPEN")         where.status = "OPEN";
  else if (scope === "IN_PROGRESS")  where.status = "IN_PROGRESS";
  else if (scope === "WAITING")      where.status = "WAITING_CUSTOMER";
  else if (scope === "RESOLVED")     where.status = "RESOLVED";
  else if (scope === "CLOSED")       where.status = "CLOSED";
  // ALL leaves status unset

  if (priority !== "ALL") where.priority = priority as SupportTicketPriority;
  if (onlyMine) where.assignedTo = ctx.userId;

  // Search by subject, ticket id (prefix), or via tenant slug join.
  // Ticket id we hit by exact / prefix match; subject and tenant slug
  // get a contains. Using OR keeps it one query.
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { id:      { startsWith: q } },
      { tenant:  { OR: [
        { slug: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ] } },
    ];
  }

  // ── Time windows for KPI deltas ──────────────────────────────
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - DAY_MS);
  const window7  = new Date(now.getTime() - 7  * DAY_MS);
  const window14 = new Date(now.getTime() - 14 * DAY_MS);

  // ── Parallel data fetch ──────────────────────────────────────
  const [
    tickets,
    totalMatching,
    countsByStatus,
    countsByPriority,
    activeUnassignedCount,
    activeUrgentCount,
    todayCount,
    yesterdayCount,
    slaBreachCount,
    firstResponses30d,
  ] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { messages: true } } },
    }),
    db.supportTicket.count({ where }),
    db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    db.supportTicket.groupBy({
      by: ["priority"],
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
      _count: { _all: true },
    }),
    db.supportTicket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] },
        assignedTo: null,
      },
    }),
    db.supportTicket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] },
        priority: { in: ["URGENT", "HIGH"] },
      },
    }),
    db.supportTicket.count({ where: { createdAt: { gte: startOfToday } } }),
    db.supportTicket.count({ where: { createdAt: { gte: startOfYesterday, lt: startOfToday } } }),
    db.supportTicket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] },
        dueBy: { lt: now },
      },
    }),
    // First-response times — pull just the two timestamps for tickets
    // that have both, last 30 days. Average computed in memory.
    db.supportTicket.findMany({
      where: { firstStaffReplyAt: { gte: window14 }, createdAt: { gte: window14 } },
      select: { createdAt: true, firstStaffReplyAt: true },
    }),
  ]);

  const byStatus = Object.fromEntries(countsByStatus.map((c) => [c.status, c._count._all])) as Partial<Record<SupportTicketStatus, number>>;
  const activeCount = (byStatus.OPEN ?? 0) + (byStatus.IN_PROGRESS ?? 0) + (byStatus.WAITING_CUSTOMER ?? 0);
  const byPrio = Object.fromEntries(countsByPriority.map((c) => [c.priority, c._count._all])) as Partial<Record<SupportTicketPriority, number>>;

  // Average first response in current 7d window vs prior 7d window.
  const responses7d  = firstResponses30d.filter((t) => t.firstStaffReplyAt && t.createdAt >= window7);
  const responsesP7d = firstResponses30d.filter((t) => t.firstStaffReplyAt && t.createdAt >= window14 && t.createdAt < window7);
  const avgMs7d  = avgResponseMs(responses7d);
  const avgMsP7d = avgResponseMs(responsesP7d);

  const tenantIds = Array.from(new Set(tickets.map((t) => t.tenantId)));
  const assigneeIds = Array.from(
    new Set(tickets.map((t) => t.assignedTo).filter((x): x is string => Boolean(x))),
  );
  const [tenants, assignees] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, plan: true, status: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string; plan: string; status: string }[]),
    assigneeIds.length
      ? db.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const assigneeById = new Map(assignees.map((u) => [u.id, u]));

  // ── KPI tiles ────────────────────────────────────────────────
  const kpis: SupportKpi[] = [
    {
      label: "Open",
      value: activeCount.toLocaleString(),
      hint: `${byStatus.OPEN ?? 0} new · ${byStatus.IN_PROGRESS ?? 0} in progress · ${byStatus.WAITING_CUSTOMER ?? 0} waiting`,
      tone: activeCount > 0 ? "accent" : "default",
    },
    {
      label: "Unassigned",
      value: activeUnassignedCount.toLocaleString(),
      hint: activeUnassignedCount === 0 ? "Nothing waiting for an owner" : "Active tickets needing an agent",
      tone: activeUnassignedCount === 0 ? "success" : activeUnassignedCount >= 5 ? "warning" : "default",
    },
    {
      label: "Urgent / High",
      value: activeUrgentCount.toLocaleString(),
      hint: slaBreachCount > 0
        ? `${slaBreachCount} SLA ${slaBreachCount === 1 ? "breach" : "breaches"} active`
        : "No SLA breaches",
      tone: activeUrgentCount > 0 ? (slaBreachCount > 0 ? "danger" : "warning") : "default",
    },
    {
      label: "Today",
      value: todayCount.toLocaleString(),
      hint: `vs ${yesterdayCount} yesterday`,
      deltaPct: pctDelta(todayCount, yesterdayCount),
      deltaInvert: true,
    },
    {
      label: "Avg first reply",
      value: avgMs7d != null ? formatDurationShort(avgMs7d) : "—",
      hint: avgMs7d != null ? `Last 7 days · vs ${avgMsP7d != null ? formatDurationShort(avgMsP7d) : "n/a"}` : "Not enough data",
      deltaPct: avgMs7d != null && avgMsP7d != null && avgMsP7d > 0 ? (avgMs7d - avgMsP7d) / avgMsP7d : undefined,
      deltaInvert: true,
    },
  ];

  // ── Scope chips ──────────────────────────────────────────────
  const scopeChips: SupportChip[] = [
    { value: "ACTIVE",      label: "Active",       count: activeCount,                    tone: "accent"  },
    { value: "OPEN",        label: "Open",         count: byStatus.OPEN ?? 0,             tone: "accent"  },
    { value: "IN_PROGRESS", label: "In progress",  count: byStatus.IN_PROGRESS ?? 0,      tone: "warning" },
    { value: "WAITING",     label: "Waiting",      count: byStatus.WAITING_CUSTOMER ?? 0, tone: "default" },
    { value: "RESOLVED",    label: "Resolved",     count: byStatus.RESOLVED ?? 0,         tone: "success" },
    { value: "CLOSED",      label: "Closed",       count: byStatus.CLOSED ?? 0,           tone: "default" },
    { value: "ALL",         label: "All",          count: undefined,                      tone: "default" },
  ];

  // ── Priority chips ───────────────────────────────────────────
  const priorityChips: SupportChip[] = [
    { value: "ALL",    label: "Any priority", count: undefined,            tone: "default" },
    { value: "URGENT", label: "Urgent",       count: byPrio.URGENT ?? 0,   tone: "danger"  },
    { value: "HIGH",   label: "High",         count: byPrio.HIGH ?? 0,     tone: "warning" },
    { value: "NORMAL", label: "Normal",       count: byPrio.NORMAL ?? 0,   tone: "default" },
    { value: "LOW",    label: "Low",          count: byPrio.LOW ?? 0,      tone: "default" },
  ];

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));

  // Construct a same-search link with one param overridden.
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (q)                       u.set("q", q);
    if (scope !== "ACTIVE")      u.set("scope", scope);
    if (priority !== "ALL")      u.set("priority", priority);
    if (onlyMine)                u.set("mine", "1");
    if (page > 1)                u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/support?${qs}` : "/platform/support";
  };

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Support queue
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Every tenant ticket in one place. <b style={{ color: "var(--text-default)" }}>{activeCount}</b> active ·{" "}
            <b style={{ color: "var(--text-default)" }}>{activeUnassignedCount}</b> unassigned ·{" "}
            <b style={{ color: "var(--text-default)" }}>{slaBreachCount}</b> SLA{slaBreachCount === 1 ? "" : "s"} red.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/platform/support/templates"
            className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Canned replies
          </Link>
          <Link
            href={buildHref({ mine: onlyMine ? undefined : "1", page: undefined })}
            className="ts-focus rounded-full px-3 py-1.5 text-xs font-medium"
            style={{
              background: onlyMine ? "var(--accent-primary)" : "var(--surface-1)",
              color:      onlyMine ? "var(--accent-fg)"      : "var(--text-default)",
              border:     `1px solid ${onlyMine ? "var(--accent-primary)" : "var(--border-default)"}`,
            }}
          >
            {onlyMine ? "✓ My tickets only" : "Show only mine"}
          </Link>
        </div>
      </div>

      {/* ── KPI band ─────────────────────────────────────────── */}
      <SupportKPIBand kpis={kpis} />

      {/* ── Search ───────────────────────────────────────────── */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        {scope !== "ACTIVE" && <input type="hidden" name="scope" value={scope} />}
        {priority !== "ALL" && <input type="hidden" name="priority" value={priority} />}
        {onlyMine && <input type="hidden" name="mine" value="1" />}
        <label className="block flex-1 min-w-[260px]">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Search
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Subject, ticket id, tenant name or slug…"
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || scope !== "ACTIVE" || priority !== "ALL" || onlyMine) && (
          <Link
            href="/platform/support"
            className="self-center text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Status chips ─────────────────────────────────────── */}
      <SupportQuickFilters paramKey="scope" chips={scopeChips} defaultValue="ACTIVE" />

      {/* ── Priority chips ───────────────────────────────────── */}
      <SupportQuickFilters paramKey="priority" chips={priorityChips} defaultValue="ALL" />

      {/* ── Inbox list ───────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {tickets.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>🎫</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              No tickets match the current filters.
            </div>
            {(q || scope !== "ACTIVE" || priority !== "ALL" || onlyMine) && (
              <Link href="/platform/support" className="mt-2 inline-block text-xs underline">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {tickets.map((t, idx) => {
              const tenant = tenantById.get(t.tenantId);
              const assignee = t.assignedTo ? assigneeById.get(t.assignedTo) : null;
              const status = STATUS_TONE[t.status];
              const prio = PRIORITY_TONE[t.priority];
              const sla = slaChip({
                dueBy: t.dueBy,
                status: t.status,
                firstStaffReplyAt: t.firstStaffReplyAt,
              });
              const slaStyle = sla ? slaChipStyle(sla.tone) : null;
              const isUrgent = t.priority === "URGENT" || t.priority === "HIGH";
              const isUnread = t.firstStaffReplyAt == null && (t.status === "OPEN" || t.status === "WAITING_CUSTOMER");
              return (
                <li
                  key={t.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <div className="relative">
                    <Link
                      href={`/platform/support/${t.id}`}
                      className="block px-5 py-3.5 transition-colors hover:opacity-95"
                      style={{ color: "var(--text-default)" }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Priority dot */}
                        <span
                          aria-hidden
                          className="mt-2 inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: prio.dot }}
                          title={`Priority: ${t.priority}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ background: status.bg, color: status.fg, border: `1px solid ${status.fg}` }}
                            >
                              {t.status.replace(/_/g, " ")}
                            </span>
                            {isUrgent && (
                              <span
                                className="text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: prio.text }}
                              >
                                {t.priority}
                              </span>
                            )}
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                            >
                              {CATEGORY_LABEL[t.category]}
                            </span>
                            {sla && slaStyle && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{ color: slaStyle.color, border: `1px solid ${slaStyle.border}` }}
                                title="Service-level agreement clock"
                              >
                                SLA · {sla.label}
                              </span>
                            )}
                            {isUnread && (
                              <span
                                aria-label="Unread / awaiting first reply"
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ background: "var(--accent-primary)" }}
                                title="Awaiting first staff reply"
                              />
                            )}
                          </div>
                          <div className="mt-1 truncate font-semibold" style={{ color: "var(--text-default)" }}>
                            {t.subject}
                          </div>
                          <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                            {tenant ? (
                              <>
                                <span style={{ color: "var(--text-default)" }}>{tenant.name}</span>
                                <span> ({tenant.plan})</span>
                              </>
                            ) : (
                              <span style={{ color: "var(--text-faint)" }}>deleted tenant</span>
                            )}
                            {" · "}
                            <span className="font-mono">#{t.id.slice(0, 8)}</span>
                            {" · "}
                            {t._count.messages} msg{t._count.messages === 1 ? "" : "s"}
                            {t.satisfactionRating && (
                              <>
                                {" · "}
                                <span
                                  style={{
                                    color: t.satisfactionRating >= 4 ? "var(--success-fg)"
                                         : t.satisfactionRating <= 2 ? "var(--danger-fg)"
                                         : "var(--warning-fg)",
                                  }}
                                >
                                  ★ {t.satisfactionRating}/5
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div
                          className="shrink-0 text-right text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <div className="tabular-nums">{relative(t.updatedAt, now)}</div>
                          <div className="mt-0.5">
                            {assignee ? (
                              <span style={{ color: assignee.id === ctx.userId ? "var(--accent-primary)" : "var(--text-muted)" }}>
                                → {assignee.name ?? assignee.email}
                              </span>
                            ) : (
                              <span style={{ color: "var(--warning-fg)" }}>unassigned</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                    {/* Row actions sit absolutely over the right edge so they
                        don't activate the row link. */}
                    <div className="absolute right-2 top-2.5">
                      <SupportRowActions
                        ticketId={t.id}
                        currentStatus={t.status}
                        currentPriority={t.priority}
                        alreadyMine={t.assignedTo === ctx.userId}
                        canMutate={ctx.canWrite}
                        currentUserId={ctx.userId}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────── */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
            {totalMatching.toLocaleString()} ticket{totalMatching === 1 ? "" : "s"}
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

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function PageLink({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span
        className="rounded-md px-3 py-1.5"
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
      className="ts-focus rounded-md px-3 py-1.5 transition-colors"
      style={{
        color: "var(--text-default)",
        border: "1px solid var(--border-default)",
      }}
    >
      {children}
    </Link>
  );
}

function pctDelta(current: number, prior: number): number | undefined {
  if (prior <= 0) return current > 0 ? 1 : undefined;
  return (current - prior) / prior;
}

function avgResponseMs(rows: { createdAt: Date; firstStaffReplyAt: Date | null }[]): number | null {
  const samples = rows
    .filter((r) => r.firstStaffReplyAt != null)
    .map((r) => r.firstStaffReplyAt!.getTime() - r.createdAt.getTime());
  if (samples.length === 0) return null;
  return samples.reduce((s, v) => s + v, 0) / samples.length;
}

function formatDurationShort(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;
  const days = hrs / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

function relative(d: Date, now: Date): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}
