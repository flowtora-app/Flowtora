"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type CustomerDetailTab =
  | "overview"
  | "work"
  | "contacts"
  | "communication"
  | "tasks"
  | "files"
  | "activity";

export const CUSTOMER_DETAIL_TABS: { value: CustomerDetailTab; label: string }[] = [
  { value: "overview",      label: "Overview" },
  { value: "work",          label: "Work" },
  { value: "contacts",      label: "Contacts" },
  { value: "communication", label: "Communication" },
  { value: "tasks",         label: "Tasks" },
  { value: "files",         label: "Files" },
  { value: "activity",      label: "Activity" },
];

interface CustomerDetailTabsProps {
  active: CustomerDetailTab;
  counts?: Partial<Record<CustomerDetailTab, number>>;
}

export function CustomerDetailTabs({ active, counts }: CustomerDetailTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (tab: CustomerDetailTab) => {
    const params = new URLSearchParams(sp.toString());
    if (tab === "overview") params.delete("tab");
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
      {CUSTOMER_DETAIL_TABS.map((t) => {
        const isActive = t.value === active;
        const n = counts?.[t.value];
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
            {n != null && n > 0 && (
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                style={{
                  background: isActive ? "var(--accent-surface)" : "var(--surface-2)",
                  color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
                }}
              >
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
