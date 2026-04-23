"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type InvoicePanelTab = "overview" | "payments" | "activity";

export const INVOICE_PANEL_TABS: { value: InvoicePanelTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "payments", label: "Payments" },
  { value: "activity", label: "Activity" },
];

interface InvoicePanelTabsProps {
  active: InvoicePanelTab;
}

export function InvoicePanelTabs({ active }: InvoicePanelTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (tab: InvoicePanelTab) => {
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
      {INVOICE_PANEL_TABS.map((t) => {
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
