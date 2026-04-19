import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDate } from "@/lib/format";
import {
  INVOICE_STATUSES,
  statusColor,
  statusLabel,
  OPEN_INVOICE_STATUSES,
  outstandingBalance,
  agingFor,
  agingBucketColor,
  agingBucketLabel,
  AGING_BUCKETS,
  type AgingBucket,
} from "@/lib/invoices";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { InvoicesTable, type InvoicesTableRow } from "@/components/invoices/InvoicesTable";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import type { Prisma } from "@prisma/client";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    scope?: "open" | "overdue";
    branch?: string;
    bucket?: AgingBucket;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "invoices:view");
  const canManage = ctx.can("invoices:manage");

  let where: Prisma.InvoiceWhereInput = { tenantId: ctx.tenant.id };
  if (sp.status) where.status = sp.status as never;
  if (sp.scope === "open") where.status = { in: OPEN_INVOICE_STATUSES };
  if (sp.scope === "overdue") {
    where.status = { in: OPEN_INVOICE_STATUSES };
    where.dueDate = { lt: new Date() };
  }
  if (sp.q) {
    where.OR = [
      { number: { contains: sp.q, mode: "insensitive" } },
      { customer: { name: { contains: sp.q, mode: "insensitive" } } },
    ];
  }
  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  const openWhere = applyBranchScope(
    { tenantId: ctx.tenant.id, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput,
    ctx.branchScope,
  );

  const [invoices, openRows, savedViews] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        customer: { select: { id: true, name: true } },
        order: { select: { id: true, number: true } },
      },
    }),
    db.invoice.findMany({
      where: openWhere,
      select: {
        id: true, total: true, amountPaid: true,
        refundedAmount: true, writtenOffAmount: true,
        status: true, dueDate: true,
      },
      take: 500,
    }),
    listSavedViews(slug, "invoices"),
  ]);

  const bucketTotals: Record<AgingBucket, number> = {
    CURRENT: 0, D_1_30: 0, D_31_60: 0, D_61_90: 0, D_90_PLUS: 0,
  };
  let outstanding = 0;
  for (const r of openRows) {
    const bal = outstandingBalance(r);
    outstanding += bal;
    const { bucket } = agingFor({ status: r.status, dueDate: r.dueDate });
    bucketTotals[bucket] += bal;
  }
  const overdueTotal =
    bucketTotals.D_1_30 + bucketTotals.D_31_60 + bucketTotals.D_61_90 + bucketTotals.D_90_PLUS;

  const filteredInvoices = sp.bucket
    ? invoices.filter((inv) => agingFor({ status: inv.status, dueDate: inv.dueDate }).bucket === sp.bucket)
    : invoices;

  const now = new Date();

  const rows: InvoicesTableRow[] = filteredInvoices.map((inv) => {
    const balance = outstandingBalance(inv);
    const aging = agingFor({ status: inv.status, dueDate: inv.dueDate, now });
    const isOverdue = aging.daysPastDue > 0;
    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      statusLabel: statusLabel(inv.status),
      statusColor: statusColor(inv.status),
      agingLabel: isOverdue ? agingBucketLabel(aging.bucket) : null,
      agingColor: isOverdue ? agingBucketColor(aging.bucket) : null,
      isOverdue,
      daysPastDue: aging.daysPastDue,
      customerId: inv.customer.id,
      customerName: inv.customer.name,
      issuedLabel: inv.issuedAt ? formatDate(inv.issuedAt) : null,
      dueLabel: inv.dueDate ? formatDate(inv.dueDate) : null,
      orderId: inv.order?.id ?? null,
      orderNumber: inv.order?.number ?? null,
      balance: formatMoney(balance, ctx.tenant.currency),
      total: formatMoney(inv.total.toString(), ctx.tenant.currency),
    };
  });

  const hasFilters = !!(sp.q || sp.status || sp.scope || sp.branch || sp.bucket);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {" · "}
            <span>Outstanding: </span>
            <span style={{ color: "var(--text)" }}>{formatMoney(outstanding, ctx.tenant.currency)}</span>
            {overdueTotal > 0 && (
              <>
                {" · "}
                <span style={{ color: "#ef4444" }}>
                  Overdue {formatMoney(overdueTotal, ctx.tenant.currency)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SavedViewPicker
            slug={slug}
            entityKind="invoices"
            views={savedViews}
            canShare={ctx.role === "OWNER" || ctx.role === "ADMIN"}
          />
          <Link
            href={`/t/${slug}/invoices/new`}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent)", color: "white" }}
          >
            New invoice
          </Link>
        </div>
      </div>

      {outstanding > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {AGING_BUCKETS.map((b) => {
            const total = bucketTotals[b.value];
            if (total <= 0) return null;
            const active = sp.bucket === b.value;
            const qs = new URLSearchParams();
            qs.set("scope", "open");
            if (!active) qs.set("bucket", b.value);
            return (
              <Link
                key={b.value}
                href={`/t/${slug}/invoices?${qs.toString()}`}
                className="rounded-md px-3 py-1.5"
                style={{
                  background: active ? b.color : "var(--panel)",
                  color: active ? "white" : "var(--text)",
                  border: `1px solid ${active ? b.color : "var(--border)"}`,
                }}
              >
                <span className="font-medium">{b.label}</span>
                <span className="ml-2" style={{ opacity: 0.85 }}>
                  {formatMoney(total, ctx.tenant.currency)}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <nav className="mt-4 flex gap-1 text-sm">
        {(["all", "open", "overdue"] as const).map((f) => {
          const active =
            f === "open" ? sp.scope === "open" :
            f === "overdue" ? sp.scope === "overdue" :
            !sp.scope;
          const href =
            f === "open" ? `/t/${slug}/invoices?scope=open` :
            f === "overdue" ? `/t/${slug}/invoices?scope=overdue` :
            `/t/${slug}/invoices`;
          return (
            <Link
              key={f}
              href={href}
              className="rounded-md px-3 py-1.5"
              style={{
                background: active ? "var(--panel)" : "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {f === "open" ? "Open" : f === "overdue" ? "Overdue" : "All"}
            </Link>
          );
        })}
      </nav>

      <form className="mt-4 flex flex-wrap gap-2 text-sm" method="get">
        {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}
        {sp.bucket && <input type="hidden" name="bucket" value={sp.bucket} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search invoice # or customer…"
          className="flex-1 rounded-md px-3 py-2 outline-none"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded-md px-3 py-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {branchChoices.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="rounded-md px-3 py-2"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <option value="">All branches</option>
            {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button type="submit" className="rounded-md px-4 py-2" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
          Filter
        </button>
        {(sp.q || sp.status || sp.bucket) && (
          <Link
            href={sp.scope ? `/t/${slug}/invoices?scope=${sp.scope}` : `/t/${slug}/invoices`}
            className="rounded-md px-3 py-2"
            style={{ color: "var(--muted)" }}
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card className="mt-4">
          {hasFilters ? (
            <EmptyState
              title="No invoices match this view"
              description="Try clearing filters or switching to All invoices."
              actionHref={`/t/${slug}/invoices`}
              actionLabel="Clear filters"
            />
          ) : (
            <EmptyState
              title="No invoices yet"
              description="Invoices appear here after you convert an order. Start by approving a quote and turning it into an order."
              actionHref={`/t/${slug}/orders`}
              actionLabel="Go to orders"
            />
          )}
        </Card>
      ) : (
        <div className="mt-4">
          <InvoicesTable
            slug={slug}
            canEdit={canManage}
            rows={rows}
            empty={
              <div
                className="px-4 py-8 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No invoices match these filters.{" "}
                <Link href={`/t/${slug}/invoices`} className="underline">
                  Clear filters
                </Link>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
