// Date-range presets + URL parsing for the reports section.
//
// URL contract:
//   ?range=last30          preset key (default when neither from/to is set)
//   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Every report page parses search params through `resolveRange()` so range
// handling stays consistent. All ranges are inclusive of the boundary days in
// local time.

import { formatDate } from "@/lib/format";

export type RangePreset =
  | "last7"
  | "last30"
  | "last90"
  | "mtd"          // month-to-date
  | "last_month"
  | "qtd"          // quarter-to-date
  | "ytd"
  | "last_year"
  | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "last7",      label: "Last 7 days"  },
  { value: "last30",     label: "Last 30 days" },
  { value: "last90",     label: "Last 90 days" },
  { value: "mtd",        label: "This month"   },
  { value: "last_month", label: "Last month"   },
  { value: "qtd",        label: "This quarter" },
  { value: "ytd",        label: "Year to date" },
  { value: "last_year",  label: "Last year"    },
  { value: "custom",     label: "Custom"       },
];

function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function parseISODateLocal(s: string | undefined | null): Date | null {
  if (!s) return null;
  // YYYY-MM-DD — interpret as local midnight
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da, 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

export type ResolvedRange = {
  preset: RangePreset;
  from: Date;   // inclusive, start-of-day
  to: Date;     // inclusive, end-of-day
  label: string;
};

export function resolveRange(sp: { range?: string; from?: string; to?: string } | undefined): ResolvedRange {
  const now = new Date();
  const today = startOfDayLocal(now);

  const preset: RangePreset = (sp?.range as RangePreset) && RANGE_PRESETS.some((p) => p.value === sp!.range)
    ? (sp!.range as RangePreset)
    : "last30";

  let from: Date;
  let to: Date;
  let label: string;

  switch (preset) {
    case "last7": {
      from = addDays(today, -6);
      to = endOfDayLocal(now);
      label = "Last 7 days";
      break;
    }
    case "last90": {
      from = addDays(today, -89);
      to = endOfDayLocal(now);
      label = "Last 90 days";
      break;
    }
    case "mtd": {
      from = startOfMonth(now);
      to = endOfDayLocal(now);
      label = "This month";
      break;
    }
    case "last_month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      from = startOfMonth(lm);
      to = endOfMonth(lm);
      label = "Last month";
      break;
    }
    case "qtd": {
      from = startOfQuarter(now);
      to = endOfDayLocal(now);
      label = "This quarter";
      break;
    }
    case "ytd": {
      from = startOfYear(now);
      to = endOfDayLocal(now);
      label = "Year to date";
      break;
    }
    case "last_year": {
      const ly = new Date(now.getFullYear() - 1, 0, 1);
      from = startOfYear(ly);
      to = endOfYear(ly);
      label = "Last year";
      break;
    }
    case "custom": {
      const f = parseISODateLocal(sp?.from);
      const t = parseISODateLocal(sp?.to);
      if (f && t && t.getTime() >= f.getTime()) {
        from = f;
        to = endOfDayLocal(t);
        label = `${formatDate(f)} → ${formatDate(t)}`;
      } else {
        // Fall back to last 30 if custom is malformed.
        from = addDays(today, -29);
        to = endOfDayLocal(now);
        label = "Last 30 days";
      }
      break;
    }
    case "last30":
    default: {
      from = addDays(today, -29);
      to = endOfDayLocal(now);
      label = "Last 30 days";
      break;
    }
  }
  return { preset, from, to, label };
}

/** Build a query string for a report link that preserves the current range. */
export function rangeQueryString(range: ResolvedRange): string {
  if (range.preset === "custom") {
    return `range=custom&from=${formatDate(range.from)}&to=${formatDate(range.to)}`;
  }
  return `range=${range.preset}`;
}

// ────────────────────────────────────────────────────────────
// Phase 15 — branch filter for reports
// ────────────────────────────────────────────────────────────

import { listActiveLocations, type LocationRow } from "@/lib/locations";

export type ResolvedBranch = {
  /** Allowed branch ids the picker should display. Pre-filtered by membership. */
  choices: LocationRow[];
  /** The single branch the user picked (must be inside `choices`). null = all. */
  selected: string | null;
  /** Combine with the member's branchScope to get the effective query scope. */
  effectiveScope: string[] | null;
};

