import * as React from "react";
import { Sparkline } from "@/components/charts/Sparkline";

// Hero KPI card for the revenue dashboard.
//
//   ┌─────────────────────────────┐
//   │ Monthly recurring revenue   │
//   │ $4,820         ▲ +12%       │
//   │ vs prior period             │
//   │ ▁▁▂▃▅▆▇▇▇                  │
//   └─────────────────────────────┘
//
// Sparkline data is optional (we don't always have a trailing series
// for every metric — counts like "active subscriptions" are a single
// snapshot, not a curve). When omitted the card just shows the value
// + trend pill.

export interface RevenueMetricCardProps {
  label: string;
  /** Pre-formatted value, e.g. "$4,820" or "47". */
  value: string;
  /** Optional secondary line under the value (e.g. "vs prior period"). */
  hint?: string;
  /** Optional period-over-period delta as a fraction (0.12 = +12%). */
  deltaPct?: number;
  /** Inverts the green/red mapping when an increase is bad (e.g. churn). */
  deltaInvert?: boolean;
  /** Trailing data for the sparkline. */
  spark?: number[];
  /** Tone for the value itself when no delta-tone is available. */
  tone?: "default" | "accent";
}

export function RevenueMetricCard({
  label,
  value,
  hint,
  deltaPct,
  deltaInvert = false,
  spark,
  tone = "default",
}: RevenueMetricCardProps) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct);
  const isPositive = hasDelta ? (deltaInvert ? deltaPct! < 0 : deltaPct! > 0) : false;
  const isNegative = hasDelta ? (deltaInvert ? deltaPct! > 0 : deltaPct! < 0) : false;
  const isFlat = hasDelta && deltaPct! === 0;

  const trendColor = isPositive
    ? "var(--success-fg)"
    : isNegative
    ? "var(--danger-fg)"
    : "var(--text-muted)";
  const trendBg = isPositive
    ? "var(--success-surface)"
    : isNegative
    ? "var(--danger-surface)"
    : "var(--surface-2)";
  const arrow = isFlat ? "→" : isPositive ? "↑" : isNegative ? "↓" : "→";

  return (
    <div
      className="flex h-full flex-col rounded-xl p-5"
      style={{
        background: tone === "accent" ? "var(--accent-surface)" : "var(--surface-1)",
        border: `1px solid ${tone === "accent" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: tone === "accent" ? "var(--accent-primary)" : "var(--text-muted)" }}
      >
        {label}
      </div>

      <div className="mt-2 flex items-baseline gap-3">
        <span
          className="text-2xl font-semibold tabular-nums tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          {value}
        </span>
        {hasDelta && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ background: trendBg, color: trendColor }}
            title={`${(deltaPct! * 100).toFixed(1)}% vs prior period`}
          >
            <span aria-hidden>{arrow}</span>
            {Math.abs(deltaPct! * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {hint && (
        <div
          className="mt-1 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {hint}
        </div>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-auto pt-3">
          <Sparkline
            data={spark}
            color={
              isPositive
                ? "var(--success-fg)"
                : isNegative
                ? "var(--danger-fg)"
                : "var(--accent-primary)"
            }
            height={32}
            fill
          />
        </div>
      )}
    </div>
  );
}
