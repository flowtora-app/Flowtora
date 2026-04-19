"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

// Phase 18 Slice B + Phase 3 — Command palette (⌘K / Ctrl+K).
//
// Three modes merged into one list:
//   1. Query empty   → show "Pinned" (server), "Quick actions", "Recent".
//   2. Query present → debounce 180ms, fetch /api/search, show grouped
//      results plus local-matched quick actions. When a group's
//      `hasMore` is true we render a "See all results" row that jumps
//      to the full-page /search view.
//   3. Any time      → a footer affordance links to the shortcut
//      cheat-sheet (also bindable to the "?" key globally).
//
// Keyboard model:
//   ↑/↓ move highlight, Enter activates, Esc closes, ⌘K or / opens.
//
// Recents are stored client-side in localStorage under a tenant-scoped
// key. Pins are authoritative and come from the server so they survive
// device switches; recents intentionally don't.

type SearchGroup = {
  kind: string;
  label: string;
  items: SearchItem[];
  hasMore?: boolean;
};
type SearchItem = { id: string; label: string; sub?: string; href: string };

// Quick actions — the palette's always-visible "what can I do here"
// list. These are plain hrefs; if/when we add in-app modal openers
// we can extend the shape with an `action` handler.
export type QuickAction = {
  id: string;
  label: string;
  sub?: string;
  href: string;
  icon: IconName;
  keywords?: string[];
};

