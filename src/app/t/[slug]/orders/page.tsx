import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import {
  ACTIVE_ORDER_STATUSES,
  ORDER_STATUSES,
  priorityColor,
  priorityLabel,
  statusColor,
  statusLabel,
} from "@/lib/orders";
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import { SplitShell } from "@/components/ui/SplitShell";
import { OrderListRow, type OrderListRowData } from "@/components/orders/OrderListRow";
import { OrderPanel, loadOrderForPanel } from "@/components/orders/OrderPanel";
import type { OrderPanelTab } from "@/components/orders/OrderPanelTabs";
import type { Prisma } from "@prisma/client";

type View = "all" | "queue" | "blocked" | "hotlist" | "overdue";
const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "all",     label: "All",              hint: "Every order, any status."                    },
  { value: "queue",   label: "Production queue", hint: "Not yet completed or canceled."              },
  { value: "blocked", label: "Blocked",          hint: "Has at least one unresolved blocker."        },
  { value: "hotlist", label: "High / Rush",      hint: "Priority is HIGH or RUSH."                   },
  { value: "overdue", label: "Overdue",          hint: "Due date has passed and not yet completed."  },
];

const VALID_TABS: OrderPanelTab[] = [
  "overview", "production", "invoicing", "comments", "activity",
];

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    assignee?: "mine";
    branch?: string;
    view?: View;
    selected?: string;
    tab?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "orders:view");
  const canManage = ctx.can("orders:manage");
  const canInvoice = ctx.can("invoices:manage");
  const canComment = ctx.can("staff:manage");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "all";
  const tab: OrderPanelTab =
    sp.tab && VALID_TABS.includes(sp.tab as OrderPanelTab)
      ? (sp.tab as OrderPanelTab)
      : "overview";

  let where: Prisma.OrderWhereInput = { tenantId: ctx.tenant.id };
  if (sp.status) where.status = sp.status as never;
  if (sp.assignee === "mine") {
    where.OR = [
      { productionManagerId: ctx.userId },
      { installerId: ctx.userId },
    ];
  }
  if (sp.q) {
    const textMatch: Prisma.OrderWhereInput = {
      OR: [
        { number:   { contains: sp.q, mode: "insensitive" } },
        { customer: { name: { contains: sp.q, mode: "insensitive" } } },
      ],
    };
    where.AND = where.AND ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), textMatch] : [textMatch];
  }

  if (view === "queue") {
    where.status = { in: ACTIVE_ORDER_STATUSES };
  } else if (view === "blocked") {
    where.blockers = { some: { resolvedAt: null } };
  } else if (view === "hotlist") {
    where.priority = { in: ["HIGH", "RUSH"] };
  } else if (view === "overdue") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      { dueDate: { lt: new Date() } },
      { status:  { in: ACTIVE_ORDER_STATUSES } },
    ];
  }

  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  // Kick off all three reads in parallel: list, members, saved views. The
  // selected-order detail is fetched after we know the list (so the selection
  // can auto-fallback to the first row if the URL's `selected` doesn't match
  // anything visible, which happens after filters change).
  const [orders, members, savedViews] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        customer: { select: { id: true, name: true } },
        _count:   { select: { items: true, blockers: { where: { resolvedAt: null } } } },
        blockers: { where: { resolvedAt: null }, select: { reason: true }, take: 3 },
      },
    }),
    memberLookup(ctx.tenant.id),
    listSavedViews(slug, "orders"),
  ]);

  const rows: OrderListRowData[] = orders.map((o) => {
    const isActive = ACTIVE_ORDER_STATUSES.includes(o.status);
    const overdue = !!(o.dueDate && isActive && o.dueDate < new Date());
    const depositDue = Number(o.total) * (o.depositPercent / 100);
    const depositOwed = Math.max(0, depositDue - Number(o.paidAmount));
    const depositOwedLabel =
      ctx.tenant.requireDepositBeforeProduction &&
      o.status === "NEW" &&
      o.depositPercent > 0 &&
      depositOwed > 0.005
        ? formatMoney(depositOwed, ctx.tenant.currency)
        : null;
    const blockerHint =
      o.blockers.length > 0
        ? o.blockers.map((b) => b.reason.replace(/_/g, " ").toLowerCase()).join(", ")
        : null;
    return {
      id: o.id,
      number: o.number,
      customerName: o.customer.name,
      statusLabel: statusLabel(o.status),
      statusColor: statusColor(o.status),
      priority: o.priority,
      priorityColor: priorityColor(o.priority),
      dueLabel: o.dueDate ? formatDate(o.dueDate) : null,
      overdue,
      total: formatMoney(o.total.toString(), ctx.tenant.currency),
      blockerCount: o._count.blockers,
      blockerHint,
      depositOwedLabel,
    };
  });

  // Resolve the selected id: use the one from URL if it's still in the filtered
  // list, else auto-select the first row so the panel is never empty when there
  // is something to show.
  const urlSelected = sp.selected && rows.some((r) => r.id === sp.selected) ? sp.selected : null;
  const selectedId = urlSelected ?? (rows[0]?.id ?? null);

  // Load panel data only when we have a selection.
  const panelData = selectedId
    ? await loadOrderForPanel(ctx.tenant.id, selectedId)
    : null;
  if (panelData && panelData.order) {
    ctx.assertBranchAccess(panelData.order.locationId);
  }

  const baseParams = new URLSearchParams();
  if (sp.q)                   baseParams.set("q",        sp.q);
  if (sp.status)              baseParams.set("status",   sp.status);
  if (sp.assignee === "mine") baseParams.set("assignee", "mine");
  if (sp.branch)              baseParams.set("branch",   sp.branch);
  const buildHref = (v: View) => {
    const p = new URLSearchParams(baseParams);
    if (v !== "all") p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/orders${qs ? `?${qs}` : ""}`;
  };

  /* ---------- LEFT RAIL: toolbar + list ---------- */
  const listNode = (
    <>
      {/* Search + filters */}
      <div
        className="flex flex-col gap-2 px-3 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <form className="flex flex-col gap-2" method="get">
          {sp.assignee === "mine" && <input type="hidden" name="assignee" value="mine" />}
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <div className="flex gap-2">
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search order # or customer…"
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
              {ORDER_STATUSES.map((s) => (
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

        {/* View chips */}
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

        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </span>
          <span className="hidden lg:inline">↑↓ navigate · / search</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            No orders match these filters.{" "}
            <Link href={`/t/${slug}/orders`} className="underline">
              Clear filters
            </Link>
          </div>
        ) : (
          rows.map((row) => (
            <OrderListRow key={row.id} row={row} selected={row.id === selectedId} />
          ))
        )}
      </div>
    </>
  );

  /* ---------- RIGHT RAIL: panel ---------- */
  let panelNode: React.ReactNode;
  if (!panelData || !panelData.order) {
    panelNode = (
      <div className="flex h-full min-h-[400px] items-center justify-center p-10">
        <div className="max-w-md text-center">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "var(--surface-1)", color: "var(--text-muted)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold" style={{ color: "var(--text-default)" }}>
            Select an order
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Pick a row on the left to see line items, invoices, blockers and activity without leaving the page.
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
      <OrderPanel
        slug={slug}
        currency={ctx.tenant.currency}
        order={panelData.order as never}
        activity={panelData.activity as never}
        tab={tab}
        canManage={canManage}
        canInvoice={canInvoice}
        canComment={canComment}
        currentUserId={ctx.userId}
        memberMap={members}
        requireDepositBeforeProduction={ctx.tenant.requireDepositBeforeProduction}
        tenantName={ctx.tenant.name}
      />
    );
  }

  /* ---------- Page ---------- */
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Browse on the left, work on the right — orders open instantly without leaving the page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/t/${slug}/orders?assignee=mine${view !== "all" ? `&view=${view}` : ""}`}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{
              background: sp.assignee === "mine" ? "var(--accent-surface)" : "transparent",
              border: "1px solid var(--border-subtle)",
              color: sp.assignee === "mine" ? "var(--accent-primary)" : "var(--text-default)",
              fontWeight: sp.assignee === "mine" ? 600 : undefined,
            }}
          >
            {sp.assignee === "mine" ? "✓ Mine" : "Assigned to me"}
          </Link>
          <SavedViewPicker
            slug={slug}
            entityKind="orders"
            views={savedViews}
            canShare={ctx.role === "OWNER" || ctx.role === "ADMIN"}
          />
        </div>
      </div>

      <div className="mt-4">
        {orders.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              title={view === "all" ? "No orders yet" : "No orders match this view"}
              description={
                view === "all"
                  ? "Orders appear here once a customer approves a quote. Send a quote to get the pipeline moving."
                  : "Try switching to All, or adjust your filters."
              }
              actionHref={view === "all" ? `/t/${slug}/quotes` : `/t/${slug}/orders`}
              actionLabel={view === "all" ? "Go to quotes" : "Clear filters"}
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
