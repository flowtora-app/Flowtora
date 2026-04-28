import * as React from "react";
import { cn } from "@/lib/cn";

// Spinner — simple rotating ring. Inherits `currentColor` so callers
// drive color via parent text color (e.g. inside a Button that flips
// the text color when loading). Pass `tone="muted"` to soften.

type Size = "xs" | "sm" | "md" | "lg" | "xl";
type Tone = "current" | "muted" | "accent";

const SIZE_PX: Record<Size, number> = {
  xs: 12,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
};

const TONE_COLOR: Record<Tone, string> = {
  current: "currentColor",
  muted: "var(--text-muted)",
  accent: "var(--accent-primary)",
};

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: Size;
  tone?: Tone;
  /** Accessible label for screen readers; visually hidden. */
  label?: string;
}

export function Spinner({
  size = "md",
  tone = "current",
  label = "Loading",
  className,
  style,
  ...rest
}: SpinnerProps) {
  const px = SIZE_PX[size];
  return (
    <span
      role="status"
      aria-live="polite"
      style={{ display: "inline-flex", color: TONE_COLOR[tone] }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        className={cn("animate-spin", className)}
        style={style}
        aria-hidden
        {...rest}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="2.5"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
