import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDate } from "@/lib/format";
import {
  AGING_BUCKETS,
  OPEN_INVOICE_STATUSES,
  agingBucketLabel,
  agingFor,
  outstandingBalance,
  paymentMethodLabel,
  type AgingBucket,
} from "@/lib/invoices";
import { applyBranchScope } from "@/lib/locations";
import { sendInvoiceReminder } from "@/app/actions/invoices";
import type { Prisma } from "@prisma/client";

// Payments — the collections hub. Answers the three questions a shop
// owner asks daily:
//   1. Who owes me money? (aging table)
//   2. What came in recently? (payments feed)
//   3. Who should I chase today? (overdue list with one-click reminder)
//
// Everything here is derived from existing Invoice + Payment rows —
// no new schema. The actual record-payment flow still lives on the
// invoice detail page; this is the roll-up surface.

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    bucket?: AgingBucket;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "invoices:view");
  const canRecord = ctx.can("payments:record");
  const canManageInvoices = ctx.can("invoices:manage");

  const now = new Date();
  const currency = ctx.tenant.currency;

  const openWhere = applyBranchScope(
    {
      tenantId: ctx.tenant.id,
      status: { in: OPEN_INVOICE_STATUSES },
    } as Prisma.InvoiceWhereInput,
    ctx.branchScope,
  );
  const paidWhere = applyBranchScope(
    { tenantId: ctx.tenant.id } as Prisma.InvoiceWhereInput,
    ctx.branchScope,
  );

  // Parallel fetch: open invoices (for aging), recent payments
  // (non-voided, non-failed), overdue invoice rows for the chase list.
  const [openRows, recentPayments] = await Promise.all([
    db.invoice.findMany({
      where: openWhere,
      select: {
        id: true,
        number: true,
        total: true,
        amountPaid: true,
        refundedAmount: true,
        writtenOffAmount: true,
        status: true,
        dueDate: true,
        customer: { select: { id: true, name: true } },
      },
      take: 500,
    }),
    db.payment.findMany({
      where: {
        invoice: paidWhere,
        voidedAt: null,
        failedAt: null,
      },
      orderBy: { receivedAt: "desc" },
      take: 25,
      include: {
        invoice: {
          select: {
            id: true,
            number: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  // Aging roll-up.
  const bucketTotals: Record<AgingBucket, number> = {
    CURRENT: 0,
    D_1_30: 0,
    D_31_60: 0,
    D_61_90: 0,
    D_90_PLUS: 0,
  };
  const bucketCounts: Record<AgingBucket, number> = {
    CURRENT: 0,
    D_1_30: 0,
    D_31_60: 0,
    D_61_90: 0,
    D_90_PLUS: 0,
  };
  let outstanding = 0;
  for (const r of openRows) {
    const bal = outstandingBalance(r);
    if (bal <= 0) continue;
    outstanding += bal;
    const { bucket } = agingFor({ status: r.status, dueDate: r.dueDate, now });
    bucketTotals[bucket] += bal;
    bucketCounts[bucket] += 1;
  }
  const overdueTotal =
    bucketTotals.D_1_30 + bucketTotals.D_31_60 + bucketTotals.D_61_90 + bucketTotals.D_90_PLUS;
  const overdueCount =
    bucketCounts.D_1_30 + bucketCounts.D_31_60 + bucketCounts.D_61_90 + bucketCounts.D_90_PLUS;

  // Overdue list — sorted worst-first.
  const overdueInvoices = openRows
    .map((r) => {
      const aging = agingFor({ status: r.status, dueDate: r.dueDate, now });
      const balance = outstandingBalance(r);
      return { ...r, aging, balance };
    })
    .filter((r) => r.aging.daysPastDue > 0 && r.balance > 0)
    .sort((a, b) => b.aging.daysPastDue - a.aging.daysPastDue)
    .slice(0, 50);

  // Filter overdue list by bucket if user clicked a bucket tile.
  const filteredOverdue = sp.bucket
    ? overdueInvoices.filter((r) => r.aging.bucket === sp.bucket)
    : overdueInvoices;

  // Last-7-days collected total (headline KPI next to outstanding).
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const last7 = recentPayments
    .filter((p) => p.receivedAt >= sevenDaysAgo)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Collections snapshot · A/R aging, overdue chase list, and recent cash in.
          </p>
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Outstanding"
          value={formatMoney(outstanding, currency)}
          hint={`${openRows.length} open ${openRows.length === 1 ? "invoice" : "invoices"}`}
          accent="var(--accent-primary)"
        />
        <KpiCard
          label="Overdue"
          value={formatMoney(overdueTotal, currency)}
          hint={`${overdueCount} past due`}
          accent={overdueTotal > 0 ? "#ef4444" : "var(--text-muted)"}
        />
        <KpiCard
          label="Collected (last 7 days)"
          value={formatMoney(last7, currency)}
          hint={`${recentPayments.filter((p) => p.receivedAt >= sevenDaysAgo).length} payments`}
          accent="#10b981"
        />
      </div>

      {/* A/R aging tiles */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            A/R aging
          </h2>
          {sp.bucket && (
            <Link
              href={`/t/${slug}/payments`}
              className="text-xs underline"
              style={{ color: "var(--text-muted)" }}
            >
              Clear bucket filter
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {AGING_BUCKETS.map((b) => {
            const active = sp.bucket === b.value;
            const qs = new URLSearchParams();
            if (!active) qs.set("bucket", b.value);
            const href = `/t/${slug}/payments${qs.toString() ? `?${qs.toString()}` : ""}`;
            const total = bucketTotals[b.value];
            const count = bucketCounts[b.value];
            return (
              <Link
                key={b.value}
                href={href}
                className="ts-focus rounded-lg px-3 py-3 transition-colors"
                style={{
                  background: active ? b.color : "var(--surface-1)",
                  color: active ? "white" : "var(--text-default)",
                  border: `1px solid ${active ? b.color : "var(--border-subtle)"}`,
                }}
              >
                <div
                  className="text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: active ? "white" : b.color, opacity: active ? 0.9 : 1 }}
                >
                  {b.label}
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {formatMoney(total, currency)}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: active ? "white" : "var(--text-muted)", opacity: active ? 0.85 : 1 }}
                >
                  {count} {count === 1 ? "invoice" : "invoices"}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Chase list + recent feed */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Needs chasing {sp.bucket && <span style={{ color: "var(--text-muted)" }}>· {agingBucketLabel(sp.bucket)}</span>}
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {filteredOverdue.length} {filteredOverdue.length === 1 ? "invoice" : "invoices"}
            </span>
          </div>

          {filteredOverdue.length === 0 ? (
            <Card>
              <EmptyState
                title={overdueCount === 0 ? "No overdue invoices" : "No overdue invoices in this bucket"}
                description={
                  overdueCount === 0
                    ? "Every open invoice is inside its payment window. Check back after due dates pass."
                    : "Pick a different aging bucket to see what else is outstanding."
                }
                actionHref={`/t/${slug}/invoices?scope=open`}
                actionLabel="View open invoices"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-left"
                      style={{
                        color: "var(--text-faint)",
                        background: "var(--surface-1)",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Customer</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider">Balance</th>
                      <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider">Past due</th>
                      {canManageInvoices && (
                        <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider">Remind</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverdue.map((r) => {
                      const bucketMeta = AGING_BUCKETS.find((b) => b.value === r.aging.bucket);
                      return (
                        <tr
                          key={r.id}
                          className="transition-colors hover:bg-[color:var(--surface-2)]"
                          style={{ borderTop: "1px solid var(--border-subtle)" }}
                        >
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/t/${slug}/invoices/${r.id}`}
                              className="font-medium hover:underline"
                              style={{ color: "var(--text-default)" }}
                            >
                              {r.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5" style={{ color: "var(--text-default)" }}>
                            {r.customer.name}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium" style={{ color: "var(--text-default)" }}>
                            {formatMoney(r.balance, currency)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{
                                background: `${bucketMeta?.color ?? "#ef4444"}1a`,
                                color: bucketMeta?.color ?? "#ef4444",
                              }}
                            >
                              {r.aging.daysPastDue}d · {bucketMeta?.label}
                            </span>
                          </td>
                          {canManageInvoices && (
                            <td className="px-4 py-2.5 text-right">
                              <form action={sendInvoiceReminder.bind(null, slug, r.id)}>
                                <button
                                  type="submit"
                                  className="ts-btn-secondary rounded-md px-2.5 py-1 text-xs"
                                >
                                  Send reminder
                                </button>
                              </form>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Recent payments
            </h2>
            {canRecord && (
              <Link
                href={`/t/${slug}/invoices?scope=open`}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Record a payment
              </Link>
            )}
          </div>

          {recentPayments.length === 0 ? (
            <Card>
              <EmptyState
                title="No payments yet"
                description="Payments recorded against any invoice appear here."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul>
                {recentPayments.map((p, idx) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                    style={{
                      borderTop:
                        idx === 0 ? "none" : "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/t/${slug}/invoices/${p.invoice.id}`}
                          className="text-sm font-medium hover:underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {p.invoice.number}
                        </Link>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                          style={{
                            background: "var(--surface-2)",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          {paymentMethodLabel(p.method)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                        {p.invoice.customer.name}
                        {p.reference && ` · ${p.reference}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold" style={{ color: "#10b981" }}>
                        +{formatMoney(Number(p.amount), currency)}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {formatDate(p.receivedAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-lg px-4 py-3.5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="text-[11px] font-medium uppercase tracking-wider"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {hint}
      </div>
    </div>
  );
}
