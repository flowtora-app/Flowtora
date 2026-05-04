// Page 31 — capacity utilization gauge.
//
// Bucketed by Product.kind (Sign / Print / Install service / etc.).
// Utilization = active / (active + 30d completed). High utilization
// with low recent completions = bottleneck signal.

import type { CapacityRow } from "@/server/platform/operations";

const BUCKET_LABEL: Record<string, string> = {
  SIGN: "Signs",
  PRINT: "Print",
  INSTALL_SERVICE: "Installation",
  DESIGN_SERVICE: "Design",
  LABOR: "Labor",
  SETUP_FEE: "Setup",
  RUSH_FEE: "Rush",
  DELIVERY_FEE: "Delivery",
  STANDARD: "Standard goods",
  CUSTOM: "Custom",
  UNKNOWN: "Untyped",
};

export function CapacityGauge({ rows }: { rows: CapacityRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        No active jobs to bucket.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const pct = Math.round(r.utilizationPct * 100);
        const tone =
          pct >= 80 ? "danger"  :
          pct >= 60 ? "warning" :
          pct >= 30 ? "good"    :
                      "default";
        const fillColor =
          tone === "danger"  ? "var(--danger-fg)"  :
          tone === "warning" ? "var(--warning-fg)" :
          tone === "good"    ? "var(--success-fg)" :
                                "var(--accent-primary)";
        return (
          <li key={r.bucket} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
                {BUCKET_LABEL[r.bucket] ?? r.bucket}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                <span className="tabular-nums" style={{ color: "var(--text-default)" }}>{r.active}</span>{" "}
                active ·{" "}
                <span className="tabular-nums">{r.recentCompleted}</span> completed 30d ·{" "}
                <span
                  className="tabular-nums font-semibold"
                  style={{ color: fillColor }}
                >
                  {pct}%
                </span>
              </span>
            </div>
            <div
              className="h-2 rounded-full"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: fillColor,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
