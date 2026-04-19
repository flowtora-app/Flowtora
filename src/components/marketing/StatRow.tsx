import * as React from "react";

// StatRow — 3-4 numeric highlights displayed in a strip. Good for the
// "by the numbers" moment on a landing page. Each stat is bold number
// + small muted label.

export interface Stat {
  value: React.ReactNode;
  label: React.ReactNode;
}

export interface StatRowProps {
  stats: Stat[];
}

export function StatRow({ stats }: StatRowProps) {
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl md:grid-cols-4"
      style={{ background: "var(--border-subtle)", border: "1px solid var(--border-subtle)" }}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          className="px-6 py-8 text-center"
          style={{ background: "var(--surface-1)" }}
        >
          <div
            className="text-3xl font-semibold tracking-tight md:text-4xl"
            style={{ color: "var(--text-default)" }}
          >
            {s.value}
          </div>
          <div className="mt-1 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
