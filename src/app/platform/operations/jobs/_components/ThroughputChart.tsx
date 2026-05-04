"use client";

import { LineChartCard, CHART_PALETTE } from "@/components/ui/Charts";
import type { ThroughputPoint } from "@/server/platform/operations";

export function ThroughputChart({ points }: { points: ThroughputPoint[] }) {
  if (points.every((p) => p.created === 0 && p.completed === 0)) {
    return (
      <p className="py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        No orders in the last 30 days.
      </p>
    );
  }
  // Format for Recharts.
  const data = points.map((p) => ({
    date: p.date.slice(5), // MM-DD
    Created: p.created,
    Completed: p.completed,
  }));
  return (
    <LineChartCard
      data={data}
      xKey="date"
      series={[
        { dataKey: "Created",   name: "Created",   color: CHART_PALETTE[0] },
        { dataKey: "Completed", name: "Completed", color: CHART_PALETTE[2] },
      ]}
      height="md"
      valueFormat={(n) => n.toString()}
    />
  );
}
