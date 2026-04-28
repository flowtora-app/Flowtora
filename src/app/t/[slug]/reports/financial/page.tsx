import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker, Stat, Bar } from "@/components/Reports";
import { UpgradeRequired } from "@/components/UpgradeRequired";
import { isEntitled } from "@/lib/entitlements";
import { getFeatureGateMeta } from "@/lib/feature-gates";
import { resolveRange, resolveBranch, reportQueryString, pct, formatPct, AGING_BUCKETS, daysPastDue, chooseBucketGranularity, bucketKey, buildTrendSeries } from "@/lib/reports";
import { TrendChart } from "@/components/charts/TrendChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { applyBranchScope, applyBranchScopeOn } from "@/lib/locations";
import {
  INVOICE_STATUSES,
  OPEN_INVOICE_STATUSES,
  statusColor as invoiceStatusColor,
  statusLabel as invoiceStatusLabel,
  outstandingBalance,
} from "@/lib/invoices";
import { computeMargin, marginColor } from "@/lib/finance";
import { formatMoney, formatDate } from "@/lib/format";
import type { InvoiceStatus, PaymentMethod, Prisma } from "@prisma/client";

// Phase 14 — financial report rebuild.
//
// The page is organized as a top-down story:
//   1. The headline numbers (revenue, cash, outstanding, overdue)
//   2. Gross-profit block — revenue minus job-linked expenses
//   3. A/R aging + invoices by status  (money in the pipeline)
//   4. Payments by method + top customers (cash mechanics)
//   5. Expenses breakdown (money going out)
//   6. Refunds + write-offs in range (money backing out)
//   7. Open-invoices detail table (aging, oldest first)
//
// The range picker applies to everything date-bounded. Outstanding A/R
// is always "right now" — that's the only sensible framing for a live
// balance.

const PAYMENT_METHODS: { value: PaymentMethod; label: string; color: string }[] = [
  { value: "CASH",        label: "Cash",         color: "#10b981" },
  { value: "CHECK",       label: "Check",        color: "#3b82f6" },
  { value: "CARD",        label: "Card",         color: "#8b5cf6" },
  { value: "ACH",         label: "ACH",          color: "#f59e0b" },
  { value: "CREDIT_MEMO", label: "Credit memo",  color: "#ec4899" },
  { value: "OTHER",       label: "Other",        color: "#6b7280" },
];

