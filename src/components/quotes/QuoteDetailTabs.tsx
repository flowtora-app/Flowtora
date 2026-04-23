"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type QuoteDetailTab =
  | "details"
  | "pricing"
  | "notes"
  | "sharing"
  | "activity";

export const QUOTE_DETAIL_TABS: { value: QuoteDetailTab; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "pricing", label: "Pricing" },
  { value: "notes", label: "Notes" },
  { value: "sharing", label: "Sharing" },
  { value: "activity", label: "Activity" },
];

interface QuoteDetailTabsProps {
  active: QuoteDetailTab;
}

export function QuoteDetailTabs({ active }: QuoteDetailTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (tab: QuoteDetailTab) => {
    const params = new URLSearchParams(sp.toString());
    if (tab === "details") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <div
      role="tablist"
      className="flex gap-0 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      {QUOTE_DETAIL_TABS.map((t) => {
        const isActive = t.value === active;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => go(t.value)}
            className="shrink-0 px-4 py-2.5 text-sm transition-colors"
            style={{
              color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
              fontWeight: isActive ? 600 : 500,
              borderBottom: isActive
                ? "2px solid var(--accent-primary)"
                : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
