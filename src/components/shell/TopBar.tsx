"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { Breadcrumbs } from "./Breadcrumbs";
import { Popover, PopoverItem, PopoverSection } from "./Popover";
import { NotificationsMenu, type NotificationPreview } from "./NotificationsMenu";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/app/actions/auth";

// Tenant workspace topbar — premium redesign (Page T-shell spec).
//
// Layout (sticky 56px):
//   [ Breadcrumbs ] ─── [ Search ] [ Production ] │ [ + New ] [ Switcher ] [ Bell ] [ Help ] [ Profile ]
//
// Premium polish matches the redesigned sidebar:
//   • Subtle accent halo + hairline + scroll-shadow background
//   • Wider, more inviting search trigger with refined ⌘K kbd
//   • Production status link (per spec — clickable into the floor)
//   • New "+ New" primary button with gradient + accent ring
//   • Help menu (spec calls for Help center, shortcuts, feedback,
//     status, what's new)
//   • Profile avatar gets an accent ring + online dot, matching the
//     sidebar workspace card
//
// Shortcuts preserved:
//   ⌘K / Ctrl+K → command palette
//   /           → command palette (outside inputs)

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
  openPopover: "user" | "create" | "tenant" | "notifications" | "help" | null;
  setOpenPopover: (v: "user" | "create" | "tenant" | "notifications" | "help" | null) => void;
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

  // Scroll shadow — subtle elevation appears once content scrolls.
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-10 flex items-center gap-3 px-6"
      style={{
        height: 56,
        background:
          "radial-gradient(540px circle at 8% -120%, var(--accent-surface), transparent 50%), " +
          "color-mix(in oklab, var(--surface-0) 92%, var(--surface-1) 8%)",
        borderBottom: "1px solid var(--border-subtle)",
        boxShadow: scrolled
          ? "0 1px 0 0 var(--border-subtle), 0 6px 14px -8px rgba(0,0,0,0.35)"
          : "none",
        transition: "box-shadow 180ms ease",
        backdropFilter: "saturate(140%) blur(4px)",
      }}
    >
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      {/* ── Search trigger ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={onOpenPalette}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            window.location.href = `/t/${slug}/search`;
          }
        }}
        aria-label="Search or jump to (⌘K, Shift+Enter for full search page)"
        className={cn(
          "ts-focus group inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[12.5px] transition-colors",
        )}
        style={{
          background: "color-mix(in oklab, var(--surface-1) 80%, transparent)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
          width: 320,
        }}
      >
        <Icon.Search size={13} style={{ color: "var(--text-faint)" }} />
        <span className="flex-1 text-left" style={{ letterSpacing: "-0.005em" }}>
          Search or jump to…
        </span>
        <kbd
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-faint)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            padding: "1px 5px",
            borderRadius: 4,
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
            letterSpacing: "0.02em",
            lineHeight: 1.2,
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* ── Production status link ─────────────────────────────── */}
      <Link
        href={`/t/${slug}/production`}
        aria-label="Go to production"
        title="Production floor"
        className="ts-focus group inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[12.5px] transition-colors"
        style={{
          background: "color-mix(in oklab, var(--surface-1) 80%, transparent)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-default)",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: "var(--emerald-500)",
              boxShadow:
                "0 0 0 2px color-mix(in oklab, var(--emerald-500) 25%, transparent)",
            }}
          />
        </span>
        <span style={{ fontWeight: 600, letterSpacing: "-0.005em" }}>Production</span>
        <span style={{ color: "var(--text-faint)" }}>·</span>
        <span style={{ color: "var(--text-muted)" }}>Live</span>
      </Link>

      {/* Vertical separator before the action cluster — subtle. */}
      <span
        aria-hidden
        style={{
          width: 1,
          height: 22,
          background: "var(--border-subtle)",
          margin: "0 2px",
        }}
      />

      {/* ── Quick create (primary CTA) ─────────────────────────── */}
      <QuickCreateMenu
        slug={slug}
        open={openPopover === "create"}
        onOpenChange={(o) => setOpenPopover(o ? "create" : null)}
      />

      {/* ── Tenant switcher (only multi-tenant) ────────────────── */}
      {memberships.length > 1 && (
        <TenantSwitcher
          memberships={memberships}
          open={openPopover === "tenant"}
          onOpenChange={(o) => setOpenPopover(o ? "tenant" : null)}
        />
      )}

      {/* ── Notifications ──────────────────────────────────────── */}
      <NotificationsMenu
        slug={slug}
        unread={unread}
        recent={recentNotifications}
        open={openPopover === "notifications"}
        onOpenChange={(o) => setOpenPopover(o ? "notifications" : null)}
      />

      {/* ── Help (?) menu ──────────────────────────────────────── */}
      <HelpMenu
        slug={slug}
        open={openPopover === "help"}
        onOpenChange={(o) => setOpenPopover(o ? "help" : null)}
      />

      {/* ── Profile / user menu ────────────────────────────────── */}
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
      width={300}
      trigger={
        <button
          type="button"
          aria-label="Switch workspace"
          onClick={() => onOpenChange(!open)}
          className="ts-focus inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] transition-colors"
          style={{
            background: "color-mix(in oklab, var(--surface-1) 80%, transparent)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-default)",
          }}
        >
          <Icon.Building size={13} style={{ color: "var(--text-muted)" }} />
          <span className="max-w-[110px] truncate" style={{ fontWeight: 600 }}>
            {active?.name ?? "Workspace"}
          </span>
          {active && (
            <WorkspaceStatusChip
              status={active.status}
              trialEndsAt={active.trialEndsAt}
              compact
            />
          )}
          <Icon.ChevronDown size={12} style={{ color: "var(--text-faint)" }} />
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
      <PopoverSection>
        <PopoverItem href="/select-tenant" leftIcon={<Icon.ArrowRight size={12} />}>
          Manage workspaces
        </PopoverItem>
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
      width={240}
      trigger={
        <button
          type="button"
          aria-label="Quick create"
          onClick={() => onOpenChange(!open)}
          className="ts-focus inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition-transform"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
            color: "var(--accent-fg)",
            border: "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
              "0 1px 2px 0 rgba(0,0,0,0.35), " +
              "0 0 0 1px color-mix(in oklab, var(--accent-primary) 30%, transparent)",
            letterSpacing: "-0.005em",
          }}
        >
          <Icon.Plus size={13} />
          New
          <Icon.ChevronDown
            size={11}
            style={{ opacity: 0.85, marginLeft: 2 }}
          />
        </button>
      }
    >
      <PopoverSection label="Create new">
        <PopoverItem
          href={`/t/${slug}/customers/new`}
          leftIcon={<Icon.Customers size={14} />}
          rightSlot={<KbdHint label="C" />}
        >
          Customer
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/quotes/new`}
          leftIcon={<Icon.Quotes size={14} />}
          rightSlot={<KbdHint label="Q" />}
        >
          Quote
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/orders/new`}
          leftIcon={<Icon.Orders size={14} />}
          rightSlot={<KbdHint label="J" />}
        >
          Order / Job
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/invoices/new`}
          leftIcon={<Icon.Invoices size={14} />}
          rightSlot={<KbdHint label="I" />}
        >
          Invoice
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/inbox?chip=tasks&new=1`}
          leftIcon={<Icon.Tasks size={14} />}
        >
          Task
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/products/new`}
          leftIcon={<Icon.Products size={14} />}
        >
          Product
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/expenses/new`}
          leftIcon={<Icon.Expenses size={14} />}
        >
          Expense
        </PopoverItem>
      </PopoverSection>
    </Popover>
  );
}

