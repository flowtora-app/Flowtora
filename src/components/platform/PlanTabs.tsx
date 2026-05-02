import * as React from "react";
import Link from "next/link";

// Tab nav for the plan detail page.
//
//   Overview · Pricing & Billing · Features & Limits · Add-ons ·
//   Marketing & Visibility · Advanced
//
// Server-rendered. The page reads `?tab=` from searchParams. Each tab
// is a <Link> that flips that param. Optional badge surfaces e.g.
// when a tab needs attention (no Stripe price set, missing description,
// etc.).

export type PlanTabKey =
  | "overview"
  | "pricing"
  | "features"
  | "addons"
  | "lifecycle"   // Page 19 — trial / migration / tax
  | "marketing"
  | "auditlog"    // Page 19 — plan-scoped audit events
  | "advanced";

export interface PlanTab {
  key: PlanTabKey;
  label: string;
  badge?: number | string;
  badgeTone?: "neutral" | "warning" | "danger" | "success";
}

export function PlanTabs({
  planId,
  active,
  tabs,
}: {
  planId: string;
  active: PlanTabKey;
  tabs: PlanTab[];
}) {
  return (
    <div
      className="sticky top-0 z-20 -mx-8 mb-6 px-8 backdrop-blur"
      style={{
        background: "color-mix(in oklab, var(--surface-0) 88%, transparent)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <nav
        role="tablist"
        aria-label="Plan editor sections"
        className="flex flex-wrap items-center gap-1 overflow-x-auto py-2"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          const href = t.key === "overview"
            ? `/platform/plans/${planId}`
            : `/platform/plans/${planId}?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className="ts-focus relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: isActive ? "var(--surface-2)" : "transparent",
                color:      isActive ? "var(--text-default)" : "var(--text-muted)",
                border: `1px solid ${isActive ? "var(--border-default)" : "transparent"}`,
              }}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== 0 && t.badge !== "" && (
                <TabBadge value={t.badge} tone={t.badgeTone ?? "neutral"} />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function TabBadge({
  value,
  tone,
}: {
  value: number | string;
  tone: "neutral" | "warning" | "danger" | "success";
}) {
  const palette =
    tone === "danger"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"  } :
    tone === "warning" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" } :
    tone === "success" ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
                          { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
  return (
    <span
      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {value}
    </span>
  );
}
