"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { Icon, type IconName } from "./icons";
import { setSidebarCollapsed } from "@/app/actions/ui";

// Tenant workspace sidebar — premium redesign (Page T spec, T-shell).
//
// Mirrors the platform-admin sidebar's premium treatment so the two
// surfaces share a visual language, with tenant-specific touches:
//   • Brand row pairs the Flowtora logomark with a "Workspace" chip
//   • Live filter ("Jump to…") to slice 13+ destinations to a glance
//   • Collapsible sections with smooth grid-row animation
//   • Active row: gradient tint + 2.5px glowing accent bar + accent icon
//   • Background: radial accent halo bleeding from top-left
//   • Bottom cluster: workspace identity card with online dot + role pill,
//     "Send feedback" affordance, and a quiet collapse pill
//
// Sections + items + badges still arrive as props from the server
// component (layout.tsx) — this file owns the visual shell only.

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

const WIDTH_EXPANDED  = 260;
const WIDTH_COLLAPSED = 68;
const OPEN_SECTIONS_KEY = "flowtora.tenant-nav.open-sections";

/** Stable identifier for a section — keyed off the visible label.
 *  Falls back to slugified label so spaces/punctuation don't break
 *  localStorage parity across renders. */
function sectionId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Returns the id of the section that owns the current path, if any. */
function findActiveSectionId(sections: SidebarSection[], pathname: string): string | null {
  for (const s of sections) {
    for (const item of s.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return sectionId(s.label);
      }
    }
  }
  return null;
}

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
  const tenantHref = `/t/${slug}/dashboard`;
  const width = collapsed ? WIDTH_COLLAPSED : WIDTH_EXPANDED;

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      setSidebarCollapsed(next).catch(() => {});
      return next;
    });
  }, []);

  // ── Per-section open/close state ─────────────────────────────
  const activeSectionId = findActiveSectionId(sections, pathname ?? "");
  const [openSections, setOpenSections] = React.useState<Set<string>>(
    () => new Set(activeSectionId ? [activeSectionId] : []),
  );
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_SECTIONS_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) setOpenSections(new Set(ids));
      } else if (activeSectionId) {
        setOpenSections(new Set([activeSectionId]));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Always keep the active section open when the path changes.
  React.useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((prev) => {
      if (prev.has(activeSectionId)) return prev;
      const next = new Set(prev);
      next.add(activeSectionId);
      try { window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, [activeSectionId]);
  const toggleSection = React.useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Live filter ("Jump to…") ─────────────────────────────────
  const [filter, setFilter] = React.useState("");
  const filterActive = filter.trim().length > 0;
  const q = filter.trim().toLowerCase();
  const filterMatch = React.useCallback(
    (label: string) => label.toLowerCase().includes(q),
    [q],
  );
  const filteredSections = React.useMemo(() => {
    if (!filterActive) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => filterMatch(i.label)) }))
      .filter((s) => s.items.length > 0);
  }, [filterActive, filterMatch, sections]);
  const totalMatches = filteredSections.reduce((n, s) => n + s.items.length, 0);

  const tenantInitial = tenantName.slice(0, 1).toUpperCase() || "?";

  return (
    <aside
      className="flex flex-col transition-[width] duration-200 ease-out"
      style={{
        width,
        // Premium background: deep panel with a soft accent halo bleeding
        // from the top-left + subtle vertical surface gradient + right-
        // edge inset hairline for crispness.
        background:
          "radial-gradient(720px circle at -10% -8%, var(--accent-surface), transparent 55%), " +
          "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-1) 60%, var(--surface-0) 100%)",
        borderRight: "1px solid var(--border-subtle)",
        boxShadow: "inset -1px 0 0 0 rgba(255,255,255,0.02)",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      {/* ── Flowtora brand row ────────────────────────────────── */}
      <Link
        href="/select-tenant"
        aria-label="Flowtora home"
        title={collapsed ? "Flowtora" : undefined}
        className={cn(
          "ts-focus group flex shrink-0 items-center gap-2.5 px-3.5 transition-colors",
          "hover:bg-[color-mix(in_oklab,var(--accent-primary)_5%,transparent)]",
          collapsed && "justify-center px-0",
        )}
        style={{
          height: 60,
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
            boxShadow:
              "inset 0 0 0 1px color-mix(in oklab, var(--accent-primary) 28%, transparent), " +
              "0 1px 0 0 rgba(255,255,255,0.04)",
          }}
        >
          <Logomark size={20} />
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Wordmark style={{ fontSize: 15, letterSpacing: "-0.015em" }} />
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 999,
                color: "var(--accent-primary)",
                background: "var(--accent-surface)",
                border: "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                lineHeight: 1,
              }}
            >
              Workspace
            </span>
          </span>
        )}
      </Link>

      {/* ── Filter input ──────────────────────────────────────── */}
      {!collapsed && (
        <div className="shrink-0 px-3 pt-3 pb-2">
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 32,
              padding: "0 10px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
              border: "1px solid var(--border-subtle)",
              transition: "border-color 120ms ease, background-color 120ms ease",
            }}
          >
            <Icon.Search size={13} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
              placeholder="Jump to…"
              aria-label="Filter navigation"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            />
            {filterActive ? (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label="Clear filter"
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  color: "var(--text-muted)",
                  background: "transparent",
                }}
              >
                ×
              </button>
            ) : (
              <kbd
                aria-hidden
                style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-faint)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
                  letterSpacing: "0.02em",
                }}
              >
                /
              </kbd>
            )}
          </div>
        </div>
      )}

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto px-2.5"
        aria-label="Primary"
        style={{
          paddingTop: collapsed ? 12 : 4,
          paddingBottom: 8,
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-default) transparent",
        }}
      >
        <div className="space-y-0.5">
          {filteredSections.map((section) => {
            const id = sectionId(section.label);
            const isOpen = filterActive || openSections.has(id);
            const hasActive = section.items.some((item) =>
              pathname === item.href || (pathname ?? "").startsWith(item.href + "/")
            );

            if (collapsed) {
              return (
                <div key={id} className="ts-nav-group" style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)" }}>
                  {section.items.map((item) => {
                    const active =
                      pathname === item.href || (pathname ?? "").startsWith(item.href + "/");
                    return (
                      <PremiumNavItem
                        key={item.href}
                        item={item}
                        active={active}
                        collapsed
                      />
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={id} data-nav-section={id} style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => !filterActive && toggleSection(id)}
                  aria-expanded={isOpen}
                  disabled={filterActive}
                  className="ts-focus flex w-full items-center gap-1.5 rounded-md transition-colors"
                  style={{
                    padding: "6px 8px 6px 10px",
                    color: hasActive ? "var(--text-default)" : "var(--text-faint)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    cursor: filterActive ? "default" : "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: 1,
                      background: hasActive ? "var(--accent-primary)" : "var(--border-default)",
                      transition: "background-color 120ms ease",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, textAlign: "left" }}>{section.label}</span>
                  {!filterActive && (
                    <Icon.ChevronsRight
                      size={10}
                      style={{
                        color: "var(--text-faint)",
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 160ms cubic-bezier(0.22, 1, 0.36, 1)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </button>
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: isOpen ? "1fr" : "0fr",
                    transition: "grid-template-rows 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  <div style={{ overflow: "hidden", minHeight: 0 }}>
                    <div className="ts-nav-group" style={{ paddingTop: 2, paddingBottom: 2 }}>
                      {section.items.map((item) => {
                        const active =
                          pathname === item.href || (pathname ?? "").startsWith(item.href + "/");
                        return (
                          <PremiumNavItem
                            key={item.href}
                            item={item}
                            active={active}
                            collapsed={false}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filterActive && totalMatches === 0 && (
            <div
              style={{
                marginTop: 16,
                padding: "14px 12px",
                borderRadius: 8,
                border: "1px dashed var(--border-subtle)",
                color: "var(--text-muted)",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              No pages match <span style={{ color: "var(--text-default)" }}>“{filter}”</span>
            </div>
          )}
        </div>
      </nav>

      {/* ── Bottom cluster ────────────────────────────────────── */}
      <div
        className="shrink-0"
        style={{
          borderTop: "1px solid var(--border-subtle)",
          background:
            "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--surface-0) 35%, transparent) 100%)",
          padding: "10px",
        }}
      >
        {/* Workspace identity card — anchor for tenant switcher (popover
            lives in TopBar). Avatar uses tenant initial with accent ring
            and an emerald "online" dot. */}
        <Link
          href={tenantHref}
          title={collapsed ? tenantName : "Workspace home"}
          className={cn(
            "ts-focus group/workspace flex min-w-0 items-center transition-colors",
            collapsed
              ? "justify-center rounded-md p-1 hover:bg-[var(--surface-3)]"
              : "gap-2.5 rounded-lg px-2 py-2 hover:bg-[color-mix(in_oklab,var(--surface-3)_60%,transparent)]",
          )}
          style={{
            background: collapsed
              ? "transparent"
              : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
            border: collapsed ? "0" : "1px solid var(--border-subtle)",
          }}
        >
          <span
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border: "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.02em",
              flexShrink: 0,
            }}
          >
            {tenantInitial}
            <span
              aria-hidden
              style={{
                position: "absolute",
                bottom: -1,
                right: -1,
                width: 9,
                height: 9,
                borderRadius: 999,
                background: "var(--emerald-500)",
                boxShadow: "0 0 0 2px var(--surface-1)",
              }}
            />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span
                  className="block truncate"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    lineHeight: 1.2,
                  }}
                >
                  {tenantName}
                </span>
                <span
                  className="mt-0.5 flex items-center gap-1.5"
                  style={{ lineHeight: 1.2 }}
                >
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "var(--accent-primary)",
                      background: "var(--accent-surface)",
                      padding: "1px 6px",
                      borderRadius: 999,
                    }}
                  >
                    {planLabel}
                  </span>
                  <span
                    className="truncate"
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-muted)",
                    }}
                  >
                    {roleLabel}
                  </span>
                </span>
              </span>
              <Icon.ChevronDown
                size={13}
                style={{ color: "var(--text-faint)", flexShrink: 0 }}
              />
            </>
          )}
        </Link>

        {/* Send feedback — quieter than the workspace card, still visible. */}
        <Link
          href={`/t/${slug}/feedback?from=${encodeURIComponent(pathname ?? "")}`}
          title={collapsed ? "Send feedback" : undefined}
          className={cn(
            "ts-focus mt-2 flex items-center rounded-md text-[11.5px] transition-colors hover:bg-[var(--surface-3)]",
            collapsed ? "mx-auto h-7 w-7 justify-center" : "w-full gap-2 px-2 py-1.5",
          )}
          style={{ color: "var(--accent-primary)" }}
        >
          <Icon.MessageSquare size={13} style={{ opacity: 0.9 }} />
          {!collapsed && (
            <>
              <span style={{ flex: 1 }}>Send feedback</span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "2px 5px",
                  borderRadius: 4,
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                }}
              >
                Beta
              </span>
            </>
          )}
        </Link>

        {/* Collapse toggle — faint pill, full width when expanded. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "ts-focus mt-1 flex items-center rounded-md text-[11px] transition-colors hover:bg-[var(--surface-3)]",
            collapsed ? "mx-auto h-7 w-7 justify-center" : "w-full gap-2 px-2 py-1.5",
          )}
          style={{ color: "var(--text-faint)" }}
        >
          {collapsed ? <Icon.ChevronsRight size={13} /> : <Icon.ChevronsLeft size={13} />}
          {!collapsed && <span className="flex-1 text-left">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────── */

/**
 * Premium nav row — gradient active background, glowing 2.5px accent
 * left-bar with rounded cap, accent-tinted icon when active, hover
 * lift, badge support inherited from the previous version.
 */
function PremiumNavItem({
  item, active, collapsed,
}: {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
}) {
  const IconCmp = Icon[item.icon];
  const hasBadge = item.badge !== undefined && item.badge > 0;

  if (collapsed) {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={item.label}
        className="ts-focus"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          margin: "0 auto",
          borderRadius: 8,
          color: active ? "var(--accent-primary)" : "var(--text-muted)",
          background: active ? "var(--accent-surface)" : "transparent",
          border: active
            ? "1px solid color-mix(in oklab, var(--accent-primary) 25%, transparent)"
            : "1px solid transparent",
          transition: "background-color 120ms ease, color 120ms ease, border-color 120ms ease",
        }}
      >
        <IconCmp size={16} />
        {hasBadge && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--danger, var(--rose-500))",
              boxShadow: "0 0 0 1.5px var(--surface-1)",
            }}
          />
        )}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="ts-focus"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 32,
        padding: "0 10px 0 12px",
        borderRadius: 7,
        color: active ? "var(--text-default)" : "var(--text-muted)",
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        letterSpacing: "-0.005em",
        lineHeight: 1,
        background: active
          ? "linear-gradient(90deg, var(--accent-surface) 0%, color-mix(in oklab, var(--accent-surface) 30%, transparent) 70%, transparent 100%)"
          : "transparent",
        transition: "background-color 140ms ease, color 140ms ease",
        overflow: "hidden",
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 3,
            top: 7,
            bottom: 7,
            width: 2.5,
            borderRadius: 999,
            background: "var(--accent-primary)",
            boxShadow:
              "0 0 0 0.5px var(--accent-primary), 0 0 8px color-mix(in oklab, var(--accent-primary) 50%, transparent)",
          }}
        />
      )}
      <IconCmp
        size={15}
        style={{
          flexShrink: 0,
          color: active ? "var(--accent-primary)" : "var(--text-muted)",
          opacity: active ? 1 : 0.85,
          transition: "color 140ms ease, opacity 140ms ease",
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
      </span>
      {hasBadge && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 9,
            background: active
              ? "color-mix(in oklab, var(--accent-primary) 22%, transparent)"
              : "var(--surface-3)",
            color: active ? "var(--accent-primary)" : "var(--text-muted)",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0,
            flexShrink: 0,
          }}
        >
          {item.badge! > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}
