"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { RANGE_PRESETS, type RangePreset, type ResolvedRange } from "@/lib/reports";

// Compact range picker for the top of /platform. Preset chips trigger
// a querystring update instead of a full form submit, so the page
// streams the new data in place. "Custom" expands a from/to pair.

const QUICK_PRESETS: RangePreset[] = ["last7", "last30", "last90", "mtd", "qtd", "ytd"];

function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function RangeSelector({ range }: { range: ResolvedRange }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [showCustom, setShowCustom] = React.useState(range.preset === "custom");

  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(sp?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, sp],
  );

  const selectPreset = (preset: RangePreset) => {
    if (preset === "custom") {
      setShowCustom(true);
      push({ range: "custom", from: formatISO(range.from), to: formatISO(range.to) });
      return;
    }
    setShowCustom(false);
    push({ range: preset, from: null, to: null });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Date range"
        className="inline-flex items-center gap-0.5 rounded-full p-1"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
      >
        {QUICK_PRESETS.map((p) => {
          const meta = RANGE_PRESETS.find((r) => r.value === p);
          if (!meta) return null;
          const isActive = range.preset === p;
          return (
            <button
              key={p}
              role="tab"
              aria-selected={isActive}
              onClick={() => selectPreset(p)}
              className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: isActive ? "var(--surface-0)" : "transparent",
                color: isActive ? "var(--text-default)" : "var(--text-muted)",
                boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {meta.label}
            </button>
          );
        })}
        <button
          role="tab"
          aria-selected={range.preset === "custom"}
          onClick={() => selectPreset("custom")}
          className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
          style={{
            background: range.preset === "custom" ? "var(--surface-0)" : "transparent",
            color: range.preset === "custom" ? "var(--text-default)" : "var(--text-muted)",
          }}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            defaultValue={formatISO(range.from)}
            onChange={(e) => push({ range: "custom", from: e.currentTarget.value })}
            className="rounded-md px-2 py-1 text-xs tabular-nums"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            aria-label="From date"
          />
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>→</span>
          <input
            type="date"
            defaultValue={formatISO(range.to)}
            onChange={(e) => push({ range: "custom", to: e.currentTarget.value })}
            className="rounded-md px-2 py-1 text-xs tabular-nums"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            aria-label="To date"
          />
        </div>
      )}
    </div>
  );
}
