"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type OrderListRowData = {
  id: string;
  number: string;
  customerName: string;
  statusLabel: string;
  statusColor: string;
  priority: "NORMAL" | "HIGH" | "RUSH";
  priorityColor: string;
  dueLabel: string | null;
  overdue: boolean;
  total: string;
  blockerCount: number;
  blockerHint: string | null;
  depositOwedLabel: string | null;
};

interface OrderListRowProps {
  row: OrderListRowData;
  selected: boolean;
}

/**
 * Single row in the split-view order list. Clicking pushes `?selected=<id>`
 * which re-renders the page with the detail panel focused on this order.
 * We `router.push` with scroll:false so the list doesn't jump.
 */
export function OrderListRow({ row, selected }: OrderListRowProps) {
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
      data-order-id={row.id}
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
          {row.priority !== "NORMAL" && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: row.priorityColor, color: "white" }}
              title={`Priority: ${row.priority}`}
            >
              {row.priority === "RUSH" ? "⚡" : "!"}
            </span>
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
          {row.total}
        </span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {row.customerName}
        </span>
        {row.dueLabel && (
          <span
            className="shrink-0 text-xs tabular-nums"
            style={{ color: row.overdue ? "var(--danger-fg)" : "var(--text-muted)" }}
            title={row.overdue ? "Past due" : "Due date"}
          >
            {row.overdue ? "⚠ " : ""}
            {row.dueLabel}
          </span>
        )}
      </div>
      {(row.blockerCount > 0 || row.depositOwedLabel) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {row.blockerCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--danger-fg)", color: "white" }}
              title={row.blockerHint ?? "Blocked"}
            >
              ⏸ {row.blockerCount > 1 ? `${row.blockerCount} blockers` : "Blocked"}
            </span>
          )}
          {row.depositOwedLabel && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--danger-fg)", color: "white" }}
              title="Deposit must be paid before production starts"
            >
              💰 {row.depositOwedLabel}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
