import * as React from "react";
import { cn } from "@/lib/cn";

// StatusPill — Spec Page 0 §0.5.49.
//
// Anatomy: 6px colored dot + label (optional tooltip).
// Status mapping (platform/tenant-level statuses):
//   Active      → emerald
//   Trialing    → sky
//   Past Due    → amber
//   Suspended   → orange-600
//   Cancelled   → neutral-500
//   Pending     → violet
//   Failed      → rose
//   Draft       → neutral
// Variants: dot-only (table cells), dot+label (default), solid (filled).
//
// Intentionally separate from StatusBadge (which encodes tenant-internal
// quote/order/invoice/etc statuses) — this is the platform-side status
// vocabulary used on tenant lists and detail headers.

type Status =
  | "active"
  | "trialing"
  | "past_due"
  | "suspended"
  | "cancelled"
  | "pending"
  | "failed"
  | "draft";

type Variant = "dot-only" | "dot-label" | "solid";
type Size = "sm" | "md";

interface Tokens {
  fg: string;       // text + dot color
  softBg: string;   // bg for dot-label variant
  solidBg: string;  // bg for solid variant
}

const TOKENS: Record<Status, Tokens> = {
  active: {
    fg:      "var(--emerald-700, var(--success-fg))",
    softBg:  "var(--emerald-50, var(--success-surface))",
    solidBg: "var(--emerald-600, var(--success))",
  },
  trialing: {
    fg:      "var(--sky-700, var(--info-fg))",
    softBg:  "var(--sky-50, var(--info-surface))",
    solidBg: "var(--sky-600, var(--info))",
  },
  past_due: {
    fg:      "var(--amber-700, var(--warning-fg))",
    softBg:  "var(--amber-50, var(--warning-surface))",
    solidBg: "var(--amber-600, var(--warning))",
  },
  suspended: {
    fg:      "#C2410C",                // orange-700
    softBg:  "#FFF7ED",                // orange-50
    solidBg: "#EA580C",                // orange-600
  },
  cancelled: {
    fg:      "var(--slate-500, var(--text-muted))",
    softBg:  "var(--slate-100, var(--surface-2))",
    solidBg: "var(--slate-500, var(--text-muted))",
  },
  pending: {
    fg:      "var(--brand-700)",
    softBg:  "var(--brand-50)",
    solidBg: "var(--brand-600)",
  },
  failed: {
    fg:      "var(--rose-700, var(--danger-fg))",
    softBg:  "var(--rose-50, var(--danger-surface))",
    solidBg: "var(--rose-600, var(--danger))",
  },
  draft: {
    fg:      "var(--text-muted)",
    softBg:  "var(--surface-2)",
    solidBg: "var(--text-faint)",
  },
};

const STATUS_LABEL: Record<Status, string> = {
  active:    "Active",
  trialing:  "Trialing",
  past_due:  "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
  pending:   "Pending",
  failed:    "Failed",
  draft:     "Draft",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-5 px-1.5 text-[11px] gap-1",
  md: "h-6 px-2   text-[12px] gap-1.5",
};

export interface StatusPillProps {
  status: Status;
  variant?: Variant;
  size?: Size;
  /** Override the default label (e.g. "Past due · 7d"). */
  label?: React.ReactNode;
  className?: string;
  title?: string;
}

export function StatusPill({
  status,
  variant = "dot-label",
  size = "md",
  label,
  className,
  title,
}: StatusPillProps) {
  const tokens = TOKENS[status];
  const resolved = label ?? STATUS_LABEL[status];

  if (variant === "dot-only") {
    return (
      <span
        role="status"
        title={title ?? STATUS_LABEL[status]}
        aria-label={title ?? STATUS_LABEL[status]}
        className={cn("inline-block rounded-full", className)}
        style={{
          width: 8, height: 8,
          background: tokens.fg,
          boxShadow: "0 0 0 2px var(--surface-1)",
        }}
      />
    );
  }

  if (variant === "solid") {
    return (
      <span
        role="status"
        title={title}
        className={cn(
          "inline-flex items-center rounded-full font-medium uppercase tracking-wide",
          SIZE_CLASS[size],
          className,
        )}
        style={{ background: tokens.solidBg, color: "#ffffff", border: "1px solid transparent" }}
      >
        {resolved}
      </span>
    );
  }

  // dot-label (default)
  return (
    <span
      role="status"
      title={title}
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        SIZE_CLASS[size],
        className,
      )}
      style={{ background: tokens.softBg, color: tokens.fg }}
    >
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full"
        style={{ width: 6, height: 6, background: tokens.fg }}
      />
      {resolved}
    </span>
  );
}
