"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Phase 18 Slice E — settings navigation.
//
// Vertical sidebar grouping replaces the flat horizontal tab strip. The
// old nav listed 11 items in one row — it scanned as a wall of text and
// didn't signal which settings were "shop-wide" vs "personal billing".
//
// Groups:
//   Shop       — how the business runs (profile, numbering, money, workflow)
//   Workspace  — editable assets that other features reference
//   People     — who's in the tenant and what they can do
//   Account    — plan + destructive account operations
//
// Gated items (e.g. Group / franchise) are filtered server-side in the
// layout before being passed in — this component is dumb about
// entitlements.

export interface SettingsNavItem {
  slug: string;
  label: string;
  description?: string;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export interface SettingsNavProps {
  slug: string;
  groups: SettingsNavGroup[];
}

export function SettingsNav({ slug, groups }: SettingsNavProps) {
  const pathname = usePathname() ?? "";
  const base = `/t/${slug}/settings`;

  // Phase 21 Slice E — "Overview" link back to the hub index. Rendered
  // above the groups so it reads as a top-level root, not one of the
  // per-concern items in a group.
  const overviewHref = base;
  const overviewActive = pathname === overviewHref;

  return (
    <nav aria-label="Settings" className="flex flex-col gap-6">
      <Link
        href={overviewHref}
        className={cn("block rounded-md px-3 py-1.5 text-sm transition-colors")}
        style={{
          background: overviewActive ? "var(--accent-surface)" : "transparent",
          color: overviewActive ? "var(--accent-primary)" : "var(--text-muted)",
          fontWeight: overviewActive ? 600 : 500,
        }}
        aria-current={overviewActive ? "page" : undefined}
      >
        Overview
      </Link>
      {groups.map((group) => (
        <div key={group.label}>
          <div
            className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            {group.label}
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const href = `${base}/${item.slug}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors",
                    )}
                    style={{
                      background: active ? "var(--accent-surface)" : "transparent",
                      color: active ? "var(--accent-primary)" : "var(--text-muted)",
                      fontWeight: active ? 600 : 500,
                    }}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
