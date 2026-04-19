"use client";

import * as React from "react";
import { Icon } from "./icons";

// Phase 3 — Keyboard shortcut cheat-sheet.
//
// Rendered once at the AppShell level; opens on "?" key or via the
// "Shortcuts" link in the command palette footer. We keep the registry
// co-located with the dialog because:
//   - It's the one component that needs to *know* every shortcut.
//   - The actual handlers for each shortcut already live in the
//     component that owns the keystroke (TopBar for ⌘K, AppShell for
//     "?", etc.). This file is the documentation surface, not the
//     execution layer.
//
// If the app adds enough shortcuts to warrant a registry-per-feature
// split, we'll extract into `src/lib/shortcuts.ts` and let features
// register themselves. Until then, one file is easier to audit.

type Shortcut = { keys: string[]; label: string; hint?: string };
type ShortcutGroup = { label: string; items: Shortcut[] };

// Use MacCtrl as a display hint; we don't actually swap platforms
// because ⌘K already binds both Meta and Ctrl in the TopBar handler.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Global",
    items: [
      { keys: ["⌘", "K"], label: "Open command palette", hint: "or Ctrl+K · also / when not typing" },
      { keys: ["?"], label: "Show this cheat sheet" },
      { keys: ["Esc"], label: "Close the current dialog" },
    ],
  },
  {
    label: "Palette",
    items: [
      { keys: ["↑"], label: "Move highlight up" },
      { keys: ["↓"], label: "Move highlight down" },
      { keys: ["↵"], label: "Open the highlighted row" },
      { keys: ["Ctrl", "N"], label: "Same as arrow down" },
      { keys: ["Ctrl", "P"], label: "Same as arrow up" },
    ],
  },
  {
    label: "Navigation",
    items: [
      { keys: ["g", "d"], label: "Go to Dashboard", hint: "palette: type 'dashboard'" },
      { keys: ["g", "t"], label: "Go to Tasks",     hint: "palette: type 'tasks'" },
      { keys: ["g", "c"], label: "Go to Customers", hint: "palette: type 'customers'" },
      { keys: ["g", "o"], label: "Go to Orders",    hint: "palette: type 'orders'" },
    ],
  },
  {
    label: "Creation",
    items: [
      { keys: ["n", "c"], label: "New customer", hint: "palette: 'create customer'" },
      { keys: ["n", "q"], label: "New quote",    hint: "palette: 'create quote'" },
      { keys: ["n", "o"], label: "New order",    hint: "palette: 'create order'" },
      { keys: ["n", "i"], label: "New invoice",  hint: "palette: 'create invoice'" },
    ],
  },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 flex items-start justify-center pt-[8vh]"
      style={{ background: "rgba(0,0,0,0.55)", zIndex: "var(--z-modal)" }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Icon.Keyboard size={16} style={{ color: "var(--text-muted)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="ts-focus rounded p-1 transition-colors hover:brightness-110"
            style={{ color: "var(--text-muted)" }}
          >
            <Icon.X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <div
                className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                {group.label}
              </div>
              <ul className="flex flex-col gap-1.5">
                {group.items.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: "var(--surface-3)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-default)",
                            minWidth: 18,
                            textAlign: "center",
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span className="flex-1" style={{ color: "var(--text-default)" }}>
                      {s.label}
                    </span>
                    {s.hint && (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--text-faint)" }}
                      >
                        {s.hint}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="px-5 py-2 text-[10px]"
          style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}
        >
          Shortcuts marked with a hint aren&apos;t bound to a literal
          key combo yet — use the command palette to trigger them. Press{" "}
          <kbd
            className="rounded px-1 py-0.5"
            style={{
              background: "var(--surface-3)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            ?
          </kbd>{" "}
          to toggle this sheet · Esc to close.
        </div>
      </div>
    </div>
  );
}
