import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker, Stat, Funnel, Bar } from "@/components/Reports";
import { resolveRange, resolveBranch, reportQueryString, pct, formatPct } from "@/lib/reports";
import { applyBranchScope } from "@/lib/locations";
import { QUOTE_STATUSES, statusColor as quoteStatusColor, statusLabel as quoteStatusLabel } from "@/lib/quotes";
import { formatMoney, formatDate } from "@/lib/format";
import type { QuoteStatus, Prisma } from "@prisma/client";

export default async function QuotesReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "reports:view");
  const range = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  const baseWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    createdAt: { gte: range.from, lte: range.to },
  } as Prisma.QuoteWhereInput, branch.effectiveScope);

  // `byStatus` aggregates all quotes in range; the funnel uses transition
  // timestamps (sentAt/approvedAt) to show how many quotes *ever reached* each
  // stage, which is what managers actually want to see.
  const [byStatus, sentCount, approvedCount, declinedCount, converted, approvedAgg, topCustomers, approvedWithTimes] = await Promise.all([
    db.quote.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.quote.count({ where: { ...baseWhere, sentAt: { not: null } } }),
    db.quote.count({ where: { ...baseWhere, approvedAt: { not: null } } }),
    db.quote.count({ where: { ...baseWhere, declinedAt: { not: null } } }),
    db.quote.count({ where: { ...baseWhere, order: { isNot: null } } }),
    db.quote.aggregate({
      where: { ...baseWhere, status: "APPROVED" },
      _sum: { total: true },
    }),
    db.quote.groupBy({
      by: ["customerId"],
      where: baseWhere,
      _sum: { total: true },
      _count: { _all: true },
      orderBy: { _sum: { total: "desc" } },
      take: 8,
    }),
    // For cycle time: created + approvedAt pairs within the range.
    db.quote.findMany({
      where: { ...baseWhere, approvedAt: { not: null } },
      select: { createdAt: true, approvedAt: true },
      take: 500,
    }),
  ]);

  const statusMap = new Map<QuoteStatus, { count: number; value: number }>();
  for (const s of QUOTE_STATUSES) statusMap.set(s.value, { count: 0, value: 0 });
  for (const row of byStatus) {
    statusMap.set(row.status, {
      count: row._count._all,
      value: Number(row._sum.total ?? 0),
    });
  }

  const totalQuotes = byStatus.reduce((n, r) => n + r._count._all, 0);
  const quotedValue = byStatus.reduce((n, r) => n + Number(r._sum.total ?? 0), 0);
  const approvalRate = pct(approvedCount, totalQuotes);
  const conversionRate = pct(converted, approvedCount);

  // Avg cycle time (days) from created → approved.
  const cycleDays = approvedWithTimes
    .filter((q) => q.approvedAt)
    .map((q) => (q.approvedAt!.getTime() - q.createdAt.getTime()) / 86_400_000);
  const avgCycleDays =
    cycleDays.length > 0
      ? Math.round((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) * 10) / 10
      : null;

  // Resolve top-customer IDs → names in one batch.
  const customerNames = await db.customer.findMany({
    where: { id: { in: topCustomers.map((t) => t.customerId) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(customerNames.map((c) => [c.id, c.name] as const));

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quote conversion</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Quotes created in {range.label}.
          </p>
        </div>
        <a
          href={`/api/t/${slug}/reports/quotes/export?${reportQueryString(range, branch)}`}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Export CSV
        </a>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/quotes`} branch={branch} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Quotes issued" value={String(totalQuotes)} sub={formatMoney(quotedValue, ctx.tenant.currency)} />
        <Stat label="Approved" value={String(approvedCount)} sub={formatMoney(Number(approvedAgg._sum.total ?? 0), ctx.tenant.currency)} />
        <Stat label="Approval rate" value={formatPct(approvalRate)} sub={`${declinedCount} declined`} />
        <Stat label="Avg approval time" value={avgCycleDays != null ? `${avgCycleDays} d` : "—"} sub={`${cycleDays.length} samples`} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Conversion funnel" description="Ever-reached state (not current)" />
          <div className="px-5 py-4">
            <Funnel
              stages={[
                { label: "Issued",   value: totalQuotes,    meta: `${totalQuotes}`, color: "#6b7280" },
                { label: "Sent",     value: sentCount,      meta: `${sentCount}`,   color: "#3b82f6" },
                { label: "Approved", value: approvedCount,  meta: `${approvedCount}`, color: "#10b981" },
                { label: "Ordered",  value: converted,      meta: `${converted} (${formatPct(conversionRate)})`, color: "#8b5cf6" },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="By current status" />
          <div className="space-y-2 px-5 py-4">
            {QUOTE_STATUSES.map((s) => {
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

        <Card className="md:col-span-2">
          <CardHeader title="Top customers by quoted value" description="Sum of all quotes in range" />
          <ul>
            {topCustomers.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No quotes yet.</li>
            )}
            {topCustomers.map((c) => (
              <li key={c.customerId} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <Link href={`/t/${slug}/customers/${c.customerId}`} className="text-sm font-medium underline">
                    {nameMap.get(c.customerId) ?? c.customerId}
                  </Link>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {c._count._all} {c._count._all === 1 ? "quote" : "quotes"}
                  </span>
                </div>
                <div className="text-sm font-medium">
                  {formatMoney(Number(c._sum.total ?? 0), ctx.tenant.currency)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Range boundaries: {formatDate(range.from)} → {formatDate(range.to)} · Status colors: {QUOTE_STATUSES.map((s) => `${quoteStatusLabel(s.value)}`).join(" · ")} ·
        current accent is <span style={{ color: quoteStatusColor("APPROVED") }}>APPROVED</span>.
      </div>
    </div>
  );
}
