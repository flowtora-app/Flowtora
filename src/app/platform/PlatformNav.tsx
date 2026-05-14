"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { Icon, type IconName } from "@/components/shell/icons";

// Platform admin sidebar — premium redesign.
//
// Visual upgrades over the previous rail:
//   • Brand block with soft accent halo and "Platform" environment chip
//   • Live filter ("Jump to…") that expands matching groups and hides
//     non-matches as you type — Esc to clear
//   • Polished collapsible sections with refined headers and a small
//     accent indicator on the active group
//   • Active item: tinted gradient row + 2.5px accent bar + accent icon
//   • Hover: subtle 1px translate to telegraph affordance
//   • Bottom: user card with status dot, role pill, hover-only sign-out
//
// All behaviour from the previous version is preserved — collapse +
// per-group state persistence to localStorage, mobile drawer flow,
// active-group auto-open, prefix-based active matching.

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  preview?: boolean;
};

type NavGroup = {
  /** Stable id used for the localStorage open-state key. */
  id: string;
  /** Section header shown above the items. */
  label: string;
  /** Icon shown next to the section header in collapsed-rail mode. */
  icon: IconName;
  items: NavItem[];
};

// Pinned items always render above the first group. Dashboard is the
// only one — every other link slots into a section below.
const PINNED: NavItem[] = [
  { href: "/platform", label: "Dashboard", icon: "Dashboard", exact: true },
];

