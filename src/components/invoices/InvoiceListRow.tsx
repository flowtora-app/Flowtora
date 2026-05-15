"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Premium-redesign invoice row used by the split-view Invoices list.
// Same visual treatment as the redesigned QuoteListRow with invoice-
// specific details (kind, due date, aging bucket, outstanding balance).

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
            {row.agingLabel && (
              <Pill
                label={row.agingLabel}
                accent={row.agingColor ?? "var(--danger-fg, var(--rose-500))"}
                solid
              />
            )}
            {row.kindLabel && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 5px",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {row.kindLabel}
              </span>
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
                    color: row.isOverdue
                      ? "var(--danger-fg, var(--rose-500))"
                      : "var(--text-muted)",
                    fontFeatureSettings: "'tnum' 1",
                  }}
                  title={row.isOverdue ? "Past due" : "Due date"}
                >
                  {row.isOverdue ? "⚠ " : ""}due {row.dueLabel}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-default)",
              fontFeatureSettings: "'tnum' 1",
              letterSpacing: "-0.005em",
            }}
          >
            {row.total}
          </span>
          {row.hasBalance && (
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
                padding: "2px 6px",
                borderRadius: 999,
                lineHeight: 1,
                fontFeatureSettings: "'tnum' 1",
              }}
              title="Outstanding balance"
            >
              {row.balance} due
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Tinted status pill — accent dot + tone-coded text/border. */
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
