import * as React from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui";

// KpiCard — Page 1 §Row 2 / Row 3.
//
// Anatomy: label (overline) → big metric → delta pill (optional) →
// sub-line (optional) → 32px-tall sparkline.
//
// Server-rendered: the sparkline is a tiny inline SVG (no Recharts
// dep) so the card can render in a server component and stays cheap
// to fan out across 10 cards on the dashboard.

export interface KpiCardProps {
  label: string;
  value: string;
  /** Percent delta vs previous period. +ve = good unless `invert` set. */
  deltaPct?: number | null;
  /** Flip the colour mapping (e.g. churn — going up is bad). */
  invertDelta?: boolean;
  /** Tooltip / accessibility hint shown on hover. */
  hint?: string;
  /** Sub-line under the metric (e.g. "of $2.4M ARR"). */
  sub?: string;
  /** Sparkline values — emits a 32px-tall area sparkline at the bottom. */
  spark?: readonly number[];
  /** Sparkline stroke colour token (defaults to brand-600). */
  sparkColor?: string;
  /** Whole card click → href. */
  href?: string;
  /** Override card tone — useful for warning/danger highlights. */
  tone?: "default" | "success" | "warning" | "danger";
}

const TONE_BORDER: Record<NonNullable<KpiCardProps["tone"]>, string | undefined> = {
  default: undefined,
  success: "var(--emerald-200)",
  warning: "var(--amber-200)",
  danger:  "var(--rose-200)",
};

export function KpiCard({
  label, value, deltaPct, invertDelta, hint, sub, spark, sparkColor, href, tone = "default",
}: KpiCardProps) {
  const card = (
    <Card
      elevation={href ? "interactive" : "default"}
      padding="md"
      className="h-full min-h-[132px]"
      style={tone !== "default" ? { borderColor: TONE_BORDER[tone] } : undefined}
    >
      <CardBody className="flex h-full flex-col justify-between gap-2 p-0">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
            title={hint}
          >
            {label}
          </span>
          {deltaPct != null && <DeltaPill pct={deltaPct} invert={invertDelta} />}
        </div>
        <div>
          <div
            className="text-[26px] font-semibold leading-none tabular-nums"
            style={{ color: "var(--text-default)" }}
          >
            {value}
          </div>
          {sub && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {sub}
            </div>
          )}
        </div>
        {spark && spark.length > 1 && (
          <Sparkline values={spark} color={sparkColor ?? "var(--brand-600)"} />
        )}
      </CardBody>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    );
  }
  return card;
}

/* ── Delta pill ────────────────────────────────────────────── */

function DeltaPill({ pct, invert }: { pct: number; invert?: boolean }) {
  const positive = invert ? pct < 0 : pct > 0;
  const negative = invert ? pct > 0 : pct < 0;
  const tone = positive ? "good" : negative ? "bad" : "neutral";
  const palette =
    tone === "good"
      ? { bg: "var(--emerald-50)",  fg: "var(--emerald-700)" }
      : tone === "bad"
      ? { bg: "var(--rose-50)",     fg: "var(--rose-700)" }
      : { bg: "var(--surface-2)",   fg: "var(--text-muted)" };
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "·";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ background: palette.bg, color: palette.fg }}
    >
      <span aria-hidden>{arrow}</span>
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* ── Sparkline (inline SVG, server-render-safe) ────────────── */

function Sparkline({ values, color }: { values: readonly number[]; color: string }) {
  const w = 100;
  const h = 28;
  const padY = 2;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const stepX = w / (values.length - 1);
  const points = values
    .map((v, i) => `${i * stepX},${h - padY - ((v - min) / range) * (h - padY * 2)}`)
    .join(" ");
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: 28 }}
      aria-hidden
    >
      <polygon points={areaPoints} fill={color} fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
