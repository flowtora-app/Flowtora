"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// CommandPalette — Spec Page 0 §0.5.42 (CMD+K).
//
// Trigger: ⌘K / Ctrl+K, also "/" from anywhere except text inputs.
// Anatomy: modal centered top-1/3 (640px wide); input + magnifier;
// results list below; footer with kbd hints (↑↓ navigate, ↵ select,
// Esc close).
// Categories (in order): Recent (last 5), Suggested (AI), Navigation,
// Tenants, Users, Invoices, Tickets, Audit log entries, Settings,
// Actions ("Create…").
// Result item: category icon + label + meta + kbd shortcut.
// Mouse + keyboard fully supported. Fuzzy search, debounce 80ms,
// category prefix filter (`t:`, `u:`).
//
// Caller-driven results — wire fetchers via the `search` prop. The
// component owns the open/close state, focus trap, keyboard nav,
// debounce, and rendering.

export interface CommandItem {
  id: string;
  label: string;
  /** Spec category in the result list. */
  category?: string;
  /** Optional secondary line. */
  description?: React.ReactNode;
  /** Optional category icon. */
  icon?: React.ReactNode;
  /** Optional shortcut chip. */
  kbd?: string;
  /** Click handler (or use href for pure navigation). */
  onSelect?: () => void;
  href?: string;
  /** When true, item renders with destructive (rose) text. */
  destructive?: boolean;
}

export interface CommandPaletteProps {
  /** Render results synchronously or async. Caller debounces externally
   *  if needed; the palette debounces 80ms by default per spec. */
  search: (query: string) => CommandItem[] | Promise<CommandItem[]>;
  /** Recent items shown when query is empty. */
  recent?: CommandItem[];
  /** Optional persistent "Actions" section shown when query is empty. */
  actions?: CommandItem[];
  /** Override the trigger keybinding. Default: Mod+K and "/". */
  triggerKeys?: { mod?: string; bareSlash?: boolean };
  /** Render the palette in another container (rare). */
  className?: string;
  /** Initial open state for storybook-like surfaces. */
  initialOpen?: boolean;
  /** External handle to programmatically open. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

export function CommandPalette({
  search,
  recent,
  actions,
  className,
  initialOpen,
  open: controlledOpen,
  onOpenChange,
}: CommandPaletteProps) {
  const [openInternal, setOpenInternal] = React.useState(!!initialOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? !!controlledOpen : openInternal;
  const setOpen = (n: boolean) => { if (isControlled) onOpenChange?.(n); else setOpenInternal(n); };

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CommandItem[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Global keybinding.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      } else if (!isInput && e.key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Focus input on open.
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Debounced search (80ms per spec).
  React.useEffect(() => {
    if (!open) return;
    if (query.trim() === "") {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const r = await search(query);
      setResults(r);
      setLoading(false);
      setActiveIndex(0);
    }, 80);
    return () => clearTimeout(handle);
  }, [query, open, search]);

  if (!open) return null;

  const empty = query.trim() === "";
  const flat: CommandItem[] = empty
    ? [...(recent ?? []).map((it) => ({ ...it, category: "Recent" })),
       ...(actions ?? []).map((it) => ({ ...it, category: it.category ?? "Actions" }))]
    : results;

  // Group preserving order — first occurrence wins.
  const grouped = new Map<string, CommandItem[]>();
  for (const it of flat) {
    const cat = it.category ?? "Results";
    const arr = grouped.get(cat) ?? [];
    arr.push(it);
    grouped.set(cat, arr);
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[activeIndex];
      if (!item) return;
      pick(item);
    }
  };

  const pick = (item: CommandItem) => {
    if (item.href) {
      window.location.href = item.href;
    } else {
      item.onSelect?.();
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className={cn("fixed inset-0 z-[var(--z-command-palette,1200)] flex items-start justify-center", className)}
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(2px)" }} />
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mt-[15vh] w-[640px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-default)",
          boxShadow: "var(--shadow-2xl, var(--shadow-xl, var(--shadow-lg)))",
        }}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--border-subtle)" }}>
          <span aria-hidden style={{ color: "var(--text-muted)" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7" cy="7" r="5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search… (try t:acme for tenants, u:ada for users, / for help)"
            className="w-full bg-transparent text-[14px] outline-none"
            style={{ color: "var(--text-default)" }}
          />
          <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
            Esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Searching…</div>
          )}
          {!loading && flat.length === 0 && (
            <div className="px-4 py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              {empty ? "Start typing to search." : "No results — try different keywords."}
            </div>
          )}
          {!loading && [...grouped.entries()].map(([cat, items]) => {
            let runningIndex = -1;
            return (
              <div key={cat}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {cat}
                </div>
                {items.map((it) => {
                  // Find the global index of this item in flat.
                  const idx = flat.findIndex((x) => x.id === it.id && x.category === it.category);
                  runningIndex = idx;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={`${cat}-${it.id}`}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => pick(it)}
                      className="ts-focus flex w-full items-center gap-3 px-3 py-2 text-left text-[13px]"
                      style={{
                        background: active ? "var(--surface-3)" : "transparent",
                        color: it.destructive ? "var(--rose-700, var(--danger-fg))" : "var(--text-default)",
                      }}
                    >
                      {it.icon && <span className="inline-flex shrink-0" style={{ color: "var(--text-muted)" }}>{it.icon}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block">{it.label}</span>
                        {it.description && (
                          <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{it.description}</span>
                        )}
                      </span>
                      {it.kbd && (
                        <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
                          {it.kbd}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t px-3 py-2 text-[10px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>Esc close</span>
          </div>
          <span>{flat.length} result{flat.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
