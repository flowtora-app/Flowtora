// Page 39 — top-level tabs strip.

import Link from "next/link";

export type CampaignsTab = "campaigns" | "templates" | "audiences" | "performance";

const TABS: { key: CampaignsTab; label: string; href: string }[] = [
  { key: "campaigns",   label: "Campaigns",   href: "/platform/marketing/campaigns" },
  { key: "templates",   label: "Templates",   href: "/platform/marketing/campaigns/templates" },
  { key: "audiences",   label: "Audiences",   href: "/platform/marketing/campaigns/audiences" },
  { key: "performance", label: "Performance", href: "/platform/marketing/campaigns/performance" },
];

export function TabsBar({ active }: { active: CampaignsTab }) {
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
            href={t.href}
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
