"use client";

import * as React from "react";
import { Icon } from "./icons";
import { cn } from "@/lib/cn";
import { setThemePref } from "@/app/actions/ui";
import type { ThemePref } from "@/lib/theme";

// ThemeToggle — segmented control with System / Light / Dark.
//
// The boot script in app/layout.tsx already set data-theme on <html>
// before paint; this component's job is to let the user change it.
// We:
//   1. Read the current pref from the cookie (same authoritative source
//      the SSR used), falling back to "system" if absent/invalid.
//   2. On user click, call window.__tsApplyTheme (installed by the boot
//      script) to flip the DOM instantly — no round trip.
//   3. Call setThemePref server action to persist in the cookie so
//      future SSR renders start with the right theme.
//
// The segmented pattern is deliberately three-wide: a cycle button
// would save pixels but hides the "System" option, which is the right
// default for most users.

declare global {
  interface Window {
    __tsApplyTheme?: (t: ThemePref) => void;
  }
}

function readInitialPref(): ThemePref {
  if (typeof document === "undefined") return "system";
  const match = document.cookie.match(/(?:^|; )ts_theme=([^;]+)/);
  const raw = match ? decodeURIComponent(match[1]) : "system";
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = React.useState<ThemePref>("system");
  // Hydrate from cookie after mount so SSR output stays stable regardless
  // of the user's pref (boot script handles first-paint correctness).
  React.useEffect(() => {
    setPref(readInitialPref());
  }, []);

  const apply = (next: ThemePref) => {
    setPref(next);
    if (typeof window !== "undefined" && window.__tsApplyTheme) {
      window.__tsApplyTheme(next);
    }
    // Fire-and-forget. If the cookie write fails, the DOM flip still
    // stuck for this session and the boot script will recover on next
    // load from localStorage.
    setThemePref(next).catch(() => {});
  };

  const options: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
    { value: "system", label: "System", icon: <Icon.Monitor size={13} /> },
    { value: "light",  label: "Light",  icon: <Icon.Sun size={13} /> },
    { value: "dark",   label: "Dark",   icon: <Icon.Moon size={13} /> },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md p-0.5",
        compact ? "text-[10px]" : "text-xs",
      )}
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {options.map((o) => {
        const active = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => apply(o.value)}
            className={cn(
              "ts-focus inline-flex items-center gap-1 rounded-sm px-2 py-1 font-medium transition-colors",
              compact && "px-1.5 py-0.5 gap-0.5",
            )}
            style={{
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--text-default)" : "var(--text-muted)",
              boxShadow: active ? "var(--shadow-sm)" : "none",
            }}
          >
            {o.icon}
            {!compact && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
