"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Combobox — Spec Page 0 §0.5.5 (Select / Combobox / Multi-select).
//
// Searchable single-select with keyboard nav, optional async load,
// "create new" CTA when nothing matches, recent selections section.
// MultiCombobox below extends with chips inside the input.

export interface ComboboxOption<V extends string = string> {
  value: V;
  label: string;
  description?: React.ReactNode;
  /** Optional category — items with same category render under one header. */
  group?: string;
  disabled?: boolean;
}

export interface ComboboxProps<V extends string = string> {
  value: V | null;
  onChange: (next: V | null) => void;
  options: ComboboxOption<V>[];
  placeholder?: string;
  emptyLabel?: string;
  /** When supplied + nothing matches, renders a "Create [query]" item. */
  onCreate?: (query: string) => void;
  /** Up to N recently picked values surfaced under "Recent". */
  recent?: V[];
  /** Async load — runs on every query change. Debounced 250ms (spec). */
  onSearch?: (query: string) => Promise<ComboboxOption<V>[]> | ComboboxOption<V>[];
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  required?: boolean;
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
}

const SIZE_CLASS = {
  sm: "h-8  text-[13px] px-2.5",
  md: "h-9  text-[14px] px-3",
  lg: "h-10 text-[14px] px-3.5",
} as const;

export function Combobox<V extends string = string>({
  value,
  onChange,
  options: initial,
  placeholder = "Select…",
  emptyLabel = "No results — try different keywords",
  onCreate,
  recent,
  onSearch,
  size = "md",
  disabled,
  required,
  label,
  hint,
  error,
  className,
}: ComboboxProps<V>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [searchResults, setSearchResults] = React.useState<ComboboxOption<V>[] | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Debounced async search (spec §0.5.5: 250ms).
  React.useEffect(() => {
    if (!onSearch || !open) return;
    const handle = setTimeout(async () => {
      const r = await onSearch(query);
      setSearchResults(r);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, onSearch, open]);

  // Resolve effective options. Async results override the initial list
  // when present.
  const list = onSearch ? (searchResults ?? []) : initial;

  // Filter by query (only when not async).
  const filtered = onSearch
    ? list
    : list.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  // Group: Recent first, then user groups.
  const recentSet = new Set(recent ?? []);
  const recentItems = filtered.filter((o) => recentSet.has(o.value));
  const restItems = filtered.filter((o) => !recentSet.has(o.value));

  const groupedRest = new Map<string, ComboboxOption<V>[]>();
  for (const o of restItems) {
    const g = o.group ?? "";
    const arr = groupedRest.get(g) ?? [];
    arr.push(o);
    groupedRest.set(g, arr);
  }

  const flat = [
    ...recentItems,
    ...[...groupedRest.values()].flat(),
  ];

  const selected = initial.find((o) => o.value === value) ?? null;
  const showCreate = !!onCreate && query.trim().length > 0 && filtered.length === 0;

  // Click outside closes.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActiveIndex((i) => Math.min(flat.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (showCreate) { onCreate(query); setQuery(""); setOpen(false); return; }
      const item = flat[activeIndex];
      if (item && !item.disabled) { onChange(item.value); setQuery(""); setOpen(false); }
    }
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
          {label}{required && <span aria-hidden style={{ color: "var(--danger-fg)" }}> *</span>}
        </label>
      )}
      <div ref={containerRef} className="relative">
        <div
          className={cn(
            "ts-focus flex items-center gap-2 rounded-md border bg-transparent",
            SIZE_CLASS[size],
            "focus-within:shadow-[var(--shadow-focus)]",
          )}
          style={{
            background: "var(--surface-1)",
            borderColor: error ? "var(--danger-border, var(--rose-500))" : "var(--border-default)",
            color: "var(--text-default)",
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? "none" : undefined,
          }}
          onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        >
          <input
            ref={inputRef}
            type="text"
            value={open ? query : (selected?.label ?? "")}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKey}
            placeholder={placeholder}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="w-full bg-transparent outline-none"
          />
          <span aria-hidden style={{ color: "var(--text-muted)" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="3,4 6,8 9,4" /></svg>
          </span>
        </div>
        {open && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-[var(--z-dropdown,100)] mt-1 max-h-72 overflow-y-auto rounded-lg border"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
          >
            {showCreate ? (
              <button
                type="button"
                role="option"
                onClick={() => { onCreate?.(query); setQuery(""); setOpen(false); }}
                className="ts-focus flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                style={{ color: "var(--accent-primary)" }}
              >
                + Create &ldquo;{query}&rdquo;
              </button>
            ) : flat.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
                {emptyLabel}
                {onCreate && query && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => { onCreate?.(query); setQuery(""); setOpen(false); }}
                      className="ts-focus text-[12px] font-medium"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      Create &ldquo;{query}&rdquo;
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ComboList
                recent={recentItems}
                groups={groupedRest}
                activeIndex={activeIndex}
                onMouseEnter={setActiveIndex}
                onPick={(opt) => { onChange(opt.value); setQuery(""); setOpen(false); }}
                query={query}
              />
            )}
          </div>
        )}
      </div>
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

