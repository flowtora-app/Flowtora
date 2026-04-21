"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Logomark } from "@/components/brand/BrandMark";
import { MarketingThemeToggle } from "./MarketingThemeToggle";

// MarketingHeader — sticky top bar for public-facing pages.
//
// Client component because we (a) highlight the active nav link via
// usePathname, (b) toggle a mobile menu, (c) watch scroll position
// so the header border appears only after the hero scrolls under it
// (letting the hero feel airy), and (d) host the theme toggle.

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-sign-shops", label: "For sign shops" },
  { href: "/for-print-shops", label: "For print shops" },
  { href: "/contact", label: "Contact" },
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
          <span
            className="text-base font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            Flowtora
          </span>
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

        {/* Mobile: theme toggle + disclosure. Keep the toggle visible
            on mobile so the feature is discoverable before the user
            opens the menu. */}
        <div className="flex items-center gap-2 md:hidden">
          <MarketingThemeToggle />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
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
              {mobileOpen ? (
                <>
                  <path d="M3 3l10 10" />
                  <path d="M3 13L13 3" />
                </>
              ) : (
                <>
                  <path d="M2.5 4.5h11" />
                  <path d="M2.5 8h11" />
                  <path d="M2.5 11.5h11" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden"
          style={{
            background: "var(--surface-1)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm"
                style={{
                  color:
                    pathname === link.href
                      ? "var(--text-default)"
                      : "var(--text-muted)",
                }}
              >
                {link.label}
              </Link>
            ))}
            <div
              className="mt-2 flex flex-col gap-2 pt-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              {authed ? (
                <Link
                  href={DASHBOARD_HREF}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-9 items-center justify-center rounded-md text-sm font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                >
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/book-demo"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-3 py-2 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Book a demo
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-md px-3 py-2 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex h-9 items-center justify-center rounded-md text-sm font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                  >
                    Start free trial
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
