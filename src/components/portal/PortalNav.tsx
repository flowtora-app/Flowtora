"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Phase 18 Slice E — customer portal navigation.
//
// Client component so we can highlight the active page without the
// parent having to inspect headers. The portal is small enough that
// a flat list works — no grouping, just six destinations.

export interface PortalNavItem {
  href: string;
  label: string;
}

export interface PortalNavProps {
  token: string;
  basePath: string;
  items: PortalNavItem[];
}

export function PortalNav({ token, basePath, items }: PortalNavProps) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Portal navigation" className="flex flex-col gap-0.5 px-2 py-3">
      {items.map((item) => {
        const fullHref = item.href
          ? `${basePath}/${item.href}`
          : basePath;
        // Overview (empty href) only matches exactly; every other tab
        // also matches its nested routes so detail pages stay lit.
        const active =
          item.href === ""
            ? pathname === fullHref
            : pathname === fullHref || pathname.startsWith(`${fullHref}/`);
        void token; // reserved for future per-tab badges
        return (
          <Link
            key={item.href}
            href={fullHref}
            className="block rounded-md px-3 py-2 text-sm transition-colors"
            style={{
              background: active ? "var(--accent-surface)" : "transparent",
              color: active ? "var(--accent-primary)" : "var(--text-muted)",
              fontWeight: active ? 600 : 500,
            }}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
