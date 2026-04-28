"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Page-based pagination for the tenants table. URL state via ?page=N
// (1-indexed; absent = page 1). Clicking prev/next pushes to the
// new page and the server component re-renders with the next slice.

interface TenantsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function TenantsPagination({ page, pageSize, total }: TenantsPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  const go = (next: number) => {
    const sp = new URLSearchParams(params.toString());
    if (next <= 1) sp.delete("page");
    else sp.set("page", String(next));
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      className="flex items-center justify-between px-4 py-3 text-xs"
      style={{
        color: "var(--text-muted)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <span>
        Showing <span style={{ color: "var(--text-default)" }} className="tabular-nums">{start.toLocaleString()}–{end.toLocaleString()}</span>{" "}
        of <span style={{ color: "var(--text-default)" }} className="tabular-nums">{total.toLocaleString()}</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
          className="ts-focus inline-flex items-center rounded-md px-2.5 py-1 transition-colors"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: page <= 1 ? "var(--text-faint)" : "var(--text-default)",
            cursor: page <= 1 ? "not-allowed" : "pointer",
            opacity: page <= 1 ? 0.55 : 1,
          }}
        >
          ← Previous
        </button>
        <span className="tabular-nums">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
          className="ts-focus inline-flex items-center rounded-md px-2.5 py-1 transition-colors"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: page >= pageCount ? "var(--text-faint)" : "var(--text-default)",
            cursor: page >= pageCount ? "not-allowed" : "pointer",
            opacity: page >= pageCount ? 0.55 : 1,
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
