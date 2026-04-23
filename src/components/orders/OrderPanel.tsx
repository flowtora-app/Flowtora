import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import {
  changeOrderStatus,
  addOrderBlocker,
  resolveOrderBlocker,
} from "@/app/actions/orders";
import {
  ORDER_TRANSITIONS,
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
import { formatMoney, formatDate, formatDateTime, humanize } from "@/lib/format";
import { CommentThread } from "@/components/CommentThread";
import { OrderPanelTabs, type OrderPanelTab } from "@/components/orders/OrderPanelTabs";
import type { OrderStatus, OrderPriority } from "@prisma/client";

const TRANSITION_LABELS: Partial<Record<string, string>> = {
  IN_PRODUCTION:   "Start production",
  READY:           "Mark ready",
  OUT_FOR_INSTALL: "Out for install",
  COMPLETED:       "Mark completed",
  CANCELED:        "Cancel",
  NEW:             "Reopen",
};

export type OrderPanelOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  priority: OrderPriority;
  total: unknown;
  paidAmount: unknown;
  depositPercent: number;
  locationId: string | null;
  dueDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  quote: { id: string; number: string; status: string } | null;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: unknown;
    lineTotal: unknown;
    producedAt: Date | null;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    total: unknown;
    amountPaid: unknown;
    refundedAmount: unknown;
    writtenOffAmount: unknown;
    dueDate: Date | null;
    kind: string;
  }>;
  blockers: Array<{
    id: string;
    reason: string;
    notes: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
    blockedBy: string;
  }>;
  comments: Array<{
    id: string;
    authorId: string;
    body: string;
    mentionedUserIds: string[];
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
  }>;
};

export type OrderPanelActivity = {
  id: string;
  action: string;
  userId: string | null;
  createdAt: Date;
  metadata: unknown;
};

interface OrderPanelProps {
  slug: string;
  currency: string;
  order: OrderPanelOrder;
  tab: OrderPanelTab;
  activity: OrderPanelActivity[];
  canManage: boolean;
  canInvoice: boolean;
  canComment: boolean;
  currentUserId: string;
  memberMap: Map<string, { name: string }>;
  requireDepositBeforeProduction: boolean;
  tenantName: string;
}

/**
 * Right-side panel for the /orders split view. Server component. Takes a
 * fully-loaded order + audit activity. Renders a sticky header with status
 * actions, tab nav, the active tab body, and a sticky money footer.
 *
 * This is NOT meant to replace the full /orders/[id] page — that page still
 * exists for advanced workflow (production stages, defects, materials,
 * installs, profit). The "Open full view" link in the header takes users
 * there when they need it.
 */
