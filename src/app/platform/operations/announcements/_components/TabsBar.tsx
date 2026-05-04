// Tabs strip — All · Drafts · Scheduled · Live · Archived · Changelog · Templates.

import Link from "next/link";
import type { AnnouncementTab, TabCounts } from "@/server/platform/announcements";

const TABS: { key: AnnouncementTab; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "drafts",    label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "live",      label: "Live" },
  { key: "archived",  label: "Archived" },
  { key: "changelog", label: "Changelog" },
  { key: "templates", label: "Templates" },
];

export function TabsBar({
  active,
  counts,
  hrefFor,
}: {
  active: AnnouncementTab;
  counts: TabCounts;
  hrefFor: (tab: AnnouncementTab) => string;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-lg border p-1"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {TABS.map((t) => {
        const selected = active === t.key;
        const count = counts[t.key];
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
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{
                background: selected ? "var(--surface-1)" : "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {count.toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
