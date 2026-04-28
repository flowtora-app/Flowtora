import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { computeReadiness, type ReadinessReport, type ReadinessCheck } from "@/lib/readiness";
import { cohortChip, cohortLabel } from "@/lib/cohorts";
import type { Prisma } from "@prisma/client";
import { ReadinessKPIBand, type ReadinessKpi } from "@/components/platform/ReadinessKPIBand";
import { ActivationFunnel, type FunnelStage } from "@/components/platform/ActivationFunnel";
import { ReadinessBlockers, type BlockerRow } from "@/components/platform/ReadinessBlockers";
import { ReadinessInsights, type ReadinessInsight } from "@/components/platform/ReadinessInsights";

// /platform/readiness — launch-readiness control center (rewrite).
//
// Layout:
//   1. KPI band — Total · Ready % · Blocked · Avg score · New 7d ·
//      Stripe linked %
//   2. Auto-generated insights strip (warning > info > positive)
//   3. Activation funnel — drop-off through the 7 onboarding stages
//   4. Top blockers — which check is blocking the most tenants
//   5. Filters (search / status / plan / readiness / environment)
//   6. Tenant table — per-row readiness with progress bar + missing
//      checks + risk classification
//
// The tenant detail page renders the same checks with action links,
// so each row in the table is a one-click drilldown.

const FILTER_OPTIONS = [
  { value: "all",     label: "All" },
  { value: "blocked", label: "Blocked (required missing)" },
  { value: "partial", label: "In progress" },
  { value: "ready",   label: "Ready to launch" },
] as const;
type Filter = (typeof FILTER_OPTIONS)[number]["value"];

const ENV_OPTIONS = ["ALL", "LIVE", "DEMO", "TEST"] as const;
const STATUS_OPTIONS = ["ALL", "ACTIVE", "TRIAL", "PAST_DUE", "SUSPENDED"] as const;

const DAY_MS = 86_400_000;

type StatusKey = (typeof STATUS_OPTIONS)[number];
type EnvKey = (typeof ENV_OPTIONS)[number];

