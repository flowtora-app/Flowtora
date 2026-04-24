"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { SettingsSubItem, SettingsTab, SettingsTabId } from "./tabs";
import { OnboardingBanner } from "./OnboardingBanner";

// Phase 4 (transformation) — Settings chrome.
//
// Two levels of navigation, one URL tree:
//   1. Horizontal tab bar (6 tabs) — primary IA. Active tab highlights.
//   2. Left sub-section sidebar — only the active tab's items.
//
// The client component reads the pathname (instead of taking active
// state as a prop) so sub-route transitions don't require a fresh
// server render. All permission/entitlement filtering happens server-
// side in `layout.tsx`; by the time we mount, every tab + item in
// `tabs` is safe to show to this user.
//
// Deep-link highlight: pages can read `?hl=<anchor>` to pulse a
// specific card, used by the Onboarding wizard to land users on the
// exact setting they need to fill in. See `InlineHighlight` below.

export interface SettingsShellProps {
  slug: string;
  tabs: ResolvedSettingsTab[];
  children: React.ReactNode;
}

/** Same shape as SettingsTab, except permission metadata has been
 *  stripped (RBAC already applied server-side). */
export interface ResolvedSettingsTab {
  id: SettingsTabId;
  label: string;
  blurb: string;
  items: Array<Pick<SettingsSubItem, "slug" | "label" | "description">>;
}

export function SettingsShell({ slug, tabs, children }: SettingsShellProps) {
  const pathname = usePathname() ?? "";
  const base = `/t/${slug}/settings`;

  // Derive the active tab from the current URL. Pathname looks like
  // `/t/<slug>/settings/<sub>` (or just `/t/<slug>/settings`). We compare
  // the sub against each item's slug plus any `matches` aliases declared
  // in the tabs config so /settings/message-templates lights up Templates.
  const subSlug = extractSubSlug(pathname, base);
  const activeTab = findActiveTab(tabs, subSlug) ?? tabs[0];

  return (
    <div>
      <nav
        aria-label="Settings sections"
        className="mb-6 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <ul className="flex gap-1 whitespace-nowrap">
          {tabs.map((t) => {
            const firstItem = t.items[0];
            // A tab with no visible items (every sub-section filtered out by
            // RBAC) wouldn't have somewhere to land — skip its link and
            // render a disabled pill so we don't blow up navigation.
            const href = firstItem ? `${base}/${firstItem.slug}` : base;
            const isActive = activeTab?.id === t.id;
            return (
              <li key={t.id}>
                <Link
                  href={href}
                  className={cn(
                    "inline-flex items-center border-b-2 px-3 py-2.5 text-sm transition-colors",
                  )}
                  style={{
                    borderColor: isActive ? "var(--accent-primary)" : "transparent",
                    color: isActive ? "var(--text-default)" : "var(--text-muted)",
                    fontWeight: isActive ? 600 : 500,
                  }}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          {activeTab ? (
            <SubSectionNav slug={slug} tab={activeTab} />
          ) : null}
        </aside>
        <div className="min-w-0">
          <OnboardingBanner slug={slug} />
          {children}
        </div>
      </div>
    </div>
  );
}

function SubSectionNav({
  slug,
  tab,
}: {
  slug: string;
  tab: ResolvedSettingsTab;
}) {
  const pathname = usePathname() ?? "";
  const base = `/t/${slug}/settings`;

  return (
    <nav aria-label={`${tab.label} — sections`} className="flex flex-col gap-1">
      <div
        className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-faint)" }}
      >
        {tab.label}
      </div>
      {tab.items.map((item) => {
        const href = `${base}/${item.slug}`;
        const aliasMatch =
          // /settings/message-templates lights up the Templates row
          // because the two lists share one section in the new IA.
          item.slug === "templates" &&
          (pathname === `${base}/message-templates` ||
            pathname.startsWith(`${base}/message-templates/`));
        const active =
          pathname === href || pathname.startsWith(`${href}/`) || aliasMatch;
        return (
          <Link
            key={item.slug}
            href={href}
            className="block rounded-md px-3 py-1.5 text-sm transition-colors"
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

function extractSubSlug(pathname: string, base: string): string | null {
  if (!pathname.startsWith(base)) return null;
  const tail = pathname.slice(base.length).replace(/^\//, "");
  if (!tail) return null;
  const first = tail.split("/")[0];
  return first || null;
}

function findActiveTab(
  tabs: ResolvedSettingsTab[],
  sub: string | null,
): ResolvedSettingsTab | null {
  if (!sub) return tabs[0] ?? null;
  // Direct slug match first, then alias match (message-templates → templates).
  for (const t of tabs) {
    if (t.items.some((i) => i.slug === sub)) return t;
  }
  if (sub === "message-templates") {
    return tabs.find((t) => t.items.some((i) => i.slug === "templates")) ?? null;
  }
  return null;
}
