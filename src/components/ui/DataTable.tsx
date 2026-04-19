"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { DropdownMenu, type DropdownItem } from "./DropdownMenu";
import { Icon } from "@/components/shell/icons";

// DataTable — shared table primitive for every list page in the app.
//
// Why this exists: every list page (customers, quotes, orders, invoices…)
// rolled its own <table> with near-identical markup, leading to drift —
// some had row links, some had tag chips, none had selection, none had
// bulk actions. This component gives us one shape that handles:
//
//   • Column definitions with aligned headers + sort hints
//   • Row selection with shift-click range and header indeterminate state
//   • Bulk action bar that slides in when rows are selected
//   • Per-row overflow menu (⋯) for contextual actions
//   • Empty/loading states integrated with the existing EmptyState
//   • Comfortable vs compact density (persisted to localStorage)
//
// The component is client-only (needs selection state + density) but
// accepts pre-rendered cell content via column.cell(row) so callers
// keep full control of presentation. Rows can include arbitrary data —
// only `id` is required for selection.

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  width?: string | number;
  align?: "left" | "right" | "center";
  /** Hide at narrow breakpoints — uses Tailwind md: guard. */
  hideBelow?: "md" | "lg";
  /** Show a sort arrow. The actual sort state comes from the URL. */
  sortKey?: string;
};

export interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: DataTableColumn<T>[];
  /** Optional link per-row — wraps the first cell in a Link. */
  rowHref?: (row: T) => string;
  /** Optional row-level actions rendered as a ⋯ overflow menu. */
  rowActions?: (row: T) => DropdownItem[];
  /** Hide selection UI when true (read-only listings). */
  selectable?: boolean;
  /** Render the bulk action bar content when rows are selected. */
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  /** Current density. When omitted, reads from localStorage + falls back to comfortable. */
  density?: "comfortable" | "compact";
  /** Shown when rows is empty. Callers typically pass an <EmptyState />. */
  empty?: React.ReactNode;
  /** Shown above the rows while a transition is pending. */
  loading?: boolean;
  /** Storage key for the density toggle, so each entity remembers its own. */
  densityKey?: string;
  /** Remove the outer Card shell — useful when nested inside Tabs etc. */
  bare?: boolean;
  /** sr-only label for the table. */
  caption?: string;
}

