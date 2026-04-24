import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import {
  updateOrderMeta,
  changeOrderStatus,
  toggleItemProduced,
  deleteOrder,
  updateOrderPriority,
  addOrderBlocker,
  resolveOrderBlocker,
  saveOrderJobSpecs,
} from "@/app/actions/orders";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  ORDER_PRIORITIES,
  BLOCKER_REASONS,
  blockerReasonLabel,
  priorityColor,
  priorityLabel,
  statusColor,
  statusLabel,
} from "@/lib/orders";
import type { OrderStatus } from "@prisma/client";
import {
  statusColor as invoiceStatusColor,
  statusLabel as invoiceStatusLabel,
  outstandingBalance,
} from "@/lib/invoices";
import { computeMargin, marginColor, expenseMethodLabel } from "@/lib/finance";
import { ProofVersionCard } from "@/components/proofs/ProofVersionCard";
import { ProofsStatusBanner } from "@/components/proofs/ProofsStatusBanner";
import {
  installKindColor,
  installKindLabel,
  installStatusColor,
  installStatusLabel,
  formatTimeRange,
  toLocalInputValue,
  INSTALL_KINDS,
} from "@/lib/installs";
import { createInstallEvent } from "@/app/actions/installs";
import { parseSelectedOptions } from "@/lib/quotes";
import { pricingMeta } from "@/lib/pricing";
import { formatMoney, formatDate, formatDateTime, humanize } from "@/lib/format";
import { listActiveMembers, memberLookup } from "@/lib/members";
import { SendMessageWidget } from "@/components/SendMessageWidget";
import { loadSendContext } from "@/app/actions/message-templates";
import { getGroupContext } from "@/lib/franchise";
import { FilesCard } from "@/components/FilesCard";
import { ChecklistCard } from "@/components/ChecklistCard";
import { CommentThread } from "@/components/CommentThread";
import {
  createOrderTask,
  addSubtask,
  updateTaskAssignment,
  toggleTaskComplete,
  deleteOrderTask,
} from "@/app/actions/order-tasks";
import {
  applyStageTemplate,
  blockStage,
  completeStage,
  createStage,
  deleteStage,
  logMaterialUsage,
  deleteMaterialUsage,
  pauseStage,
  reopenStage,
  reportDefect,
  resolveDefect,
  skipStage,
  startStage,
} from "@/app/actions/production";
import {
  DEFECT_SEVERITIES,
  STAGE_TEMPLATES,
  defectSeverityColor,
  defectSeverityLabel,
  formatMinutes,
  stageDwellMinutes,
  stageStatusColor,
  stageStatusLabel,
} from "@/lib/production";
import { OrderDetailTabs, type OrderDetailTab } from "@/components/orders/OrderDetailTabs";

const TRANSITION_LABELS: Partial<Record<string, string>> = {
  IN_PRODUCTION: "Start production",
  READY:         "Mark ready",
  OUT_FOR_INSTALL: "Out for install",
  COMPLETED:     "Mark completed",
  CANCELED:      "Cancel",
  NEW:           "Reopen",
};

