import * as React from "react";
import { cn } from "@/lib/cn";

// ProgressBar — Spec Page 0 §0.5.34.
//
// Sizes: sm 4px, md 6px (default), lg 8px height — brand-600 fill on
// neutral track. Animated striped variant for in-progress states;
// `indeterminate` drops the value and runs a pulse for unknown ETAs.

type Tone = "accent" | "success" | "warning" | "danger";

const TONE_FG: Record<Tone, string> = {
  accent:  "var(--brand-600, var(--accent-primary))",
  success: "var(--emerald-500, var(--success))",
  warning: "var(--amber-500, var(--warning))",
  danger:  "var(--rose-500, var(--danger))",
};

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  label?: React.ReactNode;
  showValue?: boolean;
  tone?: Tone;
  /** Spec sizes: sm 4 / md 6 (default) / lg 8 */
  size?: "sm" | "md" | "lg";
  /** Spec §0.5.34 — striped animated variant for in-progress feel. */
  striped?: boolean;
  indeterminate?: boolean;
}

const SIZE_HEIGHT: Record<"sm" | "md" | "lg", number> = {
  sm: 4,
  md: 6,
  lg: 8,
};

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = false,
  tone = "accent",
  size = "md",
  striped = false,
  indeterminate = false,
  className,
  style,
  ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const height = SIZE_HEIGHT[size];

  return (
    <div className={cn("w-full", className)} style={style} {...rest}>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          {label && (
            <span style={{ color: "var(--text-muted)" }}>{label}</span>
          )}
          {showValue && !indeterminate && (
            <span style={{ color: "var(--text-default)" }}>
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : Math.round(value)}
        className="relative w-full overflow-hidden rounded-full"
        style={{
          height,
          background: "var(--surface-3)",
        }}
      >
        {indeterminate ? (
          <div
            className="h-full animate-pulse"
            style={{
              width: "100%",
              background: TONE_FG[tone],
              opacity: 0.7,
            }}
          />
        ) : (
          <div
            className="ts-progress-fill h-full transition-[width]"
            style={{
              width: `${pct}%`,
              background: striped
                ? `repeating-linear-gradient(45deg, ${TONE_FG[tone]} 0 8px, color-mix(in oklab, ${TONE_FG[tone]} 70%, transparent) 8px 16px)`
                : TONE_FG[tone],
              backgroundSize: striped ? "16px 16px" : undefined,
              animation: striped ? "ts-progress-stripe 1.2s linear infinite" : undefined,
              transitionDuration: "var(--duration-base)",
            }}
          />
        )}
      </div>
      <style>{`
        @keyframes ts-progress-stripe {
          from { background-position: 0 0; }
          to   { background-position: 16px 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ts-progress-fill { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
