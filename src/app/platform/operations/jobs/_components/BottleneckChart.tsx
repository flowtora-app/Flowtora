import { BarChartCard, CHART_PALETTE } from "@/components/ui/Charts";
import type { BottleneckRow } from "@/server/platform/operations";
import { STATUS_LABEL } from "./shared";

export function BottleneckChart({ rows }: { rows: BottleneckRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        No open orders to analyze.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <BarChartCard
        data={rows.map((r) => ({
          status: STATUS_LABEL[r.status],
          "Avg days": r.avgDays,
        }))}
        xKey="status"
        series={[{ dataKey: "Avg days", color: CHART_PALETTE[0] }]}
        height="sm"
        valueFormat={(n) => `${n}d`}
      />
      <ul className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        {rows.map((r) => (
          <li key={r.status}
              className="rounded-md border px-3 py-2"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              {STATUS_LABEL[r.status]}
            </div>
            <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
              <span className="tabular-nums">{r.count}</span> open ·{" "}
              avg <span className="tabular-nums">{r.avgDays}d</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