function ComboList<V extends string>({
  recent,
  groups,
  activeIndex,
  onMouseEnter,
  onPick,
  query,
}: {
  recent: ComboboxOption<V>[];
  groups: Map<string, ComboboxOption<V>[]>;
  activeIndex: number;
  onMouseEnter: (i: number) => void;
  onPick: (opt: ComboboxOption<V>) => void;
  query: string;
}) {
  let i = -1;
  const sections: React.ReactNode[] = [];
  if (recent.length > 0) {
    sections.push(
      <div key="recent-hdr" className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Recent</div>,
    );
    for (const opt of recent) {
      i++;
      const idx = i;
      sections.push(<ComboItem key={"r-" + opt.value} option={opt} active={idx === activeIndex} onMouseEnter={() => onMouseEnter(idx)} onPick={onPick} query={query} />);
    }
  }
  for (const [grp, items] of groups.entries()) {
    if (grp) sections.push(<div key={"g-" + grp} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{grp}</div>);
    for (const opt of items) {
      i++;
      const idx = i;
      sections.push(<ComboItem key={"g-" + grp + "-" + opt.value} option={opt} active={idx === activeIndex} onMouseEnter={() => onMouseEnter(idx)} onPick={onPick} query={query} />);
    }
  }
  return <>{sections}</>;
}

function ComboItem<V extends string>({ option, active, onMouseEnter, onPick, query }: {
  option: ComboboxOption<V>;
  active: boolean;
  onMouseEnter: () => void;
  onPick: (o: ComboboxOption<V>) => void;
  query: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      disabled={option.disabled}
      onMouseEnter={onMouseEnter}
      onClick={() => !option.disabled && onPick(option)}
      className="ts-focus flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: active ? "var(--surface-3)" : "transparent", color: "var(--text-default)" }}
    >
      <span className="min-w-0 flex-1">
        <span className="block">
          <Highlight text={option.label} query={query} />
        </span>
        {option.description && (
          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>{option.description}</span>
        )}
      </span>
    </button>
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
      <strong style={{ color: "var(--text-default)", fontWeight: 700 }}>{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ────────────────────────────────────────────────────────────── */

export interface MultiComboboxProps<V extends string = string>
  extends Omit<ComboboxProps<V>, "value" | "onChange"> {
  value: V[];
  onChange: (next: V[]) => void;
  /** Max chips before collapsing into "+ N more". */
  maxDisplay?: number;
}

export function MultiCombobox<V extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  size = "md",
  disabled,
  label,
  hint,
  error,
  required,
  maxDisplay = 6,
  className,
}: MultiComboboxProps<V>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = options.filter((o) => value.includes(o.value));
  const filtered = options.filter((o) =>
    !value.includes(o.value) &&
    o.label.toLowerCase().includes(query.toLowerCase()),
  );

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const remove = (v: V) => onChange(value.filter((x) => x !== v));
  const add = (v: V) => onChange([...value, v]);
  const visible = selected.slice(0, maxDisplay);
  const overflow = selected.length - visible.length;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
          {label}{required && <span aria-hidden style={{ color: "var(--danger-fg)" }}> *</span>}
        </label>
      )}
      <div ref={containerRef} className="relative">
        <div
          className={cn(
            "ts-focus flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5",
            "focus-within:shadow-[var(--shadow-focus)]",
          )}
          style={{
            background: "var(--surface-1)",
            borderColor: error ? "var(--danger-border, var(--rose-500))" : "var(--border-default)",
            color: "var(--text-default)",
            minHeight: size === "sm" ? 32 : size === "md" ? 36 : 40,
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? "none" : undefined,
          }}
          onClick={() => setOpen(true)}
        >
          {visible.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px]"
              style={{ background: "var(--brand-50, var(--accent-surface))", color: "var(--brand-700, var(--accent-primary))", border: "1px solid var(--brand-200, var(--accent-primary))" }}
            >
              {opt.label}
              <button type="button" aria-label={`Remove ${opt.label}`} onClick={(e) => { e.stopPropagation(); remove(opt.value); }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2.5" y1="2.5" x2="7.5" y2="7.5" /><line x1="7.5" y1="2.5" x2="2.5" y2="7.5" /></svg>
              </button>
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>+{overflow} more</span>
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? placeholder : ""}
            disabled={disabled}
            className="min-w-[80px] flex-1 bg-transparent text-[13px] outline-none"
          />
        </div>
        {open && filtered.length > 0 && (
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-[var(--z-dropdown,100)] mt-1 max-h-72 overflow-y-auto rounded-lg border"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-1" style={{ borderColor: "var(--border-subtle)" }}>
              <button type="button" onClick={() => onChange(options.map((o) => o.value))} className="text-[10px] font-medium" style={{ color: "var(--accent-primary)" }}>Select all</button>
              <button type="button" onClick={() => onChange([])} className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Clear</button>
            </div>
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                onClick={() => { add(opt.value); setQuery(""); }}
                className="ts-focus flex w-full items-start gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                style={{ color: "var(--text-default)" }}
              >
                <span className="min-w-0 flex-1">{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}>{error ?? hint}</span>
      )}
    </div>
  );
}
