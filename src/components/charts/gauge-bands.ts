// Shared 0-100 score band mapping. Lives in its own (non-"use client")
// module so server components can import `bandFor` without pulling in
// the Recharts-backed Gauge client bundle.

export type Band = { min: number; color: string; label: string };

const BANDS: Band[] = [
  { min: 85, color: "var(--success)", label: "Excellent" },
  { min: 70, color: "var(--info)",    label: "Healthy"   },
  { min: 50, color: "var(--warning)", label: "Watch"     },
  { min: 0,  color: "var(--danger)",  label: "At risk"   },
];

export function bandFor(score: number): Band {
  return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
}
