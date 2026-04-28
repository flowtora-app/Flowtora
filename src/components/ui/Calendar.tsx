"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Calendar — month-grid with optional event dots and selectable date.
// No external date library; uses native Date arithmetic. Sunday-first
// week by default (override via `weekStartsOn`).
//
//   <Calendar
//     value={date}
//     onSelect={setDate}
//     events={[{ date: new Date(...), label: "Install" }]}
//   />
//
// When `events` is provided, days with one or more events show a small
// dot under the day number; hovering reveals the event labels stacked.

export interface CalendarEvent {
  date: Date;
  label: React.ReactNode;
  /** Optional tone for the dot: accent (default), success, warning, danger. */
  tone?: "accent" | "success" | "warning" | "danger";
}

const TONE_BG: Record<NonNullable<CalendarEvent["tone"]>, string> = {
  accent:  "var(--accent-primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger:  "var(--danger)",
};

export interface CalendarProps {
  /** Selected date (single). */
  value?: Date | null;
  /** Defaults to the month containing `value` or today. */
  initialMonth?: Date;
  onSelect?: (date: Date) => void;
  weekStartsOn?: 0 | 1 | 6; // Sun / Mon / Sat
  events?: CalendarEvent[];
  /** Disable interaction (read-only display). */
  disabled?: boolean;
  className?: string;
  /** Optional rule for blocking specific dates (return true to disable). */
  isDateDisabled?: (d: Date) => boolean;
}

export function Calendar({
  value,
  initialMonth,
  onSelect,
  weekStartsOn = 0,
  events = [],
  disabled = false,
  className,
  isDateDisabled,
}: CalendarProps) {
  const today = startOfDay(new Date());
  const [month, setMonth] = React.useState<Date>(() =>
    startOfMonth(initialMonth ?? value ?? today),
  );

  React.useEffect(() => {
    if (initialMonth) setMonth(startOfMonth(initialMonth));
  }, [initialMonth]);

  const eventMap = React.useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const k = dateKey(ev.date);
      const list = m.get(k);
      if (list) list.push(ev);
      else m.set(k, [ev]);
    }
    return m;
  }, [events]);

  const cells = useMonthCells(month, weekStartsOn);
  const weekdayLabels = useWeekdayLabels(weekStartsOn);

  return (
    <div
      className={cn("inline-block rounded-lg p-3", className)}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        minWidth: 280,
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
          className="rounded p-1"
          style={{ color: "var(--text-muted)" }}
        >
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="10,3 5,8 10,13" /></svg>
        </button>
        <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
          className="rounded p-1"
          style={{ color: "var(--text-muted)" }}
        >
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="6,3 11,8 6,13" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center text-xs" style={{ color: "var(--text-faint)" }}>
        {weekdayLabels.map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const inMonth = cell.getMonth() === month.getMonth();
          const isToday = sameDay(cell, today);
          const isSelected = value ? sameDay(cell, value) : false;
          const cellDisabled = disabled || (isDateDisabled?.(cell) ?? false);
          const dayEvents = eventMap.get(dateKey(cell)) ?? [];
          return (
            <button
              key={cell.toISOString()}
              type="button"
              disabled={cellDisabled}
              onClick={() => !cellDisabled && onSelect?.(cell)}
              title={dayEvents.length ? dayEvents.map((e) => stringify(e.label)).join("\n") : undefined}
              className="relative flex aspect-square w-9 flex-col items-center justify-center rounded-md text-sm transition-colors"
              style={{
                background: isSelected ? "var(--accent-primary)" : isToday ? "var(--accent-surface)" : "transparent",
                color: isSelected
                  ? "var(--accent-fg)"
                  : !inMonth
                  ? "var(--text-faint)"
                  : "var(--text-default)",
                cursor: cellDisabled ? "not-allowed" : "pointer",
                opacity: cellDisabled ? 0.4 : 1,
                transitionDuration: "var(--duration-fast)",
              }}
            >
              <span>{cell.getDate()}</span>
              {dayEvents.length > 0 && (
                <span className="mt-0.5 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((ev, i) => (
                    <span
                      key={i}
                      className="block h-1 w-1 rounded-full"
                      style={{ background: TONE_BG[ev.tone ?? "accent"] }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function stringify(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return "";
}

function useMonthCells(month: Date, weekStartsOn: number): Date[] {
  return React.useMemo(() => {
    const first = startOfMonth(month);
    const firstWeekday = first.getDay();
    const offset = (firstWeekday - weekStartsOn + 7) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push(d);
    }
    return cells;
  }, [month, weekStartsOn]);
}

function useWeekdayLabels(weekStartsOn: number): string[] {
  return React.useMemo(() => {
    // 2024-01-07 is a Sunday — use a known week to derive locale-aware labels.
    const base = new Date(2024, 0, 7);
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i + weekStartsOn);
      out.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    }
    return out;
  }, [weekStartsOn]);
}
