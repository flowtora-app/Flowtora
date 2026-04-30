"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// TopNavBar — Spec Page 0 §0.5.27.
//
// Height: 56px. Three sections:
//   left   — logo + product name + env badge
//   center — global search (480px wide)
//   right  — action cluster (create, notifications, help, theme,
//            profile)
// Sticky with shadow-sm on scroll.
// Mobile: logo + hamburger + search icon + profile.
//
// All slots are caller-driven render-props — the platform top nav is
// composed via PlatformNav already; this is the design-system shape
// for places that don't have one yet (auth flows, marketing-side
// admin, etc).

export interface TopNavBarProps {
  /** Left slot: logo + product name + optional env chip. */
  left?: React.ReactNode;
  /** Center slot: global search input. Suggested width ~480px. */
  center?: React.ReactNode;
  /** Right slot: action cluster. */
  right?: React.ReactNode;
  /** Mobile menu trigger (replaces left on small screens). */
  mobileMenu?: React.ReactNode;
  /** Render shadow-sm once the user scrolls past the top. */
  shadowOnScroll?: boolean;
  className?: string;
}

export function TopNavBar({
  left,
  center,
  right,
  mobileMenu,
  shadowOnScroll = true,
  className,
}: TopNavBarProps) {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    if (!shadowOnScroll) return;
    function onScroll() {
      setScrolled(window.scrollY > 0);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [shadowOnScroll]);

  return (
    <div
      className={cn("flex h-14 w-full items-center gap-4 px-4", className)}
      style={{
        background: "var(--surface-1)",
        boxShadow: scrolled ? "var(--shadow-sm)" : "none",
        transition: "box-shadow 150ms var(--ease-out)",
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        {/* Mobile-only hamburger (md:hidden) */}
        <span className="md:hidden">{mobileMenu}</span>
        {/* Desktop left */}
        <span className="hidden md:flex md:items-center md:gap-2">{left}</span>
      </div>
      <div className="hidden flex-1 justify-center md:flex">
        <div className="w-full max-w-[480px]">{center}</div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {right}
      </div>
    </div>
  );
}
