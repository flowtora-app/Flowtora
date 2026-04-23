"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// Dual-axis chart: bars on the left axis, line on the right. Used for
// "growth + funnel" — new sign-ups as bars, trial-to-paid % as a line.

export type ComposedPoint = { label: string; [k: string]: string | number };

type Props = {
  data: ComposedPoint[];
  barKey: string;
  barLabel: string;
  barColor?: string;
  lineKey: string;
  lineLabel: string;
  lineColor?: string;
  lineSuffix?: string; // "%" for conversion rates
  height?: number;
};

export function ComposedTrend({
  data,
  barKey, barLabel, barColor = "var(--accent-primary)",
  lineKey, lineLabel, lineColor = "var(--success)",
  lineSuffix = "",
  height = 220,
}: Props) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ height, background: "var(--surface-0)", border: "1px dashed var(--border-subtle)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>No data for this period</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "var(--text-faint)" }}
          axisLine={false}
          tickLine={false}
          width={36}
          tickFormatter={(v) => `${v}${lineSuffix}`}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => {
            if (name === lineLabel) return [`${Number(value).toLocaleString()}${lineSuffix}`, String(name)];
            return [Number(value).toLocaleString(), String(name)];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "var(--text-muted)" }} />
        <Bar
          yAxisId="left"
          dataKey={barKey}
          name={barLabel}
          fill={barColor}
          radius={[3, 3, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey={lineKey}
          name={lineLabel}
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
