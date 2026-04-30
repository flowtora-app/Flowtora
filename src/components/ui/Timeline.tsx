"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Timeline — Spec Page 0 §0.5.52.
//
// Vertical: left rail with dots; each entry has an icon + actor +
// action + timestamp + expandable detail.
// Horizontal: Gantt-like for incidents and rollouts (compact bar
// chart with marker glyphs).
// Markers: today line (brand), milestones (filled circles), incidents
// (rose triangle).

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE_DOT: Record<Tone, string> = {
  neutral: "var(--slate-400, var(--text-faint))",
  accent:  "var(--brand-600, var(--accent-primary))",
  success: "var(--emerald-500, var(--success))",
  warning: "var(--amber-500, var(--warning))",
  danger:  "var(--rose-500, var(--danger))",
};

export interface TimelineEntry {
  id: string;
  timestamp: Date;
  /** Heading line — verb-led summary. */
  title: React.ReactNode;
  /** Optional secondary line. */
  description?: React.ReactNode;
  /** Optional inline detail rendered when expanded. */
  detail?: React.ReactNode;
  tone?: Tone;
  /** Override the dot glyph (e.g. icon). */
  icon?: React.ReactNode;
  /** Mark this entry as a milestone (filled circle, larger). */
  milestone?: boolean;
  /** Mark this entry as an incident (rose triangle). */
  incident?: boolean;
}

export interface VerticalTimelineProps {
  entries: TimelineEntry[];
  /** Render a "Today" line where it falls in the sequence. */
  showToday?: boolean;
  /** Initially expand entries with this tone. Defaults to none. */
  initiallyExpanded?: ((entry: TimelineEntry) => boolean) | null;
  className?: string;
}

export function VerticalTimeline({
  entries,
  showToday,
  initiallyExpanded,
  className,
}: VerticalTimelineProps) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(() => {
    const set = new Set<string>();
    if (initiallyExpanded) {
      for (const e of entries) if (initiallyExpanded(e)) set.add(e.id);
    }
    return set;
  });
  const toggle = (id: string) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const sorted = [...entries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const todayIndex = showToday ? findTodayIndex(sorted) : -1;

  return (
    <ol className={cn("relative flex flex-col", className)}>
      {/* Spine */}
      <span aria-hidden className="absolute left-3 top-2 bottom-2 w-px" style={{ background: "var(--border-subtle)" }} />
      {sorted.map((e, i) => (
        <React.Fragment key={e.id}>
          {todayIndex === i && <TodayLine />}
          <Row entry={e} expanded={openIds.has(e.id)} onToggle={() => toggle(e.id)} hasDetail={!!e.detail} />
        </React.Fragment>
      ))}
    </ol>
  );
}

function findTodayIndex(entries: TimelineEntry[]): number {
  const today = Date.now();
  // Insert "today line" before the first entry whose timestamp is in the future.
  return entries.findIndex((e) => e.timestamp.getTime() > today);
}

function TodayLine() {
  return (
    <li className="relative flex items-center py-1.5" aria-hidden>
      <span
        className="absolute left-0 right-0 h-px"
        style={{ background: "var(--brand-500, var(--accent-primary))" }}
      />
      <span
        className="relative ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
        style={{
          background: "var(--brand-50, var(--accent-surface))",
          color: "var(--brand-700, var(--accent-primary))",
          border: "1px solid var(--brand-300, var(--accent-primary))",
          marginInlineStart: "10px",
        }}
      >
        Today
      </span>
    </li>
  );
}

function Row({
  entry, expanded, onToggle, hasDetail,
}: {
  entry: TimelineEntry;
  expanded: boolean;
  onToggle: () => void;
  hasDetail: boolean;
}) {
  const tone = entry.tone ?? "neutral";
  return (
    <li className="relative flex items-start gap-3 py-2" style={{ paddingInlineStart: 8 }}>
      {/* Dot / marker */}
      <span
        aria-hidden
        className="relative z-10 mt-1 inline-flex shrink-0 items-center justify-center"
        style={{
          width: entry.milestone ? 14 : 10,
          height: entry.milestone ? 14 : 10,
          borderRadius: entry.incident ? 0 : 9999,
          transform: entry.incident ? "rotate(45deg)" : undefined,
          background: TONE_DOT[tone],
          boxShadow: "0 0 0 2px var(--surface-0)",
          marginInlineStart: 0,
        }}
      >
        {entry.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <button
            type="button"
            onClick={hasDetail ? onToggle : undefined}
            disabled={!hasDetail}
            className="ts-focus text-left disabled:cursor-default"
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
              {entry.title}
            </span>
          </button>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {entry.timestamp.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {entry.description && (
          <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{entry.description}</div>
        )}
        {expanded && entry.detail && (
          <div className="mt-2 rounded-md border p-2 text-[12px]" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {entry.detail}
          </div>
        )}
      </div>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Horizontal timeline (Gantt-like)                              */
/* ────────────────────────────────────────────────────────────── */

export interface GanttBar {
  id: string;
  label: React.ReactNode;
  start: Date;
  end: Date;
  tone?: Tone;
  /** Markers along the bar (e.g. incidents). */
  markers?: { at: Date; tone: Tone; label?: string }[];
}

export interface HorizontalTimelineProps {
  bars: GanttBar[];
  /** Window. Defaults to the bounding range of the bars. */
  windowStart?: Date;
  windowEnd?: Date;
  showToday?: boolean;
  className?: string;
}

export function HorizontalTimeline({
  bars,
  windowStart,
  windowEnd,
  showToday,
  className,
}: HorizontalTimelineProps) {
  const minStart = windowStart ?? new Date(Math.min(...bars.map((b) => b.start.getTime())));
  const maxEnd = windowEnd ?? new Date(Math.max(...bars.map((b) => b.end.getTime())));
  const span = Math.max(1, maxEnd.getTime() - minStart.getTime());
  const pct = (d: Date) => ((d.getTime() - minStart.getTime()) / span) * 100;

  const today = Date.now();
  const todayInRange = today >= minStart.getTime() && today <= maxEnd.getTime();

  return (
    <div className={cn("rounded-lg border", className)} style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        <span>{minStart.toLocaleDateString()}</span>
        <span>{maxEnd.toLocaleDateString()}</span>
      </div>
      <ul className="flex flex-col gap-1.5 p-3">
        {bars.map((b) => {
          const left = pct(b.start);
          const width = Math.max(2, pct(b.end) - left);
          return (
            <li key={b.id} className="relative flex items-center gap-2">
              <span className="w-32 shrink-0 truncate text-[12px]" style={{ color: "var(--text-default)" }}>{b.label}</span>
              <div className="relative h-5 flex-1 rounded" style={{ background: "var(--surface-2)" }}>
                {showToday && todayInRange && (
                  <span aria-hidden className="absolute inset-y-0 w-px" style={{ left: `${pct(new Date())}%`, background: "var(--brand-500, var(--accent-primary))" }} />
                )}
                <span
                  className="absolute inset-y-0.5 rounded"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: TONE_DOT[b.tone ?? "accent"],
                    opacity: 0.7,
                  }}
                  title={`${b.start.toLocaleDateString()} – ${b.end.toLocaleDateString()}`}
                />
                {(b.markers ?? []).map((m, i) => (
                  <span
                    key={i}
                    aria-label={m.label}
                    title={m.label}
                    className="absolute"
                    style={{
                      left: `${pct(m.at)}%`,
                      top: 2,
                      width: 8,
                      height: 8,
                      borderRadius: 0,
                      transform: "translate(-50%, 0) rotate(45deg)",
                      background: TONE_DOT[m.tone],
                    }}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
