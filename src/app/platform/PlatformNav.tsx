"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
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
      { href: "/platform/revenue", label: "Revenue", icon: "Revenue" },
      { href: "/platform/tenants", label: "Tenants", icon: "Building" },
      { href: "/platform/usage",   label: "Usage",   icon: "Activity" },
      { href: "/platform/leads",   label: "Leads",   icon: "Target" },
      { href: "/platform/plans",   label: "Plans",   icon: "Package" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/platform/support",       label: "Support",       icon: "Support" },
      { href: "/platform/feedback",      label: "Feedback",      icon: "MessageSquare" },
      { href: "/platform/readiness",     label: "Readiness",     icon: "Rocket" },
      { href: "/platform/announcements", label: "Announcements", icon: "Megaphone" },
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
      { href: "/platform/settings", label: "Settings",      icon: "Settings" },
      { href: "/platform/design",   label: "Design system", icon: "Palette" },
    ],
  },
];

export interface PlatformNavProps {
  roleLabel: string;
  signOutAction: () => void | Promise<void>;
}

export function PlatformNav({ roleLabel, signOutAction }: PlatformNavProps) {
  const pathname = usePathname();

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
      {/* ── Brand block ────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-2.5 pb-2.5 pt-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="ts-nav-brand" style={{ cursor: "default" }}>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            <Icon.Shield size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[13px] font-semibold leading-tight"
              style={{ color: "var(--text-default)" }}
            >
              Tracksign Platform
            </div>
            <div
              className="truncate text-[11px] leading-tight"
              style={{ color: "var(--text-muted)" }}
            >
              {roleLabel}
            </div>
          </div>
        </div>
      </div>

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
        <Link href="/select-tenant" className="ts-nav-foot ts-focus">
          <Icon.ArrowLeft size={14} />
          <span className="flex-1">Back to app</span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="ts-nav-foot ts-focus w-full">
            <Icon.SignOut size={14} />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
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
    </Link>
  );
}
