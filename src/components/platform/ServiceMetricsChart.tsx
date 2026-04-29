"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// Bucketed bar chart for service metrics — one bar per time bucket,
// height = event count. Used by /platform/health for "errors over
// time" and "logins over time" series. Accepts pre-bucketed data so
// the server can compute the buckets and shape the labels however
// the active range needs.

export interface MetricsBucket {
  /** Bucket start timestamp (ms epoch). */
  t: number;
  /** Pre-formatted x-axis label, e.g. "14:00" or "Mon". */
  label: string;
  /** Count for this bucket. */
  count: number;
}

interface ServiceMetricsChartProps {
  buckets: MetricsBucket[];
  /** Visual treatment — drives bar color. */
  tone?: "accent" | "danger" | "warning" | "success";
  /** Y-axis label, optional. */
  yLabel?: string;
  /** Height in pixels. */
  height?: number;
}

const TONE_COLOR: Record<NonNullable<ServiceMetricsChartProps["tone"]>, string> = {
  accent:  "var(--accent-primary)",
  danger:  "var(--danger-fg)",
  warning: "var(--warning-fg)",
  success: "var(--success-fg)",
};

export function ServiceMetricsChart({
  buckets,
  tone = "accent",
  yLabel,
  height = 140,
}: ServiceMetricsChartProps) {
  const total = buckets.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md text-xs"
        style={{
          height,
          background: "var(--surface-2)",
          border: "1px dashed var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        No events in the active window.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="2 2" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-subtle)" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              borderRadius: "6px",
              fontSize: "12px",
              color: "var(--text-default)",
            }}
            cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
            labelFormatter={(label) => `${label}${yLabel ? ` · ${yLabel}` : ""}`}
            formatter={(value) => [
              typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
              yLabel ?? "events",
            ]}
          />
          <Bar
            dataKey="count"
            fill={TONE_COLOR[tone]}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
