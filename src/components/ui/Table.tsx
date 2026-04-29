"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Table — Spec Page 0 §0.5.20.
//
// Anatomy: Toolbar (search + filters + view + columns + density +
// export) → Header (sticky, sortable, optional column filter
// popover) → Body rows (selectable, expandable, hoverable) → Footer
// (pagination + bulk action bar when selected).
//
// Header: uppercase overline 11px, bg-subtle, 40px height, sort
// indicator. Row: 44px (comfortable) / 36px (compact). Selected row:
// surface-accent bg + left brand accent bar. Striped variant
// available. Sticky first column for wide tables.
//
// This is the design-system Table primitive. The existing DataTable
// (much more elaborate) keeps its semantics for legacy consumers; new
// pages should reach for this primitive when the table fits a small,
// declarative column model.

export type Density = "comfortable" | "compact";
export type SortDir = "asc" | "desc";
export type CellAlign = "left" | "right" | "center";
export type CellKind = "text" | "number" | "money" | "date" | "node";

export interface ColumnDef<T> {
  /** Stable key — also used as React key when no `id` is set. */
  key: string;
  header: React.ReactNode;
  /** Cell renderer. */
  cell: (row: T) => React.ReactNode;
  /** Sortable; clicking the header toggles asc/desc/off. */
  sortable?: boolean;
  /** Right-align numerics, money, dates by default. */
  align?: CellAlign;
  /** Affects default alignment + tabular-nums. */
  kind?: CellKind;
  /** Fixed width or auto. */
  width?: string | number;
  /** Sticky positioning — left for the first column, right for trailing actions. */
  sticky?: "left" | "right";
}

export interface TableProps<T> {
  rows: T[];
  columns: ColumnDef<T>[];
  /** Stable id resolver — defaults to `row.id` when present. */
  rowId?: (row: T) => string;
  /** Toggle the entire row's clickability with a single handler. */
  onRowClick?: (row: T) => void;
  /** Highlight rows whose id is in this set. */
  selected?: Set<string>;
  onToggleSelected?: (id: string, selected: boolean) => void;
  onToggleAll?: (selected: boolean) => void;
  /** Active sort. Caller drives — controlled. */
  sort?: { key: string; dir: SortDir } | null;
  onSortChange?: (next: { key: string; dir: SortDir } | null) => void;
  density?: Density;
  /** Striped row backgrounds. */
  striped?: boolean;
  /** Sticky table header (default true). */
  stickyHeader?: boolean;
  /** Empty state slot. */
  empty?: React.ReactNode;
  /** Loading replaces body with skeleton rows (10 per spec §0.5.20). */
  loading?: boolean;
  /** Row expansion. When provided, each row gets a chevron prefix and
   *  toggling reveals the rendered detail under the row. */
  expand?: {
    isExpanded: (id: string) => boolean;
    onToggle: (id: string) => void;
    render: (row: T) => React.ReactNode;
  };
  className?: string;
}

const ROW_HEIGHT: Record<Density, number> = { comfortable: 44, compact: 36 };
const HEAD_HEIGHT = 40;

