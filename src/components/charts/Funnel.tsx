"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Funnel — multi-stage conversion visualization. Each stage renders as
// a horizontal bar whose width is proportional to its value, with the
// drop-off from the previous stage shown to the right.
//
//   <Funnel
//     stages={[
//       { label: "Visited",   value: 1000 },
//       { label: "Quoted",    value:  420 },
//       { label: "Approved",  value:  180 },
//       { label: "Paid",      value:  140 },
//     ]}
//   />
//
// No recharts dependency — funnel charts in recharts are awkward to
// theme; a custom CSS layout reads cleaner here.

export interface FunnelStage {
  label: React.ReactNode;
  value: number;
  /** Optional hint shown after the value (e.g. "$2.4k"). */
  hint?: React.ReactNode;
  /** Override bar color for this stage. */
  color?: string;
}

export interface FunnelProps {
  stages: FunnelStage[];
  /** Default bar color. */
  color?: string;
  /** Format the trailing value (default: localeString). */
  formatValue?: (n: number) => string;
  className?: string;
}

export function Funnel({
  stages,
  color = "var(--accent-primary)",
  formatValue = (n) => n.toLocaleString(),
  className,
}: FunnelProps) {
  const peak = stages.reduce((m, s) => Math.max(m, s.value), 0) || 1;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {stages.map((stage, i) => {
        const pct = (stage.value / peak) * 100;
        const prev = stages[i - 1];
        const drop = prev && prev.value > 0
          ? ((prev.value - stage.value) / prev.value) * 100
          : 0;
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-sm">
              <span style={{ color: "var(--text-default)" }}>{stage.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                  {formatValue(stage.value)}
                </span>
                {stage.hint && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{stage.hint}</span>
                )}
                {prev && (
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
                    −{drop.toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--surface-3)" }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${pct}%`,
                  background: stage.color ?? color,
                  transitionDuration: "var(--duration-base)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
