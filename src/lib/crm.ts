import type { PipelineStage } from "@prisma/client";

export const PIPELINE_STAGES: { value: PipelineStage; label: string; color: string }[] = [
  { value: "NEW_LEAD",    label: "New lead",    color: "#6b7c93" },
  { value: "CONTACTED",   label: "Contacted",   color: "#4f8cff" },
  { value: "QUOTED",      label: "Quoted",      color: "#9b6dff" },
  { value: "NEGOTIATING", label: "Negotiating", color: "#f0a043" },
  { value: "WON",         label: "Won",         color: "#3fb37f" },
  { value: "LOST",        label: "Lost",        color: "#c54a4a" },
];

export const ACTIVE_PIPELINE_STAGES: PipelineStage[] = ["NEW_LEAD", "CONTACTED", "QUOTED", "NEGOTIATING"];

export function stageLabel(stage: PipelineStage): string {
  return PIPELINE_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function stageColor(stage: PipelineStage): string {
  return PIPELINE_STAGES.find((s) => s.value === stage)?.color ?? "#6b7c93";
}

export const DEFAULT_LEAD_SOURCES = [
  "Website",
  "Referral",
  "Walk-in",
  "Phone",
  "Google",
  "Trade show",
  "Repeat customer",
  "Other",
];

// Phase 7 — canonical lost reasons.
//
// The free-form "lost reason" text box was a real problem — every rep
// wrote something slightly different ("too expensive", "price", "Price
// too high") which made post-mortem analytics useless. We standardise
// on a short list the team can pick from, plus an "Other" slot for the
// genuinely unusual cases (captured in free text). The list is short
// on purpose: 6–8 categories is what survives post-mortem discipline.
export const LOST_REASONS = [
  { value: "price",        label: "Price / budget" },
  { value: "timing",       label: "Timing / project delayed" },
  { value: "competitor",   label: "Chose a competitor" },
  { value: "no_response",  label: "Customer stopped responding" },
  { value: "scope",        label: "Scope mismatch" },
  { value: "disqualified", label: "Disqualified / not a fit" },
  { value: "other",        label: "Other" },
] as const;

export type LostReasonValue = (typeof LOST_REASONS)[number]["value"];

export function lostReasonLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  // Stored format is "<value>: <detail>" or just "<value>". Anything
  // that doesn't match our canonical list falls back to the raw text —
  // legacy rows from before Phase 7 still render as written.
  const [code, ...rest] = value.split(":");
  const canonical = LOST_REASONS.find((r) => r.value === code.trim());
  if (!canonical) return value;
  const detail = rest.join(":").trim();
  return detail ? `${canonical.label} — ${detail}` : canonical.label;
}
