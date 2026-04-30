"use client";

import * as React from "react";
import {
  AreaChartCard,
  BarChartCard,
  DonutChartCard,
  type AreaChartProps,
  type BarChartProps,
  type DonutChartProps,
} from "@/components/ui";

// Dashboard chart wrappers — Page 1 §Row 4 / §Row 5.
//
// Why this file exists: AreaChartCard / BarChartCard / DonutChartCard
// accept a `valueFormat: (n: number) => string` prop. The dashboard
// page that uses them is a server component, so passing a function
// across the server→client boundary fails Next.js's serializer with:
//
//   Functions cannot be passed directly to Client Components unless
//   you explicitly expose it by marking it with "use server".
//
// These tiny "use client" wrappers hold the formatter inside the
// client bundle so the server page can hand them only plain data.

function fmtUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000)    return `$${(n / 1_000).toFixed(1)}k`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function fmtNumberCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000)    return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

/* ── Revenue area (Page 1 §Row 4 left) ─────────────────────── */

export type RevenueAreaProps<T extends Record<string, unknown>> = Omit<AreaChartProps<T>, "valueFormat">;

export function RevenueAreaChart<T extends Record<string, unknown>>(props: RevenueAreaProps<T>) {
  return <AreaChartCard {...props} valueFormat={fmtUsdCompact} />;
}

/* ── Tenant-growth bar (Page 1 §Row 4 right) ──────────────── */

export type GrowthBarProps<T extends Record<string, unknown>> = Omit<BarChartProps<T>, "valueFormat">;

export function GrowthBarChart<T extends Record<string, unknown>>(props: GrowthBarProps<T>) {
  return <BarChartCard {...props} valueFormat={fmtNumberCompact} />;
}

/* ── Plan-mix donut (Page 1 §Row 5 left) ──────────────────── */

export type PlanMixDonutProps = Omit<DonutChartProps, "valueFormat">;

export function PlanMixDonut(props: PlanMixDonutProps) {
  return <DonutChartCard {...props} valueFormat={fmtUsdCompact} />;
}
