"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Settings navigation — grouped vertical sidebar + search.
//
// The sidebar replaces a flat tab strip. With ~18 items in the tree,
// scanning top-to-bottom is slow, so we:
//   • group by concern (Me / Business / Money / Workspace / Account),
//   • gate items server-side by permission + plan (caller passes only
//     visible items — this component stays dumb about RBAC),
//   • add a client-side search box that filters across every visible
//     item by label match. Groups with no matches collapse quietly.
//
// Search is purely client-side because the full tree is already in the
// DOM — round-tripping to the server for a 20-item filter would feel
// sluggish.

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
  const [query, setQuery] = React.useState("");

  const overviewHref = base;
  const overviewActive = pathname === overviewHref;

  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        label: g.label,
        items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  const showOverview = !q || "overview".includes(q);
  const empty = filtered.length === 0 && !showOverview;

  return (
    <nav aria-label="Settings" className="flex flex-col gap-4">
      {/* Search — client-only, filters the visible tree live. */}
      <label className="relative block">
        <span className="sr-only">Search settings</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-faint)" }}
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…"
          className="ts-focus w-full rounded-md py-1.5 pl-7 pr-7 text-xs outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-default)",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            ×
          </button>
        )}
      </label>

      {showOverview && (
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
      )}

      {filtered.map((group) => (
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

      {empty && (
        <p className="px-2 text-xs" style={{ color: "var(--text-faint)" }}>
          No settings match &ldquo;{query}&rdquo;.
        </p>
      )}
    </nav>
  );
}
