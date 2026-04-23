"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

// Minimal sparkline — no axes, no tooltip, no legend. Drops into KPI
// cards and the MRR hero. Accepts either an array of numbers (shorthand)
// or labeled points. Auto-scales Y so a flat line doesn't dominate.

type Props = {
  data: number[] | { label: string; value: number }[];
  color?: string;
  fill?: boolean;
  height?: number;
  strokeWidth?: number;
  "aria-label"?: string;
};

export function Sparkline({
  data,
  color = "var(--accent-primary)",
  fill = true,
  height = 40,
  strokeWidth = 1.5,
  "aria-label": ariaLabel,
}: Props) {
  const points =
    data.length === 0
      ? []
      : typeof data[0] === "number"
        ? (data as number[]).map((v, i) => ({ label: String(i), value: v }))
        : (data as { label: string; value: number }[]);

  if (!points.length) {
    return <div style={{ height }} aria-hidden />;
  }

  const Chart = fill ? AreaChart : LineChart;
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          {fill ? (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={strokeWidth}
              fill={color}
              fillOpacity={0.18}
              dot={false}
              isAnimationActive={false}
            />
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={strokeWidth}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
