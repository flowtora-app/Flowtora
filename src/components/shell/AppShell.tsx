"use client";

import * as React from "react";
import { Sidebar, type SidebarSection } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette, type QuickAction, type PalettePin } from "./CommandPalette";
import { ShortcutsDialog } from "./ShortcutsDialog";
import type { NotificationPreview } from "./NotificationsMenu";
import { ToastProvider } from "@/components/ui/Toast";

// Phase 18 Slice B — AppShell.
//
// The client-side glue holding the tenant chrome together:
//   - owns "which popover is open" so opening one closes others
//   - owns the command palette open/close state
//   - forwards server-computed data (sections, badge counts,
//     memberships, unread) to the Sidebar and TopBar
//
// The outer server component (tenant layout.tsx) builds the data,
// passes it in, and renders children below.

export interface AppShellProps {
  slug: string;
  tenantName: string;
  roleLabel: string;
  planLabel: string;
  sections: SidebarSection[];
  collapsedInitial: boolean;
  user: { email: string; name: string | null };
  unread: number;
  recentNotifications: NotificationPreview[];
  // Phase 3 — memberships now carry status + trial end so the switcher
  // can render a health chip (TRIAL ends in Xd, PAST DUE, etc.).
  memberships: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    status: string;
    trialEndsAt: Date | null;
  }[];
  quickActions: QuickAction[];
  pins: PalettePin[];
  children: React.ReactNode;
}

export function AppShell({
  slug,
  tenantName,
  roleLabel,
  planLabel,
  sections,
  collapsedInitial,
  user,
  unread,
  recentNotifications,
  memberships,
  quickActions,
  pins,
  children,
}: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [openPopover, setOpenPopover] = React.useState<"user" | "create" | "tenant" | "notifications" | null>(null);

  // Phase 3 — global "?" opens the shortcut cheat-sheet. We hook the
  // event here (not in TopBar) because the dialog is rendered at this
  // level too. Skip while an input is focused so users typing legit
  // question marks aren't hijacked.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const editable = (e.target as HTMLElement | null)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || editable) return;
      e.preventDefault();
      setShortcutsOpen((o) => !o);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ToastProvider>
      {/* Phase 23 — skip-to-content link. Visually hidden until it
          receives keyboard focus, then becomes visible in the top-left.
          Lets keyboard users bypass the ~13-item sidebar on every page. */}
      <a href="#main-content" className="ts-skip-link">
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        <Sidebar
          slug={slug}
          tenantName={tenantName}
          roleLabel={roleLabel}
          planLabel={planLabel}
          sections={sections}
          collapsedInitial={collapsedInitial}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            slug={slug}
            user={user}
            unread={unread}
            recentNotifications={recentNotifications}
            memberships={memberships}
            onOpenPalette={() => setPaletteOpen(true)}
            openPopover={openPopover}
            setOpenPopover={setOpenPopover}
          />
          <main id="main-content" className="flex-1 px-8 py-6">{children}</main>
        </div>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          slug={slug}
          quickActions={quickActions}
          pins={pins}
          onOpenShortcuts={() => setShortcutsOpen(true)}
        />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </div>
    </ToastProvider>
  );
}
