import * as React from "react";

// Module-adoption visualization.
//
// One row per product module — Customers, Quotes, Orders, Proofs,
// Invoices, Install events, Tasks. Each row shows:
//
//   [icon]  Module name           ▰▰▰▰▰▰▰▰▱▱  78%
//                                 142 records (last 30d) · 47 tenants
//
// Bar width is the % of active tenants who have ever created a record
// of that type. Color jumps from neutral → accent as adoption climbs
// (light gray for low adoption, full accent for healthy).

export interface AdoptionRow {
  /** Display name shown to the left. */
  label: string;
  /** Distinct tenants with at least one record of this module. */
  tenantsUsing: number;
  /** Records created in the trailing 30 days. */
  records30d: number;
  /** Lifetime records, optional. */
  recordsAll: number;
}

export function UsageAdoptionBars({
  rows,
  totalActiveTenants,
}: {
  rows: AdoptionRow[];
  totalActiveTenants: number;
}) {
  const safeTotal = Math.max(1, totalActiveTenants);
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = Math.min(100, Math.round((r.tenantsUsing / safeTotal) * 100));
        // Color ramp: < 25% muted, 25–60% accent-subtle, ≥ 60% accent.
        const barColor =
          pct >= 60
            ? "var(--accent-primary)"
            : pct >= 25
            ? "color-mix(in oklab, var(--accent-primary) 60%, var(--surface-3))"
            : "var(--surface-3)";
        return (
          <li key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
                {r.label}
              </span>
              <span
                className="tabular-nums"
                style={{ color: pct >= 25 ? "var(--text-default)" : "var(--text-muted)" }}
              >
                {pct}%
              </span>
            </div>
            <div
              className="mt-1 h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--surface-3)" }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${pct}%`,
                  background: barColor,
                  transitionDuration: "var(--duration-base)",
                }}
              />
            </div>
            <div
              className="mt-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {r.tenantsUsing} tenant{r.tenantsUsing === 1 ? "" : "s"} ·{" "}
              {r.records30d.toLocaleString()} record{r.records30d === 1 ? "" : "s"} in last 30d ·{" "}
              {r.recordsAll.toLocaleString()} lifetime
            </div>
          </li>
        );
      })}
    </ul>
  );
}
