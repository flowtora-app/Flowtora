"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { Icon, type IconName } from "./icons";
import { setSidebarCollapsed } from "@/app/actions/ui";

// Phase 18 Slice B — Sidebar (refined).
//
// Client component because it owns the collapse state + reads
// usePathname for the active link. The collapsed preference persists
// via a cookie so SSR renders the right width on the next request.
//
// Visual language lives in globals.css under `.ts-nav-*` so this nav
// and the platform admin nav stay visually identical — one source of
// truth for row height, active indicator, hover tint, and badges.

export type SidebarItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
};

export type SidebarSection = {
  label: string;
  items: SidebarItem[];
};

export interface SidebarProps {
  slug: string;
  tenantName: string;
  roleLabel: string;
  planLabel: string;
  sections: SidebarSection[];
  collapsedInitial: boolean;
}

const WIDTH_EXPANDED  = 248;
const WIDTH_COLLAPSED = 64;

export function Sidebar({
  slug,
  tenantName,
  roleLabel,
  planLabel,
  sections,
  collapsedInitial,
}: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(collapsedInitial);
  const pathname = usePathname();

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    setSidebarCollapsed(next).catch(() => {});
  };

  const tenantHref = `/t/${slug}/dashboard`;
  const width = collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED;

  return (
    <aside
      className="flex flex-col transition-[width] duration-200 ease-out"
      style={{
        width,
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
        title={collapsed ? "flowtora" : undefined}
        className={cn(
          "ts-focus flex shrink-0 items-center gap-2 px-3 py-3",
          collapsed && "justify-center px-0",
        )}
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Logomark size={28} />
        {!collapsed && (
          <Wordmark style={{ fontSize: 16, letterSpacing: "-0.01em" }} />
        )}
      </Link>

      {/* ── Tenant / workspace block ───────────────────────────────── */}
      <div
        className="shrink-0 px-2.5 pb-2.5 pt-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <Link
          href={tenantHref}
          title={collapsed ? tenantName : undefined}
          className={cn(
            "ts-nav-brand ts-focus",
            collapsed && "justify-center px-0",
          )}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            {tenantName.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-[13px] font-semibold leading-tight"
                  style={{ color: "var(--text-default)" }}
                >
                  {tenantName}
                </div>
                <div
                  className="truncate text-[11px] leading-tight"
                  style={{ color: "var(--text-muted)" }}
                >
                  {roleLabel} · {planLabel}
                </div>
              </div>
              <Icon.ChevronDown
                size={14}
                style={{ color: "var(--text-faint)", flexShrink: 0 }}
              />
            </>
          )}
        </Link>
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto px-2.5 py-3"
        aria-label="Primary"
      >
        {sections.map((section) => (
          <div key={section.label} className="ts-nav-group">
            {!collapsed && (
              <div className="ts-nav-group-label">{section.label}</div>
            )}
            {section.items.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/")
                }
              />
            ))}
          </div>
        ))}
      </nav>

      {/* ── Bottom cluster ─────────────────────────────────────────── */}
      <div
        className="shrink-0 space-y-1 px-2.5 py-2.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <Link
          href={`/t/${slug}/feedback?from=${encodeURIComponent(pathname ?? "")}`}
          title={collapsed ? "Send feedback" : undefined}
          className={cn(
            "ts-nav-foot ts-focus",
            collapsed && "justify-center px-0",
          )}
          style={{ color: "var(--accent-primary)" }}
        >
          <Icon.MessageSquare size={14} />
          {!collapsed && (
            <>
              <span className="flex-1">Send feedback</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: "var(--accent-surface)",
                  color: "var(--accent-primary)",
                }}
              >
                Beta
              </span>
            </>
          )}
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "ts-nav-foot ts-focus w-full",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? <Icon.ChevronsRight size={14} /> : <Icon.ChevronsLeft size={14} />}
          {!collapsed && <span className="flex-1 text-left">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function NavItem({
  item,
  active,
  collapsed,
}: {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
}) {
  const IconCmp = Icon[item.icon];
  const hasBadge = item.badge !== undefined && item.badge > 0;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "ts-nav-item ts-focus",
        collapsed && "ts-nav-item--collapsed",
      )}
    >
      <IconCmp size={16} className="ts-nav-icon" />
      {!collapsed && <span className="ts-nav-label">{item.label}</span>}
      {!collapsed && hasBadge && (
        <span
          className={cn(
            "ts-nav-badge",
            item.badge && item.badge > 0 && "ts-nav-badge--urgent",
          )}
        >
          {item.badge! > 99 ? "99+" : item.badge}
        </span>
      )}
      {collapsed && hasBadge && (
        <span
          aria-hidden
          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--danger)" }}
        />
      )}
    </Link>
  );
}
