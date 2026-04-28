import * as React from "react";
import { cn } from "@/lib/cn";

// KpiCard — single big-number metric tile. Optional trend pill
// (up/down/flat) and a sublabel for context.
//   <KpiCard label="Revenue" value="$48.2k" trend="up" trendValue="+12%" />

type Trend = "up" | "down" | "flat";

const TREND_COLOR: Record<Trend, { fg: string; bg: string }> = {
  up:   { fg: "var(--success-fg)", bg: "var(--success-surface)" },
  down: { fg: "var(--danger-fg)",  bg: "var(--danger-surface)"  },
  flat: { fg: "var(--text-muted)", bg: "var(--surface-3)"       },
};

const TREND_GLYPH: Record<Trend, string> = {
  up:   "↑",
  down: "↓",
  flat: "→",
};

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small text under the big number (e.g. "vs last month"). */
  hint?: React.ReactNode;
  trend?: Trend;
  /** Pretty label rendered inside the trend pill (e.g. "+12%"). */
  trendValue?: React.ReactNode;
  /** Optional icon to anchor the top-left of the card. */
  icon?: React.ReactNode;
}

export function KpiCard({
  label,
  value,
  hint,
  trend,
  trendValue,
  icon,
  className,
  style,
  ...rest
}: KpiCardProps) {
  return (
    <div
      {...rest}
      className={cn("rounded-lg p-4", className)}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        ...style,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {icon && <span className="inline-flex">{icon}</span>}
          {label}
        </div>
        {trend && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: TREND_COLOR[trend].bg,
              color: TREND_COLOR[trend].fg,
            }}
          >
            <span aria-hidden>{TREND_GLYPH[trend]}</span>
            {trendValue}
          </span>
        )}
      </div>
      <div
        className="mt-2 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--text-default)" }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
