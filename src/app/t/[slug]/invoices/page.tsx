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
        className="flex flex-col gap-3 px-3 py-3"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 60%, transparent) 0%, transparent 100%)",
        }}
      >
        <form className="flex flex-col gap-2.5" method="get">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {sp.bucket && <input type="hidden" name="bucket" value={sp.bucket} />}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 34,
              padding: "0 10px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search invoice # or customer…"
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            />
            <button
              type="submit"
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                padding: "3px 8px",
                borderRadius: 5,
              }}
            >
              Go
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="ts-focus rounded-md outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
                fontSize: 11.5,
                fontWeight: 500,
                padding: "4px 8px",
                height: 28,
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
                className="ts-focus rounded-md outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: "4px 8px",
                  height: 28,
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
                className="ts-focus inline-flex items-center rounded-md transition-colors"
                style={{
                  background: active
                    ? "var(--accent-surface)"
                    : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
                  border: active
                    ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
                    : "1px solid var(--border-subtle)",
                  color: active ? "var(--accent-primary)" : "var(--text-muted)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 11.5,
                  letterSpacing: "-0.005em",
                  padding: "4px 10px",
                  height: 26,
                }}
              >
                {v.label}
              </Link>
            );
          })}
        </div>

        {outstanding > 0 && (
          <div className="flex flex-col gap-1.5">
            <span
              style={{
                color: "var(--text-faint)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Aging
            </span>
            <div className="flex flex-wrap gap-1">
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
                    className="ts-focus inline-flex items-center gap-1.5 rounded-md transition-colors"
                    style={{
                      background: active
                        ? b.color
                        : `color-mix(in oklab, ${b.color} 14%, transparent)`,
                      color: active ? "white" : b.color,
                      border: active
                        ? `1px solid ${b.color}`
                        : `1px solid color-mix(in oklab, ${b.color} 28%, transparent)`,
                      padding: "3px 8px",
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      lineHeight: 1.2,
                    }}
                    title={`${b.label} — ${formatMoney(total, ctx.tenant.currency)}`}
                  >
                    <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {b.label}
                    </span>
                    <span style={{ fontFeatureSettings: "'tnum' 1", opacity: active ? 1 : 0.85 }}>
                      {formatMoney(total, ctx.tenant.currency)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div
          className="flex items-center justify-between"
          style={{ color: "var(--text-faint)", fontSize: 10.5 }}
        >
          <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
            {invoices.length} {invoices.length === 1 ? "invoice" : "invoices"}
            {view !== "all" && (
              <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                in {VIEWS.find((v) => v.value === view)?.label}
              </span>
            )}
          </span>
          <span className="hidden lg:inline" style={{ letterSpacing: "0.02em" }}>
            ↑↓ navigate · / search
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div
            className="m-3 rounded-lg p-5 text-center"
            style={{
              background: "color-mix(in oklab, var(--surface-2) 40%, transparent)",
              border: "1px dashed var(--border-subtle)",
              color: "var(--text-muted)",
              fontSize: 12.5,
            }}
          >
            No invoices match these filters.{" "}
            <Link
              href={`/t/${slug}/invoices`}
              className="underline"
              style={{ color: "var(--accent-primary)" }}
            >
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
      <div
        className="flex h-full min-h-[400px] items-center justify-center p-10"
        style={{
          background:
            "radial-gradient(720px circle at 50% -20%, var(--accent-surface), transparent 55%)",
        }}
      >
        <div className="max-w-sm text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 4h12v16l-3-2-3 2-3-2-3 2V4z" />
              <path d="M9 9h6M9 13h6M9 17h3" />
            </svg>
          </div>
          <h2
            className="mt-5 font-semibold"
            style={{
              color: "var(--text-default)",
              fontSize: 18,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
            }}
          >
            Select an invoice
          </h2>
          <p
            className="mt-1.5"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Pick a row on the left to see line items, payments, and activity — without leaving the page.
          </p>
          <div
            className="mt-5 inline-flex items-center gap-3 rounded-lg px-3 py-2"
            style={{
              background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
              border: "1px solid var(--border-subtle)",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <span className="inline-flex items-center gap-1">
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >↑</kbd>
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >↓</kbd>
              navigate
            </span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span className="inline-flex items-center gap-1">
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >/</kbd>
              search
            </span>
          </div>
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
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Invoices
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {invoices.length}
              </span>
              {outstanding > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: 4,
                    fontSize: 11.5,
                    color: "var(--text-muted)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--text-faint)",
                    }}
                  >
                    Outstanding
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--text-default)",
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    {formatMoney(outstanding, ctx.tenant.currency)}
                  </span>
                </span>
              )}
              {overdueTotal > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--danger-fg, var(--rose-500))",
                    background:
                      "color-mix(in oklab, var(--rose-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    lineHeight: 1,
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "var(--danger-fg, var(--rose-500))",
                      boxShadow:
                        "0 0 0 2px color-mix(in oklab, var(--rose-500) 25%, transparent)",
                    }}
                  />
                  {formatMoney(overdueTotal, ctx.tenant.currency)} overdue
                </span>
              )}
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Track what&apos;s billed and what&apos;s still out — paid invoices close the loop on every order.
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
                className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
                style={{
                  height: 32,
                  padding: "0 14px",
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                  color: "var(--accent-fg)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                  boxShadow:
                    "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                    "0 1px 2px 0 rgba(0,0,0,0.35)",
                  fontSize: 12.5,
                  letterSpacing: "-0.005em",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New invoice
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
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
