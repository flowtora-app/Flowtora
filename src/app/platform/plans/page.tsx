import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { createPricingPlan } from "@/app/actions/pricing-plans";
import { formatMoney } from "@/lib/format";

// /platform/plans — editable plan catalog (M3 rewrite).
//
// Before M3 this page was a read-only summary of the canonical plan
// enum + a "edit src/lib/platform-pricing.ts" footer. M1 moved plan
// data into tables; M3 makes them editable. The layout now shows:
//
//   1. Banner with success / error from the most recent action
//   2. "New plan" button → createPricingPlan server action
//   3. Plan rows, one per PricingPlan (grouped by status):
//        • PUBLISHED — visible to prospects + purchasable
//        • DRAFT      — in-progress, only visible here
//        • HIDDEN     — existing tenants keep; new prospects don't see
//        • ARCHIVED   — retired; surfaced at bottom for history only
//   4. MRR rollup: Active tenants × priceMonthly. Now reads directly
//      from the PricingPlan table (no more platform-pricing.ts).
//
// Anything else is deferred to M4 (version history viewer, scheduled
// changes, live preview).

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const STATUS_ORDER: Record<string, number> = {
  PUBLISHED: 0,
  DRAFT: 1,
  HIDDEN: 2,
  ARCHIVED: 3,
};

