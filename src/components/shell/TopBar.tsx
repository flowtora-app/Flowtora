"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { Breadcrumbs } from "./Breadcrumbs";
import { Popover, PopoverItem, PopoverSection } from "./Popover";
import { NotificationsMenu, type NotificationPreview } from "./NotificationsMenu";
import { ThemeToggle } from "./ThemeToggle";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/app/actions/auth";

// Phase 18 Slice B — TopBar.
//
// Sticky bar at the top of the tenant app. Left side shows auto-derived
// breadcrumbs for orientation. Right side groups the "tools" users
// reach for most: search, quick-create, notifications, user menu.
//
// Shortcuts:
//   ⌘K / Ctrl+K → open command palette
//   / (outside an input) → open command palette
//
// All four trigger clusters are controlled via shared state inside
// AppShell, so e.g. opening the quick-create menu also closes the
// user menu automatically (mutually exclusive popovers).

// Phase 3 — memberships now carry lifecycle context so the switcher can
// render a "TRIAL · 4d" / "PAST DUE" chip inline. `status` is the raw
// TenantStatus string (ACTIVE / TRIAL / PAST_DUE); `trialEndsAt` only
// matters when status === "TRIAL".
export type MembershipSummary = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  status: string;
  trialEndsAt: Date | null;
};

export interface TopBarProps {
  slug: string;
  user: { email: string; name: string | null };
  unread: number;
  recentNotifications: NotificationPreview[];
  memberships: MembershipSummary[];
  onOpenPalette: () => void;
  // Which popover is open. Passed through so callers can coordinate.
  openPopover: "user" | "create" | "tenant" | "notifications" | null;
  setOpenPopover: (v: "user" | "create" | "tenant" | "notifications" | null) => void;
}

export function TopBar({
  slug,
  user,
  unread,
  recentNotifications,
  memberships,
  onOpenPalette,
  openPopover,
  setOpenPopover,
}: TopBarProps) {
  // Keyboard shortcuts. ⌘K / Ctrl+K always opens palette; "/" opens it
  // too but only when focus isn't already in an input/textarea.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenPalette();
        return;
      }
      if (e.key === "/" && !isMeta) {
        const tag = (e.target as HTMLElement | null)?.tagName ?? "";
        const editable = (e.target as HTMLElement | null)?.isContentEditable;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
        e.preventDefault();
        onOpenPalette();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpenPalette]);

  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-3 px-6 py-2.5"
      style={{
        background: "var(--surface-0)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <Link
        href="/select-tenant"
        aria-label="Tracksign home"
        className="ts-focus flex shrink-0 items-center gap-2 rounded-md"
        title="Tracksign"
      >
        <Logomark size={22} />
        <Wordmark style={{ fontSize: 13 }} />
      </Link>

      <div
        aria-hidden
        className="h-5 w-px shrink-0"
        style={{ background: "var(--border-subtle)" }}
      />

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      {/* Search trigger — click opens the palette; Shift+Enter while
          the trigger is focused jumps straight to the full search page
          for keyboard users who prefer the richer results view. */}
      <button
        type="button"
        onClick={onOpenPalette}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            window.location.href = `/t/${slug}/search`;
          }
        }}
        aria-label="Open command palette (Shift+Enter for full search page)"
        className={cn(
          "ts-focus group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
          "hover:brightness-110",
        )}
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
          width: 260,
        }}
      >
        <Icon.Search size={13} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-faint)",
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* Tenant switcher — only if multi-tenant */}
      {memberships.length > 1 && (
        <TenantSwitcher
          memberships={memberships}
          open={openPopover === "tenant"}
          onOpenChange={(o) => setOpenPopover(o ? "tenant" : null)}
        />
      )}

      {/* Quick create */}
      <QuickCreateMenu
        slug={slug}
        open={openPopover === "create"}
        onOpenChange={(o) => setOpenPopover(o ? "create" : null)}
      />

      {/* Notifications */}
      <NotificationsMenu
        slug={slug}
        unread={unread}
        recent={recentNotifications}
        open={openPopover === "notifications"}
        onOpenChange={(o) => setOpenPopover(o ? "notifications" : null)}
      />

      {/* User menu */}
      <UserMenu
        user={user}
        open={openPopover === "user"}
        onOpenChange={(o) => setOpenPopover(o ? "user" : null)}
      />
    </header>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function TenantSwitcher({
  memberships,
  open,
  onOpenChange,
}: {
  memberships: MembershipSummary[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const active = memberships.find((m) => m.active);
  // Phase 3 — filter input. Shops with >5 workspaces benefit a lot; at
  // <5 the list is already short enough that the input adds no value.
  // We render it unconditionally for consistency but it auto-focuses on
  // open so a user who wants typeahead pays no cost for its presence.
  const [filter, setFilter] = React.useState("");
  React.useEffect(() => {
    if (!open) setFilter("");
  }, [open]);
  const filtered = filter.trim()
    ? memberships.filter((m) => m.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : memberships;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width={280}
      trigger={
        <button
          type="button"
          aria-label="Switch workspace"
          onClick={() => onOpenChange(!open)}
          className="ts-focus inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-default)",
          }}
        >
          <Icon.Building size={13} style={{ color: "var(--text-muted)" }} />
          <span className="max-w-[110px] truncate">{active?.name ?? "Workspace"}</span>
          {active && <WorkspaceStatusChip status={active.status} trialEndsAt={active.trialEndsAt} compact />}
          <Icon.ChevronDown size={12} style={{ color: "var(--text-muted)" }} />
        </button>
      }
    >
      {memberships.length > 5 && (
        <div
          className="px-3 pt-2 pb-1"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter workspaces"
            className="w-full rounded-md px-2 py-1 text-xs outline-none"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
            }}
          />
        </div>
      )}
      <PopoverSection label="Your workspaces">
        {filtered.length === 0 && (
          <div
            className="px-3 py-2 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            No workspaces match.
          </div>
        )}
        {filtered.map((m) => (
          <PopoverItem
            key={m.id}
            href={`/t/${m.slug}/dashboard`}
            leftIcon={
              m.active ? (
                <Icon.Check size={12} style={{ color: "var(--accent-primary)" }} />
              ) : (
                <span style={{ width: 12, height: 12, display: "inline-block" }} />
              )
            }
            rightSlot={<WorkspaceStatusChip status={m.status} trialEndsAt={m.trialEndsAt} />}
          >
            <span className="truncate">{m.name}</span>
          </PopoverItem>
        ))}
      </PopoverSection>
    </Popover>
  );
}

