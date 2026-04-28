import * as React from "react";
import type { FeatureKey } from "@/lib/entitlements";
import { upsertFeatureFlag, deleteFeatureFlag } from "@/app/actions/platform";
import { getFeatureGateMeta } from "@/lib/feature-gates";

// Feature entitlements panel — grouped, scannable, quick to flip.
//
//   ┌── Sales & customer experience ───────────────────────────┐
//   │   Customer portal       ON   plan default (Essentials)    │
//   │   [Force OFF] [Clear]                                      │
//   ├── Production & ops ──────────────────────────────────────┤
//   │   Production scheduling  OFF  plan default                 │
//   │   [Force ON]                                                │
//   └─────────────────────────────────────────────────────────┘
//
// Resolution order: tenant override > global override > plan default.
// Each toggle posts to the existing upsertFeatureFlag / deleteFeatureFlag
// server actions — no new wiring.

export interface EntitlementRow {
  value: boolean;
  source: "plan" | "global" | "tenant";
}
export type EntitlementMap = Record<FeatureKey, EntitlementRow>;
export type TenantFlagRow = { id: string; key: string; enabled: boolean; note: string | null };

// Friendly grouping for the entitlement matrix. Order matters — this is
// the order admins see them in.
const FEATURE_GROUPS: { title: string; description: string; keys: FeatureKey[] }[] = [
  {
    title: "Sales & customer experience",
    description: "Customer-facing portals, approvals, and pricing rules.",
    keys: ["customerPortal", "advancedPricing"],
  },
  {
    title: "Production & operations",
    description: "Scheduling, install routing, and field-mode tools.",
    keys: ["installScheduling"],
  },
  {
    title: "Money",
    description: "Reporting depth and vendor / expense tracking.",
    keys: ["reportsFinancial", "vendors_expenses"],
  },
  {
    title: "Multi-location & franchise",
    description: "Branches, roll-ups, and parent-child accounts.",
    keys: ["multiLocation", "branchComparison", "franchiseGroup"],
  },
  {
    title: "Identity",
    description: "Authentication and access management.",
    keys: ["sso"],
  },
  {
    title: "Beta",
    description: "Early-access features being piloted.",
    keys: ["betaProofAnnotations"],
  },
];

export function TenantFeaturesPanel({
  tenantId,
  tenantPlan,
  entitlements,
  tenantFlagByKey,
  canWrite,
}: {
  tenantId: string;
  tenantPlan: string;
  entitlements: EntitlementMap;
  tenantFlagByKey: Map<string, TenantFlagRow>;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-5">
      {FEATURE_GROUPS.map((group) => (
        <FeatureGroupCard
          key={group.title}
          group={group}
          tenantId={tenantId}
          tenantPlan={tenantPlan}
          entitlements={entitlements}
          tenantFlagByKey={tenantFlagByKey}
          canWrite={canWrite}
        />
      ))}
    </div>
  );
}

function FeatureGroupCard({
  group,
  tenantId,
  tenantPlan,
  entitlements,
  tenantFlagByKey,
  canWrite,
}: {
  group: (typeof FEATURE_GROUPS)[number];
  tenantId: string;
  tenantPlan: string;
  entitlements: EntitlementMap;
  tenantFlagByKey: Map<string, TenantFlagRow>;
  canWrite: boolean;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header className="px-5 pt-4 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {group.title}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {group.description}
        </p>
      </header>
      <ul>
        {group.keys.map((k, idx) => {
          const row = entitlements[k];
          if (!row) return null;
          const override = tenantFlagByKey.get(k);
          const meta = getFeatureGateMeta(k);
          return (
            <li
              key={k}
              className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center"
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-default)" }}
                  >
                    {meta.label}
                  </span>
                  <StatusPill on={row.value} />
                  <SourcePill source={row.source} tenantPlan={tenantPlan} />
                </div>
                <div
                  className="mt-1 font-mono text-[10px]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {k}
                </div>
                {override?.note && (
                  <div
                    className="mt-1 text-xs italic"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Note: {override.note}
                  </div>
                )}
              </div>
              {canWrite ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <form action={upsertFeatureFlag}>
                    <input type="hidden" name="tenantId" value={tenantId} />
                    <input type="hidden" name="key" value={k} />
                    <input type="hidden" name="enabled" value="on" />
                    <button
                      type="submit"
                      className="ts-focus rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
                      style={{
                        background: row.source === "tenant" && row.value ? "var(--success-surface)" : "transparent",
                        color: "var(--success-fg)",
                        border: "1px solid var(--success-fg)",
                      }}
                      disabled={row.source === "tenant" && row.value}
                      title="Force this feature ON for this tenant only"
                    >
                      Force ON
                    </button>
                  </form>
                  <form action={upsertFeatureFlag}>
                    <input type="hidden" name="tenantId" value={tenantId} />
                    <input type="hidden" name="key" value={k} />
                    <input type="hidden" name="enabled" value="" />
                    <button
                      type="submit"
                      className="ts-focus rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40"
                      style={{
                        background: row.source === "tenant" && !row.value ? "var(--danger-surface)" : "transparent",
                        color: "var(--danger-fg)",
                        border: "1px solid var(--danger-fg)",
                      }}
                      disabled={row.source === "tenant" && !row.value}
                      title="Force this feature OFF for this tenant only"
                    >
                      Force OFF
                    </button>
                  </form>
                  {override && (
                    <form action={deleteFeatureFlag.bind(null, override.id)}>
                      <button
                        type="submit"
                        className="ts-focus rounded-md px-2.5 py-1 text-xs transition-colors"
                        style={{
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-default)",
                        }}
                        title="Remove the override and fall back to plan default"
                      >
                        Clear
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  read only
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return on ? (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
    >
      ON
    </span>
  ) : (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
    >
      OFF
    </span>
  );
}

function SourcePill({
  source,
  tenantPlan,
}: {
  source: "plan" | "global" | "tenant";
  tenantPlan: string;
}) {
  const label =
    source === "tenant" ? "tenant override"
    : source === "global" ? "global override"
    : `from ${tenantPlan} plan`;
  const palette =
    source === "tenant" ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" }
    : source === "global" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" }
    : { bg: "var(--surface-2)", fg: "var(--text-muted)" };
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {label}
    </span>
  );
}
