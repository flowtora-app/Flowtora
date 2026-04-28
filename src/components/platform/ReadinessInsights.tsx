import * as React from "react";
import Link from "next/link";

// Auto-generated insights strip.
//
//   ⚠  40% of tenants drop before creating their first product
//   ℹ  Stripe linkage is your biggest blocker — 18 tenants stuck
//   ✓  Onboarding completion up 12% week-over-week
//
// Same shape as RevenueInsightStrip / LeadsInsightStrip — keep tone
// hierarchy (warning → info → positive), cap to 4 rows.

export type ReadinessInsightTone = "info" | "warning" | "positive";

export interface ReadinessInsight {
  id: string;
  tone: ReadinessInsightTone;
  text: string;
  href?: string;
  hrefLabel?: string;
}

const TONE_PALETTE: Record<ReadinessInsightTone, { bg: string; fg: string; icon: string }> = {
  info:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "ℹ" },
  warning:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "⚠" },
  positive: { bg: "var(--success-surface)", fg: "var(--success-fg)",     icon: "✓" },
};

export function ReadinessInsights({ insights }: { insights: ReadinessInsight[] }) {
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