export function OrderPanel({
  slug,
  currency,
  order,
  tab,
  activity,
  canManage,
  canInvoice,
  canComment,
  currentUserId,
  memberMap,
  requireDepositBeforeProduction,
  tenantName: _tenantName,
}: OrderPanelProps) {
  const total = Number(order.total);
  const paid = Number(order.paidAmount);
  const balance = Math.max(0, total - paid);
  const depositDue = total * (order.depositPercent / 100);
  const depositOwed = Math.max(0, depositDue - paid);
  const depositOutstanding = order.depositPercent > 0 && depositOwed > 0.005;
  const depositGateActive =
    depositOutstanding && requireDepositBeforeProduction && order.status === "NEW";
  const depositInvoice = order.invoices.find((i) => i.kind === "DEPOSIT");
  const balanceInvoice = order.invoices.find((i) => i.kind === "BALANCE");
  const activeBlockers = order.blockers.filter((b) => !b.resolvedAt);
  const transitions = ORDER_TRANSITIONS[order.status];

  const showDepositCTA = canInvoice && depositOutstanding && !depositInvoice;
  const showBalanceCTA =
    canInvoice &&
    balance > 0.005 &&
    !balanceInvoice &&
    (order.status === "READY" ||
      order.status === "OUT_FOR_INSTALL" ||
      order.status === "COMPLETED");

  let nextAction = "";
  if (order.status === "CANCELED") {
    nextAction = "Order canceled.";
  } else if (depositGateActive) {
    nextAction = `Collect ${formatMoney(depositOwed, currency)} deposit to unlock production.`;
  } else if (activeBlockers.length > 0) {
    nextAction = `Resolve ${activeBlockers.length} blocker${activeBlockers.length === 1 ? "" : "s"} to continue.`;
  } else if (order.status === "NEW") {
    nextAction = depositOutstanding
      ? `${formatMoney(depositOwed, currency)} deposit still owed.`
      : "Ready to start production.";
  } else if (order.status === "IN_PRODUCTION") {
    nextAction = "Production in progress.";
  } else if (order.status === "READY") {
    nextAction = balance > 0.005
      ? `Send balance invoice for ${formatMoney(balance, currency)}.`
      : "Paid in full — schedule install.";
  } else if (order.status === "OUT_FOR_INSTALL") {
    nextAction = balance > 0.005
      ? `Collect ${formatMoney(balance, currency)} on completion.`
      : "Out for install.";
  } else if (order.status === "COMPLETED") {
    nextAction = balance > 0.005
      ? `${formatMoney(balance, currency)} still outstanding.`
      : "Completed and paid in full.";
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* STICKY HEADER */}
      <div
        className="sticky top-0 z-20 px-6 py-4"
        style={{
          background: "var(--surface-0)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
                {order.number}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: statusColor(order.status), color: "white" }}
              >
                {statusLabel(order.status)}
              </span>
              {order.priority !== "NORMAL" && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: priorityColor(order.priority), color: "white" }}
                >
                  {order.priority === "RUSH" ? "⚡ " : ""}
                  {priorityLabel(order.priority)}
                </span>
              )}
              {activeBlockers.length > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: "var(--danger-fg)", color: "white" }}
                  title={activeBlockers.map((b) => blockerReasonLabel(b.reason as never)).join(", ")}
                >
                  Blocked · {activeBlockers.length}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              <Link href={`/t/${slug}/customers/${order.customer.id}`} className="underline">
                {order.customer.name}
              </Link>
              {order.quote && (
                <>
                  {" · from "}
                  <Link href={`/t/${slug}/quotes/${order.quote.id}`} className="underline">
                    {order.quote.number}
                  </Link>
                </>
              )}
              {order.dueDate && <>{" · due "}{formatDate(order.dueDate)}</>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage &&
              transitions.slice(0, 2).map((to) => {
                const action = changeOrderStatus.bind(null, slug, order.id);
                const isCancel = to === "CANCELED";
                return (
                  <form key={to} action={action}>
                    <input type="hidden" name="status" value={to} />
                    <Button
                      type="submit"
                      variant={isCancel ? "danger" : (to === "NEW" ? "secondary" : "primary")}
                    >
                      {TRANSITION_LABELS[to] ?? statusLabel(to)}
                    </Button>
                  </form>
                );
              })}
            <Link
              href={`/t/${slug}/orders/${order.id}`}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              Open full view ↗
            </Link>
          </div>
        </div>

        {/* Tab nav */}
        <div className="mt-3">
          <OrderPanelTabs active={tab} />
        </div>
      </div>

      {/* TAB BODY */}
      <div className="flex-1 space-y-5 px-6 py-5">
        {tab === "overview" && (
          <OverviewTab
            slug={slug}
            currency={currency}
            order={order}
            activeBlockers={activeBlockers}
            depositInvoice={depositInvoice}
            balanceInvoice={balanceInvoice}
            showDepositCTA={showDepositCTA}
            showBalanceCTA={showBalanceCTA}
            canInvoice={canInvoice}
            canManage={canManage}
            depositGateActive={depositGateActive}
            depositOwed={depositOwed}
            depositDue={depositDue}
          />
        )}
        {tab === "production" && (
          <ProductionTab
            slug={slug}
            order={order}
            activeBlockers={activeBlockers}
            canManage={canManage}
            memberMap={memberMap}
          />
        )}
        {tab === "invoicing" && (
          <InvoicingTab
            slug={slug}
            currency={currency}
            order={order}
            canInvoice={canInvoice}
          />
        )}
        {tab === "comments" && (
          <CommentThread
            slug={slug}
            parentKind="order"
            parentId={order.id}
            comments={order.comments}
            currentUserId={currentUserId}
            memberMap={memberMap}
            canModerate={canComment}
          />
        )}
        {tab === "activity" && (
          <ActivityTab activity={activity} memberMap={memberMap} />
        )}
      </div>

      {/* STICKY MONEY FOOTER */}
      <div
        className="sticky bottom-0 z-10 grid gap-3 px-6 py-3 md:grid-cols-[1fr_1fr_1fr_2fr] md:items-center"
        style={{
          background: "var(--surface-0)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <Stat label="Total" value={formatMoney(order.total as never, currency)} />
        <Stat label="Paid" value={formatMoney(order.paidAmount as never, currency)} />
        <Stat
          label="Balance"
          value={formatMoney(balance, currency)}
          valueColor={balance > 0.005 ? "var(--danger-fg)" : undefined}
        />
        {nextAction && (
          <div className="text-xs md:text-right" style={{ color: "var(--text-muted)" }}>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              Next ·{" "}
            </span>
            <span style={{ color: "var(--text-default)" }}>{nextAction}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-base font-semibold tabular-nums"
        style={{ color: valueColor ?? "var(--text-default)" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ---------- Overview tab ---------- */

function OverviewTab({
  slug,
  currency,
  order,
  activeBlockers,
  depositInvoice,
  balanceInvoice,
  showDepositCTA,
  showBalanceCTA,
  canInvoice: _canInvoice,
  canManage: _canManage,
  depositGateActive,
  depositOwed,
  depositDue,
}: {
  slug: string;
  currency: string;
  order: OrderPanelOrder;
  activeBlockers: OrderPanelOrder["blockers"];
  depositInvoice: OrderPanelOrder["invoices"][number] | undefined;
  balanceInvoice: OrderPanelOrder["invoices"][number] | undefined;
  showDepositCTA: boolean;
  showBalanceCTA: boolean;
  canInvoice: boolean;
  canManage: boolean;
  depositGateActive: boolean;
  depositOwed: number;
  depositDue: number;
}) {
  return (
    <>
      {/* Deposit gate banner */}
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
            Deposit of {formatMoney(depositDue, currency)} required before production.
          </div>
          <div className="mt-1 text-xs opacity-90">
            Outstanding: {formatMoney(depositOwed, currency)}
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

      {/* Active blockers banner */}
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
            Blocked ({activeBlockers.length} active)
          </div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {activeBlockers.slice(0, 3).map((b) => (
              <li key={b.id}>
                {blockerReasonLabel(b.reason as never)}
                {b.notes && <> — {b.notes}</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invoice shortcuts */}
      {(showDepositCTA || showBalanceCTA || depositInvoice || balanceInvoice) && (
        <Card>
          <CardHeader title="Invoice shortcuts" />
          <div className="flex flex-wrap gap-2 px-5 py-4">
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
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
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
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              >
                Balance inv {balanceInvoice.number}
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Line items */}
      <Card>
        <CardHeader title="Line items" description={`${order.items.length} item${order.items.length === 1 ? "" : "s"}`} />
        <ul>
          {order.items.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No line items.
            </li>
          )}
          {order.items.map((it) => (
            <li
              key={it.id}
              className="flex items-start justify-between gap-4 px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                  {it.name}
                </div>
                {it.description && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {it.description.length > 160 ? it.description.slice(0, 160) + "…" : it.description}
                  </div>
                )}
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Qty {it.quantity} · {formatMoney(it.unitPrice as never, currency)} ea
                  {it.producedAt && (
                    <>
                      {" · "}
                      <span style={{ color: "#10b981" }}>✓ produced</span>
                    </>
                  )}
                </div>
              </div>
              <div
                className="shrink-0 text-right text-sm font-medium tabular-nums"
                style={{ color: "var(--text-default)" }}
              >
                {formatMoney(it.lineTotal as never, currency)}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Customer + notes side-by-side if notes exist */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Customer" />
          <div className="space-y-1 px-5 py-4 text-sm">
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              <Link href={`/t/${slug}/customers/${order.customer.id}`} className="underline">
                {order.customer.name}
              </Link>
            </div>
            {order.customer.email && (
              <div style={{ color: "var(--text-muted)" }}>{order.customer.email}</div>
            )}
            {order.customer.phone && (
              <div style={{ color: "var(--text-muted)" }}>{order.customer.phone}</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Notes" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm" style={{ color: order.notes ? "var(--text-default)" : "var(--text-muted)" }}>
            {order.notes ?? "No notes on this order."}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------- Production tab ---------- */

function ProductionTab({
  slug,
  order,
  activeBlockers,
  canManage,
  memberMap,
}: {
  slug: string;
  order: OrderPanelOrder;
  activeBlockers: OrderPanelOrder["blockers"];
  canManage: boolean;
  memberMap: Map<string, { name: string }>;
}) {
  const producedCount = order.items.filter((i) => i.producedAt).length;
  const resolvedBlockers = order.blockers.filter((b) => b.resolvedAt);
  return (
    <>
      <Card>
        <CardHeader
          title="Progress"
          description={`${producedCount}/${order.items.length} items produced`}
        />
        <div className="px-5 py-4">
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full"
              style={{
                width: `${order.items.length > 0 ? (producedCount / order.items.length) * 100 : 0}%`,
                background: "var(--accent-primary)",
                transition: "width 200ms ease",
              }}
            />
          </div>
          <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
            Detailed production stages (schedule, defects, materials) live in the{" "}
            <Link href={`/t/${slug}/orders/${order.id}`} className="underline">
              full order view
            </Link>
            .
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Blockers"
          description={
            activeBlockers.length > 0
              ? `${activeBlockers.length} active · production gated until cleared`
              : "No active blockers."
          }
        />
        <ul>
          {activeBlockers.length === 0 && (
            <li className="px-5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing blocking this order.
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
                  <div className="font-medium" style={{ color: "var(--text-default)" }}>
                    {blockerReasonLabel(b.reason as never)}
                  </div>
                  {b.notes && (
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {b.notes}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    added {formatDateTime(b.createdAt)}
                    {memberMap.get(b.blockedBy) && <> by {memberMap.get(b.blockedBy)!.name}</>}
                  </div>
                </div>
                {canManage && (
                  <form action={resolve}>
                    <Button type="submit" variant="secondary">Resolve</Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        {canManage && (
          <form
            action={addOrderBlocker.bind(null, slug, order.id)}
            className="grid grid-cols-[1fr_2fr_auto] gap-2 px-5 py-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <select
              name="reason"
              defaultValue="AWAITING_CUSTOMER"
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              {BLOCKER_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <input
              name="notes"
              placeholder="Note (optional)"
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            />
            <Button type="submit" variant="secondary">Add blocker</Button>
          </form>
        )}

        {resolvedBlockers.length > 0 && (
          <details className="px-5 py-3 text-xs" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <summary className="cursor-pointer" style={{ color: "var(--text-muted)" }}>
              {resolvedBlockers.length} resolved
            </summary>
            <ul className="mt-2 space-y-1">
              {resolvedBlockers.slice(0, 10).map((b) => (
                <li key={b.id} style={{ color: "var(--text-muted)" }}>
                  {blockerReasonLabel(b.reason as never)} — resolved{" "}
                  {b.resolvedAt ? formatDateTime(b.resolvedAt) : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </>
  );
}

/* ---------- Invoicing tab ---------- */

function InvoicingTab({
  slug,
  currency,
  order,
  canInvoice,
}: {
  slug: string;
  currency: string;
  order: OrderPanelOrder;
  canInvoice: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Invoices"
        description={`${order.invoices.length} tied to this order`}
        right={
          canInvoice ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=DEPOSIT`}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                + Deposit
              </Link>
              <Link
                href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=STANDARD`}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                + Full
              </Link>
              <Link
                href={`/t/${slug}/invoices/new?customerId=${order.customer.id}&orderId=${order.id}&kind=BALANCE`}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                + Balance
              </Link>
            </div>
          ) : undefined
        }
      />
      <ul>
        {order.invoices.length === 0 && (
          <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No invoices yet.
          </li>
        )}
        {order.invoices.map((inv) => {
          const bal = outstandingBalance(inv as never);
          return (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-3 px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Link
                  href={`/t/${slug}/invoices/${inv.id}`}
                  className="text-sm font-medium underline"
                  style={{ color: "var(--text-default)" }}
                >
                  {inv.number}
                </Link>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: invoiceStatusColor(inv.status as never), color: "white" }}
                >
                  {invoiceStatusLabel(inv.status as never)}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {humanize(inv.kind)}
                </span>
                {inv.dueDate && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    due {formatDate(inv.dueDate)}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-right text-sm">
                <div className="font-medium tabular-nums" style={{ color: "var(--text-default)" }}>
                  {formatMoney(inv.total as never, currency)}
                </div>
                {bal > 0 && (
                  <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {formatMoney(bal, currency)} due
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Activity tab ---------- */

function ActivityTab({
  activity,
  memberMap,
}: {
  activity: OrderPanelActivity[];
  memberMap: Map<string, { name: string }>;
}) {
  return (
    <Card>
      <CardHeader
        title="Activity"
        description={`${activity.length} recent event${activity.length === 1 ? "" : "s"}`}
      />
      <ul>
        {activity.length === 0 && (
          <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No activity recorded.
          </li>
        )}
        {activity.map((a) => {
          const who = a.userId ? memberMap.get(a.userId)?.name ?? "Unknown" : "System";
          return (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 px-5 py-2.5 text-xs"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex-1">
                <span className="font-medium" style={{ color: "var(--text-default)" }}>
                  {humanize(a.action)}
                </span>
                <span style={{ color: "var(--text-muted)" }}> · {who}</span>
              </div>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                {formatDateTime(a.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * Helper used by the orders page to fetch a single order + activity log for
 * the panel. Kept here so the page file stays focused on list concerns.
 */
export async function loadOrderForPanel(tenantId: string, orderId: string) {
  const [order, activity] = await Promise.all([
    db.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        quote:    { select: { id: true, number: true, status: true } },
        items:    { orderBy: { sortOrder: "asc" } },
        invoices: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, number: true, status: true, total: true,
            amountPaid: true, refundedAmount: true, writtenOffAmount: true,
            dueDate: true, kind: true,
          },
        },
        blockers: { orderBy: { createdAt: "desc" } },
        comments: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    }),
    db.auditLog.findMany({
      where: { tenantId, entityType: "Order", entityId: orderId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, userId: true, createdAt: true, metadata: true },
    }),
  ]);
  return { order, activity };
}
