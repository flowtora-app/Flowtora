import Link from "next/link";
import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/ui";
import {
  PLAN_PRICE_USD,
  PLAN_ORDER,
  PLAN_FEATURES,
} from "@/lib/platform-pricing";

// Phase H — Plans & entitlements.
//
// Read-only view of the canonical plan definitions. Plan pricing and
// feature capabilities live in lib/platform-pricing.ts; for per-tenant
// overrides, platform staff jump to /platform/feature-flags.

export default async function PlatformPlansPage() {
  await requirePlatformStaff();

  const byPlan = await db.tenant.groupBy({
    by: ["plan", "status"],
    _count: { _all: true },
  });

  const activeCount   : Record<Plan, number> = { STARTER: 0, GROWTH: 0, PRO: 0, ENTERPRISE: 0 };
  const trialCount    : Record<Plan, number> = { STARTER: 0, GROWTH: 0, PRO: 0, ENTERPRISE: 0 };
  const pastDueCount  : Record<Plan, number> = { STARTER: 0, GROWTH: 0, PRO: 0, ENTERPRISE: 0 };

  for (const row of byPlan) {
    if (row.status === "ACTIVE")   activeCount[row.plan]  += row._count._all;
    if (row.status === "TRIAL")    trialCount[row.plan]   += row._count._all;
    if (row.status === "PAST_DUE") pastDueCount[row.plan] += row._count._all;
  }

  const mrrByPlan: Record<Plan, number> = {
    STARTER:    activeCount.STARTER    * PLAN_PRICE_USD.STARTER,
    GROWTH:     activeCount.GROWTH     * PLAN_PRICE_USD.GROWTH,
    PRO:        activeCount.PRO        * PLAN_PRICE_USD.PRO,
    ENTERPRISE: activeCount.ENTERPRISE * PLAN_PRICE_USD.ENTERPRISE,
  };
  const totalMrr = PLAN_ORDER.reduce((s, p) => s + mrrByPlan[p], 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Plans &amp; entitlements</h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Canonical plan pricing and capability matrix. Edit{" "}
          <code
            className="rounded px-1 py-0.5 font-mono text-xs"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
          >
            src/lib/platform-pricing.ts
          </code>{" "}
          to change these. For per-tenant overrides use{" "}
          <Link
            href="/platform/feature-flags"
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            feature flags
          </Link>
          .
        </p>
      </div>

      {/* ── Plan summary cards ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((plan) => (
          <PlanSummaryCard
            key={plan}
            plan={plan}
            price={PLAN_PRICE_USD[plan]}
            active={activeCount[plan]}
            trial={trialCount[plan]}
            pastDue={pastDueCount[plan]}
            mrr={mrrByPlan[plan]}
          />
        ))}
      </div>

      {/* ── MRR rollup ── */}
      <Card>
        <CardHeader
          title="Monthly recurring revenue"
          description="Computed from ACTIVE tenants × plan list price. Override pricing per contract is not reflected here."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--text-muted)" }}>
              <tr className="text-left">
                <th className="px-5 py-3 font-normal">Plan</th>
                <th className="px-5 py-3 font-normal text-right">Price / mo</th>
                <th className="px-5 py-3 font-normal text-right">Active</th>
                <th className="px-5 py-3 font-normal text-right">Trial</th>
                <th className="px-5 py-3 font-normal text-right">Past due</th>
                <th className="px-5 py-3 font-normal text-right">MRR</th>
                <th className="px-5 py-3 font-normal text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_ORDER.map((plan) => {
                const mrr    = mrrByPlan[plan];
                const share  = totalMrr > 0 ? Math.round((mrr / totalMrr) * 1000) / 10 : 0;
                return (
                  <tr key={plan} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-5 py-3 font-medium">{plan}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                      ${PLAN_PRICE_USD[plan]}
                    </td>
                    <td className="px-5 py-3 text-right">{activeCount[plan]}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                      {trialCount[plan]}
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: pastDueCount[plan] > 0 ? "#f59e0b" : "var(--text-muted)" }}>
                      {pastDueCount[plan]}
                    </td>
                    <td className="px-5 py-3 text-right font-medium">${mrr.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                      {share}%
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: "1px solid var(--border-default)", fontWeight: 600 }}>
                <td className="px-5 py-3" colSpan={5}>Total MRR</td>
                <td className="px-5 py-3 text-right">${totalMrr.toLocaleString()}</td>
                <td className="px-5 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Feature matrix ── */}
      <Card>
        <CardHeader
          title="Feature matrix"
          description="What each plan unlocks. This is the source of truth for marketing and in-product gating."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--text-muted)" }}>
              <tr className="text-left">
                <th className="px-5 py-3 font-normal">Feature</th>
                {PLAN_ORDER.map((plan) => (
                  <th key={plan} className="px-5 py-3 font-normal text-center">
                    {plan}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_FEATURES.map((feat) => (
                <tr key={feat.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{feat.label}</div>
                    <div
                      className="mt-0.5 font-mono text-[11px]"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {feat.key}
                    </div>
                  </td>
                  {PLAN_ORDER.map((plan) => (
                    <td key={plan} className="px-5 py-3 text-center">
                      <FeatureCell value={feat.values[plan]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p
        className="text-xs"
        style={{ color: "var(--text-faint)" }}
      >
        Tenants can be moved between plans on each tenant detail page. Overrides at{" "}
        <Link
          href="/platform/feature-flags"
          className="underline"
          style={{ color: "var(--accent)" }}
        >
          /platform/feature-flags
        </Link>{" "}
        win over this matrix.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function PlanSummaryCard({
  plan, price, active, trial, pastDue, mrr,
}: {
  plan: Plan;
  price: number;
  active: number;
  trial: number;
  pastDue: number;
  mrr: number;
}) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {plan}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold">${price}</span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>/ mo</span>
      </div>

      <dl className="mt-4 space-y-1 text-xs">
        <SummaryRow label="Active tenants" value={String(active)} />
        <SummaryRow label="On trial"       value={String(trial)} muted />
        {pastDue > 0 && (
          <SummaryRow label="Past due" value={String(pastDue)} tone="#f59e0b" />
        )}
        <SummaryRow
          label="MRR"
          value={`$${mrr.toLocaleString()}`}
          strong
        />
      </dl>
    </div>
  );
}

function SummaryRow({
  label, value, muted, strong, tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd
        style={{
          color: tone ?? (muted ? "var(--text-muted)" : "var(--text-default)"),
          fontWeight: strong ? 600 : 400,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function FeatureCell({ value }: { value: string | number | boolean }) {
  if (value === true) {
    return <span style={{ color: "#10b981" }} aria-label="included">✓</span>;
  }
  if (value === false) {
    return <span style={{ color: "var(--text-faint)" }} aria-label="not included">—</span>;
  }
  return (
    <span className="text-xs" style={{ color: "var(--text-default)" }}>
      {String(value)}
    </span>
  );
}
