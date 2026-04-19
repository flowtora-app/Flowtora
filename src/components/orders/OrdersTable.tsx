"use client";

import * as React from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import {
  bulkChangeOrderPriority,
  bulkCancelOrders,
  updateOrderPriority,
  changeOrderStatus,
} from "@/app/actions/orders";

export type OrdersTableRow = {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  priority: "NORMAL" | "HIGH" | "RUSH";
  priorityColor: string;
  priorityLabel: string;
  blockerCount: number;
  blockerHint: string | null;
  depositOwedLabel: string | null;
  customerId: string;
  customerName: string;
  dueLabel: string | null;
  overdue: boolean;
  productionManagerName: string | null;
  installerName: string | null;
  itemsCount: number;
  total: string;
  // Possible next statuses for the inline status flip. Empty when the row
  // is terminal (COMPLETED). Includes the current status so the dropdown
  // renders as a "no-op" picker when there are no valid transitions.
  nextStatuses: Array<{ value: string; label: string }>;
};

interface OrdersTableProps {
  slug: string;
  rows: OrdersTableRow[];
  empty: React.ReactNode;
  canEdit: boolean;
}

export function OrdersTable({ slug, rows, empty, canEdit }: OrdersTableProps) {
  const columns: DataTableColumn<OrdersTableRow>[] = [
    {
      key: "number",
      header: "Number",
      cell: (o) => (
        <div className="flex items-center gap-2">
          <span className="font-medium" style={{ color: "var(--text-default)" }}>
            {o.number}
          </span>
          {o.priority !== "NORMAL" && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: o.priorityColor, color: "white" }}
              title={`Priority: ${o.priorityLabel}`}
            >
              {o.priority === "RUSH" ? "⚡ RUSH" : "HIGH"}
            </span>
          )}
          {o.blockerCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--danger-fg)", color: "white" }}
              title={o.blockerHint ? `Blocked: ${o.blockerHint}` : "Blocked"}
            >
              ⏸ {o.blockerCount > 1 ? `${o.blockerCount} blockers` : "Blocked"}
            </span>
          )}
          {o.depositOwedLabel && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--danger-fg)", color: "white" }}
              title="Deposit must be paid before production can start"
            >
              💰 Deposit {o.depositOwedLabel}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (o) => (
        <Link
          href={`/t/${slug}/customers/${o.customerId}`}
          onClick={(e) => e.stopPropagation()}
          className="underline"
          style={{ color: "var(--text-muted)" }}
        >
          {o.customerName}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (o) =>
        canEdit && o.nextStatuses.length > 1 ? (
          <InlineStatusSelect slug={slug} order={o} />
        ) : (
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: o.statusColor, color: "white" }}
          >
            {o.statusLabel}
          </span>
        ),
    },
    {
      key: "due",
      header: "Due",
      hideBelow: "md",
      cell: (o) => (
        <span
          style={{
            color: o.overdue ? "var(--danger-fg)" : "var(--text-muted)",
            fontWeight: o.overdue ? 600 : undefined,
          }}
        >
          {o.dueLabel ?? "—"}
          {o.overdue && <span className="ml-1.5 text-xs">· overdue</span>}
        </span>
      ),
    },
    {
      key: "production",
      header: "Production",
      hideBelow: "lg",
      cell: (o) => (
        <span style={{ color: "var(--text-muted)" }}>
          {o.productionManagerName ?? "—"}
        </span>
      ),
    },
    {
      key: "installer",
      header: "Installer",
      hideBelow: "lg",
      cell: (o) => (
        <span style={{ color: "var(--text-muted)" }}>{o.installerName ?? "—"}</span>
      ),
    },
    {
      key: "items",
      header: "Items",
      hideBelow: "md",
      cell: (o) => <span style={{ color: "var(--text-muted)" }}>{o.itemsCount}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (o) => <span className="font-medium">{o.total}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowHref={(o) => `/t/${slug}/orders/${o.id}`}
      empty={empty}
      selectable={canEdit}
      densityKey="orders"
      bulkActions={canEdit ? (ids, clear) => (
        <OrderBulkBar slug={slug} ids={ids} onAfter={clear} />
      ) : undefined}
      rowActions={
        canEdit
          ? (o) => [
              { label: "Open order", href: `/t/${slug}/orders/${o.id}` },
              { label: "Customer", href: `/t/${slug}/customers/${o.customerId}` },
              { type: "separator" as const },
              {
                label: "Mark rush",
                disabled: o.priority === "RUSH",
                form: inlinePriorityForm(slug, o.id, "RUSH"),
              },
              {
                label: "Mark high priority",
                disabled: o.priority === "HIGH",
                form: inlinePriorityForm(slug, o.id, "HIGH"),
              },
              {
                label: "Normal priority",
                disabled: o.priority === "NORMAL",
                form: inlinePriorityForm(slug, o.id, "NORMAL"),
              },
            ]
          : undefined
      }
    />
  );
}

