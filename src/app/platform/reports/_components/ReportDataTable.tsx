"use client";

import * as React from "react";

// ReportDataTable — sortable, header-click data table used on every
// report detail page below the chart. Column-click toggles ascending /
// descending / off; numbers right-align with tabular-nums; strings
// left-align. Row cap of 250 rendered (full set still available via
// CSV/JSON export).

export type DataRow = { [k: string]: string | number | null };

export function ReportDataTable({ rows }: { rows: DataRow[] }) {
  const columns = React.useMemo(
    () => Array.from(new Set(rows.flatMap((r) => Object.keys(r)))),
    [rows],
  );
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      let cmp = 0;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        No rows — try widening the filter window.
      </div>
    );
  }

  const onHeaderClick = (col: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== col) return { key: col, dir: "asc" };
      if (prev.dir === "asc") return { key: col, dir: "desc" };
      return null; // third click clears
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {columns.map((c) => {
              const isSorted = sort?.key === c;
              const arrow = isSorted ? (sort!.dir === "asc" ? "↑" : "↓") : "";
              return (
                <th
                  key={c}
                  onClick={() => onHeaderClick(c)}
                  className="ts-focus cursor-pointer select-none px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide hover:bg-[var(--surface-3)]"
                  style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}
                >
                  {humanize(c)}
                  {arrow && <span className="ml-1" style={{ color: "var(--text-default)" }}>{arrow}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 250).map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {columns.map((c) => {
                const v = r[c];
                const isNum = typeof v === "number";
                return (
                  <td
                    key={c}
                    className={`px-3 py-1.5 ${isNum ? "text-right font-mono tabular-nums" : ""}`}
                    style={{ color: "var(--text-default)" }}
                  >
                    {v == null ? <span style={{ color: "var(--text-faint)" }}>—</span> : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 250 && (
        <div className="px-3 py-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
          Showing 250 of {sorted.length.toLocaleString()} rows. Export CSV for the full set.
        </div>
      )}
    </div>
  );
}

function humanize(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ");
}
