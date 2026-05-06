"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { Icon, type IconName } from "@/components/shell/icons";

// Platform admin sidebar — only spec-aligned pages.
//
// Single visual list ordered to match docs/flowtora-admin-spec.md.
// Items not yet built are intentionally not listed — the nav stays
// an honest map of what's shipped. Each new spec page slots in here
// at commit time.
//
// Active state matches by prefix so nested routes keep the parent link
// highlighted. Dashboard matches exactly because "/platform" is the
// prefix of every other link in the nav.
//
// Collapse mode: clicking the toggle below the nav shrinks the rail to
// icon-only (~64px wide). State persists to localStorage so it sticks
// across navigations + reloads. Mobile keeps its existing drawer flow
// — always full-width when the drawer is open, hidden when closed.

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  preview?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  // Pages 1-3 — observability
  { href: "/platform",                        label: "Dashboard",            icon: "Dashboard", exact: true },
  { href: "/platform/activity",               label: "Activity",             icon: "Activity" },
  { href: "/platform/reports",                label: "Reports",              icon: "Globe" },
  // Pages 4-8 — tenants
  { href: "/platform/tenants",                label: "Tenants",              icon: "Building" },
  { href: "/platform/tenants/onboarding",     label: "Onboarding",           icon: "Target" },
  { href: "/platform/tenants/health",         label: "Health Scores",        icon: "Heartbeat" },
  { href: "/platform/tenants/churn",          label: "Churned & At-Risk",    icon: "Attention" },
  { href: "/platform/tenants/impersonation",  label: "Impersonation",        icon: "Shield" },
  // Pages 9-14 — access & audit
  { href: "/platform/users",                  label: "Users",                icon: "Customers" },
  { href: "/platform/access/roles",           label: "Roles & Permissions",  icon: "Approvals" },
  { href: "/platform/access/teams",           label: "Teams",                icon: "User" },
  { href: "/platform/access/invitations",     label: "Invitations",          icon: "Megaphone" },
  { href: "/platform/access/sessions",        label: "Sessions & Devices",   icon: "Monitor" },
  { href: "/platform/access/audit",           label: "Audit Log",            icon: "FileText" },
  // Pages 15-24 — billing
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
  // Pages 25-30 — catalog
  { href: "/platform/catalog/products",       label: "Master Catalog",       icon: "Products" },
  { href: "/platform/catalog/materials",      label: "Material Library",     icon: "Package" },
  { href: "/platform/catalog/equipment",      label: "Equipment Templates",  icon: "Production" },
  { href: "/platform/catalog/pricing",        label: "Pricing Formulas",     icon: "Revenue" },
  { href: "/platform/catalog/templates",      label: "Industry Templates",   icon: "FileText" },
  { href: "/platform/catalog/assets",         label: "Design Assets",        icon: "Palette" },
  // Pages 31-37 — operations
  { href: "/platform/operations/jobs",              label: "Job Queue Monitor",    icon: "Pipeline" },
  { href: "/platform/operations/production",        label: "Production Health",    icon: "Heartbeat" },
  { href: "/platform/operations/tickets",           label: "Support Tickets",      icon: "Support" },
  { href: "/platform/operations/knowledge-base",    label: "Knowledge Base",       icon: "FileText" },
  { href: "/platform/operations/announcements",     label: "Announcements",        icon: "Megaphone" },
  { href: "/platform/operations/feature-requests",  label: "Feature Requests",     icon: "Sparkles" },
  { href: "/platform/operations/bugs",              label: "Bug Reports",          icon: "Attention" },
  // Pages 38-42 — marketing
  { href: "/platform/marketing/landing-pages",      label: "Landing Pages",        icon: "Globe" },
  { href: "/platform/marketing/campaigns",          label: "Email Campaigns",      icon: "Megaphone" },
  { href: "/platform/marketing/sequences",          label: "Drip Sequences",       icon: "Pipeline" },
  { href: "/platform/marketing/referrals",          label: "Referral Program",     icon: "Sparkles" },
  { href: "/platform/marketing/affiliates",         label: "Affiliate Program",    icon: "Vendors" },
  { href: "/platform/marketing/seo",                label: "SEO & Content",        icon: "Globe" },
  { href: "/platform/marketing/leads",              label: "Lead Inbox",           icon: "Target" },
  // Pages 45+ — integrations
  { href: "/platform/integrations",                 label: "Integrations Catalog", icon: "Pipeline" },
  { href: "/platform/integrations/api",             label: "API Keys & Webhooks",  icon: "Shield" },
];

