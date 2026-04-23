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
import {
  statusColor as invoiceStatusColor,
  statusLabel as invoiceStatusLabel,
  outstandingBalance,
} from "@/lib/invoices";
import { computeMargin, marginColor, expenseMethodLabel } from "@/lib/finance";
import { proofStatusColor, proofStatusLabel } from "@/lib/proofs";
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
import { createProof } from "@/app/actions/proofs";
import {
  createOrderTask,
  addSubtask,
  updateTaskAssignment,
  toggleTaskComplete,
  deleteOrderTask,
} from "@/app/actions/order-tasks";
// Phase 12 — production surfaces on the order detail page.
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

// User-facing label for each transition.
const TRANSITION_LABELS: Partial<Record<string, string>> = {
  IN_PRODUCTION: "Start production",
  READY:         "Mark ready",
  OUT_FOR_INSTALL: "Out for install",
  COMPLETED:     "Mark completed",
  CANCELED:      "Cancel",
  NEW:           "Reopen",
};

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
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "orders:view");
  const canManage = ctx.can("orders:manage");
  const canProduce = ctx.can("production:manage");

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
      // Phase 14 — job-linked expenses power the margin card. We pull
      // the rows (capped) rather than an aggregate so the UI can show
      // the most recent entries inline.
      expenses: {
        orderBy: { date: "desc" },
        take: 50,
        include: { vendor: { select: { id: true, name: true } } },
      },
      files: { orderBy: { createdAt: "desc" } },
      proofs: {
        orderBy: { version: "desc" },
        include: { _count: { select: { files: true } } },
      },
      installEvents: { orderBy: { scheduledStart: "asc" } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      // Phase 10 — active + resolved blockers. We pull them all (desc) so the
      // UI can show a "history" fold below the live list.
      blockers: { orderBy: { createdAt: "desc" } },
      // Phase 14 — job-level internal thread.
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      // Phase 12 — production stages + defects + materials. We pull them
      // all here rather than per-card so the render is a single round-trip
      // and the page stays snappy. Stage count tops out in the low dozens
      // per order; defects + materials are bounded too.
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

  // Phase 13 — active ORDER-kind templates for the apply dropdown.
  // Phase 15 Slice D — also pull inherited shared templates from the parent
  // group root so franchisees can apply the franchisor's canonical workflow
  // without cloning it locally first.
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
    // Phase 10 — order-scoped tasks. We fetch ONLY top-level tasks
    // (parentTaskId null) and include their subtasks inline so the UI can
    // render the nested tree without N+1 queries. Ordering: open tasks
    // first (completedAt null), then by due date (earliest wins), then
    // by creation. Completed tasks fall to the bottom but stay visible
    // so there's a sense of "what got done today".
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
    // Phase 12 — departments + workstations for the stage dropdowns on
    // this page. We sort departments by sortOrder so the dropdown order
    // matches the board swimlanes.
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

  // Phase 14 — gross profit / margin. Shown to users with the financial
  // reporting capability; everyone else sees the invoices section only.
  // Revenue for margin purposes is the sum of non-VOID, non-WRITTEN_OFF
  // invoice totals tied to this order — a written-off invoice didn't
  // generate revenue. Refunds are subtracted by computeMargin.
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

  // Phase 10 — split blockers so the active ones surface prominently and the
  // resolved ones live in a collapsed history further down the blockers card.
  const activeBlockers   = order.blockers.filter((b) => !b.resolvedAt);
  const resolvedBlockers = order.blockers.filter((b) =>  b.resolvedAt);

  // Phase A Slice 1 — deposit gate status for the banner + header chip. The
  // gate only *blocks* the NEW→IN_PRODUCTION transition when the tenant has
  // opted into requireDepositBeforeProduction, but we also want to flag
  // "deposit owed" as informational state when the flag is off.
  const depositOwed = Math.max(0, depositDue - Number(order.paidAmount));
  const depositOutstanding = order.depositPercent > 0 && depositOwed > 0.005;
  const depositGateActive =
    depositOutstanding &&
    ctx.tenant.requireDepositBeforeProduction &&
    order.status === "NEW";
  const depositInvoice = order.invoices.find((inv) => inv.kind === "DEPOSIT");

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{order.number}</h1>
            <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: statusColor(order.status), color: "white" }}>
              {statusLabel(order.status)}
            </span>
            {/* Phase 10 — priority chip. We show NORMAL too so the state is
                always legible at a glance (no "is it Normal or did someone
                forget to set it?" ambiguity on the floor). */}
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: priorityColor(order.priority), color: "white" }}
              title={`Priority: ${priorityLabel(order.priority)}`}
            >
              {order.priority === "RUSH" ? "⚡ " : ""}{priorityLabel(order.priority)}
            </span>
            {/* Phase 10 — blocked chip near the status so the header tells the
                whole truth: what status it's in, and whether it's actually
                paused. Details live in the Blockers card below. */}
            {depositOutstanding && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
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
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--danger-fg)", color: "white" }}
                title={activeBlockers.map((b) => blockerReasonLabel(b.reason)).join(", ")}
              >
                Blocked · {activeBlockers.length}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            For <Link href={`/t/${slug}/customers/${order.customer.id}`} className="underline">{order.customer.name}</Link>
            {order.quote && (
              <>{" · "}From quote <Link href={`/t/${slug}/quotes/${order.quote.id}`} className="underline">{order.quote.number}</Link></>
            )}
            {order.dueDate && <>{" · "}Due {formatDate(order.dueDate)}</>}
          </div>
        </div>
        {canManage && order.status === "CANCELED" && (
          <form action={del}>
            <Button type="submit" variant="danger">Delete order</Button>
          </form>
        )}
      </div>

      {/* Phase A Slice 1 — deposit-gate banner. Rendered only when the tenant
          has enforcement on AND the deposit is short AND the order is still
          NEW (past that point the gate is moot). Staff click through to the
          auto-created DEPOSIT invoice to record/ collect payment. */}
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

      {/* Phase 10 — active blockers warning. Put it directly under the header
          so it can't be missed. The orderCanEnterProduction gate refuses to
          advance to IN_PRODUCTION while any of these are live, but we don't
          actually change status here — blockers are advisory metadata. */}
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
            Resolve these in the Blockers card below before starting production.
          </div>
        </div>
      )}

      {/* Phase A Slice 2 — Order summary strip. Keeps the money snapshot and
          the "next action" hint directly under the header so staff don't have
          to scroll to the invoices card to know what to do next. The invoice
          CTAs here are state-aware (Deposit shown when deposit is outstanding
          and there's no DEPOSIT invoice yet; Balance shown once the job is
          READY/COMPLETED with a balance remaining). */}
      {(() => {
        const balanceInvoice = order.invoices.find((inv) => inv.kind === "BALANCE");
        const showDepositCTA = canInvoice && depositOutstanding && !depositInvoice;
        const showBalanceCTA =
          canInvoice &&
          balance > 0.005 &&
          !balanceInvoice &&
          (order.status === "READY" || order.status === "OUT_FOR_INSTALL" || order.status === "COMPLETED");
        let nextAction = "";
        if (order.status === "CANCELED") {
          nextAction = "Order canceled.";
        } else if (depositGateActive) {
          nextAction = `Collect ${formatMoney(depositOwed, ctx.tenant.currency)} deposit to unlock production.`;
        } else if (activeBlockers.length > 0) {
          nextAction = "Clear blockers before advancing.";
        } else if (order.status === "NEW") {
          nextAction = depositOutstanding
            ? `Deposit of ${formatMoney(depositOwed, ctx.tenant.currency)} is still owed — send or record payment.`
            : "Ready to start production.";
        } else if (order.status === "IN_PRODUCTION") {
          nextAction = `Production in progress · ${producedCount}/${order.items.length} items produced.`;
        } else if (order.status === "READY") {
          nextAction = balance > 0.005
            ? `Send balance invoice for ${formatMoney(balance, ctx.tenant.currency)}, then deliver/install.`
            : "Paid in full — schedule delivery or install.";
        } else if (order.status === "OUT_FOR_INSTALL") {
          nextAction = balance > 0.005
            ? `Out for install · collect ${formatMoney(balance, ctx.tenant.currency)} on completion.`
            : "Out for install.";
        } else if (order.status === "COMPLETED") {
          nextAction = balance > 0.005
            ? `Completed — ${formatMoney(balance, ctx.tenant.currency)} still outstanding.`
            : "Completed and paid in full.";
        }
        return (
          <Card>
            <div
              className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1fr_1fr_2fr] md:items-center"
            >
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Total
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatMoney(order.total.toString(), ctx.tenant.currency)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Paid
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">
                  {formatMoney(order.paidAmount.toString(), ctx.tenant.currency)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Balance
                </div>
                <div
                  className="mt-0.5 text-lg font-semibold tabular-nums"
                  style={{ color: balance > 0.005 ? "var(--danger-fg)" : "var(--text-default)" }}
                >
                  {formatMoney(balance, ctx.tenant.currency)}
                </div>
              </div>
              <div className="flex flex-col gap-2 md:items-end">
                {nextAction && (
                  <div className="text-sm md:text-right" style={{ color: "var(--text-muted)" }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                      Next ·{" "}
                    </span>
                    <span style={{ color: "var(--text-default)" }}>{nextAction}</span>
                  </div>
                )}
                {(showDepositCTA || showBalanceCTA || depositInvoice || balanceInvoice) && (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {showDepositCTA && (
                      <Link
                        href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=DEPOSIT`}
                        className="rounded-md px-3 py-1.5 text-xs font-medium"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                      >
                        Send deposit invoice
                      </Link>
                    )}
                    {depositInvoice && (
                      <Link
                        href={`/t/${slug}/invoices/${depositInvoice.id}`}
                        className="rounded-md px-3 py-1.5 text-xs font-medium"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                      >
                        Deposit inv {depositInvoice.number}
                      </Link>
                    )}
                    {showBalanceCTA && (
                      <Link
                        href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=BALANCE`}
                        className="rounded-md px-3 py-1.5 text-xs font-medium"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                      >
                        Send balance invoice
                      </Link>
                    )}
                    {balanceInvoice && (
                      <Link
                        href={`/t/${slug}/invoices/${balanceInvoice.id}`}
                        className="rounded-md px-3 py-1.5 text-xs font-medium"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                      >
                        Balance inv {balanceInvoice.number}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Status actions */}
      {canManage && transitions.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Actions:</span>
            {transitions.map((to) => {
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
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                    />
                  )}
                  <Button type="submit" variant={isCancel ? "danger" : (to === "NEW" ? "secondary" : "primary")}>
                    {TRANSITION_LABELS[to] ?? statusLabel(to)}
                  </Button>
                </form>
              );
            })}
          </div>
        </Card>
      )}

      {/* Phase 10 — Priority + Blockers live side-by-side because they're both
          "workflow state" concerns (as opposed to the scheduling/assignment
          card further down, which is about who and when). Keeping them near
          the status-action card means the whole "what's happening with this
          job" story is in one scroll band. */}
      {canManage && (
        <div className="grid grid-cols-2 gap-4">
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

            {/* Add-blocker form. The reason dropdown is the source of truth —
                freeform notes are optional color commentary, not a required
                field. That keeps the common case (tap reason, hit save) fast. */}
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
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Items */}
        <Card className="col-span-2">
          <CardHeader
            title="Line items"
            description={`${producedCount} of ${order.items.length} produced`}
          />
          {/* Phase 18 Slice G — shop-floor progress bar so someone glancing at
              the order sees production progress without counting checkboxes. */}
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

        {/* Financials */}
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
              <Row label="Balance" value={formatMoney(balance, ctx.tenant.currency)} />
            </div>
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              Payments flow through invoices.
            </div>
          </div>
        </Card>
      </div>

      {/* Phase 10 — Job specs. This is the "build sheet" — substrate,
          finish, color, mount. We keep it ABOVE scheduling because the
          production team scans these first thing in the morning before
          grabbing materials, and a date on a job with blank specs is
          useless. Fields are all optional (print-only shops don't care
          about install method, etc.) so the card stays out of the way
          when it isn't needed. */}
      <Card>
        <CardHeader
          title="Job specs"
          description="Build sheet for the shop floor. Fill what's relevant — empty fields won't print."
        />
        <form
          action={saveOrderJobSpecs.bind(null, slug, order.id)}
          className="grid grid-cols-2 gap-4 px-5 py-4"
        >
          <Field
            label="Material / substrate"
            name="material"
            defaultValue={order.material ?? ""}
            placeholder="e.g. 3mm ACM, 3M IJ180Cv3, 1/2&quot; PVC"
          />
          <Field
            label="Finish"
            name="finish"
            defaultValue={order.finish ?? ""}
            placeholder="e.g. Matte lam, gloss UV, satin powder coat"
          />
          <div className="col-span-2">
            <Field
              label="Color specs"
              name="colorSpecs"
              defaultValue={order.colorSpecs ?? ""}
              placeholder="e.g. PMS 186 C red, CMYK 0/100/81/4, Avery 950 Brilliant Blue"
            />
          </div>
          <div className="col-span-2">
            <Field
              label="Install method"
              name="installMethod"
              defaultValue={order.installMethod ?? ""}
              placeholder="e.g. Stud-mount 1/2&quot; off wall, VHB to glass, post + footing"
            />
          </div>
          <div className="col-span-2">
            <TextArea
              label="Special instructions"
              name="specialInstructions"
              rows={3}
              defaultValue={order.specialInstructions ?? ""}
              placeholder="Anything the shop needs to know that doesn't fit above — grommets, brackets not included, customer will supply substrate, etc."
            />
          </div>
          {canManage && (
            <div className="col-span-2">
              <Button type="submit">Save job specs</Button>
            </div>
          )}
        </form>
      </Card>

      {/* Meta form */}
      <Card>
        <CardHeader title="Scheduling & assignment" />
        <form action={saveMeta} className="grid grid-cols-2 gap-4 px-5 py-4">
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
            hint="Quick summary date. Create an install event below for the full calendar entry."
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
          <div className="col-span-2">
            <TextArea label="Customer-facing note" name="customerNote" rows={2} defaultValue={order.customerNote ?? ""} />
          </div>
          <div className="col-span-2">
            <TextArea label="Production notes" name="productionNotes" rows={2} defaultValue={order.productionNotes ?? ""} />
          </div>
          <div className="col-span-2">
            <TextArea label="Install notes" name="installNotes" rows={2} defaultValue={order.installNotes ?? ""} />
          </div>
          {canManage && (
            <div className="col-span-2">
              <Button type="submit">Save</Button>
            </div>
          )}
        </form>
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Phase 12 — Production stages.                                */}
      {/*                                                              */}
      {/* Stage list comes first because it's the spine of what happens*/}
      {/* on the floor. We show ALL stages (not just open) so the order*/}
      {/* card can double as the job's production history.             */}
      {/* ──────────────────────────────────────────────────────────── */}
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
                  {/* Touch a throwaway value so TS doesn't flag deptWorkStations as unused;
                      a future inline "move to station" dropdown will consume it. */}
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
                  ...workStations.map((w) => ({
                    value: w.id,
                    label: `${w.name}`,
                  })),
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
              <Field
                label="Est minutes"
                name="estimatedMinutes"
                type="number"
                min="0"
              />
              <Field
                label="Due"
                name="dueAt"
                type="date"
                hint="Blank = falls back to the order due date."
              />
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

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Phase 12 — Defect reports.                                   */}
      {/*                                                              */}
      {/* Two sections: unresolved on top (the actionable list), then  */}
      {/* a collapsed history of resolved defects. Report form is an   */}
      {/* expand-to-reveal fold so the card stays scannable by default.*/}
      {/* ──────────────────────────────────────────────────────────── */}
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

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Phase 12 — Material usage.                                   */}
      {/*                                                              */}
      {/* Intentionally light — free-text material name, quantity,     */}
      {/* unit, optional waste%. A full inventory system lives in a    */}
      {/* later phase; this card exists so job costing has real data.  */}
      {/* ──────────────────────────────────────────────────────────── */}
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

      {/* Phase 13 — production checklist */}
      <ChecklistCard
        slug={slug}
        scope={{ kind: "order", orderId: order.id }}
        items={order.checklistItems}
        templates={orderTemplates}
        memberMap={memberMap}
        canManage={canManage}
      />

      {/* Phase 10 — order-scoped tasks + subtasks. This sits below the
          checklist (which enforces stage-gating things like "verified proof
          matches artwork") because tasks are the freeform, assignable,
          due-dated action items — "Pick up permit from city hall by Friday",
          "Confirm site contact Monday AM". Subtasks live inline to keep the
          tree shallow and legible. */}
      <Card>
        <CardHeader
          title="Tasks"
          description={
            orderTasks.length === 0
              ? "No tasks yet. Use this for anything with an owner + a deadline."
              : `${orderTasks.filter((t) => !t.completedAt).length} open · ${orderTasks.length} total`
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
                      {/* Inline reassign. We keep the select + submit explicit
                          (rather than auto-submit-on-change) because this is a
                          server component — an onChange handler would force
                          the whole tree into "use client" for one micro-UX
                          win. A quick Save click is fine. */}
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

                {/* Subtasks — indented list under the parent. We always show
                    them (no expand/collapse) because on an order page there
                    are rarely more than a handful, and hiding them defeats
                    the point of "at a glance, what's left to do on this job". */}
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

        {/* Top-level task creator — full form so assignment + due + priority
            can all be set at once. We default assignee to the productionManager
            if there is one (saves a click for the most common case). */}
        {canManage && (
          <form
            action={createOrderTask.bind(null, slug, order.id)}
            className="space-y-3 px-5 py-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Field label="Task title" name="title" required placeholder="e.g. Confirm site access with customer" />
            <div className="grid grid-cols-3 gap-3">
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

      {/* Invoices */}
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

      {/* Phase 14 — profit card. Gated to financial-report readers so a
          production lead doesn't accidentally see the shop's margin on a
          job. Revenue / cost / gross / margin-%, plus a rollup of the
          expenses that feed the cost number. */}
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
                style={{ color: margin.gross < 0 ? "#ef4444" : "var(--text)" }}
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

      {/* Proofs */}
      <Card>
        <CardHeader
          title="Proofs"
          description={`${order.proofs.length} ${order.proofs.length === 1 ? "version" : "versions"}`}
        />
        <ul>
          {order.proofs.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No proofs yet.</li>
          )}
          {order.proofs.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center gap-3">
                <Link href={`/t/${slug}/orders/${order.id}/proofs/${p.id}`} className="text-sm font-medium underline">
                  v{p.version}
                </Link>
                <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: proofStatusColor(p.status), color: "white" }}>
                  {proofStatusLabel(p.status)}
                </span>
                {p.title && <span className="text-sm" style={{ color: "var(--text-muted)" }}>{p.title}</span>}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {p._count.files} {p._count.files === 1 ? "file" : "files"}
                {p.sentAt && <> · sent {formatDate(p.sentAt)}</>}
                {p.respondedAt && <> · responded {formatDate(p.respondedAt)}</>}
              </div>
            </li>
          ))}
        </ul>
        {canProofs && (
          <form action={createProof.bind(null, slug)} className="space-y-3 px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <input type="hidden" name="orderId" value={order.id} />
            <Field label="Title (optional)" name="title" placeholder="e.g. Storefront channel letters" />
            <TextArea label="Internal description" name="description" rows={2} />
            <Button type="submit" variant="secondary">Start new proof version</Button>
          </form>
        )}
      </Card>

      {/* Install events */}
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
          <form action={createInstallEvent.bind(null, slug)} className="grid grid-cols-2 gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="redirectTo" value={`/t/${slug}/orders/${order.id}`} />
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
            <div className="col-span-2">
              <Field label="Title (optional)" name="title" placeholder="e.g. Channel letter install" />
            </div>
            <div className="col-span-2">
              <TextArea label="Notes" name="notes" rows={2} defaultValue={order.installNotes ?? ""} />
            </div>
            <div className="col-span-2">
              <Button type="submit" variant="secondary">Schedule install event</Button>
            </div>
          </form>
        )}
      </Card>

      {/* Files */}
      <FilesCard
        slug={slug}
        files={order.files}
        parent={{ kind: "order", id: order.id }}
        canUpload={canUploadFiles}
        memberMap={memberMap}
        backUrl={`/t/${slug}/orders/${order.id}`}
        defaultKind="PRODUCTION_READY"
      />

      {/* Timeline */}
      <Card>
        <CardHeader title="Timeline" />
        <div className="grid grid-cols-6 gap-0 px-5 py-3 text-xs">
          {ORDER_STATUSES.map((s) => {
            const stamp =
              s.value === "NEW" ? order.createdAt
              : s.value === "IN_PRODUCTION" ? order.startedAt
              : s.value === "READY" ? order.readyAt
              : s.value === "OUT_FOR_INSTALL" ? null
              : s.value === "COMPLETED" ? order.completedAt
              : s.value === "CANCELED" ? order.canceledAt
              : null;
            return (
              <div key={s.value}>
                <div style={{ color: order.status === s.value ? s.color : "var(--text-muted)" }}>{s.label}</div>
                <div style={{ color: "var(--text-muted)" }}>{stamp ? formatDate(stamp) : "—"}</div>
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

      {/* Phase 14 — customer-facing send. */}
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
            returnTo={`/t/${slug}/orders/${order.id}`}
            templates={sendCtx.templates}
            bag={sendCtx.bag}
          />
        </Card>
      )}

      {/* Phase 14 — order-level internal thread. */}
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
