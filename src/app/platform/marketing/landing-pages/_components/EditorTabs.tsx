// Page 38 — landing-page editor tabs strip.

import Link from "next/link";

export type LpEditorTab = "builder" | "code" | "seo" | "ab" | "analytics" | "versions";

const TABS: { key: LpEditorTab; label: string }[] = [
  { key: "builder",   label: "Builder" },
  { key: "code",      label: "Code mode" },
  { key: "seo",       label: "SEO" },
  { key: "ab",        label: "A/B test" },
  { key: "analytics", label: "Analytics" },
  { key: "versions",  label: "Versions" },
];

export function LpEditorTabsBar({
  active, hrefFor,
}: {
  active: LpEditorTab;
  hrefFor: (tab: LpEditorTab) => string;
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-lg border p-1"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {TABS.map((t) => {
        const selected = active === t.key;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors"
            style={{
              background: selected ? "var(--surface-2)" : "transparent",
              color: selected ? "var(--text-default)" : "var(--text-muted)",
            }}
            aria-current={selected ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function isLpEditorTab(v: string | undefined): v is LpEditorTab {
  return ["builder", "code", "seo", "ab", "analytics", "versions"].includes(v ?? "");
}
