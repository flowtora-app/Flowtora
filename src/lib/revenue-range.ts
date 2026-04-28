// Server-side date-range helpers for the revenue dashboard.
//
// Lives in lib/ (not in the picker component file) because the
// picker is a "use client" file — Next.js refuses to let server
// components import non-client exports from a client module. Same
// helpers, same RangeKey union, just in a server-friendly home.

export const DEFAULT_RANGE = "30d" as const;

export type RangeKey = "7d" | "30d" | "90d" | "180d" | "ytd";

export interface ResolvedRange {
  /** Inclusive start of the active window. */
  start: Date;
  /** Exclusive end (now). */
  end: Date;
  /** Inclusive start of the prior period (same length, ending at `start`). */
  prevStart: Date;
  /** Exclusive end of the prior period (= start). */
  prevEnd: Date;
  /** Length of the window in days, used for sparkline buckets. */
  days: number;
  /** Display label (e.g. "Last 30 days"). */
  label: string;
  /** The key that produced this range. */
  key: RangeKey;
}

const DAY_MS = 86_400_000;

export function resolveRangeKey(raw: string | undefined | null): RangeKey {
  if (raw === "7d" || raw === "30d" || raw === "90d" || raw === "180d" || raw === "ytd") {
    return raw;
  }
  return DEFAULT_RANGE;
}

export function resolveRange(key: RangeKey, now: Date = new Date()): ResolvedRange {
  if (key === "ytd") {
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / DAY_MS));
    const prevStart = new Date(now.getFullYear() - 1, 0, 1);
    const prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    return { start, end: now, prevStart, prevEnd, days, label: "Year to date", key };
  }
  const days = key === "7d" ? 7 : key === "30d" ? 30 : key === "90d" ? 90 : 180;
  const start = new Date(now.getTime() - days * DAY_MS);
  const prevStart = new Date(now.getTime() - 2 * days * DAY_MS);
  return {
    start,
    end: now,
    prevStart,
    prevEnd: start,
    days,
    label: `Last ${days} days`,
    key,
  };
}
