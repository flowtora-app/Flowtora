import Link from "next/link";
import type { TenantStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { TrendChart } from "@/components/charts/TrendChart";
import { DonutChart, type DonutSlice } from "@/components/charts/DonutChart";
import { chooseBucketGranularity, bucketKey, buildTrendSeries } from "@/lib/reports";
import { getAllPlans } from "@/lib/plans";
import {
  RevenueDateRangePicker,
  resolveRange,
  resolveRangeKey,
  type RangeKey,
} from "@/components/platform/RevenueDateRangePicker";
import { RevenueMetricCard } from "@/components/platform/RevenueMetricCard";
import {
  RevenueInsightStrip,
  type RevenueInsight,
} from "@/components/platform/RevenueInsightStrip";

// Premium financial dashboard for the platform admin.
//
// Layout (top to bottom):
//   1. Header (title · date range picker)
//   2. Insight strip — auto-generated alerts driven by real data
//   3. Hero metrics — MRR · ARR · Revenue (range) · Active subs
//      Each card shows a 30-day sparkline + period-over-period delta.
//   4. Main row — 2-col: revenue trend chart · plan-mix donut
//   5. Breakdowns row — 3-col: plan table · top customers · recent payments
//   6. Attention row — 2-col: failed payments · overdue invoices
//   7. Trials ending soon
//   8. Health-watch footer

export const dynamic = "force-dynamic";

type SP = Promise<{ range?: string }>;

const ACCENT_PALETTE = [
  "var(--accent-primary)",
  "var(--success-fg)",
  "var(--warning-fg)",
  "var(--info-fg)",
  "var(--danger-fg)",
];

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtUsdShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `$${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function pctOf(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function bucketDailyTotals(
  rows: { receivedAt: Date; amount: number | { toString: () => string } }[],
  start: Date,
  days: number,
): number[] {
  const out = new Array(days).fill(0);
  const startMs = start.getTime();
  for (const p of rows) {
    const idx = Math.floor((p.receivedAt.getTime() - startMs) / 86_400_000);
    if (idx >= 0 && idx < days) {
      out[idx] += Number(p.amount);
    }
  }
  return out;
}

export default async function PlatformRevenuePage({
  searchParams,
}: {
  searchParams: SP;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const rangeKey: RangeKey = resolveRangeKey(sp.range);
  const range = resolveRange(rangeKey);

  const now = new Date();
  const day = 86_400_000;
  const last180 = new Date(now.getTime() - 180 * day);
  const last30 = new Date(now.getTime() - 30 * day);
  const last60 = new Date(now.getTime() - 60 * day);

  const [
    activeByPlan,
    allTenantStatuses,
    paymentsRange,
    paymentsPrevRange,
    payments180,
    paymentsLast30,
    failedPayments,
    overdueInvoices,
    topRevenueRows,
    newPaid30,
    newPaid60,
    trialEndingSoon,
    recentPayments,
    allPlans,
  ] = await Promise.all([
    db.tenant.groupBy({
      by: ["plan"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    db.tenant.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    // Range-window revenue (drives the period-over-period delta).
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: range.start, lt: range.end } },
      select: { receivedAt: true, amount: true },
    }),
    db.payment.findMany({
      where: {
        voidedAt: null,
        failedAt: null,
        receivedAt: { gte: range.prevStart, lt: range.prevEnd },
      },
      select: { receivedAt: true, amount: true },
    }),
    // 180d window for the main chart.
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: last180 } },
      select: { receivedAt: true, amount: true },
    }),
    // Trailing 30d for the hero sparklines.
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: last30 } },
      select: { receivedAt: true, amount: true },
    }),
    db.payment.findMany({
      where: { failedAt: { not: null } },
      orderBy: { failedAt: "desc" },
      take: 8,
      select: {
        id: true, amount: true, failedAt: true, failureReason: true, method: true,
        tenantId: true,
      },
    }),
    db.invoice.findMany({
      where: { status: "OVERDUE" },
      orderBy: { dueDate: "asc" },
      take: 8,
      select: {
        id: true, number: true, total: true, amountPaid: true, dueDate: true,
        tenantId: true,
        tenant: { select: { id: true, name: true } },
        customer: { select: { name: true } },
      },
    }),
    db.payment.groupBy({
      by: ["tenantId"],
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: range.start } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 8,
    }),
    db.tenant.count({
      where: { status: "ACTIVE", createdAt: { gte: last30 } },
    }),
    db.tenant.count({
      where: { status: "ACTIVE", createdAt: { gte: last60, lt: last30 } },
    }),
    db.tenant.findMany({
      where: {
        status: "TRIAL",
        trialEndsAt: { gte: now, lte: new Date(now.getTime() + 7 * day) },
      },
      orderBy: { trialEndsAt: "asc" },
      take: 6,
      select: { id: true, name: true, trialEndsAt: true, plan: true },
    }),
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null },
      orderBy: { receivedAt: "desc" },
      take: 8,
      select: {
        id: true, amount: true, receivedAt: true, method: true,
        tenantId: true,
        tenant: { select: { name: true } },
      },
    }),
    getAllPlans(),
  ]);

  const planList = allPlans.filter(
    (p) => p.status !== "DRAFT" && p.status !== "ARCHIVED",
  );

  // Hydrate top-revenue tenant names.
  const topTenantIds = topRevenueRows.map((r) => r.tenantId);
  const topTenants = topTenantIds.length
    ? await db.tenant.findMany({
        where: { id: { in: topTenantIds } },
        select: { id: true, name: true, plan: true, status: true },
      })
    : [];
  const topTenantById = new Map(topTenants.map((t) => [t.id, t]));

  // ── Aggregates ────────────────────────────────────────────────────
  const priceByEnum = new Map<string, number>();
  for (const p of planList) {
    priceByEnum.set(p.slug.toUpperCase(), p.priceMonthly ?? 0);
  }
  let mrr = 0;
  for (const row of activeByPlan) {
    mrr += (priceByEnum.get(row.plan) ?? 0) * row._count._all;
  }
  const arr = mrr * 12;

  const statusByKey = new Map<TenantStatus, number>();
  for (const r of allTenantStatuses) statusByKey.set(r.status, r._count._all);
  const trialCount = statusByKey.get("TRIAL") ?? 0;
  const pastDueCount = statusByKey.get("PAST_DUE") ?? 0;
  const suspendedCount = statusByKey.get("SUSPENDED") ?? 0;
  const canceledCount = (statusByKey.get("CANCELED") ?? 0) + (statusByKey.get("ARCHIVED") ?? 0);
  const paidActive = statusByKey.get("ACTIVE") ?? 0;

  const revenueRange = paymentsRange.reduce((s, p) => s + Number(p.amount), 0);
  const revenuePrev = paymentsPrevRange.reduce((s, p) => s + Number(p.amount), 0);
  const revenueDeltaPct = revenuePrev === 0
    ? (revenueRange > 0 ? 1 : 0)
    : (revenueRange - revenuePrev) / revenuePrev;

  const paidGrowthPct = newPaid60 === 0
    ? (newPaid30 > 0 ? 1 : 0)
    : (newPaid30 - newPaid60) / newPaid60;

  // Lifetime churn ratio — canceled + archived as a fraction of all
  // tenants that ever paid (active + canceled). Approximate, but
  // useful as a directional indicator.
  const churnRate = pctOf(canceledCount, paidActive + canceledCount);

  // ── Sparkline series — trailing 30 days, daily buckets ───────────
  const dailyRevenue30 = bucketDailyTotals(paymentsLast30, last30, 30);
  // For "active" sparkline we don't have daily snapshots, so we
  // approximate growth via "new paid signups per day over 30 days".
  // Cheap proxy that still tells a story.
  const newPaidByDay = await db.tenant.findMany({
    where: { status: "ACTIVE", createdAt: { gte: last30 } },
    select: { createdAt: true },
  });
  const dailyNewPaid30 = new Array(30).fill(0);
  for (const t of newPaidByDay) {
    const idx = Math.floor((t.createdAt.getTime() - last30.getTime()) / day);
    if (idx >= 0 && idx < 30) dailyNewPaid30[idx]++;
  }

  // ── Main chart series — 180d ─────────────────────────────────────
  const granularity = chooseBucketGranularity(last180, now);
  const buckets = new Map<string, number>();
  for (const p of payments180) {
    const k = bucketKey(p.receivedAt, granularity);
    buckets.set(k, (buckets.get(k) ?? 0) + Number(p.amount));
  }
  const trendSeries = buildTrendSeries(last180, now, granularity, buckets);
  const trendData = trendSeries.map((s) => ({
    label: s.label,
    Revenue: Math.round(s.value),
  }));

  // ── Plan donut data ──────────────────────────────────────────────
  const planSlices: DonutSlice[] = planList.map((plan, i) => {
    const count = activeByPlan.find((r) => r.plan === plan.slug.toUpperCase())?._count._all ?? 0;
    const planMrr = count * (plan.priceMonthly ?? 0);
    return {
      label: plan.name,
      value: planMrr,
      color: ACCENT_PALETTE[i % ACCENT_PALETTE.length]!,
    };
  });

  // ── Top-customer concentration insight ───────────────────────────
  const totalRangeRevenue = topRevenueRows.reduce(
    (s, r) => s + Number(r._sum.amount ?? 0),
    0,
  );
  const top3Total = topRevenueRows
    .slice(0, 3)
    .reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
  const top3Concentration = totalRangeRevenue > 0
    ? top3Total / totalRangeRevenue
    : 0;

  // ── Insights ─────────────────────────────────────────────────────
  const insights = buildInsights({
    revenueDeltaPct,
    rangeLabel: range.label,
    failedCount: failedPayments.length,
    overdueCount: overdueInvoices.length,
    pastDueTenants: pastDueCount,
    trialEndingCount: trialEndingSoon.length,
    top3ConcentrationPct: top3Concentration,
    churnRate,
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
            Revenue
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {range.label} · subscriptions, billing health, and where the money is coming from.
          </p>
        </div>
        <RevenueDateRangePicker />
      </header>

      <RevenueInsightStrip insights={insights} />

      {/* ── Hero metric cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueMetricCard
          label="Monthly recurring revenue"
          value={fmtUsdShort(mrr)}
          hint={`${paidActive} paying tenants · ARR ${fmtUsdShort(arr)}`}
          spark={dailyRevenue30}
          tone="accent"
        />
        <RevenueMetricCard
          label={`Revenue (${range.label.toLowerCase()})`}
          value={fmtUsd(revenueRange)}
          hint={`vs ${fmtUsd(revenuePrev)} prior period`}
          deltaPct={revenueDeltaPct}
          spark={dailyRevenue30}
        />
        <RevenueMetricCard
          label="Active subscriptions"
          value={String(paidActive)}
          hint={`${trialCount} on trial · ${pastDueCount} past due`}
          deltaPct={paidGrowthPct}
          spark={dailyNewPaid30}
        />
        <RevenueMetricCard
          label="Churn rate (lifetime)"
          value={`${(churnRate * 100).toFixed(1)}%`}
          hint={`${canceledCount} canceled or archived`}
          deltaInvert
        />
      </div>

      {/* ── Main row: trend chart + plan donut ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue trend (180 days)" />
          <div className="px-5 pb-2 pt-2">
            {trendData.some((d) => d.Revenue > 0) ? (
              <TrendChart
                data={trendData}
                series={[{ key: "Revenue", label: "Revenue ($)", color: "var(--accent-primary)" }]}
                height={260}
                filled
              />
            ) : (
              <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No payments received in the last 180 days.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="MRR by plan"
            description={`Total MRR ${fmtUsdShort(mrr)}`}
          />
          <div className="px-5 pb-4 pt-2">
            <DonutChart
              data={planSlices}
              height={220}
              valuePrefix="$"
              innerLabel={fmtUsdShort(mrr)}
            />
            <ul className="mt-3 space-y-1.5 text-xs">
              {planSlices
                .filter((s) => s.value > 0)
                .map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="block h-2 w-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span style={{ color: "var(--text-default)" }}>{s.label}</span>
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {fmtUsdShort(s.value)} ·{" "}
                      {Math.round((s.value / Math.max(mrr, 1)) * 100)}%
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* ── Breakdowns row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Plan distribution" />
          <table className="w-full text-sm">
            <thead style={{ color: "var(--text-muted)" }}>
              <tr className="text-left">
                <Th>Plan</Th>
                <Th>Tenants</Th>
                <Th>MRR</Th>
              </tr>
            </thead>
            <tbody>
              {planList.map((plan) => {
                const count =
                  activeByPlan.find((r) => r.plan === plan.slug.toUpperCase())?._count._all ?? 0;
                const planMrr = count * (plan.priceMonthly ?? 0);
                const share = mrr > 0 ? Math.round((planMrr / mrr) * 100) : 0;
                return (
                  <tr key={plan.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
                          {plan.name}
                        </span>
                        {plan.isContactSales && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                          >
                            Contact
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>{count}</Td>
                    <Td>
                      <div className="text-sm tabular-nums">{fmtUsdShort(planMrr)}</div>
                      <div
                        className="text-[11px] tabular-nums"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {share}%
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader
            title={`Top customers (${range.label.toLowerCase()})`}
            description={`${fmtUsdShort(totalRangeRevenue)} total · top 3 = ${(top3Concentration * 100).toFixed(0)}%`}
          />
          {topRevenueRows.length === 0 ? (
            <Empty>No paid tenants yet.</Empty>
          ) : (
            <ul>
              {topRevenueRows.map((row, idx) => {
                const t = topTenantById.get(row.tenantId);
                const total = Number(row._sum.amount ?? 0);
                const peak = Number(topRevenueRows[0]?._sum.amount ?? 0);
                const pct = peak > 0 ? (total / peak) * 100 : 0;
                return (
                  <li
                    key={row.tenantId}
                    className="px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
                          style={{
                            background: idx < 3 ? "var(--accent-surface)" : "var(--surface-2)",
                            color: idx < 3 ? "var(--accent-primary)" : "var(--text-muted)",
                          }}
                        >
                          {idx + 1}
                        </span>
                        <Link
                          href={`/platform/tenants/${row.tenantId}`}
                          className="truncate text-sm font-medium underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {t?.name ?? "(unknown tenant)"}
                        </Link>
                      </div>
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ color: "var(--text-default)" }}
                      >
                        {fmtUsdShort(total)}
                      </span>
                    </div>
                    <div
                      className="mt-2 h-1 w-full overflow-hidden rounded-full"
                      style={{ background: "var(--surface-3)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: "var(--accent-primary)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent payments" />
          {recentPayments.length === 0 ? (
            <Empty>No payments recorded yet.</Empty>
          ) : (
            <ul>
              {recentPayments.map((p) => (
                <li
                  key={p.id}
                  className="px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="truncate text-sm font-medium"
                        style={{ color: "var(--text-default)" }}
                      >
                        {p.tenant?.name ?? "(unknown)"}
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {p.method.toLowerCase()} · {ageLabel(p.receivedAt)}
                      </div>
                    </div>
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: "var(--success-fg)" }}
                    >
                      +{fmtUsdShort(Number(p.amount))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Attention row ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Failed payments"
            description={
              failedPayments.length === 0
                ? "Nothing recent."
                : `${failedPayments.length} need review`
            }
            tone={failedPayments.length > 0 ? "warning" : "neutral"}
          />
          {failedPayments.length === 0 ? (
            <Empty>No recent payment failures.</Empty>
          ) : (
            <ul>
              {failedPayments.map((p) => (
                <li
                  key={p.id}
                  className="px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="truncate text-sm font-medium"
                        style={{ color: "var(--text-default)" }}
                      >
                        {p.method} · {fmtUsd(Number(p.amount))}
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {p.failureReason ?? "no reason given"} ·{" "}
                        {p.failedAt ? ageLabel(p.failedAt) : "—"}
                      </div>
                    </div>
                    <Link
                      href={`/platform/tenants/${p.tenantId}`}
                      className="text-xs underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      View →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Overdue invoices"
            description={
              overdueInvoices.length === 0
                ? "Nothing overdue."
                : `${overdueInvoices.length} unpaid`
            }
            tone={overdueInvoices.length > 0 ? "warning" : "neutral"}
          />
          {overdueInvoices.length === 0 ? (
            <Empty>Nothing overdue across the platform.</Empty>
          ) : (
            <ul>
              {overdueInvoices.map((inv) => {
                const balance = Number(inv.total) - Number(inv.amountPaid);
                const daysPast = inv.dueDate
                  ? Math.max(0, Math.ceil((now.getTime() - inv.dueDate.getTime()) / day))
                  : 0;
                return (
                  <li
                    key={inv.id}
                    className="px-5 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="truncate text-sm font-medium"
                          style={{ color: "var(--text-default)" }}
                        >
                          {inv.tenant.name}
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {inv.number} · {inv.customer.name} · {daysPast}d overdue
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-sm font-semibold tabular-nums"
                          style={{ color: "var(--danger-fg)" }}
                        >
                          {fmtUsd(balance)}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Trials ending soon ───────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Trials ending in the next 7 days"
          description={
            trialEndingSoon.length === 0
              ? "No upcoming trial conversions."
              : `${trialEndingSoon.length} tenants — conversion opportunity`
          }
        />
        {trialEndingSoon.length === 0 ? (
          <Empty>No trials ending in the next week.</Empty>
        ) : (
          <ul>
            {trialEndingSoon.map((t) => {
              const daysLeft = t.trialEndsAt
                ? Math.max(0, Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / day))
                : 0;
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
                        Plan: {t.plan.toLowerCase()}
                      </div>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                      style={{
                        background: daysLeft <= 2 ? "var(--warning-surface)" : "var(--accent-surface)",
                        color: daysLeft <= 2 ? "var(--warning-fg)" : "var(--accent-primary)",
                      }}
                    >
                      {daysLeft}d left
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── Health watch footer ──────────────────────────────────── */}
      <div
        className="rounded-xl px-5 py-4"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Health watch
          </div>
          <div className="text-xs" style={{ color: "var(--text-faint)" }}>
            Snapshot · refreshed each request
          </div>
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {pastDueCount + suspendedCount === 0
            ? "No tenants are currently past due or suspended."
            : `${pastDueCount} past-due and ${suspendedCount} suspended tenant(s) are revenue-at-risk. Review them in the tenants list.`}
        </div>
      </div>
    </div>
  );
}

// ─── Insight generator ─────────────────────────────────────────────

function buildInsights(args: {
  revenueDeltaPct: number;
  rangeLabel: string;
  failedCount: number;
  overdueCount: number;
  pastDueTenants: number;
  trialEndingCount: number;
  top3ConcentrationPct: number;
  churnRate: number;
}): RevenueInsight[] {
  const out: RevenueInsight[] = [];

  if (Math.abs(args.revenueDeltaPct) >= 0.1) {
    const up = args.revenueDeltaPct > 0;
    out.push({
      id: "revenue-delta",
      tone: up ? "positive" : "warning",
      text: `Revenue ${up ? "up" : "down"} ${(Math.abs(args.revenueDeltaPct) * 100).toFixed(0)}% vs prior period.`,
    });
  }

  if (args.pastDueTenants > 0) {
    out.push({
      id: "past-due",
      tone: "warning",
      text: `${args.pastDueTenants} tenant${args.pastDueTenants === 1 ? "" : "s"} past due — investigate before suspension.`,
      href: "/platform/tenants?status=PAST_DUE",
      hrefLabel: "Open",
    });
  }

  if (args.failedCount > 0) {
    out.push({
      id: "failed-payments",
      tone: "warning",
      text: `${args.failedCount} payment${args.failedCount === 1 ? "" : "s"} failed recently. Stripe retry windows close in 7 days.`,
    });
  }

  if (args.overdueCount > 0) {
    out.push({
      id: "overdue-invoices",
      tone: "warning",
      text: `${args.overdueCount} invoice${args.overdueCount === 1 ? "" : "s"} are overdue.`,
    });
  }

  if (args.top3ConcentrationPct >= 0.4) {
    out.push({
      id: "top3-concentration",
      tone: "info",
      text: `Top 3 customers represent ${(args.top3ConcentrationPct * 100).toFixed(0)}% of revenue this period — concentration risk.`,
    });
  }

  if (args.trialEndingCount > 0) {
    out.push({
      id: "trials-ending",
      tone: "info",
      text: `${args.trialEndingCount} trial${args.trialEndingCount === 1 ? "" : "s"} ending in the next 7 days.`,
    });
  }

  if (args.churnRate >= 0.15) {
    out.push({
      id: "churn-warn",
      tone: "warning",
      text: `Lifetime churn rate is ${(args.churnRate * 100).toFixed(1)}% — consider a retention review.`,
    });
  }

  // Cap to keep the strip from dominating the page; show the most
  // urgent (warnings before info, positives last).
  const ordered = [...out].sort((a, b) => {
    const order: Record<string, number> = { warning: 0, info: 1, positive: 2 };
    return (order[a.tone] ?? 9) - (order[b.tone] ?? 9);
  });
  return ordered.slice(0, 4);
}

// ─── Local primitives ──────────────────────────────────────────────

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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3 text-sm" style={{ color: "var(--text-default)" }}>{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}
