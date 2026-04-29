import * as React from "react";
import { cn } from "@/lib/cn";

// Badge — Spec Page 0 §0.5.15.
//
// Variants: solid (filled bg + white text), soft (tinted bg + dark text,
// default), outline, dot (pre-pended 6px colored dot).
// Colors:   neutral, brand, success, warning, error, info, accent.
// Sizes:    xs (16px / 10px text), sm (20px / 11px), md (24px / 12px, default).
//
// Optional `count` prop renders a numeric value with "99+" overflow.
// Optional `leadingIcon` slot renders a 12px icon on the left.
//
// Backward-compat: existing `tone` prop maps to the new `color` axis;
// existing `dot` boolean still renders the 6px leading dot. The legacy
// `tone="danger"` is accepted as an alias for `color="error"`.

type Variant = "solid" | "soft" | "outline" | "dot";
type Color   = "neutral" | "brand" | "success" | "warning" | "error" | "info" | "accent" | "danger";
type Size    = "xs" | "sm" | "md";

const SIZE_CLASS: Record<Size, string> = {
  xs: "h-4  px-1   text-[10px] gap-1",
  sm: "h-5  px-1.5 text-[11px] gap-1",
  md: "h-6  px-2   text-[12px] gap-1.5",
};

interface ColorTokens {
  /** Text color for `soft`/`outline`/`dot` variants. */
  fg: string;
  /** Background for `soft` variants. */
  softBg: string;
  /** Background for `solid` variants (filled). */
  solidBg: string;
  /** Border for `outline` variants. */
  outlineBorder: string;
  /** Color for the leading dot in `dot` variant. */
  dot: string;
}

const COLOR_TOKENS: Record<Color, ColorTokens> = {
  neutral: {
    fg:            "var(--text-muted)",
    softBg:        "var(--surface-2)",
    solidBg:       "var(--slate-700, var(--surface-3))",
    outlineBorder: "var(--border-default)",
    dot:           "var(--text-faint)",
  },
  brand: {
    fg:            "var(--brand-700)",
    softBg:        "var(--brand-100)",
    solidBg:       "var(--brand-600)",
    outlineBorder: "var(--brand-300)",
    dot:           "var(--brand-500)",
  },
  accent: {
    fg:            "var(--accent-primary)",
    softBg:        "var(--accent-surface)",
    solidBg:       "var(--accent-primary)",
    outlineBorder: "var(--accent-primary)",
    dot:           "var(--accent-primary)",
  },
  success: {
    fg:            "var(--emerald-700, var(--success-fg))",
    softBg:        "var(--emerald-100, var(--success-surface))",
    solidBg:       "var(--emerald-600, var(--success))",
    outlineBorder: "var(--emerald-300, var(--success))",
    dot:           "var(--emerald-500, var(--success))",
  },
  warning: {
    fg:            "var(--amber-800, var(--warning-fg))",
    softBg:        "var(--amber-100, var(--warning-surface))",
    solidBg:       "var(--amber-500, var(--warning))",
    outlineBorder: "var(--amber-300, var(--warning))",
    dot:           "var(--amber-500, var(--warning))",
  },
  error: {
    fg:            "var(--rose-700, var(--danger-fg))",
    softBg:        "var(--rose-100, var(--danger-surface))",
    solidBg:       "var(--rose-600, var(--danger))",
    outlineBorder: "var(--rose-300, var(--danger))",
    dot:           "var(--rose-500, var(--danger))",
  },
  info: {
    fg:            "var(--sky-700, var(--info-fg))",
    softBg:        "var(--sky-100, var(--info-surface))",
    solidBg:       "var(--sky-600, var(--info))",
    outlineBorder: "var(--sky-300, var(--info))",
    dot:           "var(--sky-500, var(--info))",
  },
  // Legacy alias
  danger: {
    fg:            "var(--rose-700, var(--danger-fg))",
    softBg:        "var(--rose-100, var(--danger-surface))",
    solidBg:       "var(--rose-600, var(--danger))",
    outlineBorder: "var(--rose-300, var(--danger))",
    dot:           "var(--rose-500, var(--danger))",
  },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Spec §0.5.15. Default is `soft`. */
  variant?: Variant;
  /** Spec color axis. Default is `neutral`. */
  color?: Color;
  size?: Size;
  /** Numeric value with "99+" overflow. */
  count?: number;
  leadingIcon?: React.ReactNode;
  // ── Backward-compat aliases ──
  /** @deprecated Use `color` instead. */
  tone?: Color;
  /** @deprecated Use `variant="dot"` instead. */
  dot?: boolean;
}

export function Badge({
  variant,
  color,
  tone,
  size = "md",
  dot,
  count,
  leadingIcon,
  className,
  style,
  children,
  ...rest
}: BadgeProps) {
  // Resolve color: prefer `color`, fall back to legacy `tone`, default neutral.
  const resolvedColor: Color = color ?? tone ?? "neutral";
  // Resolve variant: prefer `variant`, then legacy `dot`, default soft.
  const resolvedVariant: Variant = variant ?? (dot ? "dot" : "soft");
  const tokens = COLOR_TOKENS[resolvedColor];

  const variantStyle: React.CSSProperties =
    resolvedVariant === "solid"
      ? { background: tokens.solidBg, color: "#ffffff", border: "1px solid transparent" }
      : resolvedVariant === "outline"
      ? { background: "transparent", color: tokens.fg, border: `1px solid ${tokens.outlineBorder}` }
      : /* soft, dot */ { background: tokens.softBg, color: tokens.fg, border: "1px solid transparent" };

  const showLeadingDot = resolvedVariant === "dot";

  // Count display with "99+" overflow.
  const countLabel = typeof count === "number"
    ? count > 99 ? "99+" : String(count)
    : null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium uppercase tracking-wide",
        SIZE_CLASS[size],
        className,
      )}
      style={{ ...variantStyle, ...style }}
      {...rest}
    >
      {showLeadingDot && (
        <span
          aria-hidden
          className="inline-block shrink-0 rounded-full"
          style={{ width: 6, height: 6, background: tokens.dot }}
        />
      )}
      {leadingIcon && (
        <span aria-hidden className="inline-flex shrink-0 items-center" style={{ width: 12, height: 12 }}>
          {leadingIcon}
        </span>
      )}
      {children}
      {countLabel !== null && (
        <span
          className="inline-flex items-center justify-center rounded-full px-1 font-semibold tabular-nums"
          style={{
            background: resolvedVariant === "solid" ? "rgba(255,255,255,0.25)" : tokens.solidBg,
            color: resolvedVariant === "solid" ? "#fff" : "#fff",
            minWidth: 16,
            height: 14,
            fontSize: "0.65em",
          }}
        >
          {countLabel}
        </span>
      )}
    </span>
  );
}
