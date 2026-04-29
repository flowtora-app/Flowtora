import * as React from "react";

// 5-tile KPI band at the top of /platform/settings.
//
//   Env health    Critical missing   Integrations   Recent admin   Environment
//   8/10          0                  4/5 healthy    14 (24h)       PRODUCTION

export interface SettingsKpi {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  /** Show a status dot beside the value (used for the env tile). */
  dot?: boolean;
}

const TONE: Record<NonNullable<SettingsKpi["tone"]>, { bg: string; border: string; label: string }> = {
  default: { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     },
  accent:  { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" },
  success: { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     },
  warning: { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     },
  danger:  { bg: "var(--danger-surface)",  border: "var(--danger-fg)",      label: "var(--danger-fg)"      },
};

export function SettingsKPIBand({ kpis }: { kpis: SettingsKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <Tile key={k.label} kpi={k} />
      ))}
    </div>
  );
}

function Tile({ kpi }: { kpi: SettingsKpi }) {
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
      <div className="mt-2 flex items-baseline gap-2">
        {kpi.dot && (
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: palette.label }} />
        )}
        <span className="truncate text-xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
          {kpi.value}
        </span>
      </div>
      {kpi.hint && <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{kpi.hint}</div>}
    </div>
  );
}
