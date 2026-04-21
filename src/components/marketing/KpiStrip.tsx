import * as React from "react";

// KpiStrip — outcomes row used on the home page just before the final
// CTA. StatRow already exists for smaller stat-as-meta moments; this
// is the louder version: bigger numerals, a short phrase underneath,
// and an accent bar on the top edge of each cell so the strip reads
// as "results" rather than "trivia".
//
// Design notes:
//   • 4 cells on desktop, 2 on tablet, 1 on phone. A 3-col variant is
//     available for pages that want an odd count.
//   • The cells share a single inset border via a gap-px grid over a
//     subtle-border background — same trick StatRow uses. The
//     difference is the top accent stripe and the larger typography.
//   • We intentionally skip icons. Numbers are the payload; icons
//     would compete. Keep the cell busy-to-quiet ratio in favor of
//     the number.

export interface Kpi {
  value: React.ReactNode;
  label: React.ReactNode;
  /** Optional micro-caption under the label (e.g. "avg. across 40 shops"). */
  caption?: React.ReactNode;
}

export interface KpiStripProps {
  kpis: Kpi[];
  columns?: 3 | 4;
}

export function KpiStrip({ kpis, columns = 4 }: KpiStripProps) {
  const colClass = columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4";
  return (
    <div
      className={`grid grid-cols-1 gap-px overflow-hidden rounded-2xl ${colClass}`}
      style={{
        background: "var(--border-subtle)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, var(--text-default) 6%, transparent)",
      }}
    >
      {kpis.map((k, i) => (
        <div
          key={i}
          className="relative px-6 py-10"
          style={{ background: "var(--surface-1)" }}
        >
          {/* Top accent stripe — 2px, accent color, fades out at the
              horizontal edges so adjacent cells don't read as joined. */}
          <span
            aria-hidden
            className="absolute inset-x-6 top-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, var(--accent-primary) 20%, var(--accent-primary) 80%, transparent 100%)",
              opacity: 0.75,
            }}
          />
          <div
            className="text-4xl font-semibold tracking-tight md:text-5xl"
            style={{
              color: "var(--text-default)",
              letterSpacing: "-0.02em",
            }}
          >
            {k.value}
          </div>
          <div
            className="mt-2 text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            {k.label}
          </div>
          {k.caption && (
            <div
              className="mt-1 text-xs"
              style={{ color: "var(--text-faint)" }}
            >
              {k.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
