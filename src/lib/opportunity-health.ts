// Phase 7 — opportunity health scoring.
//
// A per-customer score (0–100) and tier (hot/warm/cool/stale) that
// tells sales "how confident should I be in this opportunity closing."
// We compute it from data we already collect — no extra schema fields
// — so every existing tenant gets a score on day one.
//
// Factors (additive, capped at 100):
//
//   Stage           — NEW_LEAD 10 / CONTACTED 25 / QUOTED 50 /
//                     NEGOTIATING 65 / WON 100 / LOST 0
//   Has open quote  — +15 if there's a SENT/VIEWED/APPROVED quote on file
//   Close probability (if set) — scaled to +20 max (50% prob = +10)
//   Recent activity — +10 if any interaction in last 7 days, +5 if 8–14d
//   Estimated value — +5 if ≥ $10k (signal of qualified opp)
//
// Penalties:
//
//   Stale — −15 if no activity for 14+ days while in an active stage
//   Overdue tasks — −5 per overdue task, capped at −15
//
// This is deliberately transparent — a sales rep can look at the
// reason list and understand why the score is what it is. No ML.
//
// Separately, `opportunityTier()` buckets the score into a qualitative
// label. "At risk" is a flag (not a tier) raised for opportunities in
// QUOTED/NEGOTIATING with stale activity — those are the ones that
// usually slip between the cracks.

import type { PipelineStage, QuoteStatus } from "@prisma/client";

export type HealthTier = "hot" | "warm" | "cool" | "stale" | "closed-won" | "closed-lost";

export type HealthInput = {
  stage: PipelineStage;
  estimatedValue: number | null;
  closeProbability: number | null; // 0–100
  /** Most recent interaction / task / audit entry on this customer. */
  lastTouchAt: Date | null;
  /** Does the customer have at least one open quote (SENT/VIEWED/APPROVED)? */
  openQuoteStatus: QuoteStatus | null;
  /** Count of tasks with dueDate in the past and completedAt null. */
  overdueTaskCount: number;
  /** For deterministic recency calculations — defaults to `new Date()`. */
  now?: Date;
};

export type HealthReport = {
  score: number;           // clamped 0–100
  tier: HealthTier;
  atRisk: boolean;
  reasons: string[];       // human-readable, in display order
  daysSinceTouch: number | null;
};

const STAGE_BASE: Record<PipelineStage, number> = {
  NEW_LEAD:    10,
  CONTACTED:   25,
  QUOTED:      50,
  NEGOTIATING: 65,
  WON:         100,
  LOST:        0,
};

const STAGE_LABEL: Record<PipelineStage, string> = {
  NEW_LEAD:    "New lead",
  CONTACTED:   "Contacted",
  QUOTED:      "Quoted",
  NEGOTIATING: "Negotiating",
  WON:         "Won",
  LOST:        "Lost",
};

