// Tabs strip — Board · List · Roadmap · Submitted.

import Link from "next/link";
import type { FeatureRequestTab } from "@/server/platform/feature-requests";

const TABS: { key: FeatureRequestTab; label: string }[] = [
  { key: "board",     label: "Board" },
  { key: "list",      label: "List" },
  { key: "roadmap",   label: "Roadmap timeline" },
  { key: "submitted", label: "Submitted" },
];

export function TabsBar({
  active,
  hrefFor,
  submittedCount,
}: {
  active: FeatureRequestTab;
  hrefFor: (tab: FeatureRequestTab) => string;
  submittedCount: number;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-lg border p-1"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {TABS.map((t) => {
        const selected = active === t.key;
        const showCount = t.key === "submitted" && submittedCount > 0;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            className="ts-focus flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors"
            style={{
              background: selected ? "var(--surface-2)" : "transparent",
              color: selected ? "var(--text-default)" : "var(--text-muted)",
            }}
            aria-current={selected ? "page" : undefined}
          >
            {t.label}
            {showCount && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{
                  background: "var(--warning-surface)",
                  color: "var(--warning-fg)",
                }}
              >
                {submittedCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
