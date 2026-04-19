"use client";

import * as React from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { bulkChangeQuoteStatus, deleteQuote } from "@/app/actions/quotes";

export type QuotesTableRow = {
  id: string;
  number: string;
  status: string;
  statusLabel: string;
  statusColor: string;
  customerId: string;
  customerName: string;
  salesRepName: string | null;
  ageLabel: string | null;
  ageColor: string | null;
  expiresLabel: string | null;
  expiringSoon: boolean;
  superseded: boolean;
  total: string;
  canDelete: boolean;
};

interface QuotesTableProps {
  slug: string;
  rows: QuotesTableRow[];
  empty: React.ReactNode;
  canEdit: boolean;
}

export function QuotesTable({ slug, rows, empty, canEdit }: QuotesTableProps) {
  const columns: DataTableColumn<QuotesTableRow>[] = [
    {
      key: "number",
      header: "Number",
      cell: (q) => (
        <div className="flex items-center gap-2">
          <span className="font-medium" style={{ color: "var(--text-default)" }}>
            {q.number}
          </span>
          {q.superseded && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px]"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Superseded
            </span>
          )}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (q) => (
        <Link
          href={`/t/${slug}/customers/${q.customerId}`}
          onClick={(e) => e.stopPropagation()}
          className="underline"
          style={{ color: "var(--text-muted)" }}
        >
          {q.customerName}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (q) => (
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: q.statusColor, color: "white" }}
        >
          {q.statusLabel}
        </span>
      ),
    },
    {
      key: "rep",
      header: "Sales rep",
      hideBelow: "md",
      cell: (q) => (
        <span style={{ color: "var(--text-muted)" }}>{q.salesRepName ?? "—"}</span>
      ),
    },
    {
      key: "age",
      header: "Age",
      hideBelow: "md",
      cell: (q) =>
        q.ageLabel && q.ageColor ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: q.ageColor, color: "white" }}
          >
            {q.ageLabel}
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ),
    },
    {
      key: "expires",
      header: "Expires",
      hideBelow: "lg",
      cell: (q) => (
        <span
          style={{
            color: q.expiringSoon ? "var(--warning-fg)" : "var(--text-muted)",
            fontWeight: q.expiringSoon ? 600 : undefined,
          }}
        >
          {q.expiresLabel ?? "—"}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (q) => <span className="font-medium">{q.total}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowHref={(q) => `/t/${slug}/quotes/${q.id}`}
      empty={empty}
      selectable={canEdit}
      densityKey="quotes"
      bulkActions={canEdit ? (ids, clear) => (
        <QuoteBulkBar slug={slug} ids={ids} onAfter={clear} />
      ) : undefined}
      rowActions={
        canEdit
          ? (q) => [
              { label: "Open", href: `/t/${slug}/quotes/${q.id}` },
              { label: "Customer", href: `/t/${slug}/customers/${q.customerId}` },
              { type: "separator" as const },
              {
                label: "Delete quote",
                destructive: true,
                disabled: !q.canDelete,
                form: (
                  <form
                    action={deleteQuote.bind(null, slug, q.id)}
                    onSubmit={(e) => {
                      if (!confirm("Delete this quote? This can't be undone.")) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <button
                      type="submit"
                      className="w-full px-3 py-2 text-left text-sm"
                      style={{ color: "var(--danger-fg)" }}
                    >
                      Delete quote
                    </button>
                  </form>
                ),
              },
            ]
          : undefined
      }
    />
  );
}

function QuoteBulkBar({
  slug,
  ids,
  onAfter,
}: {
  slug: string;
  ids: string[];
  onAfter: () => void;
}) {
  const serialized = ids.join(",");
  const setStatus = async (status: "DECLINED" | "EXPIRED" | "DRAFT") => {
    const fd = new FormData();
    fd.set("ids", serialized);
    fd.set("status", status);
    await bulkChangeQuoteStatus(slug, fd);
    onAfter();
  };
  return (
    <>
      <BulkButton onClick={() => setStatus("DRAFT")}>Back to draft</BulkButton>
      <BulkButton onClick={() => setStatus("EXPIRED")}>Mark expired</BulkButton>
      <BulkButton onClick={() => setStatus("DECLINED")} destructive>
        Mark declined
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