const DENSITY_KEY_PREFIX = "ts.table.density.";

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  rowHref,
  rowActions,
  selectable = false,
  bulkActions,
  density: densityProp,
  empty,
  loading = false,
  densityKey,
  bare = false,
  caption,
}: DataTableProps<T>) {
  // ── Density (localStorage-backed) ──
  const [density, setDensity] = React.useState<"comfortable" | "compact">(
    densityProp ?? "comfortable",
  );
  React.useEffect(() => {
    if (densityProp || !densityKey) return;
    try {
      const saved = localStorage.getItem(DENSITY_KEY_PREFIX + densityKey);
      if (saved === "comfortable" || saved === "compact") setDensity(saved);
    } catch {}
  }, [densityProp, densityKey]);
  const setAndPersistDensity = (d: "comfortable" | "compact") => {
    setDensity(d);
    if (densityKey) {
      try {
        localStorage.setItem(DENSITY_KEY_PREFIX + densityKey, d);
      } catch {}
    }
  };

  // ── Selection ──
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const lastClickedRef = React.useRef<string | null>(null);

  // Drop selection for rows that have disappeared (filtered/deleted).
  React.useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      const ids = new Set(rows.map((r) => r.id));
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id: string, shiftKey: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedRef.current && lastClickedRef.current !== id) {
        const ids = rows.map((r) => r.id);
        const from = ids.indexOf(lastClickedRef.current);
        const to = ids.indexOf(id);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          const target = !prev.has(id);
          for (let i = lo; i <= hi; i++) {
            if (target) next.add(ids[i]);
            else next.delete(ids[i]);
          }
          lastClickedRef.current = id;
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      lastClickedRef.current = id;
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (rows.length > 0 && rows.every((r) => prev.has(r.id))) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  const clear = React.useCallback(() => setSelected(new Set()), []);

  // ── Render ──
  const cellPadY = density === "compact" ? "py-2" : "py-3";
  const cellPadX = "px-4";

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    bare ? (
      <div>{children}</div>
    ) : (
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {children}
      </div>
    );

  return (
    <div className="relative">
      {/* Bulk action bar ─ slides in over the table header when rows
          are selected. Keeps the table still; we don't push rows down. */}
      {selectable && selected.size > 0 && bulkActions && (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            background: "var(--accent-surface)",
            border: "1px solid var(--accent-primary)",
            color: "var(--text-default)",
          }}
          role="toolbar"
          aria-label="Bulk actions"
        >
          <strong style={{ color: "var(--accent-primary)" }}>
            {selected.size} selected
          </strong>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <button
            type="button"
            onClick={clear}
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            {bulkActions(Array.from(selected), clear)}
          </div>
        </div>
      )}

      <Shell>
        <div
          className={cn(
            "relative overflow-x-auto",
            loading && "opacity-60",
          )}
        >
          <table className="w-full text-sm">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr
                className="text-left"
                style={{
                  color: "var(--text-muted)",
                  background: "var(--surface-1)",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                {selectable && (
                  <th className="px-4 py-2.5" style={{ width: 36 }}>
                    <CheckboxCell
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                      aria-label="Select all rows"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.hideBelow === "md" && "hidden md:table-cell",
                      col.hideBelow === "lg" && "hidden lg:table-cell",
                    )}
                    style={{ width: col.width, color: "var(--text-faint)" }}
                  >
                    {col.header}
                  </th>
                ))}
                {rowActions && <th className="px-2 py-2.5" style={{ width: 40 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      columns.length +
                      (selectable ? 1 : 0) +
                      (rowActions ? 1 : 0)
                    }
                    className="p-0"
                  >
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSelected = selected.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "transition-colors",
                        "hover:bg-[color:var(--surface-2)]",
                        isSelected && "bg-[color:var(--accent-surface)]",
                      )}
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      {selectable && (
                        <td className={cn(cellPadX, cellPadY)} style={{ width: 36 }}>
                          <CheckboxCell
                            checked={isSelected}
                            onChange={(_c, shiftKey) => toggleOne(row.id, shiftKey)}
                            aria-label="Select row"
                          />
                        </td>
                      )}
                      {columns.map((col, idx) => {
                        const content = col.cell(row);
                        const isFirstCell = idx === 0;
                        const wrapped =
                          isFirstCell && rowHref ? (
                            <Link
                              href={rowHref(row)}
                              className="block hover:underline"
                              style={{ color: "var(--text-default)" }}
                            >
                              {content}
                            </Link>
                          ) : (
                            content
                          );
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              cellPadX,
                              cellPadY,
                              col.align === "right" && "text-right",
                              col.align === "center" && "text-center",
                              col.hideBelow === "md" && "hidden md:table-cell",
                              col.hideBelow === "lg" && "hidden lg:table-cell",
                            )}
                            style={{ color: "var(--text-default)" }}
                          >
                            {wrapped}
                          </td>
                        );
                      })}
                      {rowActions && (
                        <td className={cn("px-2", cellPadY)} style={{ width: 40 }}>
                          <DropdownMenu
                            align="end"
                            width={200}
                            items={rowActions(row)}
                            trigger={
                              <button
                                type="button"
                                aria-label="Row actions"
                                className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md"
                                style={{
                                  color: "var(--text-muted)",
                                  background: "transparent",
                                }}
                              >
                                <Icon.ChevronDown size={14} />
                              </button>
                            }
                          />
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Density toggle sits in the footer so it doesn't fight the
            bulk action bar for space at the top. */}
        {(densityKey || !densityProp) && rows.length > 0 && (
          <div
            className="flex items-center justify-between px-3 py-2 text-[11px]"
            style={{
              borderTop: "1px solid var(--border-subtle)",
              color: "var(--text-faint)",
              background: "var(--surface-1)",
            }}
          >
            <span>
              {rows.length} {rows.length === 1 ? "row" : "rows"}
            </span>
            <div className="flex items-center gap-1">
              <span style={{ color: "var(--text-faint)" }}>Density</span>
              <button
                type="button"
                onClick={() => setAndPersistDensity("comfortable")}
                aria-pressed={density === "comfortable"}
                className="ts-focus rounded px-1.5 py-0.5"
                style={{
                  color:
                    density === "comfortable"
                      ? "var(--text-default)"
                      : "var(--text-muted)",
                  background:
                    density === "comfortable"
                      ? "var(--surface-3)"
                      : "transparent",
                }}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => setAndPersistDensity("compact")}
                aria-pressed={density === "compact"}
                className="ts-focus rounded px-1.5 py-0.5"
                style={{
                  color:
                    density === "compact"
                      ? "var(--text-default)"
                      : "var(--text-muted)",
                  background:
                    density === "compact"
                      ? "var(--surface-3)"
                      : "transparent",
                }}
              >
                Compact
              </button>
            </div>
          </div>
        )}
      </Shell>
    </div>
  );
}

// ── Checkbox primitive ───────────────────────────────────────────
// A controlled checkbox with an indeterminate visual. We inline this
// instead of shipping another file because it's only useful inside the
// table; extracting it would just add indirection.

function CheckboxCell({
  checked,
  indeterminate,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean, shiftKey: boolean) => void;
  "aria-label": string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <label
      className="relative inline-flex h-4 w-4 items-center justify-center"
      style={{ cursor: "pointer" }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          onChange(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)
        }
        aria-label={ariaLabel}
        className="ts-focus h-4 w-4 cursor-pointer appearance-none rounded-sm"
        style={{
          background: checked || indeterminate ? "var(--accent-primary)" : "var(--surface-0)",
          border: `1px solid ${
            checked || indeterminate ? "var(--accent-primary)" : "var(--border-default)"
          }`,
        }}
      />
      {/* Tick / dash overlay */}
      {(checked || indeterminate) && (
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="pointer-events-none absolute"
          style={{ color: "var(--accent-fg)" }}
        >
          {indeterminate && !checked ? (
            <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path
              d="M2 5.5L4 7.5 8 3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </svg>
      )}
    </label>
  );
}
