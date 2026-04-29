"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Popover } from "@/components/ui/Popover";

// Breadcrumb — Spec Page 0 §0.5.25.
//
// Separator: "/" slash, neutral-300.
// Truncation: when >4 levels, collapse middle into "..." dropdown.
// Last item: non-link, text-primary; previous items text-link.
// Each previous segment optionally opens a sibling list (via Popover).
//
//   <Breadcrumb items={[
//     { label: "Customers", href: "/t/demo-shop/customers" },
//     { label: "Acme Sign Co.", href: "/t/demo-shop/customers/123" },
//     { label: "Quote QT-2026-0042" }, // last — current page
//   ]} />

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
  /** Optional icon rendered to the left of the label. */
  icon?: React.ReactNode;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Hard cap before middle items collapse into "…". Default 4. */
  maxItems?: number;
  /** Custom separator between items. Default: "/". */
  separator?: React.ReactNode;
  className?: string;
}

export function Breadcrumb({
  items,
  maxItems = 4,
  separator,
  className,
}: BreadcrumbProps) {
  const sep = separator ?? <Sep />;

  // Compute visible / hidden split.
  let visible: (BreadcrumbItem | "ellipsis")[];
  let hidden: BreadcrumbItem[] = [];
  if (items.length <= maxItems) {
    visible = items;
  } else {
    const first = items[0]!;
    const last = items[items.length - 1]!;
    hidden = items.slice(1, -1);
    visible = [first, "ellipsis", last];
  }

  return (
    <nav aria-label="Breadcrumb" className={cn("text-xs", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {visible.map((item, i) => {
          const isLast = i === visible.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {item === "ellipsis" ? (
                <Popover
                  side="bottom"
                  align="start"
                  trigger={
                    <button
                      type="button"
                      aria-label={`${hidden.length} hidden levels`}
                      className="inline-flex h-6 items-center justify-center rounded-md px-1 transition-colors"
                      style={{
                        color: "var(--text-muted)",
                        transitionDuration: "var(--duration-fast)",
                      }}
                    >
                      <DotsIcon />
                    </button>
                  }
                  className="min-w-44 max-w-xs"
                >
                  <ol className="flex flex-col gap-0.5 p-1">
                    {hidden.map((h, hi) => (
                      <li key={hi}>
                        {h.href ? (
                          <Link
                            href={h.href}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {h.icon}
                            <span className="truncate">{h.label}</span>
                          </Link>
                        ) : (
                          <span
                            className="flex items-center gap-2 px-2 py-1.5 text-sm"
                            style={{ color: "var(--text-faint)" }}
                          >
                            {h.icon}
                            <span className="truncate">{h.label}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </Popover>
              ) : item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1.5 rounded transition-colors hover:underline"
                  style={{ color: "var(--text-link, var(--accent-primary))" }}
                >
                  {item.icon}
                  <span className="max-w-xs truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="inline-flex items-center gap-1.5 font-medium"
                  style={{
                    color: isLast ? "var(--text-default)" : "var(--text-muted)",
                  }}
                >
                  {item.icon}
                  <span className="max-w-xs truncate">{item.label}</span>
                </span>
              )}
              {!isLast && (
                <span aria-hidden style={{ color: "var(--text-faint)" }}>
                  {sep}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Sep() {
  // Spec §0.5.25 — separator is "/" slash, neutral-300.
  return (
    <span
      aria-hidden
      style={{ color: "var(--slate-300, var(--text-faint))", userSelect: "none" }}
    >
      /
    </span>
  );
}

function DotsIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}
