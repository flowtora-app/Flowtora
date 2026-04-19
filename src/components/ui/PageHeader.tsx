import * as React from "react";
import { cn } from "@/lib/cn";

// PageHeader — the block that introduces a page: eyebrow, title,
// optional description, optional right-hand action cluster. Pair with
// Breadcrumb above when the page sits deep in a hierarchy.
//
// The `eyebrow` slot is for section identity ("Settings", "Compliance")
// rendered small and muted above the title. Keeps the actual <h1> free
// of cruft.

export interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            {eyebrow}
          </div>
        )}
        <h1 className={cn("text-2xl font-semibold", eyebrow ? "mt-1" : null)} style={{ color: "var(--text-default)" }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// SectionHeader — smaller sibling, used inside a page to introduce a
// subsection (a card group, a table block). Uses <h2>.
export interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