export default async function PlatformReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    env?: string;
    status?: string;
    plan?: string;
    q?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const filter: Filter = (FILTER_OPTIONS.map((o) => o.value) as readonly string[]).includes(sp.filter ?? "")
    ? (sp.filter as Filter)
    : "all";
  const env: EnvKey = (ENV_OPTIONS as readonly string[]).includes((sp.env ?? "ALL").toUpperCase())
    ? ((sp.env ?? "ALL").toUpperCase() as EnvKey)
    : "ALL";
  const statusFilter: StatusKey = (STATUS_OPTIONS as readonly string[]).includes((sp.status ?? "ALL").toUpperCase())
    ? ((sp.status ?? "ALL").toUpperCase() as StatusKey)
    : "ALL";
  const planFilter = (sp.plan ?? "ALL").toUpperCase();
  const q = (sp.q ?? "").trim();

  // ── Pull tenants needed for readiness computation ────────────
  const where: Prisma.TenantWhereInput = {
    status: statusFilter === "ALL"
      ? { not: "ARCHIVED" }
      : (statusFilter as "ACTIVE" | "TRIAL" | "PAST_DUE" | "SUSPENDED"),
    ...(env !== "ALL" ? { environment: env as "LIVE" | "DEMO" | "TEST" } : {}),
    ...(planFilter !== "ALL" ? { plan: planFilter as "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE" } : {}),
    ...(q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    } : {}),
  };
  const tenants = await db.tenant.findMany({
    where,
    select: {
      id:                    true,
      name:                  true,
      slug:                  true,
      plan:                  true,
      status:                true,
      environment:           true,
      betaCohort:            true,
      phone:                 true,
      addressLine1:          true,
      city:                  true,
      country:               true,
      logoUrl:               true,
      brandPrimaryColor:     true,
      onboardingCompletedAt: true,
      sampleDataLoadedAt:    true,
      sampleDataClearedAt:   true,
      stripeCustomerId:      true,
      stripeSubscriptionId:  true,
      lastActivityAt:        true,
      createdAt:             true,
    },
    take: 500,
  });

  const ids = tenants.map((t) => t.id);
  const now = new Date();
  const win7  = new Date(now.getTime() -  7 * DAY_MS);
  const win14 = new Date(now.getTime() - 14 * DAY_MS);

  // Counts per tenant for readiness, plus 7d/prior-7d new-tenants for delta.
  const [members, customers, products, quotes, orders, new7d, newPrior7d, planRows] = await Promise.all([
    db.membership.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
    db.customer.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.product.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.quote.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["tenantId"], where: { tenantId: { in: ids } }, _count: { _all: true } }),
    db.tenant.count({ where: { status: { not: "ARCHIVED" }, createdAt: { gte: win7 } } }),
    db.tenant.count({ where: { status: { not: "ARCHIVED" }, createdAt: { gte: win14, lt: win7 } } }),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { plan: true },
      distinct: ["plan"],
    }),
  ]);

  const countMap = (rows: { tenantId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.tenantId, r._count._all]));
  const m = countMap(members);
  const c = countMap(customers);
  const p = countMap(products);
  const q1 = countMap(quotes);
  const o = countMap(orders);

  type Row = (typeof tenants)[number] & { report: ReadinessReport };
  const rows: Row[] = tenants.map((t) => ({
    ...t,
    report: computeReadiness({
      tenant:        t,
      memberCount:   m.get(t.id) ?? 0,
      customerCount: c.get(t.id) ?? 0,
      productCount:  p.get(t.id) ?? 0,
      quoteCount:    q1.get(t.id) ?? 0,
      orderCount:    o.get(t.id) ?? 0,
    }),
  }));

  // Pre-filter dataset is "all non-archived (matching env/status/plan/search)";
  // KPI / funnel / blockers compute against THIS set so filters cascade.
  const totalTenants = rows.length;
  const readyRows    = rows.filter((r) => r.report.ready);
  const blockedRows  = rows.filter((r) => !r.report.ready);
  const avgScore     = totalTenants === 0 ? 0
    : Math.round(rows.reduce((s, r) => s + r.report.percent, 0) / totalTenants);

  // Stripe-linked %
  const stripeLinked = rows.filter((r) => Boolean(r.stripeCustomerId)).length;
  const stripePct    = totalTenants === 0 ? 0 : Math.round((stripeLinked / totalTenants) * 100);

  // ── Apply the readiness filter for the table ─────────────────
  const filtered = rows.filter((r) => {
    if (filter === "ready")   return r.report.ready;
    if (filter === "blocked") return !r.report.ready && r.report.requiredDone < r.report.requiredTotal;
    if (filter === "partial") return !r.report.ready && r.report.doneCount > 0;
    return true;
  });
  filtered.sort((a, b) => {
    if (a.report.ready !== b.report.ready) return a.report.ready ? 1 : -1;
    return a.report.percent - b.report.percent;
  });

  // ── KPI band ────────────────────────────────────────────────
  const readyPct = totalTenants === 0 ? 0 : Math.round((readyRows.length / totalTenants) * 100);
  const kpis: ReadinessKpi[] = [
    { label: "Total tenants",   value: totalTenants.toLocaleString(), hint: "Non-archived in scope" },
    { label: "Ready to launch", value: `${readyPct}%`,                hint: `${readyRows.length} of ${totalTenants}`, tone: readyPct >= 70 ? "success" : "default" },
    { label: "Blocked",         value: blockedRows.length.toLocaleString(), hint: blockedRows.length > 0 ? "Required setup missing" : "All clear", tone: blockedRows.length > 0 ? "danger" : "success", deltaInvert: true },
    { label: "Avg readiness",   value: `${avgScore}%`,                hint: "Across all checks",                  tone: avgScore >= 70 ? "success" : avgScore >= 40 ? "default" : "warning" },
    { label: "New (7d)",        value: new7d.toLocaleString(),        hint: `vs ${newPrior7d} prior week`,        deltaPct: pctDelta(new7d, newPrior7d), tone: "accent" },
    { label: "Stripe linked",   value: `${stripePct}%`,               hint: `${stripeLinked} tenants`,            tone: stripePct >= 80 ? "success" : "warning" },
  ];

  // ── Activation funnel ────────────────────────────────────────
  // Stages share a single denominator (totalTenants) so the % bar is
  // comparable. Each stage uses the *same* signal as the readiness
  // checks above.
  const stageOnboarding = rows.filter((r) => Boolean(r.onboardingCompletedAt)).length;
  const stageCustomer   = rows.filter((r) => (c.get(r.id) ?? 0) > 0).length;
  const stageProduct    = rows.filter((r) => (p.get(r.id) ?? 0) > 0).length;
  const stageQuote      = rows.filter((r) => (q1.get(r.id) ?? 0) > 0).length;
  const stageOrder      = rows.filter((r) => (o.get(r.id) ?? 0) > 0).length;
  const stageStripe     = stripeLinked;
  const stageReady      = readyRows.length;

  const funnel: FunnelStage[] = [
    { id: "created",     label: "Tenant created",         count: totalTenants },
    { id: "onboarding",  label: "Onboarding completed",   count: stageOnboarding },
    { id: "customer",    label: "First customer added",   count: stageCustomer },
    { id: "product",     label: "First product created",  count: stageProduct },
    { id: "quote",       label: "First quote created",    count: stageQuote },
    { id: "order",       label: "First order in production", count: stageOrder },
    { id: "stripe",      label: "Stripe customer linked", count: stageStripe },
    { id: "ready",       label: "Fully ready",            count: stageReady },
  ];

  // ── Blockers — for each readiness check, count tenants missing it ──
  // We pull the check ids/labels/required from the first tenant's report.
  // (Every report in this set has the same shape because computeReadiness
  // is pure and deterministic.)
  const checkTemplate: ReadinessCheck[] = rows[0]?.report.checks ?? [];
  const blockers: BlockerRow[] = checkTemplate.map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    required: tpl.required,
    blockedCount: rows.filter((r) =>
      !(r.report.checks.find((c) => c.id === tpl.id)?.done ?? false),
    ).length,
  }));

  // ── Insights ────────────────────────────────────────────────
  const insights: ReadinessInsight[] = [];
  // Biggest funnel drop-off.
  if (funnel.length >= 2 && funnel[0].count > 0) {
    let worstIdx = -1;
    let worstAbs = 0;
    for (let i = 1; i < funnel.length; i++) {
      const drop = funnel[i - 1].count - funnel[i].count;
      if (drop > worstAbs) {
        worstAbs = drop;
        worstIdx = i;
      }
    }
    if (worstIdx > 0) {
      const dropPct = ((worstAbs / funnel[worstIdx - 1].count) * 100).toFixed(0);
      insights.push({
        id: "funnel-drop",
        tone: "warning",
        text: `${dropPct}% of tenants drop between "${funnel[worstIdx - 1].label}" and "${funnel[worstIdx].label}".`,
      });
    }
  }
  // Top blocker.
  const topBlocker = [...blockers]
    .filter((b) => b.required && b.blockedCount > 0)
    .sort((a, b) => b.blockedCount - a.blockedCount)[0];
  if (topBlocker) {
    insights.push({
      id: "top-blocker",
      tone: "warning",
      text: `${topBlocker.label} is your biggest required blocker — ${topBlocker.blockedCount} tenant${topBlocker.blockedCount === 1 ? "" : "s"} stuck.`,
    });
  }
  // Stripe coverage callout.
  if (totalTenants >= 5 && stripePct < 70) {
    insights.push({
      id: "stripe-low",
      tone: "warning",
      text: `Only ${stripePct}% of tenants have a Stripe customer linked — billing won't run for the rest.`,
    });
  }
  // Trend / good news.
  const newDelta = pctDelta(new7d, newPrior7d);
  if (newDelta !== undefined && newDelta >= 0.25 && new7d >= 3) {
    insights.push({
      id: "new-up",
      tone: "positive",
      text: `Sign-ups up ${(newDelta * 100).toFixed(0)}% week-over-week — make sure onboarding can keep up.`,
    });
  }
  if (readyPct >= 80) {
    insights.push({
      id: "ready-strong",
      tone: "positive",
      text: `${readyPct}% of tenants are launch-ready — strong activation across the base.`,
    });
  }

  // ── Plan options for filter ──────────────────────────────────
  const planOptions = ["ALL", ...planRows.map((p) => p.plan)];

  // Build a same-search href with one param overridden.
  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (q)                         u.set("q", q);
    if (filter !== "all")          u.set("filter", filter);
    if (env !== "ALL")             u.set("env", env);
    if (statusFilter !== "ALL")    u.set("status", statusFilter);
    if (planFilter !== "ALL")      u.set("plan", planFilter);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/readiness?${qs}` : "/platform/readiness";
  };

  return (
    <div className="space-y-6">
      {/* ── Header ───────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Launch readiness
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Mission control for tenant activation. <b style={{ color: "var(--text-default)" }}>{readyRows.length}</b> ready ·{" "}
          <b style={{ color: "var(--text-default)" }}>{blockedRows.length}</b> still missing required setup.
        </p>
      </div>

      {/* ── KPI band ─────────────────────────────────────── */}
      <ReadinessKPIBand kpis={kpis} />

      {/* ── Insights strip ───────────────────────────────── */}
      {insights.length > 0 && <ReadinessInsights insights={insights.slice(0, 4)} />}

      {/* ── Funnel + blockers (side-by-side on wide) ──────── */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ActivationFunnel stages={funnel} />
        <ReadinessBlockers blockers={blockers} totalTenants={totalTenants} />
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Tenant name or slug"
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Readiness</span>
          <select
            name="filter"
            defaultValue={filter}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {FILTER_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Plan</span>
          <select
            name="plan"
            defaultValue={planFilter}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {planOptions.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Env</span>
          <select
            name="env"
            defaultValue={env}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {ENV_OPTIONS.map((e) => (<option key={e} value={e}>{e}</option>))}
          </select>
        </label>
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || filter !== "all" || env !== "ALL" || statusFilter !== "ALL" || planFilter !== "ALL") && (
          <Link
            href="/platform/readiness"
            className="self-center text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Tenant table ─────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <header
          className="flex items-baseline justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Tenants
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Sorted by needs-attention first. Click a row to drill into the tenant detail.
            </p>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {filtered.length} of {totalTenants}
          </span>
        </header>

        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>🚀</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              No tenants match the current filters.
            </div>
          </div>
        ) : (
          <ul>
            {filtered.map((t, idx) => {
              const required = t.report.checks.filter((c) => c.required && !c.done);
              const optional = t.report.checks.filter((c) => !c.required && !c.done);
              const risk = computeRisk(t);
              const lastActivityLabel = lastActivityRel(t.lastActivityAt ?? t.createdAt, now);
              return (
                <li
                  key={t.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <Link
                    href={`/platform/tenants/${t.id}`}
                    className="grid grid-cols-1 gap-3 px-5 py-3.5 transition-colors hover:opacity-95 md:grid-cols-[1fr_120px_140px_200px_120px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="truncate text-sm font-semibold"
                          style={{ color: "var(--text-default)" }}
                        >
                          {t.name}
                        </span>
                        <span className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                          {t.slug}
                        </span>
                        <StatusPill status={t.status} />
                        {t.environment !== "LIVE" && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: "var(--accent-surface)",
                              color: "var(--accent-primary)",
                            }}
                          >
                            {t.environment}
                          </span>
                        )}
                        {t.betaCohort !== "NONE" && (() => {
                          const chip = cohortChip(t.betaCohort);
                          return (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                              style={{ background: chip.bg, color: chip.fg }}
                            >
                              {cohortLabel(t.betaCohort)}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {required.slice(0, 3).map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full px-2 py-0.5"
                            style={{
                              background: "var(--danger-surface)",
                              color: "var(--danger-fg)",
                              border: "1px solid var(--danger-fg)",
                            }}
                            title={c.hint}
                          >
                            ✖ {c.label}
                          </span>
                        ))}
                        {optional.slice(0, Math.max(0, 4 - required.length)).map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full px-2 py-0.5"
                            style={{
                              background: "var(--surface-2)",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border-subtle)",
                            }}
                            title={c.hint}
                          >
                            · {c.label}
                          </span>
                        ))}
                        {required.length === 0 && optional.length === 0 && (
                          <span style={{ color: "var(--success-fg)" }}>All checks pass</span>
                        )}
                        {(required.length + optional.length) > 4 && (
                          <span style={{ color: "var(--text-muted)" }}>
                            +{(required.length + optional.length) - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {t.plan}
                    </div>
                    <div className="text-xs">
                      <RiskPill level={risk} />
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span
                          className="font-semibold tabular-nums"
                          style={{
                            color:
                              t.report.ready ? "var(--success-fg)" :
                              t.report.percent >= 60 ? "var(--warning-fg)" :
                              "var(--danger-fg)",
                          }}
                        >
                          {t.report.percent}%
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {t.report.requiredDone}/{t.report.requiredTotal} req
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full"
                        style={{ background: "var(--surface-3)" }}
                      >
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{
                            width: `${t.report.percent}%`,
                            background:
                              t.report.ready ? "var(--success-fg)" :
                              t.report.percent >= 60 ? "var(--warning-fg)" :
                              "var(--danger-fg)",
                            transitionDuration: "var(--duration-base)",
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                      {lastActivityLabel}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  // The buildHref helper is defined inside the component scope above —
  // referenced through closure in any future quick-action chips we add.
  // Currently unused in render; kept for the same reason filters are
  // wired through searchParams (to be picked up by chip-style controls
  // when this surface gets quick toggles).
  void buildHref;
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

type Risk = "healthy" | "at-risk" | "critical";

function computeRisk(row: {
  status: string;
  report: ReadinessReport;
  lastActivityAt: Date | null;
  createdAt: Date;
}): Risk {
  // Critical: required missing AND inactive 14+ days
  // At risk:  required missing OR inactive 7-14 days OR < 50% complete
  // Healthy:  required all met AND active in last 7d
  const lastTouched = row.lastActivityAt ?? row.createdAt;
  const daysIdle = Math.floor((Date.now() - lastTouched.getTime()) / DAY_MS);
  const requiredOpen = row.report.requiredTotal - row.report.requiredDone;
  if (requiredOpen > 0 && daysIdle >= 14) return "critical";
  if (requiredOpen > 0 || daysIdle >= 7 || row.report.percent < 50) return "at-risk";
  return "healthy";
}

function RiskPill({ level }: { level: Risk }) {
  const palette =
    level === "healthy"  ? { bg: "var(--success-surface)", fg: "var(--success-fg)", label: "Healthy" } :
    level === "at-risk"  ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "At risk" } :
                            { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  label: "Critical" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.fg }} />
      {palette.label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const palette =
    status === "ACTIVE"    ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
    status === "TRIAL"     ? { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" } :
    status === "PAST_DUE"  ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" } :
    status === "SUSPENDED" ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)" } :
                              { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {status.toLowerCase()}
    </span>
  );
}

function lastActivityRel(d: Date, now: Date): string {
  const days = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
  if (days === 0) return "Active today";
  if (days === 1) return "Active 1d ago";
  if (days < 7)   return `Active ${days}d ago`;
  if (days < 30)  return `Idle ${days}d`;
  return `Dormant ${days}d`;
}

function pctDelta(current: number, prior: number): number | undefined {
  if (prior <= 0) return current > 0 ? 1 : undefined;
  return (current - prior) / prior;
}
