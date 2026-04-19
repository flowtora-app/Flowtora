import * as React from "react";
import {
  TIER_COLORS,
  TIER_DESCRIPTION,
  TIER_LABEL,
  type HealthReport,
} from "@/lib/opportunity-health";

// Phase 7 — detailed health card for the customer detail page.
//
// Shows the score + tier with a progress bar, then the transparent
// reason list so a sales rep can see exactly why the score is what it
// is. No hidden weights — the engine's reasons become the UI.

export function OpportunityHealthCard({ report }: { report: HealthReport }) {
  const color = TIER_COLORS[report.tier];
  const isClosed = report.tier === "closed-won" || report.tier === "closed-lost";

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <header
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-default)" }}
            >
              Opportunity health
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {TIER_DESCRIPTION[report.tier]}
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: color.bg, color: color.fg }}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: color.dot }}
            />
            {TIER_LABEL[report.tier]}
            {!isClosed && <span style={{ opacity: 0.75 }}>· {report.score}</span>}
          </span>
        </div>
        {!isClosed && (
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${report.score}%`,
                background: color.dot,
                transition: "width 200ms ease",
              }}
            />
          </div>
        )}
      </header>

      {report.atRisk && !isClosed && (
        <div
          className="flex items-start gap-2 px-5 py-3 text-xs"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span aria-hidden>!</span>
          <span>
            <strong>At risk.</strong> This opportunity has stale activity in an
            active stage. Re-engage now or qualify out.
          </span>
        </div>
      )}

      <ul className="divide-y text-sm" style={{ borderColor: "var(--border-subtle)" }}>
        {report.reasons.map((r, i) => (
          <li
            key={`${i}-${r}`}
            className="flex items-start gap-3 px-5 py-2.5"
            style={{ color: "var(--text-default)" }}
          >
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--text-faint)" }}
            />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
