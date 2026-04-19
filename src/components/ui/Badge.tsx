import * as React from "react";
import { cn } from "@/lib/cn";

// Badge — small status/label chip. Six tones cover the common statuses
// across the app:
//   neutral  — draft, inactive, generic
//   accent   — active / selected / primary identity
//   success  — paid, completed, healthy
//   warning  — pending, due soon
//   danger   — failed, overdue, critical
//   info     — informational
//
// Two sizes. `dot` prepends a small colored dot for at-a-glance status
// indication in dense lists.

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
type Size = "sm" | "md";

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  neutral: {
    background: "var(--surface-2)",
    color: "var(--text-muted)",
    border: "1px solid var(--border-subtle)",
  },
  accent: {
    background: "var(--accent-surface)",
    color: "var(--accent-primary)",
    border: "1px solid transparent",
  },
  success: {
    background: "var(--success-surface)",
    color: "var(--success-fg)",
    border: "1px solid transparent",
  },
  warning: {
    background: "var(--warning-surface)",
    color: "var(--warning-fg)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--danger-surface)",
    color: "var(--danger-fg)",
    border: "1px solid var(--danger-border)",
  },
  info: {
    background: "var(--info-surface)",
    color: "var(--info-fg)",
    border: "1px solid transparent",
  },
};

const DOT_COLOR: Record<Tone, string> = {
  neutral: "var(--text-faint)",
  accent: "var(--accent-primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-5 px-1.5 text-[10px] gap-1",
  md: "h-6 px-2 text-xs gap-1.5",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Size;
  dot?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "md",
  dot,
  className,
  style,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium uppercase tracking-wide",
        SIZE_CLASS[size],
        className,
      )}
      style={{ ...TONE_STYLE[tone], ...style }}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: DOT_COLOR[tone] }}
        />
      )}
      {children}
    </span>
  );
}
