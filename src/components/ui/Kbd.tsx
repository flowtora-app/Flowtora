"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Kbd — Spec Page 0 §0.5.37.
//
// Style: monospace, 11px, neutral-700, bg-muted, border-default,
// radius-sm, padding 2px 6px.
// Joiner: " + " between modifier and key, e.g. "⌘ K", "Shift N".
// Mac vs Win: auto-detect platform; show ⌘ vs Ctrl.
//
// Usage:
//   <Kbd>⌘ K</Kbd>                     literal text
//   <Kbd keys={["mod", "k"]} />        renders "⌘ K" on Mac, "Ctrl K" on Win
//   <Kbd keys={["shift", "n"]} />      renders "Shift N"

type Modifier = "mod" | "shift" | "alt" | "ctrl" | "meta";

const KEY_SYMBOLS: Record<string, { mac: string; win: string }> = {
  mod:    { mac: "⌘",  win: "Ctrl" },
  cmd:    { mac: "⌘",  win: "⌘" },
  ctrl:   { mac: "⌃",  win: "Ctrl" },
  alt:    { mac: "⌥",  win: "Alt" },
  shift:  { mac: "⇧",  win: "Shift" },
  meta:   { mac: "⌘",  win: "Win" },
  enter:  { mac: "⏎",  win: "↵" },
  tab:    { mac: "⇥",  win: "Tab" },
  esc:    { mac: "Esc", win: "Esc" },
  escape: { mac: "Esc", win: "Esc" },
  space:  { mac: "Space", win: "Space" },
  up:     { mac: "↑", win: "↑" },
  down:   { mac: "↓", win: "↓" },
  left:   { mac: "←", win: "←" },
  right:  { mac: "→", win: "→" },
  delete: { mac: "⌫", win: "Del" },
  backspace: { mac: "⌫", win: "⌫" },
};

function isMac(): boolean {
  if (typeof navigator === "undefined") return true;  // default to Mac on SSR
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

function renderKey(key: string, mac: boolean): string {
  const sym = KEY_SYMBOLS[key.toLowerCase()];
  if (sym) return mac ? sym.mac : sym.win;
  // Single letters get uppercased; longer strings pass through.
  return key.length === 1 ? key.toUpperCase() : key;
}

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  /** Render keys as an array, e.g. ["mod", "k"] → "⌘ K" / "Ctrl K". */
  keys?: (Modifier | string)[];
  /** Optional join string between keys. Spec defaults to a space. */
  joiner?: string;
  /** Override platform detection. */
  platform?: "mac" | "win";
}

export function Kbd({ keys, joiner = " ", platform, className, children, ...rest }: KbdProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isMacPlatform = platform === "mac"
    ? true
    : platform === "win"
    ? false
    : mounted ? isMac() : true;  // SSR-stable

  const content = keys
    ? keys.map((k) => renderKey(k, isMacPlatform)).join(joiner)
    : children;

  return (
    <kbd
      {...rest}
      className={cn(
        "inline-flex items-center font-mono",
        className,
      )}
      style={{
        fontSize: "11px",
        color: "var(--text-default)",
        background: "var(--surface-2)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: "2px 6px",
        lineHeight: 1.2,
        ...rest.style,
      }}
    >
      {content}
    </kbd>
  );
}
