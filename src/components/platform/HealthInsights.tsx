import * as React from "react";

// Auto-generated health insights strip.
//
//   ⚠  Email delivery dropped to 91.2% — investigate
//   ⚠  Failed-login spike: 87 attempts in last hour
//   ℹ  Active impersonation: 2 sessions running
//   ✓  No platform incidents in 30 days

export type HealthInsightTone = "info" | "warning" | "danger" | "positive";

export interface HealthInsight {
  id: string;
  tone: HealthInsightTone;
  text: string;
}

const TONE_PALETTE: Record<HealthInsightTone, { bg: string; fg: string; icon: string }> = {
  info:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "ℹ" },
  warning:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "⚠" },
  danger:   { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      icon: "✖" },
  positive: { bg: "var(--success-surface)", fg: "var(--success-fg)",     icon: "✓" },
};

export function HealthInsights({ insights }: { insights: HealthInsight[] }) {
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
          </div>
        );
      })}
    </div>
  );
}
