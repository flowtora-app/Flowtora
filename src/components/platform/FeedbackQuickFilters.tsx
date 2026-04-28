"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Pill-chip filter rows for the feedback board. Used twice on the
// page — once for status, once for kind. Each chip toggles its URL
// param ?status= or ?kind= and clears any pagination so filtering
// doesn't strand the user on a stale page number.

export type FeedbackChipParamKey = "status" | "kind";

export interface FeedbackChip {
  /** Raw value for the URL param. Empty / "ALL" clears the param. */
  value: string;
  label: string;
  count?: number;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}

export function FeedbackQuickFilters({
  paramKey,
  chips,
  defaultValue = "ALL",
}: {
  paramKey: FeedbackChipParamKey;
  chips: FeedbackChip[];
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get(paramKey) ?? defaultValue).toUpperCase();

  const select = (next: string) => {
    const sp = new URLSearchParams(params.toString());
    if (next === defaultValue || next === "") sp.delete(paramKey);
    else sp.set(paramKey, next);
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => {
        const active = c.value.toUpperCase() === current;
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
              color:      active ? palette.activeFg : palette.idleFg,
              border: `1px solid ${active ? palette.activeBg : "var(--border-default)"}`,
              opacity: dim ? 0.6 : 1,
            }}
          >
            {c.label}
            {typeof c.count === "number" && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
                style={{
                  background: active ? "rgba(0,0,0,0.18)" : "var(--surface-2)",
                  color:      active ? palette.activeFg : "var(--text-muted)",
                }}
              >
                {c.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const TONE: Record<NonNullable<FeedbackChip["tone"]>, { activeBg: string; activeFg: string; idleFg: string }> = {
  default: { activeBg: "var(--accent-primary)", activeFg: "var(--accent-fg)",    idleFg: "var(--text-default)"  },
  accent:  { activeBg: "var(--accent-primary)", activeFg: "var(--accent-fg)",    idleFg: "var(--accent-primary)" },
  success: { activeBg: "var(--success-fg)",     activeFg: "var(--text-inverse)", idleFg: "var(--success-fg)"    },
  warning: { activeBg: "var(--warning-fg)",     activeFg: "var(--text-inverse)", idleFg: "var(--warning-fg)"    },
  danger:  { activeBg: "var(--danger-fg)",      activeFg: "var(--text-inverse)", idleFg: "var(--danger-fg)"     },
};
