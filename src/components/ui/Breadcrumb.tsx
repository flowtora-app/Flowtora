import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Breadcrumb — a flat list of links leading to the current page. The
// last item is rendered as plain text (non-link) and slightly stronger.
//
// Pass `items` as an array of `{ label, href? }`. Items without an
// `href` render as text — useful for the terminal node, or for an
// intermediate page the user can't navigate to.

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex flex-wrap items-center gap-1.5 text-xs", className)}
      style={{ color: "var(--text-muted)" }}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="rounded px-1 py-0.5 hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="px-1 py-0.5"
                style={{ color: isLast ? "var(--text-default)" : "var(--text-muted)" }}
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
            {!isLast && (
              <span aria-hidden style={{ color: "var(--text-faint)" }}>
                /
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
