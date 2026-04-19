import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// EmptyState — the fallback for any zero-item list. Premium products
// treat empty states as teaching moments: tell the user what this
// surface does, show them the first action. Don't just print "No items."
//
// Shape:
//   icon         — an emoji, SVG, or decorative component (small)
//   title        — what this section is / why it's empty
//   description  — one sentence explaining next step; optional
//   action       — the primary CTA button; optional
//   secondary    — a lower-emphasis link/button; optional
//
// Rendered centered with generous vertical breathing room. Keep the
// copy customer-facing, not developer-facing.

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  // Shorthand alternative to passing an `action` node. Renders a primary
  // accent Link internally — covers the ~90% "take me here" empty-state
  // CTA so callers don't have to rebuild the same accent-styled anchor.
  actionHref?: string;
  actionLabel?: string;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  actionHref,
  actionLabel,
  className,
  compact = false,
}: EmptyStateProps) {
  const resolvedAction = action ?? (actionHref && actionLabel ? (
    <Link
      href={actionHref}
      className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:brightness-110"
      style={{ background: "var(--accent-primary)", color: "var(--accent-fg, white)" }}
    >
      {actionLabel}
    </Link>
  ) : null);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8 px-4" : "py-14 px-6",
        className,
      )}
    >
      {icon && (
        <div
          className="mb-3 flex items-center justify-center rounded-full"
          style={{
            width: compact ? 36 : 48,
            height: compact ? 36 : 48,
            background: "var(--surface-2)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {icon}
        </div>
      )}
      <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
        {title}
      </div>
      {description && (
        <p
          className="mt-1 max-w-sm text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {description}
        </p>
      )}
      {(resolvedAction || secondary) && (
        <div className="mt-4 flex items-center gap-2">
          {resolvedAction}
          {secondary}
        </div>
      )}
    </div>
  );
}
