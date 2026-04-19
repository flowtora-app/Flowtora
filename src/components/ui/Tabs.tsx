import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Tabs — link-based tabs for server components (no client state). Each
// tab is a NextLink with an active/inactive visual state driven by the
// `activeHref` prop. The parent page decides what "active" means — this
// component stays dumb about pathname matching so it works in any tree.
//
// Usage:
//   <Tabs
//     items={[
//       { label: "Profile", href: `/t/${slug}/settings/profile` },
//       { label: "Team",    href: `/t/${slug}/settings/team`, badge: 3 },
//     ]}
//     activeHref={currentPath}
//   />
//
// For a controlled (non-link) tab surface we'll add a separate
// <ButtonTabs> later — most of our UI is server-rendered so links are
// the right default.

export interface TabItem {
  label: React.ReactNode;
  href: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeHref?: string;
  className?: string;
  // When true, the active tab is detected by prefix match instead of
  // exact. Useful for parent "Settings" routes where the URL deepens.
  prefixMatch?: boolean;
}

export function Tabs({ items, activeHref, className, prefixMatch = false }: TabsProps) {
  return (
    <nav
      className={cn("flex items-end gap-0.5 text-sm", className)}
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      aria-label="Section tabs"
    >
      {items.map((tab) => {
        const isActive =
          activeHref != null &&
          (prefixMatch
            ? activeHref === tab.href || activeHref.startsWith(tab.href + "/")
            : activeHref === tab.href);
        if (tab.disabled) {
          return (
            <span
              key={tab.href}
              className="relative inline-flex items-center gap-2 px-3 py-2 text-xs opacity-50"
              style={{ color: "var(--text-muted)" }}
              aria-disabled
            >
              {tab.label}
              {tab.badge != null && <TabBadge>{tab.badge}</TabBadge>}
            </span>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "ts-focus relative inline-flex items-center gap-2 px-3 py-2 text-xs transition-colors",
            )}
            style={{
              color: isActive ? "var(--text-default)" : "var(--text-muted)",
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {tab.label}
            {tab.badge != null && <TabBadge>{tab.badge}</TabBadge>}
            {isActive && (
              <span
                aria-hidden
                className="absolute left-0 right-0 bottom-[-1px] h-[2px]"
                style={{ background: "var(--accent-primary)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function TabBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {children}
    </span>
  );
}
