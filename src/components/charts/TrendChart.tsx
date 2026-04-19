"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export type TrendPoint = {
  label: string; // x-axis label (e.g. "Jan", "Week 3", "Apr 12")
  [key: string]: string | number; // one or more numeric series
};

type SeriesDef = {
  key: string;
  label: string;
  color: string;
};

type Props = {
  data: TrendPoint[];
  series: SeriesDef[];
  height?: number;
  valuePrefix?: string; // e.g. "$"
  filled?: boolean;     // area chart vs line chart
};

function formatValue(v: number, prefix = "") {
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${prefix}${(v / 1_000).toFixed(1)}k`;
  return `${prefix}${v.toLocaleString()}`;
}

export function TrendChart({
  data,
  series,
  height = 220,
  valuePrefix = "",
  filled = false,
}: Props) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ height, background: "var(--surface-0)", border: "1px dashed var(--border-subtle)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          No data for this period
        </span>
      </div>
    );
  }

  const ChartComponent = filled ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle, #e5e7eb)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--text-faint, #9ca3af)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--text-faint, #9ca3af)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatValue(v as number, valuePrefix)}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1, #fff)",
            border: "1px solid var(--border-subtle, #e5e7eb)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => [
            `${valuePrefix}${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            String(name),
          ]}
        />
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "var(--text-muted, #6b7280)" }}
          />
        )}
        {filled
          ? series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))
          : series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
      </ChartComponent>
    </ResponsiveContainer>
  );
}
