"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Phase 5 (transformation) — 7 tabs collapsed to 3.
//
// Old:  details | production | proofs | install | tasks | billing | activity
// New:  work    | money      | conversation
//
// • Work — everything about getting the physical thing made and
//   delivered. Combines the old details / production / proofs /
//   install / tasks sections into one scrollable column (each section
//   is still its own card, just no longer hidden behind a sub-tab).
// • Money — invoices, deposit status, expenses, and per-job profit.
// • Conversation — status timeline, outbound message composer, and
//   the full comment thread.
//
// We still accept the old query values (?tab=production, ?tab=proofs,
// etc.) and map them to the new tab — bookmarks, cross-links from
// server-action redirects, and emails that linked to the old tabs all
// keep working.

export type OrderDetailTab = "work" | "money" | "conversation";

export type OrderDetailLegacyTab =
  | "details"
  | "production"
  | "proofs"
  | "install"
  | "tasks"
  | "billing"
  | "activity";

export const ORDER_DETAIL_TABS: {
  value: OrderDetailTab;
  label: string;
  blurb: string;
}[] = [
  { value: "work",         label: "Work",         blurb: "Specs, proofs, production, install, tasks" },
  { value: "money",        label: "Money",        blurb: "Invoices, expenses, profit" },
  { value: "conversation", label: "Conversation", blurb: "Timeline, comments, customer updates" },
];

// Map a legacy tab query value (from old bookmarks / old redirects /
// old emails) to the new 3-tab world. Non-legacy values pass through
// the public `parseOrderDetailTab` helper which lives in the server
// page (it can't be exported from this "use client" file).
export function mapLegacyTab(raw: string | undefined): OrderDetailTab {
  switch (raw) {
    case "money":
    case "billing":
      return "money";
    case "conversation":
    case "activity":
      return "conversation";
    case "work":
    case "details":
    case "production":
    case "proofs":
    case "install":
    case "tasks":
    default:
      return "work";
  }
}

interface OrderDetailTabsProps {
  active: OrderDetailTab;
  counts?: Partial<Record<OrderDetailTab, number>>;
}

export function OrderDetailTabs({ active, counts }: OrderDetailTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const go = (tab: OrderDetailTab) => {
    const params = new URLSearchParams(sp.toString());
    if (tab === "work") params.delete("tab");
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
      {ORDER_DETAIL_TABS.map((t) => {
        const isActive = t.value === active;
        const n = counts?.[t.value];
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => go(t.value)}
            title={t.blurb}
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
