import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { computeTenantHealth, environmentColor, healthColor } from "@/lib/tenant-health";
import { cohortLabel, cohortChip } from "@/lib/cohorts";
import { formatBytes, GB_IN_BYTES } from "@/lib/storage-quota";
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements";
import { TenantsKPIBand, type TenantKpi } from "@/components/platform/TenantsKPIBand";
import {
  TenantsQuickFilters,
  type QuickFilterChip,
} from "@/components/platform/TenantsQuickFilters";
import { TenantRowActions } from "@/components/platform/TenantRowActions";
import { TenantsSortableTh } from "@/components/platform/TenantsSortableTh";
import { TenantsPagination } from "@/components/platform/TenantsPagination";
import type { BetaCohort, Plan, Prisma, TenantStatus } from "@prisma/client";

// Premium tenants admin page.
//
// Layout (top to bottom):
//   1. Header — title + "{N} shown" count
//   2. KPI band — total / active / trial / past due / new (30d)
//   3. Quick filter chips — one-click status switch with live counts
//   4. Search + filters form (text query, env, cohort, archived toggle)
//   5. Tenants table — sortable headers, MRR column, avatar chip,
//      health pill, status pill, storage usage, per-row actions menu
//   6. Pagination — prev/next via ?page=N

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ["ALL", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "ARCHIVED"] as const;
const ENV_OPTIONS    = ["ALL", "LIVE", "DEMO", "TEST"] as const;
const COHORT_FILTER_OPTIONS = ["ALL", "NONE", "ALPHA", "BETA", "PILOT"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type EnvFilter    = (typeof ENV_OPTIONS)[number];
type CohortFilter = (typeof COHORT_FILTER_OPTIONS)[number];

// Sort columns we accept from ?sort=. Map to Prisma's orderBy shape.
const SORT_MAP: Record<string, (dir: "asc" | "desc") => Prisma.TenantOrderByWithRelationInput> = {
  name:        (dir) => ({ name: dir }),
  status:      (dir) => ({ status: dir }),
  plan:        (dir) => ({ plan: dir }),
  created:     (dir) => ({ createdAt: dir }),
  activity:    (dir) => ({ lastActivityAt: { sort: dir, nulls: "last" } as Prisma.SortOrderInput }),
};

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    env?: string;
    cohort?: string;
    includeArchived?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusParam = (sp.status ?? "ALL").toUpperCase();
  const envParam    = (sp.env ?? "ALL").toUpperCase();
  const cohortParam = (sp.cohort ?? "ALL").toUpperCase();
  const status: StatusFilter = (STATUS_OPTIONS as readonly string[]).includes(statusParam)
    ? (statusParam as StatusFilter)
    : "ALL";
  const env: EnvFilter = (ENV_OPTIONS as readonly string[]).includes(envParam)
    ? (envParam as EnvFilter)
    : "ALL";
  const cohort: CohortFilter = (COHORT_FILTER_OPTIONS as readonly string[]).includes(cohortParam)
    ? (cohortParam as CohortFilter)
    : "ALL";
  const showArchived = sp.includeArchived === "1" || status === "ARCHIVED";

  const sortKey = sp.sort && Object.hasOwn(SORT_MAP, sp.sort) ? sp.sort : null;
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.TenantOrderByWithRelationInput[] = sortKey
    ? [SORT_MAP[sortKey]!(sortDir)]
    : [
        { lastActivityAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ];

  const page = Math.max(1, Number(sp.page ?? "1"));

  // ── Where clause — shared across list query + total count ────────
  const where: Prisma.TenantWhereInput = {};
  if (status !== "ALL") where.status = status;
  if (status === "ALL" && !showArchived) where.status = { not: "ARCHIVED" };
  if (env !== "ALL") where.environment = env;
  if (cohort !== "ALL") where.betaCohort = cohort as BetaCohort;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const day = 86_400_000;
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * day);
  const last60 = new Date(now.getTime() - 60 * day);

  // ── Parallel data fetch ──────────────────────────────────────────
  const [
    statusCounts,
    new30,
    newPrev30,
    activeByPlan,
    listTotal,
    tenants,
    allPlans,
  ] = await Promise.all([
    db.tenant.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.tenant.count({ where: { createdAt: { gte: last30 } } }),
    db.tenant.count({ where: { createdAt: { gte: last60, lt: last30 } } }),
    db.tenant.groupBy({
      by: ["plan"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.tenant.count({ where }),
    db.tenant.findMany({
      where,
      orderBy,
      include: { _count: { select: { memberships: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.pricingPlan.findMany({
      where: { status: { in: ["PUBLISHED", "HIDDEN"] } },
      select: { slug: true, priceMonthly: true, name: true },
    }),
  ]);

  // ── Storage batch ────────────────────────────────────────────────
  const tenantIds = tenants.map((t) => t.id);
  const usageRows = tenantIds.length
    ? await db.file.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds } },
        _sum: { sizeBytes: true },
      })
    : [];
  const usageByTenant = new Map<string, number>();
  for (const r of usageRows) {
    usageByTenant.set(r.tenantId, r._sum.sizeBytes ?? 0);
  }

  // ── KPI computation ─────────────────────────────────────────────
  const statusCountMap = new Map<TenantStatus, number>();
  for (const r of statusCounts) statusCountMap.set(r.status, r._count._all);
  const totalAll = Array.from(statusCountMap.values()).reduce((a, b) => a + b, 0);
  const totalNonArchived = totalAll - (statusCountMap.get("ARCHIVED") ?? 0);
  const activeCount   = statusCountMap.get("ACTIVE") ?? 0;
  const trialCount    = statusCountMap.get("TRIAL") ?? 0;
  const pastDueCount  = statusCountMap.get("PAST_DUE") ?? 0;
  const suspendedCount = statusCountMap.get("SUSPENDED") ?? 0;
  const canceledCount = (statusCountMap.get("CANCELED") ?? 0) + (statusCountMap.get("ARCHIVED") ?? 0);

  const newGrowthPct = newPrev30 === 0
    ? (new30 > 0 ? 1 : 0)
    : (new30 - newPrev30) / newPrev30;

  // MRR per plan (price × active count) — one row per plan slug,
  // looked up against the activeByPlan groupBy keyed on Plan enum.
  const priceByEnum = new Map<string, number>();
  for (const p of allPlans) {
    priceByEnum.set(p.slug.toUpperCase(), Number(p.priceMonthly ?? 0));
  }
  let mrr = 0;
  for (const row of activeByPlan) {
    mrr += (priceByEnum.get(row.plan) ?? 0) * row._count._all;
  }

  const kpis: TenantKpi[] = [
    {
      label: "Total tenants",
      value: totalNonArchived.toLocaleString(),
      hint: `${canceledCount} canceled / archived`,
    },
    {
      label: "Active",
      value: activeCount.toLocaleString(),
      hint: `${fmtUsdShort(mrr)} MRR`,
      tone: "success",
    },
    {
      label: "Trial",
      value: trialCount.toLocaleString(),
      hint: trialCount === 0 ? "No active trials" : "Conversion opportunity",
      tone: "accent",
    },
    {
      label: "Past due",
      value: pastDueCount.toLocaleString(),
      hint:
        pastDueCount + suspendedCount === 0
          ? "All clear"
          : `${suspendedCount} suspended`,
      tone: pastDueCount > 0 ? "warning" : "default",
      deltaInvert: true,
    },
    {
      label: "New (30d)",
      value: new30.toLocaleString(),
      hint: `vs ${newPrev30} prior 30d`,
      deltaPct: newGrowthPct,
    },
  ];

  // ── Quick filter chips ──────────────────────────────────────────
  const chips: QuickFilterChip[] = [
    { value: "ALL",       label: "All",       count: totalNonArchived },
    { value: "ACTIVE",    label: "Active",    count: activeCount,    tone: "success" },
    { value: "TRIAL",     label: "Trial",     count: trialCount,     tone: "accent"  },
    { value: "PAST_DUE",  label: "Past due",  count: pastDueCount,   tone: "warning" },
    { value: "SUSPENDED", label: "Suspended", count: suspendedCount, tone: "danger"  },
  ];

  // ── Render ───────────────────────────────────────────────────────
  const planNameByEnum = new Map<string, string>();
  for (const p of allPlans) planNameByEnum.set(p.slug.toUpperCase(), p.name);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            Tenants
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Every account using Flowtora — health, plan, storage, and quick links.
          </p>
        </div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {listTotal.toLocaleString()} match · showing {tenants.length}
        </div>
      </header>

      <TenantsKPIBand kpis={kpis} />

      <TenantsQuickFilters chips={chips} />

      {/* Search / advanced filter row — same form-based controls but
          re-styled to match the chip rail above. */}
      <form
        className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
        method="get"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Preserve current sort + page across submits — the form
            replaces the URL by default, dropping anything not in the form. */}
        {sortKey && <input type="hidden" name="sort" value={sortKey} />}
        {sortKey && <input type="hidden" name="dir"  value={sortDir} />}
        {/* Status is owned by the chip rail; preserve it in the form too. */}
        {status !== "ALL" && <input type="hidden" name="status" value={status} />}

        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or slug…"
          className="ts-focus flex-1 min-w-[220px] rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        <Select name="env" defaultValue={env} options={ENV_OPTIONS as readonly string[]} label="Env" />
        <Select
          name="cohort"
          defaultValue={cohort}
          options={COHORT_FILTER_OPTIONS as readonly string[]}
          label="Cohort"
          renderLabel={(c) => (c === "NONE" ? "GA" : c)}
        />
        <label
          className="inline-flex items-center gap-2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <input
            type="checkbox"
            name="includeArchived"
            value="1"
            defaultChecked={showArchived}
          />
          Archived
        </label>
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || env !== "ALL" || cohort !== "ALL" || showArchived) && (
          <Link
            href="/platform/tenants"
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Tenants table ───────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <TenantsSortableTh column="name">Tenant</TenantsSortableTh>
                <TenantsSortableTh column="plan">Plan · MRR</TenantsSortableTh>
                <TenantsSortableTh column="status">Status</TenantsSortableTh>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Health
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Users
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  Storage
                </th>
                <TenantsSortableTh column="activity">Last activity</TenantsSortableTh>
                <TenantsSortableTh column="created">Created</TenantsSortableTh>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center"
                    style={{ color: "var(--text-muted)" }}
                  >
                    No tenants match the current filters.
                  </td>
                </tr>
              )}
              {tenants.map((t) => {
                const health = computeTenantHealth(t);
                const envChip = environmentColor(t.environment);
                const hc = healthColor(health.level);
                const planMrr = priceByEnum.get(t.plan) ?? 0;
                const planLabel = planNameByEnum.get(t.plan) ?? t.plan.toLowerCase();
                return (
                  <tr
                    key={t.id}
                    className="transition-colors hover:bg-[var(--surface-2)]"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.name} logoUrl={t.logoUrl} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/platform/tenants/${t.id}`}
                              className="truncate text-sm font-medium underline"
                              style={{ color: "var(--text-default)" }}
                            >
                              {t.name}
                            </Link>
                            <EnvChip envChip={envChip} />
                            {t.betaCohort !== "NONE" && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  background: cohortChip(t.betaCohort).bg,
                                  color: cohortChip(t.betaCohort).fg,
                                }}
                              >
                                {cohortLabel(t.betaCohort)}
                              </span>
                            )}
                            {t.adminTags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                style={{
                                  background: "var(--accent-surface)",
                                  color: "var(--accent-primary)",
                                  border: "1px solid var(--accent-primary)",
                                }}
                                title="Admin tag"
                              >
                                {tag}
                              </span>
                            ))}
                            {t.adminTags.length > 3 && (
                              <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                                +{t.adminTags.length - 3}
                              </span>
                            )}
                          </div>
                          <div
                            className="truncate text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {t.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="text-sm"
                        style={{ color: "var(--text-default)" }}
                      >
                        {planLabel}
                      </div>
                      <div
                        className="text-xs tabular-nums"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {planMrr > 0 ? `${fmtUsdShort(planMrr)}/mo` : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={t.status} />
                        {t.dunningStage !== "NONE" && t.dunningStage !== "RESOLVED" && (
                          <DunningChip stage={t.dunningStage} paused={!!t.dunningPausedAt} />
                        )}
                        {t.activeCouponId && (
                          <Link
                            href="/platform/billing/coupons"
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: "var(--accent-surface)",
                              color: "var(--accent-primary)",
                              border: "1px solid var(--accent-primary)",
                            }}
                            title="Active coupon attached — applies to next manual invoice"
                          >
                            ★ Coupon
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
                        style={{ background: hc.bg, color: hc.fg }}
                        title={health.signals.join(" · ")}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ background: hc.fg }}
                        />
                        {health.label}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums"
                      style={{ color: "var(--text-default)" }}
                    >
                      {t._count.memberships}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <StorageCell
                        usedBytes={usageByTenant.get(t.id) ?? 0}
                        quotaGB={PLAN_ENTITLEMENTS[t.plan as Plan].limits.storageQuotaGB}
                      />
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {health.daysInactive === 0 ? "today" : `${health.daysInactive}d ago`}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TenantRowActions tenantId={t.id} tenantSlug={t.slug} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {listTotal > PAGE_SIZE && (
          <TenantsPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={listTotal}
          />
        )}
      </div>
    </div>
  );
}

// ── Inline primitives ─────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const palette = (() => {
    switch (status) {
      case "ACTIVE":    return { bg: "var(--success-surface)", fg: "var(--success-fg)" };
      case "TRIAL":     return { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" };
      case "PAST_DUE":  return { bg: "var(--warning-surface)", fg: "var(--warning-fg)" };
      case "SUSPENDED": return { bg: "var(--danger-surface)",  fg: "var(--danger-fg)" };
      case "ARCHIVED":  return { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
      case "CANCELED":  return { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
      default:          return { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
    }
  })();
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {status.toLowerCase().replace("_", " ")}
    </span>
  );
}

function DunningChip({ stage, paused }: { stage: string; paused: boolean }) {
  // Phase 3 — at-a-glance dunning indicator on the tenants list. Only
  // renders when the stage is meaningful (not NONE / RESOLVED).
  const palette =
    paused                       ? { bg: "var(--surface-2)",       fg: "var(--text-muted)" } :
    stage === "SUSPEND"          ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"  } :
    stage === "FINAL_NOTICE"     ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"  } :
    stage === "REMINDER_2"       ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" } :
                                   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" };
  const labels: Record<string, string> = {
    PAYMENT_FAILED: "DUNNING · 1",
    REMINDER_1:     "DUNNING · 2",
    REMINDER_2:     "DUNNING · 3",
    FINAL_NOTICE:   "DUNNING · 4",
    SUSPEND:        "DUNNING · 5",
  };
  return (
    <Link
      href="/platform/billing/dunning"
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
      title={paused ? "Dunning paused — operator override" : `Dunning stage: ${stage.replace(/_/g, " ").toLowerCase()}`}
    >
      {paused ? "DUNNING · paused" : labels[stage] ?? stage}
    </Link>
  );
}

function EnvChip({ envChip }: { envChip: { bg: string; fg: string; label: string } }) {
  if (envChip.label === "Live") return null; // most rows are live; skip the chip noise
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: envChip.bg, color: envChip.fg }}
    >
      {envChip.label}
    </span>
  );
}

function StorageCell({
  usedBytes,
  quotaGB,
}: {
  usedBytes: number;
  quotaGB: number | null;
}) {
  const used = formatBytes(usedBytes);
  if (quotaGB === null) {
    return (
      <div>
        <div style={{ color: "var(--text-default)" }}>{used}</div>
        <div style={{ color: "var(--text-faint)" }}>of unlimited</div>
      </div>
    );
  }
  const quotaBytes = quotaGB * GB_IN_BYTES;
  const pct = Math.min(1, usedBytes / quotaBytes);
  const tone =
    pct >= 1 ? "var(--danger-fg)" :
    pct >= 0.85 ? "var(--warning-fg)" :
    "var(--text-muted)";
  return (
    <div>
      <div style={{ color: tone, fontWeight: pct >= 0.85 ? 600 : 400 }}>{used}</div>
      <div className="mt-1 h-1 w-20 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background:
              pct >= 1 ? "var(--danger-fg)" :
              pct >= 0.85 ? "var(--warning-fg)" :
              "var(--accent-primary)",
          }}
        />
      </div>
      <div className="mt-0.5" style={{ color: "var(--text-faint)" }}>
        {Math.round(pct * 100)}% of {quotaGB} GB
      </div>
    </div>
  );
}

function Avatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?";
  return (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold"
      style={{
        background: "var(--accent-surface)",
        color: "var(--accent-primary)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

function Select({
  name,
  defaultValue,
  options,
  label,
  renderLabel,
}: {
  name: string;
  defaultValue: string;
  options: readonly string[];
  label: string;
  renderLabel?: (v: string) => string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="ts-focus rounded-md px-2 py-1.5 text-sm outline-none"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {renderLabel ? renderLabel(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function fmtUsdShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