// Inline chip rendering TRIAL / PAST_DUE / ACTIVE state. Active workspaces
// get no chip (the default state isn't useful to label).
function WorkspaceStatusChip({
  status,
  trialEndsAt,
  compact,
}: {
  status: string;
  trialEndsAt: Date | null;
  compact?: boolean;
}) {
  if (status === "ACTIVE") return null;
  const base = {
    fontSize: compact ? 9 : 10,
    lineHeight: 1,
    padding: compact ? "2px 5px" : "3px 6px",
    borderRadius: 999,
    fontWeight: 600 as const,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
  };
  if (status === "TRIAL") {
    const days = trialDaysLeft(trialEndsAt);
    const label = days === null ? "Trial" : `Trial · ${days}d`;
    return (
      <span
        style={{
          ...base,
          background: "var(--accent-surface)",
          color: "var(--accent-primary)",
          border: "1px solid var(--accent-primary)",
        }}
      >
        {label}
      </span>
    );
  }
  if (status === "PAST_DUE") {
    return (
      <span
        style={{
          ...base,
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        }}
      >
        Past due
      </span>
    );
  }
  return null;
}

function trialDaysLeft(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function QuickCreateMenu({
  slug,
  open,
  onOpenChange,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width={220}
      trigger={
        <button
          type="button"
          aria-label="Quick create"
          onClick={() => onOpenChange(!open)}
          className="ts-focus inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
            border: "1px solid var(--accent-primary)",
          }}
        >
          <Icon.Plus size={13} />
          Create
        </button>
      }
    >
      <PopoverSection>
        <PopoverItem href={`/t/${slug}/customers/new`} leftIcon={<Icon.Customers size={14} />}>
          Customer
        </PopoverItem>
        <PopoverItem href={`/t/${slug}/quotes/new`} leftIcon={<Icon.Quotes size={14} />}>
          Quote
        </PopoverItem>
        <PopoverItem href={`/t/${slug}/orders/new`} leftIcon={<Icon.Orders size={14} />}>
          Order
        </PopoverItem>
        <PopoverItem href={`/t/${slug}/invoices/new`} leftIcon={<Icon.Invoices size={14} />}>
          Invoice
        </PopoverItem>
        <PopoverItem href={`/t/${slug}/tasks?new=1`} leftIcon={<Icon.Tasks size={14} />}>
          Task
        </PopoverItem>
        <PopoverItem href={`/t/${slug}/products/new`} leftIcon={<Icon.Products size={14} />}>
          Product
        </PopoverItem>
      </PopoverSection>
    </Popover>
  );
}

function UserMenu({
  user,
  open,
  onOpenChange,
}: {
  user: { email: string; name: string | null };
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const initial = (user.name ?? user.email).slice(0, 1).toUpperCase();
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width={240}
      trigger={
        <button
          type="button"
          aria-label="User menu"
          onClick={() => onOpenChange(!open)}
          className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {initial}
        </button>
      }
    >
      <div className="px-3 py-3">
        <div className="truncate text-sm font-medium" style={{ color: "var(--text-default)" }}>
          {user.name ?? user.email}
        </div>
        {user.name && (
          <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
            {user.email}
          </div>
        )}
      </div>
      <div
        className="px-3 py-2"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div
          className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Appearance
        </div>
        <ThemeToggle />
      </div>
      <PopoverSection>
        <PopoverItem href="/account" leftIcon={<Icon.User size={14} />}>
          Account settings
        </PopoverItem>
        <PopoverItem
          asForm={
            <form action={signOutAction} className="contents">
              <button
                type="submit"
                className="ts-focus flex w-full items-center gap-2.5 text-left text-sm"
                style={{ color: "var(--text-default)" }}
              >
                <Icon.SignOut size={14} style={{ color: "var(--text-muted)" }} />
                Sign out
              </button>
            </form>
          }
        >
          Sign out
        </PopoverItem>
      </PopoverSection>
    </Popover>
  );
}
