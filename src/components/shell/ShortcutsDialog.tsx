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
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px) saturate(140%)",
        zIndex: "var(--z-modal)",
      }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background:
            "radial-gradient(640px circle at -10% -30%, var(--accent-surface), transparent 60%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-default)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent), " +
            "0 24px 60px -12px rgba(0,0,0,0.6), " +
            "0 0 0 1px color-mix(in oklab, var(--accent-primary) 8%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 7,
                background:
                  "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
                color: "var(--accent-primary)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
              }}
            >
              <Icon.Keyboard size={14} />
            </span>
            <h2
              style={{
                color: "var(--text-default)",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                lineHeight: 1.2,
              }}
            >
              Keyboard shortcuts
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-3)]"
            style={{ color: "var(--text-muted)" }}
          >
            <Icon.X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 px-5 py-5 md:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <div
                className="mb-2.5 flex items-center gap-1.5"
                style={{
                  color: "var(--text-default)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  lineHeight: 1.2,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 3,
                    height: 3,
                    borderRadius: 1,
                    background: "var(--accent-primary)",
                  }}
                />
                {group.label}
              </div>
              <ul className="flex flex-col gap-2">
                {group.items.map((s, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex shrink-0 items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background:
                              "linear-gradient(180deg, color-mix(in oklab, var(--surface-2) 92%, white 8%) 0%, var(--surface-2) 100%)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-default)",
                            minWidth: 22,
                            height: 22,
                            padding: "0 6px",
                            borderRadius: 5,
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            fontFamily:
                              "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
                            boxShadow:
                              "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent), " +
                              "0 1px 0 0 rgba(0,0,0,0.25)",
                            lineHeight: 1,
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                    <span
                      className="flex-1"
                      style={{
                        color: "var(--text-default)",
                        fontSize: 12.5,
                        fontWeight: 500,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {s.label}
                    </span>
                    {s.hint && (
                      <span
                        style={{
                          color: "var(--text-faint)",
                          fontSize: 10.5,
                          lineHeight: 1.3,
                        }}
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
          className="flex items-center gap-2 px-5 py-2.5"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-faint)",
            fontSize: 10.5,
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--surface-0) 35%, transparent) 100%)",
          }}
        >
          <span>Shortcuts with a hint use the command palette · </span>
          <kbd
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 9.5,
              fontWeight: 700,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
            }}
          >
            ?
          </kbd>
          <span>toggle ·</span>
          <kbd
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 9.5,
              fontWeight: 700,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
            }}
          >
            Esc
          </kbd>
          <span>close</span>
        </div>
      </div>
    </div>
  );
}
