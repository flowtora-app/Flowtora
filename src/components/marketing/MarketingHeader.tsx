"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";
import { MarketingThemeToggle } from "./MarketingThemeToggle";

// MarketingHeader — sticky top bar for public-facing pages.
//
// Client component because we (a) highlight the active nav link via
// usePathname, (b) drive a mobile slide-over, (c) watch scroll
// position so the header border appears only after the hero scrolls
// under it (letting the hero feel airy), and (d) host the theme
// toggle.
//
// Phase 9: the mobile menu is a full-height slide-over from the right
// (not the previous inline dropdown). Four sections (Product /
// Solutions / Company / Account) give users a clear map of the site
// on a small screen; theme toggle is pinned at the bottom of the
// sheet so it's reachable with a thumb.

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-sign-shops", label: "For sign shops" },
  { href: "/for-print-shops", label: "For print shops" },
  { href: "/contact", label: "Contact" },
];

// Mirrors the 4-section structure of the mobile slide-over. Kept
// separate from LINKS so the desktop nav can stay flat while mobile
// gets the grouped, scannable layout.
const MOBILE_SECTIONS: {
  title: string;
  links: { href: string; label: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/changelog", label: "Changelog" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/for-sign-shops", label: "For sign shops" },
      { href: "/for-print-shops", label: "For print shops" },
      { href: "/book-demo", label: "Book a demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
    ],
  },
];

// /select-tenant is the single entry-point for authed users — it
// routes platform staff to /platform, single-tenant members to their
// dashboard, multi-tenant users to the picker, and shows a "no
// workspace" card for orphaned accounts. Linking here keeps the
// header stateless about session shape.
const DASHBOARD_HREF = "/select-tenant";

export function MarketingHeader({ authed = false }: { authed?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  // Show the header's underline border only after the user has
  // scrolled into the page. At rest over the hero, the header reads
  // as a floating strip; once the hero clips under, it settles
  // against a visible divider. Trigger at 40px — enough to avoid
  // flickering on small scroll jitter, small enough to feel prompt.
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the slide-over is open so taps behind the
  // backdrop don't scroll the page underneath. Restore on close.
  React.useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Escape closes the slide-over — small affordance, big feel.
  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Close on route change. usePathname updates on navigation, so
  // when it flips we want the sheet to collapse automatically — the
  // user already acted, no reason to keep the scrim up.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur transition-[border-color,background-color] duration-200"
      style={{
        background: scrolled
          ? "color-mix(in oklab, var(--surface-0) 82%, transparent)"
          : "color-mix(in oklab, var(--surface-0) 65%, transparent)",
        borderBottom: `1px solid ${scrolled ? "var(--border-subtle)" : "transparent"}`,
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logomark />
          <Wordmark style={{ fontSize: 16 }} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm transition-colors",
                )}
                style={{
                  color: active ? "var(--text-default)" : "var(--text-muted)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                {link.label}
                {/* Active-state underline — 2px accent bar centered
                    under the link. Replaces the previous font-weight-only
                    signal with something legible at a glance. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full"
                    style={{ background: "var(--accent-primary)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Auth cluster + theme toggle */}
        <div className="hidden items-center gap-2 md:flex">
          {authed ? (
            <>
              <Link
                href={DASHBOARD_HREF}
                className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                Go to dashboard
              </Link>
              <MarketingThemeToggle />
            </>
          ) : (
            <>
              <Link
                href="/book-demo"
                className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Book a demo
              </Link>
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                Start free trial
              </Link>
              <MarketingThemeToggle />
            </>
          )}
        </div>

        {/* Mobile: hamburger only — theme toggle moves into the
            slide-over so the top bar stays sparse on narrow screens. */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-nav"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M2.5 4.5h11" />
              <path d="M2.5 8h11" />
              <path d="M2.5 11.5h11" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile slide-over. Kept mounted so we can animate both
          directions; off-screen via transform + invisible via
          pointer-events when closed. */}
      <MobileSlideOver
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        pathname={pathname}
        authed={authed}
      />
    </header>
  );
}

function MobileSlideOver({
  open,
  onClose,
  pathname,
  authed,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  authed: boolean;
}) {
  return (
    <div
      id="marketing-mobile-nav"
      className="md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Site menu"
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{
          background:
            "color-mix(in oklab, var(--text-default) 35%, transparent)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Panel */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-80 max-w-[88vw] flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          background: "var(--surface-1)",
          borderLeft: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Sheet header — brand on left, close on right. Matches the
            16px height of the main header for visual continuity. */}
        <div
          className="flex h-16 shrink-0 items-center justify-between px-5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <Link
            href="/"
            onClick={onClose}
            className="flex items-center gap-2"
          >
            <Logomark size={28} />
            <Wordmark style={{ fontSize: 16 }} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M3 3l10 10" />
              <path d="M3 13L13 3" />
            </svg>
          </button>
        </div>

        {/* Scrollable section list */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <nav className="space-y-7">
            {MOBILE_SECTIONS.map((section) => (
              <div key={section.title}>
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {section.title}
                </div>
                <ul className="mt-2 space-y-1">
                  {section.links.map((l) => {
                    const active = pathname === l.href;
                    return (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={onClose}
                          className="flex items-center justify-between rounded-md px-3 py-2.5 text-base"
                          style={{
                            color: active
                              ? "var(--text-default)"
                              : "var(--text-muted)",
                            fontWeight: active ? 600 : 500,
                            background: active
                              ? "var(--accent-surface)"
                              : "transparent",
                          }}
                        >
                          <span>{l.label}</span>
                          {active && (
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: "var(--accent-primary)" }}
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Account section — signup/login or dashboard, depending
                on auth state. Rendered as its own labelled block so
                the user's eye doesn't have to hunt for it among the
                marketing links. */}
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "var(--text-faint)" }}
              >
                Account
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {authed ? (
                  <Link
                    href={DASHBOARD_HREF}
                    onClick={onClose}
                    className="inline-flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors"
                    style={{
                      background: "var(--accent-primary)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    Go to dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      onClick={onClose}
                      className="inline-flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors"
                      style={{
                        background: "var(--accent-primary)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      Start free trial
                    </Link>
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="inline-flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-default)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        </div>

        {/* Pinned footer — theme toggle + helper copy. Stays thumb-
            reachable at the bottom of the sheet regardless of how
            long the section list grows. */}
        <div
          className="shrink-0 px-5 py-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center justify-between">
            <div
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Appearance
            </div>
            <MarketingThemeToggle />
          </div>
        </div>
      </aside>
    </div>
  );
}
