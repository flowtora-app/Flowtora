"use client";

import * as React from "react";
import Link from "next/link";
import type { TriageBundle, TriageItem } from "@/server/platform/overview-metrics";
import { SectionCard } from "@/components/platform/SectionCard";

// Client-side tabbed triage queue. Picks the tab with the most items as
// the default so the busiest queue gets eyeballs first. Each tab shows
// up to 8 items; "View all" link on each tab deep-links into the right
// sibling admin page.

type TabKey = "payments" | "support" | "trials" | "deletions" | "unhealthy";

const TAB_META: Record<TabKey, { label: string; viewAllHref: string; empty: string; tone: string }> = {
  payments:  { label: "Failed payments", viewAllHref: "/platform/revenue",            empty: "No failed payments. 🎉",         tone: "var(--danger)"  },
  support:   { label: "Support",         viewAllHref: "/platform/support",            empty: "Support queue is clear.",         tone: "var(--warning)" },
  trials:    { label: "Trials ending",   viewAllHref: "/platform/tenants?status=TRIAL", empty: "No trials ending this week.",   tone: "var(--info)"    },
  deletions: { label: "Deletions",       viewAllHref: "/platform/health",             empty: "No deletions scheduled.",         tone: "var(--warning)" },
  unhealthy: { label: "Unhealthy",       viewAllHref: "/platform/tenants?status=PAST_DUE", empty: "All tenants healthy.",       tone: "var(--danger)"  },
};

const TONE_COLOR: Record<NonNullable<TriageItem["tone"]>, string> = {
  neutral: "var(--text-muted)",
  success: "var(--success-fg)",
  warning: "var(--warning-fg)",
  danger:  "var(--danger-fg)",
  info:    "var(--info-fg)",
};

export function TriageTabs({ triage }: { triage: TriageBundle }) {
  const order: TabKey[] = ["payments", "support", "trials", "deletions", "unhealthy"];

  // Default to the tab with the most items. Ties: follow `order`.
  const defaultTab: TabKey = React.useMemo(() => {
    let best = order[0];
    let bestCount = triage[best].length;
    for (const k of order) {
      if (triage[k].length > bestCount) {
        best = k;
        bestCount = triage[k].length;
      }
    }
    return best;
  }, [triage]);

  const [active, setActive] = React.useState<TabKey>(defaultTab);
  const items = triage[active];
  const meta = TAB_META[active];

  return (
    <SectionCard
      title="Triage"
      subtitle="Queues that need a platform-admin decision today"
      action={
        <Link
          href={meta.viewAllHref}
          className="text-xs"
          style={{ color: "var(--accent-primary)" }}
        >
          View all →
        </Link>
      }
    >
      <div
        className="flex flex-wrap items-center gap-1 border-b pb-3"
        style={{ borderColor: "var(--border-subtle)" }}
        role="tablist"
      >
        {order.map((key) => {
          const count = triage[key].length;
          const isActive = key === active;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(key)}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: isActive ? "var(--accent-surface)" : "transparent",
                color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
              }}
            >
              <span>{TAB_META[key].label}</span>
              {count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{
                    background: isActive ? "var(--accent-primary)" : "var(--surface-2)",
                    color:      isActive ? "var(--accent-fg)"     : "var(--text-muted)",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p
          className="mt-4 rounded-lg px-4 py-10 text-center text-sm"
          style={{
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          {meta.empty}
        </p>
      ) : (
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {items.map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="flex items-start gap-3 py-3 transition-colors hover:brightness-110"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: it.tone ? TONE_COLOR[it.tone] : meta.tone }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="line-clamp-1 text-sm font-medium"
                    style={{ color: "var(--text-default)" }}
                  >
                    {it.title}
                  </div>
                  <div
                    className="mt-0.5 line-clamp-1 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {it.meta}
                  </div>
                </div>
                <span
                  className="mt-1 text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
