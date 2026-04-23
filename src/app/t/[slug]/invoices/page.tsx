import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDate, humanize } from "@/lib/format";
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
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import { SplitShell } from "@/components/ui/SplitShell";
import { InvoiceListRow, type InvoiceListRowData } from "@/components/invoices/InvoiceListRow";
import { InvoicePanel, loadInvoiceForPanel } from "@/components/invoices/InvoicePanel";
import type { InvoicePanelTab } from "@/components/invoices/InvoicePanelTabs";
import type { Prisma } from "@prisma/client";

const VALID_TABS: InvoicePanelTab[] = ["overview", "payments", "activity"];

type View = "all" | "open" | "overdue" | "paid";
const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "all",     label: "All",     hint: "Every invoice in scope."                     },
  { value: "open",    label: "Open",    hint: "Sent / Partial / Overdue — balance due."    },
  { value: "overdue", label: "Overdue", hint: "Past due date with balance outstanding."    },
  { value: "paid",    label: "Paid",    hint: "Paid in full."                              },
];

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    view?: View;
    branch?: string;
    bucket?: AgingBucket;
    selected?: string;
    tab?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "invoices:view");
  const canManage = ctx.can("invoices:manage");
  const canRecord = ctx.can("payments:record");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "all";
  const tab: InvoicePanelTab =
    sp.tab && VALID_TABS.includes(sp.tab as InvoicePanelTab)
      ? (sp.tab as InvoicePanelTab)
      : "overview";

  let where: Prisma.InvoiceWhereInput = { tenantId: ctx.tenant.id };
  if (sp.status) where.status = sp.status as never;
  if (view === "open") where.status = { in: OPEN_INVOICE_STATUSES };
  if (view === "overdue") {
    where.status = { in: OPEN_INVOICE_STATUSES };
    where.dueDate = { lt: new Date() };
  }
  if (view === "paid") where.status = "PAID";
  if (sp.q) {
    where.OR = [
      { number:   { contains: sp.q, mode: "insensitive" } },
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

  // Aging buckets — computed off open invoices in scope (ignoring other filters
  // so the chips don't fight the view filter). We scope to branch + tenant.
  const openWhere = applyBranchScope(
    { tenantId: ctx.tenant.id, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput,
    ctx.branchScope,
  );

  const [invoices, openRows, members, savedViews] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        customer: { select: { id: true, name: true } },
        order:    { select: { id: true, number: true } },
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
    memberLookup(ctx.tenant.id),
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
  const rows: InvoiceListRowData[] = filteredInvoices.map((inv) => {
    const balance = outstandingBalance(inv);
    const aging = agingFor({ status: inv.status, dueDate: inv.dueDate, now });
    const isOverdue = aging.daysPastDue > 0;
    return {
      id: inv.id,
      number: inv.number,
      customerName: inv.customer.name,
      statusLabel: statusLabel(inv.status),
      statusColor: statusColor(inv.status),
      kindLabel: inv.kind !== "STANDARD" ? humanize(inv.kind) : null,
      dueLabel: inv.dueDate ? formatDate(inv.dueDate) : null,
      agingLabel: isOverdue ? agingBucketLabel(aging.bucket) : null,
      agingColor: isOverdue ? agingBucketColor(aging.bucket) : null,
      isOverdue,
      total: formatMoney(inv.total.toString(), ctx.tenant.currency),
      balance: formatMoney(balance, ctx.tenant.currency),
      hasBalance: balance > 0.005,
    };
  });

  const urlSelected = sp.selected && rows.some((r) => r.id === sp.selected) ? sp.selected : null;
  const selectedId = urlSelected ?? (rows[0]?.id ?? null);

  const panelData = selectedId
    ? await loadInvoiceForPanel(ctx.tenant.id, selectedId)
    : null;
  if (panelData && panelData.invoice) {
    ctx.assertBranchAccess(panelData.invoice.locationId);
  }

  const baseParams = new URLSearchParams();
  if (sp.q)      baseParams.set("q",      sp.q);
  if (sp.status) baseParams.set("status", sp.status);
  if (sp.branch) baseParams.set("branch", sp.branch);
  if (sp.bucket) baseParams.set("bucket", sp.bucket);
  const buildHref = (v: View) => {
    const p = new URLSearchParams(baseParams);
    if (v !== "all") p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/invoices${qs ? `?${qs}` : ""}`;
  };

  /* ---------- LEFT RAIL ---------- */
  const listNode = (
    <>
      <div
        className="flex flex-col gap-2 px-3 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <form className="flex flex-col gap-2" method="get">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {sp.bucket && <input type="hidden" name="bucket" value={sp.bucket} />}
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search invoice # or customer…"
              className="flex-1 rounded-md px-3 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            />
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm"
              style={{
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
                background: "var(--surface-1)",
              }}
            >
              Go
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="rounded-md px-2 py-1 outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              <option value="">All statuses</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {branchChoices.length > 1 && (
              <select
                name="branch"
                defaultValue={sp.branch ?? ""}
                className="rounded-md px-2 py-1 outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              >
                <option value="">All branches</option>
                {branchChoices.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>
        </form>

        <div className="flex flex-wrap gap-1">
          {VIEWS.map((v) => {
            const active = v.value === view;
            return (
              <Link
                key={v.value}
                href={buildHref(v.value)}
                title={v.hint}
                className="rounded-md px-2 py-1 text-xs"
                style={{
                  background: active ? "var(--accent-surface)" : "transparent",
                  border: "1px solid var(--border-subtle)",
                  color: active ? "var(--accent-primary)" : "var(--text-muted)",
                  fontWeight: active ? 600 : undefined,
                }}
              >
                {v.label}
              </Link>
            );
          })}
        </div>

        {outstanding > 0 && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            {AGING_BUCKETS.map((b) => {
              const total = bucketTotals[b.value];
              if (total <= 0) return null;
              const active = sp.bucket === b.value;
              const p = new URLSearchParams(baseParams);
              if (view !== "all") p.set("view", view);
              if (!active) p.set("bucket", b.value);
              else p.delete("bucket");
              const href = `/t/${slug}/invoices${p.toString() ? `?${p.toString()}` : ""}`;
              return (
                <Link
                  key={b.value}
                  href={href}
                  className="rounded-md px-2 py-0.5"
                  style={{
                    background: active ? b.color : "var(--surface-1)",
                    color: active ? "white" : "var(--text-muted)",
                    border: `1px solid ${active ? b.color : "var(--border-subtle)"}`,
                  }}
                  title={`${b.label} — ${formatMoney(total, ctx.tenant.currency)}`}
                >
                  <span className="font-medium">{b.label}</span>
                  <span className="ml-1 tabular-nums">
                    {formatMoney(total, ctx.tenant.currency)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <div
          className="flex items-center justify-between text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {overdueTotal > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--danger-fg)" }}>
                  {formatMoney(overdueTotal, ctx.tenant.currency)} overdue
                </span>
              </>
            )}
          </span>
          <span className="hidden lg:inline">↑↓ navigate · / search</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            No invoices match these filters.{" "}
            <Link href={`/t/${slug}/invoices`} className="underline">
              Clear filters
            </Link>
          </div>
        ) : (
          rows.map((row) => (
            <InvoiceListRow key={row.id} row={row} selected={row.id === selectedId} />
          ))
        )}
      </div>
    </>
  );

  /* ---------- RIGHT RAIL ---------- */
  let panelNode: React.ReactNode;
  if (!panelData || !panelData.invoice) {
    panelNode = (
      <div className="flex h-full min-h-[400px] items-center justify-center p-10">
        <div className="max-w-md text-center">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 4h12v16l-3-2-3 2-3-2-3 2V4z" />
              <path d="M9 9h6M9 13h6M9 17h3" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold" style={{ color: "var(--text-default)" }}>
            Select an invoice
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Pick a row on the left to see line items, payments, and activity without leaving the page.
          </p>
          <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
            Use <kbd className="rounded border px-1" style={{ borderColor: "var(--border-subtle)" }}>↑</kbd>{" "}
            <kbd className="rounded border px-1" style={{ borderColor: "var(--border-subtle)" }}>↓</kbd>{" "}
            to navigate, <kbd className="rounded border px-1" style={{ borderColor: "var(--border-subtle)" }}>/</kbd>{" "}
            to search.
          </p>
        </div>
      </div>
    );
  } else {
    panelNode = (
      <InvoicePanel
        slug={slug}
        currency={ctx.tenant.currency}
        invoice={panelData.invoice as never}
        activity={panelData.activity as never}
        tab={tab}
        canManage={canManage}
        canRecord={canRecord}
        memberMap={members}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invoices</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {" · Outstanding "}
            <span style={{ color: "var(--text-default)" }}>
              {formatMoney(outstanding, ctx.tenant.currency)}
            </span>
            {overdueTotal > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--danger-fg)" }}>
                  {formatMoney(overdueTotal, ctx.tenant.currency)} overdue
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
          {canManage && (
            <Link
              href={`/t/${slug}/invoices/new`}
              className="rounded-md px-3 py-1.5 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              New invoice
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4">
        {invoices.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              title={view === "all" ? "No invoices yet" : "No invoices match this view"}
              description={
                view === "all"
                  ? "Invoices appear here after you convert an order. Start by approving a quote and turning it into an order."
                  : "Try switching to All, or adjust your filters."
              }
              actionHref={view === "all" ? `/t/${slug}/orders` : `/t/${slug}/invoices`}
              actionLabel={view === "all" ? "Go to orders" : "Clear filters"}
            />
          </Card>
        ) : (
          <SplitShell
            list={listNode}
            panel={panelNode}
            entityIds={rows.map((r) => r.id)}
            selectedId={selectedId}
          />
        )}
      </div>
    </div>
  );
}
