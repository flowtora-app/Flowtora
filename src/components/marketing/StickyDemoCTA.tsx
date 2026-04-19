"use client";

import * as React from "react";
import Link from "next/link";

// StickyDemoCTA — appears after the user scrolls ~1 viewport.
//
// The theory: the visitor has read the hero and one or two sections —
// they're now "warm" but they've scrolled past the primary CTA. A
// modest bottom-right pill saves a scroll-back trip without
// interrupting. It stays dismissable (session-stored) so repeat
// visitors who said "no" aren't nagged.
//
// Rules of engagement:
//   • Only shows after scrollY > 800px so it doesn't duplicate the hero
//   • Session-persisted dismissal (NOT local) — it re-appears on a
//     fresh visit, which is correct for a marketing prompt
//   • Hides on mobile — there's already a mobile CTA in the hero and
//     sticky elements fight thumb reach + form fields
//   • Hides on pages where a demo CTA would be redundant (e.g.
//     /book-demo itself) — gated via `hideOnPaths`

export function StickyDemoCTA({ hideOnPaths = ["/book-demo", "/contact"] }: { hideOnPaths?: string[] }) {
  const [visible, setVisible] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    // Check pathname against hide list
    if (typeof window !== "undefined" && hideOnPaths.includes(window.location.pathname)) {
      return;
    }
    // Respect prior dismissal this session
    if (typeof window !== "undefined" && sessionStorage.getItem("ts_sticky_demo_dismissed") === "1") {
      setDismissed(true);
      return;
    }
    const onScroll = () => {
      setVisible(window.scrollY > 800);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hideOnPaths]);

  if (dismissed || !visible) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 hidden animate-in fade-in slide-in-from-bottom-2 duration-200 md:block"
      // inline styles for precise token use; tailwind can't reference CSS vars
      role="complementary"
    >
      <div
        className="flex items-center gap-3 rounded-full py-2 pl-5 pr-2 shadow-xl"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
        }}
      >
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          See Flowtora in action?
        </span>
        <Link
          href="/book-demo"
          className="inline-flex h-8 items-center rounded-full px-4 text-xs font-semibold"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Book a demo
        </Link>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem("ts_sticky_demo_dismissed", "1");
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full"
          style={{ color: "var(--text-faint)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M3 3l10 10" />
            <path d="M3 13L13 3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
