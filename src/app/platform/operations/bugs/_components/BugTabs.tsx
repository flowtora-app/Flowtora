// Page 37 — bug detail tabs strip.

import Link from "next/link";

export type BugTab = "details" | "linked" | "activity" | "tenants" | "resolution";

const TABS: { key: BugTab; label: string }[] = [
  { key: "details",    label: "Details" },
  { key: "linked",     label: "Linked issues" },
  { key: "activity",   label: "Activity" },
  { key: "tenants",    label: "Tenants impacted" },
  { key: "resolution", label: "Resolution" },
];

export function BugTabs({
  active,
  hrefFor,
  counts,
}: {
  active: BugTab;
  hrefFor: (tab: BugTab) => string;
  counts: {
    activity: number;
    tenants: number;
    linked: number;
  };
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-lg border p-1"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {TABS.map((t) => {
        const selected = active === t.key;
        const count =
          t.key === "activity" ? counts.activity :
          t.key === "tenants"  ? counts.tenants  :
          t.key === "linked"   ? counts.linked   :
                                  null;
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
            {count != null && count > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function isBugTab(v: string | undefined): v is BugTab {
  return ["details", "linked", "activity", "tenants", "resolution"].includes(v ?? "");
}