// Pinned items loaded on the server from PalettePin. Shape matches
// SearchItem + a kind so we can render an icon the same way we do for
// search results.
export type PalettePin = {
  id: string;
  kind: string;
  label: string;
  sub?: string;
  href: string;
};

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  quickActions: QuickAction[];
  pins: PalettePin[];
  onOpenShortcuts?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  slug,
  quickActions,
  pins,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState("");
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const [recents, setRecents] = React.useState<SearchItem[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const abortRef = React.useRef<AbortController | null>(null);

  // Load recents on open, from a tenant-scoped key (so switching tenants
  // shows the right list).
  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(recentsKey(slug));
      setRecents(raw ? (JSON.parse(raw) as SearchItem[]) : []);
    } catch {
      setRecents([]);
    }
    setQuery("");
    setGroups([]);
    setHighlight(0);
    // Focus after the dialog paints.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, slug]);

  // Debounced server search.
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`,
          { signal: ac.signal, cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { groups: SearchGroup[] };
          setGroups(data.groups ?? []);
        } else {
          setGroups([]);
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
    };
  }, [query, slug, open]);

  // Flatten everything into one nav-able list in the order we render.
  const flat = React.useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    const q = query.trim().toLowerCase();

    if (!q) {
      // Pinned first — these are the user's explicit favorites and
      // deserve the shortest possible path.
      if (pins.length > 0) {
        rows.push({ type: "section", label: "Pinned" });
        for (const p of pins) {
          rows.push({
            type: "item",
            kind: p.kind,
            id: p.id,
            label: p.label,
            sub: p.sub,
            href: p.href,
            icon: kindToIcon(p.kind),
          });
        }
      }
      rows.push({ type: "section", label: "Quick actions" });
      for (const a of quickActions) {
        rows.push({
          type: "item",
          kind: "action",
          id: a.id,
          label: a.label,
          sub: a.sub,
          href: a.href,
          icon: a.icon,
        });
      }
      if (recents.length > 0) {
        rows.push({ type: "section", label: "Recent" });
        for (const r of recents) {
          rows.push({
            type: "item",
            kind: "recent",
            id: r.id,
            label: r.label,
            sub: r.sub,
            href: r.href,
          });
        }
      }
    } else {
      // Local filter of quick actions first.
      const matching = quickActions.filter((a) => {
        const hay = [a.label, a.sub ?? "", ...(a.keywords ?? [])].join(" ").toLowerCase();
        return hay.includes(q);
      });
      if (matching.length) {
        rows.push({ type: "section", label: "Actions" });
        for (const a of matching) {
          rows.push({
            type: "item",
            kind: "action",
            id: a.id,
            label: a.label,
            sub: a.sub,
            href: a.href,
            icon: a.icon,
          });
        }
      }
      for (const g of groups) {
        rows.push({ type: "section", label: g.label });
        for (const it of g.items) {
          rows.push({
            type: "item",
            kind: g.kind,
            id: it.id,
            label: it.label,
            sub: it.sub,
            href: it.href,
          });
        }
        // If the server reported more matches than it sent, drop a
        // "See all" row that jumps to the full-page search view
        // filtered to this kind.
        if (g.hasMore) {
          rows.push({
            type: "item",
            kind: "more",
            id: `more-${g.kind}`,
            label: `See all ${g.label.toLowerCase()} matches…`,
            href: `/t/${slug}/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(g.kind)}`,
            icon: "ArrowRight",
          });
        }
      }
      if (rows.length > 0) {
        // Bottom-row shortcut to the full-page search even when no
        // single group overflowed — helps when the user wants to scan
        // all kinds side-by-side.
        rows.push({
          type: "item",
          kind: "search-all",
          id: "search-all",
          label: `Open full search for "${q.slice(0, 40)}"`,
          href: `/t/${slug}/search?q=${encodeURIComponent(q)}`,
          icon: "Search",
        });
      }
    }

    return rows;
  }, [query, quickActions, groups, recents, pins, slug]);

  const firstItemIndex = React.useMemo(() => flat.findIndex((r) => r.type === "item"), [flat]);

  React.useEffect(() => {
    setHighlight(Math.max(0, firstItemIndex));
  }, [firstItemIndex]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      setHighlight((h) => findNext(flat, h, +1));
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setHighlight((h) => findNext(flat, h, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flat[highlight];
      if (row?.type === "item") go(row);
    }
  };

  const go = (row: FlatItem) => {
    // Record in recents for everything except quick actions and the
    // synthetic "see more" / "open full search" rows.
    const skipRecent =
      row.kind === "action" || row.kind === "more" || row.kind === "search-all";
    if (!skipRecent) {
      pushRecent(slug, { id: row.id, label: row.label, sub: row.sub, href: row.href });
    }
    onOpenChange(false);
    router.push(row.href);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Command palette"
      className="fixed inset-0 flex items-start justify-center pt-[12vh]"
      style={{ background: "rgba(0,0,0,0.55)", zIndex: "var(--z-modal)" }}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search row */}
        <div
          className="flex items-center gap-2 px-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <Icon.Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search customers, quotes, orders… or jump to an action"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-[color:var(--text-faint)]"
            style={{ color: "var(--text-default)" }}
            autoComplete="off"
            spellCheck={false}
          />
          <span
            className="hidden shrink-0 text-[10px] uppercase tracking-wider md:inline"
            style={{ color: "var(--text-faint)" }}
          >
            {loading ? "Searching…" : "Esc"}
          </span>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {flat.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              {query ? "No matches." : "Start typing to search…"}
            </div>
          ) : (
            flat.map((row, i) => {
              if (row.type === "section") {
                return (
                  <div
                    key={`s-${row.label}-${i}`}
                    className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {row.label}
                  </div>
                );
              }
              const isActive = i === highlight;
              return (
                <button
                  key={`${row.kind}-${row.id}`}
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => go(row)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                  )}
                  style={{
                    background: isActive ? "var(--accent-surface)" : "transparent",
                    color: isActive ? "var(--text-default)" : "var(--text-default)",
                  }}
                >
                  {row.icon ? (
                    <span style={{ color: "var(--text-muted)" }}>
                      {renderIcon(row.icon)}
                    </span>
                  ) : (
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-semibold uppercase"
                      style={{
                        background: "var(--surface-3)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {row.kind.slice(0, 1)}
                    </span>
                  )}
                  <span className="flex-1 truncate">{row.label}</span>
                  {row.sub && (
                    <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                      {row.sub}
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>↵</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center justify-between px-4 py-2 text-[10px]"
          style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}
        >
          <span>↑ ↓ to navigate · ↵ to open · Esc to close</span>
          {onOpenShortcuts ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenShortcuts();
              }}
              className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--text-muted)]"
              style={{ color: "var(--text-faint)" }}
            >
              Shortcuts (?)
            </button>
          ) : (
            <span>⌘K</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────

type FlatSection = { type: "section"; label: string };
type FlatItem = {
  type: "item";
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  icon?: IconName;
};
type FlatRow = FlatSection | FlatItem;

function findNext(rows: FlatRow[], current: number, delta: number): number {
  const n = rows.length;
  if (n === 0) return 0;
  let i = current;
  for (let step = 0; step < n; step++) {
    i = (i + delta + n) % n;
    if (rows[i].type === "item") return i;
  }
  return current;
}

function renderIcon(name: IconName): React.ReactNode {
  const Cmp = Icon[name];
  return <Cmp size={14} />;
}

// Map entity-kind strings coming from the server to the icon registry.
// Unknown kinds fall back to the generic Bookmark icon (used for pins)
// so we always render *something*.
function kindToIcon(kind: string): IconName {
  switch (kind) {
    case "customer": return "Customers";
    case "quote":    return "Quotes";
    case "order":    return "Orders";
    case "invoice":  return "Invoices";
    case "task":     return "Tasks";
    case "product":  return "Products";
    case "location": return "Building";
    default:         return "Bookmark";
  }
}

function recentsKey(slug: string) {
  return `ts_recent_items:${slug}`;
}

const RECENTS_MAX = 8;

function pushRecent(slug: string, item: SearchItem) {
  try {
    const key = recentsKey(slug);
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as SearchItem[];
    const next = [item, ...existing.filter((x) => x.href !== item.href)].slice(0, RECENTS_MAX);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Quota exhausted, private mode, etc. — silently skip.
  }
}
