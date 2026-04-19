import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Phase 18 Slice D — KPI tile used by every persona dashboard.
//
// Props:
//   label    — short, sentence-case
//   value    — the big number (string; caller formats money/counts)
//   hint     — optional secondary line (delta, comparison, context)
//   href     — if present, tile becomes a link
//   tone     — color accent for the value. Default inherits text color.
//   icon     — optional decorative glyph
//
// Deliberately a thin component — just a card with typography. The
// layouts (grids of stats) live in the page-level persona views.

export type StatTone = "default" | "success" | "warning" | "danger" | "accent";

const TONE_COLOR: Record<StatTone, string> = {
  default: "var(--text-default)",
  success: "var(--success-fg)",
  warning: "var(--warning-fg, var(--accent-primary))",
  danger: "var(--danger-fg)",
  accent: "var(--accent-primary)",
};

export interface DashboardStatProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function DashboardStat({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon,
  compact,
  className,
}: DashboardStatProps) {
  const inner = (
    <div
      className={cn(
        "rounded-lg transition-colors",
        compact ? "p-4" : "px-5 py-5",
        href && "hover:brightness-110",
        className,
      )}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
        {icon && (
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-md text-xs"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn("mt-2 font-semibold tracking-tight", compact ? "text-xl" : "text-2xl")}
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </div>
      {hint && (
        <div
          className="mt-1 text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
