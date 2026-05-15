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
      {/* Premium horizontal tab bar — refined typography, accent
          underline + tinted active surface for the current tab. */}
      <nav
        aria-label="Settings sections"
        className="mb-5 overflow-x-auto"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <ul className="flex items-end gap-0.5 whitespace-nowrap">
          {tabs.map((t) => {
            const firstItem = t.items[0];
            const href = firstItem ? `${base}/${firstItem.slug}` : base;
            const isActive = activeTab?.id === t.id;
            return (
              <li key={t.id}>
                <Link
                  href={href}
                  className={cn(
                    "ts-focus relative inline-flex items-center transition-colors",
                  )}
                  style={{
                    padding: "8px 14px",
                    fontSize: 12.5,
                    letterSpacing: "-0.005em",
                    color: isActive ? "var(--text-default)" : "var(--text-muted)",
                    fontWeight: isActive ? 700 : 500,
                    background: isActive
                      ? "linear-gradient(180deg, var(--accent-surface) 0%, transparent 100%)"
                      : "transparent",
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t.label}
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 14,
                      right: 14,
                      bottom: -1,
                      height: 2,
                      borderRadius: 2,
                      background: isActive
                        ? "var(--accent-primary)"
                        : "transparent",
                      transition: "background-color 140ms ease",
                      boxShadow: isActive
                        ? "0 0 6px color-mix(in oklab, var(--accent-primary) 50%, transparent)"
                        : "none",
                    }}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[228px_minmax(0,1fr)]">
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
    <nav
      aria-label={`${tab.label} — sections`}
      className="flex flex-col gap-0.5"
      style={{
        padding: 10,
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
          "0 1px 2px 0 rgba(0,0,0,0.18)",
      }}
    >
      <div
        className="flex items-center gap-1.5 px-2 pb-1"
        style={{
          color: "var(--text-default)",
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          lineHeight: 1.2,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 3,
            height: 3,
            borderRadius: 1,
            background: "var(--accent-primary)",
            flexShrink: 0,
          }}
        />
        {tab.label}
      </div>
      {tab.items.map((item) => {
        const href = `${base}/${item.slug}`;
        const aliasMatch =
          item.slug === "templates" &&
          (pathname === `${base}/message-templates` ||
            pathname.startsWith(`${base}/message-templates/`));
        const active =
          pathname === href || pathname.startsWith(`${href}/`) || aliasMatch;
        return (
          <Link
            key={item.slug}
            href={href}
            className="ts-focus relative block transition-colors"
            style={{
              padding: "7px 12px 7px 14px",
              fontSize: 12.5,
              fontWeight: active ? 600 : 500,
              letterSpacing: "-0.005em",
              color: active ? "var(--text-default)" : "var(--text-muted)",
              background: active
                ? "linear-gradient(90deg, var(--accent-surface) 0%, color-mix(in oklab, var(--accent-surface) 30%, transparent) 75%, transparent 100%)"
                : "transparent",
              borderRadius: 7,
            }}
            aria-current={active ? "page" : undefined}
          >
            {active && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 4,
                  top: 8,
                  bottom: 8,
                  width: 2.5,
                  borderRadius: 999,
                  background: "var(--accent-primary)",
                  boxShadow:
                    "0 0 0 0.5px var(--accent-primary), 0 0 8px color-mix(in oklab, var(--accent-primary) 50%, transparent)",
                }}
              />
            )}
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
