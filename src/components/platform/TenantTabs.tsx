import * as React from "react";
import Link from "next/link";

// Tab nav for the tenant detail page.
//
// Server-rendered. The page reads `?tab=` from searchParams and only
// renders one panel; this component is a strip of links that flips
// that param. Counts on each tab are optional — passed when a tab
// has a non-zero queue (e.g. open tickets, missing readiness checks).

export type TenantTabKey =
  | "overview"
  | "billing"
  | "access"
  | "settings"
  | "admin"
  | "activity";

export interface TenantTab {
  key: TenantTabKey;
  label: string;
  badge?: number | string;
  badgeTone?: "neutral" | "warning" | "danger" | "success";
}

export function TenantTabs({
  tenantId,
  active,
  tabs,
}: {
  tenantId: string;
  active: TenantTabKey;
  tabs: TenantTab[];
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
        aria-label="Tenant sections"
        className="flex flex-wrap items-center gap-1 overflow-x-auto py-2"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          const href = t.key === "overview"
            ? `/platform/tenants/${tenantId}`
            : `/platform/tenants/${tenantId}?tab=${t.key}`;
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
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"  }
      : tone === "warning"
      ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" }
      : tone === "success"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" }
      : { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
  return (
    <span
      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {value}
    </span>
  );
}
