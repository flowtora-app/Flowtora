"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Premium-redesign quote row used by the split-view Quotes list.
//
// Visual upgrades over the original row:
//   • Customer initial avatar with accent ring
//   • Refined status pill with bg-tint + text-tone + matching border
//   • Active row: gradient bg fade-out + 2.5px glowing accent left-bar
//     with rounded cap (matches the sidebar's active treatment)
//   • Hover lift telegraphed by background + subtle ring
//   • Tighter typography rhythm, tabular numerals for amount/age
//   • Expiring-soon and superseded chips refined to the new chip style

export type QuoteListRowData = {
  id: string;
  number: string;
  customerName: string;
  statusLabel: string;
  /** Existing helper returns a hex color used as the pill bg. We treat
   *  it as the *accent* for the new tinted pill so callers don't have
   *  to change. */
  statusColor: string;
  total: string;
  ageLabel: string | null;
  ageColor: string | null;
  expiresLabel: string | null;
  expiringSoon: boolean;
  superseded: boolean;
};

interface QuoteListRowProps {
  row: QuoteListRowData;
  selected: boolean;
}

export function QuoteListRow({ row, selected }: QuoteListRowProps) {
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
        padding: "11px 16px 11px 16px",
        opacity: row.superseded ? 0.55 : 1,
      }}
      aria-pressed={selected}
    >
      {/* Active glowing left-bar — sits inside the row, rounded cap. */}
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

      {/* Hover-only background lift for non-selected rows. */}
      {!selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/row:opacity-100"
          style={{ background: "color-mix(in oklab, var(--surface-3) 50%, transparent)" }}
        />
      )}

      <div className="relative flex items-center gap-3">
        {/* Customer avatar — accent-ringed initial. */}
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
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
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
            <StatusPill label={row.statusLabel} accent={row.statusColor} />
            {row.superseded && (
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "1px 5px",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                }}
                title="Replaced by a newer revision"
              >
                Superseded
              </span>
            )}
          </div>
          <div
            className="mt-1 truncate"
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              lineHeight: 1.3,
            }}
          >
            {row.customerName}
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
          {(row.ageLabel || row.expiresLabel) && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: 10.5,
                color: "var(--text-muted)",
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {row.ageLabel && (
                <span style={{ color: row.ageColor ?? "var(--text-muted)" }}>
                  {row.ageLabel}
                </span>
              )}
              {row.ageLabel && row.expiresLabel && (
                <span style={{ color: "var(--text-faint)" }}>·</span>
              )}
              {row.expiresLabel && (
                <span
                  style={{
                    color: row.expiringSoon
                      ? "var(--danger-fg, var(--rose-500))"
                      : "var(--text-muted)",
                  }}
                  title={row.expiringSoon ? "Expires soon" : "Expires"}
                >
                  {row.expiringSoon ? "⌛ " : ""}exp {row.expiresLabel}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/** Tinted status pill that derives its bg/border from the accent color
 *  while keeping the text crisp. Looks premium across light + dark
 *  themes because we mix in oklab rather than using fixed values. */
function StatusPill({ label, accent }: { label: string; accent: string }) {
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