export default async function PlatformPlansPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  // All plans with counts for tenants, versions, overrides, features.
  const plans = await db.pricingPlan.findMany({
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      subtitle: true,
      status: true,
      highlight: true,
      sortOrder: true,
      priceMonthly: true,
      priceAnnual: true,
      currency: true,
      isContactSales: true,
      showOnLanding: true,
      showOnPricing: true,
      showOnSignup: true,
      updatedAt: true,
      publishedAt: true,
      _count: {
        select: {
          tenants: true,
          featureValues: true,
          versions: true,
        },
      },
    },
  });

  // Client-side sort so PUBLISHED comes first regardless of DB order.
  plans.sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      a.sortOrder - b.sortOrder,
  );

  // MRR: active paying tenants × their plan's monthly price. Skip
  // contact-sales tiers — those have no sticker price, and the real
  // revenue comes from PlanPriceOverride contracts we don't want to
  // double-count here.
  //
  // One group-by across (pricingPlanId, status) and a small reduce —
  // cheaper than N queries even with 20+ plans.
  const tenantGroup = await db.tenant.groupBy({
    by: ["pricingPlanId", "status"],
    _count: { _all: true },
  });

  // Map: planId → { active, trial, pastDue }
  type Counts = { active: number; trial: number; pastDue: number };
  const tenantCounts = new Map<string, Counts>();
  for (const row of tenantGroup) {
    if (!row.pricingPlanId) continue;
    const c = tenantCounts.get(row.pricingPlanId) ?? { active: 0, trial: 0, pastDue: 0 };
    if (row.status === "ACTIVE") c.active += row._count._all;
    else if (row.status === "TRIAL") c.trial += row._count._all;
    else if (row.status === "PAST_DUE") c.pastDue += row._count._all;
    tenantCounts.set(row.pricingPlanId, c);
  }

  const mrrTotal = plans.reduce((sum, p) => {
    if (p.isContactSales || p.priceMonthly == null) return sum;
    const counts = tenantCounts.get(p.id);
    if (!counts) return sum;
    return sum + Number(p.priceMonthly) * counts.active;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plans &amp; pricing</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            The catalog prospects see on <Link href="/pricing" className="underline">flowtora.com/pricing</Link>,
            and the rows tenants pay against. Edits flush the marketing cache on save.
          </p>
        </div>
        {ctx.canWrite && (
          <form action={createPricingPlan}>
            <button
              type="submit"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              + New plan
            </button>
          </form>
        )}
      </div>

      {sp.ok && (
        <Banner tone="ok">
          {sp.ok === "archived"
            ? "Plan archived."
            : sp.ok === "deleted"
            ? "Plan deleted."
            : "Saved."}
        </Banner>
      )}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      {/* ── MRR rollup — now DB-backed. ── */}
      <Card>
        <CardHeader
          title="Monthly recurring revenue"
          description="Active tenants × their plan's sticker price. Contact-sales plans aren't counted (true revenue comes through negotiated overrides)."
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
              </tr>
            </thead>
            <tbody>
              {plans
                .filter((p) => p.status !== "ARCHIVED")
                .map((p) => {
                  const counts = tenantCounts.get(p.id) ?? { active: 0, trial: 0, pastDue: 0 };
                  const priceDisplay =
                    p.isContactSales || p.priceMonthly == null
                      ? "—"
                      : `$${Number(p.priceMonthly).toLocaleString()}`;
                  const mrr =
                    p.isContactSales || p.priceMonthly == null
                      ? 0
                      : Number(p.priceMonthly) * counts.active;
                  return (
                    <tr
                      key={p.id}
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                          {p.slug}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                        {priceDisplay}
                      </td>
                      <td className="px-5 py-3 text-right">{counts.active}</td>
                      <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                        {counts.trial}
                      </td>
                      <td className="px-5 py-3 text-right" style={{ color: counts.pastDue > 0 ? "#f59e0b" : "var(--text-muted)" }}>
                        {counts.pastDue}
                      </td>
                      <td className="px-5 py-3 text-right font-medium">{formatMoney(mrr, p.currency || "USD")}</td>
                    </tr>
                  );
                })}
              <tr style={{ borderTop: "1px solid var(--border-default)", fontWeight: 600 }}>
                <td className="px-5 py-3" colSpan={5}>Total MRR</td>
                <td className="px-5 py-3 text-right">{formatMoney(mrrTotal, "USD")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Plan catalog — one row per PricingPlan. ── */}
      <Card>
        <CardHeader
          title="Plan catalog"
          description="Click a row to edit. Draft / hidden plans don't appear on marketing pages but are reachable by direct signup link."
        />
        {plans.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No plans yet. Click “+ New plan” to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)" }}>
                <tr className="text-left">
                  <th className="px-5 py-3 font-normal">Plan</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                  <th className="px-5 py-3 font-normal text-right">Monthly</th>
                  <th className="px-5 py-3 font-normal text-right">Annual</th>
                  <th className="px-5 py-3 font-normal">Visibility</th>
                  <th className="px-5 py-3 font-normal text-right">Tenants</th>
                  <th className="px-5 py-3 font-normal text-right">Features</th>
                  <th className="px-5 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/platform/plans/${p.id}`}
                        className="font-medium hover:underline"
                        style={{ color: "var(--text-default)" }}
                      >
                        {p.name}
                      </Link>
                      <div className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {p.slug}
                      </div>
                      {p.highlight && (
                        <span
                          className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                          style={{
                            background: "var(--accent-surface)",
                            color: "var(--accent-primary)",
                          }}
                        >
                          Highlighted
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <StatusChip status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.isContactSales
                        ? <span style={{ color: "var(--text-muted)" }}>Contact</span>
                        : p.priceMonthly != null
                        ? `$${Number(p.priceMonthly).toLocaleString()}`
                        : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                      {p.isContactSales || p.priceAnnual == null
                        ? "—"
                        : `$${Number(p.priceAnnual).toLocaleString()}`}
                    </td>
                    <td className="px-5 py-3">
                      <VisibilityFlags
                        landing={p.showOnLanding}
                        pricing={p.showOnPricing}
                        signup={p.showOnSignup}
                      />
                    </td>
                    <td className="px-5 py-3 text-right">{p._count.tenants}</td>
                    <td className="px-5 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                      {p._count.featureValues}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/platform/plans/${p.id}`}
                        className="text-xs underline"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Tenant-level plan changes happen on the tenant detail page. Per-tenant price
        overrides (grandfathered pricing, Enterprise contracts) live on{" "}
        <code
          className="rounded px-1 py-0.5 font-mono text-[11px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
        >
          PlanPriceOverride
        </code>{" "}
        and get their own admin surface in M5.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        };
  return (
    <div className="rounded-md px-4 py-3 text-sm" style={style}>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    PUBLISHED: {
      background: "var(--success-surface)",
      color: "var(--success-fg)",
      border: "1px solid var(--success-fg)",
    },
    DRAFT: {
      background: "var(--surface-2)",
      color: "var(--text-muted)",
      border: "1px solid var(--border-subtle)",
    },
    HIDDEN: {
      background: "var(--warning-surface)",
      color: "var(--warning-fg)",
      border: "1px solid var(--warning-fg)",
    },
    ARCHIVED: {
      background: "var(--surface-2)",
      color: "var(--text-faint)",
      border: "1px solid var(--border-subtle)",
    },
  };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={styles[status] ?? styles.DRAFT}
    >
      {status.toLowerCase()}
    </span>
  );
}

function VisibilityFlags({
  landing,
  pricing,
  signup,
}: {
  landing: boolean;
  pricing: boolean;
  signup: boolean;
}) {
  const on = "var(--text-default)";
  const off = "var(--text-faint)";
  return (
    <div className="flex gap-2 text-[10px] font-medium uppercase tracking-wider">
      <span style={{ color: landing ? on : off }}>Home</span>
      <span style={{ color: pricing ? on : off }}>Pricing</span>
      <span style={{ color: signup ? on : off }}>Signup</span>
    </div>
  );
}
