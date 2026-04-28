import * as React from "react";
import { cn } from "@/lib/cn";

// ProgressBar — linear determinate progress.
//   value: 0..100 (clamped)
//   indeterminate: ignores value and runs an animated stripe instead
//   tone: which accent the filled portion uses
//   showValue: render the percentage on the right of the label row

type Tone = "accent" | "success" | "warning" | "danger";

const TONE_FG: Record<Tone, string> = {
  accent: "var(--accent-primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  label?: React.ReactNode;
  showValue?: boolean;
  tone?: Tone;
  size?: "sm" | "md";
  indeterminate?: boolean;
}

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = false,
  tone = "accent",
  size = "md",
  indeterminate = false,
  className,
  style,
  ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const height = size === "sm" ? 4 : 8;

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
            className="h-full transition-[width]"
            style={{
              width: `${pct}%`,
              background: TONE_FG[tone],
              transitionDuration: "var(--duration-base)",
            }}
          />
        )}
      </div>
    </div>
  );
}
