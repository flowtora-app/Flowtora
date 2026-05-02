import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { createPricingPlan, movePlanUp, movePlanDown } from "@/app/actions/pricing-plans";
import { formatMoney } from "@/lib/format";
import { PlansRevenueBand, type PlansKpi } from "@/components/platform/PlansRevenueBand";

// /platform/plans — pricing & revenue control center.
//
// Layout:
//   1. Header with "+ New plan" quick action
//   2. Revenue Overview band — total MRR, active / trial / past-due
//      tenants, average revenue per active tenant
//   3. Banners (success / error from server actions)
//   4. Plan summary cards — one per non-archived plan with name,
//      price, status, tenant count, MRR contribution
//   5. Plan catalog table — full list with sort + visibility +
//      tenant counts + edit link
//
// All MRR comes from `Tenant.groupBy(pricingPlanId, status)` and a
// reduce — same approach as the previous version, just visualized
// differently. No new server actions needed.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const OK_LABELS: Record<string, string> = {
  archived: "Plan archived.",
  deleted: "Plan deleted.",
  reordered: "Plan reordered.",
  "no-move": "Already at the edge — nothing to swap with.",
};

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

  const plans = await db.pricingPlan.findMany({
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      subtitle: true,
      status: true,
      highlight: true,
      badge: true,
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
        select: { tenants: true, featureValues: true, versions: true },
      },
    },
  });

  // Stable order: PUBLISHED first, then DRAFT, HIDDEN, ARCHIVED — and
  // by sortOrder within each bucket.
  plans.sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      a.sortOrder - b.sortOrder,
  );

  // Tenant counts per plan, bucketed by status.
  const tenantGroup = await db.tenant.groupBy({
    by: ["pricingPlanId", "status"],
    _count: { _all: true },
  });
  type Counts = { active: number; trial: number; pastDue: number };
  const tenantCounts = new Map<string, Counts>();
  for (const row of tenantGroup) {
    if (!row.pricingPlanId) continue;
    const c = tenantCounts.get(row.pricingPlanId) ?? { active: 0, trial: 0, pastDue: 0 };
    if (row.status === "ACTIVE")        c.active  += row._count._all;
    else if (row.status === "TRIAL")    c.trial   += row._count._all;
    else if (row.status === "PAST_DUE") c.pastDue += row._count._all;
    tenantCounts.set(row.pricingPlanId, c);
  }

  // ── Revenue rollup ──────────────────────────────────────────
  const totalActive  = Array.from(tenantCounts.values()).reduce((s, c) => s + c.active,  0);
  const totalTrial   = Array.from(tenantCounts.values()).reduce((s, c) => s + c.trial,   0);
  const totalPastDue = Array.from(tenantCounts.values()).reduce((s, c) => s + c.pastDue, 0);

  const mrrTotal = plans.reduce((sum, p) => {
    if (p.isContactSales || p.priceMonthly == null) return sum;
    const counts = tenantCounts.get(p.id);
    if (!counts) return sum;
    return sum + Number(p.priceMonthly) * counts.active;
  }, 0);
  const arpu = totalActive > 0 ? mrrTotal / totalActive : 0;

  const kpis: PlansKpi[] = [
    { label: "Monthly recurring revenue", value: formatMoney(mrrTotal, "USD"), tone: "success", hint: "Active tenants × sticker price" },
    { label: "Active tenants",            value: totalActive.toLocaleString(), tone: "default", hint: "Currently paying" },
    { label: "Trial tenants",             value: totalTrial.toLocaleString(),  tone: "accent",  hint: "Convert before trial ends" },
    { label: "Past-due tenants",          value: totalPastDue.toLocaleString(),tone: totalPastDue > 0 ? "warning" : "default", hint: totalPastDue > 0 ? "Payment failed — recover" : "All good", deltaInvert: true },
    { label: "ARPU",                      value: formatMoney(arpu.toFixed(2), "USD"), tone: "default", hint: "Revenue per active tenant" },
  ];

  // Cards row — show non-archived plans, ordered by sortOrder. Skip
  // ARCHIVED (those land in the table below for history).
  const summaryCards = plans.filter((p) => p.status !== "ARCHIVED");

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Plans &amp; pricing
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            The catalog prospects see on{" "}
            <Link href="/pricing" className="underline">flowtora.com/pricing</Link>{" "}
            and the rows tenants pay against. Edits flush the marketing cache on save.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/pricing"
            target="_blank"
            rel="noopener"
            className="ts-focus rounded-md px-3 py-2 text-sm font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Preview public pricing ↗
          </Link>
          <Link
            href="/platform/plans/changelog"
            className="ts-focus rounded-md px-3 py-2 text-sm font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Pricing changelog
          </Link>
          {ctx.canWrite && (
            <form action={createPricingPlan}>
              <button
                type="submit"
                className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                + New plan
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── Banners ──────────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="ok">{OK_LABELS[sp.ok] ?? "Saved."}</Banner>
      )}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      {/* ── Revenue band ─────────────────────────────────────── */}
      <PlansRevenueBand kpis={kpis} />

      {/* ── Plan summary cards ───────────────────────────────── */}
      {summaryCards.length > 0 && (
        <div>
          <h2
            className="mb-3 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Live & in-progress plans
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {summaryCards.map((p) => {
              const counts = tenantCounts.get(p.id) ?? { active: 0, trial: 0, pastDue: 0 };
              const mrr =
                p.isContactSales || p.priceMonthly == null
                  ? 0
                  : Number(p.priceMonthly) * counts.active;
              return (
                <PlanSummaryCard
                  key={p.id}
                  plan={p}
                  active={counts.active}
                  trial={counts.trial}
                  mrr={mrr}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Plan catalog table ───────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <header
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Plan catalog
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              All plans incl. archived. Click a row to edit; draft / hidden plans don't appear on marketing pages.
            </p>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {plans.length} total
          </span>
        </header>

        {plans.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No plans yet. Click "+ New plan" to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium">Plan</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Monthly</th>
                  <th className="px-5 py-3 text-right font-medium">Annual</th>
                  <th className="px-5 py-3 font-medium">Visibility</th>
                  <th className="px-5 py-3 text-right font-medium">Tenants</th>
                  <th className="px-5 py-3 text-right font-medium">MRR</th>
                  <th className="px-5 py-3 text-right font-medium">Features</th>
                  <th className="px-5 py-3 text-center font-medium">Reorder</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const counts = tenantCounts.get(p.id) ?? { active: 0, trial: 0, pastDue: 0 };
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
                        <Link
                          href={`/platform/plans/${p.id}`}
                          className="font-medium hover:underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {p.name}
                        </Link>
                        <div
                          className="mt-0.5 font-mono text-[11px]"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {p.slug}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.highlight && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                background: "var(--accent-surface)",
                                color: "var(--accent-primary)",
                              }}
                            >
                              ★ Highlighted
                            </span>
                          )}
                          {p.badge && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                background: "var(--surface-2)",
                                color: "var(--text-default)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              {p.badge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusChip status={p.status} />
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {p.isContactSales
                          ? <span style={{ color: "var(--text-muted)" }}>Contact</span>
                          : p.priceMonthly != null
                          ? `$${Number(p.priceMonthly).toLocaleString()}`
                          : <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
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
                      <td className="px-5 py-3 text-right tabular-nums">
                        <span style={{ color: "var(--text-default)" }}>{counts.active}</span>
                        {counts.trial > 0 && (
                          <span style={{ color: "var(--text-muted)" }}> + {counts.trial}t</span>
                        )}
                        {counts.pastDue > 0 && (
                          <span style={{ color: "var(--warning-fg)" }}> · {counts.pastDue} pd</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {mrr > 0 ? formatMoney(mrr, p.currency || "USD") : <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td
                        className="px-5 py-3 text-right tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {p._count.featureValues}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {ctx.canWrite ? (
                          <div className="inline-flex items-center gap-1">
                            <form action={movePlanUp.bind(null, p.id)}>
                              <button type="submit"
                                      title={`Move ${p.name} up`}
                                      className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--surface-2)]"
                                      style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                                ↑
                              </button>
                            </form>
                            <form action={movePlanDown.bind(null, p.id)}>
                              <button type="submit"
                                      title={`Move ${p.name} down`}
                                      className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--surface-2)]"
                                      style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                                ↓
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/platform/plans/${p.id}`}
                          className="ts-focus text-xs font-medium underline"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid var(--border-default)", background: "var(--surface-2)" }}>
                  <td className="px-5 py-3 text-xs font-semibold" colSpan={6} style={{ color: "var(--text-default)" }}>
                    Total MRR
                  </td>
                  <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                    {formatMoney(mrrTotal, "USD")}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Tenant-level plan changes happen on the tenant detail page. Per-tenant price overrides
        (grandfathered pricing, Enterprise contracts) are managed under each tenant's Billing tab.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function PlanSummaryCard({
  plan,
  active,
  trial,
  mrr,
}: {
  plan: {
    id: string;
    slug: string;
    name: string;
    subtitle: string | null;
    status: string;
    highlight: boolean;
    badge: string | null;
    priceMonthly: unknown;
    currency: string;
    isContactSales: boolean;
  };
  active: number;
  trial: number;
  mrr: number;
}) {
  return (
    <Link
      href={`/platform/plans/${plan.id}`}
      className="ts-focus group block rounded-xl p-5 transition-colors"
      style={{
        background: plan.highlight ? "var(--accent-surface)" : "var(--surface-1)",
        border: `1px solid ${plan.highlight ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-base font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {plan.name}
            </span>
            {plan.highlight && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                }}
              >
                ★
              </span>
            )}
          </div>
          {plan.subtitle && (
            <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {plan.subtitle}
            </div>
          )}
        </div>
        <StatusChip status={plan.status} />
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        {plan.isContactSales ? (
          <span className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
            Custom
          </span>
        ) : plan.priceMonthly != null ? (
          <>
            <span
              className="text-2xl font-semibold tabular-nums tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {formatMoney(Number(plan.priceMonthly), plan.currency || "USD")}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              /mo
            </span>
          </>
        ) : (
          <span className="text-base" style={{ color: "var(--text-faint)" }}>
            No price set
          </span>
        )}
      </div>

      {plan.badge && (
        <div className="mt-1">
          <span
            className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-default)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {plan.badge}
          </span>
        </div>
      )}

      <div
        className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-xs"
        style={{ borderColor: plan.highlight ? "var(--accent-primary)" : "var(--border-subtle)" }}
      >
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Active
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
            {active}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Trial
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
            {trial}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            MRR
          </div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
            {mrr > 0 ? formatMoney(mrr, plan.currency || "USD") : "—"}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? { background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" }
      : { background: "var(--danger-surface)",  color: "var(--danger-fg)",  border: "1px solid var(--danger-fg)"  };
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
  const on  = "var(--text-default)";
  const off = "var(--text-faint)";
  return (
    <div className="flex gap-1.5 text-[10px] font-medium uppercase tracking-wide">
      <span style={{ color: landing ? on : off }} title={landing ? "Visible on home page" : "Not on home page"}>
        Home
      </span>
      <span style={{ color: pricing ? on : off }} title={pricing ? "Visible on /pricing" : "Not on /pricing"}>
        Pricing
      </span>
      <span style={{ color: signup ? on : off }} title={signup ? "Selectable at signup" : "Not at signup"}>
        Signup
      </span>
    </div>
  );
}
