import * as React from "react";
import { cn } from "@/lib/cn";

// DiffIndicator + PullQuote — Spec Page 0 §0.5.50 + §0.5.51.
//
// DiffIndicator: inline +/− icons with old vs new tooltip on hover.
// Used in Audit Log diff cells.
// PullQuote: large left brand bar, italic body, attribution. Used in
// "What's new" + announcements.

export type ChangeKind = "added" | "removed" | "changed" | "unchanged";

export interface DiffIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind: ChangeKind;
  oldValue?: React.ReactNode;
  newValue?: React.ReactNode;
  /** Compact = single glyph; expanded = glyph + label. */
  density?: "compact" | "expanded";
}

export function DiffIndicator({
  kind, oldValue, newValue, density = "compact", className, style, ...rest
}: DiffIndicatorProps) {
  if (kind === "unchanged") return null;
  const palette =
    kind === "added"
      ? { glyph: "+", color: "var(--emerald-700, var(--success-fg))", bg: "var(--emerald-50, var(--success-surface))" }
      : kind === "removed"
      ? { glyph: "−", color: "var(--rose-700, var(--danger-fg))", bg: "var(--rose-50, var(--danger-surface))" }
      : { glyph: "→", color: "var(--amber-800, var(--warning-fg))", bg: "var(--amber-50, var(--warning-surface))" };

  const tooltip = kind === "changed" && (oldValue !== undefined || newValue !== undefined)
    ? `${stringify(oldValue)} → ${stringify(newValue)}`
    : undefined;

  return (
    <span
      title={tooltip}
      className={cn("inline-flex items-center gap-1 rounded font-mono", className)}
      style={{
        background: palette.bg,
        color: palette.color,
        padding: "0 4px",
        fontSize: 11,
        fontWeight: 600,
        ...style,
      }}
      {...rest}
    >
      <span aria-hidden>{palette.glyph}</span>
      {density === "expanded" && (
        <>
          {kind === "added" && newValue !== undefined && <span>{newValue}</span>}
          {kind === "removed" && oldValue !== undefined && <span style={{ textDecoration: "line-through" }}>{oldValue}</span>}
          {kind === "changed" && (
            <span>
              <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{oldValue}</span>
              {" → "}
              <span>{newValue}</span>
            </span>
          )}
        </>
      )}
    </span>
  );
}

function stringify(v: React.ReactNode): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return "(complex value)";
}

/* ────────────────────────────────────────────────────────────── */

export interface PullQuoteProps {
  children: React.ReactNode;
  attribution?: React.ReactNode;
  className?: string;
}

export function PullQuote({ children, attribution, className }: PullQuoteProps) {
  return (
    <figure
      className={cn("rounded-lg p-4", className)}
      style={{
        background: "var(--surface-1)",
        borderInlineStart: "3px solid var(--brand-600, var(--accent-primary))",
      }}
    >
      <blockquote
        className="text-[15px] italic"
        style={{ color: "var(--text-default)", lineHeight: 1.55 }}
      >
        {children}
      </blockquote>
      {attribution && (
        <figcaption className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          — {attribution}
        </figcaption>
      )}
    </figure>
  );
}