export function Table<T>({
  rows,
  columns,
  rowId,
  onRowClick,
  selected,
  onToggleSelected,
  onToggleAll,
  sort = null,
  onSortChange,
  density = "comfortable",
  striped,
  stickyHeader = true,
  empty,
  loading,
  expand,
  className,
}: TableProps<T>) {
  const getId = React.useCallback(
    (row: T): string => rowId ? rowId(row) : String((row as { id?: string }).id ?? ""),
    [rowId],
  );

  const rowH = ROW_HEIGHT[density];
  const allChecked = !!selected && rows.length > 0 && rows.every((r) => selected.has(getId(r)));
  const someChecked = !!selected && rows.some((r) => selected.has(getId(r))) && !allChecked;

  const onHeaderClick = (col: ColumnDef<T>) => {
    if (!col.sortable || !onSortChange) return;
    if (!sort || sort.key !== col.key) onSortChange({ key: col.key, dir: "asc" });
    else if (sort.dir === "asc") onSortChange({ key: col.key, dir: "desc" });
    else onSortChange(null);
  };

  return (
    <div className={cn("overflow-hidden rounded-lg border", className)} style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ height: HEAD_HEIGHT, background: "var(--surface-2)", position: stickyHeader ? "sticky" : undefined, top: stickyHeader ? 0 : undefined, zIndex: 1 }}>
              {selected && (
                <th
                  style={{ width: 40, textAlign: "center", padding: "0 8px", borderBottom: "1px solid var(--border-subtle)" }}
                  scope="col"
                >
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked; }}
                    onChange={(e) => onToggleAll?.(e.target.checked)}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {expand && (
                <th style={{ width: 36, padding: "0 8px", borderBottom: "1px solid var(--border-subtle)" }} aria-hidden />
              )}
              {columns.map((col) => {
                const align = col.align ?? defaultAlign(col.kind);
                const isSorted = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                    onClick={col.sortable ? () => onHeaderClick(col) : undefined}
                    style={{
                      width: col.width,
                      textAlign: align,
                      padding: "0 16px",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: col.sortable ? "pointer" : "default",
                      position: col.sticky === "left" ? "sticky" : undefined,
                      left: col.sticky === "left" ? 0 : undefined,
                      right: col.sticky === "right" ? 0 : undefined,
                      background: col.sticky ? "var(--surface-2)" : undefined,
                      userSelect: col.sortable ? "none" : undefined,
                    }}
                  >
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {col.header}
                      {col.sortable && (
                        <SortIcon active={isSorted} dir={isSorted ? sort?.dir : undefined} />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} style={{ height: rowH }}>
                  {selected && <td style={{ borderBottom: "1px solid var(--border-subtle)" }} />}
                  {expand && <td style={{ borderBottom: "1px solid var(--border-subtle)" }} />}
                  {columns.map((col) => (
                    <td key={col.key} style={{ padding: "0 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <span className="inline-block h-3 w-3/4 animate-pulse rounded" style={{ background: "var(--surface-3)" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selected ? 1 : 0) + (expand ? 1 : 0)}
                  style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-muted)" }}
                >
                  {empty ?? "No results"}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const id = getId(row);
                const isSel = !!selected?.has(id);
                const isExp = expand?.isExpanded(id) ?? false;
                const stripeBg = striped && i % 2 === 1 ? "var(--surface-2)" : undefined;
                return (
                  <React.Fragment key={id || i}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      style={{
                        height: rowH,
                        background: isSel
                          ? "var(--brand-50, var(--accent-surface))"
                          : stripeBg ?? "transparent",
                        cursor: onRowClick ? "pointer" : undefined,
                        position: "relative",
                      }}
                      className="hover:bg-[var(--surface-2)]"
                    >
                      {/* Selected accent bar (left) */}
                      {isSel && (
                        <td
                          aria-hidden
                          style={{
                            position: "sticky",
                            left: 0,
                            width: 0,
                            padding: 0,
                            background: "transparent",
                            borderLeft: "3px solid var(--brand-600, var(--accent-primary))",
                          }}
                        />
                      )}
                      {selected && (
                        <td
                          style={{ width: 40, textAlign: "center", padding: "0 8px", borderBottom: "1px solid var(--border-subtle)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={(e) => onToggleSelected?.(id, e.target.checked)}
                            aria-label="Select row"
                          />
                        </td>
                      )}
                      {expand && (
                        <td
                          style={{ width: 36, textAlign: "center", padding: "0 8px", borderBottom: "1px solid var(--border-subtle)" }}
                          onClick={(e) => { e.stopPropagation(); expand.onToggle(id); }}
                        >
                          <button
                            type="button"
                            aria-expanded={isExp}
                            aria-label="Toggle row"
                            className="ts-focus inline-flex h-5 w-5 items-center justify-center transition-transform"
                            style={{ transform: isExp ? "rotate(90deg)" : "rotate(0deg)", color: "var(--text-muted)" }}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="4,2 7,5 4,8" /></svg>
                          </button>
                        </td>
                      )}
                      {columns.map((col) => {
                        const align = col.align ?? defaultAlign(col.kind);
                        const tabular = col.kind === "number" || col.kind === "money" || col.kind === "date";
                        return (
                          <td
                            key={col.key}
                            style={{
                              padding: "0 16px",
                              textAlign: align,
                              borderBottom: "1px solid var(--border-subtle)",
                              fontVariantNumeric: tabular ? "tabular-nums" : undefined,
                              color: "var(--text-default)",
                              position: col.sticky === "left" ? "sticky" : undefined,
                              left: col.sticky === "left" ? 0 : undefined,
                              right: col.sticky === "right" ? 0 : undefined,
                              background: col.sticky ? "inherit" : undefined,
                            }}
                          >
                            {col.cell(row)}
                          </td>
                        );
                      })}
                    </tr>
                    {expand && isExp && (
                      <tr style={{ background: "var(--surface-2)" }}>
                        <td colSpan={columns.length + 1 + (selected ? 1 : 0)} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                          {expand.render(row)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function defaultAlign(kind?: CellKind): CellAlign {
  if (kind === "number" || kind === "money") return "right";
  return "left";
}

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ color: active ? "var(--text-default)" : "var(--text-faint)" }}>
      <polyline points="3,4 5,2 7,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={active && dir === "desc" ? 0.3 : 1} />
      <polyline points="3,6 5,8 7,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={active && dir === "asc" ? 0.3 : 1} />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Bulk action bar — appears when rows are selected.            */
/* ────────────────────────────────────────────────────────────── */

export interface TableBulkBarProps {
  selectedCount: number;
  totalCount: number;
  /** Children render the bulk actions (Buttons etc.). */
  children?: React.ReactNode;
  onClearSelection?: () => void;
  /** "Select all matching filter" CTA per spec §0.5.20. */
  onSelectAllMatching?: () => void;
  selectAllLabel?: string;
  className?: string;
}

export function TableBulkBar({
  selectedCount,
  totalCount,
  children,
  onClearSelection,
  onSelectAllMatching,
  selectAllLabel,
  className,
}: TableBulkBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-[13px]", className)}
      style={{
        background: "var(--brand-50, var(--accent-surface))",
        borderColor: "var(--brand-200, var(--accent-primary))",
        color: "var(--brand-800, var(--accent-primary))",
      }}
    >
      <span className="font-semibold">{selectedCount} selected</span>
      {onSelectAllMatching && selectedCount < totalCount && (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="ts-focus text-[12px] underline-offset-2 hover:underline"
        >
          {selectAllLabel ?? `Select all ${totalCount} matching`}
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            aria-label="Clear selection"
            className="ts-focus text-[12px]"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
