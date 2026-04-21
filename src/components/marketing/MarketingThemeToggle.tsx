"use client";

import * as React from "react";
import { Icon } from "@/components/shell/icons";
import { setThemePref } from "@/app/actions/ui";
import type { ThemePref } from "@/lib/theme";

// MarketingThemeToggle — compact icon button for the public header.
//
// The app shell uses a three-wide segmented control (System/Light/Dark),
// which is the right ergonomic choice inside a dense toolbar. The
// marketing header has different priorities: the theme switch should
// be visible and premium-looking, but not steal attention from the
// primary CTA. A single icon-sized cycle button strikes that balance
// and matches the convention on sites like Linear, Vercel, and Stripe.
//
// Behavior:
//   • Reads effective theme from <html data-theme>, which the boot
//     script in app/layout.tsx already set before first paint.
//   • On click: flips to the opposite effective theme and persists
//     via the same setThemePref cookie action the shell toggle uses.
//   • We don't expose "System" here by design — a single click gives
//     the user the immediate opposite of what they're seeing, which
//     is what the icon telegraphs. Users who want "system" can still
//     set it from /settings in the app shell.

declare global {
  interface Window {
    __tsApplyTheme?: (t: ThemePref) => void;
  }
}

function readEffectiveTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

export function MarketingThemeToggle() {
  // Start neutral; hydrate after mount so SSR output stays stable
  // regardless of what the cookie said. The boot script already
  // painted the correct theme, so there's no flash here.
  const [theme, setTheme] = React.useState<"light" | "dark">("dark");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setTheme(readEffectiveTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (typeof window !== "undefined" && window.__tsApplyTheme) {
      window.__tsApplyTheme(next);
    }
    // Persist server-side so SSR renders agree on subsequent loads.
    setThemePref(next).catch(() => {});
  };

  // Pre-hydration: render a placeholder at the same size so the
  // header doesn't reflow when the icon appears.
  if (!mounted) {
    return (
      <div
        aria-hidden
        className="h-9 w-9"
      />
    );
  }

  const isLight = theme === "light";
  const label = isLight ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="ts-focus relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors"
      style={{
        color: "var(--text-muted)",
        border: "1px solid var(--border-subtle)",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-default)";
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.background = "var(--surface-1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-muted)";
        e.currentTarget.style.borderColor = "var(--border-subtle)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Crossfade + rotate both icons; only one is opaque at a time.
          Using two stacked layers (not a swap on click) gives us a
          real animation without juggling render state. */}
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center transition-all duration-300"
        style={{
          opacity: isLight ? 0 : 1,
          transform: `rotate(${isLight ? -90 : 0}deg) scale(${isLight ? 0.6 : 1})`,
        }}
      >
        <Icon.Sun size={15} />
      </span>
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center transition-all duration-300"
        style={{
          opacity: isLight ? 1 : 0,
          transform: `rotate(${isLight ? 0 : 90}deg) scale(${isLight ? 1 : 0.6})`,
        }}
      >
        <Icon.Moon size={15} />
      </span>
    </button>
  );
}
