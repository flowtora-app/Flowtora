"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// ScheduleCalendar — Spec Page 0 §0.5.39 (scheduling calendar
// portion).
//
// Three views: month / week / day. Event chips: colored bar, title
// truncated, click for popover with details. Today indicator: brand-
// 600 ring around date.
//
// Distinct from Calendar.tsx (date-picker grid for event-dot
// indication). Use ScheduleCalendar for time-blocked plans
// (announcement timing, dunning windows, install events).

export interface ScheduledEvent {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  /** Optional explicit color override (hex / css var). */
  color?: string;
  onClick?: () => void;
}

export type CalendarView = "month" | "week" | "day";

export interface ScheduleCalendarProps {
  events: ScheduledEvent[];
  view?: CalendarView;
  cursor: Date;
  onCursorChange: (next: Date) => void;
  className?: string;
  showAgenda?: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d: Date): Date { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function ScheduleCalendar({
  events,
  view = "month",
  cursor,
  onCursorChange,
  className,
  showAgenda,
}: ScheduleCalendarProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Header view={view} cursor={cursor} onCursorChange={onCursorChange} />
      {view === "month" && <MonthView cursor={cursor} events={events} />}
      {view === "week" && <WeekView cursor={cursor} events={events} />}
      {view === "day" && <DayView cursor={cursor} events={events} />}
      {showAgenda && <Agenda events={events} cursor={cursor} view={view} />}
    </div>
  );
}

function Header({ view, cursor, onCursorChange }: { view: CalendarView; cursor: Date; onCursorChange: (d: Date) => void }) {
  const label = view === "month"
    ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : view === "week"
    ? `Week of ${startOfWeek(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : cursor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });

  const step = (delta: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else if (view === "week") d.setDate(d.getDate() + 7 * delta);
    else d.setDate(d.getDate() + delta);
    onCursorChange(d);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <NavBtn onClick={() => step(-1)}>‹</NavBtn>
        <NavBtn onClick={() => onCursorChange(new Date())}>Today</NavBtn>
        <NavBtn onClick={() => step(1)}>›</NavBtn>
      </div>
      <span className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{label}</span>
      <span />
    </div>
  );
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium" style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}>
      {children}
    </button>
  );
}

function MonthView({ cursor, events }: { cursor: Date; events: ScheduledEvent[] }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Date[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(new Date(year, month, -firstDow + i + 1));
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    cells.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  const today = new Date();
  return (
    <div className="grid grid-cols-7 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
      {WEEKDAYS.map((d) => (
        <div key={d} className="border-b px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>{d}</div>
      ))}
      {cells.map((d, i) => {
        const inMonth = d.getMonth() === month;
        const isToday = sameDay(d, today);
        const dayEvents = events.filter((e) => sameDay(e.start, d));
        return (
          <div key={i} className="min-h-[88px] border-b border-r p-1.5 text-[12px]" style={{ borderColor: "var(--border-subtle)", background: inMonth ? "transparent" : "var(--surface-2)" }}>
            <div className="flex items-center justify-between">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ border: isToday ? "2px solid var(--brand-600, var(--accent-primary))" : undefined, fontWeight: isToday ? 700 : 400, color: inMonth ? "var(--text-default)" : "var(--text-faint)" }}>
                {d.getDate()}
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {dayEvents.slice(0, 3).map((e) => (<EventChip key={e.id} event={e} />))}
              {dayEvents.length > 3 && (<span className="text-[10px]" style={{ color: "var(--text-muted)" }}>+{dayEvents.length - 3} more</span>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ cursor, events }: { cursor: Date; events: ScheduledEvent[] }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((d) => {
        const dayEvents = events.filter((e) => sameDay(e.start, d));
        return (
          <div key={d.getTime()} className="rounded-md border p-2 text-[12px]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
              {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {dayEvents.length === 0 ? (<span className="text-[10px]" style={{ color: "var(--text-faint)" }}>—</span>) : dayEvents.map((e) => (<EventChip key={e.id} event={e} />))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ cursor, events }: { cursor: Date; events: ScheduledEvent[] }) {
  const dayEvents = events.filter((e) => sameDay(e.start, cursor)).sort((a, b) => a.start.getTime() - b.start.getTime());
  if (dayEvents.length === 0) return (
    <div className="rounded-lg border p-6 text-center text-[13px]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>Nothing scheduled.</div>
  );
  return (
    <ul className="flex flex-col gap-1">
      {dayEvents.map((e) => (
        <li key={e.id}>
          <button type="button" onClick={e.onClick} className="ts-focus flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-[13px]" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <span style={{ width: 6, height: 24, borderRadius: 3, background: e.color ?? "var(--brand-500)" }} />
            <span className="min-w-0 flex-1 truncate">{e.title}</span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{e.start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EventChip({ event }: { event: ScheduledEvent }) {
  return (
    <button type="button" onClick={event.onClick} className="ts-focus inline-block w-full truncate rounded px-1.5 py-0.5 text-[10px]" style={{ background: event.color ? `color-mix(in oklab, ${event.color} 18%, transparent)` : "var(--brand-100, var(--accent-surface))", color: event.color ?? "var(--brand-700, var(--accent-primary))", textAlign: "left" }}>
      {event.title}
    </button>
  );
}

function Agenda({ events, cursor, view }: { events: ScheduledEvent[]; cursor: Date; view: CalendarView }) {
  const inRange = (d: Date) => {
    if (view === "day") return sameDay(d, cursor);
    if (view === "week") {
      const start = startOfWeek(cursor);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return d >= start && d < end;
    }
    return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
  };
  const upcoming = events.filter((e) => inRange(e.start)).sort((a, b) => a.start.getTime() - b.start.getTime());
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Upcoming</div>
      <ul className="mt-1 flex flex-col gap-0.5">
        {upcoming.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {e.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span className="min-w-0 flex-1 truncate">{e.title}</span>
          </li>
        ))}
        {upcoming.length === 0 && (<li className="text-[12px]" style={{ color: "var(--text-muted)" }}>No events in this period.</li>)}
      </ul>
    </div>
  );
}
