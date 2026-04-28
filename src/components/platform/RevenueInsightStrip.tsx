import * as React from "react";
import Link from "next/link";

// Auto-generated alert strip at the top of the revenue dashboard.
// The page passes a list of insights; this component renders them as
// a horizontal strip with a tone-keyed icon. Three tones cover what
// we want to surface:
//
//   info     — neutral context ("Top 3 customers = 42% of MRR")
//   warning  — attention needed ("$X past due across 3 tenants")
//   positive — good news        ("Revenue +12% vs prior period")
//
// Generated from real data — never hand-coded copy. See
// `buildRevenueInsights()` for the rule list.

export type InsightTone = "info" | "warning" | "positive";

export interface RevenueInsight {
  id: string;
  tone: InsightTone;
  text: string;
  href?: string;
  hrefLabel?: string;
}

const TONE_PALETTE: Record<InsightTone, { bg: string; fg: string; icon: string }> = {
  info:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "ℹ" },
  warning:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "⚠" },
  positive: { bg: "var(--success-surface)", fg: "var(--success-fg)",     icon: "✓" },
};

export function RevenueInsightStrip({ insights }: { insights: RevenueInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {insights.map((i) => {
        const palette = TONE_PALETTE[i.tone];
        return (
          <div
            key={i.id}
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm"
            style={{
              background: palette.bg,
              border: `1px solid ${palette.fg}`,
              color: palette.fg,
            }}
          >
            <span
              aria-hidden
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: palette.fg, color: palette.bg }}
            >
              {palette.icon}
            </span>
            <span className="flex-1" style={{ color: "var(--text-default)" }}>
              {i.text}
            </span>
            {i.href && (
              <Link
                href={i.href}
                className="shrink-0 text-xs font-semibold underline"
                style={{ color: palette.fg }}
              >
                {i.hrefLabel ?? "View"} →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
