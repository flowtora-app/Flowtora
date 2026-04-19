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
  const serialized = ids.join(",");

  const sendReminders = async () => {
    if (!confirm(`Send reminder emails for ${ids.length} invoices?`)) return;
    const fd = new FormData();
    fd.set("ids", serialized);
    await bulkSendInvoiceReminders(slug, fd);
    onAfter();
  };

  const setStatus = async (status: "VOID" | "DRAFT") => {
    if (status === "VOID" && !confirm(`Void ${ids.length} invoices?`)) return;
    const fd = new FormData();
    fd.set("ids", serialized);
    fd.set("status", status);
    await bulkChangeInvoiceStatus(slug, fd);
    onAfter();
  };

  return (
    <>
      <BulkButton onClick={sendReminders}>Send reminders</BulkButton>
      <BulkButton onClick={() => setStatus("DRAFT")}>Back to draft</BulkButton>
      <BulkButton onClick={() => setStatus("VOID")} destructive>
        Void
      </BulkButton>
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
