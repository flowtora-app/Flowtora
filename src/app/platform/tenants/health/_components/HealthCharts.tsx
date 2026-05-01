"use client";

import * as React from "react";
import {
  BarChartCard,
  Card,
  CardBody,
  CardHeader,
  LineChartCard,
} from "@/components/ui";
import type {
  DistributionBin,
  HeatmapCell,
  TrendPoint,
} from "@/server/platform/health-scoring";

// HealthCharts — three side-by-side surfaces: distribution histogram,
// 90-day score trend, and per-plan × score heatmap.

export function HealthCharts({
  dist,
  trend,
  heat,
}: {
  dist: DistributionBin[];
  trend: TrendPoint[];
  heat: { plans: string[]; cells: HeatmapCell[]; rangeLabels: string[] };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Distribution */}
      <Card>
        <CardHeader title="Score distribution" description="Count of tenants per 10-point bin" />
        <CardBody>
          <BarChartCard
            data={dist.map((d) => ({ bin: d.rangeLabel, count: d.count }))}
            xKey="bin"
            series={[{ dataKey: "count", name: "Tenants", color: "var(--brand-500)" }]}
            height="md"
            showLegend={false}
            emptyLabel="No tenants in this filter"
          />
        </CardBody>
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader title="90-day trend" description="Average score per day across tenants" />
        <CardBody>
          {trend.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-[12px]"
                 style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
              No snapshots yet. Click <span className="font-semibold">Recompute all scores</span> to seed.
            </div>
          ) : (
            <LineChartCard
              data={trend.map((p) => ({ day: p.dateIso.slice(5), avg: p.avgScore }))}
              xKey="day"
              series={[{ dataKey: "avg", name: "Avg score", color: "var(--emerald-600)" }]}
              height="md"
              showLegend={false}
              emptyLabel="No snapshots"
            />
          )}
        </CardBody>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader title="Plan × score heatmap" description="Where tenants cluster by tier" />
        <CardBody>
          <Heatmap
            plans={heat.plans}
            ranges={heat.rangeLabels}
            cells={heat.cells}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function Heatmap({
  plans,
  ranges,
  cells,
}: {
  plans: string[];
  ranges: string[];
  cells: HeatmapCell[];
}) {
  if (plans.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
        No tenants in this filter.
      </div>
    );
  }
  // Per-row max count drives heat intensity.
  const cellByKey = new Map(cells.map((c) => [`${c.plan}::${c.rangeLabel}`, c.count]));
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
            {ranges.map((r) => (
              <th key={r} className="px-2 py-1 text-center font-semibold" style={{ color: "var(--text-muted)" }}>
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => (
            <tr key={plan}>
              <td className="px-2 py-1 font-mono" style={{ color: "var(--text-default)" }}>{plan}</td>
              {ranges.map((r) => {
                const count = cellByKey.get(`${plan}::${r}`) ?? 0;
                const intensity = count === 0 ? 0 : 0.15 + 0.85 * (count / maxCount);
                const bg = count === 0
                  ? "var(--surface-2)"
                  : `color-mix(in oklab, var(--brand-500) ${Math.round(intensity * 100)}%, var(--surface-1))`;
                return (
                  <td
                    key={r}
                    className="px-2 py-1 text-center tabular-nums"
                    style={{
                      background: bg,
                      color: count === 0 ? "var(--text-faint)" : "var(--text-default)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
