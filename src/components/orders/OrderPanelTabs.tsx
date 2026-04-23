"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type OrderPanelTab =
  | "overview"
  | "production"
  | "invoicing"
  | "comments"
  | "activity";

export const ORDER_PANEL_TABS: { value: OrderPanelTab; label: string }[] = [
  { value: "overview",   label: "Overview"   },
  { value: "production", label: "Production" },
  { value: "invoicing",  label: "Invoicing"  },
  { value: "comments",   label: "Comments"   },
  { value: "activity",   label: "Activity"   },
];

interface OrderPanelTabsProps {
  active: OrderPanelTab;
}

/**
 * Tab switcher for the right-side order panel. State lives in the `?tab=`
 * query param so deep links preserve which tab was open. Swapping tabs is a
 * `router.push` with scroll:false so the panel itself doesn't jump.
 */
export function OrderPanelTabs({ active }: OrderPanelTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (tab: OrderPanelTab) => {
    const params = new URLSearchParams(sp.toString());
    if (tab === "overview") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <div
      className="flex gap-0 overflow-x-auto"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
      role="tablist"
    >
      {ORDER_PANEL_TABS.map((t) => {
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