export function computeOpportunityHealth(input: HealthInput): HealthReport {
  const now = input.now ?? new Date();
  const reasons: string[] = [];

  // Closed stages — return canonical reports without running the engine.
  if (input.stage === "WON") {
    return {
      score: 100,
      tier: "closed-won",
      atRisk: false,
      reasons: ["Closed — won"],
      daysSinceTouch: input.lastTouchAt
        ? Math.floor((now.getTime() - input.lastTouchAt.getTime()) / 86_400_000)
        : null,
    };
  }
  if (input.stage === "LOST") {
    return {
      score: 0,
      tier: "closed-lost",
      atRisk: false,
      reasons: ["Closed — lost"],
      daysSinceTouch: input.lastTouchAt
        ? Math.floor((now.getTime() - input.lastTouchAt.getTime()) / 86_400_000)
        : null,
    };
  }

  let score = STAGE_BASE[input.stage];
  reasons.push(`Stage: ${STAGE_LABEL[input.stage]}`);

  // Open quote bonus.
  if (input.openQuoteStatus) {
    if (input.openQuoteStatus === "APPROVED") {
      score += 25;
      reasons.push("Quote approved — near close");
    } else if (input.openQuoteStatus === "VIEWED") {
      score += 20;
      reasons.push("Customer opened the quote");
    } else if (input.openQuoteStatus === "SENT") {
      score += 15;
      reasons.push("Quote is in their inbox");
    }
  }

  // Close probability bonus — scales to 20 points max.
  if (input.closeProbability != null) {
    const bonus = Math.round((input.closeProbability / 100) * 20);
    if (bonus > 0) {
      score += bonus;
      reasons.push(`${input.closeProbability}% close probability`);
    }
  }

  // Estimated value — qualification signal.
  if (input.estimatedValue != null && input.estimatedValue >= 10_000) {
    score += 5;
    reasons.push(`High-value opportunity (${formatShortMoney(input.estimatedValue)})`);
  }

  // Recency of touch.
  const daysSinceTouch = input.lastTouchAt
    ? Math.floor((now.getTime() - input.lastTouchAt.getTime()) / 86_400_000)
    : null;

  if (daysSinceTouch != null) {
    if (daysSinceTouch <= 7) {
      score += 10;
      reasons.push(`Active — last touch ${formatDays(daysSinceTouch)}`);
    } else if (daysSinceTouch <= 14) {
      score += 5;
      reasons.push(`Warming — last touch ${formatDays(daysSinceTouch)}`);
    } else if (daysSinceTouch <= 30) {
      score -= 10;
      reasons.push(`Cooling — no contact in ${formatDays(daysSinceTouch)}`);
    } else {
      score -= 20;
      reasons.push(`Stale — no contact in ${formatDays(daysSinceTouch)}`);
    }
  } else {
    // Never touched.
    score -= 5;
    reasons.push("No activity logged yet");
  }

  // Overdue tasks penalty.
  if (input.overdueTaskCount > 0) {
    const penalty = Math.min(15, input.overdueTaskCount * 5);
    score -= penalty;
    reasons.push(
      `${input.overdueTaskCount} overdue task${input.overdueTaskCount === 1 ? "" : "s"}`,
    );
  }

  // Clamp.
  score = Math.max(0, Math.min(100, Math.round(score)));

  // At-risk flag: active stage + (stale OR overdue tasks).
  const activeStage =
    input.stage === "QUOTED" ||
    input.stage === "NEGOTIATING" ||
    input.stage === "CONTACTED";
  const atRisk =
    activeStage &&
    ((daysSinceTouch != null && daysSinceTouch >= 14) ||
      input.overdueTaskCount > 0);

  return {
    score,
    tier: scoreTier(score),
    atRisk,
    reasons,
    daysSinceTouch,
  };
}

export function scoreTier(score: number): HealthTier {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "cool";
  return "stale";
}

export const TIER_LABEL: Record<HealthTier, string> = {
  hot:          "Hot",
  warm:         "Warm",
  cool:         "Cool",
  stale:        "Stale",
  "closed-won": "Won",
  "closed-lost": "Lost",
};

export const TIER_DESCRIPTION: Record<HealthTier, string> = {
  hot:          "On track to close. Keep the pressure up.",
  warm:         "Real progress. Schedule the next step.",
  cool:         "Signs of life but slipping. Make contact this week.",
  stale:        "Not moving. Re-engage or qualify out.",
  "closed-won": "This opportunity closed successfully.",
  "closed-lost": "Closed — record a lost reason so you can learn from it.",
};

// Color token map — consumers should read these as CSS custom properties
// if they exist, else fall back.
export const TIER_COLORS: Record<HealthTier, { bg: string; fg: string; dot: string }> = {
  hot: {
    bg: "var(--success-surface)",
    fg: "var(--success-fg)",
    dot: "var(--success-fg)",
  },
  warm: {
    bg: "var(--accent-surface)",
    fg: "var(--accent-primary)",
    dot: "var(--accent-primary)",
  },
  cool: {
    bg: "var(--warning-surface, var(--accent-surface))",
    fg: "var(--warning-fg, var(--accent-primary))",
    dot: "var(--warning-fg, var(--accent-primary))",
  },
  stale: {
    bg: "var(--danger-surface)",
    fg: "var(--danger-fg)",
    dot: "var(--danger-fg)",
  },
  "closed-won": {
    bg: "var(--success-surface)",
    fg: "var(--success-fg)",
    dot: "var(--success-fg)",
  },
  "closed-lost": {
    bg: "var(--surface-2)",
    fg: "var(--text-muted)",
    dot: "var(--text-faint)",
  },
};

function formatDays(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} week${d < 14 ? "" : "s"} ago`;
  return `${Math.floor(d / 30)} month${d < 60 ? "" : "s"} ago`;
}

function formatShortMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