function inlinePriorityForm(slug: string, orderId: string, priority: "NORMAL" | "HIGH" | "RUSH") {
  return (
    <form action={updateOrderPriority.bind(null, slug, orderId)}>
      <input type="hidden" name="priority" value={priority} />
      <button
        type="submit"
        className="w-full px-3 py-2 text-left text-sm"
        style={{ color: "var(--text-default)" }}
      >
        {priority === "RUSH" ? "Mark rush" : priority === "HIGH" ? "Mark high priority" : "Normal priority"}
      </button>
    </form>
  );
}

// Inline status selector — renders a tiny pill-style <select> that fires
// changeOrderStatus on change. Onchange submits the hidden form so the
// row doesn't need a separate "save" click. Only renders when there's
// at least one legal transition.
function InlineStatusSelect({
  slug,
  order,
}: {
  slug: string;
  order: OrdersTableRow;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      ref={formRef}
      action={changeOrderStatus.bind(null, slug, order.id)}
      onClick={(e) => e.stopPropagation()}
      className="inline-block"
    >
      <select
        name="status"
        defaultValue={order.status}
        disabled={pending}
        onChange={(e) => {
          // Only fire the server action when the chosen status actually
          // differs from the current one — avoids a needless round-trip
          // when a user accidentally clicks the same option.
          if (e.target.value === order.status) return;
          startTransition(() => formRef.current?.requestSubmit());
        }}
        className="ts-focus cursor-pointer appearance-none rounded-full px-2 py-0.5 pr-6 text-xs font-medium"
        style={{
          background: order.statusColor,
          color: "white",
          border: "none",
          // Custom chevron so the browser default doesn't clash with the
          // colored pill background.
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 4l3 3 3-3' stroke='white' stroke-width='1.4' fill='none' stroke-linecap='round'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 6px center",
          opacity: pending ? 0.6 : 1,
        }}
        aria-label="Change order status"
      >
        {order.nextStatuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </form>
  );
}

function OrderBulkBar({
  slug,
  ids,
  onAfter,
}: {
  slug: string;
  ids: string[];
  onAfter: () => void;
}) {
  const serialized = ids.join(",");
  const setPriority = async (priority: "NORMAL" | "HIGH" | "RUSH") => {
    const fd = new FormData();
    fd.set("ids", serialized);
    fd.set("priority", priority);
    await bulkChangeOrderPriority(slug, fd);
    onAfter();
  };
  const cancel = async () => {
    if (!confirm(`Cancel ${ids.length} orders?`)) return;
    const fd = new FormData();
    fd.set("ids", serialized);
    fd.set("status", "CANCELED");
    await bulkCancelOrders(slug, fd);
    onAfter();
  };
  return (
    <>
      <BulkButton onClick={() => setPriority("RUSH")}>Mark rush</BulkButton>
      <BulkButton onClick={() => setPriority("HIGH")}>Mark high</BulkButton>
      <BulkButton onClick={() => setPriority("NORMAL")}>Normal</BulkButton>
      <BulkButton onClick={cancel} destructive>Cancel orders</BulkButton>
    </>
  );
}

function BulkButton({
  onClick,
  children,
  destructive,
}: {
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-110"
      style={{
        background: "var(--surface-0)",
        border: `1px solid ${
          destructive ? "var(--danger-fg)" : "var(--border-default)"
        }`,
        color: destructive ? "var(--danger-fg)" : "var(--text-default)",
      }}
    >
      {children}
    </button>
  );
}
