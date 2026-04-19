import * as React from "react";
import { TIER_COLORS, TIER_LABEL, type HealthTier } from "@/lib/opportunity-health";

// Phase 7 — opportunity health pill.
//
// A small colored chip that encodes both tier (hot/warm/cool/stale)
// and score. Used on:
//   • customer rows in the list table
//   • cards in the pipeline kanban
//   • the header of the customer detail page
//
// For closed-won / closed-lost we show a neutral style since scoring
// no longer matters.

export function HealthBadge({
  tier,
  score,
  atRisk,
  size = "md",
  showScore = true,
}: {
  tier: HealthTier;
  score: number;
  atRisk?: boolean;
  size?: "sm" | "md";
  showScore?: boolean;
}) {
  const color = TIER_COLORS[tier];
  const label = TIER_LABEL[tier];
  const paddingClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${paddingClass}`}
      style={{ background: color.bg, color: color.fg }}
      title={atRisk ? "At risk — stale activity" : undefined}
    >
      <span
        aria-hidden
        className={size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2"}
        style={{ borderRadius: 999, background: color.dot }}
      />
      <span>{label}</span>
      {showScore && tier !== "closed-won" && tier !== "closed-lost" && (
        <span style={{ opacity: 0.75 }}>{score}</span>
      )}
      {atRisk && (
        <span aria-label="At risk" title="At risk" style={{ marginLeft: 2 }}>
          !
        </span>
      )}
    </span>
  );
}
