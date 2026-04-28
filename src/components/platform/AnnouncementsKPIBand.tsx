import * as React from "react";

// 4-tile KPI band at the top of /platform/announcements.
//
//   Live         Scheduled      Drafts       Critical
//   3            2              5            1 (visible now)

export interface AnnouncementsKpi {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}

const TONE: Record<NonNullable<AnnouncementsKpi["tone"]>, { bg: string; border: string; label: string }> = {
  default: { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     },
  accent:  { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" },
  success: { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     },
  warning: { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     },
  danger:  { bg: "var(--danger-surface)",  border: "var(--danger-fg)",      label: "var(--danger-fg)"      },
};

export function AnnouncementsKPIBand({ kpis }: { kpis: AnnouncementsKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => (
        <Tile key={k.label} kpi={k} />
      ))}
    </div>
  );
}

function Tile({ kpi }: { kpi: AnnouncementsKpi }) {
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
      <div
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: palette.label }}
      >
        {kpi.label}
      </div>
      <div
        className="mt-2 text-2xl font-semibold tabular-nums tracking-tight"
        style={{ color: "var(--text-default)" }}
      >
        {kpi.value}
      </div>
      {kpi.hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {kpi.hint}
        </div>
      )}
    </div>
  );
}
