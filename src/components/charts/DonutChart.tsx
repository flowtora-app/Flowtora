"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  data: DonutSlice[];
  height?: number;
  valuePrefix?: string;
  innerLabel?: string; // center label, e.g. total
};

export function DonutChart({ data, height = 200, valuePrefix = "", innerLabel }: Props) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) {
    return (
      <div
        className="flex items-center justify-center rounded-lg"
        style={{ height, background: "var(--surface-0)", border: "1px dashed var(--border-subtle)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>No data</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={filtered}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          startAngle={90}
          endAngle={450}
        >
          {filtered.map((entry) => (
            <Cell key={entry.label} fill={entry.color} />
          ))}
        </Pie>
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
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted, #6b7280)" }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
