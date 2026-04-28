import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker } from "@/components/Reports";
import { UpgradeRequired } from "@/components/UpgradeRequired";
import { isEntitled } from "@/lib/entitlements";
import { getFeatureGateMeta } from "@/lib/feature-gates";
import { resolveRange, rangeQueryString } from "@/lib/reports";
import { listActiveLocations } from "@/lib/locations";
import { ACTIVE_ORDER_STATUSES } from "@/lib/orders";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices";
import { OPEN_INSTALL_STATUSES } from "@/lib/installs";
import { formatMoney } from "@/lib/format";

// Phase 15 Slice C — branch performance comparison.
//
// Cross-view only: a regional manager / accounting role wants every branch
// side-by-side, so this page intentionally bypasses the per-member branch
// scope (we already gate on `locations:cross_view`). It runs one groupBy per
// metric and pivots into a single table — N branches × K metrics in 2N+ε
// queries, not N×K.

export default async function BranchComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "reports:view");

  // Feature gate — cross-branch comparison is Enterprise.
  if (!(await isEntitled(ctx.tenant.id, ctx.tenant.plan, "branchComparison"))) {
    const meta = getFeatureGateMeta("branchComparison");
    return (
      <UpgradeRequired
        slug={slug}
        featureName={meta.label}
        requiredPlan={meta.requiredPlan}
        reason={meta.reason}
      />
    );
  }

  // A single-branch view of "compare branches" would just duplicate the per-
  // domain reports for that one branch. Hide the page entirely from members
  // without cross-view rights.
  if (!ctx.can("locations:cross_view")) notFound();

  const range = resolveRange(sp);
  const branches = await listActiveLocations(ctx.tenant.id);

  if (branches.length < 2) {
    return (
      <div className="space-y-6">
        <div className="text-sm">
          <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
            ← Reports
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Branch comparison</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            You only have one location.{" "}
            <Link className="underline" href={`/t/${slug}/settings/locations`}>
              Add another in Settings → Locations
            </Link>{" "}
            to enable side-by-side reporting.
          </p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 86_400_000);

  const [
    quotesByBranch,
    ordersByBranch,
    invoicedByBranch,
    paymentsRaw,
    backlogByBranch,
    openInvoicesRaw,
    upcomingByBranch,
  ] = await Promise.all([
    // In-range volume.
    db.quote.groupBy({
      by: ["locationId"],
      where: { tenantId: ctx.tenant.id, createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.order.groupBy({
      by: ["locationId"],
      where: { tenantId: ctx.tenant.id, createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.invoice.groupBy({
      by: ["locationId"],
      where: {
        tenantId: ctx.tenant.id,
        createdAt: { gte: range.from, lte: range.to },
        status: { not: "VOID" },
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    // Payments don't carry their own locationId — pull amount + invoice's
    // location and sum in JS. Acceptable cost: payment volume is tiny vs orders.
    db.payment.findMany({
      where: {
        tenantId: ctx.tenant.id,
        receivedAt: { gte: range.from, lte: range.to },
        voidedAt: null,
      },
      select: { amount: true, invoice: { select: { locationId: true } } },
    }),
    // Live: active backlog by branch.
    db.order.groupBy({
      by: ["locationId"],
      where: { tenantId: ctx.tenant.id, status: { in: ACTIVE_ORDER_STATUSES } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    // Live: A/R balance by branch — reduce in JS so we get true balance
    // (total − amountPaid) per invoice, not raw totals.
    db.invoice.findMany({
      where: { tenantId: ctx.tenant.id, status: { in: OPEN_INVOICE_STATUSES } },
      select: { locationId: true, total: true, amountPaid: true },
    }),
    // Live: install events scheduled in the next 7 days.
    db.installEvent.groupBy({
      by: ["locationId"],
      where: {
        tenantId: ctx.tenant.id,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: now, lte: in7Days },
      },
      _count: { _all: true },
    }),
  ]);

  type BranchRow = {
    id: string;
    name: string;
    quotes:   { count: number; value: number };
    orders:   { count: number; value: number };
    invoiced: { count: number; value: number };
    cash:     number;
    backlog:  { count: number; value: number };
    ar:       number;
    upcoming: number;
  };

  const blank = (id: string, name: string): BranchRow => ({
    id, name,
    quotes:   { count: 0, value: 0 },
    orders:   { count: 0, value: 0 },
    invoiced: { count: 0, value: 0 },
    cash:     0,
    backlog:  { count: 0, value: 0 },
    ar:       0,
    upcoming: 0,
  });

  // Seed every branch with zeros so missing-data branches still appear.
  const rows = new Map<string, BranchRow>(
    branches.map((b) => [b.id, blank(b.id, b.name)] as const),
  );
  // Bucket for legacy rows whose locationId never got backfilled — keeps
  // totals tying out to the per-domain reports.
  const unassigned = blank("__unassigned", "Unassigned");
  const bucket = (id: string | null | undefined): BranchRow =>
    id ? rows.get(id) ?? unassigned : unassigned;

  for (const r of quotesByBranch)   { const b = bucket(r.locationId); b.quotes   = { count: r._count._all, value: Number(r._sum.total ?? 0) }; }
  for (const r of ordersByBranch)   { const b = bucket(r.locationId); b.orders   = { count: r._count._all, value: Number(r._sum.total ?? 0) }; }
  for (const r of invoicedByBranch) { const b = bucket(r.locationId); b.invoiced = { count: r._count._all, value: Number(r._sum.total ?? 0) }; }
  for (const p of paymentsRaw)      { const b = bucket(p.invoice?.locationId ?? null); b.cash += Number(p.amount); }
  for (const r of backlogByBranch)  { const b = bucket(r.locationId); b.backlog  = { count: r._count._all, value: Number(r._sum.total ?? 0) }; }
  for (const inv of openInvoicesRaw) {
    const b = bucket(inv.locationId);
    b.ar += Math.max(0, Number(inv.total) - Number(inv.amountPaid));
  }
  for (const r of upcomingByBranch) { const b = bucket(r.locationId); b.upcoming = r._count._all; }

  const orderedRows: BranchRow[] = branches.map((b) => rows.get(b.id)!);
  const showUnassigned =
    unassigned.quotes.count + unassigned.orders.count + unassigned.invoiced.count +
    unassigned.cash + unassigned.backlog.count + unassigned.ar + unassigned.upcoming > 0;
  if (showUnassigned) orderedRows.push(unassigned);

  const totals: BranchRow = orderedRows.reduce<BranchRow>((acc, r) => {
    acc.quotes.count   += r.quotes.count;   acc.quotes.value   += r.quotes.value;
    acc.orders.count   += r.orders.count;   acc.orders.value   += r.orders.value;
    acc.invoiced.count += r.invoiced.count; acc.invoiced.value += r.invoiced.value;
    acc.cash           += r.cash;
    acc.backlog.count  += r.backlog.count;  acc.backlog.value  += r.backlog.value;
    acc.ar             += r.ar;
    acc.upcoming       += r.upcoming;
    return acc;
  }, blank("__total", "Total"));

  const fmt = (n: number) => formatMoney(n, ctx.tenant.currency);

  // Find the leader for each metric (max value) so we can mark the top branch.
  // Only meaningful when there's actually data and only across real branches
  // (skip "Unassigned" / "Total"). Leader of a zero column = no leader.
  const realRows = branches.map((b) => rows.get(b.id)!);
  const leaderId = (pick: (r: BranchRow) => number): string | null => {
    let best: { id: string; v: number } | null = null;
    for (const r of realRows) {
      const v = pick(r);
      if (v <= 0) continue;
      if (!best || v > best.v) best = { id: r.id, v };
    }
    return best?.id ?? null;
  };
  const leaders = {
    quotes:   leaderId((r) => r.quotes.value),
    orders:   leaderId((r) => r.orders.value),
    invoiced: leaderId((r) => r.invoiced.value),
    cash:     leaderId((r) => r.cash),
    backlog:  leaderId((r) => r.backlog.value),
    ar:       leaderId((r) => r.ar),
    upcoming: leaderId((r) => r.upcoming),
  } as const;

  // Cell renderer: small primary number with a faded subtext below.
  const cell = (primary: string, sub?: string, leader = false) => (
    <td className="px-3 py-3 text-right" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="text-sm" style={{ fontWeight: leader ? 600 : 400 }}>{primary}</div>
      {sub && <div className="text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </td>
  );

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Branch comparison</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {branches.length} active branches · in-range volume + live snapshot.
            {" "}Bold = leader for that column.
          </p>
        </div>
        <a
          href={`/api/t/${slug}/reports/branches/export?${rangeQueryString(range)}`}
          className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Export CSV
        </a>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/branches`} />

      <Card>
        <CardHeader
          title="Per-branch rollup"
          description={`In range: ${range.label}. Backlog, A/R, and upcoming installs are always live.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--panel)" }}>
                <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>Branch</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>Quotes</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>Orders</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>Invoiced</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>Cash collected</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>Active backlog</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>A/R open</th>
                <th className="px-3 py-2 text-right font-medium" style={{ color: "var(--muted)" }}>Installs (7d)</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((r) => {
                const isUnassigned = r.id === "__unassigned";
                return (
                  <tr key={r.id} style={{ opacity: isUnassigned ? 0.7 : 1 }}>
                    <td className="px-3 py-3 text-left" style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="text-sm font-medium">{r.name}</div>
                      {isUnassigned && (
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          Legacy rows without a branch assignment
                        </div>
                      )}
                    </td>
                    {cell(String(r.quotes.count),   fmt(r.quotes.value),   r.id === leaders.quotes)}
                    {cell(String(r.orders.count),   fmt(r.orders.value),   r.id === leaders.orders)}
                    {cell(String(r.invoiced.count), fmt(r.invoiced.value), r.id === leaders.invoiced)}
                    {cell(fmt(r.cash),              undefined,             r.id === leaders.cash)}
                    {cell(String(r.backlog.count),  fmt(r.backlog.value),  r.id === leaders.backlog)}
                    {cell(fmt(r.ar),                undefined,             r.id === leaders.ar)}
                    {cell(String(r.upcoming),       undefined,             r.id === leaders.upcoming)}
                  </tr>
                );
              })}
              <tr style={{ background: "var(--panel)" }}>
                <td className="px-3 py-3 text-left text-sm font-semibold" style={{ borderTop: "2px solid var(--border)" }}>
                  Total
                </td>
                {cell(String(totals.quotes.count),   fmt(totals.quotes.value))}
                {cell(String(totals.orders.count),   fmt(totals.orders.value))}
                {cell(String(totals.invoiced.count), fmt(totals.invoiced.value))}
                {cell(fmt(totals.cash))}
                {cell(String(totals.backlog.count),  fmt(totals.backlog.value))}
                {cell(fmt(totals.ar))}
                {cell(String(totals.upcoming))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Definitions ·
        {" "}<b>Quotes / Orders / Invoiced</b>: created in range.
        {" "}<b>Cash collected</b>: payments received in range, summed by the parent invoice&apos;s branch.
        {" "}<b>Active backlog</b>: orders currently in production, regardless of when they started.
        {" "}<b>A/R open</b>: outstanding balance on sent / partial / overdue invoices right now.
        {" "}<b>Installs (7d)</b>: open install events scheduled in the next seven days.
      </div>
    </div>
  );
}
