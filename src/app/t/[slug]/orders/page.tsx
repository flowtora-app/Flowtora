import Link from "next/link";
import { redirect } from "next/navigation";
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
import { OrdersViewToggle } from "@/components/orders/OrdersViewToggle";
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

  // Phase 5 — List ⇄ Board toggle. ?view=board is a shortcut into the
  // production swimlane UI; everything else keeps its existing meaning
  // (saved-view filters). Cast is narrow: `view` is typed to our own
  // saved-view enum, but we accept the extra "board" sentinel value.
  if ((sp.view as string | undefined) === "board") {
    redirect(`/t/${slug}/production`);
  }

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
      <div
        className="flex flex-col gap-3 px-3 py-3"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 60%, transparent) 0%, transparent 100%)",
        }}
      >
        <form className="flex flex-col gap-2.5" method="get">
          {sp.assignee === "mine" && <input type="hidden" name="assignee" value="mine" />}
          {view !== "all" && <input type="hidden" name="view" value={view} />}
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
              placeholder="Search order # or customer…"
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
              {ORDER_STATUSES.map((s) => (
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

        <div
          className="flex items-center justify-between"
          style={{ color: "var(--text-faint)", fontSize: 10.5 }}
        >
          <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
            {orders.length} {orders.length === 1 ? "order" : "orders"}
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
            No orders match these filters.{" "}
            <Link
              href={`/t/${slug}/orders`}
              className="underline"
              style={{ color: "var(--accent-primary)" }}
            >
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
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="M8 9h8M8 13h8M8 17h5" />
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
            Select an order
          </h2>
          <p
            className="mt-1.5"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Pick a row on the left to see line items, invoices, blockers, and activity — without leaving the page.
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
            <div className="flex items-center gap-2.5">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Orders
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
                {orders.length}
              </span>
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Production work in flight — pivot from sales to execution. Browse on the left, open on the right.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OrdersViewToggle slug={slug} active="list" />
            <Link
              href={`/t/${slug}/orders?assignee=mine${view !== "all" ? `&view=${view}` : ""}`}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors"
              style={{
                height: 32,
                padding: "0 12px",
                background: sp.assignee === "mine"
                  ? "var(--accent-surface)"
                  : "color-mix(in oklab, var(--surface-2) 75%, transparent)",
                border: sp.assignee === "mine"
                  ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
                  : "1px solid var(--border-subtle)",
                color: sp.assignee === "mine"
                  ? "var(--accent-primary)"
                  : "var(--text-default)",
                fontWeight: sp.assignee === "mine" ? 700 : 500,
                fontSize: 12,
                letterSpacing: "-0.005em",
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
      </div>

      <div className="mt-5">
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