const NAV_GROUPS: NavGroup[] = [
  {
    id: "observability",
    label: "Observability",
    icon: "Activity",
    items: [
      { href: "/platform/activity",               label: "Activity",             icon: "Activity" },
      { href: "/platform/reports",                label: "Reports",              icon: "Globe" },
    ],
  },
  {
    id: "tenants",
    label: "Tenants",
    icon: "Building",
    items: [
      { href: "/platform/tenants",                label: "Tenants",              icon: "Building" },
      { href: "/platform/tenants/onboarding",     label: "Onboarding",           icon: "Target" },
      { href: "/platform/tenants/health",         label: "Health Scores",        icon: "Heartbeat" },
      { href: "/platform/tenants/churn",          label: "Churned & At-Risk",    icon: "Attention" },
      { href: "/platform/tenants/impersonation",  label: "Impersonation",        icon: "Shield" },
    ],
  },
  {
    id: "access",
    label: "Access & Audit",
    icon: "Approvals",
    items: [
      { href: "/platform/users",                  label: "Users",                icon: "Customers" },
      { href: "/platform/access/roles",           label: "Roles & Permissions",  icon: "Approvals" },
      { href: "/platform/access/teams",           label: "Teams",                icon: "User" },
      { href: "/platform/access/invitations",     label: "Invitations",          icon: "Megaphone" },
      { href: "/platform/access/sessions",        label: "Sessions & Devices",   icon: "Monitor" },
      { href: "/platform/access/audit",           label: "Audit Log",            icon: "FileText" },
    ],
  },
  {
    id: "billing",
    label: "Billing & Revenue",
    icon: "Revenue",
    items: [
      { href: "/platform/billing",                label: "Subscriptions",        icon: "Revenue" },
      { href: "/platform/billing/invoices",       label: "Invoices",             icon: "Invoices" },
      { href: "/platform/billing/payments",       label: "Payments",             icon: "Payments" },
      { href: "/platform/billing/refunds",        label: "Refunds & Disputes",   icon: "Scale" },
      { href: "/platform/plans",                  label: "Plans & Pricing",      icon: "Package" },
      { href: "/platform/billing/coupons",        label: "Coupons & Promotions", icon: "Sparkles" },
      { href: "/platform/billing/tax",            label: "Tax & Compliance",     icon: "FileText" },
      { href: "/platform/billing/analytics",      label: "Revenue Analytics",    icon: "Globe" },
      { href: "/platform/billing/dunning",        label: "Dunning",              icon: "Attention" },
      { href: "/platform/billing/payouts",        label: "Payouts",              icon: "Vendors" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: "Products",
    items: [
      { href: "/platform/catalog/products",       label: "Master Catalog",       icon: "Products" },
      { href: "/platform/catalog/materials",      label: "Material Library",     icon: "Package" },
      { href: "/platform/catalog/equipment",      label: "Equipment Templates",  icon: "Production" },
      { href: "/platform/catalog/pricing",        label: "Pricing Formulas",     icon: "Revenue" },
      { href: "/platform/catalog/templates",      label: "Industry Templates",   icon: "FileText" },
      { href: "/platform/catalog/assets",         label: "Design Assets",        icon: "Palette" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: "Pipeline",
    items: [
      { href: "/platform/operations/jobs",              label: "Job Queue Monitor",    icon: "Pipeline" },
      { href: "/platform/operations/production",        label: "Production Health",    icon: "Heartbeat" },
      { href: "/platform/operations/tickets",           label: "Support Tickets",      icon: "Support" },
      { href: "/platform/operations/knowledge-base",    label: "Knowledge Base",       icon: "FileText" },
      { href: "/platform/operations/announcements",     label: "Announcements",        icon: "Megaphone" },
      { href: "/platform/operations/feature-requests",  label: "Feature Requests",     icon: "Sparkles" },
      { href: "/platform/operations/bugs",              label: "Bug Reports",          icon: "Attention" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "Megaphone",
    items: [
      { href: "/platform/marketing/landing-pages",      label: "Landing Pages",        icon: "Globe" },
      { href: "/platform/marketing/campaigns",          label: "Email Campaigns",      icon: "Megaphone" },
      { href: "/platform/marketing/sequences",          label: "Drip Sequences",       icon: "Pipeline" },
      { href: "/platform/marketing/referrals",          label: "Referral Program",     icon: "Sparkles" },
      { href: "/platform/marketing/affiliates",         label: "Affiliate Program",    icon: "Vendors" },
      { href: "/platform/marketing/seo",                label: "SEO & Content",        icon: "Globe" },
      { href: "/platform/marketing/leads",              label: "Lead Inbox",           icon: "Target" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: "Pipeline",
    items: [
      { href: "/platform/integrations",                 label: "Integrations Catalog", icon: "Pipeline" },
      { href: "/platform/integrations/api",             label: "API Keys & Webhooks",  icon: "Shield" },
      { href: "/platform/integrations/docs",            label: "Developer Docs",       icon: "FileText" },
      { href: "/platform/integrations/marketplace",     label: "Marketplace",          icon: "Sparkles" },
      { href: "/platform/integrations/sso",             label: "SSO Providers",        icon: "Approvals" },
    ],
  },
  {
    id: "security",
    label: "Security & Compliance",
    icon: "Shield",
    items: [
      { href: "/platform/security/center",              label: "Security Center",      icon: "Shield" },
      { href: "/platform/security/compliance",          label: "Compliance",           icon: "Scale" },
      { href: "/platform/security/privacy-requests",    label: "Privacy Requests",     icon: "User" },
      { href: "/platform/security/backups",             label: "Backups & Restore",    icon: "Package" },
      { href: "/platform/security/incidents",           label: "Incident Log",         icon: "Attention" },
      { href: "/platform/security/network",             label: "Network Restrictions", icon: "Globe" },
    ],
  },
  {
    id: "system",
    label: "System & Infrastructure",
    icon: "Heartbeat",
    items: [
      { href: "/platform/system/status",                label: "System Status",        icon: "Heartbeat" },
      { href: "/platform/system/queues",                label: "Queues & Jobs",        icon: "Pipeline" },
      { href: "/platform/system/email",                 label: "Email Deliverability", icon: "Megaphone" },
      { href: "/platform/system/storage",               label: "Storage & CDN",        icon: "Package" },
      { href: "/platform/system/database",              label: "Database Health",      icon: "Pipeline" },
      { href: "/platform/system/rate-limits",           label: "Rate Limits & Quotas", icon: "Scale" },
      { href: "/platform/system/feature-flags",         label: "Feature Flags",        icon: "Sparkles" },
      { href: "/platform/system/env",                   label: "Environment Vars",     icon: "Shield" },
      { href: "/platform/system/logs",                  label: "Logs & Errors",        icon: "FileText" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    icon: "Settings",
    items: [
      { href: "/platform/settings/general",             label: "Platform Settings",      icon: "Settings" },
      { href: "/platform/settings/branding",            label: "Branding & White-Label", icon: "Palette" },
      { href: "/platform/settings/localization",        label: "Localization",           icon: "Globe" },
      { href: "/platform/settings/webhooks",            label: "Webhooks Catalog",       icon: "Pipeline" },
      { href: "/platform/settings/domains",             label: "Domains",                icon: "Globe" },
      { href: "/platform/settings/legal",               label: "Legal Documents",        icon: "Scale" },
    ],
  },
  {
    id: "personal",
    label: "Personal",
    icon: "User",
    items: [
      { href: "/platform/me/profile",                   label: "My Profile",           icon: "User" },
      { href: "/platform/me/notifications",             label: "My Notifications",     icon: "Megaphone" },
      { href: "/platform/me/api-keys",                  label: "My API Keys",          icon: "Shield" },
      { href: "/platform/me/shortcuts",                 label: "Keyboard Shortcuts",   icon: "Sparkles" },
    ],
  },
  {
    id: "help",
    label: "Help Center",
    icon: "Support",
    items: [
      { href: "/platform/help",                         label: "Help Center",          icon: "Support" },
    ],
  },
];

const COLLAPSE_KEY       = "flowtora.platform-nav.collapsed";
const OPEN_SECTIONS_KEY  = "flowtora.platform-nav.open-sections";
const EXPANDED_W = 260;
const COLLAPSED_W = 68;

/** Find the group id that owns a given pathname, if any. */
function findActiveGroupId(pathname: string): string | null {
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")) {
        return g.id;
      }
    }
  }
  return null;
}

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

  // Mobile drawer state — sidebar collapses below `lg` (1024px) and
  // re-opens via the hamburger in the top bar.
  const [open, setOpen] = React.useState(false);

  // Desktop collapse state — persisted to localStorage. Default expanded.
  // We start "uninitialized" so SSR + first paint don't flicker before
  // the localStorage value loads.
  const [collapsed, setCollapsed] = React.useState<boolean>(false);
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(COLLAPSE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {
      // ignore — user may have storage disabled
    }
    setHydrated(true);
  }, []);
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Per-group expand/collapse state ────────────────────────
  const activeGroupId = findActiveGroupId(pathname);
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(
    () => new Set(activeGroupId ? [activeGroupId] : []),
  );
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_SECTIONS_KEY);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) setOpenGroups(new Set(ids));
      } else if (activeGroupId) {
        setOpenGroups(new Set([activeGroupId]));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => {
      if (prev.has(activeGroupId)) return prev;
      const next = new Set(prev);
      next.add(activeGroupId);
      try { window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, [activeGroupId]);
  const toggleGroup = React.useCallback((id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Live filter ("Jump to…") ───────────────────────────────
  const [filter, setFilter] = React.useState("");
  const filterActive = filter.trim().length > 0;
  const q = filter.trim().toLowerCase();
  const filterMatch = React.useCallback(
    (label: string) => label.toLowerCase().includes(q),
    [q],
  );

  // When the filter is active we render groups expanded and items filtered.
  const filteredGroups = React.useMemo(() => {
    if (!filterActive) return NAV_GROUPS;
    return NAV_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => filterMatch(i.label)) }))
      .filter((g) => g.items.length > 0);
  }, [filterActive, filterMatch]);

  const filteredPinned = React.useMemo(() => {
    if (!filterActive) return PINNED;
    return PINNED.filter((i) => filterMatch(i.label));
  }, [filterActive, filterMatch]);

  const totalMatches = filteredPinned.length + filteredGroups.reduce((n, g) => n + g.items.length, 0);

  // Close the mobile drawer on every navigation.
  const lastPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathRef.current !== pathname) {
      setOpen(false);
      lastPathRef.current = pathname;
    }
  }, [pathname]);

  const desktopWidth = hydrated && collapsed ? COLLAPSED_W : EXPANDED_W;
  const railCollapsed = !open && collapsed;

  return (
    <>
      {/* ── Mobile-only top bar with the hamburger ──────────────── */}
      <header
        className="lg:hidden"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="ts-focus inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-default)" }}
          >
            ☰
          </button>
        </div>
      </header>

      {/* Backdrop — click to close on mobile. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="lg:hidden"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
            zIndex: 50,
          }}
        />
      )}

      <aside
        className={[
          "flex-col transition-[width]",
          open ? "fixed inset-y-0 left-0 flex" : "hidden",
          "lg:sticky lg:top-0 lg:flex",
        ].join(" ")}
        style={{
          width: open ? EXPANDED_W : desktopWidth,
          // Premium background: deep panel with a soft accent halo bleeding
          // from the top-left, plus a hairline gradient down the right edge.
          background:
            "radial-gradient(720px circle at -10% -8%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, var(--surface-1) 0%, var(--surface-1) 60%, var(--surface-0) 100%)",
          borderRight: "1px solid var(--border-subtle)",
          boxShadow: "inset -1px 0 0 0 rgba(255,255,255,0.02)",
          height: "100vh",
          zIndex: 60,
          transitionDuration: "180ms",
        }}
        data-platform-nav-open={open ? "true" : "false"}
        data-platform-nav-collapsed={railCollapsed ? "true" : "false"}
      >
        {/* ── Brand row ───────────────────────────────────────── */}
        <Link
          href="/select-tenant"
          aria-label="Flowtora home"
          className="ts-focus group flex shrink-0 items-center gap-2.5 px-3.5 transition-colors hover:bg-[color-mix(in_oklab,var(--accent-primary)_5%,transparent)]"
          style={{
            height: 60,
            borderBottom: "1px solid var(--border-subtle)",
            justifyContent: railCollapsed ? "center" : "flex-start",
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
          {!railCollapsed && (
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
                Platform
              </span>
            </span>
          )}
        </Link>

        {/* ── Filter ("Jump to…") ─────────────────────────────── */}
        {!railCollapsed && (
          <div
            className="shrink-0 px-3 pt-3 pb-2"
          >
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

        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto px-2.5"
          aria-label="Platform"
          style={{
            paddingTop: railCollapsed ? 12 : 4,
            paddingBottom: 8,
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border-default) transparent",
          }}
        >
          {/* Pinned items (Dashboard) — always visible above sections. */}
          {filteredPinned.length > 0 && (
            <div className="ts-nav-group" style={{ marginBottom: railCollapsed ? 8 : 6 }}>
              {filteredPinned.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <PremiumNavItem
                    key={item.href}
                    item={item}
                    active={active}
                    collapsed={railCollapsed}
                  />
                );
              })}
            </div>
          )}

          {/* Collapsible sections. */}
          <div className="space-y-0.5">
            {filteredGroups.map((group) => {
              const isOpen = filterActive || openGroups.has(group.id);
              const hasActive = group.items.some((item) =>
                item.exact ? pathname === item.href
                           : pathname === item.href || pathname.startsWith(item.href + "/")
              );
              return (
                <div key={group.id} data-nav-group={group.id} style={{ marginTop: railCollapsed ? 0 : 6 }}>
                  {railCollapsed ? (
                    // Icon-rail mode — render as a tooltip-only grouping
                    // with a hairline divider between groups.
                    <div
                      className="ts-nav-group"
                      style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--border-subtle)" }}
                    >
                      {group.items.map((item) => {
                        const active = item.exact
                          ? pathname === item.href
                          : pathname === item.href || pathname.startsWith(item.href + "/");
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
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => !filterActive && toggleGroup(group.id)}
                        aria-expanded={isOpen}
                        disabled={filterActive}
                        className="ts-focus group/section flex w-full items-center gap-1.5 rounded-md transition-colors"
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
                        {/* Active-group indicator — tiny accent square. */}
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
                        <span style={{ flex: 1, textAlign: "left" }}>{group.label}</span>
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
                            {group.items.map((item) => {
                              const active = item.exact
                                ? pathname === item.href
                                : pathname === item.href || pathname.startsWith(item.href + "/");
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
                    </>
                  )}
                </div>
              );
            })}

            {/* Empty filter result. */}
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

        {/* ── Bottom cluster ──────────────────────────────────── */}
        <div
          className="shrink-0"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--surface-0) 35%, transparent) 100%)",
            padding: "10px",
          }}
        >
          {/* Design system reference — quiet utility link. */}
          {!railCollapsed && (
            <Link
              href="/platform/design"
              aria-current={pathname === "/platform/design" ? "page" : undefined}
              className="ts-focus flex items-center gap-2 rounded-md px-2 py-1.5 text-[11.5px] transition-colors hover:bg-[var(--surface-3)]"
              style={{
                color: pathname === "/platform/design" ? "var(--text-default)" : "var(--text-muted)",
                marginBottom: 8,
              }}
              title="Design system reference (internal)"
            >
              <Icon.Palette size={13} style={{ opacity: 0.7 }} />
              <span style={{ flex: 1 }}>Design system</span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                }}
              >
                Internal
              </span>
            </Link>
          )}

          {/* User card — avatar with status dot, name + role chip, sign-out. */}
          <div
            className={cn(
              "flex items-center",
              railCollapsed ? "flex-col gap-2" : "gap-1.5",
            )}
            style={{
              padding: railCollapsed ? "0" : "8px 8px 8px 8px",
              borderRadius: 10,
              background: railCollapsed
                ? "transparent"
                : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
              border: railCollapsed ? "0" : "1px solid var(--border-subtle)",
            }}
          >
            <Link
              href="/platform/profile"
              className={cn(
                "ts-focus group/user flex min-w-0 items-center transition-colors",
                railCollapsed ? "justify-center rounded-md p-1 hover:bg-[var(--surface-3)]" : "flex-1 gap-2.5 rounded-md hover:bg-[color-mix(in_oklab,var(--surface-3)_60%,transparent)]",
              )}
              title={railCollapsed ? `${displayName} · profile` : "Profile, security, preferences"}
            >
              {/* Avatar with online dot. */}
              <span
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  background: "var(--accent-surface)",
                  color: "var(--accent-primary)",
                  border: "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  flexShrink: 0,
                  overflow: "hidden",
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
              {!railCollapsed && (
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
                    {displayName}
                  </span>
                  <span
                    className="mt-0.5 inline-flex items-center gap-1 truncate"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "var(--accent-primary)",
                      background: "var(--accent-surface)",
                      padding: "1px 6px",
                      borderRadius: 999,
                      lineHeight: 1.4,
                      maxWidth: "100%",
                    }}
                  >
                    {roleLabel}
                  </span>
                </span>
              )}
            </Link>
            {!railCollapsed && (
              <form action={signOutAction} style={{ flexShrink: 0 }}>
                <button
                  type="submit"
                  className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-3)]"
                  title="Sign out"
                  aria-label="Sign out"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Icon.SignOut size={14} />
                </button>
              </form>
            )}
            {railCollapsed && (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-3)]"
                  title="Sign out"
                  aria-label="Sign out"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Icon.SignOut size={14} />
                </button>
              </form>
            )}
          </div>

          {/* Collapse toggle — desktop only, sits below the user card. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "ts-focus hidden items-center rounded-md text-[11px] transition-colors hover:bg-[var(--surface-3)] lg:flex",
              railCollapsed ? "mx-auto mt-2 h-7 w-7 justify-center" : "mt-2 w-full gap-2 px-2 py-1.5",
            )}
            style={{ color: "var(--text-faint)" }}
          >
            {collapsed ? <Icon.ChevronsRight size={13} /> : <Icon.ChevronsLeft size={13} />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

function deriveInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const stem = trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  const parts = stem.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return stem.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/* ──────────────────────────────────────────────────────────────── */

/**
 * Premium nav row — overrides the shared `.ts-nav-item` look with a
 * crisper active state (gradient tint + 2.5px accent bar with rounded
 * cap), hover translate, and tighter typography. We render as a plain
 * <Link> with inline styles so the platform sidebar can diverge from
 * the tenant sidebar without dragging globals.css along for the ride.
 */
function PremiumNavItem({
  item, active, collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const IconCmp = Icon[item.icon];

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
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="ts-focus group/item"
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
        transition: "background-color 140ms ease, color 140ms ease, transform 140ms ease",
        overflow: "hidden",
      }}
    >
      {/* Active left bar — sits inside the row, rounded cap. */}
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
            boxShadow: "0 0 0 0.5px var(--accent-primary), 0 0 8px color-mix(in oklab, var(--accent-primary) 50%, transparent)",
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
      {item.preview ? (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "2px 5px",
            borderRadius: 4,
            color: "var(--text-muted)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
          title="Preview — feature is on the roadmap but not yet wired up"
        >
          Preview
        </span>
      ) : null}
    </Link>
  );
}
