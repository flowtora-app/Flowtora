import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import type { FeedbackKind, FeedbackStatus, Prisma } from "@prisma/client";
import { FeedbackKPIBand, type FeedbackKpi } from "@/components/platform/FeedbackKPIBand";
import { FeedbackQuickFilters, type FeedbackChip } from "@/components/platform/FeedbackQuickFilters";
import { FeedbackRoadmapStrip, type RoadmapItem } from "@/components/platform/FeedbackRoadmapStrip";

// /platform/feedback — feedback hub (transformation rewrite).
//
// Layout:
//   1. KPI band — Total · New (7d) · Most-voted · Shipped (30d) · Avg rating
//   2. Roadmap snapshot — top 5 Planned / In progress / Recently shipped
//   3. Search + status pipeline + kind chips
//   4. Board list — sorted by votes desc, then most recent
//
// Uses the new FeedbackStatus pipeline + denormalized voteCount column
// added in this redesign. CSV export is preserved at the same URL.

const STATUS_KEYS = ["ALL", "NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "SHIPPED", "REJECTED"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

const KIND_KEYS = ["ALL", "IDEA", "BUG", "PRAISE", "OTHER"] as const;
type KindKey = (typeof KIND_KEYS)[number];

const SORT_KEYS = ["VOTES", "RECENT"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const DAY_MS = 86_400_000;

const STATUS_TONE: Record<FeedbackStatus, { bg: string; fg: string; label: string }> = {
  NEW:          { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "New" },
  UNDER_REVIEW: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Under review" },
  PLANNED:      { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Planned" },
  IN_PROGRESS:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "In progress" },
  SHIPPED:      { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Shipped" },
  REJECTED:     { bg: "var(--surface-2)",       fg: "var(--text-faint)",     label: "Rejected" },
};

const KIND_TONE: Record<FeedbackKind, { bg: string; fg: string; icon: string; label: string }> = {
  IDEA:   { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "💡", label: "Idea" },
  BUG:    { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      icon: "🐞", label: "Bug" },
  PRAISE: { bg: "var(--success-surface)", fg: "var(--success-fg)",     icon: "🙌", label: "Praise" },
  OTHER:  { bg: "var(--surface-2)",       fg: "var(--text-muted)",     icon: "•",  label: "Other" },
};

export default async function PlatformFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    kind?: string;
    sort?: string;
    tenantId?: string;
    days?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const statusRaw = (sp.status ?? "ALL").toUpperCase();
  const kindRaw   = (sp.kind   ?? "ALL").toUpperCase();
  const sortRaw   = (sp.sort   ?? "VOTES").toUpperCase();
  const status: StatusKey = (STATUS_KEYS as readonly string[]).includes(statusRaw) ? (statusRaw as StatusKey) : "ALL";
  const kind:   KindKey   = (KIND_KEYS   as readonly string[]).includes(kindRaw)   ? (kindRaw   as KindKey)   : "ALL";
  const sort:   SortKey   = (SORT_KEYS   as readonly string[]).includes(sortRaw)   ? (sortRaw   as SortKey)   : "VOTES";
  const tenantId = (sp.tenantId ?? "").trim() || null;
  const days = Math.max(0, Math.min(365, Number(sp.days ?? "") || 0));

  // ── where clause ────────────────────────────────────────────
  const where: Prisma.FeedbackWhereInput = {};
  if (status !== "ALL") where.status = status as FeedbackStatus;
  if (kind   !== "ALL") where.kind   = kind   as FeedbackKind;
  if (tenantId)         where.tenantId = tenantId;
  if (days > 0)         where.createdAt = { gte: new Date(Date.now() - days * DAY_MS) };
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { body:    { contains: q, mode: "insensitive" } },
    ];
  }

  // ── time windows for KPI deltas ─────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const win7  = new Date(now.getTime() -  7 * DAY_MS);
  const win14 = new Date(now.getTime() - 14 * DAY_MS);

  // ── parallel data fetch ─────────────────────────────────────
  const [
    items,
    totalMatching,
    countsByStatus,
    countsByKind,
    new7d,
    newPrior7d,
    shipped30d,
    plannedRoadmap,
    inProgressRoadmap,
    shippedRoadmap,
    avgRatingRows,
  ] = await Promise.all([
    db.feedback.findMany({
      where,
      orderBy: sort === "VOTES"
        ? [{ voteCount: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }],
      take: 200,
    }),
    db.feedback.count({ where }),
    db.feedback.groupBy({ by: ["status"], _count: { _all: true } }),
    db.feedback.groupBy({ by: ["kind"],   _count: { _all: true } }),
    db.feedback.count({ where: { createdAt: { gte: win7 } } }),
    db.feedback.count({ where: { createdAt: { gte: win14, lt: win7 } } }),
    db.feedback.count({ where: { status: "SHIPPED", shippedAt: { gte: monthStart } } }),
    db.feedback.findMany({
      where: { status: "PLANNED" },
      orderBy: [{ voteCount: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, summary: true, voteCount: true, shippedAt: true },
    }),
    db.feedback.findMany({
      where: { status: "IN_PROGRESS" },
      orderBy: [{ voteCount: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: { id: true, summary: true, voteCount: true, shippedAt: true },
    }),
    db.feedback.findMany({
      where: { status: "SHIPPED" },
      orderBy: [{ shippedAt: "desc" }],
      take: 5,
      select: { id: true, summary: true, voteCount: true, shippedAt: true },
    }),
    db.feedback.findMany({
      where: { rating: { not: null } },
      select: { rating: true },
    }),
  ]);

  const byStatus = Object.fromEntries(countsByStatus.map((c) => [c.status, c._count._all])) as Partial<Record<FeedbackStatus, number>>;
  const byKind   = Object.fromEntries(countsByKind.map((c) => [c.kind, c._count._all])) as Partial<Record<FeedbackKind, number>>;

  const totalAll  = Object.values(byStatus).reduce((a, b) => a + (b ?? 0), 0);
  const avgRating = avgRatingRows.length === 0
    ? null
    : avgRatingRows.reduce((s, r) => s + (r.rating ?? 0), 0) / avgRatingRows.length;
  const topVoted  = await db.feedback.findFirst({
    where:    { status: { in: ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS"] } },
    orderBy:  [{ voteCount: "desc" }],
    select:   { id: true, summary: true, voteCount: true },
  });

  // Resolve tenant + user names in bulk for the visible items.
  const tenantIds = Array.from(new Set(items.map((f) => f.tenantId)));
  const userIds   = Array.from(new Set(items.map((f) => f.userId)));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({
          where:  { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    userIds.length
      ? db.user.findMany({
          where:  { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  // ── KPI tiles ───────────────────────────────────────────────
  const kpis: FeedbackKpi[] = [
    {
      label: "Total feedback",
      value: totalAll.toLocaleString(),
      hint: `${(byKind.IDEA ?? 0)} ideas · ${(byKind.BUG ?? 0)} bugs · ${(byKind.PRAISE ?? 0)} praise`,
    },
    {
      label: "New (7d)",
      value: new7d.toLocaleString(),
      hint: `vs ${newPrior7d} prior week`,
      deltaPct: pctDelta(new7d, newPrior7d),
      tone: new7d > 0 ? "accent" : "default",
    },
    {
      label: "Most-voted",
      value: topVoted ? `↑ ${topVoted.voteCount}` : "—",
      hint: topVoted ? topVoted.summary : "No votes yet",
      tone: "default",
    },
    {
      label: "Shipped this month",
      value: shipped30d.toLocaleString(),
      hint: shipped30d > 0 ? "Closed-out feedback" : "Nothing shipped yet",
      tone: shipped30d > 0 ? "success" : "default",
    },
    {
      label: "Avg rating",
      value: avgRating != null ? `${avgRating.toFixed(1)} ★` : "—",
      hint: avgRating != null ? `${avgRatingRows.length} rated` : "No ratings yet",
      tone: avgRating != null && avgRating >= 4 ? "success" : "default",
    },
  ];

  // ── Status chip row ─────────────────────────────────────────
  const statusChips: FeedbackChip[] = [
    { value: "ALL",          label: "All",           count: totalAll,                       tone: "default" },
    { value: "NEW",          label: "New",           count: byStatus.NEW          ?? 0,     tone: "accent"  },
    { value: "UNDER_REVIEW", label: "Under review",  count: byStatus.UNDER_REVIEW ?? 0,     tone: "accent"  },
    { value: "PLANNED",      label: "Planned",       count: byStatus.PLANNED      ?? 0,     tone: "accent"  },
    { value: "IN_PROGRESS",  label: "In progress",   count: byStatus.IN_PROGRESS  ?? 0,     tone: "warning" },
    { value: "SHIPPED",      label: "Shipped",       count: byStatus.SHIPPED      ?? 0,     tone: "success" },
    { value: "REJECTED",     label: "Rejected",      count: byStatus.REJECTED     ?? 0,     tone: "default" },
  ];

  // ── Kind chip row ──────────────────────────────────────────
  const kindChips: FeedbackChip[] = [
    { value: "ALL",    label: "All kinds", count: undefined,           tone: "default" },
    { value: "IDEA",   label: "💡 Ideas",   count: byKind.IDEA   ?? 0, tone: "accent"  },
    { value: "BUG",    label: "🐞 Bugs",    count: byKind.BUG    ?? 0, tone: "danger"  },
    { value: "PRAISE", label: "🙌 Praise",  count: byKind.PRAISE ?? 0, tone: "success" },
    { value: "OTHER",  label: "Other",      count: byKind.OTHER  ?? 0, tone: "default" },
  ];

  // ── Roadmap items ──────────────────────────────────────────
  const planned: RoadmapItem[]    = plannedRoadmap.map((f) => ({ id: f.id, summary: f.summary, voteCount: f.voteCount, shippedAt: f.shippedAt }));
  const inProgress: RoadmapItem[] = inProgressRoadmap.map((f) => ({ id: f.id, summary: f.summary, voteCount: f.voteCount, shippedAt: f.shippedAt }));
  const shipped: RoadmapItem[]    = shippedRoadmap.map((f) => ({ id: f.id, summary: f.summary, voteCount: f.voteCount, shippedAt: f.shippedAt }));

  const exportQs = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(kind !== "ALL" ? { kind } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(days ? { days: String(days) } : {}),
  }).toString();

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Feedback hub
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Ideas, requests, and praise from every tenant. Vote with your roadmap; ship with closure
            notes that auto-publish to the submitter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/platform/support"
            className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
            title="Bugs / errors / billing live in the support queue, not here."
          >
            Support queue →
          </Link>
          <a
            href={`/platform/feedback/export${exportQs ? `?${exportQs}` : ""}`}
            className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* ── KPI band ─────────────────────────────────────── */}
      <FeedbackKPIBand kpis={kpis} />

      {/* ── Roadmap strip ─────────────────────────────────── */}
      <FeedbackRoadmapStrip
        planned={planned}
        inProgress={inProgress}
        shipped={shipped}
      />

      {/* ── Search ───────────────────────────────────────── */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}
        {kind   !== "ALL" && <input type="hidden" name="kind"   value={kind} />}
        {tenantId          && <input type="hidden" name="tenantId" value={tenantId} />}
        {sort  !== "VOTES" && <input type="hidden" name="sort"   value={sort} />}
        <label className="block flex-1 min-w-[260px]">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Search
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Summary or details"
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
            Last N days
          </span>
          <input
            name="days"
            type="number"
            min={0}
            max={365}
            defaultValue={days || ""}
            placeholder="any"
            className="ts-focus w-24 rounded-md px-3 py-2 text-sm outline-none"
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
        {(q || status !== "ALL" || kind !== "ALL" || tenantId || days || sort !== "VOTES") && (
          <Link
            href="/platform/feedback"
            className="self-center text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Status chips ──────────────────────────────────── */}
      <FeedbackQuickFilters paramKey="status" chips={statusChips} defaultValue="ALL" />

      {/* ── Kind chips ────────────────────────────────────── */}
      <FeedbackQuickFilters paramKey="kind" chips={kindChips} defaultValue="ALL" />

      {/* ── Tenant filter pill (when active) ──────────────── */}
      {tenantId && (
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-primary)",
          }}
        >
          Filtered to tenant: <b>{tenantById.get(tenantId)?.name ?? tenantId.slice(0, 8)}</b>
          <Link
            href={`/platform/feedback${(q || status !== "ALL" || kind !== "ALL" || days)
              ? "?" + new URLSearchParams({
                ...(q ? { q } : {}),
                ...(status !== "ALL" ? { status } : {}),
                ...(kind !== "ALL" ? { kind } : {}),
                ...(days ? { days: String(days) } : {}),
              }).toString()
              : ""}`}
            className="text-xs underline"
            style={{ color: "var(--accent-primary)" }}
          >
            clear
          </Link>
        </div>
      )}

      {/* ── Sort toggle ──────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span>Sort:</span>
        <SortLink
          label="Most voted"
          active={sort === "VOTES"}
          href={buildSortHref(sp, "VOTES")}
        />
        <SortLink
          label="Most recent"
          active={sort === "RECENT"}
          href={buildSortHref(sp, "RECENT")}
        />
      </div>

      {/* ── Board ────────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>💡</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              {totalMatching === 0 && status === "ALL" && kind === "ALL" && !q && !tenantId && !days
                ? "No feedback yet — once tenants start submitting, ideas show up here."
                : "No feedback matches the current filters."}
            </div>
            {(q || status !== "ALL" || kind !== "ALL" || tenantId || days) && (
              <Link href="/platform/feedback" className="mt-2 inline-block text-xs underline">
                Clear filters
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {items.map((f, idx) => {
              const tenant = tenantById.get(f.tenantId);
              const user   = userById.get(f.userId);
              const statusTone = STATUS_TONE[f.status];
              const kindTone   = KIND_TONE[f.kind];
              return (
                <li
                  key={f.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <Link
                    href={`/platform/feedback/${f.id}`}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:opacity-95"
                  >
                    <VotePill count={f.voteCount} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: statusTone.bg, color: statusTone.fg, border: `1px solid ${statusTone.fg}` }}
                        >
                          {statusTone.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium"
                          style={{ color: kindTone.fg }}
                        >
                          <span aria-hidden>{kindTone.icon}</span>
                          {kindTone.label}
                        </span>
                        {typeof f.rating === "number" && (
                          <span className="text-[11px]" style={{ color: "var(--warning-fg)" }}>
                            {"★".repeat(f.rating)}
                            <span style={{ color: "var(--text-faint)" }}>{"★".repeat(5 - f.rating)}</span>
                          </span>
                        )}
                      </div>
                      <div
                        className="mt-1 truncate font-semibold"
                        style={{ color: "var(--text-default)" }}
                      >
                        {f.summary}
                      </div>
                      {f.body && (
                        <div className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
                          {f.body.slice(0, 220)}{f.body.length > 220 ? "…" : ""}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {tenant ? (
                          <>
                            <span style={{ color: "var(--text-default)" }}>{tenant.name}</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>unknown tenant</span>
                        )}
                        {user && <>· {user.name ?? user.email}</>}
                        {f.context && (
                          <>
                            {" · "}
                            <span className="font-mono">{f.context}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-xs" style={{ color: "var(--text-muted)" }}>
                      <div className="tabular-nums">
                        {f.createdAt.toISOString().slice(0, 10)}
                      </div>
                      {f.shippedAt && (
                        <div className="mt-0.5 text-[10px]" style={{ color: "var(--success-fg)" }}>
                          shipped {f.shippedAt.toISOString().slice(0, 10)}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {items.length >= 200 && (
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Showing the first 200 by current sort. Tighten filters or use CSV export for a wider window.
        </p>
      )}

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        <b style={{ color: "var(--text-muted)" }}>Support vs. feedback:</b> bug reports, errors, and "this
        is broken" go to the{" "}
        <Link href="/platform/support" className="underline">support queue</Link>. The hub here is for
        ideas, requests, and product direction.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */

function VotePill({ count }: { count: number }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center rounded-md px-3 py-2"
      style={{
        background: count > 0 ? "var(--accent-surface)" : "var(--surface-2)",
        border: `1px solid ${count > 0 ? "var(--accent-primary)" : "var(--border-default)"}`,
        minWidth: "56px",
      }}
    >
      <span
        className="text-xs leading-none"
        aria-hidden
        style={{ color: count > 0 ? "var(--accent-primary)" : "var(--text-muted)" }}
      >
        ↑
      </span>
      <span
        className="mt-1 text-sm font-semibold tabular-nums"
        style={{ color: count > 0 ? "var(--accent-primary)" : "var(--text-default)" }}
      >
        {count}
      </span>
    </div>
  );
}

function SortLink({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="ts-focus rounded-md px-2 py-0.5 text-xs"
      style={{
        background: active ? "var(--surface-2)" : "transparent",
        color: active ? "var(--text-default)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--border-default)" : "transparent"}`,
      }}
    >
      {label}
    </Link>
  );
}

function buildSortHref(
  sp: { q?: string; status?: string; kind?: string; tenantId?: string; days?: string },
  next: string,
): string {
  const u = new URLSearchParams();
  if (sp.q)        u.set("q", sp.q);
  if (sp.status && sp.status !== "ALL") u.set("status", sp.status);
  if (sp.kind   && sp.kind !== "ALL")   u.set("kind", sp.kind);
  if (sp.tenantId) u.set("tenantId", sp.tenantId);
  if (sp.days)     u.set("days", sp.days);
  if (next !== "VOTES") u.set("sort", next);
  const qs = u.toString();
  return qs ? `/platform/feedback?${qs}` : "/platform/feedback";
}

function pctDelta(current: number, prior: number): number | undefined {
  if (prior <= 0) return current > 0 ? 1 : undefined;
  return (current - prior) / prior;
}
