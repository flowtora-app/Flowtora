"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Pill chips above the search row that one-click filter the table.
// Driven by the same `?status=` URL param as the form select; the
// chip just sets/clears it. Keeping URL state keeps every filter
// shareable via copy-paste.

export interface QuickFilterChip {
  /** Status value to set (or "ALL" to clear). */
  value: string;
  label: string;
  /** Live count shown in the chip; 0 dims it. */
  count: number;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}

const TONE: Record<NonNullable<QuickFilterChip["tone"]>, { activeBg: string; activeFg: string; idleFg: string }> = {
  default: { activeBg: "var(--accent-primary)",   activeFg: "var(--accent-fg)",  idleFg: "var(--text-default)" },
  accent:  { activeBg: "var(--accent-primary)",   activeFg: "var(--accent-fg)",  idleFg: "var(--accent-primary)" },
  success: { activeBg: "var(--success-fg)",       activeFg: "var(--text-inverse)", idleFg: "var(--success-fg)"   },
  warning: { activeBg: "var(--warning-fg)",       activeFg: "var(--text-inverse)", idleFg: "var(--warning-fg)"   },
  danger:  { activeBg: "var(--danger-fg)",        activeFg: "var(--text-inverse)", idleFg: "var(--danger-fg)"    },
};

export function TenantsQuickFilters({ chips }: { chips: QuickFilterChip[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("status") ?? "ALL").toUpperCase();

  const select = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "ALL") sp.delete("status");
    else sp.set("status", next);
    // Clear pagination cursor whenever filters change.
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => {
        const active = c.value === current;
        const dim = c.count === 0 && !active;
        const palette = TONE[c.tone ?? "default"];
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => select(c.value)}
            className="ts-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? palette.activeBg : "var(--surface-1)",
              color: active ? palette.activeFg : palette.idleFg,
              border: `1px solid ${active ? palette.activeBg : "var(--border-default)"}`,
              opacity: dim ? 0.6 : 1,
            }}
          >
            {c.label}
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
              style={{
                background: active ? "rgba(0,0,0,0.18)" : "var(--surface-2)",
                color: active ? palette.activeFg : "var(--text-muted)",
              }}
            >
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
