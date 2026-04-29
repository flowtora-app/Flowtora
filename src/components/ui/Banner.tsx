"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Banner — Spec Page 0 §0.5.31 (Banner / Alert in-page).
//
// Variants: info, success, warning, error, neutral.
// Layouts:  inline (compact, icon + text) and full (icon + title +
// body + CTA + dismiss).
// Use cases: maintenance notices, plan limits, security alerts.
// Dismissible: optional. When `dismissId` is set, dismissal is
// persisted to localStorage so the banner stays hidden across
// navigations until the user explicitly resets prefs.

type Variant = "info" | "success" | "warning" | "error" | "neutral";
type Layout = "inline" | "full";

interface VariantTokens {
  bg: string;
  fg: string;
  border: string;
  icon: string;
}

const VARIANT_TOKENS: Record<Variant, VariantTokens> = {
  info: {
    bg:     "var(--sky-50, var(--info-surface))",
    fg:     "var(--sky-800, var(--info-fg))",
    border: "var(--sky-200, var(--info))",
    icon:   "i",
  },
  success: {
    bg:     "var(--emerald-50, var(--success-surface))",
    fg:     "var(--emerald-800, var(--success-fg))",
    border: "var(--emerald-200, var(--success))",
    icon:   "✓",
  },
  warning: {
    bg:     "var(--amber-50, var(--warning-surface))",
    fg:     "var(--amber-800, var(--warning-fg))",
    border: "var(--amber-200, var(--warning))",
    icon:   "!",
  },
  error: {
    bg:     "var(--rose-50, var(--danger-surface))",
    fg:     "var(--rose-800, var(--danger-fg))",
    border: "var(--rose-200, var(--danger))",
    icon:   "!",
  },
  neutral: {
    bg:     "var(--surface-2)",
    fg:     "var(--text-default)",
    border: "var(--border-default)",
    icon:   "·",
  },
};

export interface BannerProps {
  variant?: Variant;
  layout?: Layout;
  /** Required for `full` layout — heading. */
  title?: React.ReactNode;
  /** Body copy (or the only text in `inline` layout). */
  children?: React.ReactNode;
  /** Optional CTA — link or button. */
  cta?: { label: string; href?: string; onClick?: () => void };
  /** When set, the banner becomes dismissible and persists dismissal
   *  to localStorage under this key (Spec §0.5.31). */
  dismissId?: string;
  /** Override icon. Pass `null` to hide. */
  icon?: React.ReactNode | null;
  className?: string;
}

const STORAGE_PREFIX = "ts-banner-dismissed:";

export function Banner({
  variant = "info",
  layout = "full",
  title,
  children,
  cta,
  dismissId,
  icon,
  className,
}: BannerProps) {
  const tokens = VARIANT_TOKENS[variant];
  // Dismiss state — initialized from localStorage when dismissId is
  // set. We keep `mounted` separate so the banner renders correctly
  // on the server (hidden=false) and only flips after hydration if
  // the user has previously dismissed it.
  const [mounted, setMounted] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (!dismissId) return;
    try {
      const v = window.localStorage.getItem(STORAGE_PREFIX + dismissId);
      if (v === "1") setDismissed(true);
    } catch {
      // localStorage unavailable (private mode, embedded contexts) —
      // skip persistence; banner just won't survive reloads.
    }
  }, [dismissId]);

  if (mounted && dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissId) {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + dismissId, "1");
      } catch {
        // see above
      }
    }
  };

  const iconNode = icon === null
    ? null
    : icon !== undefined
    ? icon
    : (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: tokens.fg, color: tokens.bg }}
      >
        {tokens.icon}
      </span>
    );

  if (layout === "inline") {
    return (
      <div
        role={variant === "error" ? "alert" : "status"}
        className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]", className)}
        style={{ background: tokens.bg, color: tokens.fg, borderColor: tokens.border }}
      >
        {iconNode}
        <span className="min-w-0 flex-1">{children}</span>
        {cta && <BannerCta cta={cta} fg={tokens.fg} compact />}
        {dismissId && <BannerDismiss onClick={handleDismiss} fg={tokens.fg} />}
      </div>
    );
  }

  // full layout
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-lg border p-4", className)}
      style={{ background: tokens.bg, color: tokens.fg, borderColor: tokens.border }}
    >
      {iconNode}
      <div className="min-w-0 flex-1">
        {title && (
          <div className="text-sm font-semibold leading-snug">{title}</div>
        )}
        {children && (
          <div className="mt-0.5 text-[13px] leading-relaxed" style={{ opacity: 0.9 }}>
            {children}
          </div>
        )}
        {cta && (
          <div className="mt-2">
            <BannerCta cta={cta} fg={tokens.fg} />
          </div>
        )}
      </div>
      {dismissId && <BannerDismiss onClick={handleDismiss} fg={tokens.fg} />}
    </div>
  );
}

function BannerCta({
  cta,
  fg,
  compact,
}: {
  cta: NonNullable<BannerProps["cta"]>;
  fg: string;
  compact?: boolean;
}) {
  const className = cn(
    "ts-focus inline-flex items-center font-medium",
    compact ? "text-[12px] underline" : "text-[13px] underline-offset-2 hover:underline",
  );
  if (cta.href) {
    return (
      <a href={cta.href} className={className} style={{ color: fg }}>
        {cta.label} {compact ? "" : "→"}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={cta.onClick}
      className={className}
      style={{ color: fg, background: "transparent", border: 0 }}
    >
      {cta.label} {compact ? "" : "→"}
    </button>
  );
}

function BannerDismiss({ onClick, fg }: { onClick: () => void; fg: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className="ts-focus shrink-0 rounded p-1"
      style={{ color: fg, background: "transparent", border: 0, opacity: 0.7 }}
    >
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="3" y1="3" x2="11" y2="11" />
        <line x1="11" y1="3" x2="3" y2="11" />
      </svg>
    </button>
  );
}
