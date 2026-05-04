import Link from "next/link";
import { isFavorable, type AnomalyRow, type MetricKey } from "@/server/platform/production-health";

const METRIC_LABEL: Record<MetricKey, string> = {
  onTimeRatePct: "On-time delivery",
  avgCycleDays: "Avg cycle time",
  avgOrderValue: "Avg order value",
  estMarginPct: "Est. gross margin",
  lateRatePct: "Late rate",
  equipmentUptimePct: "Equipment uptime",
  wasteRatePct: "Material waste",
  reworkRatePct: "Rework rate",
};

function formatValue(metric: MetricKey, n: number): string {
  if (metric === "avgOrderValue") return `$${Math.round(n).toLocaleString()}`;
  if (metric === "avgCycleDays")  return `${n.toFixed(1)}d`;
  return `${n.toFixed(1)}%`;
}

export function AnomalyList({ rows }: { rows: AnomalyRow[] }) {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
      {rows.map((r) => {
        const favorable = isFavorable(r.metric, r.direction);
        return (
          <li key={`${r.tenantId}-${r.metric}`}
              className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[180px_1fr_auto]">
            <Link href={`/platform/tenants/${r.tenantId}`}
                  className="font-medium hover:underline"
                  style={{ color: "var(--text-default)" }}>
              {r.tenantName}
            </Link>
            <div className="text-[12px]">
              <div style={{ color: "var(--text-default)" }}>
                {METRIC_LABEL[r.metric]} ·{" "}
                <strong className="tabular-nums">{formatValue(r.metric, r.value)}</strong>
              </div>
              <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
                Industry mean {formatValue(r.metric, r.industryMean)} · z-score{" "}
                <span className="tabular-nums">{r.zScore > 0 ? "+" : ""}{r.zScore}</span>
              </div>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    background: favorable ? "var(--success-surface)" : "var(--rose-50)",
                    color:      favorable ? "var(--success-fg)"      : "var(--rose-700)",
                    border:    `1px solid ${favorable ? "var(--success-fg)" : "var(--rose-700)"}`,
                  }}>
              {favorable ? "✓ Favorable" : "Outlier"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
