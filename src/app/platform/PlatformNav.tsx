"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { Icon, type IconName } from "@/components/shell/icons";

// Platform admin sidebar — flat 21-item layout in domain order.
//
// Single visual list (no group headers) because the order itself is
// the cognitive scaffold. Some items are hubs that link to existing
// surfaces (Marketing, Security, Infrastructure, Legal, Communications);
// others are previews — the route loads but the page explains the
// section is on the roadmap.
//
// Active state matches by prefix so nested routes keep the parent link
// highlighted. Dashboard matches exactly because "/platform" is the
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

// Single flat list — the user gave us this order, we keep it.
const NAV_ITEMS: NavItem[] = [
  { href: "/platform",                  label: "Dashboard",         icon: "Dashboard", exact: true },
  { href: "/platform/activity",         label: "Activity",          icon: "Activity" },
  { href: "/platform/reports",          label: "Reports",           icon: "Globe" },
  { href: "/platform/tenants",          label: "Tenants",           icon: "Building" },
  { href: "/platform/tenants/onboarding", label: "Onboarding",      icon: "Target" },
  { href: "/platform/tenants/health",   label: "Health Scores",     icon: "Heartbeat" },
  { href: "/platform/tenants/churn",    label: "Churned & At-Risk", icon: "Attention" },
  { href: "/platform/tenants/impersonation", label: "Impersonation", icon: "Shield" },
  { href: "/platform/billing",          label: "Billing & Revenue", icon: "Revenue" },
  { href: "/platform/users",            label: "Users",             icon: "Customers" },
  { href: "/platform/access/roles",     label: "Roles & Permissions", icon: "Approvals" },
  { href: "/platform/access/teams",     label: "Teams",             icon: "User" },
  { href: "/platform/industry-config",  label: "Industry Config",   icon: "Target",       preview: true },
  { href: "/platform/cms",              label: "CMS",               icon: "FileText",     preview: true },
  { href: "/platform/marketing",        label: "Marketing",         icon: "Megaphone" },
  { href: "/platform/analytics",        label: "Analytics",         icon: "Globe" },
  { href: "/platform/support",          label: "Support",           icon: "Support" },
  { href: "/platform/integrations",     label: "Integrations",      icon: "Activity",     preview: true },
  { href: "/platform/settings",         label: "Settings",          icon: "Settings" },
  { href: "/platform/security",         label: "Security",          icon: "Shield" },
  { href: "/platform/infrastructure",   label: "Infrastructure",    icon: "Heartbeat" },
  { href: "/platform/mobile-apps",      label: "Mobile Apps",       icon: "Monitor",      preview: true },
  { href: "/platform/legal",            label: "Legal",             icon: "Scale" },
  { href: "/platform/communications",   label: "Communications",    icon: "MessageSquare" },
  { href: "/platform/marketplace",      label: "Marketplace",       icon: "Package",      preview: true },
  { href: "/platform/training",         label: "Training",          icon: "Bookmark",     preview: true },
  { href: "/platform/ai-automation",    label: "AI & Automation",   icon: "Sparkles",     preview: true },
  { href: "/platform/resellers",        label: "Resellers",         icon: "Vendors",      preview: true },
  { href: "/platform/profile",          label: "Profile",           icon: "User" },
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

  // Mobile drawer state — sidebar collapses below `lg` (1024px) and
  // re-opens via the hamburger in the top bar (rendered inside the
  // platform layout). On desktop the drawer is always open.
  const [open, setOpen] = React.useState(false);

  // Close the drawer on every navigation. We listen to pathname
  // changes so clicking a nav item dismisses the overlay.
  const lastPathRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathRef.current !== pathname) {
      setOpen(false);
      lastPathRef.current = pathname;
    }
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar — only visible below `lg`. The desktop sidebar
          renders its own brand row inside the aside. */}
      <header
        className="ts-platform-mobile-bar lg:hidden"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="ts-focus inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-default)" }}
          >
            ☰
          </button>
          <Link
            href="/select-tenant"
            aria-label="Flowtora home"
            className="ts-focus inline-flex items-center gap-2"
          >
            <Logomark size={24} />
            <Wordmark style={{ fontSize: 14, letterSpacing: "-0.01em" }} />
          </Link>
        </div>
      </header>

      {/* Backdrop — clicking it closes the drawer on mobile. */}
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
      className={`flex flex-col ${open ? "ts-platform-nav--open" : ""}`}
      style={{
        width: 248,
        background: "var(--surface-1)",
        borderRight: "1px solid var(--border-subtle)",
        position: "sticky",
        top: 0,
        height: "100vh",
        zIndex: 60,
      }}
      data-platform-nav-open={open ? "true" : "false"}
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
        <div className="ts-nav-group">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            return <PlatformNavItem key={item.href} item={item} active={active} />;
          })}
        </div>
      </nav>

      {/* ── Bottom cluster ─────────────────────────────────────────── */}
      <div
        className="shrink-0 space-y-1 px-2.5 py-2.5"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        {/* Internal: design-system showcase. Lives outside the 21-item
            top-level nav since it's a developer/admin reference, not a
            workspace surface. */}
        <Link
          href="/platform/design"
          aria-current={pathname === "/platform/design" ? "page" : undefined}
          className="ts-focus flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-[var(--surface-3)]"
          style={{
            color: pathname === "/platform/design" ? "var(--text-default)" : "var(--text-muted)",
          }}
          title="Design system reference (internal)"
        >
          <Icon.Palette size={14} />
          <span>Design system</span>
        </Link>

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
    </>
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