// Inlined rather than imported from the client component — a value exported
// from a "use client" module is a client reference and can't be called from
// the server.
function parseOrderDetailTab(raw: string | undefined): OrderDetailTab {
  switch (raw) {
    case "production":
    case "proofs":
    case "install":
    case "tasks":
    case "billing":
    case "activity":
      return raw;
    default:
      return "details";
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { id } = await params;
  const o = await db.order.findUnique({
    where:  { id },
    select: { number: true },
  });
  return { title: o?.number ? `Order ${o.number}` : "Order" };
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; flash?: string; tab?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "orders:view");
  const canManage = ctx.can("orders:manage");
  const canProduce = ctx.can("production:manage");
  const activeTab = parseOrderDetailTab(sp.tab);

  const order = await db.order.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      customer: true,
      quote: { select: { id: true, number: true, status: true } },
      items: {
        orderBy: { sortOrder: "asc" },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, number: true, status: true, total: true,
          amountPaid: true, refundedAmount: true, writtenOffAmount: true,
          dueDate: true, kind: true,
        },
      },
      expenses: {
        orderBy: { date: "desc" },
        take: 50,
        include: { vendor: { select: { id: true, name: true } } },
      },
      files: { orderBy: { createdAt: "desc" } },
      proofs: {
        orderBy: { version: "desc" },
        include: {
          _count: { select: { files: true } },
          files: {
            where: { archivedAt: null, kind: "PROOF" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              storageUrl: true,
              thumbnailUrl: true,
              mimeType: true,
              filename: true,
            },
          },
        },
      },
      installEvents: { orderBy: { scheduledStart: "asc" } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      blockers: { orderBy: { createdAt: "desc" } },
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      stages: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          department:  { select: { id: true, name: true, color: true, icon: true } },
          workStation: { select: { id: true, name: true, departmentId: true } },
        },
      },
      defectReports: {
        orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        include: {
          stage: { select: { id: true, title: true } },
        },
      },
      materialUsages: {
        orderBy: { createdAt: "desc" },
        include: {
          stage: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!order) notFound();
  ctx.assertBranchAccess(order.locationId);

  const groupCtx = await getGroupContext(ctx.tenant.id);
  const [ownOrderTpls, inheritedOrderTpls] = await Promise.all([
    db.checklistTemplate.findMany({
      where: { tenantId: ctx.tenant.id, kind: "ORDER", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    groupCtx.parentTenantId
      ? db.checklistTemplate.findMany({
          where: { tenantId: groupCtx.parentTenantId, kind: "ORDER", active: true, shared: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, active: true },
        })
      : Promise.resolve([] as { id: string; name: string; active: boolean }[]),
  ]);
  const orderTemplates = [
    ...ownOrderTpls,
    ...inheritedOrderTpls.map((t) => ({ ...t, name: `[Shared] ${t.name}` })),
  ];
  const canInvoice = ctx.can("invoices:manage");
  const canProofs = ctx.can("proofs:manage");
  const canUploadFiles = ctx.can("files:upload");
  const canInstalls = ctx.can("installs:manage");

  const [members, memberMap, sendCtx, orderTasks, departments, workStations] = await Promise.all([
    listActiveMembers(ctx.tenant.id),
    memberLookup(ctx.tenant.id),
    loadSendContext(ctx.tenant.id, ctx.tenant.currency, {
      customerId:   order.customerId,
      orderId:      order.id,
      senderUserId: ctx.userId,
    }),
    db.task.findMany({
      where: {
        tenantId:     ctx.tenant.id,
        orderId:      order.id,
        parentTaskId: null,
      },
      orderBy: [
        { completedAt: { sort: "asc",  nulls: "first" } },
        { dueDate:     { sort: "asc",  nulls: "last"  } },
        { createdAt:   "desc" },
      ],
      include: {
        subtasks: {
          orderBy: [
            { completedAt: { sort: "asc",  nulls: "first" } },
            { dueDate:     { sort: "asc",  nulls: "last"  } },
            { createdAt:   "asc" },
          ],
        },
      },
    }),
    db.department.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, icon: true },
    }),
    db.workStation.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, departmentId: true },
    }),
  ]);

  const saveMeta = updateOrderMeta.bind(null, slug, order.id);
  const del = deleteOrder.bind(null, slug, order.id);

  const producedCount = order.items.filter((i) => i.producedAt != null).length;
  const depositDue = Number(order.total) * (order.depositPercent / 100);
  const balance = Math.max(0, Number(order.total) - Number(order.paidAmount));

  const canSeeProfit = ctx.can("reports:financial");
  const revenueFromInvoices = order.invoices
    .filter((inv) => inv.status !== "VOID" && inv.status !== "WRITTEN_OFF")
    .reduce((s, inv) => s + Number(inv.total), 0);
  const refundedFromInvoices = order.invoices.reduce(
    (s, inv) => s + Number(inv.refundedAmount ?? 0),
    0,
  );
  const expenseCost = order.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const margin = computeMargin({
    invoiceRevenue: revenueFromInvoices,
    refundedAmount: refundedFromInvoices,
    expenseCost,
  });

  const transitions = ORDER_TRANSITIONS[order.status];

  const activeBlockers   = order.blockers.filter((b) => !b.resolvedAt);
  const resolvedBlockers = order.blockers.filter((b) =>  b.resolvedAt);

  const depositOwed = Math.max(0, depositDue - Number(order.paidAmount));
  const depositOutstanding = order.depositPercent > 0 && depositOwed > 0.005;
  const depositGateActive =
    depositOutstanding &&
    ctx.tenant.requireDepositBeforeProduction &&
    order.status === "NEW";
  const depositInvoice = order.invoices.find((inv) => inv.kind === "DEPOSIT");
  const balanceInvoice = order.invoices.find((inv) => inv.kind === "BALANCE");

  const orderOverdue =
    order.dueDate != null &&
    order.dueDate.getTime() < Date.now() &&
    order.status !== "COMPLETED" &&
    order.status !== "CANCELED";

  // Primary CTA — the single action that best advances the order right now.
  // Falls through a priority list: deposit gate > blockers > forward transition.
  // Anything not chosen here falls into the secondary actions row.
  const forwardTransition = transitions.find(
    (t) => t !== "CANCELED" && t !== order.status,
  ) ?? null;

  let primaryCta: React.ReactNode = null;
  let primaryTransitionUsed: OrderStatus | null = null;
  if (canManage) {
    if (depositGateActive) {
      if (depositInvoice) {
        primaryCta = (
          <Link
            href={`/t/${slug}/invoices/${depositInvoice.id}`}
            className="ts-focus inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent-primary)", color: "white" }}
          >
            Collect deposit
          </Link>
        );
      } else if (canInvoice) {
        primaryCta = (
          <Link
            href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=DEPOSIT`}
            className="ts-focus inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent-primary)", color: "white" }}
          >
            Send deposit invoice
          </Link>
        );
      }
    } else if (order.status === "NEW" && activeBlockers.length > 0) {
      primaryCta = (
        <Link
          href={`/t/${slug}/orders/${order.id}?tab=details`}
          className="ts-focus inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          style={{ background: "var(--danger-fg)", color: "white" }}
        >
          Resolve blockers
        </Link>
      );
    } else if (forwardTransition) {
      primaryTransitionUsed = forwardTransition;
      const action = changeOrderStatus.bind(null, slug, order.id);
      primaryCta = (
        <form action={action}>
          <input type="hidden" name="status" value={forwardTransition} />
          <Button type="submit">
            {TRANSITION_LABELS[forwardTransition] ?? statusLabel(forwardTransition)}
          </Button>
        </form>
      );
    }
  }

  // Transitions that did NOT get promoted to the header CTA — they fall into
  // the compact secondary actions row. CANCELED always lives here (it gets
  // its own cancelReason input) and any backwards moves are secondary too.
  const secondaryTransitions = transitions.filter((t) => t !== primaryTransitionUsed);

  // Tab counts — shown as chips in the tab strip.
  const openTasksCount = orderTasks.filter((t) => !t.completedAt).length;
  const openDefectsCount = order.defectReports.filter((d) => !d.resolvedAt).length;
  const outstandingInvoicesCount = order.invoices.filter(
    (inv) => outstandingBalance(inv) > 0,
  ).length;
  const tabCounts: Partial<Record<OrderDetailTab, number>> = {
    production: openDefectsCount,
    proofs:     order.proofs.length,
    install:    order.installEvents.length,
    tasks:      openTasksCount,
    billing:    outstandingInvoicesCount,
  };

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href={`/t/${slug}/orders`} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Orders
        </Link>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}
      {sp.flash && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          {sp.flash}
        </div>
      )}

      {/* Deposit gate banner — above the sticky header so it scrolls away. */}
      {depositGateActive && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-medium">
            Deposit of {formatMoney(depositDue, ctx.tenant.currency)} must be paid before production starts.
          </div>
          <div className="mt-1 text-xs opacity-90">
            Paid so far: {formatMoney(order.paidAmount.toString(), ctx.tenant.currency)} · Outstanding: {formatMoney(depositOwed, ctx.tenant.currency)}
            {depositInvoice && (
              <>
                {" · "}
                <Link
                  href={`/t/${slug}/invoices/${depositInvoice.id}`}
                  className="underline"
                  style={{ color: "var(--danger-fg)" }}
                >
                  Open deposit invoice {depositInvoice.number}
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Active-blockers warning — above the sticky header. */}
      {activeBlockers.length > 0 && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-medium">
            This order is blocked ({activeBlockers.length} active {activeBlockers.length === 1 ? "reason" : "reasons"}).
          </div>
          <ul className="mt-1 list-disc pl-5">
            {activeBlockers.map((b) => (
              <li key={b.id}>
                <span className="font-medium">{blockerReasonLabel(b.reason)}</span>
                {b.notes && <> — {b.notes}</>}
                <span className="ml-2 text-xs opacity-80">added {formatDate(b.createdAt)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 text-xs opacity-80">
            Resolve these in the Details tab before starting production.
          </div>
        </div>
      )}

      {order.status === "CANCELED" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
          }}
        >
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            Order canceled{order.canceledAt ? ` on ${formatDate(order.canceledAt)}` : ""}
          </div>
          {order.cancelReason && (
            <div className="mt-1 text-xs">{order.cancelReason}</div>
          )}
        </div>
      )}

      {/* STICKY HEADER — ID + status chips + customer/quote/due + total/balance + primary CTA. */}
      <header
        className="sticky top-0 z-10 rounded-lg"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
                {order.number}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: statusColor(order.status), color: "white" }}
              >
                {statusLabel(order.status)}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: priorityColor(order.priority), color: "white" }}
                title={`Priority: ${priorityLabel(order.priority)}`}
              >
                {order.priority === "RUSH" ? "⚡ " : ""}{priorityLabel(order.priority)}
              </span>
              {depositOutstanding && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    background: depositGateActive ? "var(--danger-fg)" : "var(--warning-fg, #b45309)",
                    color: "white",
                  }}
                  title={
                    depositGateActive
                      ? "Deposit must be paid before production can start"
                      : "Deposit is still outstanding"
                  }
                >
                  {depositGateActive ? "Deposit due" : "Deposit owed"} · {formatMoney(depositOwed, ctx.tenant.currency)}
                </span>
              )}
              {activeBlockers.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--danger-fg)", color: "white" }}
                  title={activeBlockers.map((b) => blockerReasonLabel(b.reason)).join(", ")}
                >
                  Blocked · {activeBlockers.length}
                </span>
              )}
              {orderOverdue && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ background: "var(--danger-fg)", color: "white" }}
                >
                  Past due
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              For{" "}
              <Link
                href={`/t/${slug}/customers/${order.customer.id}`}
                className="underline"
                style={{ color: "var(--text-default)" }}
              >
                {order.customer.name}
              </Link>
              {order.quote && (
                <>
                  {" · "}From quote{" "}
                  <Link href={`/t/${slug}/quotes/${order.quote.id}`} className="underline">
                    {order.quote.number}
                  </Link>
                </>
              )}
              {order.dueDate && <>{" · "}Due {formatDate(order.dueDate)}</>}
              {order.items.length > 0 && (
                <>{" · "}{producedCount}/{order.items.length} produced</>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-right">
              <div
                className="text-[10px] uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                {balance > 0 ? "Balance" : "Total"}
              </div>
              <div
                className="text-2xl font-bold tabular-nums leading-tight"
                style={{ color: balance > 0 && orderOverdue ? "var(--danger-fg)" : "var(--text-default)" }}
              >
                {formatMoney(balance > 0 ? balance : Number(order.total), ctx.tenant.currency)}
              </div>
              {balance > 0 && (
                <div
                  className="text-[11px] tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  of {formatMoney(order.total.toString(), ctx.tenant.currency)} total
                </div>
              )}
            </div>
            {primaryCta && <div className="flex items-center gap-2">{primaryCta}</div>}
          </div>
        </div>
      </header>

      {/* Compact actions row — secondary transitions + delete. */}
      {canManage && (secondaryTransitions.length > 0 || order.status === "CANCELED") && (
        <div className="flex flex-wrap items-center gap-2">
          {secondaryTransitions.map((to) => {
            const action = changeOrderStatus.bind(null, slug, order.id);
            const isCancel = to === "CANCELED";
            return (
              <form key={to} action={action} className="flex items-center gap-2">
                <input type="hidden" name="status" value={to} />
                {isCancel && (
                  <input
                    name="cancelReason"
                    placeholder="Cancel reason (optional)"
                    className="rounded-md px-3 py-1.5 text-sm outline-none"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-default)",
                      minWidth: 220,
                    }}
                  />
                )}
                <Button type="submit" variant={isCancel ? "danger" : (to === "NEW" ? "secondary" : "primary")}>
                  {TRANSITION_LABELS[to] ?? statusLabel(to)}
                </Button>
              </form>
            );
          })}
          {order.status === "CANCELED" && (
            <form action={del}>
              <Button type="submit" variant="danger">Delete order</Button>
            </form>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE — line items + sticky financial summary. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Line items"
              description={`${producedCount} of ${order.items.length} produced`}
            />
            {order.items.length > 0 && (
              <div className="px-5 pb-3 pt-1">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((producedCount / order.items.length) * 100)}%`,
                      background: producedCount === order.items.length
                        ? "var(--success-fg)"
                        : "var(--accent-primary)",
                    }}
                  />
                </div>
              </div>
            )}
            <ul>
              {order.items.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No items.</li>
              )}
              {order.items.map((item) => {
                const meta = pricingMeta(item.pricingModel);
                const selected = parseSelectedOptions(item.selectedOptions as unknown);
                const toggle = toggleItemProduced.bind(null, slug, item.id);
                return (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    {canProduce && (
                      <form action={toggle} className="mt-1">
                        <button type="submit" aria-label="toggle produced">
                          <span style={{
                            display: "inline-block", width: 16, height: 16, borderRadius: 4,
                            border: "1px solid var(--border-subtle)",
                            background: item.producedAt ? "var(--accent-primary)" : "transparent",
                          }} />
                        </button>
                      </form>
                    )}
                    <div className="flex-1">
                      <div className={`text-sm ${item.producedAt ? "line-through opacity-70" : "font-medium"}`}>
                        {item.name}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {meta.label}
                        {item.unit && <> · {item.unit}</>}
                        {item.quantity != null && <> · qty {item.quantity.toString()}</>}
                        {item.width != null && item.height != null && <> · {item.width.toString()}×{item.height.toString()} ft</>}
                        {item.length != null && <> · {item.length.toString()} ft</>}
                        {item.hours != null && <> · {item.hours.toString()} hr</>}
                        {item.producedAt && <> · produced {formatDate(item.producedAt)}</>}
                      </div>
                      {selected.length > 0 && (
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {selected.map((o) => `${o.groupName}: ${o.label}`).join(" · ")}
                        </div>
                      )}
                      {item.description && (
                        <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                          {item.description}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-medium">{formatMoney(item.subtotal.toString(), ctx.tenant.currency)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Financials" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotal.toString(), ctx.tenant.currency)} />
              {Number(order.discountAmount) > 0 && (
                <Row label="Discount" value={`− ${formatMoney(order.discountAmount.toString(), ctx.tenant.currency)}`} muted />
              )}
              <Row label="Tax" value={formatMoney(order.taxAmount.toString(), ctx.tenant.currency)} muted />
              <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="pt-2">
                <Row label="Total" value={formatMoney(order.total.toString(), ctx.tenant.currency)} bold />
              </div>
              <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="pt-2 space-y-1">
                <Row label={`Deposit (${order.depositPercent}%)`} value={formatMoney(depositDue, ctx.tenant.currency)} muted />
                <Row label="Paid" value={formatMoney(order.paidAmount.toString(), ctx.tenant.currency)} muted />
                <Row label="Balance" value={formatMoney(balance, ctx.tenant.currency)} bold />
              </div>
              <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Payments flow through invoices.
              </div>
            </div>
          </Card>

          {/* Quick invoice CTAs — reappear as compact buttons next to the financials. */}
          {canInvoice && (depositOutstanding || balance > 0.005) && (
            <Card>
              <div className="flex flex-col gap-2 px-5 py-4">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Invoice shortcuts
                </div>
                {depositOutstanding && !depositInvoice && (
                  <Link
                    href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=DEPOSIT`}
                    className="text-sm underline"
                  >
                    Send deposit invoice
                  </Link>
                )}
                {balance > 0.005 &&
                  !balanceInvoice &&
                  (order.status === "READY" || order.status === "OUT_FOR_INSTALL" || order.status === "COMPLETED") && (
                  <Link
                    href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=BALANCE`}
                    className="text-sm underline"
                  >
                    Send balance invoice
                  </Link>
                )}
                {depositInvoice && (
                  <Link
                    href={`/t/${slug}/invoices/${depositInvoice.id}`}
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    → Deposit inv {depositInvoice.number}
                  </Link>
                )}
                {balanceInvoice && (
                  <Link
                    href={`/t/${slug}/invoices/${balanceInvoice.id}`}
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    → Balance inv {balanceInvoice.number}
                  </Link>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>

      {/* SECONDARY TABS */}
      <div className="space-y-5 pt-2">
        <OrderDetailTabs active={activeTab} counts={tabCounts} />

        {activeTab === "details" && (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Job specs"
                description="Build sheet for the shop floor. Fill what's relevant — empty fields won't print."
              />
              <form
                action={saveOrderJobSpecs.bind(null, slug, order.id)}
                className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2"
              >
                <Field
                  label="Material / substrate"
                  name="material"
                  defaultValue={order.material ?? ""}
                  placeholder="e.g. 3mm ACM, 3M IJ180Cv3"
                />
                <Field
                  label="Finish"
                  name="finish"
                  defaultValue={order.finish ?? ""}
                  placeholder="e.g. Matte lam, gloss UV, satin powder coat"
                />
                <div className="md:col-span-2">
                  <Field
                    label="Color specs"
                    name="colorSpecs"
                    defaultValue={order.colorSpecs ?? ""}
                    placeholder="e.g. PMS 186 C, CMYK 0/100/81/4"
                  />
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Install method"
                    name="installMethod"
                    defaultValue={order.installMethod ?? ""}
                    placeholder="e.g. Stud-mount 1/2&quot; off wall, VHB to glass"
                  />
                </div>
                <div className="md:col-span-2">
                  <TextArea
                    label="Special instructions"
                    name="specialInstructions"
                    rows={3}
                    defaultValue={order.specialInstructions ?? ""}
                    placeholder="Anything the shop needs to know that doesn't fit above."
                  />
                </div>
                {canManage && (
                  <div className="md:col-span-2">
                    <Button type="submit">Save job specs</Button>
                  </div>
                )}
              </form>
            </Card>

            <Card>
              <CardHeader title="Scheduling & assignment" />
              <form action={saveMeta} className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
                <Field
                  label="Due date"
                  name="dueDate"
                  type="date"
                  defaultValue={order.dueDate ? formatDate(order.dueDate) : ""}
                />
                <Field
                  label="Primary install date"
                  name="scheduledFor"
                  type="datetime-local"
                  defaultValue={order.scheduledFor ? order.scheduledFor.toISOString().slice(0, 16) : ""}
                  hint="Quick summary date. Add install events in the Install tab."
                />
                <SelectField
                  label="Production manager"
                  name="productionManagerId"
                  defaultValue={order.productionManagerId ?? ""}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...members.map((m) => ({ value: m.userId, label: m.name })),
                  ]}
                />
                <SelectField
                  label="Installer"
                  name="installerId"
                  defaultValue={order.installerId ?? ""}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...members.map((m) => ({ value: m.userId, label: m.name })),
                  ]}
                />
                <Field
                  label="Deposit %"
                  name="depositPercent"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={order.depositPercent.toString()}
                />
                <div />
                <div className="md:col-span-2">
                  <TextArea
                    label="Customer-facing note"
                    name="customerNote"
                    rows={2}
                    defaultValue={order.customerNote ?? ""}
                  />
                </div>
                {canManage && (
                  <div className="md:col-span-2">
                    <Button type="submit">Save scheduling</Button>
                  </div>
                )}
              </form>
            </Card>

            {canManage && (
              <Card>
                <CardHeader
                  title="Priority"
                  description="RUSH shows as red across the app. Use it sparingly so it keeps meaning something."
                />
                <form
                  action={updateOrderPriority.bind(null, slug, order.id)}
                  className="flex flex-wrap items-center gap-2 px-5 py-4"
                >
                  {ORDER_PRIORITIES.map((p) => {
                    const active = order.priority === p.value;
                    return (
                      <button
                        key={p.value}
                        type="submit"
                        name="priority"
                        value={p.value}
                        className="rounded-full px-3 py-1 text-xs font-medium transition-opacity"
                        style={{
                          background: active ? p.color : "var(--surface-2)",
                          color:      active ? "white"  : "var(--text-default)",
                          border:     active ? `1px solid ${p.color}` : "1px solid var(--border-subtle)",
                          opacity:    active ? 1 : 0.85,
                        }}
                        aria-pressed={active}
                      >
                        {p.value === "RUSH" ? "⚡ " : ""}{p.label}
                      </button>
                    );
                  })}
                </form>
              </Card>
            )}

            {canManage && (
              <Card>
                <CardHeader
                  title="Blockers"
                  description={
                    activeBlockers.length > 0
                      ? `${activeBlockers.length} active · production is gated until cleared`
                      : "No active blockers — production can proceed."
                  }
                />
                <ul>
                  {activeBlockers.length === 0 && (
                    <li className="px-5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                      Nothing is blocking this order right now.
                    </li>
                  )}
                  {activeBlockers.map((b) => {
                    const resolve = resolveOrderBlocker.bind(null, slug, b.id);
                    return (
                      <li
                        key={b.id}
                        className="flex items-start justify-between gap-3 px-5 py-3"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{blockerReasonLabel(b.reason)}</div>
                          {b.notes && (
                            <div className="mt-0.5 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                              {b.notes}
                            </div>
                          )}
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            added {formatDateTime(b.createdAt)}
                            {memberMap.get(b.blockedBy) && <> by {memberMap.get(b.blockedBy)!.name}</>}
                          </div>
                        </div>
                        <form action={resolve}>
                          <Button type="submit" variant="secondary">Resolve</Button>
                        </form>
                      </li>
                    );
                  })}
                </ul>

                <form
                  action={addOrderBlocker.bind(null, slug, order.id)}
                  className="grid grid-cols-2 gap-3 px-5 py-4"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <SelectField
                    label="Reason"
                    name="reason"
                    defaultValue="AWAITING_CUSTOMER"
                    options={BLOCKER_REASONS.map((r) => ({ value: r.value, label: r.label }))}
                  />
                  <div />
                  <div className="col-span-2">
                    <TextArea
                      label="Notes (optional)"
                      name="notes"
                      rows={2}
                      placeholder="e.g. Emailed customer Tuesday — waiting on new vector logo"
                    />
                  </div>
                  <div className="col-span-2">
                    <Button type="submit" variant="secondary">Add blocker</Button>
                  </div>
                </form>

                {resolvedBlockers.length > 0 && (
                  <details className="px-5 pb-4 text-xs" style={{ color: "var(--text-muted)" }}>
                    <summary className="cursor-pointer select-none">
                      Show {resolvedBlockers.length} resolved {resolvedBlockers.length === 1 ? "blocker" : "blockers"}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {resolvedBlockers.map((b) => (
                        <li key={b.id}>
                          <span className="line-through opacity-80">{blockerReasonLabel(b.reason)}</span>
                          {b.notes && <> — <span className="line-through opacity-80">{b.notes}</span></>}
                          {b.resolvedAt && <> · resolved {formatDate(b.resolvedAt)}</>}
                          {b.resolvedBy && memberMap.get(b.resolvedBy) && <> by {memberMap.get(b.resolvedBy)!.name}</>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>
            )}

            <Card>
              <CardHeader title="Internal notes" description="Staff-only — not shown to the customer." />
              <form action={saveMeta} className="space-y-4 px-5 py-4">
                <TextArea
                  label="Production notes"
                  name="productionNotes"
                  rows={3}
                  defaultValue={order.productionNotes ?? ""}
                />
                <TextArea
                  label="Install notes"
                  name="installNotes"
                  rows={3}
                  defaultValue={order.installNotes ?? ""}
                />
                {canManage && (
                  <div>
                    <Button type="submit">Save notes</Button>
                  </div>
                )}
              </form>
            </Card>
          </div>
        )}

        {activeTab === "production" && (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Production stages"
                description={
                  order.stages.length === 0
                    ? "No stages yet. Apply a template or add your own below."
                    : `${order.stages.filter((s) => s.status === "DONE" || s.status === "SKIPPED").length} of ${order.stages.length} closed`
                }
              />
              {order.stages.length === 0 ? (
                <div className="px-5 py-5">
                  {canProduce && departments.length > 0 ? (
                    <div className="space-y-4">
                      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Apply a template to spin up the canonical sequence, or create stages one at a time.
                      </div>
                      <form
                        action={applyStageTemplate.bind(null, slug, order.id)}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <label className="text-sm">
                          <span className="mb-1 block" style={{ color: "var(--text-muted)" }}>Template</span>
                          <select
                            name="templateKey"
                            defaultValue=""
                            required
                            className="rounded-md px-2 py-1.5 text-sm"
                            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                          >
                            <option value="" disabled>Select template…</option>
                            {STAGE_TEMPLATES.map((t) => (
                              <option key={t.key} value={t.key}>
                                {t.label} — {t.hint}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button type="submit">Apply template</Button>
                      </form>
                    </div>
                  ) : canProduce && departments.length === 0 ? (
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      Set up departments first — the stage dropdowns pull from that list.{" "}
                      <Link href={`/t/${slug}/settings/production`} className="underline">
                        Go to production settings
                      </Link>
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      This order doesn&apos;t have any production stages yet.
                    </div>
                  )}
                </div>
              ) : (
                <ul>
                  {order.stages.map((s) => {
                    const assigneeName = s.assigneeId ? memberMap.get(s.assigneeId)?.name ?? null : null;
                    const dwell = stageDwellMinutes(s);
                    const effectiveDue = s.dueAt ?? order.dueDate ?? null;
                    const overdue =
                      effectiveDue != null &&
                      s.status !== "DONE" &&
                      s.status !== "SKIPPED" &&
                      effectiveDue.getTime() < Date.now();
                    const deptWorkStations = s.departmentId
                      ? workStations.filter((w) => w.departmentId === s.departmentId)
                      : workStations;
                    return (
                      <li
                        key={s.id}
                        className="px-5 py-3"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: stageStatusColor(s.status), color: "white" }}
                          >
                            {stageStatusLabel(s.status)}
                          </span>
                          <span className="font-medium">{s.title}</span>
                          {s.department && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px]"
                              style={{
                                background: "var(--accent-surface)",
                                color:      s.department.color,
                                border:     `1px solid ${s.department.color}`,
                              }}
                            >
                              {s.department.icon ? `${s.department.icon} ` : ""}
                              {s.department.name}
                            </span>
                          )}
                          {s.workStation && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px]"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                              title="Work station"
                            >
                              {s.workStation.name}
                            </span>
                          )}
                          <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {s.estimatedMinutes != null && s.estimatedMinutes > 0 && (
                              <>est {formatMinutes(s.estimatedMinutes)} · </>
                            )}
                            {assigneeName ? `👤 ${assigneeName}` : "👤 Unassigned"}
                          </span>
                        </div>

                        {s.description && (
                          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                            {s.description}
                          </div>
                        )}

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                          {effectiveDue && (
                            <span style={{ color: overdue ? "var(--danger-fg)" : undefined, fontWeight: overdue ? 600 : undefined }}>
                              due {formatDate(effectiveDue)}{overdue ? " · overdue" : ""}
                              {!s.dueAt && <span className="ml-1 opacity-70">(from order)</span>}
                            </span>
                          )}
                          {dwell != null && (s.status === "ACTIVE" || s.status === "BLOCKED" || s.status === "PENDING") && (
                            <span>{formatMinutes(dwell)} in {stageStatusLabel(s.status).toLowerCase()}</span>
                          )}
                          {s.startedAt && s.status !== "PENDING" && (
                            <span>started {formatDateTime(s.startedAt)}</span>
                          )}
                          {s.completedAt && (
                            <span>finished {formatDateTime(s.completedAt)}</span>
                          )}
                        </div>

                        {s.status === "BLOCKED" && s.blockedReason && (
                          <div
                            className="mt-2 rounded px-2 py-1.5 text-xs"
                            style={{
                              background: "var(--danger-surface)",
                              color:      "var(--danger-fg)",
                              border:     "1px solid var(--danger-fg)",
                            }}
                          >
                            <strong>Blocked:</strong> {s.blockedReason}
                          </div>
                        )}

                        {canProduce && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {(s.status === "PENDING" || s.status === "BLOCKED") && (
                              <form action={startStage.bind(null, slug, s.id)}>
                                <Button type="submit" variant="primary" className="!px-2 !py-1 !text-xs">
                                  ▶ Start
                                </Button>
                              </form>
                            )}
                            {(s.status === "ACTIVE" || s.status === "PENDING" || s.status === "BLOCKED") && (
                              <form action={completeStage.bind(null, slug, s.id)}>
                                <Button
                                  type="submit"
                                  variant={s.status === "ACTIVE" ? "primary" : "secondary"}
                                  className="!px-2 !py-1 !text-xs"
                                >
                                  ✓ Done
                                </Button>
                              </form>
                            )}
                            {(s.status === "ACTIVE" || s.status === "PENDING") && (
                              <details className="relative">
                                <summary
                                  className="cursor-pointer list-none rounded-md px-2 py-1 text-xs"
                                  style={{ border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                                >
                                  ⏸ Block
                                </summary>
                                <form
                                  action={blockStage.bind(null, slug, s.id)}
                                  className="absolute left-0 z-10 mt-1 w-80 rounded-md p-2 shadow-lg"
                                  style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
                                >
                                  <label className="block text-xs" style={{ color: "var(--text-muted)" }}>Reason</label>
                                  <input
                                    name="reason"
                                    required
                                    placeholder="Why is this blocked?"
                                    className="mt-1 w-full rounded-md px-2 py-1 text-xs outline-none"
                                    style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                                  />
                                  <div className="mt-2 flex justify-end gap-1.5">
                                    <Button type="submit" variant="secondary" className="!px-2 !py-1 !text-xs">
                                      Mark blocked
                                    </Button>
                                  </div>
                                </form>
                              </details>
                            )}
                            {s.status === "ACTIVE" && (
                              <form action={pauseStage.bind(null, slug, s.id)}>
                                <Button type="submit" variant="secondary" className="!px-2 !py-1 !text-xs">
                                  Pause
                                </Button>
                              </form>
                            )}
                            {(s.status === "PENDING" || s.status === "BLOCKED") && (
                              <form action={skipStage.bind(null, slug, s.id)}>
                                <Button type="submit" variant="secondary" className="!px-2 !py-1 !text-xs">
                                  Skip
                                </Button>
                              </form>
                            )}
                            {s.status === "DONE" && (
                              <form action={reopenStage.bind(null, slug, s.id)}>
                                <Button type="submit" variant="secondary" className="!px-2 !py-1 !text-xs">
                                  Reopen
                                </Button>
                              </form>
                            )}
                            {(s.status === "PENDING" || s.status === "SKIPPED" || s.status === "BLOCKED") && (
                              <form action={deleteStage.bind(null, slug, s.id)}>
                                <Button type="submit" variant="danger" className="!px-2 !py-1 !text-xs">
                                  Delete
                                </Button>
                              </form>
                            )}
                          </div>
                        )}
                        <span hidden>{deptWorkStations.length}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {canProduce && departments.length > 0 && (
                <details className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <summary
                    className="cursor-pointer list-none px-5 py-3 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    + Add a stage manually
                  </summary>
                  <form
                    action={createStage.bind(null, slug, order.id)}
                    className="grid grid-cols-2 gap-3 px-5 pb-4"
                  >
                    <div className="col-span-2">
                      <Field label="Title" name="title" required placeholder="e.g. Cut vinyl" />
                    </div>
                    <SelectField
                      label="Department"
                      name="departmentId"
                      defaultValue=""
                      options={[
                        { value: "", label: "— Unassigned —" },
                        ...departments.map((d) => ({ value: d.id, label: d.name })),
                      ]}
                    />
                    <SelectField
                      label="Work station (optional)"
                      name="workStationId"
                      defaultValue=""
                      options={[
                        { value: "", label: "Any machine in dept" },
                        ...workStations.map((w) => ({ value: w.id, label: w.name })),
                      ]}
                    />
                    <SelectField
                      label="Assignee"
                      name="assignedTo"
                      defaultValue=""
                      options={[
                        { value: "", label: "Unassigned" },
                        ...members.map((m) => ({ value: m.userId, label: m.name })),
                      ]}
                    />
                    <Field label="Est minutes" name="estimatedMinutes" type="number" min="0" />
                    <Field label="Due" name="dueAt" type="date" hint="Blank = falls back to the order due date." />
                    <div />
                    <div className="col-span-2">
                      <TextArea label="Description (optional)" name="description" rows={2} />
                    </div>
                    <div className="col-span-2">
                      <Button type="submit">Add stage</Button>
                    </div>
                  </form>
                </details>
              )}
            </Card>

            {(() => {
              const openDefects     = order.defectReports.filter((d) => !d.resolvedAt);
              const resolvedDefects = order.defectReports.filter((d) =>  d.resolvedAt);
              return (
                <Card>
                  <CardHeader
                    title="Quality control"
                    description={
                      order.defectReports.length === 0
                        ? "No defects reported on this order."
                        : `${openDefects.length} open · ${resolvedDefects.length} resolved`
                    }
                  />
                  <ul>
                    {openDefects.length === 0 && resolvedDefects.length === 0 && (
                      <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                        Nothing logged. Report defects as they&apos;re discovered so QC has a paper trail.
                      </li>
                    )}
                    {openDefects.map((d) => {
                      const reporterName = memberMap.get(d.reportedBy)?.name ?? "—";
                      return (
                        <li key={d.id} className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{ background: defectSeverityColor(d.severity), color: "white" }}
                            >
                              {defectSeverityLabel(d.severity)}
                            </span>
                            {d.stage && (
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                on stage: {d.stage.title}
                              </span>
                            )}
                            <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
                              reported by {reporterName} · {formatDateTime(d.createdAt)}
                            </span>
                          </div>
                          <div className="mt-1 text-sm">{d.notes}</div>
                          {d.cause && (
                            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                              Cause: {d.cause}
                            </div>
                          )}
                          {canProduce && (
                            <details className="mt-2">
                              <summary
                                className="cursor-pointer list-none text-xs underline"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Mark resolved
                              </summary>
                              <form
                                action={resolveDefect.bind(null, slug, d.id)}
                                className="mt-1 flex flex-wrap items-end gap-2"
                              >
                                <label className="block flex-1">
                                  <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                                    Resolution — what did you do about it?
                                  </span>
                                  <input
                                    name="resolution"
                                    required
                                    className="w-full rounded-md px-2 py-1 text-sm outline-none"
                                    style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                                  />
                                </label>
                                <Button type="submit" variant="secondary" className="!px-2 !py-1 !text-xs">
                                  Resolve
                                </Button>
                              </form>
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {resolvedDefects.length > 0 && (
                    <details style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <summary
                        className="cursor-pointer list-none px-5 py-3 text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Resolved ({resolvedDefects.length})
                      </summary>
                      <ul>
                        {resolvedDefects.map((d) => {
                          const reporterName = memberMap.get(d.reportedBy)?.name ?? "—";
                          const resolverName = d.resolvedBy ? memberMap.get(d.resolvedBy)?.name ?? "—" : "—";
                          return (
                            <li key={d.id} className="px-5 py-3 text-sm" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="rounded-full px-2 py-0.5 text-[11px]"
                                  style={{ background: defectSeverityColor(d.severity), color: "white", opacity: 0.75 }}
                                >
                                  {defectSeverityLabel(d.severity)}
                                </span>
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                  {d.stage ? `on ${d.stage.title} · ` : ""}
                                  reported by {reporterName}{d.resolvedAt ? `, resolved ${formatDate(d.resolvedAt)} by ${resolverName}` : ""}
                                </span>
                              </div>
                              <div className="mt-1">{d.notes}</div>
                              {d.resolution && (
                                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                                  <strong>Resolution:</strong> {d.resolution}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}

                  {canProduce && (
                    <details style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <summary
                        className="cursor-pointer list-none px-5 py-3 text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        + Report a defect
                      </summary>
                      <form
                        action={reportDefect.bind(null, slug, order.id)}
                        className="grid grid-cols-2 gap-3 px-5 pb-4"
                      >
                        <SelectField
                          label="Severity"
                          name="severity"
                          defaultValue="MINOR"
                          options={DEFECT_SEVERITIES.map((s) => ({ value: s.value, label: `${s.label} — ${s.hint}` }))}
                        />
                        <SelectField
                          label="Stage (optional)"
                          name="stageId"
                          defaultValue=""
                          options={[
                            { value: "", label: "— Not stage-specific —" },
                            ...order.stages.map((s) => ({ value: s.id, label: s.title })),
                          ]}
                        />
                        <div className="col-span-2">
                          <Field label="Cause (short)" name="cause" placeholder="e.g. misaligned cut, wrong ink" />
                        </div>
                        <div className="col-span-2">
                          <TextArea label="Notes" name="notes" rows={3} required />
                        </div>
                        <div className="col-span-2">
                          <Button type="submit" variant="secondary">Report defect</Button>
                        </div>
                      </form>
                    </details>
                  )}
                </Card>
              );
            })()}

            <Card>
              <CardHeader
                title="Materials used"
                description={
                  order.materialUsages.length === 0
                    ? "Nothing logged. Record material use here so job costing reports stay accurate."
                    : `${order.materialUsages.length} ${order.materialUsages.length === 1 ? "entry" : "entries"}`
                }
              />
              {order.materialUsages.length > 0 && (
                <ul>
                  {order.materialUsages.map((m) => {
                    const loggerName = memberMap.get(m.loggedBy)?.name ?? "—";
                    return (
                      <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <div>
                          <div className="text-sm font-medium">{m.material}</div>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {m.quantity.toString()} {m.unit}
                            {m.wastePct != null && <> · {m.wastePct}% waste</>}
                            {m.stage && <> · on {m.stage.title}</>}
                          </div>
                          {m.notes && (
                            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                              {m.notes}
                            </div>
                          )}
                          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            logged by {loggerName} · {formatDateTime(m.createdAt)}
                          </div>
                        </div>
                        {canProduce && (
                          <form action={deleteMaterialUsage.bind(null, slug, m.id)}>
                            <button
                              type="submit"
                              className="text-xs underline"
                              style={{ color: "var(--text-muted)" }}
                              title="Remove this entry"
                            >
                              remove
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canProduce && (
                <details style={{ borderTop: order.materialUsages.length > 0 ? "1px solid var(--border-subtle)" : undefined }}>
                  <summary
                    className="cursor-pointer list-none px-5 py-3 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    + Log material
                  </summary>
                  <form
                    action={logMaterialUsage.bind(null, slug, order.id)}
                    className="grid grid-cols-3 gap-3 px-5 pb-4"
                  >
                    <div className="col-span-3">
                      <Field label="Material" name="material" required placeholder="3M Scotchcal 7725" />
                    </div>
                    <Field label="Quantity" name="quantity" type="number" step="0.001" min="0" required />
                    <Field label="Unit" name="unit" required placeholder="ft, sqft, sheet, roll, each" />
                    <Field label="Waste %" name="wastePct" type="number" min="0" max="100" />
                    <SelectField
                      label="Stage (optional)"
                      name="stageId"
                      defaultValue=""
                      options={[
                        { value: "", label: "— Not stage-specific —" },
                        ...order.stages.map((s) => ({ value: s.id, label: s.title })),
                      ]}
                    />
                    <div className="col-span-2">
                      <TextArea label="Notes" name="notes" rows={2} />
                    </div>
                    <div className="col-span-3">
                      <Button type="submit" variant="secondary">Log material</Button>
                    </div>
                  </form>
                </details>
              )}
            </Card>

            <ChecklistCard
              slug={slug}
              scope={{ kind: "order", orderId: order.id }}
              items={order.checklistItems}
              templates={orderTemplates}
              memberMap={memberMap}
              canManage={canManage}
            />

            <FilesCard
              slug={slug}
              files={order.files}
              parent={{ kind: "order", id: order.id }}
              canUpload={canUploadFiles}
              memberMap={memberMap}
              backUrl={`/t/${slug}/orders/${order.id}?tab=production`}
              defaultKind="PRODUCTION_READY"
            />
          </div>
        )}

        {activeTab === "proofs" && (
          <div className="space-y-5">
            {/* Header row — title + "+ New version" CTA. */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-default)" }}>
                  Proofs
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {order.proofs.length === 0
                    ? "Share artwork for customer approval."
                    : `${order.proofs.length} ${order.proofs.length === 1 ? "version" : "versions"} — latest first.`}
                </p>
              </div>
              {canProofs && (
                <Link href={`/t/${slug}/orders/${order.id}/proofs/new`}>
                  <Button type="button">+ New proof version</Button>
                </Link>
              )}
            </div>

            {/* Status banner — at-a-glance state of the current version. */}
            <ProofsStatusBanner proofs={order.proofs} />

            {/* Version cards, latest on top. */}
            {order.proofs.length > 0 && (
              <div className="space-y-3">
                {order.proofs.map((p, i) => (
                  <ProofVersionCard
                    key={p.id}
                    slug={slug}
                    orderId={order.id}
                    proof={p}
                    isLatest={i === 0}
                    isCurrent={i === 0 && !p.supersededAt}
                    canManage={canProofs}
                    uploaderName={memberMap.get(p.createdBy)?.name ?? null}
                    customerEmail={order.customer.email}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "install" && (
          <Card>
            <CardHeader
              title="Install calendar"
              description={`${order.installEvents.length} ${order.installEvents.length === 1 ? "event" : "events"} scheduled`}
            />
            <ul>
              {order.installEvents.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No install events yet.</li>
              )}
              {order.installEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/t/${slug}/installs/${e.id}`} className="text-sm font-medium underline">
                      {formatDate(e.scheduledStart)} · {formatTimeRange(e.scheduledStart, e.scheduledEnd)}
                    </Link>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: installKindColor(e.kind), color: "white" }}>
                      {installKindLabel(e.kind)}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: installStatusColor(e.status), color: "white" }}>
                      {installStatusLabel(e.status)}
                    </span>
                    {e.title && <span className="text-sm" style={{ color: "var(--text-muted)" }}>{e.title}</span>}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {e.installerId && memberMap.get(e.installerId) ? memberMap.get(e.installerId)!.name : "Unassigned"}
                  </div>
                </li>
              ))}
            </ul>
            {canInstalls && (
              <form
                action={createInstallEvent.bind(null, slug)}
                className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="redirectTo" value={`/t/${slug}/orders/${order.id}?tab=install`} />
                <SelectField
                  label="Kind"
                  name="kind"
                  defaultValue="INSTALL"
                  options={INSTALL_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                />
                <SelectField
                  label="Installer"
                  name="installerId"
                  defaultValue={order.installerId ?? ""}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...members.map((m) => ({ value: m.userId, label: m.name })),
                  ]}
                />
                <Field
                  label="Start"
                  name="scheduledStart"
                  type="datetime-local"
                  required
                  defaultValue={order.scheduledFor ? toLocalInputValue(order.scheduledFor) : ""}
                />
                <Field
                  label="End"
                  name="scheduledEnd"
                  type="datetime-local"
                  required
                  defaultValue={order.scheduledFor ? toLocalInputValue(new Date(order.scheduledFor.getTime() + 2 * 60 * 60 * 1000)) : ""}
                />
                <div className="md:col-span-2">
                  <Field label="Title (optional)" name="title" placeholder="e.g. Channel letter install" />
                </div>
                <div className="md:col-span-2">
                  <TextArea label="Notes" name="notes" rows={2} defaultValue={order.installNotes ?? ""} />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" variant="secondary">Schedule install event</Button>
                </div>
              </form>
            )}
          </Card>
        )}

        {activeTab === "tasks" && (
          <Card>
            <CardHeader
              title="Tasks"
              description={
                orderTasks.length === 0
                  ? "No tasks yet. Use this for anything with an owner + a deadline."
                  : `${openTasksCount} open · ${orderTasks.length} total`
              }
            />
            <ul>
              {orderTasks.length === 0 && (
                <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                  Nothing assigned yet.
                </li>
              )}
              {orderTasks.map((t) => {
                const toggle = toggleTaskComplete.bind(null, slug, t.id);
                const remove = deleteOrderTask.bind(null, slug, t.id);
                const reassign = updateTaskAssignment.bind(null, slug, t.id);
                const overdue = t.dueDate && !t.completedAt && t.dueDate < new Date();
                return (
                  <li key={t.id} className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-start gap-3">
                      {canManage && (
                        <form action={toggle} className="mt-0.5">
                          <button type="submit" aria-label="toggle">
                            <span style={{
                              display: "inline-block", width: 16, height: 16, borderRadius: 4,
                              border: "1px solid var(--border-subtle)",
                              background: t.completedAt ? "var(--accent-primary)" : "transparent",
                            }} />
                          </button>
                        </form>
                      )}
                      <div className="flex-1">
                        <div className={`text-sm ${t.completedAt ? "line-through opacity-60" : "font-medium"}`}>
                          {t.title}
                        </div>
                        {t.description && (
                          <div className="mt-0.5 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                            {t.description}
                          </div>
                        )}
                        <div className="mt-0.5 text-xs" style={{ color: overdue ? "var(--danger-fg)" : "var(--text-muted)" }}>
                          {[
                            t.assignedTo ? (memberMap.get(t.assignedTo)?.name ?? "Unknown") : "Unassigned",
                            t.dueDate ? `due ${formatDate(t.dueDate)}` : null,
                            humanize(t.priority),
                            overdue ? "OVERDUE" : null,
                          ].filter(Boolean).map((part, i, arr) => (
                            <span key={i}>{part}{i < arr.length - 1 ? " · " : ""}</span>
                          ))}
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <form action={reassign} className="flex items-center gap-1">
                            <select
                              name="assignedTo"
                              defaultValue={t.assignedTo ?? ""}
                              className="rounded-md px-2 py-1 text-xs outline-none"
                              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                            >
                              <option value="">Unassigned</option>
                              {members.map((m) => (
                                <option key={m.userId} value={m.userId}>{m.name}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs"
                              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                            >
                              Save
                            </button>
                          </form>
                          <form action={remove}>
                            <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                              Delete
                            </button>
                          </form>
                        </div>
                      )}
                    </div>

                    {(t.subtasks.length > 0 || canManage) && (
                      <div className="mt-2 ml-7 space-y-1.5" style={{ borderLeft: "1px solid var(--border-subtle)" }}>
                        {t.subtasks.map((s) => {
                          const toggleSub = toggleTaskComplete.bind(null, slug, s.id);
                          const removeSub = deleteOrderTask.bind(null, slug, s.id);
                          const subOverdue = s.dueDate && !s.completedAt && s.dueDate < new Date();
                          return (
                            <div key={s.id} className="flex items-start gap-2 pl-3">
                              {canManage && (
                                <form action={toggleSub} className="mt-0.5">
                                  <button type="submit" aria-label="toggle">
                                    <span style={{
                                      display: "inline-block", width: 12, height: 12, borderRadius: 3,
                                      border: "1px solid var(--border-subtle)",
                                      background: s.completedAt ? "var(--accent-primary)" : "transparent",
                                    }} />
                                  </button>
                                </form>
                              )}
                              <div className="flex-1">
                                <div className={`text-xs ${s.completedAt ? "line-through opacity-60" : ""}`}>
                                  {s.title}
                                </div>
                                <div className="text-xs" style={{ color: subOverdue ? "var(--danger-fg)" : "var(--text-muted)" }}>
                                  {[
                                    s.assignedTo ? (memberMap.get(s.assignedTo)?.name ?? "Unknown") : null,
                                    s.dueDate ? `due ${formatDate(s.dueDate)}` : null,
                                    subOverdue ? "OVERDUE" : null,
                                  ].filter(Boolean).map((part, i, arr) => (
                                    <span key={i}>{part}{i < arr.length - 1 ? " · " : ""}</span>
                                  ))}
                                </div>
                              </div>
                              {canManage && (
                                <form action={removeSub}>
                                  <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                                    ×
                                  </button>
                                </form>
                              )}
                            </div>
                          );
                        })}

                        {canManage && !t.completedAt && (
                          <form
                            action={addSubtask.bind(null, slug, t.id)}
                            className="flex flex-wrap items-end gap-2 pl-3 pt-1"
                          >
                            <input
                              name="title"
                              placeholder="Add subtask…"
                              required
                              className="flex-1 min-w-[180px] rounded-md px-2 py-1 text-xs outline-none"
                              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                            />
                            <select
                              name="assignedTo"
                              defaultValue=""
                              className="rounded-md px-2 py-1 text-xs outline-none"
                              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                            >
                              <option value="">Unassigned</option>
                              {members.map((m) => (
                                <option key={m.userId} value={m.userId}>{m.name}</option>
                              ))}
                            </select>
                            <input
                              name="dueDate"
                              type="date"
                              className="rounded-md px-2 py-1 text-xs outline-none"
                              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                            />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs"
                              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                            >
                              Add
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {canManage && (
              <form
                action={createOrderTask.bind(null, slug, order.id)}
                className="space-y-3 px-5 py-4"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <Field label="Task title" name="title" required placeholder="e.g. Confirm site access with customer" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <SelectField
                    label="Assignee"
                    name="assignedTo"
                    defaultValue={order.productionManagerId ?? ""}
                    options={[
                      { value: "", label: "Unassigned" },
                      ...members.map((m) => ({ value: m.userId, label: m.name })),
                    ]}
                  />
                  <Field label="Due date" name="dueDate" type="date" />
                  <SelectField
                    label="Priority"
                    name="priority"
                    defaultValue="NORMAL"
                    options={[
                      { value: "LOW",    label: "Low"    },
                      { value: "NORMAL", label: "Normal" },
                      { value: "HIGH",   label: "High"   },
                    ]}
                  />
                </div>
                <TextArea label="Description (optional)" name="description" rows={2} />
                <Button type="submit" variant="secondary">Add task</Button>
              </form>
            )}
          </Card>
        )}

        {activeTab === "billing" && (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Invoices"
                description={`${order.invoices.length} tied to this order`}
                right={canInvoice ? (
                  <div className="flex gap-2">
                    <Link
                      href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=DEPOSIT`}
                      className="text-xs underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Deposit invoice
                    </Link>
                    <Link
                      href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=STANDARD`}
                      className="text-xs underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Full invoice
                    </Link>
                    <Link
                      href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=BALANCE`}
                      className="text-xs underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Balance invoice
                    </Link>
                  </div>
                ) : undefined}
              />
              <ul>
                {order.invoices.length === 0 && (
                  <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No invoices yet.</li>
                )}
                {order.invoices.map((inv) => {
                  const invBalance = outstandingBalance(inv);
                  return (
                    <li key={inv.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <div className="flex items-center gap-3">
                        <Link href={`/t/${slug}/invoices/${inv.id}`} className="text-sm font-medium underline">
                          {inv.number}
                        </Link>
                        <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: invoiceStatusColor(inv.status), color: "white" }}>
                          {invoiceStatusLabel(inv.status)}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{humanize(inv.kind)}</span>
                        {inv.dueDate && (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            due {formatDate(inv.dueDate)}
                          </span>
                        )}
                      </div>
                      <div className="text-right text-sm">
                        <div className="font-medium">{formatMoney(inv.total.toString(), ctx.tenant.currency)}</div>
                        {invBalance > 0 && (
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatMoney(invBalance, ctx.tenant.currency)} due
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {canSeeProfit && (
              <Card>
                <CardHeader
                  title="Profit on this job"
                  description={
                    margin.marginPct === null
                      ? "Revenue will appear here once invoices are issued."
                      : `${margin.marginPct.toFixed(1)}% gross margin on ${formatMoney(margin.revenue, ctx.tenant.currency)} revenue`
                  }
                  right={
                    ctx.can("expenses:manage") ? (
                      <Link
                        href={`/t/${slug}/expenses/new?orderId=${order.id}&customerId=${order.customer.id}`}
                        className="text-xs underline"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Log expense
                      </Link>
                    ) : undefined
                  }
                />
                <div className="grid grid-cols-2 gap-4 px-5 py-4 md:grid-cols-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Revenue
                    </div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums">
                      {formatMoney(margin.revenue, ctx.tenant.currency)}
                    </div>
                    {refundedFromInvoices > 0 && (
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        after {formatMoney(refundedFromInvoices, ctx.tenant.currency)} refunded
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Cost
                    </div>
                    <div className="mt-0.5 text-lg font-semibold tabular-nums">
                      {formatMoney(margin.cost, ctx.tenant.currency)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {order.expenses.length} expense{order.expenses.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Gross profit
                    </div>
                    <div
                      className="mt-0.5 text-lg font-semibold tabular-nums"
                      style={{ color: margin.gross < 0 ? "#ef4444" : "var(--text-default)" }}
                    >
                      {formatMoney(margin.gross, ctx.tenant.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                      Margin
                    </div>
                    <div
                      className="mt-0.5 text-lg font-semibold tabular-nums"
                      style={{ color: marginColor(margin.marginPct) }}
                    >
                      {margin.marginPct === null ? "—" : `${margin.marginPct.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
                {order.expenses.length > 0 && (
                  <ul style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    {order.expenses.slice(0, 8).map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between px-5 py-2.5 text-sm"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <div className="flex items-center gap-3">
                          <Link href={`/t/${slug}/expenses/${e.id}`} className="underline">
                            {formatDate(e.date)}
                          </Link>
                          {e.vendor && (
                            <Link href={`/t/${slug}/vendors/${e.vendor.id}`} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
                              {e.vendor.name}
                            </Link>
                          )}
                          {e.category && (
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{e.category}</span>
                          )}
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{expenseMethodLabel(e.method)}</span>
                          {e.billable && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px]"
                              style={{ background: "#1f3a2a", color: "#a7f3d0" }}>
                              billable
                            </span>
                          )}
                        </div>
                        <div className="font-medium tabular-nums">
                          {formatMoney(e.amount.toString(), ctx.tenant.currency)}
                        </div>
                      </li>
                    ))}
                    {order.expenses.length > 8 && (
                      <li className="px-5 py-2 text-xs" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
                        Showing 8 of {order.expenses.length}.{" "}
                        <Link href={`/t/${slug}/expenses?orderId=${order.id}`} className="underline">
                          See all.
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </Card>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-5">
            <Card>
              <CardHeader title="Timeline" description="Status milestones for this order." />
              <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs sm:grid-cols-3 md:grid-cols-6">
                {ORDER_STATUSES.map((s) => {
                  const stamp =
                    s.value === "NEW" ? order.createdAt
                    : s.value === "IN_PRODUCTION" ? order.startedAt
                    : s.value === "READY" ? order.readyAt
                    : s.value === "OUT_FOR_INSTALL" ? null
                    : s.value === "COMPLETED" ? order.completedAt
                    : s.value === "CANCELED" ? order.canceledAt
                    : null;
                  const isActive = order.status === s.value;
                  return (
                    <div
                      key={s.value}
                      className="rounded-md px-3 py-2"
                      style={{
                        background: isActive ? "var(--accent-surface)" : "var(--surface-1)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        className="text-[11px] font-medium uppercase tracking-wide"
                        style={{ color: isActive ? s.color : "var(--text-muted)" }}
                      >
                        {s.label}
                      </div>
                      <div className="mt-1" style={{ color: "var(--text-default)" }}>
                        {stamp ? formatDate(stamp) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {order.canceledAt && order.cancelReason && (
                <div className="px-5 pb-4 text-xs" style={{ color: "var(--text-muted)" }}>
                  Canceled {formatDateTime(order.canceledAt)} — {order.cancelReason}
                </div>
              )}
            </Card>

            {canManage && (
              <Card>
                <CardHeader
                  title="Send update"
                  description="Let the customer know where their order stands. Logged on their timeline."
                />
                <SendMessageWidget
                  slug={slug}
                  customerId={order.customerId}
                  customerEmail={order.customer.email}
                  orderId={order.id}
                  returnTo={`/t/${slug}/orders/${order.id}?tab=activity`}
                  templates={sendCtx.templates}
                  bag={sendCtx.bag}
                />
              </Card>
            )}

            <CommentThread
              slug={slug}
              parentKind="order"
              parentId={order.id}
              comments={order.comments}
              currentUserId={ctx.userId}
              memberMap={memberMap}
              canModerate={ctx.can("staff:manage")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: React.ReactNode; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text-default)" }}>{label}</span>
      <span className={bold ? "text-lg font-semibold" : ""}>{value}</span>
    </div>
  );
}
