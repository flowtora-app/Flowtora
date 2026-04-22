import Link from "next/link";
import type { TenantStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { TrendChart } from "@/components/charts/TrendChart";
import { chooseBucketGranularity, bucketKey, buildTrendSeries } from "@/lib/reports";
import { getAllPlans } from "@/lib/plans";

export const dynamic = "force-dynamic";

// Phase B — Revenue, subscriptions & billing oversight.
//
// All numbers here are derived from the live DB:
//   MRR         = sum over active tenants of PricingPlan.priceMonthly
//                 (was PLAN_PRICE_USD before M6 retired the hardcoded
//                 map; prices now come from getAllPlans() so editing
//                 them in the admin propagates here on the next tag
//                 invalidation)
//   ARR         = MRR * 12
//   Revenue     = sum of Payment.amount received in the period, excluding
//                 voided rows (Payment.voidedAt != null)
//   Plan mix    = count of ACTIVE tenants grouped by plan
//   Churn       = CANCELED + ARCHIVED tenants (lifetime ratio)
//
// The trend chart is driven by real Payment rows over the last 180 days.
// Failed-payment & overdue-invoice queues read from Payment.failedAt
// and Invoice.status="OVERDUE". These are cross-tenant platform views;
// tenant-scoped invoice routes stay separate.

export default async function PlatformRevenuePage() {
  await requirePlatformStaff();

  const now = new Date();
  const day = 86_400_000;
  const last180 = new Date(now.getTime() - 180 * day);
  const last30 = new Date(now.getTime() - 30 * day);
  const last60 = new Date(now.getTime() - 60 * day);

  const [
    activeByPlan,
    allTenantStatuses,
    payments180,
    failedPayments,
    overdueInvoices,
    topRevenueRows,
    newPaid30,
    newPaid60,
    trialEndingSoon,
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
    db.payment.findMany({
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: last180 } },
      select: { receivedAt: true, amount: true },
    }),
    db.payment.findMany({
      where: { failedAt: { not: null } },
      orderBy: { failedAt: "desc" },
      take: 10,
      select: {
        id: true, amount: true, failedAt: true, failureReason: true, method: true,
        tenantId: true,
      },
    }),
    db.invoice.findMany({
      where: { status: "OVERDUE" },
      orderBy: { dueDate: "asc" },
      take: 10,
      select: {
        id: true, number: true, total: true, amountPaid: true, dueDate: true,
        tenantId: true,
        tenant: { select: { id: true, name: true } },
        customer: { select: { name: true } },
      },
    }),
    // Top-revenue tenants over the last 180 days. groupBy sums payments
    // per tenant, then we hydrate with tenant names in a second round.
    db.payment.groupBy({
      by: ["tenantId"],
      where: { voidedAt: null, failedAt: null, receivedAt: { gte: last180 } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
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
      take: 10,
      select: { id: true, name: true, trialEndsAt: true, plan: true },
    }),

    // DB plan catalog (M6). Filter out drafts/archived — HIDDEN tiers
    // (e.g. legacy Growth) still have paying tenants and belong in
    // the MRR breakdown.
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

  // MRR / ARR — index plan prices by slug.toUpperCase() so we can look
  // them up against the activeByPlan groupBy (which is still keyed on
  // the legacy Plan enum). Slugs mirror the enum per seed convention.
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

  // Revenue trend
  const granularity = chooseBucketGranularity(last180, now);
  const buckets = new Map<string, number>();
  let total180 = 0;
  for (const p of payments180) {
    const k = bucketKey(p.receivedAt, granularity);
    const amt = Number(p.amount);
    buckets.set(k, (buckets.get(k) ?? 0) + amt);
    total180 += amt;
  }
  const series = buildTrendSeries(last180, now, granularity, buckets);
  const trendData = series.map((s) => ({ label: s.label, Revenue: Math.round(s.value) }));

  // New-paid growth (this 30d vs prior 30d)
  const paidGrowthPct = newPaid60 === 0
    ? (newPaid30 > 0 ? 100 : 0)
    : Math.round(((newPaid30 - newPaid60) / newPaid60) * 100);

  const mrrAtRisk =
    pastDueCount * 0 /* unknown plans — approximated via activeByPlan */;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Revenue"
        description="Subscriptions, billing health, and revenue trend across every tenant."
      />

      {/* ── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Monthly recurring revenue" value={fmtUsd(mrr)} sub={`${paidActive} paying tenants`} />
        <Kpi label="Annual run-rate" value={fmtUsd(arr)} sub="MRR × 12" />
        <Kpi
          label="Revenue (180 d)"
          value={fmtUsd(total180)}
          sub="Payments received, excl. voids & failures"
        />
        <Kpi
          label="New paid (30 d)"
          value={String(newPaid30)}
          sub={paidGrowthPct >= 0 ? `+${paidGrowthPct}% vs prior 30d` : `${paidGrowthPct}% vs prior 30d`}
          tone={paidGrowthPct >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* ── Subscription health row ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Active" value={String(paidActive)} tone="positive" />
        <Kpi label="Trial" value={String(trialCount)} tone="info" />
        <Kpi label="Past due" value={String(pastDueCount)} tone={pastDueCount > 0 ? "warning" : "neutral"} />
        <Kpi label="Canceled / archived" value={String(canceledCount)} tone="neutral" />
      </div>

      {/* ── Revenue trend chart ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Revenue trend (180 d)" />
        <div
          className="mt-3 rounded-lg px-4 pt-4 pb-2"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {trendData.some((d) => d.Revenue > 0) ? (
            <TrendChart
              data={trendData}
              series={[{ key: "Revenue", label: "Revenue ($)", color: "var(--accent-primary)" }]}
              height={220}
              filled
            />
          ) : (
            <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No payments received in the last 180 days.
            </p>
          )}
        </div>
      </section>

      {/* ── Plan distribution + MRR breakdown ───────────────────── */}
      <section>
        <SectionHeader title="Plan distribution" />
        <div
          className="mt-3 overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <Th>Plan</Th>
                <Th>Tenants</Th>
                <Th>Price / mo</Th>
                <Th>MRR</Th>
                <Th>Share</Th>
              </tr>
            </thead>
            <tbody>
              {planList.map((plan) => {
                const enumKey = plan.slug.toUpperCase();
                const count =
                  activeByPlan.find((r) => r.plan === enumKey)?._count._all ?? 0;
                const price = plan.priceMonthly ?? 0;
                const planMrr = count * price;
                const share = mrr > 0 ? Math.round((planMrr / mrr) * 100) : 0;
                return (
                  <tr key={plan.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Td className="font-medium">
                      {plan.name}
                      {plan.isContactSales && (
                        <span
                          className="ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: "var(--surface-2)",
                            color: "var(--text-muted)",
                          }}
                        >
                          Contact
                        </span>
                      )}
                    </Td>
                    <Td>{count}</Td>
                    <Td muted>{plan.isContactSales ? "—" : fmtUsd(price)}</Td>
                    <Td>{fmtUsd(planMrr)}</Td>
                    <Td>
                      <ShareBar pct={share} />
                    </Td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1px solid var(--border-default)", fontWeight: 600 }}>
                <Td colSpan={3}>Total</Td>
                <Td>{fmtUsd(mrr)}</Td>
                <Td muted>100%</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Two-column needs-attention row ─────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Failed payments */}
        <section>
          <SectionHeader
            title="Failed payments"
            count={failedPayments.length}
            tone={failedPayments.length > 0 ? "warning" : "neutral"}
          />
          <div
            className="mt-3 overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {failedPayments.length === 0 ? (
              <Empty>No recent payment failures.</Empty>
            ) : (
              <ul>
                {failedPayments.map((p) => (
                  <li
                    key={p.id}
                    className="px-4 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {p.method} · {fmtUsd(Number(p.amount))}
                        </div>
                        <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          {p.failureReason ?? "no reason given"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{fmtUsd(Number(p.amount))}</div>
                        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                          {p.failedAt ? ageLabel(p.failedAt) : "—"}
                        </div>
                      </div>
                    </div>
                    <Link
                      href={`/platform/tenants/${p.tenantId}`}
                      className="mt-1 inline-block text-xs underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      View tenant →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Overdue invoices */}
        <section>
          <SectionHeader
            title="Overdue invoices"
            count={overdueInvoices.length}
            tone={overdueInvoices.length > 0 ? "warning" : "neutral"}
          />
          <div
            className="mt-3 overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
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
                      className="px-4 py-3"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {inv.tenant.name}
                          </div>
                          <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                            {inv.number} · {inv.customer.name}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{fmtUsd(balance)}</div>
                          <div className="text-[11px]" style={{ color: "var(--danger-fg)" }}>
                            {daysPast}d overdue
                          </div>
                        </div>
                      </div>
                      <Link
                        href={`/platform/tenants/${inv.tenantId}`}
                        className="mt-1 inline-block text-xs underline"
                        style={{ color: "var(--text-muted)" }}
                      >
                        View tenant →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* ── Top revenue + trials ending soon ─────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <SectionHeader title="Top revenue (180 d)" />
          <div
            className="mt-3 overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {topRevenueRows.length === 0 ? (
              <Empty>No paid tenants yet.</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                    <Th>Tenant</Th>
                    <Th>Plan</Th>
                    <Th>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {topRevenueRows.map((row) => {
                    const t = topTenantById.get(row.tenantId);
                    const total = Number(row._sum.amount ?? 0);
                    return (
                      <tr key={row.tenantId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <Td>
                          <Link href={`/platform/tenants/${row.tenantId}`} className="font-medium underline">
                            {t?.name ?? "(unknown)"}
                          </Link>
                        </Td>
                        <Td muted>{t?.plan ?? "—"}</Td>
                        <Td>{fmtUsd(total)}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Trials ending within 7 days" count={trialEndingSoon.length} />
          <div
            className="mt-3 overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {trialEndingSoon.length === 0 ? (
              <Empty>No trials ending in the next week.</Empty>
            ) : (
              <ul>
                {trialEndingSoon.map((t) => (
                  <li
                    key={t.id}
                    className="px-4 py-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/platform/tenants/${t.id}`}
                          className="truncate text-sm font-medium underline"
                        >
                          {t.name}
                        </Link>
                        <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          Plan: {t.plan}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">
                          {t.trialEndsAt?.toLocaleDateString() ?? "—"}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                          {t.trialEndsAt
                            ? `${Math.max(0, Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / day))}d left`
                            : ""}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Contextual footer — MRR-at-risk call-out. past-due + suspended rows
          can't be priced without querying their plan, so this is a count
          surfaced honestly rather than a fake dollar figure. */}
      <div
        className="rounded-lg px-5 py-4 text-sm"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="font-medium">Health watch</div>
        <div className="mt-1" style={{ color: "var(--text-muted)" }}>
          {pastDueCount + suspendedCount === 0
            ? "No tenants are currently past due or suspended."
            : `${pastDueCount} past-due and ${suspendedCount} suspended tenant(s) are revenue-at-risk. Review them in the tenants list.`}
          {mrrAtRisk > 0 && <> ({fmtUsd(mrrAtRisk)} approx.)</>}
        </div>
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────

function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

type Tone = "neutral" | "positive" | "negative" | "warning" | "info";

function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  const subColor: Record<Tone, string> = {
    neutral: "var(--text-muted)",
    positive: "var(--success-fg)",
    negative: "var(--danger-fg)",
    warning: "var(--warning-fg)",
    info: "var(--info-fg)",
  };
  return (
    <div
      className="rounded-lg px-4 py-4"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: subColor[tone] }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({
  title,
  count,
  tone = "neutral",
}: {
  title: string;
  count?: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
      {title}
      {count != null && (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: tone === "warning" ? "var(--warning-surface)" : "var(--surface-2)",
            color: tone === "warning" ? "var(--warning-fg)" : "var(--text-muted)",
          }}
        >
          {count}
        </span>
      )}
    </h2>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-normal uppercase tracking-wider">{children}</th>;
}
function Td({
  children,
  muted,
  colSpan,
  className,
}: {
  children: React.ReactNode;
  muted?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-3 ${className ?? ""}`}
      colSpan={colSpan}
      style={muted ? { color: "var(--text-muted)" } : undefined}
    >
      {children}
    </td>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>{children}</p>;
}

function ShareBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: "var(--surface-2)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: "var(--accent-primary)" }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        {pct}%
      </span>
    </div>
  );
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
