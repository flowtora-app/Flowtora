import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import type { MarketingLeadKind, MarketingLeadStatus, Prisma } from "@prisma/client";
import { LeadsKPIBand, type LeadsKpi } from "@/components/platform/LeadsKPIBand";
import { LeadsQuickFilters, type LeadsQuickFilterChip } from "@/components/platform/LeadsQuickFilters";
import { LeadRowActions } from "@/components/platform/LeadRowActions";
import { LeadsInsightStrip, type LeadInsight } from "@/components/platform/LeadsInsightStrip";

// Phase 19 (redesign) — platform marketing-lead inbox.
//
// Conversion-focused sales inbox. Layout:
//
//   1. KPI band                — pipeline / new / unassigned / demos / conv. rate
//   2. Auto-generated insights — warning, info, positive
//   3. Search + clear
//   4. Quick-filter chip row   — status pipeline (All / New / Contacted / …)
//   5. Inbox list              — priority dot + status pill + kind + actions
//   6. Pagination              — 50 per page
//
// All UI state lives in the URL (?q=, ?status=, ?kind=, ?mine=, ?page=)
// so any view is link-shareable. Counts come from one groupBy; periods
// from parallel current/prior queries that compute deltas server-side.

const STATUS_OPTIONS = ["ALL", "NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED", "SPAM"] as const;
const KIND_OPTIONS   = ["ALL", "INQUIRY", "DEMO", "NEWSLETTER", "TRIAL_ABANDON"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type KindFilter   = (typeof KIND_OPTIONS)[number];

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

// Status → tone for chip + pill rendering. The two chip rows (filter +
// row badge) read from the same map so the colors stay in lockstep.
const STATUS_TONE: Record<MarketingLeadStatus, "default" | "accent" | "success" | "warning" | "danger"> = {
  NEW:          "accent",
  CONTACTED:    "default",
  QUALIFIED:    "success",
  CONVERTED:    "success",
  DISQUALIFIED: "warning",
  SPAM:         "danger",
};
const STATUS_PILL_COLOR: Record<MarketingLeadStatus, { bg: string; fg: string }> = {
  NEW:          { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  CONTACTED:    { bg: "var(--surface-2)",       fg: "var(--text-default)"   },
  QUALIFIED:    { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  CONVERTED:    { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  DISQUALIFIED: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  SPAM:         { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"      },
};

// Kind → glyph + accent. Tiny visual cue so a sales rep can scan the
// inbox and spot demo requests vs newsletter chatter at a glance.
const KIND_BADGE: Record<MarketingLeadKind, { label: string; icon: string; color: string }> = {
  INQUIRY:       { label: "Inquiry",    icon: "✉",  color: "var(--text-muted)"     },
  DEMO:          { label: "Demo",       icon: "▶",  color: "var(--accent-primary)" },
  NEWSLETTER:    { label: "Newsletter", icon: "★",  color: "var(--text-muted)"     },
  TRIAL_ABANDON: { label: "Drop-off",   icon: "↩",  color: "var(--warning-fg)"     },
};

export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; kind?: string; mine?: string; page?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusRaw = (sp.status ?? "ALL").toUpperCase();
  const kindRaw   = (sp.kind   ?? "ALL").toUpperCase();
  const status: StatusFilter = (STATUS_OPTIONS as readonly string[]).includes(statusRaw)
    ? (statusRaw as StatusFilter)
    : "ALL";
  const kind: KindFilter = (KIND_OPTIONS as readonly string[]).includes(kindRaw)
    ? (kindRaw as KindFilter)
    : "ALL";
  const onlyMine = sp.mine === "1";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.MarketingLeadWhereInput = {};
  if (status !== "ALL") where.status = status as MarketingLeadStatus;
  if (kind   !== "ALL") where.kind   = kind   as MarketingLeadKind;
  if (onlyMine)         where.assignedToUserId = ctx.userId;
  if (q) {
    where.OR = [
      { email:   { contains: q, mode: "insensitive" } },
      { name:    { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  const now = new Date();
  const dayAgo  = new Date(now.getTime() - DAY_MS);
  const twoDayAgo = new Date(now.getTime() - 2 * DAY_MS);
  const week    = new Date(now.getTime() - 7  * DAY_MS);
  const twoWeek = new Date(now.getTime() - 14 * DAY_MS);
  const month   = new Date(now.getTime() - 30 * DAY_MS);
  const twoMonth = new Date(now.getTime() - 60 * DAY_MS);

  const [
    leads,
    totalMatching,
    countsByStatus,
    countsByKind,
    new24h,
    newPrior24h,
    demos7d,
    demosPrior7d,
    converted30d,
    capture30d,
    convertedPrior30d,
    capturePrior30d,
    untouchedDemos,
  ] = await Promise.all([
    db.marketingLead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.marketingLead.count({ where }),
    db.marketingLead.groupBy({ by: ["status"], _count: { _all: true } }),
    db.marketingLead.groupBy({ by: ["kind"],   _count: { _all: true } }),
    db.marketingLead.count({ where: { createdAt: { gte: dayAgo } } }),
    db.marketingLead.count({ where: { createdAt: { gte: twoDayAgo, lt: dayAgo } } }),
    db.marketingLead.count({ where: { kind: "DEMO", createdAt: { gte: week } } }),
    db.marketingLead.count({ where: { kind: "DEMO", createdAt: { gte: twoWeek, lt: week } } }),
    db.marketingLead.count({ where: { status: "CONVERTED", convertedAt: { gte: month } } }),
    db.marketingLead.count({ where: { createdAt: { gte: month } } }),
    db.marketingLead.count({ where: { status: "CONVERTED", convertedAt: { gte: twoMonth, lt: month } } }),
    db.marketingLead.count({ where: { createdAt: { gte: twoMonth, lt: month } } }),
    db.marketingLead.count({
      where: { kind: "DEMO", status: "NEW", createdAt: { lt: dayAgo } },
    }),
  ]);

  const statusCount = Object.fromEntries(
    countsByStatus.map((c) => [c.status, c._count._all]),
  ) as Partial<Record<MarketingLeadStatus, number>>;
  const kindCount = Object.fromEntries(
    countsByKind.map((c) => [c.kind, c._count._all]),
  ) as Partial<Record<MarketingLeadKind, number>>;

  const newCount       = statusCount.NEW       ?? 0;
  const contactedCount = statusCount.CONTACTED ?? 0;
  const qualifiedCount = statusCount.QUALIFIED ?? 0;
  const pipelineCount  = newCount + contactedCount + qualifiedCount;

  const unassignedCount = await db.marketingLead.count({
    where: {
      assignedToUserId: null,
      status: { in: ["NEW", "CONTACTED", "QUALIFIED"] },
    },
  });

  const conv30d      = capture30d      > 0 ? converted30d      / capture30d      : 0;
  const convPrior30d = capturePrior30d > 0 ? convertedPrior30d / capturePrior30d : 0;

  // Resolve assignees in a separate roundtrip — leaner than a join when
  // a single user shows up across many rows.
  const assigneeIds = Array.from(
    new Set(leads.map((l) => l.assignedToUserId).filter((x): x is string => Boolean(x))),
  );
  const assignees = assigneeIds.length
    ? await db.user.findMany({
        where:  { id: { in: assigneeIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));

  // ── KPI tiles ────────────────────────────────────────────────────
  const kpis: LeadsKpi[] = [
    {
      label: "Active pipeline",
      value: pipelineCount.toLocaleString(),
      hint: `${newCount} new · ${contactedCount} contacted · ${qualifiedCount} qualified`,
      tone: pipelineCount > 0 ? "accent" : "default",
    },
    {
      label: "New (24h)",
      value: new24h.toLocaleString(),
      hint: `vs ${newPrior24h} the previous day`,
      deltaPct: pctDelta(new24h, newPrior24h),
      tone: new24h > 0 ? "default" : "default",
    },
    {
      label: "Unassigned",
      value: unassignedCount.toLocaleString(),
      hint: unassignedCount === 0 ? "Inbox zero" : "Active leads needing an owner",
      tone: unassignedCount === 0 ? "success" : unassignedCount > 5 ? "warning" : "default",
    },
    {
      label: "Demo (7d)",
      value: demos7d.toLocaleString(),
      hint: `vs ${demosPrior7d} the prior week`,
      deltaPct: pctDelta(demos7d, demosPrior7d),
      tone: "default",
    },
    {
      label: "Conversion (30d)",
      value: `${(conv30d * 100).toFixed(1)}%`,
      hint: `${converted30d} converted of ${capture30d} captured`,
      deltaPct: convPrior30d > 0 ? (conv30d - convPrior30d) / convPrior30d : undefined,
      tone: conv30d >= 0.05 ? "success" : "default",
    },
  ];

  // ── Quick-filter chips ───────────────────────────────────────────
  const totalAll = Object.values(statusCount).reduce((a, b) => a + (b ?? 0), 0);
  const chips: LeadsQuickFilterChip[] = [
    { value: "ALL",          label: "All",          count: totalAll,                tone: "default" },
    { value: "NEW",          label: "New",          count: newCount,                tone: "accent"  },
    { value: "CONTACTED",    label: "Contacted",    count: contactedCount,          tone: "default" },
    { value: "QUALIFIED",    label: "Qualified",    count: qualifiedCount,          tone: "success" },
    { value: "CONVERTED",    label: "Converted",    count: statusCount.CONVERTED    ?? 0, tone: "success" },
    { value: "DISQUALIFIED", label: "Disqualified", count: statusCount.DISQUALIFIED ?? 0, tone: "warning" },
    { value: "SPAM",         label: "Spam",         count: statusCount.SPAM         ?? 0, tone: "danger"  },
  ];

  // ── Auto-generated insights ──────────────────────────────────────
  const insights: LeadInsight[] = [];
  if (untouchedDemos > 0) {
    insights.push({
      id: "stale-demo",
      tone: "warning",
      text: `${untouchedDemos} demo request${untouchedDemos === 1 ? "" : "s"} ${untouchedDemos === 1 ? "has" : "have"} sat untouched for over 24 hours.`,
      href: "/platform/leads?status=NEW&kind=DEMO",
      hrefLabel: "Open queue",
    });
  }
  if (unassignedCount >= 5) {
    insights.push({
      id: "unassigned-pile",
      tone: "warning",
      text: `${unassignedCount} active leads have no owner — sales response time is at risk.`,
      href: "/platform/leads?status=NEW",
      hrefLabel: "Triage",
    });
  }
  const newDelta = pctDelta(new24h, newPrior24h);
  if (newDelta !== undefined && newDelta >= 0.5 && new24h >= 5) {
    insights.push({
      id: "spike",
      tone: "info",
      text: `Inbound spiked ${(newDelta * 100).toFixed(0)}% versus yesterday — campaign pulling, or just noise?`,
    });
  }
  if (converted30d > 0 && conv30d > convPrior30d && convPrior30d > 0) {
    insights.push({
      id: "conv-up",
      tone: "positive",
      text: `Conversion rate climbed to ${(conv30d * 100).toFixed(1)}% in the last 30 days — best stretch yet.`,
    });
  }
  if ((kindCount.DEMO ?? 0) > 0 && demos7d > demosPrior7d && demosPrior7d > 0) {
    const lift = ((demos7d - demosPrior7d) / demosPrior7d) * 100;
    if (lift >= 20) {
      insights.push({
        id: "demos-up",
        tone: "positive",
        text: `Demo requests up ${lift.toFixed(0)}% week-over-week.`,
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));

  // Helper to construct a same-search link with one param overridden.
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (q)                      u.set("q", q);
    if (status !== "ALL")       u.set("status", status);
    if (kind   !== "ALL")       u.set("kind",   kind);
    if (onlyMine)               u.set("mine",   "1");
    if (page > 1)               u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/leads?${qs}` : "/platform/leads";
  };

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-default)" }}>
            Marketing leads
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Every public-site submission, ranked and ready to work.{" "}
            <b style={{ color: "var(--text-default)" }}>{newCount}</b> untouched ·{" "}
            <b style={{ color: "var(--text-default)" }}>{pipelineCount}</b> in active pipeline.
          </p>
        </div>
        <Link
          href={buildHref({ mine: onlyMine ? undefined : "1", page: undefined })}
          className="ts-focus rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            background: onlyMine ? "var(--accent-primary)" : "var(--surface-1)",
            color:      onlyMine ? "var(--accent-fg)"      : "var(--text-default)",
            border:     `1px solid ${onlyMine ? "var(--accent-primary)" : "var(--border-default)"}`,
          }}
        >
          {onlyMine ? "✓ My leads only" : "Show only my leads"}
        </Link>
      </div>

      {/* ── KPI band ─────────────────────────────────────────────── */}
      <LeadsKPIBand kpis={kpis} />

      {/* ── Insights ─────────────────────────────────────────────── */}
      {insights.length > 0 && <LeadsInsightStrip insights={insights.slice(0, 4)} />}

      {/* ── Search + kind filter ─────────────────────────────────── */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        {onlyMine && <input type="hidden" name="mine" value="1" />}
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}
        <label className="block flex-1 min-w-[220px]">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Search
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Email, name, or company"
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Kind
          </span>
          <select
            name="kind"
            defaultValue={kind}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k === "ALL" ? "All kinds" : KIND_BADGE[k as MarketingLeadKind]?.label ?? k}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || status !== "ALL" || kind !== "ALL" || onlyMine) && (
          <Link
            href="/platform/leads"
            className="self-center text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Status pipeline chips ────────────────────────────────── */}
      <LeadsQuickFilters chips={chips} />

      {/* ── Inbox list ───────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {leads.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>📬</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              {totalMatching === 0 && status === "ALL" && kind === "ALL" && !q && !onlyMine
                ? "No marketing leads yet."
                : "No leads match the current filters."}
            </div>
            {(q || status !== "ALL" || kind !== "ALL" || onlyMine) && (
              <Link href="/platform/leads" className="mt-2 inline-block text-xs underline">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {leads.map((l, idx) => {
              const assignee = l.assignedToUserId ? assigneeById.get(l.assignedToUserId) : null;
              const pill = STATUS_PILL_COLOR[l.status];
              const badge = KIND_BADGE[l.kind];
              const priority = scorePriority(l.kind, l.status, l.createdAt, now);
              const ageMs = now.getTime() - l.createdAt.getTime();
              const isStaleNew = l.status === "NEW" && ageMs > DAY_MS;
              return (
                <li
                  key={l.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <div className="relative">
                    <Link
                      href={`/platform/leads/${l.id}`}
                      className="block px-5 py-3.5 transition-colors hover:opacity-90"
                      style={{ color: "var(--text-default)" }}
                    >
                      <div className="flex items-start gap-3">
                        {/* Priority dot — visual heat lane */}
                        <span
                          aria-hidden
                          className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ background: priorityColor(priority) }}
                          title={priorityLabel(priority)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                background: pill.bg,
                                color: pill.fg,
                                border: `1px solid ${pill.fg}`,
                              }}
                            >
                              {l.status}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-medium"
                              style={{ color: badge.color }}
                            >
                              <span aria-hidden>{badge.icon}</span>
                              {badge.label}
                            </span>
                            {l.businessType && (
                              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                · {l.businessType}
                              </span>
                            )}
                            {isStaleNew && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background: "var(--warning-surface)",
                                  color: "var(--warning-fg)",
                                }}
                              >
                                Stale &gt; 24h
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="truncate font-semibold">
                              {l.name ?? l.email}
                            </span>
                            {l.company && (
                              <span
                                className="truncate text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                · {l.company}
                              </span>
                            )}
                          </div>
                          <div
                            className="mt-0.5 truncate text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {l.email}
                            {l.message && (
                              <>
                                {" · "}
                                {l.message.slice(0, 110)}
                                {l.message.length > 110 ? "…" : ""}
                              </>
                            )}
                          </div>
                        </div>
                        <div
                          className="shrink-0 text-right text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <div className="tabular-nums">{relative(l.createdAt, now)}</div>
                          <div className="mt-0.5">
                            {assignee
                              ? `→ ${assignee.name ?? assignee.email}`
                              : <span style={{ color: "var(--warning-fg)" }}>unassigned</span>}
                          </div>
                        </div>
                      </div>
                    </Link>
                    {/* Actions menu — sits absolutely over the right edge so a
                        click on the dots doesn't navigate the row link. */}
                    <div className="absolute right-2 top-2.5">
                      <LeadRowActions
                        leadId={l.id}
                        currentStatus={l.status}
                        alreadyMine={l.assignedToUserId === ctx.userId}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
            {totalMatching.toLocaleString()} lead{totalMatching === 1 ? "" : "s"}
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

// ── Helpers ──────────────────────────────────────────────────────

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

// Priority score: drives the colored dot at the start of each row.
//   3 — hot (DEMO + NEW, fresh)
//   2 — warm (NEW, fresh; or DEMO, recent)
//   1 — normal (anything in active pipeline)
//   0 — cold (terminal states or stale)
function scorePriority(
  kind: MarketingLeadKind,
  status: MarketingLeadStatus,
  createdAt: Date,
  now: Date,
): 0 | 1 | 2 | 3 {
  const ageMs = now.getTime() - createdAt.getTime();
  if (status === "CONVERTED" || status === "DISQUALIFIED" || status === "SPAM") return 0;
  if (kind === "DEMO" && status === "NEW" && ageMs < 24 * 60 * 60 * 1000) return 3;
  if (status === "NEW" && ageMs < 6 * 60 * 60 * 1000)                     return 2;
  if (kind === "DEMO" && ageMs < 7 * 24 * 60 * 60 * 1000)                 return 2;
  return 1;
}

function priorityColor(score: 0 | 1 | 2 | 3): string {
  switch (score) {
    case 3: return "var(--danger-fg)";
    case 2: return "var(--warning-fg)";
    case 1: return "var(--accent-primary)";
    case 0: return "var(--border-default)";
  }
}

function priorityLabel(score: 0 | 1 | 2 | 3): string {
  switch (score) {
    case 3: return "High priority — fresh demo request";
    case 2: return "Warm — recent activity";
    case 1: return "Active pipeline";
    case 0: return "Closed";
  }
}