function HelpMenu({
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
      width={240}
      trigger={
        <button
          type="button"
          aria-label="Help"
          onClick={() => onOpenChange(!open)}
          className="ts-focus inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{
            background: open
              ? "var(--surface-2)"
              : "transparent",
            border: "1px solid",
            borderColor: open ? "var(--border-default)" : "transparent",
            color: "var(--text-muted)",
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          <span style={{ display: "inline-block", transform: "translateY(-0.5px)" }}>?</span>
        </button>
      }
    >
      <PopoverSection label="Help">
        <PopoverItem
          href={`/t/${slug}/support`}
          leftIcon={<Icon.Support size={14} />}
        >
          Help center
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/support`}
          leftIcon={<Icon.Keyboard size={14} />}
          rightSlot={<KbdHint label="?" />}
        >
          Keyboard shortcuts
        </PopoverItem>
        <PopoverItem
          href={`/t/${slug}/support/new`}
          leftIcon={<Icon.MessageSquare size={14} />}
        >
          Contact support
        </PopoverItem>
      </PopoverSection>
      <PopoverSection>
        <PopoverItem
          href={`/t/${slug}/feedback`}
          leftIcon={<Icon.Sparkles size={14} />}
        >
          Submit feedback
        </PopoverItem>
        <PopoverItem
          href="/status"
          leftIcon={<Icon.Activity size={14} />}
        >
          System status
        </PopoverItem>
        <PopoverItem
          href="/changelog"
          leftIcon={<Icon.Megaphone size={14} />}
        >
          What&apos;s new
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
      width={260}
      trigger={
        <button
          type="button"
          aria-label="User menu"
          onClick={() => onOpenChange(!open)}
          className="ts-focus relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold transition-transform"
          style={{
            background:
              "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
            color: "var(--accent-primary)",
            border: "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
            letterSpacing: "0.02em",
          }}
        >
          {initial}
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
              boxShadow: "0 0 0 2px var(--surface-0)",
            }}
          />
        </button>
      }
    >
      <div className="px-3 py-3 flex items-center gap-2.5">
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: 999,
            background:
              "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
            color: "var(--accent-primary)",
            border: "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            style={{ color: "var(--text-default)", fontSize: 13, fontWeight: 600 }}
          >
            {user.name ?? user.email}
          </div>
          {user.name && (
            <div
              className="mt-0.5 truncate"
              style={{ color: "var(--text-muted)", fontSize: 11.5 }}
            >
              {user.email}
            </div>
          )}
        </div>
      </div>
      <div
        className="px-3 py-2"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div
          className="mb-1.5"
          style={{
            color: "var(--text-faint)",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
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

/** Small keyboard hint chip for popover rows. */
function KbdHint({ label }: { label: string }) {
  return (
    <kbd
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        color: "var(--text-faint)",
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        padding: "1px 5px",
        borderRadius: 4,
        fontFamily:
          "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
        letterSpacing: "0.02em",
        lineHeight: 1.2,
      }}
    >
      {label}
    </kbd>
  );
}