export default async function FinancialReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "reports:financial");

  // Feature gate — financial reporting is Professional+.
  if (!(await isEntitled(ctx.tenant.id, ctx.tenant.plan, "reportsFinancial"))) {
    const meta = getFeatureGateMeta("reportsFinancial");
    return (
      <UpgradeRequired
        slug={slug}
        featureName={meta.label}
        requiredPlan={meta.requiredPlan}
        reason={meta.reason}
      />
    );
  }

  const range = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  // Build the range-scoped where shapes. Invoices are keyed on
  // createdAt (booked date), payments on receivedAt (cash date),
  // refunds on createdAt (money-out date), expenses on date (incurred
  // date — matters for matching-period analysis).
  const invoicesInRangeWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    createdAt: { gte: range.from, lte: range.to },
    status: { not: "VOID" as const },
  } as Prisma.InvoiceWhereInput, branch.effectiveScope);

  const paymentsInRangeWhere = applyBranchScopeOn({
    tenantId: ctx.tenant.id,
    receivedAt: { gte: range.from, lte: range.to },
    voidedAt: null,
    failedAt: null,
  } as Prisma.PaymentWhereInput, "invoice", branch.effectiveScope);

  // Refunds/write-offs carry their own "effective date" field so we
  // report off of those rather than createdAt (they'd diverge if the
  // shop back-dated an entry to reconcile with their bank statement).
  const refundsInRangeWhere = applyBranchScopeOn({
    tenantId: ctx.tenant.id,
    refundedAt: { gte: range.from, lte: range.to },
  } as Prisma.RefundWhereInput, "invoice", branch.effectiveScope);

  const writeOffsInRangeWhere = applyBranchScopeOn({
    tenantId: ctx.tenant.id,
    writtenOffAt: { gte: range.from, lte: range.to },
    reversedAt: null,
  } as Prisma.WriteOffWhereInput, "invoice", branch.effectiveScope);

  // Expenses in range — scope via the (nullable) related order so
  // branch-restricted users see only expenses tied to their branches OR
  // overhead (null orderId) expenses. Overhead is shown to everyone.
  const expensesInRangeWhere: Prisma.ExpenseWhereInput = {
    tenantId: ctx.tenant.id,
    date: { gte: range.from, lte: range.to },
    ...(branch.effectiveScope
      ? {
          OR: [
            { orderId: null }, // overhead
            { order: { locationId: { in: branch.effectiveScope } } },
          ],
        }
      : {}),
  };

  const [
    invoiceAgg,
    byStatus,
    paymentsAgg,
    byMethod,
    openInvoices,
    topCustomerRowsRaw,
    expenseAgg,
    expenseByCategory,
    expenseByMethod,
    refundAgg,
    writeOffAgg,
  ] = await Promise.all([
    db.invoice.aggregate({
      where: invoicesInRangeWhere,
      _sum: { total: true, amountPaid: true, taxAmount: true, refundedAmount: true, writtenOffAmount: true },
      _count: { _all: true },
    }),
    db.invoice.groupBy({
      by: ["status"],
      where: invoicesInRangeWhere,
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.payment.aggregate({
      where: paymentsInRangeWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.payment.groupBy({
      by: ["method"],
      where: paymentsInRangeWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.invoice.findMany({
      where: applyBranchScope({
        tenantId: ctx.tenant.id,
        status: { in: OPEN_INVOICE_STATUSES },
      } as Prisma.InvoiceWhereInput, branch.effectiveScope),
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        amountPaid: true,
        refundedAmount: true,
        writtenOffAmount: true,
        dueDate: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    // Top customers by cash collected in range.
    db.payment.groupBy({
      by: ["invoiceId"],
      where: paymentsInRangeWhere,
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: expensesInRangeWhere,
      _sum: { amount: true, taxAmount: true },
      _count: { _all: true },
    }),
    db.expense.groupBy({
      by: ["category"],
      where: expensesInRangeWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.expense.groupBy({
      by: ["method"],
      where: expensesInRangeWhere,
      _sum: { amount: true },
    }),
    db.refund.aggregate({
      where: refundsInRangeWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.writeOff.aggregate({
      where: writeOffsInRangeWhere,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  // Invoices by status — one row per status (0-padded). The groupBy
  // above only returns rows for statuses that were actually observed,
  // so we merge into a full map.
  const statusMap = new Map<InvoiceStatus, { count: number; value: number }>();
  for (const s of INVOICE_STATUSES) statusMap.set(s.value, { count: 0, value: 0 });
  for (const row of byStatus) {
    statusMap.set(row.status, {
      count: row._count._all,
      value: Number(row._sum.total ?? 0),
    });
  }

  const revenueBooked   = Number(invoiceAgg._sum.total ?? 0);
  const cashCollected   = Number(paymentsAgg._sum.amount ?? 0);
  const taxBooked       = Number(invoiceAgg._sum.taxAmount ?? 0);
  const refundedInRange = Number(refundAgg._sum.amount ?? 0);
  const writtenOffInRange = Number(writeOffAgg._sum.amount ?? 0);
  const expenseTotal    = Number(expenseAgg._sum.amount ?? 0);
  const expenseTax      = Number(expenseAgg._sum.taxAmount ?? 0);

  // Gross profit framing: revenue booked (invoices issued in range) less
  // refunds against those invoices and expenses incurred in range. The
  // match isn't perfect — expenses might apply to jobs invoiced last
  // month — but it's the closest thing to "shop P&L" that doesn't
  // require a GL. Tenants can always narrow to a tighter window.
  const pnlMargin = computeMargin({
    invoiceRevenue: revenueBooked,
    refundedAmount: refundedInRange,
    expenseCost:    expenseTotal,
  });

  // A/R aging — computed from live open invoices (always "right now").
  const agingCounts = AGING_BUCKETS.map(() => 0);
  const agingValue  = AGING_BUCKETS.map(() => 0);
  for (const inv of openInvoices) {
    const balance = outstandingBalance(inv);
    if (balance <= 0) continue;
    const days = daysPastDue(inv.dueDate) ?? -9999;
    for (let i = 0; i < AGING_BUCKETS.length; i++) {
      const b = AGING_BUCKETS[i];
      const max = b.maxDays ?? Infinity;
      if (days >= b.minDays && days <= max) {
        agingCounts[i]++;
        agingValue[i] += balance;
        break;
      }
    }
  }
  const totalOutstanding = agingValue.reduce((a, b) => a + b, 0);
  const overdueValue = agingValue.slice(1).reduce((a, b) => a + b, 0);

  // Top customers by cash collected in range.
  const invoiceIds = topCustomerRowsRaw.map((r) => r.invoiceId);
  const invoiceRows = invoiceIds.length > 0
    ? await db.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, customerId: true, customer: { select: { name: true } } },
      })
    : [];
  const customerTotals = new Map<string, { name: string; amount: number }>();
  for (const row of topCustomerRowsRaw) {
    const inv = invoiceRows.find((i) => i.id === row.invoiceId);
    if (!inv) continue;
    const cur = customerTotals.get(inv.customerId) ?? { name: inv.customer.name, amount: 0 };
    cur.amount += Number(row._sum.amount ?? 0);
    customerTotals.set(inv.customerId, cur);
  }
  const topCustomerRows = Array.from(customerTotals.entries())
    .map(([customerId, v]) => ({ customerId, name: v.name, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // Payments by method — use the groupBy rows, 0-pad missing methods.
  const methodMap = new Map<PaymentMethod, number>();
  for (const m of PAYMENT_METHODS) methodMap.set(m.value, 0);
  for (const row of byMethod) methodMap.set(row.method, Number(row._sum.amount ?? 0));

  // Expense categories — top 8 shown, rest collapsed into "Other".
  const expenseCategoryRows = expenseByCategory
    .map((r) => ({
      category: r.category ?? "Uncategorized",
      amount:   Number(r._sum.amount ?? 0),
      count:    r._count._all,
    }))
    .sort((a, b) => b.amount - a.amount);
  const topExpenseCategories = expenseCategoryRows.slice(0, 8);
  const otherExpenseCategoryTotal = expenseCategoryRows
    .slice(8)
    .reduce((s, r) => s + r.amount, 0);

  // Expense methods — small enum, show all.
  const expenseMethodRows = expenseByMethod.map((r) => ({
    method: r.method,
    amount: Number(r._sum.amount ?? 0),
  }));

  // Revenue trend — query raw payments in range and bucket by period.
  const granularity = chooseBucketGranularity(range.from, range.to);
  const trendPayments = await db.payment.findMany({
    where: paymentsInRangeWhere,
    select: { amount: true, receivedAt: true },
  });
  const trendExpenses = await db.expense.findMany({
    where: expensesInRangeWhere,
    select: { amount: true, date: true },
  });

  const cashBuckets  = new Map<string, number>();
  const expBuckets   = new Map<string, number>();
  for (const p of trendPayments) {
    const k = bucketKey(p.receivedAt, granularity);
    cashBuckets.set(k, (cashBuckets.get(k) ?? 0) + Number(p.amount));
  }
  for (const e of trendExpenses) {
    const k = bucketKey(e.date, granularity);
    expBuckets.set(k, (expBuckets.get(k) ?? 0) + Number(e.amount));
  }

  const trendSeries = buildTrendSeries(range.from, range.to, granularity, cashBuckets);
  const expTrendSeries = buildTrendSeries(range.from, range.to, granularity, expBuckets);
  // Merge into single chart data array.
  const trendData = trendSeries.map((pt, i) => ({
    label:    pt.label,
    "Cash collected": pt.value,
    "Expenses":       expTrendSeries[i]?.value ?? 0,
  }));

  // Payment method donut data.
  const methodDonutData = PAYMENT_METHODS
    .map((m) => ({ label: m.label, value: methodMap.get(m.value) ?? 0, color: m.color }))
    .filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Financial</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Revenue booked, cash collected, expenses incurred in {range.label}. A/R aging is always current.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href={`/api/t/${slug}/reports/financial/export?${reportQueryString(range, branch)}`}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Invoices CSV
          </a>
          <a
            href={`/api/t/${slug}/reports/financial/export?${reportQueryString(range, branch)}&type=payments`}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Payments CSV
          </a>
          <a
            href={`/api/t/${slug}/reports/financial/export?${reportQueryString(range, branch)}&type=ar`}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            A/R CSV
          </a>
        </div>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/financial`} branch={branch} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Revenue invoiced"
          value={formatMoney(revenueBooked, ctx.tenant.currency)}
          sub={`${invoiceAgg._count._all} invoices · tax ${formatMoney(taxBooked, ctx.tenant.currency)}`}
        />
        <Stat
          label="Cash collected"
          value={formatMoney(cashCollected, ctx.tenant.currency)}
          sub={`${paymentsAgg._count._all} payments`}
        />
        <Stat
          label="Outstanding A/R"
          value={formatMoney(totalOutstanding, ctx.tenant.currency)}
          sub={`${openInvoices.length} open invoices`}
          href={`/t/${slug}/invoices?scope=open`}
        />
        <Stat
          label="Overdue A/R"
          value={formatMoney(overdueValue, ctx.tenant.currency)}
          sub={formatPct(pct(overdueValue, totalOutstanding))}
        />
      </div>

      {/* Revenue trend chart */}
      <Card>
        <CardHeader
          title="Cash collected vs expenses"
          description={`Trend by ${granularity} over ${range.label}.`}
        />
        <div className="px-5 pb-5 pt-4">
          <TrendChart
            data={trendData}
            series={[
              { key: "Cash collected", label: "Cash collected", color: "#10b981" },
              { key: "Expenses",       label: "Expenses",       color: "#ef4444" },
            ]}
            valuePrefix={ctx.tenant.currency === "USD" ? "$" : ""}
            filled
            height={220}
          />
        </div>
      </Card>

      {/* Gross profit block — revenue net of refunds, less expenses in
          range. The margin % gets a healthy/squeezed/warning color so
          the number reads without squinting. */}
      <Card>
        <CardHeader
          title="Gross profit (in range)"
          description="Revenue booked less refunds and expenses incurred in the same window."
        />
        <div className="grid grid-cols-2 gap-4 px-5 py-4 md:grid-cols-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Net revenue
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatMoney(pnlMargin.revenue, ctx.tenant.currency)}
            </div>
            {refundedInRange > 0 && (
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                after {formatMoney(refundedInRange, ctx.tenant.currency)} refunded
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Expenses
            </div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatMoney(pnlMargin.cost, ctx.tenant.currency)}
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {expenseAgg._count._all} entries
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Gross profit
            </div>
            <div
              className="mt-0.5 text-lg font-semibold tabular-nums"
              style={{ color: pnlMargin.gross < 0 ? "#ef4444" : "var(--text)" }}
            >
              {formatMoney(pnlMargin.gross, ctx.tenant.currency)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Margin
            </div>
            <div
              className="mt-0.5 text-lg font-semibold tabular-nums"
              style={{ color: marginColor(pnlMargin.marginPct) }}
            >
              {pnlMargin.marginPct === null ? "—" : `${pnlMargin.marginPct.toFixed(1)}%`}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="A/R aging" description="Open invoices grouped by days past due" />
          <div className="space-y-2 px-5 py-4">
            {AGING_BUCKETS.map((b, i) => (
              <Bar
                key={b.label}
                label={b.label}
                value={agingValue[i]}
                max={Math.max(1, ...agingValue)}
                meta={`${agingCounts[i]} · ${formatMoney(agingValue[i], ctx.tenant.currency)}`}
                color={i === 0 ? "#10b981" : i < 3 ? "#f59e0b" : "#ef4444"}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Invoices by status (in range)" />
          <div className="space-y-2 px-5 py-4">
            {INVOICE_STATUSES.map((s) => {
              const row = statusMap.get(s.value)!;
              return (
                <Bar
                  key={s.value}
                  label={s.label}
                  value={row.count}
                  max={Math.max(1, ...Array.from(statusMap.values()).map((v) => v.count))}
                  meta={`${row.count} · ${formatMoney(row.value, ctx.tenant.currency)}`}
                  color={s.color}
                />
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Payments by method (in range)" />
          <div className="px-5 pb-4 pt-2">
            {methodDonutData.length > 0 ? (
              <DonutChart
                data={methodDonutData}
                valuePrefix={ctx.tenant.currency === "USD" ? "$" : ""}
                height={200}
              />
            ) : (
              <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
                No payments in range.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Top customers by cash collected" />
          <ul>
            {topCustomerRows.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No payments in range.</li>
            )}
            {topCustomerRows.map((c) => (
              <li key={c.customerId} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <Link href={`/t/${slug}/customers/${c.customerId}`} className="text-sm font-medium underline">
                  {c.name}
                </Link>
                <div className="text-sm font-medium">
                  {formatMoney(c.amount, ctx.tenant.currency)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Expenses breakdown */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Expenses by category"
            description={`${formatMoney(expenseTotal, ctx.tenant.currency)} total · tax ${formatMoney(expenseTax, ctx.tenant.currency)}`}
            right={
              <Link
                href={`/t/${slug}/expenses`}
                className="text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                See ledger
              </Link>
            }
          />
          <div className="space-y-2 px-5 py-4">
            {topExpenseCategories.length === 0 && (
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                No expenses logged in this range.
              </div>
            )}
            {topExpenseCategories.map((row) => (
              <Bar
                key={row.category}
                label={row.category}
                value={row.amount}
                max={Math.max(1, ...topExpenseCategories.map((r) => r.amount))}
                meta={`${row.count} · ${formatMoney(row.amount, ctx.tenant.currency)}`}
                color="#8b5cf6"
              />
            ))}
            {otherExpenseCategoryTotal > 0 && (
              <Bar
                label="Other"
                value={otherExpenseCategoryTotal}
                max={Math.max(1, ...topExpenseCategories.map((r) => r.amount))}
                meta={formatMoney(otherExpenseCategoryTotal, ctx.tenant.currency)}
                color="#6b7280"
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Expenses by method" />
          <div className="space-y-2 px-5 py-4">
            {expenseMethodRows.length === 0 && (
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                Nothing to show.
              </div>
            )}
            {expenseMethodRows
              .sort((a, b) => b.amount - a.amount)
              .map((row) => (
                <Bar
                  key={row.method}
                  label={row.method.replace(/_/g, " ").toLowerCase()}
                  value={row.amount}
                  max={Math.max(1, ...expenseMethodRows.map((r) => r.amount))}
                  meta={formatMoney(row.amount, ctx.tenant.currency)}
                  color="#f59e0b"
                />
              ))}
          </div>
        </Card>
      </div>

      {/* Loss tracking */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Stat
          label="Refunds issued"
          value={formatMoney(refundedInRange, ctx.tenant.currency)}
          sub={`${refundAgg._count._all} ${refundAgg._count._all === 1 ? "refund" : "refunds"} in range`}
        />
        <Stat
          label="Written off"
          value={formatMoney(writtenOffInRange, ctx.tenant.currency)}
          sub={`${writeOffAgg._count._all} ${writeOffAgg._count._all === 1 ? "entry" : "entries"} in range · bad debt concession`}
        />
      </div>

      <Card>
        <CardHeader title="Open invoices (oldest first)" description={`${openInvoices.length} on the books`} />
        <ul>
          {openInvoices.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>Nothing outstanding.</li>
          )}
          {openInvoices.slice(0, 30).map((inv) => {
            const balance = outstandingBalance(inv);
            const overdue = (daysPastDue(inv.dueDate) ?? -1) > 0;
            return (
              <li key={inv.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <Link href={`/t/${slug}/invoices/${inv.id}`} className="text-sm font-medium underline">
                    {inv.number}
                  </Link>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: invoiceStatusColor(inv.status), color: "white" }}>
                    {invoiceStatusLabel(inv.status)}
                  </span>
                  <Link href={`/t/${slug}/customers/${inv.customer.id}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                    {inv.customer.name}
                  </Link>
                  {inv.dueDate && (
                    <span className="text-xs" style={{ color: overdue ? "#ef4444" : "var(--muted)" }}>
                      due {formatDate(inv.dueDate)}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium">
                  {formatMoney(balance, ctx.tenant.currency)}
                </div>
              </li>
            );
          })}
        </ul>
        {openInvoices.length > 30 && (
          <div className="px-5 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
            Showing 30 of {openInvoices.length}. <Link href={`/t/${slug}/invoices?scope=open`} className="underline">See all.</Link>
          </div>
        )}
      </Card>
    </div>
  );
}
