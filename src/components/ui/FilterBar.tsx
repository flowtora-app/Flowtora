"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { FilterChip } from "./FilterChip";

// FilterBar — Spec Page 0 §0.5.43.
//
// Anatomy: Search input + Filter chips area + "+ Add filter" button
// (opens menu of filterable fields) + "Reset" link + "Save view"
// button. Active chips render via FilterChip.
//
// State pattern: controlled. Caller owns the search query and the
// list of active filters; FilterBar just renders + emits intents.
// The "+ Add filter" menu and the per-chip edit popover are
// caller-driven (passed as render-props or rendered separately) —
// keeping FilterBar layout-only avoids hard-coding filter shapes
// across the app.

export interface ActiveFilter {
  id: string;
  field: string;
  operator: string;
  value: React.ReactNode;
}

export interface FilterBarProps {
  /** Search query. */
  query?: string;
  onQueryChange?: (next: string) => void;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
  /** Active filter chips. */
  filters?: ActiveFilter[];
  onEditFilter?: (id: string) => void;
  onRemoveFilter?: (id: string) => void;
  /** Renders an "+ Add filter" trigger when supplied. The caller is
   *  responsible for the menu/popover that picks a field + values. */
  onAddFilter?: () => void;
  /** When supplied, renders a "Reset" link that clears query + filters. */
  onReset?: () => void;
  /** When supplied, renders a "Save view" button. */
  onSaveView?: () => void;
  className?: string;
}

export function FilterBar({
  query = "",
  onQueryChange,
  searchPlaceholder = "Search…",
  filters = [],
  onEditFilter,
  onRemoveFilter,
  onAddFilter,
  onReset,
  onSaveView,
  className,
}: FilterBarProps) {
  const hasAny = !!query || filters.length > 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border p-2",
        className,
      )}
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Search */}
      <div className="relative flex min-w-[220px] flex-1 items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 inline-flex items-center"
          style={{ color: "var(--text-muted)" }}
        >
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          className="ts-focus h-8 w-full rounded-md border bg-transparent pl-7 pr-3 text-[13px] outline-none"
          style={{
            borderColor: "var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </div>

      {/* Active filter chips */}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <FilterChip
              key={f.id}
              field={f.field}
              operator={f.operator}
              value={f.value}
              onEdit={onEditFilter ? () => onEditFilter(f.id) : undefined}
              onRemove={() => onRemoveFilter?.(f.id)}
            />
          ))}
        </div>
      )}

      {/* Add filter */}
      {onAddFilter && (
        <button
          type="button"
          onClick={onAddFilter}
          className="ts-focus inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-default)",
            color: "var(--text-default)",
            borderStyle: "dashed",
          }}
        >
          + Add filter
        </button>
      )}

      {/* Tail actions */}
      <div className="ml-auto flex items-center gap-2">
        {onReset && hasAny && (
          <button
            type="button"
            onClick={onReset}
            className="ts-focus text-[12px] font-medium underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}
          >
            Reset
          </button>
        )}
        {onSaveView && (
          <button
            type="button"
            onClick={onSaveView}
            className="ts-focus inline-flex h-8 items-center rounded-md border px-2.5 text-[12px] font-medium"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            Save view
          </button>
        )}
      </div>
    </div>
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
