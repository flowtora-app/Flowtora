"use client";

import * as React from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import {
  bulkChangeInvoiceStatus,
  bulkSendInvoiceReminders,
} from "@/app/actions/invoices";

export type InvoicesTableRow = {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  agingLabel: string | null;
  agingColor: string | null;
  isOverdue: boolean;
  daysPastDue: number;
  customerId: string;
  customerName: string;
  issuedLabel: string | null;
  dueLabel: string | null;
  orderId: string | null;
  orderNumber: string | null;
  balance: string;
  total: string;
};

interface InvoicesTableProps {
  slug: string;
  rows: InvoicesTableRow[];
  empty: React.ReactNode;
  canEdit: boolean;
}

export function InvoicesTable({ slug, rows, empty, canEdit }: InvoicesTableProps) {
  const columns: DataTableColumn<InvoicesTableRow>[] = [
    {
      key: "number",
      header: "Number",
      cell: (inv) => (
        <span className="font-medium" style={{ color: "var(--text-default)" }}>
          {inv.number}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (inv) => (
        <Link
          href={`/t/${slug}/customers/${inv.customerId}`}
          onClick={(e) => e.stopPropagation()}
          className="underline"
          style={{ color: "var(--text-muted)" }}
        >
          {inv.customerName}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (inv) => (
        <div className="flex flex-wrap items-center gap-1">
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: inv.statusColor, color: "white" }}
          >
            {inv.statusLabel}
          </span>
          {inv.isOverdue && inv.agingLabel && inv.agingColor && (
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: inv.agingColor, color: "white" }}
              title={`${inv.daysPastDue} days past due`}
            >
              {inv.agingLabel}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "issued",
      header: "Issued",
      hideBelow: "md",
      cell: (inv) => (
        <span style={{ color: "var(--text-muted)" }}>{inv.issuedLabel ?? "—"}</span>
      ),
    },
    {
      key: "due",
      header: "Due",
      hideBelow: "md",
      cell: (inv) => (
        <span
          style={{
            color: inv.isOverdue ? "var(--danger-fg)" : "var(--text-muted)",
            fontWeight: inv.isOverdue ? 600 : undefined,
          }}
        >
          {inv.dueLabel ?? "—"}
          {inv.isOverdue && (
            <span className="ml-1 text-xs">({inv.daysPastDue}d)</span>
          )}
        </span>
      ),
    },
    {
      key: "order",
      header: "Order",
      hideBelow: "lg",
      cell: (inv) =>
        inv.orderId ? (
          <Link
            href={`/t/${slug}/orders/${inv.orderId}`}
            onClick={(e) => e.stopPropagation()}
            className="underline"
            style={{ color: "var(--text-muted)" }}
          >
            {inv.orderNumber}
          </Link>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      cell: (inv) => <span>{inv.balance}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (inv) => <span className="font-medium">{inv.total}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowHref={(inv) => `/t/${slug}/invoices/${inv.id}`}
      empty={empty}
      selectable={canEdit}
      densityKey="invoices"
      bulkActions={canEdit ? (ids, clear) => (
        <InvoiceBulkBar slug={slug} ids={ids} onAfter={clear} />
      ) : undefined}
      rowActions={
        canEdit
          ? (inv) => [
              { label: "Open invoice", href: `/t/${slug}/invoices/${inv.id}` },
              { label: "Customer", href: `/t/${slug}/customers/${inv.customerId}` },
              ...(inv.orderId
                ? [{ label: "Parent order", href: `/t/${slug}/orders/${inv.orderId}` }]
                : []),
            ]
          : undefined
      }
    />
  );
}

function InvoiceBulkBar({
  slug,
  ids,
  onAfter,
}: {
  slug: string;
  ids: string[];
  onAfter: () => void;
}) {
  const [pendingAction, setPendingAction] = React.useState<string | null>(null);
  const isPending = pendingAction !== null;
  const serialized = ids.join(",");

  const run = async (key: string, work: () => Promise<void>) => {
    if (isPending) return;
    setPendingAction(key);
    try { await work(); onAfter(); } finally { setPendingAction(null); }
  };

  const sendReminders = () => {
    if (!confirm(`Send reminder emails for ${ids.length} invoices?`)) return;
    return run("reminders", async () => {
      const fd = new FormData();
      fd.set("ids", serialized);
      await bulkSendInvoiceReminders(slug, fd);
    });
  };

  const setStatus = (status: "VOID" | "DRAFT") => {
    if (status === "VOID" && !confirm(`Void ${ids.length} invoices?`)) return;
    return run(`status:${status}`, async () => {
      const fd = new FormData();
      fd.set("ids", serialized);
      fd.set("status", status);
      await bulkChangeInvoiceStatus(slug, fd);
    });
  };

  return (
    <>
      <BulkButton onClick={sendReminders} loading={pendingAction === "reminders"} disabled={isPending}>Send reminders</BulkButton>
      <BulkButton onClick={() => setStatus("DRAFT")} loading={pendingAction === "status:DRAFT"} disabled={isPending}>Back to draft</BulkButton>
      <BulkButton onClick={() => setStatus("VOID")} loading={pendingAction === "status:VOID"} disabled={isPending} destructive>
        Void
      </BulkButton>
    </>
  );
}

function BulkButton({
  onClick,
  children,
  destructive,
  loading,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const isInactive = loading || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isInactive}
      aria-busy={loading || undefined}
      className="ts-focus relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-110"
      style={{
        background: "var(--surface-0)",
        border: `1px solid ${
          destructive ? "var(--danger-fg)" : "var(--border-default)"
        }`,
        color: destructive ? "var(--danger-fg)" : "var(--text-default)",
        cursor: isInactive ? "not-allowed" : "pointer",
        opacity: isInactive ? 0.6 : 1,
      }}
    >
      {loading && (
        <span className="absolute inset-0 inline-flex items-center justify-center" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="animate-spin">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
      )}
      <span style={{ visibility: loading ? "hidden" : "visible" }}>{children}</span>
    </button>
  );
}
