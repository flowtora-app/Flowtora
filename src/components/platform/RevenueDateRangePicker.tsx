"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_RANGE, type RangeKey } from "@/lib/revenue-range";

// Pill-style range toggle — drives the page's `?range=` search param
// so the server component re-renders with the new window. Keeps the
// state in the URL so range survives reload + is shareable.
//
// Server-side helpers (resolveRange / resolveRangeKey / ResolvedRange)
// live in `src/lib/revenue-range.ts` so the page (a server component)
// can import them without crossing the client/server boundary.

const OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d",   label: "7d" },
  { key: "30d",  label: "30d" },
  { key: "90d",  label: "90d" },
  { key: "180d", label: "180d" },
  { key: "ytd",  label: "YTD" },
];

export function RevenueDateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("range") as RangeKey | null) ?? DEFAULT_RANGE;

  const select = (next: RangeKey) => {
    const sp = new URLSearchParams(params.toString());
    if (next === DEFAULT_RANGE) sp.delete("range");
    else sp.set("range", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg p-1"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.key === current;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => select(o.key)}
            className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? "var(--accent-primary)" : "transparent",
              color: active ? "var(--accent-fg)" : "var(--text-muted)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
