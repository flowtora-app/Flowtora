"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type InvoiceListRowData = {
  id: string;
  number: string;
  customerName: string;
  statusLabel: string;
  statusColor: string;
  kindLabel: string | null;
  dueLabel: string | null;
  agingLabel: string | null;
  agingColor: string | null;
  isOverdue: boolean;
  total: string;
  balance: string;
  hasBalance: boolean;
};

interface InvoiceListRowProps {
  row: InvoiceListRowData;
  selected: boolean;
}

export function InvoiceListRow({ row, selected }: InvoiceListRowProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const onActivate = React.useCallback(() => {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", row.id);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, sp, row.id]);

  return (
    <button
      type="button"
      onClick={onActivate}
      data-entity-id={row.id}
      className="block w-full text-left transition-colors outline-none"
      style={{
        background: selected ? "var(--accent-surface)" : "transparent",
        borderBottom: "1px solid var(--border-subtle)",
        borderLeft: selected
          ? "3px solid var(--accent-primary)"
          : "3px solid transparent",
        padding: "10px 16px 10px 13px",
      }}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: selected ? "var(--accent-primary)" : "var(--text-default)" }}
          >
            {row.number}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: row.statusColor, color: "white" }}
          >
            {row.statusLabel}
          </span>
          {row.agingLabel && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: row.agingColor ?? "var(--danger-fg)", color: "white" }}
              title="Past due bucket"
            >
              {row.agingLabel}
            </span>
          )}
        </div>
        <span
          className="shrink-0 text-sm font-semibold tabular-nums"
          style={{ color: "var(--text-default)" }}
        >
          {row.total}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {row.customerName}
          {row.kindLabel && (
            <>
              {" · "}
              <span style={{ color: "var(--text-faint)" }}>{row.kindLabel}</span>
            </>
          )}
        </span>
        {row.dueLabel && (
          <span
            className="shrink-0 text-xs tabular-nums"
            style={{ color: row.isOverdue ? "var(--danger-fg)" : "var(--text-muted)" }}
            title={row.isOverdue ? "Past due" : "Due date"}
          >
            {row.isOverdue ? "⚠ " : ""}
            due {row.dueLabel}
          </span>
        )}
      </div>
      {row.hasBalance && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--danger-fg)", color: "white" }}
            title="Outstanding balance"
          >
            💰 {row.balance} due
          </span>
        </div>
      )}
    </button>
  );
}
