import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker, Stat, Bar } from "@/components/Reports";
import { resolveRange, resolveBranch, pct, formatPct } from "@/lib/reports";
import { applyBranchScope } from "@/lib/locations";
import { ORDER_STATUSES, ACTIVE_ORDER_STATUSES, statusColor as orderStatusColor, statusLabel as orderStatusLabel } from "@/lib/orders";
import { formatMoney, formatDate } from "@/lib/format";
import type { OrderStatus, Prisma } from "@prisma/client";

export default async function ProductionReportPage({
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

  // In-range: orders created or completed within the range. We count created
  // for volume, and use completed-in-range for cycle time + throughput.
  const inRangeWhere = applyBranchScope({
    tenantId: ctx.tenant.id,
    createdAt: { gte: range.from, lte: range.to },
  } as Prisma.OrderWhereInput, branch.effectiveScope);

  const now = new Date();

  const [byStatusInRange, completedInRange, currentBacklog, overdueOpen, topOrders, completedWithTimes] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      where: inRangeWhere,
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.order.count({
      where: applyBranchScope({
        tenantId: ctx.tenant.id,
        completedAt: { gte: range.from, lte: range.to },
      } as Prisma.OrderWhereInput, branch.effectiveScope),
    }),
    // Backlog is "right now" regardless of range — always reflects what's on
    // the floor at the moment the report is viewed.
    db.order.aggregate({
      where: applyBranchScope(
        { tenantId: ctx.tenant.id, status: { in: ACTIVE_ORDER_STATUSES } } as Prisma.OrderWhereInput,
        branch.effectiveScope,
      ),
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.order.count({
      where: applyBranchScope({
        tenantId: ctx.tenant.id,
        status: { in: ACTIVE_ORDER_STATUSES },
        dueDate: { lt: now },
      } as Prisma.OrderWhereInput, branch.effectiveScope),
    }),
    db.order.findMany({
      where: inRangeWhere,
      orderBy: { total: "desc" },
      take: 10,
      include: { customer: { select: { id: true, name: true } } },
    }),
    db.order.findMany({
      where: applyBranchScope({
        tenantId: ctx.tenant.id,
        completedAt: { gte: range.from, lte: range.to },
      } as Prisma.OrderWhereInput, branch.effectiveScope),
      select: { createdAt: true, completedAt: true },
      take: 500,
    }),
  ]);

  const statusMap = new Map<OrderStatus, { count: number; value: number }>();
  for (const s of ORDER_STATUSES) statusMap.set(s.value, { count: 0, value: 0 });
  for (const row of byStatusInRange) {
    statusMap.set(row.status, {
      count: row._count._all,
      value: Number(row._sum.total ?? 0),
    });
  }

  const totalOrders = byStatusInRange.reduce((n, r) => n + r._count._all, 0);
  const bookedValue = byStatusInRange.reduce((n, r) => n + Number(r._sum.total ?? 0), 0);

  // Avg cycle time (days): created → completed for orders completed in range.
  const cycleDays = completedWithTimes
    .filter((o) => o.completedAt)
    .map((o) => (o.completedAt!.getTime() - o.createdAt.getTime()) / 86_400_000);
  const avgCycleDays =
    cycleDays.length > 0
      ? Math.round((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) * 10) / 10
      : null;

  const backlogCount = currentBacklog._count._all;
  const backlogValue = Number(currentBacklog._sum.total ?? 0);
  const overdueRate = pct(overdueOpen, backlogCount);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">Production</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Orders created in {range.label}. Backlog + overdue are always live.
        </p>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/production`} branch={branch} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Orders booked" value={String(totalOrders)} sub={formatMoney(bookedValue, ctx.tenant.currency)} />
        <Stat label="Completed in range" value={String(completedInRange)} sub={avgCycleDays != null ? `avg ${avgCycleDays}d cycle` : "—"} />
        <Stat label="Active backlog" value={String(backlogCount)} sub={formatMoney(backlogValue, ctx.tenant.currency)} href={`/t/${slug}/orders`} />
        <Stat label="Overdue open" value={String(overdueOpen)} sub={formatPct(overdueRate)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="By status (in range)" />
          <div className="space-y-2 px-5 py-4">
            {ORDER_STATUSES.map((s) => {
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
          <CardHeader
            title="Top orders by value"
            description={`${topOrders.length} of the biggest in range`}
          />
          <ul>
            {topOrders.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No orders in range.</li>
            )}
            {topOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3">
                  <Link href={`/t/${slug}/orders/${o.id}`} className="text-sm font-medium underline">
                    {o.number}
                  </Link>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: orderStatusColor(o.status), color: "white" }}>
                    {orderStatusLabel(o.status)}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    <Link href={`/t/${slug}/customers/${o.customer.id}`} className="underline">{o.customer.name}</Link>
                    {o.dueDate && <> · due {formatDate(o.dueDate)}</>}
                  </span>
                </div>
                <div className="text-sm font-medium">
                  {formatMoney(Number(o.total), ctx.tenant.currency)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
