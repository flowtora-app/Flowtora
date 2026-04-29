"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { Icon, type IconName } from "@/components/shell/icons";

// Platform admin sidebar. Visually identical to the tenant Sidebar via
// the shared `.ts-nav-*` primitives in globals.css. Grouped into five
// clusters so the 18+ links stay scannable:
//   Overview      — the dashboard + global search
//   Business      — revenue, tenants, leads, plans (the money side)
//   Operations    — support, feedback, readiness, announcements
//   Reliability   — health, audit log, compliance, feature flags
//   Admin         — settings + design system (internal knobs)
//
// Active state matches by prefix so nested routes keep the parent link
// highlighted. Overview matches exactly because "/platform" is the
// prefix of every other link in the nav.

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  // Preview = feature is stubbed and lives on the roadmap. The route
  // still loads for platform staff but the nav renders a small badge
  // so no one is surprised when the page explains it isn't wired up.
  // See docs/transformation-plan.md §Phase 1.
  preview?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/platform",        label: "Overview", icon: "Dashboard", exact: true },
      { href: "/platform/search", label: "Search",   icon: "Search" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/platform/revenue",   label: "Revenue",   icon: "Revenue" },
      { href: "/platform/billing",   label: "Billing ops", icon: "Invoices" },
      { href: "/platform/analytics", label: "Analytics", icon: "Globe" },
      { href: "/platform/tenants",   label: "Tenants",   icon: "Building" },
      { href: "/platform/usage",     label: "Usage",     icon: "Activity" },
      { href: "/platform/leads",     label: "Leads",     icon: "Target" },
      { href: "/platform/plans",     label: "Plans",     icon: "Package" },
      { href: "/platform/features",  label: "Features",  icon: "Sparkles" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/platform/support",       label: "Support",       icon: "Support" },
      { href: "/platform/feedback",      label: "Feedback",      icon: "MessageSquare" },
      { href: "/platform/readiness",     label: "Readiness",     icon: "Rocket" },
      { href: "/platform/announcements", label: "Announcements", icon: "Megaphone", preview: true },
    ],
  },
  {
    label: "Reliability",
    items: [
      { href: "/platform/health",        label: "Health",        icon: "Heartbeat" },
      { href: "/platform/audit",         label: "Audit log",     icon: "FileText" },
      { href: "/platform/compliance",    label: "Compliance",    icon: "Scale" },
      { href: "/platform/feature-flags", label: "Feature flags", icon: "Flag" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/platform/staff",         label: "Staff & roles", icon: "Shield" },
      { href: "/platform/notifications", label: "Notifications", icon: "Bell" },
      { href: "/platform/settings",      label: "Settings",      icon: "Settings" },
      { href: "/platform/design",        label: "Design system", icon: "Palette" },
    ],
  },
];

export interface PlatformNavProps {
  roleLabel: string;
  /** Display name of the signed-in admin. Falls back to email if absent. */
  userName: string | null;
  /** Email of the signed-in admin — used for the initials fallback + secondary line. */
  userEmail: string;
  /** Optional avatar URL. When present, replaces the initials chip. */
  userImage: string | null;
  signOutAction: () => void | Promise<void>;
}

export function PlatformNav({
  roleLabel,
  userName,
  userEmail,
  userImage,
  signOutAction,
}: PlatformNavProps) {
  const pathname = usePathname();
  const initials = deriveInitials(userName ?? userEmail);
  const displayName = userName?.trim() || userEmail;

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 248,
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      {/* ── Flowtora brand row ─────────────────────────────────────── */}
      <Link
        href="/select-tenant"
        aria-label="Flowtora home"
        className="ts-focus flex shrink-0 items-center gap-2 px-3 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Logomark size={28} />
        <Wordmark style={{ fontSize: 16, letterSpacing: "-0.01em" }} />
      </Link>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto px-2.5 py-3"
        aria-label="Platform"
      >
        {GROUPS.map((group) => (
          <div key={group.label} className="ts-nav-group">
            <div className="ts-nav-group-label">{group.label}</div>
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return <PlatformNavItem key={item.href} item={item} active={active} />;
            })}
          </div>
        ))}
      </nav>

      {/* ── Bottom cluster ─────────────────────────────────────────── */}
      <div
        className="shrink-0 space-y-1 px-2.5 py-2.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {/* User identity (links to /platform/profile) + sign-out icon.
            The avatar + name area is a profile link; sign-out is its
            own icon button so the two intents don't collide. */}
        <div className="flex items-center gap-1">
          <Link
            href="/platform/profile"
            className="ts-focus flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-3)]"
            title="Profile, security, preferences"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {userImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userImage}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                initials
              )}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span
                className="block truncate text-[13px] font-semibold leading-tight"
                style={{ color: "var(--text-default)" }}
              >
                {displayName}
              </span>
              <span
                className="block truncate text-[11px] leading-tight"
                style={{ color: "var(--text-muted)" }}
              >
                {roleLabel}
              </span>
            </span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-3)]"
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon.SignOut size={14} style={{ color: "var(--text-muted)" }} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function deriveInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  // For an email, drop the domain and split on dots/dashes/spaces so
  // "sarah.foo@flowtora.com" → "SF" instead of "SA".
  const stem = trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  const parts = stem.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return stem.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/* ──────────────────────────────────────────────────────────────── */

function PlatformNavItem({ item, active }: { item: NavItem; active: boolean }) {
  const IconCmp = Icon[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("ts-nav-item ts-focus")}
    >
      <IconCmp size={16} className="ts-nav-icon" />
      <span className="ts-nav-label">{item.label}</span>
      {item.preview ? (
        <span
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
          title="Preview — feature is on the roadmap but not yet wired up"
        >
          Preview
        </span>
      ) : null}
    </Link>
  );
}
