"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Pagination — Spec Page 0 §0.5.21.
//
// Variants:
//   numbered      — 1 2 3 ... N (default)
//   prev-next     — "X-Y of Z" with prev/next buttons
//   load-more     — single button "Load more" (cursor-style append)
// Per-page selector: 10/25/50/100/250.
// Jump-to-page input shown when total pages > jumpThreshold (default 20).
// Server-side support is mandatory for >1000 rows — callers use
// `onPageChange` to drive their own paged fetch.
//
// State pattern: controlled. Caller owns `page` + `pageSize` and
// receives change events. Uncontrolled mode is intentionally not
// supported; pagination should always be reflected in the URL.

type Variant = "numbered" | "prev-next" | "load-more";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250] as const;

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  variant?: Variant;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Show the per-page select. Default true except for load-more. */
  showPageSize?: boolean;
  /** Show jump-to-page input when total pages exceeds this. Default 20. */
  jumpThreshold?: number;
  /** "Load more" callback. Defaults to onPageChange(page+1). */
  onLoadMore?: () => void;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  variant = "numbered",
  onPageChange,
  onPageSizeChange,
  showPageSize,
  jumpThreshold = 20,
  onLoadMore,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  const showSize = (showPageSize ?? variant !== "load-more") && !!onPageSizeChange;

  if (variant === "load-more") {
    const hasMore = end < total;
    return (
      <div className={cn("flex flex-col items-center gap-2 py-2", className)}>
        <button
          type="button"
          onClick={() => (onLoadMore ? onLoadMore() : onPageChange(page + 1))}
          disabled={!hasMore}
          className="ts-focus rounded-md border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-default)",
            color: "var(--text-default)",
          }}
        >
          {hasMore ? "Load more" : "No more results"}
        </button>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {fmtRange(start, end, total)}
        </div>
      </div>
    );
  }

  if (variant === "prev-next") {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {fmtRange(start, end, total)}
        </div>
        <div className="flex items-center gap-2">
          {showSize && <PageSizeSelect pageSize={pageSize} onChange={onPageSizeChange!} />}
          <NavButton onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            ← Prev
          </NavButton>
          <NavButton onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Next →
          </NavButton>
        </div>
      </div>
    );
  }

  // numbered (default)
  const pageList = buildPageList(page, totalPages);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {fmtRange(start, end, total)}
      </div>
      <div className="flex items-center gap-2">
        {showSize && <PageSizeSelect pageSize={pageSize} onChange={onPageSizeChange!} />}
        {totalPages > jumpThreshold && (
          <JumpToPage current={page} total={totalPages} onChange={onPageChange} />
        )}
        <nav role="navigation" aria-label="Pagination" className="flex items-center gap-1">
          <NavButton onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ←
          </NavButton>
          {pageList.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-2 text-sm" style={{ color: "var(--text-faint)" }}>
                …
              </span>
            ) : (
              <PageNumber
                key={p}
                value={p}
                active={p === page}
                onClick={() => onPageChange(p)}
              />
            ),
          )}
          <NavButton onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
            →
          </NavButton>
        </nav>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function fmtRange(start: number, end: number, total: number): string {
  if (total === 0) return "No results";
  return `${start}–${end} of ${total.toLocaleString()}`;
}

function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push("…");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("…");
  out.push(total);
  return out;
}

function PageSizeSelect({
  pageSize,
  onChange,
}: {
  pageSize: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span>Per page</span>
      <select
        value={pageSize}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ts-focus rounded-md border px-2 py-1 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-default)",
          color: "var(--text-default)",
        }}
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

function JumpToPage({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const [value, setValue] = React.useState(String(current));
  React.useEffect(() => setValue(String(current)), [current]);

  const submit = () => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= total) onChange(n);
    else setValue(String(current));
  };

  return (
    <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span>Go to</span>
      <input
        type="number"
        min={1}
        max={total}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        className="ts-focus w-14 rounded-md border px-2 py-1 text-center text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      <span>/ {total}</span>
    </label>
  );
}

function NavButton({
  onClick,
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ts-focus inline-flex h-8 items-center rounded-md border px-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-default)",
        color: "var(--text-default)",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function PageNumber({
  value,
  active,
  onClick,
}: {
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className="ts-focus inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md text-sm font-medium tabular-nums transition-colors"
      style={
        active
          ? {
              background: "var(--brand-600, var(--accent-primary))",
              color: "#ffffff",
              border: "1px solid var(--brand-600, var(--accent-primary))",
            }
          : {
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }
      }
    >
      {value}
    </button>
  );
}
