"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Premium-redesign order row used by the split-view Orders list.
// Same visual treatment as the redesigned Quote + Invoice rows with
// order-specific details (priority, due date, blockers, deposit owed).

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

export function OrderListRow({ row, selected }: OrderListRowProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const onActivate = React.useCallback(() => {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", row.id);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, sp, row.id]);

  const initial = (row.customerName ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <button
      type="button"
      onClick={onActivate}
      data-entity-id={row.id}
      className="ts-focus group/row relative block w-full text-left outline-none transition-colors"
      style={{
        background: selected
          ? "linear-gradient(90deg, var(--accent-surface) 0%, color-mix(in oklab, var(--accent-surface) 30%, transparent) 75%, transparent 100%)"
          : "transparent",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "11px 16px",
      }}
      aria-pressed={selected}
    >
      {selected && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 3,
            top: 9,
            bottom: 9,
            width: 2.5,
            borderRadius: 999,
            background: "var(--accent-primary)",
            boxShadow:
              "0 0 0 0.5px var(--accent-primary), 0 0 8px color-mix(in oklab, var(--accent-primary) 50%, transparent)",
          }}
        />
      )}
      {!selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/row:opacity-100"
          style={{ background: "color-mix(in oklab, var(--surface-3) 50%, transparent)" }}
        />
      )}

      <div className="relative flex items-center gap-3">
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border:
              "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
            fontSize: 11.5,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                color: selected ? "var(--accent-primary)" : "var(--text-default)",
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {row.number}
            </span>
            <Pill label={row.statusLabel} accent={row.statusColor} />
            {row.priority !== "NORMAL" && (
              <Pill
                label={row.priority === "RUSH" ? "⚡ Rush" : "High"}
                accent={row.priorityColor}
                solid
              />
            )}
          </div>
          <div
            className="mt-1 flex items-center gap-1.5 truncate"
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}
          >
            <span className="truncate">{row.customerName}</span>
            {row.dueLabel && (
              <>
                <span style={{ color: "var(--text-faint)" }}>·</span>
                <span
                  style={{
                    color: row.overdue
                      ? "var(--danger-fg, var(--rose-500))"
                      : "var(--text-muted)",
                    fontFeatureSettings: "'tnum' 1",
                  }}
                  title={row.overdue ? "Past due" : "Due date"}
                >
                  {row.overdue ? "⚠ " : ""}due {row.dueLabel}
                </span>
              </>
            )}
          </div>
          {(row.blockerCount > 0 || row.depositOwedLabel) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {row.blockerCount > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--danger-fg, var(--rose-500))",
                    background:
                      "color-mix(in oklab, var(--rose-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                    padding: "2px 7px",
                    borderRadius: 999,
                    lineHeight: 1,
                  }}
                  title={row.blockerHint ?? "Blocked"}
                >
                  <span aria-hidden>⏸</span>
                  {row.blockerCount > 1 ? `${row.blockerCount} blockers` : "Blocked"}
                </span>
              )}
              {row.depositOwedLabel && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--warning-fg, var(--amber-500))",
                    background:
                      "color-mix(in oklab, var(--amber-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--amber-500) 30%, transparent)",
                    padding: "2px 7px",
                    borderRadius: 999,
                    lineHeight: 1,
                    fontFeatureSettings: "'tnum' 1",
                  }}
                  title="Deposit must be paid before production starts"
                >
                  Deposit {row.depositOwedLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-default)",
            fontFeatureSettings: "'tnum' 1",
            letterSpacing: "-0.005em",
            flexShrink: 0,
          }}
        >
          {row.total}
        </span>
      </div>
    </button>
  );
}

function Pill({ label, accent, solid }: { label: string; accent: string; solid?: boolean }) {
  if (solid) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "2px 6px",
          borderRadius: 999,
          color: "white",
          background: accent,
          border: `1px solid color-mix(in oklab, ${accent} 60%, black 40%)`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 999,
        color: accent,
        background: `color-mix(in oklab, ${accent} 16%, transparent)`,
        border: `1px solid color-mix(in oklab, ${accent} 32%, transparent)`,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 4,
          height: 4,
          borderRadius: 999,
          background: accent,
          boxShadow: `0 0 0 1.5px color-mix(in oklab, ${accent} 25%, transparent)`,
        }}
      />
      {label}
    </span>
  );
}
