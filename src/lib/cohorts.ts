// Phase 19 — release cohort labels and presentation helpers.
//
// `BetaCohort` on Tenant segments the customer base into rollout waves.
// Platform staff use it to gate early-access features, batch-enable beta
// flags, and cross-reference feedback. NONE = general availability.

import type { BetaCohort } from "@prisma/client";

export const COHORT_OPTIONS: { value: BetaCohort; label: string; description: string }[] = [
  { value: "NONE",  label: "GA",    description: "General availability — default cohort" },
  { value: "ALPHA", label: "Alpha", description: "Earliest partners; may see breaking changes" },
  { value: "BETA",  label: "Beta",  description: "Invited early-access group" },
  { value: "PILOT", label: "Pilot", description: "Committed pilot customer with support SLA" },
];

const COHORT_CHIP: Record<BetaCohort, { bg: string; fg: string }> = {
  NONE:  { bg: "var(--surface-2)",      fg: "var(--text-muted)" },
  ALPHA: { bg: "rgba(239, 68, 68, 0.15)",  fg: "#ef4444" },
  BETA:  { bg: "rgba(245, 158, 11, 0.15)", fg: "#f59e0b" },
  PILOT: { bg: "rgba(139, 92, 246, 0.15)", fg: "#8b5cf6" },
};

export function cohortLabel(c: BetaCohort): string {
  return COHORT_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

export function cohortChip(c: BetaCohort): { bg: string; fg: string } {
  return COHORT_CHIP[c];
}
