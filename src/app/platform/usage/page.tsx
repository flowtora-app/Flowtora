import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { TrendChart } from "@/components/charts/TrendChart";
import { RevenueDateRangePicker } from "@/components/platform/RevenueDateRangePicker";
import { resolveRange, resolveRangeKey, type RangeKey } from "@/lib/revenue-range";
import { RevenueMetricCard } from "@/components/platform/RevenueMetricCard";
import {
  RevenueInsightStrip,
  type RevenueInsight,
} from "@/components/platform/RevenueInsightStrip";
import {
  UsageHealthBreakdown,
  type UsageHealthBuckets,
} from "@/components/platform/UsageHealthBreakdown";
import {
  UsageAdoptionBars,
  type AdoptionRow,
} from "@/components/platform/UsageAdoptionBars";

// Premium usage & adoption analytics.
//
// Layout (top to bottom):
//   1. Header — title + URL date-range picker
//   2. Insight strip — auto-generated, ranked alerts
//   3. Hero metrics — 4 cards with sparklines + period deltas:
//        Active tenants · MAU · Engagement % · Sign-ups
//   4. Daily activity trend (line chart, 30 days, distinct active users)
//      + Tenant health breakdown (Healthy / At Risk / Dormant)
//   5. Module adoption bars + Active members by plan
//   6. Power users + Dormant tenants tables
//
// Data sources:
//   - Tenant.lastActivityAt + .createdAt for tenant-level activity
//   - User.lastLoginAt for MAU/WAU
//   - AuditLog (tenantId + userId + createdAt) for the daily trend —
//     gives us a real per-day distinct-user count instead of a single
//     "last login" snapshot
//   - Module tables (Quote/Order/Invoice/...) for adoption %
//
// All compute server-side from existing tables — no separate
// telemetry pipeline required.

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

type SP = Promise<{ range?: string }>;

interface TenantHealthInputs {
  /** lastActivityAt timestamp on the Tenant row (any audit-log write). */
  lastActivityAt: Date | null;
  /** Whether the tenant has any record in any module in the last 30d. */
  hasRecent30d: boolean;
}

function classifyHealth(t: TenantHealthInputs, now: Date): "healthy" | "atRisk" | "dormant" {
  if (!t.lastActivityAt) return "dormant";
  const ageDays = (now.getTime() - t.lastActivityAt.getTime()) / DAY_MS;
  if (ageDays > 30) return "dormant";
  if (ageDays <= 7 && t.hasRecent30d) return "healthy";
  return "atRisk";
}

