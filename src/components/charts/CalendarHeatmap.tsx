"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// CalendarHeatmap — GitHub-style yearly grid. One column per week, one
// row per weekday. Each cell colored by the value for that date,
// scaled across `[0, max]`.
//
//   <CalendarHeatmap
//     points={[{ date: new Date(...), value: 5 }, ...]}
//     startDate={new Date(2026, 0, 1)}
//     endDate={new Date(2026, 11, 31)}
//   />

export interface CalendarHeatmapPoint {
  date: Date;
  value: number;
}

export interface CalendarHeatmapProps {
  points: CalendarHeatmapPoint[];
  /** Inclusive range start. Defaults to one year ago. */
  startDate?: Date;
  /** Inclusive range end. Defaults to today. */
  endDate?: Date;
  /** Cap for the scale; values above are pinned to max color. Defaults to dataset max. */
  max?: number;
  /** Cell size in px (square). Default 11. */
  cellSize?: number;
  /** Gap between cells in px. Default 2. */
  cellGap?: number;
  /** Tooltip / aria text for a point — defaults to "{date}: {value}". */
  formatTitle?: (point: CalendarHeatmapPoint) => string;
  className?: string;
}

const LEVELS = 5;

export function CalendarHeatmap({
  points,
  startDate,
  endDate,
  max,
  cellSize = 11,
  cellGap = 2,
  formatTitle,
  className,
}: CalendarHeatmapProps) {
  const today = startOfDay(new Date());
  const end = endDate ? startOfDay(endDate) : today;
  const start = startDate ? startOfDay(startDate) : addDays(end, -364);

  const map = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of points) m.set(dateKey(p.date), p.value);
    return m;
  }, [points]);

  const peak = max ?? points.reduce((m, p) => Math.max(m, p.value), 0) ?? 0;

  // Build column-major weeks: each column is one week (7 cells).
  const weeks: { key: string; cells: { date: Date; value: number }[] }[] = [];
  let cur = start;
  // Snap to nearest Sunday at-or-before start.
  cur = addDays(cur, -cur.getDay());

  while (cur <= end) {
    const cells: { date: Date; value: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(cur, d);
      cells.push({ date, value: map.get(dateKey(date)) ?? 0 });
    }
    weeks.push({ key: cur.toISOString(), cells });
    cur = addDays(cur, 7);
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <div className="flex" style={{ gap: cellGap }}>
        {weeks.map((week) => (
          <div key={week.key} className="flex flex-col" style={{ gap: cellGap }}>
            {week.cells.map((cell, j) => {
              const inRange = cell.date >= start && cell.date <= end;
              const level = inRange && peak > 0
                ? Math.min(LEVELS - 1, Math.floor((cell.value / peak) * LEVELS))
                : -1;
              return (
                <span
                  key={j}
                  title={
                    inRange
                      ? formatTitle?.({ date: cell.date, value: cell.value }) ??
                        `${cell.date.toDateString()}: ${cell.value}`
                      : undefined
                  }
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 2,
                    background:
                      level < 0
                        ? "transparent"
                        : level === 0
                        ? "var(--surface-3)"
                        : tint(level),
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-faint)" }}>
        <span>Less</span>
        {Array.from({ length: LEVELS }).map((_, i) => (
          <span
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              borderRadius: 2,
              background: i === 0 ? "var(--surface-3)" : tint(i),
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// Tint via accent-surface stacking — guaranteed to read in dark + light
// themes since both layers use semantic tokens that flip with the theme.
function tint(level: number): string {
  // 1..LEVELS-1 → progressively stronger accent.
  const opacity = 0.25 + (level / (LEVELS - 1)) * 0.75;
  return `color-mix(in oklab, var(--accent-primary) ${Math.round(opacity * 100)}%, var(--surface-1))`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
