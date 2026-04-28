import * as React from "react";

// 8-tile KPI grid for the tenant Overview tab.
//
//   Users        Customers     Products      Quotes
//   12           248           34            612 (24 this mo)
//   ───────     ───────       ───────       ───────
//   Orders       Invoices      Revenue       A/R open
//   312 (8 mo)   480           $128k         $4,210
//
// Each tile is plain — no sparklines for v1. The optional `delta` and
// `subtitle` cover the period-over-period and unit-of-measurement
// affordances called out in the spec.

export interface TenantKpi {
  label: string;
  value: string;
  /** Subline — e.g. "24 this month" or "lifetime payments". */
  subtitle?: string;
  /** Period delta as a fraction; 0.18 = +18% vs prior period. */
  deltaPct?: number;
  /** Inverts the green/red mapping — increases in A/R are bad. */
  deltaInvert?: boolean;
  /** Visual emphasis for the row's most important metric. */
  emphasis?: "default" | "accent" | "success" | "warning";
}

const EMPHASIS: Record<NonNullable<TenantKpi["emphasis"]>, { bg: string; border: string; label: string }> = {
  default: { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     },
  accent:  { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" },
  success: { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     },
  warning: { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     },
};

export function TenantOverviewKPIs({ kpis }: { kpis: TenantKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => (
        <KpiTile key={k.label} kpi={k} />
      ))}
    </div>
  );
}

function KpiTile({ kpi }: { kpi: TenantKpi }) {
  const palette = EMPHASIS[kpi.emphasis ?? "default"];
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
      {kpi.subtitle && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {kpi.subtitle}
        </div>
      )}
    </div>
  );
}
