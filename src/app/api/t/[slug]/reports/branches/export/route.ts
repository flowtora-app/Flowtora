import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolveRange } from "@/lib/reports";
import { listActiveLocations } from "@/lib/locations";
import { ACTIVE_ORDER_STATUSES } from "@/lib/orders";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices";
import { OPEN_INSTALL_STATUSES } from "@/lib/installs";
import { rowsToCsv, csvResponse } from "@/lib/csv";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "reports:view").catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ctx.can("locations:cross_view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url   = new URL(req.url);
  const sp    = Object.fromEntries(url.searchParams.entries());
  const range = resolveRange(sp);

  const branches = await listActiveLocations(ctx.tenant.id);

  const now     = new Date();
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
    db.quote.groupBy({
      by: ["locationId"],
      where: { tenantId: ctx.tenant.id, createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum:   { total: true },
    }),
    db.order.groupBy({
      by: ["locationId"],
      where: { tenantId: ctx.tenant.id, createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum:   { total: true },
    }),
    db.invoice.groupBy({
      by: ["locationId"],
      where: {
        tenantId:  ctx.tenant.id,
        createdAt: { gte: range.from, lte: range.to },
        status:    { not: "VOID" },
      },
      _count: { _all: true },
      _sum:   { total: true },
    }),
    db.payment.findMany({
      where: {
        tenantId:   ctx.tenant.id,
        receivedAt: { gte: range.from, lte: range.to },
        voidedAt:   null,
      },
      select: { amount: true, invoice: { select: { locationId: true } } },
    }),
    db.order.groupBy({
      by: ["locationId"],
      where: { tenantId: ctx.tenant.id, status: { in: ACTIVE_ORDER_STATUSES } },
      _count: { _all: true },
      _sum:   { total: true },
    }),
    db.invoice.findMany({
      where: { tenantId: ctx.tenant.id, status: { in: OPEN_INVOICE_STATUSES } },
      select: { locationId: true, total: true, amountPaid: true },
    }),
    db.installEvent.groupBy({
      by: ["locationId"],
      where: {
        tenantId:       ctx.tenant.id,
        status:         { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: now, lte: in7Days },
      },
      _count: { _all: true },
    }),
  ]);

  type BranchRow = {
    id: string;
    name: string;
    quotesCount: number;   quotesValue: number;
    ordersCount: number;   ordersValue: number;
    invoicedCount: number; invoicedValue: number;
    cash: number;
    backlogCount: number;  backlogValue: number;
    ar: number;
    upcoming: number;
  };

  const blank = (id: string, name: string): BranchRow => ({
    id, name,
    quotesCount: 0, quotesValue: 0,
    ordersCount: 0, ordersValue: 0,
    invoicedCount: 0, invoicedValue: 0,
    cash: 0,
    backlogCount: 0, backlogValue: 0,
    ar: 0,
    upcoming: 0,
  });

  const rowMap = new Map<string, BranchRow>(
    branches.map((b) => [b.id, blank(b.id, b.name)] as const),
  );
  const unassigned = blank("__unassigned", "Unassigned");
  const bucket = (id: string | null | undefined): BranchRow =>
    id ? rowMap.get(id) ?? unassigned : unassigned;

  for (const r of quotesByBranch)   { const b = bucket(r.locationId); b.quotesCount   = r._count._all; b.quotesValue   = Number(r._sum.total ?? 0); }
  for (const r of ordersByBranch)   { const b = bucket(r.locationId); b.ordersCount   = r._count._all; b.ordersValue   = Number(r._sum.total ?? 0); }
  for (const r of invoicedByBranch) { const b = bucket(r.locationId); b.invoicedCount = r._count._all; b.invoicedValue = Number(r._sum.total ?? 0); }
  for (const p of paymentsRaw)      { const b = bucket(p.invoice?.locationId ?? null); b.cash += Number(p.amount); }
  for (const r of backlogByBranch)  { const b = bucket(r.locationId); b.backlogCount  = r._count._all; b.backlogValue  = Number(r._sum.total ?? 0); }
  for (const inv of openInvoicesRaw) {
    const b = bucket(inv.locationId);
    b.ar += Math.max(0, Number(inv.total) - Number(inv.amountPaid));
  }
  for (const r of upcomingByBranch) { const b = bucket(r.locationId); b.upcoming = r._count._all; }

  const orderedRows: BranchRow[] = branches.map((b) => rowMap.get(b.id)!);
  const hasUnassigned =
    unassigned.quotesCount + unassigned.ordersCount + unassigned.invoicedCount +
    unassigned.cash + unassigned.backlogCount + unassigned.ar + unassigned.upcoming > 0;
  if (hasUnassigned) orderedRows.push(unassigned);

  const rows = orderedRows.map((r) => ({
    "Branch":             r.name,
    "Quotes (count)":     r.quotesCount,
    "Quotes (value)":     r.quotesValue.toFixed(2),
    "Orders (count)":     r.ordersCount,
    "Orders (value)":     r.ordersValue.toFixed(2),
    "Invoiced (count)":   r.invoicedCount,
    "Invoiced (value)":   r.invoicedValue.toFixed(2),
    "Cash collected":     r.cash.toFixed(2),
    "Active backlog (count)": r.backlogCount,
    "Active backlog (value)": r.backlogValue.toFixed(2),
    "A/R open":           r.ar.toFixed(2),
    "Installs (7d)":      r.upcoming,
  }));

  const csv = rowsToCsv(
    ["Branch", "Quotes (count)", "Quotes (value)", "Orders (count)", "Orders (value)", "Invoiced (count)", "Invoiced (value)", "Cash collected", "Active backlog (count)", "Active backlog (value)", "A/R open", "Installs (7d)"],
    rows,
  );
  return csvResponse(`branches-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
