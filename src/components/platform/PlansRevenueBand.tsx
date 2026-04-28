import * as React from "react";

// 5-tile revenue summary at the top of the plans catalog.
//
//   Total MRR    Active tenants   Trial      Past-due    Avg revenue/tenant
//   $12,480      214              38         5           $58.32
//
// Same shape as the other admin KPI bands. `deltaInvert` flips the
// green/red mapping for tiles where increases are bad — past-due,
// for example.

export interface PlansKpi {
  label: string;
  value: string;
  hint?: string;
  /** Period delta as a fraction; 0.18 = +18% vs prior period. */
  deltaPct?: number;
  /** Inverts the green/red mapping — increases in past-due are bad. */
  deltaInvert?: boolean;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}

const TONE: Record<NonNullable<PlansKpi["tone"]>, { bg: string; border: string; label: string }> = {
  default: { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     },
  accent:  { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" },
  success: { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     },
  warning: { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     },
  danger:  { bg: "var(--danger-surface)",  border: "var(--danger-fg)",      label: "var(--danger-fg)"      },
};

export function PlansRevenueBand({ kpis }: { kpis: PlansKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <Tile key={k.label} kpi={k} />
      ))}
    </div>
  );
}

function Tile({ kpi }: { kpi: PlansKpi }) {
  const palette = TONE[kpi.tone ?? "default"];
  const hasDelta = typeof kpi.deltaPct === "number" && Number.isFinite(kpi.deltaPct);
  const isPositive = hasDelta
    ? (kpi.deltaInvert ? kpi.deltaPct! < 0 : kpi.deltaPct! > 0)
    : false;
  const isNegative = hasDelta
    ? (kpi.deltaInvert ? kpi.deltaPct! > 0 : kpi.deltaPct! < 0)
    : false;
  const trendColor = isPositive
    ? "var(--success-fg)"
    : isNegative
    ? "var(--danger-fg)"
    : "var(--text-muted)";
  const trendBg = isPositive
    ? "var(--success-surface)"
    : isNegative
    ? "var(--danger-surface)"
    : "var(--surface-2)";
  const arrow = isPositive ? "↑" : isNegative ? "↓" : "→";

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
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-2xl font-semibold tabular-nums tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          {kpi.value}
        </span>
        {hasDelta && (
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ background: trendBg, color: trendColor }}
            title={`${(kpi.deltaPct! * 100).toFixed(1)}% vs prior period`}
          >
            <span aria-hidden>{arrow}</span>
            {Math.abs(kpi.deltaPct! * 100).toFixed(0)}%
          </span>
        )}
      </div>
      {kpi.hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {kpi.hint}
        </div>
      )}
    </div>
  );
}
