"use client";

import * as React from "react";
import {
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  ResponsiveContainer,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  RadialBarChart, RadialBar,
} from "recharts";

// Charts — Spec Page 0 §0.5.40, §0.9.
//
// Wraps Recharts with the spec's defaults baked in:
//   - heights sm 240 / md 320 (default) / lg 480 / xl 640
//   - axis labels neutral-500 11px tabular
//   - horizontal-only gridlines, no axis line by default
//   - dark tooltip with brand-aware swatch dot, tabular nums
//   - bottom-center legend ≤4 series, right-side scroll for >4
//   - 400ms mount, 200ms update animation
//   - Chart palette: 10-color categorical from Spec §0.2

export const CHART_PALETTE = [
  "var(--brand-600, #7C3AED)",
  "var(--cyan-500, #06B6D4)",
  "var(--emerald-500, #10B981)",
  "var(--amber-500, #F59E0B)",
  "var(--rose-500, #F43F5E)",
  "#3B82F6",
  "var(--brand-500, #8B5CF6)",
  "#EC4899",
  "#14B8A6",
  "#F97316",
] as const;

type ChartHeight = "sm" | "md" | "lg" | "xl";

const HEIGHT_PX: Record<ChartHeight, number> = {
  sm: 240,
  md: 320,
  lg: 480,
  xl: 640,
};

interface CommonProps<T extends Record<string, unknown>> {
  data: T[];
  height?: ChartHeight;
  className?: string;
  /** Format the y-axis tick + tooltip value. */
  valueFormat?: (n: number) => string;
  /** Empty state copy when data is empty. */
  emptyLabel?: string;
}

function defaultFormat(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 10_000)        return (n / 1000).toFixed(0) + "K";
  if (Math.abs(n) >= 1_000)         return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function ChartShell({ height, children, className, isEmpty, emptyLabel }: {
  height: ChartHeight;
  children: React.ReactNode;
  className?: string;
  isEmpty: boolean;
  emptyLabel: string;
}) {
  if (isEmpty) {
    return (
      <div
        className={className}
        style={{
          height: HEIGHT_PX[height],
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg, 8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
        }}
      >
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className={className} style={{ width: "100%", height: HEIGHT_PX[height] }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

// Recharts' tooltip-content prop is invoked with TooltipProps but we
// only consume a subset; locally narrow to the shape we use.
type TooltipPayloadItem = { color?: string; name?: React.ReactNode; value?: number | string | unknown };
type TooltipShape = {
  active?: boolean;
  payload?: readonly TooltipPayloadItem[];
  label?: React.ReactNode;
};

function makeTooltip(valueFormat: (n: number) => string) {
  return function ChartTooltip(props: TooltipShape) {
    const { active, payload, label } = props;
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: "var(--bg-inverse, #0F172A)",
          color: "#fff",
          borderRadius: 6,
          boxShadow: "var(--shadow-lg)",
          padding: "8px 12px",
          fontSize: 12,
        }}
      >
        {label != null && <div style={{ marginBottom: 4, fontWeight: 600 }}>{label}</div>}
        {payload.map((p, i) => {
          const n = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />
              <span style={{ opacity: 0.85 }}>{p.name}</span>
              <span style={{ marginLeft: "auto", fontWeight: 600 }}>{valueFormat(n)}</span>
            </div>
          );
        })}
      </div>
    );
  };
}

