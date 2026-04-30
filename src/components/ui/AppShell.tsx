"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// AppShell — Spec Page 0 §0.12 App Shell.
//
// Structure:
//   Optional impersonation banner (40px, brand-600 bg) above top bar
//   Optional environment banner (Staging/Sandbox, 28px amber bg)
//   Top bar (56px, sticky)
//   Below top bar: flex row
//     Sidebar (240px / 64px collapsed, sticky, scrollable)
//     Main content (flex-1, overflow auto, max-width 1440px centered
//                   with 24px gutters)
//
// This is a layout primitive. The user-facing platform sidebar lives
// at PlatformNav.tsx (and uses .ts-nav-* classes); pages that don't
// fit that pattern (signed-out states, alt admin, rare flows) can
// reach for AppShell directly.

export interface AppShellProps {
  topBar: React.ReactNode;
  sidebar: React.ReactNode;
  /** Sticky banner above the top bar. */
  impersonationBanner?: React.ReactNode;
  /** Banner directly below the top bar. */
  envBanner?: React.ReactNode;
  /** Sidebar width when expanded. Default 240. */
  sidebarWidth?: number;
  /** Sidebar width when collapsed. Default 64. */
  sidebarCollapsedWidth?: number;
  /** Caller drives the collapsed state; uncontrolled fallback at the
   *  default below. Mobile screens auto-collapse via CSS. */
  collapsed?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function AppShell({
  topBar,
  sidebar,
  impersonationBanner,
  envBanner,
  sidebarWidth = 240,
  sidebarCollapsedWidth = 64,
  collapsed = false,
  className,
  children,
}: AppShellProps) {
  const sbWidth = collapsed ? sidebarCollapsedWidth : sidebarWidth;

  return (
    <div className={cn("flex min-h-screen flex-col", className)} style={{ background: "var(--surface-0)" }}>
      {impersonationBanner && (
        <div
          className="sticky top-0 z-[var(--z-impersonation-banner,1100)] flex items-center justify-center px-4 text-[12px] font-medium"
          style={{ height: 40, background: "var(--brand-600, var(--accent-primary))", color: "#fff" }}
        >
          {impersonationBanner}
        </div>
      )}
      <header
        className="sticky z-[var(--z-sticky,200)] flex items-center"
        style={{
          top: impersonationBanner ? 40 : 0,
          height: 56,
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {topBar}
      </header>
      {envBanner && (
        <div
          className="flex items-center justify-center px-4 text-[11px] font-medium"
          style={{
            height: 28,
            background: "var(--amber-100, var(--warning-surface))",
            color: "var(--amber-900, var(--warning-fg))",
            borderBottom: "1px solid var(--amber-200)",
          }}
        >
          {envBanner}
        </div>
      )}
      <div className="flex flex-1">
        <aside
          className="sticky overflow-y-auto"
          style={{
            top: (impersonationBanner ? 40 : 0) + 56 + (envBanner ? 28 : 0),
            height: `calc(100vh - ${(impersonationBanner ? 40 : 0) + 56 + (envBanner ? 28 : 0)}px)`,
            width: sbWidth,
            background: "var(--surface-1)",
            borderRight: "1px solid var(--border-subtle)",
            transition: "width 200ms var(--ease-out)",
          }}
        >
          {sidebar}
        </aside>
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full" style={{ maxWidth: 1440, padding: "24px" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
