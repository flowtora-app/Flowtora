"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Pill-style range toggle — drives the page's `?range=` search param
// so the server component re-renders with the new window. Keeps the
// state in the URL so range survives reload + is shareable.

const OPTIONS = [
  { key: "7d",   label: "7d" },
  { key: "30d",  label: "30d" },
  { key: "90d",  label: "90d" },
  { key: "180d", label: "180d" },
  { key: "ytd",  label: "YTD" },
] as const;

export type RangeKey = (typeof OPTIONS)[number]["key"];

export const DEFAULT_RANGE: RangeKey = "30d";

export function RevenueDateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("range") as RangeKey | null) ?? DEFAULT_RANGE;

  const select = (next: RangeKey) => {
    const sp = new URLSearchParams(params.toString());
    if (next === DEFAULT_RANGE) sp.delete("range");
    else sp.set("range", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg p-1"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.key === current;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => select(o.key)}
            className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? "var(--accent-primary)" : "transparent",
              color: active ? "var(--accent-fg)" : "var(--text-muted)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Server-side helper for resolving a RangeKey to actual dates ─────
//
// Lives in the same file so the picker and the consumer page stay
// in sync — adding a new range only touches one place.

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