const AXIS_PROPS = {
  tick: { fill: "var(--slate-500, var(--text-muted))", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

const GRID_PROPS = { stroke: "var(--slate-100, var(--border-subtle))", strokeDasharray: "0", vertical: false } as const;

/* ────────────────────────────────────────────────────────────── */
/* LineChart                                                    */
/* ────────────────────────────────────────────────────────────── */

export interface LineChartProps<T extends Record<string, unknown>> extends CommonProps<T> {
  xKey: string;
  series: { dataKey: string; name?: string; color?: string }[];
  showLegend?: boolean;
}

export function LineChartCard<T extends Record<string, unknown>>({
  data, xKey, series, height = "md", showLegend = true, className, valueFormat = defaultFormat, emptyLabel = "No data for this range",
}: LineChartProps<T>) {
  return (
    <ChartShell height={height} className={className} isEmpty={data.length === 0} emptyLabel={emptyLabel}>
      <LineChart data={data} margin={{ top: 16, right: 24, left: 24, bottom: 24 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey={xKey} {...AXIS_PROPS} />
        <YAxis tickFormatter={valueFormat} {...AXIS_PROPS} />
        <Tooltip content={makeTooltip(valueFormat)} cursor={{ stroke: "var(--slate-300)", strokeDasharray: "4 4" }} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />}
        {series.map((s, i) => (
          <Line
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name ?? s.dataKey}
            stroke={s.color ?? CHART_PALETTE[i % CHART_PALETTE.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive
            animationDuration={400}
          />
        ))}
      </LineChart>
    </ChartShell>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* AreaChart (stacked composition)                              */
/* ────────────────────────────────────────────────────────────── */

export interface AreaChartProps<T extends Record<string, unknown>> extends CommonProps<T> {
  xKey: string;
  series: { dataKey: string; name?: string; color?: string }[];
  stacked?: boolean;
  showLegend?: boolean;
}

export function AreaChartCard<T extends Record<string, unknown>>({
  data, xKey, series, stacked = true, height = "md", showLegend = true, className, valueFormat = defaultFormat, emptyLabel = "No data for this range",
}: AreaChartProps<T>) {
  return (
    <ChartShell height={height} className={className} isEmpty={data.length === 0} emptyLabel={emptyLabel}>
      <AreaChart data={data} margin={{ top: 16, right: 24, left: 24, bottom: 24 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey={xKey} {...AXIS_PROPS} />
        <YAxis tickFormatter={valueFormat} {...AXIS_PROPS} />
        <Tooltip content={makeTooltip(valueFormat)} cursor={{ stroke: "var(--slate-300)", strokeDasharray: "4 4" }} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />}
        {series.map((s, i) => (
          <Area
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name ?? s.dataKey}
            stroke={s.color ?? CHART_PALETTE[i % CHART_PALETTE.length]}
            fill={s.color ?? CHART_PALETTE[i % CHART_PALETTE.length]}
            fillOpacity={0.18}
            strokeWidth={2}
            stackId={stacked ? "1" : undefined}
            isAnimationActive
            animationDuration={400}
          />
        ))}
      </AreaChart>
    </ChartShell>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* BarChart (vertical or horizontal)                            */
/* ────────────────────────────────────────────────────────────── */

export interface BarChartProps<T extends Record<string, unknown>> extends CommonProps<T> {
  xKey: string;
  series: { dataKey: string; name?: string; color?: string }[];
  /** "vertical" (default) shows columns; "horizontal" rotates for long labels. */
  layout?: "vertical" | "horizontal";
  stacked?: boolean;
  showLegend?: boolean;
}

export function BarChartCard<T extends Record<string, unknown>>({
  data, xKey, series, layout = "vertical", stacked, height = "md", showLegend = true, className, valueFormat = defaultFormat, emptyLabel = "No data for this range",
}: BarChartProps<T>) {
  return (
    <ChartShell height={height} className={className} isEmpty={data.length === 0} emptyLabel={emptyLabel}>
      <BarChart
        data={data}
        layout={layout === "horizontal" ? "vertical" : "horizontal"}
        margin={{ top: 16, right: 24, left: 24, bottom: 24 }}
      >
        <CartesianGrid {...GRID_PROPS} />
        {layout === "horizontal" ? (
          <>
            <XAxis type="number" tickFormatter={valueFormat} {...AXIS_PROPS} />
            <YAxis dataKey={xKey} type="category" {...AXIS_PROPS} width={100} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} {...AXIS_PROPS} />
            <YAxis tickFormatter={valueFormat} {...AXIS_PROPS} />
          </>
        )}
        <Tooltip content={makeTooltip(valueFormat)} cursor={{ fill: "var(--surface-3)", opacity: 0.4 }} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />}
        {series.map((s, i) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name ?? s.dataKey}
            fill={s.color ?? CHART_PALETTE[i % CHART_PALETTE.length]}
            stackId={stacked ? "1" : undefined}
            isAnimationActive
            animationDuration={400}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartShell>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* DonutChart (composition with center metric)                  */
/* ────────────────────────────────────────────────────────────── */

export interface DonutChartProps extends CommonProps<{ name: string; value: number }> {
  /** Optional centered label (e.g. total). */
  centerLabel?: React.ReactNode;
  /** Optional explicit colors per slice. */
  colors?: string[];
}

export function DonutChartCard({
  data, height = "md", className, valueFormat = defaultFormat, emptyLabel = "No data", centerLabel, colors,
}: DonutChartProps) {
  return (
    <ChartShell height={height} className={className} isEmpty={data.length === 0} emptyLabel={emptyLabel}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={1}
          isAnimationActive
          animationDuration={400}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors?.[i] ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip content={makeTooltip(valueFormat)} />
        <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }} />
        {centerLabel && (
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 16, fontWeight: 700, fill: "var(--text-default)" }}
          >
            {centerLabel}
          </text>
        )}
      </PieChart>
    </ChartShell>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* GaugeChart (single KPI vs goal)                              */
/* ────────────────────────────────────────────────────────────── */

export interface GaugeChartProps extends Omit<CommonProps<never>, "data"> {
  value: number;
  max: number;
  label?: React.ReactNode;
  color?: string;
}

export function GaugeChart({
  value, max, height = "sm", className, valueFormat = defaultFormat, label, color,
}: GaugeChartProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const data = [{ name: "value", value: pct, fill: color ?? CHART_PALETTE[0] }];
  return (
    <ChartShell height={height} className={className} isEmpty={false} emptyLabel="">
      <RadialBarChart
        data={data}
        innerRadius="70%"
        outerRadius="100%"
        startAngle={180}
        endAngle={0}
      >
        <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "var(--surface-3)" }} />
        <text x="50%" y="60%" textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: "var(--text-default)" }}>
          {valueFormat(value)}
        </text>
        {label && (
          <text x="50%" y="80%" textAnchor="middle" style={{ fontSize: 11, fill: "var(--text-muted)" }}>
            {label}
          </text>
        )}
      </RadialBarChart>
    </ChartShell>
  );
}