/**
 * Resolve the optional `?branch=...` URL param against the member's branch
 * scope. Use the returned `effectiveScope` everywhere you'd otherwise pass
 * `ctx.branchScope` — it'll narrow further to a single branch when the user
 * picked one, or fall back to the membership scope when they didn't.
 */
export async function resolveBranch(
  tenantId: string,
  branchScope: string[] | null,
  raw: string | undefined,
): Promise<ResolvedBranch> {
  const all = await listActiveLocations(tenantId);
  const choices = branchScope === null ? all : all.filter((b) => branchScope.includes(b.id));
  const selected = raw && choices.some((b) => b.id === raw) ? raw : null;
  const effectiveScope: string[] | null = selected ? [selected] : branchScope;
  return { choices, selected, effectiveScope };
}

/** URL-string version preserving both range and branch. */
export function reportQueryString(range: ResolvedRange, branch: ResolvedBranch): string {
  const r = rangeQueryString(range);
  return branch.selected ? `${r}&branch=${branch.selected}` : r;
}

/** Safe percentage (0-100), null if the denominator is 0. */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Format a percentage (or "—" if null). */
export function formatPct(p: number | null): string {
  return p == null ? "—" : `${p}%`;
}

/** Aging buckets (days past due) for A/R. */
export const AGING_BUCKETS: { label: string; minDays: number; maxDays: number | null }[] = [
  { label: "Current",   minDays: -Infinity, maxDays: 0  },
  { label: "1–30 days", minDays: 1,         maxDays: 30 },
  { label: "31–60",     minDays: 31,        maxDays: 60 },
  { label: "61–90",     minDays: 61,        maxDays: 90 },
  { label: "90+",       minDays: 91,        maxDays: null },
];

/** How many days past the due date `d` is relative to `now`. Negative = future / not yet due. */
export function daysPastDue(due: Date | null | undefined, now: Date = new Date()): number | null {
  if (!due) return null;
  return Math.floor((now.getTime() - due.getTime()) / 86_400_000);
}

// ────────────────────────────────────────────────────────────
// Phase 17 — time-series bucketing for trend charts
// ────────────────────────────────────────────────────────────

export type BucketGranularity = "day" | "week" | "month";

/** Pick the right granularity for a date range so charts aren't too noisy or too sparse. */
export function chooseBucketGranularity(from: Date, to: Date): BucketGranularity {
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  if (days <= 14)  return "day";
  if (days <= 90)  return "week";
  return "month";
}

/** Bucket a date into a string key for the chosen granularity. */
export function bucketKey(date: Date, granularity: BucketGranularity): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  if (granularity === "day") return `${y}-${m}-${d}`;
  if (granularity === "month") return `${y}-${m}`;

  // ISO week: find the Monday of the week containing `date`.
  const dow = date.getDay(); // 0=Sun
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dow + 6) % 7));
  const wy = monday.getFullYear();
  const wm = String(monday.getMonth() + 1).padStart(2, "0");
  const wd = String(monday.getDate()).padStart(2, "0");
  return `${wy}-${wm}-${wd}`;
}

/** Human-readable x-axis label for a bucket key. */
export function bucketLabel(key: string, granularity: BucketGranularity): string {
  const parts = key.split("-");
  const year  = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day   = Number(parts[2] ?? 1);
  const d     = new Date(year, month, day);

  if (granularity === "month") {
    return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
  }
  if (granularity === "week") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

/**
 * Build a full series of buckets between `from` and `to` (inclusive),
 * merging in `values` keyed by bucketKey. Missing buckets get value 0 so
 * the chart line doesn't have gaps.
 */
export function buildTrendSeries(
  from: Date,
  to: Date,
  granularity: BucketGranularity,
  values: Map<string, number>,
): { key: string; label: string; value: number }[] {
  const result: { key: string; label: string; value: number }[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  const seen = new Set<string>();

  while (cursor <= to) {
    const k = bucketKey(cursor, granularity);
    if (!seen.has(k)) {
      seen.add(k);
      result.push({
        key:   k,
        label: bucketLabel(k, granularity),
        value: values.get(k) ?? 0,
      });
    }
    // Advance cursor by granularity.
    if (granularity === "day")   cursor.setDate(cursor.getDate() + 1);
    if (granularity === "week")  cursor.setDate(cursor.getDate() + 7);
    if (granularity === "month") cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}
