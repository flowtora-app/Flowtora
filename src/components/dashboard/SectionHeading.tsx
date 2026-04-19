import * as React from "react";

// Phase 6 — shared section heading used inside persona dashboards.
// Kept as its own tiny component so the typography is consistent
// without duplicating the Tailwind utility string across every view.

export function SectionHeading({ title }: { title: React.ReactNode }) {
  return (
    <h2
      className="mt-2 text-xs font-semibold uppercase tracking-wider"
      style={{ color: "var(--text-muted)" }}
    >
      {title}
    </h2>
  );
}
