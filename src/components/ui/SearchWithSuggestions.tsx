"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// SearchWithSuggestions — Spec Page 0 §0.5.44.
//
// As-you-type dropdown with categorized results, recent searches,
// "no results" empty.
// Keyboard: ↑↓ navigate, ↵ go to first result or jump to typed
// result page, Esc closes.
// Highlights match in result label (bold matched substring).
//
// Suggestions are caller-driven: pass `suggestions` as a flat list
// (or grouped via the `category` field). The component handles the
// dropdown shell + keyboard + highlighting.

export interface Suggestion {
  id: string;
  label: string;
  /** Optional secondary line. */
  description?: React.ReactNode;
  /** Optional category — items with the same category render under
   *  one header in display order. Pass "Recent" for recent searches. */
  category?: string;
  /** Leading icon. */
  icon?: React.ReactNode;
}

export interface SearchWithSuggestionsProps {
  query: string;
  onQueryChange: (next: string) => void;
  suggestions: Suggestion[];
  /** When the user picks one. */
  onSelect: (s: Suggestion) => void;
  /** Fired on Enter when no suggestion is highlighted (or list empty). */
  onSubmit?: (query: string) => void;
  placeholder?: string;
  /** Minimum query length before the dropdown shows. Default 1. */
  minLength?: number;
  className?: string;
  /** Loading state — replaces results with a spinner row. */
  loading?: boolean;
}

export function SearchWithSuggestions({
  query,
  onQueryChange,
  suggestions,
  onSelect,
  onSubmit,
  placeholder = "Search…",
  minLength = 1,
  className,
  loading = false,
}: SearchWithSuggestionsProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Group suggestions by category, preserving original order.
  const grouped = React.useMemo(() => {
    const groups = new Map<string, Suggestion[]>();
    for (const s of suggestions) {
      const cat = s.category ?? "";
      const arr = groups.get(cat) ?? [];
      arr.push(s);
      groups.set(cat, arr);
    }
    return groups;
  }, [suggestions]);

  const flat = suggestions;
  const showDropdown = open && query.trim().length >= minLength;

  // Reset active index when results change.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query, suggestions]);

  // Click outside closes.
  React.useEffect(() => {
    if (!showDropdown) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showDropdown]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      if (showDropdown && flat[activeIndex]) {
        e.preventDefault();
        onSelect(flat[activeIndex]);
        setOpen(false);
      } else if (onSubmit) {
        e.preventDefault();
        onSubmit(query);
      }
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative flex items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 inline-flex items-center"
          style={{ color: "var(--text-muted)" }}
        >
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          className="ts-focus h-9 w-full rounded-md border bg-transparent pl-7 pr-3 text-[13px] outline-none"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </div>
      {showDropdown && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-[var(--z-dropdown,100)] mt-1 max-h-80 overflow-y-auto rounded-lg border"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-default)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {loading ? (
            <div className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              Searching…
            </div>
          ) : flat.length === 0 ? (
            <div className="px-3 py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No results.
            </div>
          ) : (
            (() => {
              let runningIndex = -1;
              const sections: React.ReactNode[] = [];
              for (const [cat, items] of grouped.entries()) {
                if (cat) {
                  sections.push(
                    <div
                      key={`hdr-${cat}`}
                      className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {cat}
                    </div>,
                  );
                }
                for (const item of items) {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const active = idx === activeIndex;
                  sections.push(
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                      className="ts-focus flex w-full items-start gap-2 px-3 py-2 text-left text-[13px]"
                      style={{
                        background: active ? "var(--surface-3)" : "transparent",
                        color: "var(--text-default)",
                      }}
                    >
                      {item.icon && <span className="mt-0.5 inline-flex shrink-0">{item.icon}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block">
                          <Highlight text={item.label} query={query} />
                        </span>
                        {item.description && (
                          <span
                            className="mt-0.5 block text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {item.description}
                          </span>
                        )}
                      </span>
                    </button>,
                  );
                }
              }
              return sections;
            })()
          )}
        </div>
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: "var(--text-default)", fontWeight: 700 }}>
        {text.slice(idx, idx + q.length)}
      </strong>
      {text.slice(idx + q.length)}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6" cy="6" r="4.5" />
      <line x1="9.5" y1="9.5" x2="12.5" y2="12.5" />
    </svg>
  );
}
