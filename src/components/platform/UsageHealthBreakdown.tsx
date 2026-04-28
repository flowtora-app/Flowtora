import * as React from "react";
import Link from "next/link";

// Tenant-health distribution panel.
//
// Three buckets (rules computed on the page):
//   Healthy    — active in last 7 days AND has activity in last 30
//   At risk    — active 8–30 days ago OR no activity in 30 days
//   Dormant    — no member activity in 30+ days
//
// Renders as a stacked horizontal bar with three segments + a
// matching legend underneath. Each segment is sized by its share
// of total active/trial tenants. Below the bar we show three
// tile-style breakdowns with counts, share %, and a click-through
// for at-risk / dormant lists.

export interface UsageHealthBuckets {
  healthy: number;
  atRisk: number;
  dormant: number;
}

export function UsageHealthBreakdown({
  buckets,
  total,
}: {
  buckets: UsageHealthBuckets;
  total: number;
}) {
  const safeTotal = Math.max(1, total);
  const segments = [
    {
      key: "healthy",
      label: "Healthy",
      count: buckets.healthy,
      pct: buckets.healthy / safeTotal,
      bg: "var(--success-fg)",
      tileBg: "var(--success-surface)",
      tileFg: "var(--success-fg)",
      hint: "Active in last 7 days with recent records.",
    },
    {
      key: "atRisk",
      label: "At risk",
      count: buckets.atRisk,
      pct: buckets.atRisk / safeTotal,
      bg: "var(--warning-fg)",
      tileBg: "var(--warning-surface)",
      tileFg: "var(--warning-fg)",
      hint: "Slowing engagement — review in the dormant list.",
    },
    {
      key: "dormant",
      label: "Dormant",
      count: buckets.dormant,
      pct: buckets.dormant / safeTotal,
      bg: "var(--danger-fg)",
      tileBg: "var(--danger-surface)",
      tileFg: "var(--danger-fg)",
      hint: "No activity in 30+ days. Candidate churn.",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-3)" }}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            className="h-full"
            style={{
              width: `${Math.max(0, s.pct * 100)}%`,
              background: s.bg,
            }}
            title={`${s.label}: ${s.count} (${(s.pct * 100).toFixed(0)}%)`}
          />
        ))}
      </div>

      {/* Tile breakdown */}
      <div className="grid grid-cols-3 gap-3">
        {segments.map((s) => (
          <div
            key={s.key}
            className="rounded-lg p-3"
            style={{
              background: s.tileBg,
              border: `1px solid ${s.tileFg}`,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: s.tileFg }}
              >
                {s.label}
              </span>
              <span
                className="text-xs tabular-nums"
                style={{ color: s.tileFg, opacity: 0.75 }}
              >
                {(s.pct * 100).toFixed(0)}%
              </span>
            </div>
            <div
              className="mt-1 text-2xl font-semibold tabular-nums"
              style={{ color: "var(--text-default)" }}
            >
              {s.count.toLocaleString()}
            </div>
            <p
              className="mt-1 text-[11px] leading-snug"
              style={{ color: "var(--text-muted)" }}
            >
              {s.hint}
            </p>
            {s.key !== "healthy" && s.count > 0 && (
              <Link
                href="#dormant-list"
                className="mt-1 inline-block text-[11px] underline"
                style={{ color: s.tileFg }}
              >
                Open list →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
