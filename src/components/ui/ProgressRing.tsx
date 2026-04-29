import * as React from "react";
import { cn } from "@/lib/cn";

// ProgressRing — Spec Page 0 §0.5.34.
//
// Sizes: sm 24, md 40 (default), lg 64. Stroke width 4px per spec.
// Optional center label rendering the percentage or a custom value.
// `indeterminate` runs a rotation animation around a partial arc.

type Tone = "accent" | "success" | "warning" | "danger";
type Size = "sm" | "md" | "lg";

const TONE_FG: Record<Tone, string> = {
  accent:  "var(--brand-600, var(--accent-primary))",
  success: "var(--emerald-500, var(--success))",
  warning: "var(--amber-500, var(--warning))",
  danger:  "var(--rose-500, var(--danger))",
};

const SIZE_PX: Record<Size, number> = { sm: 24, md: 40, lg: 64 };

export interface ProgressRingProps {
  value?: number;
  max?: number;
  size?: Size;
  tone?: Tone;
  /** Spec stroke width is 4px; expose as override for fine layouts. */
  strokeWidth?: number;
  /** Render percentage text in the center. */
  showValue?: boolean;
  /** Render a custom centered label instead of `showValue`. */
  label?: React.ReactNode;
  indeterminate?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function ProgressRing({
  value = 0,
  max = 100,
  size = "md",
  tone = "accent",
  strokeWidth,
  showValue = false,
  label,
  indeterminate = false,
  className,
  "aria-label": ariaLabel,
}: ProgressRingProps) {
  const px = SIZE_PX[size];
  const stroke = strokeWidth ?? 4;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const offset = c - (pct / 100) * c;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      aria-label={ariaLabel}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: px, height: px }}
    >
      <svg
        width={px}
        height={px}
        className={indeterminate ? "ts-ring-indeterminate" : undefined}
        style={{ animation: indeterminate ? "ts-ring-spin 900ms linear infinite" : undefined }}
      >
        {/* Track */}
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        {/* Fill */}
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={TONE_FG[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={indeterminate ? c * 0.75 : offset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
            transition: indeterminate ? undefined : "stroke-dashoffset var(--duration-base) var(--ease-out)",
          }}
        />
      </svg>
      {(showValue || label) && !indeterminate && (
        <span
          className="absolute font-medium tabular-nums"
          style={{
            color: "var(--text-default)",
            fontSize: size === "sm" ? 9 : size === "md" ? 12 : 16,
          }}
        >
          {label ?? `${Math.round(pct)}%`}
        </span>
      )}
      <style>{`
        @keyframes ts-ring-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .ts-ring-indeterminate { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