export default async function PlatformUsagePage({
  searchParams,
}: {
  searchParams: SP;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const rangeKey: RangeKey = resolveRangeKey(sp.range);
  const range = resolveRange(rangeKey);

  const now = new Date();
  const day = DAY_MS;
  const last7d = new Date(now.getTime() - 7 * day);
  const last30d = new Date(now.getTime() - 30 * day);
  const last60d = new Date(now.getTime() - 60 * day);

  // ── Parallel data fetch ──────────────────────────────────────────
  const [
    tenants,
    membersActive7d,
    membersActive30d,
    membersActivePrev30d,
    activeAuditLogs30d,
    newSignupsRange,
    newSignupsPrev,
    quoteStats30, quoteAll, quoteTenants,
    orderStats30, orderAll, orderTenants,
    invoiceStats30, invoiceAll, invoiceTenants,
    proofStats30, proofAll, proofTenants,
    installStats30, installAll, installTenants,
    taskStats30, taskAll, taskTenants,
    customerStats30, customerAll, customerTenants,
    onboardingDone,
    activeMembersByPlanRows,
    topEngagedTenants,
    plansForLabel,
  ] = await Promise.all([
    db.tenant.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      select: {
        id: true, name: true, slug: true, plan: true, status: true,
        createdAt: true, lastActivityAt: true,
        _count: {
          select: { memberships: true, quotes: true, orders: true, invoices: true },
        },
      },
    }),
    db.user.count({
      where: { lastLoginAt: { gte: last7d }, memberships: { some: {} } },
    }),
    db.user.count({
      where: { lastLoginAt: { gte: last30d }, memberships: { some: {} } },
    }),
    db.user.count({
      where: {
        lastLoginAt: { gte: last60d, lt: last30d },
        memberships: { some: {} },
      },
    }),
    // Per-day distinct active users from the audit log — used for the
    // 30-day DAU sparkline + main trend chart.
    db.auditLog.findMany({
      where: { createdAt: { gte: last30d }, userId: { not: null } },
      select: { userId: true, createdAt: true },
    }),
    db.tenant.count({
      where: { createdAt: { gte: range.start, lt: range.end } },
    }),
    db.tenant.count({
      where: { createdAt: { gte: range.prevStart, lt: range.prevEnd } },
    }),

    db.quote.count({ where: { createdAt: { gte: last30d } } }),
    db.quote.count(),
    db.quote.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.order.count({ where: { createdAt: { gte: last30d } } }),
    db.order.count(),
    db.order.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.invoice.count({ where: { createdAt: { gte: last30d } } }),
    db.invoice.count(),
    db.invoice.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.proof.count({ where: { createdAt: { gte: last30d } } }),
    db.proof.count(),
    db.proof.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.installEvent.count({ where: { createdAt: { gte: last30d } } }),
    db.installEvent.count(),
    db.installEvent.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.task.count({ where: { createdAt: { gte: last30d } } }),
    db.task.count(),
    db.task.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.customer.count({ where: { createdAt: { gte: last30d } } }),
    db.customer.count(),
    db.customer.findMany({ distinct: ["tenantId"], select: { tenantId: true } }),

    db.tenant.count({ where: { onboardingCompletedAt: { not: null } } }),
    db.membership.findMany({
      where: { user: { lastLoginAt: { gte: last30d } } },
      select: { tenantId: true, tenant: { select: { plan: true } } },
    }),
    db.tenant.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      orderBy: { memberships: { _count: "desc" } },
      take: 8,
      select: {
        id: true, name: true, plan: true, status: true,
        _count: {
          select: { memberships: true, quotes: true, orders: true, invoices: true },
        },
      },
    }),
    db.pricingPlan.findMany({
      where: { status: { in: ["PUBLISHED", "HIDDEN"] } },
      select: { slug: true, name: true },
    }),
  ]);

  // ── Tenant-level recent-activity index ──────────────────────────
  // For health classification we need to know per-tenant whether
  // they've created ANY record in the last 30 days. We collect
  // 30d-distinct tenant lists from each module in a second batch.
  const tenantsWithRecent = new Set<string>();
  const recentDistincts = await Promise.all([
    db.quote.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
    db.order.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
    db.invoice.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
    db.proof.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
    db.installEvent.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
    db.task.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
    db.customer.findMany({
      where: { createdAt: { gte: last30d } },
      distinct: ["tenantId"], select: { tenantId: true },
    }),
  ]);
  for (const list of recentDistincts) {
    for (const r of list) tenantsWithRecent.add(r.tenantId);
  }

  // ── Tenant health classification ─────────────────────────────────
  let healthy = 0, atRisk = 0, dormant = 0;
  const dormantList: typeof tenants = [];
  for (const t of tenants) {
    const h = classifyHealth(
      { lastActivityAt: t.lastActivityAt, hasRecent30d: tenantsWithRecent.has(t.id) },
      now,
    );
    if (h === "healthy") healthy++;
    else if (h === "atRisk") atRisk++;
    else { dormant++; dormantList.push(t); }
  }
  const totalTrackedTenants = tenants.length;
  const buckets: UsageHealthBuckets = { healthy, atRisk, dormant };

  // ── Daily DAU buckets from the audit log ─────────────────────────
  const dauByDay = Array.from({ length: 30 }, () => new Set<string>());
  for (const a of activeAuditLogs30d) {
    if (!a.userId) continue;
    const idx = Math.floor((a.createdAt.getTime() - last30d.getTime()) / day);
    if (idx >= 0 && idx < 30) dauByDay[idx]!.add(a.userId);
  }
  const dauSeries = dauByDay.map((s) => s.size);
  const dauToday = dauSeries[dauSeries.length - 1] ?? 0;

  // ── Tenant-active series + active-tenants count from audit log ──
  const tenantAuditLogs30 = await db.auditLog.findMany({
    where: { createdAt: { gte: last30d }, tenantId: { not: null } },
    select: { tenantId: true, createdAt: true },
  });
  const activeTenantIds = new Set<string>();
  const tenantActiveByDay = Array.from({ length: 30 }, () => new Set<string>());
  for (const a of tenantAuditLogs30) {
    if (!a.tenantId) continue;
    activeTenantIds.add(a.tenantId);
    const idx = Math.floor((a.createdAt.getTime() - last30d.getTime()) / day);
    if (idx >= 0 && idx < 30) tenantActiveByDay[idx]!.add(a.tenantId);
  }
  const activeTenants30 = activeTenantIds.size;
  const tenantSparkSeries = tenantActiveByDay.map((s) => s.size);

  const engagementRate = totalTrackedTenants > 0
    ? activeTenants30 / totalTrackedTenants
    : 0;

  const mauDeltaPct = membersActivePrev30d === 0
    ? (membersActive30d > 0 ? 1 : 0)
    : (membersActive30d - membersActivePrev30d) / membersActivePrev30d;

  const signupsDeltaPct = newSignupsPrev === 0
    ? (newSignupsRange > 0 ? 1 : 0)
    : (newSignupsRange - newSignupsPrev) / newSignupsPrev;

  // ── Trend chart data — 30 days of DAU ────────────────────────────
  const trendData = dauSeries.map((value, i) => {
    const d = new Date(last30d.getTime() + i * day);
    return {
      label: d.toISOString().slice(5, 10), // MM-DD
      "Active users": value,
    };
  });

  // ── Module adoption rows ─────────────────────────────────────────
  const moduleRows: AdoptionRow[] = [
    { label: "Customers",      tenantsUsing: customerTenants.length, recordsAll: customerAll, records30d: customerStats30 },
    { label: "Quotes",         tenantsUsing: quoteTenants.length,    recordsAll: quoteAll,    records30d: quoteStats30 },
    { label: "Orders",         tenantsUsing: orderTenants.length,    recordsAll: orderAll,    records30d: orderStats30 },
    { label: "Proofs",         tenantsUsing: proofTenants.length,    recordsAll: proofAll,    records30d: proofStats30 },
    { label: "Invoices",       tenantsUsing: invoiceTenants.length,  recordsAll: invoiceAll,  records30d: invoiceStats30 },
    { label: "Install events", tenantsUsing: installTenants.length,  recordsAll: installAll,  records30d: installStats30 },
    { label: "Tasks",          tenantsUsing: taskTenants.length,     recordsAll: taskAll,     records30d: taskStats30 },
  ].sort((a, b) => b.tenantsUsing - a.tenantsUsing);

  // ── Active members by plan ───────────────────────────────────────
  const activeMembersByPlan = new Map<string, number>();
  for (const m of activeMembersByPlanRows) {
    const k = m.tenant.plan;
    activeMembersByPlan.set(k, (activeMembersByPlan.get(k) ?? 0) + 1);
  }
  const planLabelByEnum = new Map<string, string>();
  for (const p of plansForLabel) planLabelByEnum.set(p.slug.toUpperCase(), p.name);

  // Onboarding rate — used in the insight strip.
  const onboardingRate = totalTrackedTenants === 0
    ? 0
    : Math.round((onboardingDone / totalTrackedTenants) * 1000) / 10;

  // ── Insights ─────────────────────────────────────────────────────
  const insights = buildUsageInsights({
    dormantCount: dormant,
    atRiskCount: atRisk,
    totalTenants: totalTrackedTenants,
    mauDeltaPct,
    onboardingRate,
    topModule: moduleRows[0],
    bottomModule: moduleRows[moduleRows.length - 1],
    activeTenants30,
    signupsDeltaPct,
  });

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            Usage &amp; adoption
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {range.label} · how the platform is being used and where engagement is slipping.
          </p>
        </div>
        <RevenueDateRangePicker />
      </header>

      <RevenueInsightStrip insights={insights} />

      {/* ── Hero metrics ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueMetricCard
          label="Active tenants (30d)"
          value={activeTenants30.toLocaleString()}
          hint={`${(engagementRate * 100).toFixed(0)}% of ${totalTrackedTenants} live tenants`}
          spark={tenantSparkSeries}
          tone="accent"
        />
        <RevenueMetricCard
          label="Active members (30d)"
          value={membersActive30d.toLocaleString()}
          hint={`${membersActive7d} in the last 7d · ${dauToday} today`}
          deltaPct={mauDeltaPct}
          spark={dauSeries}
        />
        <RevenueMetricCard
          label="Engagement rate"
          value={`${(engagementRate * 100).toFixed(0)}%`}
          hint={`${activeTenants30} of ${totalTrackedTenants} live tenants active in 30d`}
        />
        <RevenueMetricCard
          label={`New sign-ups (${range.label.toLowerCase()})`}
          value={newSignupsRange.toLocaleString()}
          hint={`vs ${newSignupsPrev} prior period · ${onboardingRate}% finished onboarding`}
          deltaPct={signupsDeltaPct}
        />
      </div>

      {/* ── Daily activity trend + tenant health side-by-side ──── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Daily active users (30d)"
            description="Distinct member logins per day, from the audit log."
          />
          <div className="px-5 pb-2 pt-2">
            {dauSeries.some((v) => v > 0) ? (
              <TrendChart
                data={trendData}
                series={[{ key: "Active users", label: "Active users", color: "var(--accent-primary)" }]}
                height={240}
                filled
              />
            ) : (
              <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No audited activity in the last 30 days.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Tenant health"
            description={`${totalTrackedTenants} live tenants tracked`}
          />
          <div className="px-5 pb-5 pt-3">
            <UsageHealthBreakdown buckets={buckets} total={totalTrackedTenants} />
          </div>
        </Card>
      </div>

      {/* ── Adoption + plan-mix ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Module adoption"
            description="Share of tracked tenants who have ever created a record per module · most-adopted first."
          />
          <div className="px-5 pb-5 pt-4">
            <UsageAdoptionBars
              rows={moduleRows}
              totalActiveTenants={totalTrackedTenants}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Active members by plan"
            description="Distinct members logged in within the last 30 days."
          />
          {plansForLabel.length === 0 ? (
            <Empty>No published plans configured yet.</Empty>
          ) : (
            <ul>
              {plansForLabel.map((p) => {
                const enumKey = p.slug.toUpperCase();
                const count = activeMembersByPlan.get(enumKey) ?? 0;
                const totalActiveAcrossPlans = Array.from(activeMembersByPlan.values()).reduce(
                  (s, n) => s + n,
                  0,
                );
                const share = totalActiveAcrossPlans === 0
                  ? 0
                  : Math.round((count / totalActiveAcrossPlans) * 100);
                return (
                  <li
                    key={p.slug}
                    className="px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-default)" }}
                      >
                        {p.name}
                      </span>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--text-default)" }}
                      >
                        {count}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--surface-3)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, background: "var(--accent-primary)" }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Power users + dormant ───────────────────────────────── */}
      <div id="dormant-list" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Power users"
            description="Highest-engagement tenants by team size + records · your product showcases."
          />
          {topEngagedTenants.length === 0 ? (
            <Empty>No tenant data yet.</Empty>
          ) : (
            <ul>
              {topEngagedTenants.map((t, i) => {
                const total = t._count.quotes + t._count.orders + t._count.invoices;
                return (
                  <li
                    key={t.id}
                    className="px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
                        style={{
                          background: i < 3 ? "var(--success-surface)" : "var(--surface-2)",
                          color: i < 3 ? "var(--success-fg)" : "var(--text-muted)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/platform/tenants/${t.id}`}
                          className="truncate text-sm font-medium underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {t.name}
                        </Link>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {planLabelByEnum.get(t.plan) ?? t.plan.toLowerCase()} ·{" "}
                          {t._count.memberships} member{t._count.memberships === 1 ? "" : "s"} ·{" "}
                          {total.toLocaleString()} record{total === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="At risk / dormant"
            description={
              dormantList.length === 0
                ? "Engagement is healthy across the board."
                : `${dormantList.length} live tenants with no activity in 30+ days`
            }
            tone={dormantList.length > 0 ? "warning" : "neutral"}
          />
          {dormantList.length === 0 ? (
            <Empty>No dormant tenants.</Empty>
          ) : (
            <ul>
              {dormantList.slice(0, 8).map((t) => {
                const ageDays = Math.ceil(
                  (Date.now() - t.createdAt.getTime()) / day,
                );
                const lastSeen = t.lastActivityAt
                  ? Math.ceil((Date.now() - t.lastActivityAt.getTime()) / day)
                  : null;
                return (
                  <li
                    key={t.id}
                    className="px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/platform/tenants/${t.id}`}
                          className="truncate text-sm font-medium underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {t.name}
                        </Link>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {planLabelByEnum.get(t.plan) ?? t.plan.toLowerCase()} ·{" "}
                          created {ageDays}d ago
                          {lastSeen != null && lastSeen !== ageDays
                            ? ` · last seen ${lastSeen}d ago`
                            : " · never seen"}
                        </div>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                        style={{
                          background: "var(--warning-surface)",
                          color: "var(--warning-fg)",
                        }}
                      >
                        At risk
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Insight generator ─────────────────────────────────────────────

function buildUsageInsights(args: {
  dormantCount: number;
  atRiskCount: number;
  totalTenants: number;
  mauDeltaPct: number;
  onboardingRate: number;
  topModule?: AdoptionRow;
  bottomModule?: AdoptionRow;
  activeTenants30: number;
  signupsDeltaPct: number;
}): RevenueInsight[] {
  const out: RevenueInsight[] = [];

  if (args.dormantCount > 0) {
    const sharePct = (args.dormantCount / Math.max(1, args.totalTenants)) * 100;
    out.push({
      id: "dormant",
      tone: "warning",
      text: `${args.dormantCount} tenant${args.dormantCount === 1 ? "" : "s"} dormant for 30+ days (${sharePct.toFixed(0)}% of base) — outreach window before churn.`,
      href: "#dormant-list",
      hrefLabel: "Open list",
    });
  }

  if (Math.abs(args.mauDeltaPct) >= 0.1) {
    const up = args.mauDeltaPct > 0;
    out.push({
      id: "mau-delta",
      tone: up ? "positive" : "warning",
      text: `Active members ${up ? "up" : "down"} ${(Math.abs(args.mauDeltaPct) * 100).toFixed(0)}% vs prior 30 days.`,
    });
  }

  if (args.atRiskCount > 0 && args.dormantCount === 0) {
    out.push({
      id: "at-risk",
      tone: "info",
      text: `${args.atRiskCount} tenant${args.atRiskCount === 1 ? "" : "s"} sliding toward dormancy — proactive check-in suggested.`,
    });
  }

  if (args.onboardingRate < 50 && args.totalTenants > 0) {
    out.push({
      id: "onboarding",
      tone: "warning",
      text: `Only ${args.onboardingRate}% of tenants have completed onboarding — friction in the setup wizard.`,
    });
  }

  if (args.bottomModule && args.bottomModule.tenantsUsing < args.totalTenants * 0.25 && args.totalTenants > 4) {
    out.push({
      id: "low-adoption",
      tone: "info",
      text: `${args.bottomModule.label} is only used by ${args.bottomModule.tenantsUsing} tenant${args.bottomModule.tenantsUsing === 1 ? "" : "s"} — lowest module adoption.`,
    });
  }

  if (args.topModule && args.topModule.tenantsUsing > args.totalTenants * 0.6 && args.totalTenants > 0) {
    out.push({
      id: "high-adoption",
      tone: "positive",
      text: `${args.topModule.label} is the most-adopted module — used by ${args.topModule.tenantsUsing} of ${args.totalTenants} tenants.`,
    });
  }

  if (Math.abs(args.signupsDeltaPct) >= 0.25) {
    const up = args.signupsDeltaPct > 0;
    out.push({
      id: "signups-delta",
      tone: up ? "positive" : "warning",
      text: `New sign-ups ${up ? "up" : "down"} ${(Math.abs(args.signupsDeltaPct) * 100).toFixed(0)}% vs prior period.`,
    });
  }

  // Cap at 4, warnings before info before positives.
  const order: Record<string, number> = { warning: 0, info: 1, positive: 2 };
  return out
    .sort((a, b) => (order[a.tone] ?? 9) - (order[b.tone] ?? 9))
    .slice(0, 4);
}

// ── Local primitives ──────────────────────────────────────────────

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`overflow-hidden rounded-xl ${className ?? ""}`}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 px-5 py-4"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div>
        <h2
          className="text-sm font-semibold"
          style={{
            color: tone === "warning" ? "var(--warning-fg)" : "var(--text-default)",
          }}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}
