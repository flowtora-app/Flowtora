import * as React from "react";

// 5-tile KPI band at the top of /platform/feature-flags.
//
//   Total flags    Global overrides   Tenant overrides   High-impact   Stale (>30d)
//   10             3                  18                 7             4

export interface FeatureFlagsKpi {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}

const TONE: Record<NonNullable<FeatureFlagsKpi["tone"]>, { bg: string; border: string; label: string }> = {
  default: { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     },
  accent:  { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" },
  success: { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     },
  warning: { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     },
  danger:  { bg: "var(--danger-surface)",  border: "var(--danger-fg)",      label: "var(--danger-fg)"      },
};

export function FeatureFlagsKPIBand({ kpis }: { kpis: FeatureFlagsKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <Tile key={k.label} kpi={k} />
      ))}
    </div>
  );
}

function Tile({ kpi }: { kpi: FeatureFlagsKpi }) {
  const palette = TONE[kpi.tone ?? "default"];
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: palette.label }}>
        {kpi.label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
        {kpi.value}
      </div>
      {kpi.hint && <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{kpi.hint}</div>}
    </div>
  );
}
