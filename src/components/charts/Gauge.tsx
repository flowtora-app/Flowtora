"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { bandFor } from "@/components/charts/gauge-bands";

// Simple 0-100 radial gauge built on Recharts PieChart as a half-donut.
// Chose PieChart over RadialBarChart because Recharts' RadialBarChart
// doesn't render a clean "empty track" layer for partial scores — a
// two-slice Pie gives us exact control.

type Props = {
  value: number; // 0..100
  size?: number; // px square
};

export function Gauge({ value, size = 180 }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const band = bandFor(clamped);

  const data = [
    { name: "score", value: clamped, fill: band.color },
    { name: "rest",  value: 100 - clamped, fill: "var(--surface-2)" },
  ];

  return (
    <div className="relative" style={{ width: size, height: size / 2 + 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="100%"
            innerRadius={size * 0.36}
            outerRadius={size * 0.46}
            paddingAngle={0}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end"
        style={{ paddingBottom: 2 }}
      >
        <span
          className="font-semibold tabular-nums"
          style={{ fontSize: size * 0.2, color: band.color, lineHeight: 1 }}
        >
          {clamped}
        </span>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {band.label}
        </span>
      </div>
    </div>
  );
}