const COLLAPSE_KEY = "flowtora.platform-nav.collapsed";
const EXPANDED_W = 248;
const COLLAPSED_W = 64;

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

  // Close the mobile drawer on every navigation.
  const lastPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathRef.current !== pathname) {
      setOpen(false);
      lastPathRef.current = pathname;
    }
  }, [pathname]);

  // Width follows collapse state. On mobile (drawer open), force expanded
  // — the icon-only rail isn't useful inside a slide-out drawer.
  const desktopWidth = hydrated && collapsed ? COLLAPSED_W : EXPANDED_W;
  const drawerCollapsed = false; // mobile drawer always shows labels
  const isCollapsed = (state: { isMobile: boolean }) => state.isMobile ? drawerCollapsed : collapsed;

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
            background: "rgba(0,0,0,0.4)",
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
          // Mobile: always full-width when drawer is open. Desktop:
          // narrows to icon-rail when collapsed.
          width: open ? EXPANDED_W : desktopWidth,
          background: "var(--surface-1)",
          borderRight: "1px solid var(--border-subtle)",
          height: "100vh",
          zIndex: 60,
          transitionDuration: "180ms",
        }}
        data-platform-nav-open={open ? "true" : "false"}
        data-platform-nav-collapsed={!open && collapsed ? "true" : "false"}
      >
        {/* ── Brand row ───────────────────────────────────────── */}
        <Link
          href="/select-tenant"
          aria-label="Flowtora home"
          className="ts-focus flex shrink-0 items-center gap-2 px-3 py-3"
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            justifyContent: !open && collapsed ? "center" : "flex-start",
          }}
        >
          <Logomark size={28} />
          {(open || !collapsed) && (
            <Wordmark style={{ fontSize: 16, letterSpacing: "-0.01em" }} />
          )}
        </Link>

        {/* ── Nav ─────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto px-2.5 py-3"
          aria-label="Platform"
        >
          <div className="ts-nav-group">
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <PlatformNavItem
                  key={item.href}
                  item={item}
                  active={active}
                  collapsed={isCollapsed({ isMobile: open })}
                />
              );
            })}
          </div>
        </nav>

        {/* ── Bottom cluster ──────────────────────────────────── */}
        <div
          className="shrink-0 space-y-1 px-2.5 py-2.5"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {/* Collapse toggle — desktop only. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "ts-focus hidden w-full items-center rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-[var(--surface-3)] lg:flex",
              !open && collapsed ? "justify-center" : "gap-2",
            )}
            style={{ color: "var(--text-muted)" }}
          >
            {collapsed ? <Icon.ChevronsRight size={14} /> : <Icon.ChevronsLeft size={14} />}
            {!collapsed && <span>Collapse</span>}
          </button>

          {/* Design system reference. */}
          <Link
            href="/platform/design"
            aria-current={pathname === "/platform/design" ? "page" : undefined}
            className={cn(
              "ts-focus flex items-center rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-[var(--surface-3)]",
              !open && collapsed ? "justify-center" : "gap-2",
            )}
            style={{
              color: pathname === "/platform/design" ? "var(--text-default)" : "var(--text-muted)",
            }}
            title="Design system reference (internal)"
          >
            <Icon.Palette size={14} />
            {(open || !collapsed) && <span>Design system</span>}
          </Link>

          {/* User identity + sign-out. When collapsed: just the avatar +
              sign-out icon stacked. */}
          <div className={cn(
            "flex items-center gap-1",
            !open && collapsed && "flex-col",
          )}>
            <Link
              href="/platform/profile"
              className={cn(
                "ts-focus flex min-w-0 items-center rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-3)]",
                !open && collapsed ? "justify-center" : "flex-1 gap-2",
              )}
              title={!open && collapsed ? `${displayName} · profile` : "Profile, security, preferences"}
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
              {(open || !collapsed) && (
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
              )}
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

function PlatformNavItem({
  item, active, collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const IconCmp = Icon[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn("ts-nav-item ts-focus", collapsed && "ts-nav-item--collapsed")}
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
