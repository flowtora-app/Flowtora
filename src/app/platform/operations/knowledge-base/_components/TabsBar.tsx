// Tabs strip for the article editor. URL-driven (no client state) —
// the active tab is derived from `?tab=`.

import Link from "next/link";

export type EditorTab = "content" | "seo" | "translations" | "settings" | "analytics" | "versions" | "feedback";

const TABS: { key: EditorTab; label: string; deferred?: boolean }[] = [
  { key: "content",      label: "Content" },
  { key: "seo",          label: "SEO" },
  { key: "translations", label: "Translations", deferred: true },
  { key: "settings",     label: "Settings" },
  { key: "analytics",    label: "Analytics", deferred: true },
  { key: "versions",     label: "Versions" },
  { key: "feedback",     label: "Feedback" },
];

export function TabsBar({
  active,
  hrefFor,
}: {
  active: EditorTab;
  hrefFor: (tab: EditorTab) => string;
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
            {t.deferred && (
              <span
                className="ml-1.5 rounded-full px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--amber-50, var(--surface-2))",
                  color: "var(--warning-fg)",
                  border: "1px solid var(--amber-200, var(--border-default))",
                }}
              >
                soon
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function isEditorTab(value: string | undefined): value is EditorTab {
  return ["content", "seo", "translations", "settings", "analytics", "versions", "feedback"].includes(value ?? "");
}
