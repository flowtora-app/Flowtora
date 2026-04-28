"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Heatmap — 2D grid of intensity. Useful for distribution matrices,
// hour-of-day × day-of-week analysis, etc.
//
//   <Heatmap
//     rows={["Mon","Tue","Wed","Thu","Fri"]}
//     cols={["09","10","11","12","13"]}
//     data={[[1,2,3,2,0], [4,5,2,3,1], …]}
//   />

const LEVELS = 5;

export interface HeatmapProps {
  rows: string[];
  cols: string[];
  /** `data[r][c]` is the value at (rows[r], cols[c]). */
  data: number[][];
  /** Cap for color scale. Defaults to dataset max. */
  max?: number;
  formatValue?: (n: number) => string;
  /** Cell size in px. Default 32. */
  cellSize?: number;
  className?: string;
}

export function Heatmap({
  rows,
  cols,
  data,
  max,
  formatValue = (n) => n.toString(),
  cellSize = 32,
  className,
}: HeatmapProps) {
  const peak =
    max ??
    data.reduce((m, row) => Math.max(m, row.reduce((rm, v) => Math.max(rm, v), 0)), 0);

  return (
    <div className={cn("inline-block overflow-auto", className)}>
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th
                key={c}
                className="px-1 text-xs font-normal"
                style={{ color: "var(--text-faint)" }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((rowLabel, r) => (
            <tr key={rowLabel}>
              <td
                className="pr-2 text-right text-xs font-normal"
                style={{ color: "var(--text-faint)" }}
              >
                {rowLabel}
              </td>
              {cols.map((_, c) => {
                const v = data[r]?.[c] ?? 0;
                const level = peak > 0 ? Math.min(LEVELS - 1, Math.floor((v / peak) * LEVELS)) : 0;
                return (
                  <td
                    key={c}
                    title={`${rowLabel} · ${cols[c]}: ${formatValue(v)}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      borderRadius: 4,
                      background: level === 0 ? "var(--surface-3)" : tint(level),
                      color:
                        level >= LEVELS - 2
                          ? "var(--accent-fg)"
                          : "var(--text-default)",
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 12,
                    }}
                  >
                    {v > 0 ? formatValue(v) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tint(level: number): string {
  const opacity = 0.25 + (level / (LEVELS - 1)) * 0.75;
  return `color-mix(in oklab, var(--accent-primary) ${Math.round(opacity * 100)}%, var(--surface-1))`;
}
