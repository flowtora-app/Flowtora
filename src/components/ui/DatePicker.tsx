"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// DatePicker — Spec Page 0 §0.5.6.
//
// Single-date popover calendar. Today button, keyboard nav, weekday
// header, min/max date, disabled dates, optional time picker.
// Display: "Apr 29, 2026" (locale-aware via Intl).
//
// Range support is in DateRangePicker below.

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dayKey(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export interface DatePickerProps {
  value: Date | null;
  onChange: (next: Date | null) => void;
  min?: Date;
  max?: Date;
  /** Day-level predicate. Return true for disabled days. */
  isDisabled?: (d: Date) => boolean;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
  hint?: string;
  error?: string;
  /** Show time picker alongside calendar (HH:MM, 24h). */
  showTime?: boolean;
  /** Allow clearing the date back to null. Default true. */
  clearable?: boolean;
  className?: string;
  disabled?: boolean;
}

const SIZE_CLASS = {
  sm: "h-8  text-[13px] px-2.5",
  md: "h-9  text-[14px] px-3",
  lg: "h-10 text-[14px] px-3.5",
} as const;

export function DatePicker({
  value,
  onChange,
  min,
  max,
  isDisabled,
  placeholder = "Pick a date",
  size = "md",
  label,
  hint,
  error,
  showTime,
  clearable = true,
  className,
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<Date>(value ?? new Date());
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { if (value) setView(value); }, [value]);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const dayDisabled = (d: Date): boolean => {
    if (min && dayKey(d) < dayKey(min)) return true;
    if (max && dayKey(d) > dayKey(max)) return true;
    return !!isDisabled?.(d);
  };

  const pick = (d: Date) => {
    if (showTime && value) {
      d.setHours(value.getHours(), value.getMinutes());
    }
    onChange(d);
    if (!showTime) setOpen(false);
  };

  const onTime = (h: number, m: number) => {
    if (!value) return;
    const next = new Date(value);
    next.setHours(h, m);
    onChange(next);
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
          {label}
        </label>
      )}
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "ts-focus flex w-full items-center justify-between rounded-md border bg-transparent text-left",
            SIZE_CLASS[size],
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          style={{
            background: "var(--surface-1)",
            borderColor: error ? "var(--danger-border, var(--rose-500))" : "var(--border-default)",
            color: value ? "var(--text-default)" : "var(--text-muted)",
          }}
        >
          <span className="truncate">
            {value ? fmt(value) + (showTime ? ` · ${pad(value.getHours())}:${pad(value.getMinutes())}` : "") : placeholder}
          </span>
          <span aria-hidden style={{ color: "var(--text-muted)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="10" height="9" rx="1.5" />
              <line x1="2" y1="6" x2="12" y2="6" />
              <line x1="5" y1="2" x2="5" y2="4" />
              <line x1="9" y1="2" x2="9" y2="4" />
            </svg>
          </span>
        </button>
        {open && (
          <div
            className="absolute left-0 top-full z-[var(--z-dropdown,100)] mt-1 rounded-lg border p-3"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-default)",
              boxShadow: "var(--shadow-lg)",
              minWidth: 280,
            }}
          >
            <CalendarMonth
              view={view}
              onViewChange={setView}
              value={value}
              onPick={pick}
              dayDisabled={dayDisabled}
            />
            {showTime && value && (
              <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Time</span>
                <div className="flex items-center gap-1">
                  <NumStep value={value.getHours()}   max={23} onChange={(h) => onTime(h, value.getMinutes())} />
                  <span style={{ color: "var(--text-muted)" }}>:</span>
                  <NumStep value={value.getMinutes()} max={59} onChange={(m) => onTime(value.getHours(), m)} step={5} />
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="ts-focus text-[12px] font-medium"
                style={{ color: "var(--accent-primary)" }}
              >
                Today
              </button>
              <div className="flex items-center gap-2">
                {clearable && value && (
                  <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="ts-focus text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Clear
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="ts-focus text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}>{error ?? hint}</span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function pad(n: number): string { return n.toString().padStart(2, "0"); }

function NumStep({ value, max, onChange, step = 1 }: { value: number; max: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div className="inline-flex items-center rounded-md border" style={{ borderColor: "var(--border-default)" }}>
      <button type="button" className="px-1.5 text-xs" onClick={() => onChange(Math.max(0, value - step))} style={{ color: "var(--text-muted)" }}>−</button>
      <span className="w-8 text-center text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{pad(value)}</span>
      <button type="button" className="px-1.5 text-xs" onClick={() => onChange(Math.min(max, value + step))} style={{ color: "var(--text-muted)" }}>+</button>
    </div>
  );
}

/* Shared calendar grid used by DatePicker + DateRangePicker. */
export function CalendarMonth({
  view,
  onViewChange,
  value,
  rangeStart,
  rangeEnd,
  hover,
  onPick,
  onHover,
  dayDisabled,
}: {
  view: Date;
  onViewChange: (next: Date) => void;
  value?: Date | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  hover?: Date | null;
  onPick: (d: Date) => void;
  onHover?: (d: Date | null) => void;
  dayDisabled?: (d: Date) => boolean;
}) {
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: Date[] = [];
  for (let i = 0; i < firstDow; i++) {
    days.push(new Date(year, month, -firstDow + i + 1));
  }
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1]!;
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }

  const today = new Date();
  const monthLabel = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onViewChange(new Date(year, month - 1, 1))} className="ts-focus rounded-md p-1" style={{ color: "var(--text-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9,3 5,7 9,11" /></svg>
        </button>
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{monthLabel}</span>
        <button type="button" onClick={() => onViewChange(new Date(year, month + 1, 1))} className="ts-focus rounded-md p-1" style={{ color: "var(--text-muted)" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="5,3 9,7 5,11" /></svg>
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{d}</div>
        ))}
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const k = dayKey(d);
          const isToday = k === dayKey(today);
          const isSelected = value && k === dayKey(value);
          const inRange = rangeStart && rangeEnd && k >= dayKey(rangeStart) && k <= dayKey(rangeEnd);
          const inHover = rangeStart && hover && !rangeEnd && (
            (k >= dayKey(rangeStart) && k <= dayKey(hover)) ||
            (k <= dayKey(rangeStart) && k >= dayKey(hover))
          );
          const isStart = rangeStart && k === dayKey(rangeStart);
          const isEnd = rangeEnd && k === dayKey(rangeEnd);
          const disabled = dayDisabled?.(d);

          const bg = isSelected || isStart || isEnd
            ? "var(--brand-600, var(--accent-primary))"
            : inRange || inHover
            ? "var(--brand-100, var(--accent-surface))"
            : "transparent";
          const fg = isSelected || isStart || isEnd
            ? "#ffffff"
            : disabled
            ? "var(--text-faint)"
            : !inMonth
            ? "var(--text-faint)"
            : "var(--text-default)";

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover?.(d)}
              onMouseLeave={() => onHover?.(null)}
              className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-md text-[12px] tabular-nums disabled:cursor-not-allowed"
              style={{
                background: bg,
                color: fg,
                fontWeight: isSelected || isStart || isEnd ? 600 : 400,
                border: isToday && !isSelected && !isStart && !isEnd ? "1px solid var(--brand-300, var(--accent-primary))" : "1px solid transparent",
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* DateRangePicker                                              */
/* ────────────────────────────────────────────────────────────── */

export type DateRange = { start: Date | null; end: Date | null };

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  disabled?: boolean;
}

const RANGE_PRESETS: { label: string; getValue: () => DateRange }[] = [
  { label: "Today",       getValue: () => { const t = new Date(); return { start: t, end: t }; } },
  { label: "Yesterday",   getValue: () => { const y = new Date(Date.now() - DAY_MS); return { start: y, end: y }; } },
  { label: "Last 7d",     getValue: () => ({ start: new Date(Date.now() - 6 * DAY_MS),  end: new Date() }) },
  { label: "Last 30d",    getValue: () => ({ start: new Date(Date.now() - 29 * DAY_MS), end: new Date() }) },
  { label: "MTD",         getValue: () => { const t = new Date(); return { start: new Date(t.getFullYear(), t.getMonth(), 1), end: t }; } },
  { label: "QTD",         getValue: () => { const t = new Date(); const q = Math.floor(t.getMonth() / 3) * 3; return { start: new Date(t.getFullYear(), q, 1), end: t }; } },
  { label: "YTD",         getValue: () => { const t = new Date(); return { start: new Date(t.getFullYear(), 0, 1), end: t }; } },
  { label: "Last 12 mo",  getValue: () => { const t = new Date(); return { start: new Date(t.getFullYear() - 1, t.getMonth(), t.getDate()), end: t }; } },
];

export function DateRangePicker({
  value,
  onChange,
  size = "md",
  label,
  hint,
  error,
  className,
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<Date>(value.start ?? new Date());
  const [hover, setHover] = React.useState<Date | null>(null);
  const [partial, setPartial] = React.useState<Date | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pickDay = (d: Date) => {
    if (!partial) {
      setPartial(d);
      onChange({ start: d, end: null });
      return;
    }
    const start = dayKey(partial) <= dayKey(d) ? partial : d;
    const end   = dayKey(partial) <= dayKey(d) ? d : partial;
    onChange({ start, end });
    setPartial(null);
    setHover(null);
    setOpen(false);
  };

  const display = value.start
    ? value.end && dayKey(value.start) !== dayKey(value.end)
      ? `${fmt(value.start)} – ${fmt(value.end)}`
      : fmt(value.start)
    : null;

  const next = new Date(view.getFullYear(), view.getMonth() + 1, 1);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{label}</label>
      )}
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn("ts-focus flex w-full items-center justify-between rounded-md border bg-transparent text-left", SIZE_CLASS[size], "disabled:cursor-not-allowed disabled:opacity-50")}
          style={{
            background: "var(--surface-1)",
            borderColor: error ? "var(--danger-border, var(--rose-500))" : "var(--border-default)",
            color: display ? "var(--text-default)" : "var(--text-muted)",
          }}
        >
          <span className="truncate">{display ?? "Pick a range"}</span>
          <span aria-hidden style={{ color: "var(--text-muted)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="10" height="9" rx="1.5" />
              <line x1="2" y1="6" x2="12" y2="6" />
            </svg>
          </span>
        </button>
        {open && (
          <div
            className="absolute left-0 top-full z-[var(--z-dropdown,100)] mt-1 flex gap-3 rounded-lg border p-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
          >
            <ul className="flex w-32 shrink-0 flex-col gap-0.5">
              {RANGE_PRESETS.map((p) => (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={() => { const r = p.getValue(); onChange(r); setView(r.start ?? new Date()); setOpen(false); }}
                    className="ts-focus block w-full rounded px-2 py-1 text-left text-[12px] hover:bg-[var(--surface-3)]"
                    style={{ color: "var(--text-default)" }}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <CalendarMonth
                view={view}
                onViewChange={setView}
                rangeStart={value.start}
                rangeEnd={value.end}
                hover={hover}
                onPick={pickDay}
                onHover={setHover}
              />
              <CalendarMonth
                view={next}
                onViewChange={(d) => setView(new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                rangeStart={value.start}
                rangeEnd={value.end}
                hover={hover}
                onPick={pickDay}
                onHover={setHover}
              />
            </div>
          </div>
        )}
      </div>
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}>{error ?? hint}</span>
      )}
    </div>
  );
}
