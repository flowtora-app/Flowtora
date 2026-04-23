"use client";

import * as React from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import type { DropdownItem } from "@/components/ui/DropdownMenu";
import { bulkChangeQuoteStatus, deleteQuote, duplicateQuote } from "@/app/actions/quotes";
import { QuotePreviewDrawer } from "./QuotePreviewDrawer";

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
  // Drawer preview state. `activeId` drives the drawer; `activeRow` stays
  // in sync so the header band renders instantly without waiting for the
  // lazy getQuotePreview() call.
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeRow = React.useMemo(
    () => rows.find((r) => r.id === activeId) ?? null,
    [rows, activeId],
  );

  // If the active quote disappears from the list (filter change, delete),
  // close the drawer rather than stranding it on a stale header.
  React.useEffect(() => {
    if (activeId && !rows.some((r) => r.id === activeId)) {
      setActiveId(null);
    }
  }, [rows, activeId]);

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
    <>
      <DataTable
        rows={rows}
        columns={columns}
        onRowClick={(q) => setActiveId(q.id)}
        isRowActive={(q) => q.id === activeId}
        empty={empty}
        selectable={canEdit}
        densityKey="quotes"
        bulkActions={canEdit ? (ids, clear) => (
          <QuoteBulkBar slug={slug} ids={ids} onAfter={clear} />
        ) : undefined}
        rowActions={(q) => {
          const items: DropdownItem[] = [
            { label: "Preview", onClick: () => setActiveId(q.id) },
            { label: "Open full page", href: `/t/${slug}/quotes/${q.id}` },
            {
              label: "View customer",
              href: `/t/${slug}/customers/${q.customerId}`,
            },
          ];
          if (canEdit) {
            items.push({ type: "separator" });
            items.push({
              label: "Duplicate quote",
              form: (
                <form action={duplicateQuote.bind(null, slug, q.id)}>
                  <button
                    type="submit"
                    className="w-full px-3 py-2 text-left text-sm"
                    style={{ color: "var(--text-default)" }}
                  >
                    Duplicate quote
                  </button>
                </form>
              ),
            });
            items.push({
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
            });
          }
          return items;
        }}
      />

      <QuotePreviewDrawer
        slug={slug}
        quoteId={activeId}
        canEdit={canEdit}
        onClose={() => setActiveId(null)}
        header={
          activeRow
            ? {
                number: activeRow.number,
                statusLabel: activeRow.statusLabel,
                statusColor: activeRow.statusColor,
                customerName: activeRow.customerName,
                total: activeRow.total,
              }
            : null
        }
      />
    </>
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
