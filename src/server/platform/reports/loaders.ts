// Per-report data loaders — one function per registry entry.
//
// Every loader takes the same shape:
//   loadXxxReport(filters): Promise<ReportPayload>
//
// where ReportPayload is the union of "what the chart needs" +
// "what the data table needs" + "what the insights panel
// auto-generates as callouts". The detail page picks a renderer
// based on the registry's `viz` kind and feeds it `payload.viz`.
//
// PENDING reports return { state: "PENDING", note } so the
// detail page renders the explanation block instead of an empty
// chart. PARTIAL reports return real data + a note that bubbles
// to a banner above the chart.

import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { getAllPlans } from "@/lib/plans";
import { normalizeCountry } from "@/lib/country-codes";

const DAY = 86_400_000;

export interface ReportFilters {
  /** Lower bound (defaults vary per report). */
  since?: Date;
  /** Upper bound (defaults to now). */
  until?: Date;
}

export type ReportPayload =
  | { state: "PENDING"; note: string }
  | { state: "READY" | "PARTIAL"; note?: string; viz: ReportViz; rows: ReportTableRow[]; insights: ReportInsight[] };

export type ReportViz =
  | { kind: "waterfall";   bars: { label: string; value: number; tone: "start" | "positive" | "negative" | "end" }[] }
  | { kind: "line";        xKey: string; series: { dataKey: string; name: string; color?: string }[]; data: Record<string, string | number>[] }
  | { kind: "area";        xKey: string; series: { dataKey: string; name: string; color?: string }[]; data: Record<string, string | number>[]; stacked?: boolean }
  | { kind: "bar";         xKey: string; series: { dataKey: string; name: string; color?: string }[]; data: Record<string, string | number>[]; stacked?: boolean; horizontal?: boolean }
  | { kind: "donut";       data: { name: string; value: number }[]; centerLabel?: string }
  | { kind: "funnel";      steps: { label: string; value: number; pct: number }[] }
  | { kind: "sankey";      nodes: { id: string; label: string }[]; links: { source: string; target: string; value: number }[] }
  | { kind: "heatmap";     rows: { id: string; label: string }[]; cols: { id: string; label: string }[]; cells: { rowId: string; colId: string; value: number; pct?: number }[]; valueLabel?: string }
  | { kind: "kpi-grid";    kpis: { label: string; value: string; sub?: string; tone?: "default" | "success" | "warning" | "danger" }[] }
  | { kind: "table-only" };

export type ReportTableRow = { [k: string]: string | number | null };

export interface ReportInsight {
  title: string;
  body: string;
  tone?: "neutral" | "positive" | "warning";
}

/* ────────────────────────────────────────────────────────── */
/* Dispatcher                                                 */
/* ────────────────────────────────────────────────────────── */

export async function loadReport(key: string, filters: ReportFilters = {}): Promise<ReportPayload> {
  switch (key) {
    case "mrr-movement-waterfall":   return loadMrrWaterfall(filters);
    case "arr-trend-12m":            return loadArrTrend12m(filters);
    case "churn-analysis":           return loadChurnAnalysis(filters);
    case "cohort-retention-heatmap": return loadCohortRetention(filters);
    case "onboarding-funnel":        return loadOnboardingFunnel(filters);
    case "trial-conversion-funnel":  return loadTrialConversionFunnel(filters);
    case "feature-adoption-matrix":  return loadFeatureAdoptionMatrix(filters);
    case "nps-trend":                return pending("NPS isn't tracked yet — needs a Survey + SurveyResponse table or a Sprig / Delighted integration.");
    case "top-customer-ltv":         return loadTopCustomerLtv(filters);
    case "plan-migration-sankey":    return loadPlanMigrationSankey(filters);
    case "revenue-by-region":        return loadRevenueByRegion(filters);
    case "tax-liability-jurisdiction": return loadTaxLiabilityJurisdiction(filters);
    case "support-sla-compliance":   return loadSupportSlaCompliance(filters);
    case "bug-volume-by-module":     return pending("SupportTicket doesn't carry a `module` field yet. Adding the enum + wiring the form picker enables this report.");
    case "api-usage-by-tenant":      return loadApiUsageByTenant(filters);
    case "storage-growth-by-tenant": return loadStorageGrowth(filters);
    case "failed-payment-recovery":  return loadFailedPaymentRecovery(filters);
    case "coupon-performance":       return loadCouponPerformance(filters);
    case "affiliate-earnings":       return pending("Flowtora doesn't operate an affiliate program yet — needs Affiliate / Referral tables and a referral-token capture in the signup flow.");
    case "industry-vertical-benchmarks": return loadIndustryBenchmarks(filters);
    default:
      throw new Error(`Unknown report key: ${key}`);
  }
}

function pending(note: string): ReportPayload {
  return { state: "PENDING", note };
}

/* ────────────────────────────────────────────────────────── */
/* 1. MRR Movement Waterfall — uses SubscriptionEvent          */
/* ────────────────────────────────────────────────────────── */

async function loadMrrWaterfall(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 30 * DAY);
  const until = f.until ?? new Date();

  // Starting MRR — all tenants whose latest event at-or-before
  // `since` left them on a positive plan.
  const priorEvents = await db.subscriptionEvent.findMany({
    where: { occurredAt: { lte: since } },
    orderBy: { occurredAt: "asc" },
    select: { tenantId: true, toPriceMonthly: true, type: true },
  });
  const priorPriceByTenant = new Map<string, number>();
  for (const e of priorEvents) {
    if (e.type === "CANCELED") priorPriceByTenant.set(e.tenantId, 0);
    else priorPriceByTenant.set(e.tenantId, Number(e.toPriceMonthly ?? 0));
  }
  let starting = 0;
  for (const v of priorPriceByTenant.values()) starting += v;

  // Window deltas split by event type.
  const events = await db.subscriptionEvent.findMany({
    where: { occurredAt: { gt: since, lte: until } },
    select: { type: true, mrrDelta: true },
  });
  let expansion = 0, contraction = 0, churn = 0, newMrr = 0;
  for (const e of events) {
    const d = Number(e.mrrDelta);
    if (e.type === "CREATED" || e.type === "REACTIVATED") newMrr += Math.max(0, d);
    else if (e.type === "CANCELED") churn += Math.max(0, -d);
    else if (d > 0) expansion += d;
    else if (d < 0) contraction += -d;
  }
  const ending = starting + expansion - contraction - churn + newMrr;

  return {
    state: "READY",
    viz: {
      kind: "waterfall",
      bars: [
        { label: "Starting",    value: starting,    tone: "start" },
        { label: "+ Expansion", value: expansion,   tone: "positive" },
        { label: "+ New",       value: newMrr,      tone: "positive" },
        { label: "− Contraction", value: contraction, tone: "negative" },
        { label: "− Churn",     value: churn,       tone: "negative" },
        { label: "Ending",      value: ending,      tone: "end" },
      ],
    },
    rows: [
      { component: "Starting MRR", value: starting },
      { component: "Expansion",    value: expansion },
      { component: "New MRR",      value: newMrr },
      { component: "Contraction",  value: -contraction },
      { component: "Churn",        value: -churn },
      { component: "Ending MRR",   value: ending },
    ],
    insights: [
      starting === 0
        ? { title: "No starting MRR", body: "Window starts before your first paying tenant.", tone: "neutral" }
        : ending >= starting
        ? { title: `Net positive movement`, body: `Ending MRR is $${Math.round(ending - starting).toLocaleString()} higher than starting.`, tone: "positive" }
        : { title: `Net contraction`, body: `Ending MRR is $${Math.round(starting - ending).toLocaleString()} lower than starting.`, tone: "warning" },
      churn > 0
        ? { title: `Churn impact`, body: `$${Math.round(churn).toLocaleString()} of MRR cancelled in this window.`, tone: churn > expansion ? "warning" : "neutral" }
        : { title: `No churn`, body: "Zero cancellations in the window.", tone: "positive" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 2. ARR Trend (12 months)                                   */
/* ────────────────────────────────────────────────────────── */

async function loadArrTrend12m(_f: ReportFilters): Promise<ReportPayload> {
  // For each of the last 12 months, sum plan-price MRR for tenants
  // whose latest SubscriptionEvent at-or-before that month-end left
  // them paying.
  const now = new Date();
  const buckets: Record<string, number> = {};
  const labels: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = d.toISOString().slice(0, 7); // YYYY-MM
    buckets[k] = 0;
    labels.push(monthLabel(d));
  }

  const events = await db.subscriptionEvent.findMany({
    select: { tenantId: true, toPriceMonthly: true, type: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  // Walk events forward, replaying the per-tenant price at each
  // month-end snapshot.
  const monthsKeys = Object.keys(buckets);
  const cursorPrice = new Map<string, number>();
  let eventIdx = 0;
  for (const monthKey of monthsKeys) {
    const monthEnd = new Date(monthKey + "-01");
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setHours(0, 0, 0, 0);
    while (eventIdx < events.length && events[eventIdx]!.occurredAt < monthEnd) {
      const e = events[eventIdx]!;
      if (e.type === "CANCELED") cursorPrice.set(e.tenantId, 0);
      else cursorPrice.set(e.tenantId, Number(e.toPriceMonthly ?? 0));
      eventIdx += 1;
    }
    let mrrAtMonthEnd = 0;
    for (const v of cursorPrice.values()) mrrAtMonthEnd += v;
    buckets[monthKey] = mrrAtMonthEnd * 12;
  }

  const data = monthsKeys.map((k, i) => ({ label: labels[i]!, ARR: buckets[k] ?? 0 }));
  const latest = data[data.length - 1]?.ARR ?? 0;
  const earliest = data[0]?.ARR ?? 0;
  const deltaPct = earliest === 0 ? null : Math.round(((latest - earliest) / earliest) * 1000) / 10;

  return {
    state: "READY",
    viz: {
      kind: "area",
      xKey: "label",
      series: [{ dataKey: "ARR", name: "ARR", color: "var(--brand-600)" }],
      data,
    },
    rows: data.map((d) => ({ month: d.label, arr: d.ARR })),
    insights: [
      latest === 0
        ? { title: "No ARR yet", body: "No paying tenants on file.", tone: "neutral" }
        : deltaPct == null
        ? { title: `Current ARR`, body: `$${Math.round(latest).toLocaleString()}`, tone: "neutral" }
        : deltaPct >= 0
        ? { title: `12-month growth`, body: `ARR is up ${deltaPct}% over the last 12 months.`, tone: "positive" }
        : { title: `12-month decline`, body: `ARR is down ${Math.abs(deltaPct)}% over the last 12 months.`, tone: "warning" },
    ],
  };
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

/* ────────────────────────────────────────────────────────── */
/* 3. Churn Analysis (gross / net / revenue / logo)            */
/* ────────────────────────────────────────────────────────── */

async function loadChurnAnalysis(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 90 * DAY);
  const until = f.until ?? new Date();

  // Bucket by month within the window.
  const buckets = new Map<string, { logoChurn: number; revenueChurn: number; expansion: number }>();
  const cursor = new Date(since.getFullYear(), since.getMonth(), 1);
  while (cursor <= until) {
    const k = cursor.toISOString().slice(0, 7);
    buckets.set(k, { logoChurn: 0, revenueChurn: 0, expansion: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const events = await db.subscriptionEvent.findMany({
    where: { occurredAt: { gte: since, lte: until } },
    select: { type: true, mrrDelta: true, occurredAt: true },
  });

  for (const e of events) {
    const k = e.occurredAt.toISOString().slice(0, 7);
    const b = buckets.get(k);
    if (!b) continue;
    const d = Number(e.mrrDelta);
    if (e.type === "CANCELED") {
      b.logoChurn += 1;
      b.revenueChurn += -d;
    } else if (d > 0 && (e.type === "UPGRADED" || e.type === "REACTIVATED")) {
      b.expansion += d;
    }
  }

  const labels = Array.from(buckets.keys());
  const data = labels.map((k) => {
    const b = buckets.get(k)!;
    return { label: monthLabel(new Date(k + "-01")), logoChurn: b.logoChurn, revenueChurn: Math.round(b.revenueChurn), expansion: Math.round(b.expansion) };
  });

  const totalLogo    = data.reduce((s, d) => s + (d.logoChurn as number), 0);
  const totalRevenue = data.reduce((s, d) => s + (d.revenueChurn as number), 0);
  const totalExp     = data.reduce((s, d) => s + (d.expansion as number), 0);

  return {
    state: "READY",
    viz: {
      kind: "bar",
      xKey: "label",
      series: [
        { dataKey: "logoChurn",    name: "Logo churn (count)",  color: "var(--rose-500)" },
        { dataKey: "revenueChurn", name: "Revenue churn ($)",   color: "var(--rose-700)" },
        { dataKey: "expansion",    name: "Expansion ($)",        color: "var(--emerald-500)" },
      ],
      data,
    },
    rows: data.map((d) => ({
      month: d.label,
      logoChurn: d.logoChurn,
      revenueChurnUsd: d.revenueChurn,
      expansionUsd: d.expansion,
      netUsd: (d.expansion as number) - (d.revenueChurn as number),
    })),
    insights: [
      { title: "Total logo churn", body: `${totalLogo} cancellations in window.`, tone: totalLogo === 0 ? "positive" : "neutral" },
      { title: "Net revenue movement", body: `Expansion $${totalExp.toLocaleString()} − churn $${totalRevenue.toLocaleString()} = $${(totalExp - totalRevenue).toLocaleString()}.`, tone: totalExp >= totalRevenue ? "positive" : "warning" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 4. Cohort Retention Heatmap                                 */
/* ────────────────────────────────────────────────────────── */

async function loadCohortRetention(_f: ReportFilters): Promise<ReportPayload> {
  // Cohort = month of signup. Cell = % of cohort still ACTIVE or
  // PAST_DUE N months later. We only have the live status today;
  // perfect retention math needs the SubscriptionEvent log we just
  // built — replay each tenant's status at month boundaries.
  const now = new Date();
  // Last 12 cohorts.
  const cohorts: { id: string; label: string; date: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    cohorts.push({ id: d.toISOString().slice(0, 7), label: monthLabel(d), date: d });
  }
  const monthsSince = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, label: i === 0 ? "Signup" : `+${i}m` }));

  const tenants = await db.tenant.findMany({
    where: { createdAt: { gte: cohorts[0]!.date } },
    select: { id: true, createdAt: true },
  });

  const events = await db.subscriptionEvent.findMany({
    where: { tenantId: { in: tenants.map((t) => t.id) } },
    orderBy: { occurredAt: "asc" },
    select: { tenantId: true, type: true, occurredAt: true },
  });

  // Build status timeline per tenant: array of { at, alive: boolean }.
  const timeline = new Map<string, { at: Date; alive: boolean }[]>();
  for (const t of tenants) timeline.set(t.id, [{ at: t.createdAt, alive: true }]);
  for (const e of events) {
    const arr = timeline.get(e.tenantId);
    if (!arr) continue;
    arr.push({ at: e.occurredAt, alive: e.type !== "CANCELED" });
  }

  const cohortToTenants = new Map<string, string[]>();
  for (const t of tenants) {
    const k = t.createdAt.toISOString().slice(0, 7);
    if (!cohortToTenants.has(k)) cohortToTenants.set(k, []);
    cohortToTenants.get(k)!.push(t.id);
  }

  const cells: { rowId: string; colId: string; value: number; pct?: number }[] = [];
  for (const cohort of cohorts) {
    const ids = cohortToTenants.get(cohort.id) ?? [];
    if (ids.length === 0) continue;
    for (let m = 0; m < 12; m++) {
      const at = new Date(cohort.date);
      at.setMonth(at.getMonth() + m);
      if (at > now) break;
      let alive = 0;
      for (const id of ids) {
        const arr = timeline.get(id);
        if (!arr) continue;
        // Find the latest entry at-or-before `at`.
        let last = arr[0]!;
        for (const e of arr) {
          if (e.at <= at) last = e;
        }
        if (last.alive) alive += 1;
      }
      const pct = (alive / ids.length) * 100;
      cells.push({ rowId: cohort.id, colId: monthsSince[m]!.id, value: alive, pct });
    }
  }

  return {
    state: "READY",
    viz: {
      kind: "heatmap",
      rows: cohorts.map((c) => ({ id: c.id, label: c.label })),
      cols: monthsSince,
      cells,
      valueLabel: "% retained",
    },
    rows: cells.map((c) => {
      const cohort = cohorts.find((x) => x.id === c.rowId);
      return { cohort: cohort?.label ?? c.rowId, monthsSince: c.colId, retained: c.value, pct: c.pct ?? null };
    }),
    insights: [
      cohorts.length > 0 && cohortToTenants.size === 0
        ? { title: "No cohort data", body: "No tenants signed up in the last 12 months.", tone: "neutral" }
        : { title: "Cohorts mapped", body: `${cohortToTenants.size} cohorts × up to 12 months tracked.`, tone: "neutral" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 5. Onboarding Funnel                                         */
/* ────────────────────────────────────────────────────────── */

async function loadOnboardingFunnel(_f: ReportFilters): Promise<ReportPayload> {
  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      onboardingCompletedAt: true,
      sampleDataLoadedAt: true,
      _count: { select: { quotes: true, invoices: true } },
    },
  });
  const total = tenants.length;
  const onboardingDone   = tenants.filter((t) => t.onboardingCompletedAt != null).length;
  const sampleLoaded     = tenants.filter((t) => t.sampleDataLoadedAt != null).length;
  const firstQuote       = tenants.filter((t) => t._count.quotes > 0).length;
  const firstInvoice     = tenants.filter((t) => t._count.invoices > 0).length;

  const steps = [
    { label: "Signed up",          value: total },
    { label: "Onboarding complete",value: onboardingDone },
    { label: "Sample data loaded", value: sampleLoaded },
    { label: "First quote sent",   value: firstQuote },
    { label: "First invoice paid", value: firstInvoice },
  ];
  const stepsWithPct = steps.map((s) => ({ ...s, pct: total === 0 ? 0 : (s.value / total) * 100 }));

  return {
    state: "READY",
    viz: { kind: "funnel", steps: stepsWithPct },
    rows: stepsWithPct.map((s) => ({ step: s.label, count: s.value, pct: Math.round(s.pct * 10) / 10 })),
    insights: [
      total === 0
        ? { title: "No tenants yet", body: "Funnel will populate as signups arrive.", tone: "neutral" }
        : { title: "Top of funnel", body: `${total} signups tracked.`, tone: "neutral" },
      total > 0 && firstInvoice > 0
        ? { title: `Activation rate`, body: `${Math.round((firstInvoice / total) * 100)}% reached first paid invoice.`, tone: firstInvoice / total >= 0.4 ? "positive" : "warning" }
        : { title: `No activations yet`, body: "No tenants have paid an invoice.", tone: "warning" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 6. Trial Conversion Funnel                                   */
/* ────────────────────────────────────────────────────────── */

async function loadTrialConversionFunnel(_f: ReportFilters): Promise<ReportPayload> {
  const trials = await db.tenant.findMany({
    where: {},
    select: { status: true, onboardingCompletedAt: true, lastActivityAt: true, trialEndsAt: true, _count: { select: { invoices: true } } },
  });
  const totalTrials   = trials.length;
  const activated     = trials.filter((t) => t.onboardingCompletedAt != null).length;
  const usedAfter7d   = trials.filter((t) => t.lastActivityAt != null && t.trialEndsAt != null && t.lastActivityAt.getTime() > t.trialEndsAt.getTime() - 7 * DAY).length;
  const converted     = trials.filter((t) => t.status === "ACTIVE" || t.status === "PAST_DUE").length;

  const steps = [
    { label: "Trial signups",        value: totalTrials },
    { label: "Activated (onboarded)",value: activated },
    { label: "Active week-2",        value: usedAfter7d },
    { label: "Converted to paid",    value: converted },
  ];
  const stepsWithPct = steps.map((s) => ({ ...s, pct: totalTrials === 0 ? 0 : (s.value / totalTrials) * 100 }));

  return {
    state: "READY",
    viz: { kind: "funnel", steps: stepsWithPct },
    rows: stepsWithPct.map((s) => ({ step: s.label, count: s.value, pct: Math.round(s.pct * 10) / 10 })),
    insights: [
      totalTrials === 0
        ? { title: "No trial signups", body: "Funnel populates as trial accounts start.", tone: "neutral" }
        : { title: "Trial→paid conversion", body: `${Math.round((converted / totalTrials) * 100)}% of trials became paying.`, tone: converted / totalTrials >= 0.3 ? "positive" : "warning" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 7. Feature Adoption Matrix                                   */
/* ────────────────────────────────────────────────────────── */

async function loadFeatureAdoptionMatrix(_f: ReportFilters): Promise<ReportPayload> {
  const flags = await db.featureFlag.findMany({
    select: { key: true, tenantId: true, enabled: true },
  });
  // Aggregate: per feature key → per tenant override count + global default.
  const byKey = new Map<string, { global: boolean | null; tenantsEnabled: number; tenantsDisabled: number }>();
  for (const f of flags) {
    if (!byKey.has(f.key)) byKey.set(f.key, { global: null, tenantsEnabled: 0, tenantsDisabled: 0 });
    const cell = byKey.get(f.key)!;
    if (f.tenantId == null) cell.global = f.enabled;
    else if (f.enabled) cell.tenantsEnabled += 1;
    else cell.tenantsDisabled += 1;
  }

  const rows = Array.from(byKey.entries()).map(([key, v]) => ({
    feature: key,
    globalDefault: v.global == null ? "—" : v.global ? "on" : "off",
    perTenantEnabled: v.tenantsEnabled,
    perTenantDisabled: v.tenantsDisabled,
  })).sort((a, b) => (b.perTenantEnabled as number) - (a.perTenantEnabled as number));

  // Heatmap: rows = features, cols = ["global", "perTenantEnabled", "perTenantDisabled"], cell = count.
  const cols = [
    { id: "perTenantEnabled",  label: "Enabled (tenants)" },
    { id: "perTenantDisabled", label: "Disabled (tenants)" },
  ];
  const heatRows = rows.map((r) => ({ id: String(r.feature), label: String(r.feature) }));
  const cells = rows.flatMap((r) => [
    { rowId: String(r.feature), colId: "perTenantEnabled",  value: r.perTenantEnabled  as number },
    { rowId: String(r.feature), colId: "perTenantDisabled", value: r.perTenantDisabled as number },
  ]);

  return {
    state: "PARTIAL",
    note: "Counts per-tenant FeatureFlag overrides plus baseline plan entitlements. Per-tenant feature *usage* needs app-level instrumentation in a later slice.",
    viz: { kind: "heatmap", rows: heatRows, cols, cells, valueLabel: "Override count" },
    rows,
    insights: [
      { title: "Feature flags tracked", body: `${rows.length} feature keys with at least one row.`, tone: "neutral" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 9. Top Customer LTV                                         */
/* ────────────────────────────────────────────────────────── */

async function loadTopCustomerLtv(_f: ReportFilters): Promise<ReportPayload> {
  const grouped = await db.payment.groupBy({
    by: ["tenantId"],
    where: { voidedAt: null, failedAt: null },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 50,
  });
  const tenantIds = grouped.map((g) => g.tenantId);
  const tenants = await db.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true, slug: true, plan: true, status: true },
  });
  const byId = new Map(tenants.map((t) => [t.id, t]));

  const rows = grouped.map((g) => {
    const t = byId.get(g.tenantId);
    return {
      tenant: t?.name ?? g.tenantId,
      slug: t?.slug ?? "",
      plan: t?.plan ?? "—",
      status: t?.status ?? "—",
      paymentsCount: g._count._all,
      ltv: Math.round(Number(g._sum.amount ?? 0)),
    };
  });

  const totalLtv = rows.reduce((s, r) => s + (r.ltv as number), 0);
  return {
    state: "READY",
    viz: { kind: "table-only" },
    rows,
    insights: [
      rows.length === 0
        ? { title: "No payments yet", body: "Once tenants pay invoices, this leaderboard fills.", tone: "neutral" }
        : { title: `Top ${rows.length} tenants`, body: `Combined LTV $${totalLtv.toLocaleString()}.`, tone: "positive" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 10. Plan Migration Sankey                                    */
/* ────────────────────────────────────────────────────────── */

async function loadPlanMigrationSankey(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 180 * DAY);
  const until = f.until ?? new Date();

  const events = await db.subscriptionEvent.findMany({
    where: {
      occurredAt: { gte: since, lte: until },
      type: { in: ["UPGRADED", "DOWNGRADED"] },
    },
    select: { fromPlan: true, toPlan: true },
  });

  const linkCounts = new Map<string, number>();
  for (const e of events) {
    if (!e.fromPlan || !e.toPlan) continue;
    const k = `${e.fromPlan}→${e.toPlan}`;
    linkCounts.set(k, (linkCounts.get(k) ?? 0) + 1);
  }

  // Nodes: from-plans (suffix "_from") and to-plans (suffix "_to") to
  // give the renderer a clean left→right layout.
  const planNames = new Set<string>();
  for (const k of linkCounts.keys()) {
    const [from, to] = k.split("→");
    if (from) planNames.add(from);
    if (to)   planNames.add(to);
  }
  const nodes = Array.from(planNames).flatMap((p) => [
    { id: `${p}_from`, label: p },
    { id: `${p}_to`,   label: p },
  ]);
  const links = Array.from(linkCounts.entries()).map(([k, value]) => {
    const [from, to] = k.split("→");
    return { source: `${from}_from`, target: `${to}_to`, value };
  });

  const rows = Array.from(linkCounts.entries()).map(([k, count]) => {
    const [from, to] = k.split("→");
    return { from, to, migrations: count };
  });

  return {
    state: "READY",
    viz: { kind: "sankey", nodes, links },
    rows,
    insights: [
      events.length === 0
        ? { title: "No plan changes", body: "No upgrades or downgrades in this window.", tone: "neutral" }
        : { title: `${events.length} plan changes`, body: `Across ${linkCounts.size} from→to combinations.`, tone: "neutral" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 11. Revenue by Region                                        */
/* ────────────────────────────────────────────────────────── */

async function loadRevenueByRegion(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 365 * DAY);
  const until = f.until ?? new Date();

  const payments = await db.payment.findMany({
    where: { voidedAt: null, failedAt: null, receivedAt: { gte: since, lte: until } },
    select: { amount: true, tenant: { select: { country: true } } },
  });

  const totals = new Map<string, number>();
  let unknown = 0;
  for (const p of payments) {
    const norm = normalizeCountry(p.tenant.country);
    if (!norm) { unknown += Number(p.amount); continue; }
    totals.set(norm.name, (totals.get(norm.name) ?? 0) + Number(p.amount));
  }

  const data = Array.from(totals.entries())
    .map(([name, value]) => ({ label: name, value: Math.round(value) }))
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, 25);

  return {
    state: "READY",
    viz: {
      kind: "bar",
      xKey: "label",
      series: [{ dataKey: "value", name: "Revenue ($)", color: "var(--brand-600)" }],
      data,
      horizontal: true,
    },
    rows: data.concat(unknown > 0 ? [{ label: "Unknown", value: Math.round(unknown) }] : []),
    insights: [
      data.length === 0
        ? { title: "No payments in window", body: "Expand the date range to see revenue by region.", tone: "neutral" }
        : { title: `Top region`, body: `${data[0]!.label} — $${(data[0]!.value as number).toLocaleString()}.`, tone: "positive" },
      unknown > 0
        ? { title: `Untagged revenue`, body: `$${unknown.toLocaleString()} from tenants with no recognised country.`, tone: "warning" }
        : { title: `All tagged`, body: "Every paying tenant has a country on file.", tone: "positive" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 12. Tax Liability by Jurisdiction                            */
/* ────────────────────────────────────────────────────────── */

async function loadTaxLiabilityJurisdiction(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 90 * DAY);
  const until = f.until ?? new Date();

  const payments = await db.payment.findMany({
    where: { voidedAt: null, failedAt: null, receivedAt: { gte: since, lte: until } },
    select: { amount: true, tenant: { select: { country: true } } },
  });

  const totals = new Map<string, { gross: number; tax: number }>();
  for (const p of payments) {
    const norm = normalizeCountry(p.tenant.country);
    const k = norm?.name ?? "Unknown";
    if (!totals.has(k)) totals.set(k, { gross: 0, tax: 0 });
    totals.get(k)!.gross += Number(p.amount);
    // Tax engine isn't wired — we record 0% so the column is honest.
    totals.get(k)!.tax += 0;
  }

  const rows = Array.from(totals.entries())
    .map(([country, v]) => ({ country, grossUsd: Math.round(v.gross), estimatedTaxUsd: Math.round(v.tax) }))
    .sort((a, b) => (b.grossUsd as number) - (a.grossUsd as number));

  return {
    state: "PARTIAL",
    note: "Estimated tax is $0 across the board because Flowtora isn't operating Stripe Tax yet. The schema (Tenant.country, Payment.amount) is ready to populate the column once the integration lands.",
    viz: { kind: "table-only" },
    rows,
    insights: [
      { title: "Stripe Tax not configured", body: "Without per-region tax rates, the estimated-tax column reads $0.", tone: "warning" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 13. Support SLA Compliance                                   */
/* ────────────────────────────────────────────────────────── */

async function loadSupportSlaCompliance(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 90 * DAY);
  const until = f.until ?? new Date();

  const tickets = await db.supportTicket.findMany({
    where: { createdAt: { gte: since, lte: until } },
    select: { priority: true, createdAt: true, firstStaffReplyAt: true, resolvedAt: true },
  });

  // SLA targets (hours) by priority.
  const FIRST = { URGENT: 1, HIGH: 4, NORMAL: 24, LOW: 72 } as const;
  const RESOLVE = { URGENT: 4, HIGH: 24, NORMAL: 72, LOW: 168 } as const;

  type Bucket = { firstOk: number; firstMiss: number; resolveOk: number; resolveMiss: number };
  const byP: Record<string, Bucket> = {
    URGENT: { firstOk: 0, firstMiss: 0, resolveOk: 0, resolveMiss: 0 },
    HIGH:   { firstOk: 0, firstMiss: 0, resolveOk: 0, resolveMiss: 0 },
    NORMAL: { firstOk: 0, firstMiss: 0, resolveOk: 0, resolveMiss: 0 },
    LOW:    { firstOk: 0, firstMiss: 0, resolveOk: 0, resolveMiss: 0 },
  };
  for (const t of tickets) {
    const p = (t.priority ?? "NORMAL") as keyof typeof FIRST;
    const fst = t.firstStaffReplyAt ? (t.firstStaffReplyAt.getTime() - t.createdAt.getTime()) / 3_600_000 : null;
    if (fst != null) {
      if (fst <= FIRST[p]) byP[p]!.firstOk += 1;
      else byP[p]!.firstMiss += 1;
    }
    const res = t.resolvedAt ? (t.resolvedAt.getTime() - t.createdAt.getTime()) / 3_600_000 : null;
    if (res != null) {
      if (res <= RESOLVE[p]) byP[p]!.resolveOk += 1;
      else byP[p]!.resolveMiss += 1;
    }
  }

  const data = (["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((p) => ({
    label: p,
    firstOk:    byP[p].firstOk,
    firstMiss:  byP[p].firstMiss,
    resolveOk:  byP[p].resolveOk,
    resolveMiss: byP[p].resolveMiss,
  }));

  return {
    state: "READY",
    viz: {
      kind: "bar",
      xKey: "label",
      series: [
        { dataKey: "firstOk",     name: "First-response on time", color: "var(--emerald-500)" },
        { dataKey: "firstMiss",   name: "First-response missed",  color: "var(--rose-500)" },
        { dataKey: "resolveOk",   name: "Resolve on time",        color: "var(--emerald-700)" },
        { dataKey: "resolveMiss", name: "Resolve missed",         color: "var(--rose-700)" },
      ],
      data,
      stacked: true,
    },
    rows: data,
    insights: [
      tickets.length === 0
        ? { title: "No tickets in window", body: "Open the date range to see SLA compliance.", tone: "neutral" }
        : (() => {
            const totalMiss = data.reduce((s, d) => s + (d.firstMiss as number) + (d.resolveMiss as number), 0);
            const totalOk   = data.reduce((s, d) => s + (d.firstOk as number) + (d.resolveOk as number), 0);
            const denom = totalOk + totalMiss;
            const pct = denom === 0 ? 100 : Math.round((totalOk / denom) * 1000) / 10;
            return { title: `Overall SLA compliance`, body: `${pct}% of measured SLAs hit.`, tone: pct >= 90 ? "positive" : pct >= 75 ? "neutral" : "warning" };
          })(),
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 15. API Usage by Tenant                                      */
/* ────────────────────────────────────────────────────────── */

async function loadApiUsageByTenant(_f: ReportFilters): Promise<ReportPayload> {
  const since = new Date(Date.now() - 30 * DAY);
  const grouped = await db.auditLog.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: since }, action: { startsWith: "api." } },
    _count: { _all: true },
    orderBy: { _count: { tenantId: "desc" } },
    take: 25,
  });
  const tenants = await db.tenant.findMany({
    where: { id: { in: grouped.map((g) => g.tenantId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, name: true, slug: true, plan: true },
  });
  const byId = new Map(tenants.map((t) => [t.id, t]));

  const data = grouped
    .filter((g) => g.tenantId)
    .map((g) => {
      const t = byId.get(g.tenantId!);
      return { label: t?.name ?? g.tenantId ?? "?", value: g._count._all };
    });

  return {
    state: "PARTIAL",
    note: "Approximates API usage by counting AuditLog rows with action prefix `api.*`. Real per-request metrics need a middleware-emitted counter table.",
    viz: { kind: "bar", xKey: "label", series: [{ dataKey: "value", name: "API events (30d)", color: "var(--cyan-500)" }], data, horizontal: true },
    rows: data,
    insights: [
      data.length === 0
        ? { title: "No api.* events", body: "We're not logging API access yet.", tone: "warning" }
        : { title: "Top API consumer", body: `${data[0]!.label} — ${(data[0]!.value as number).toLocaleString()} events.`, tone: "neutral" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 16. Storage Growth by Tenant                                 */
/* ────────────────────────────────────────────────────────── */

async function loadStorageGrowth(_f: ReportFilters): Promise<ReportPayload> {
  // The schema's File table holds proof / asset uploads.
  const grouped = await db.file.groupBy({
    by: ["tenantId"],
    _count: { _all: true },
    _sum: { sizeBytes: true },
    orderBy: { _sum: { sizeBytes: "desc" } },
    take: 50,
  });
  const tenants = await db.tenant.findMany({
    where: { id: { in: grouped.map((g) => g.tenantId) } },
    select: { id: true, name: true, slug: true, plan: true },
  });
  const byId = new Map(tenants.map((t) => [t.id, t]));

  const rows = grouped.map((g) => {
    const t = byId.get(g.tenantId);
    const bytes = Number(g._sum.sizeBytes ?? 0);
    return {
      tenant: t?.name ?? g.tenantId,
      slug: t?.slug ?? "",
      plan: t?.plan ?? "—",
      files: g._count._all,
      bytes,
      sizeLabel: humanSize(bytes),
    };
  });

  return {
    state: "PARTIAL",
    note: "Per-tenant storage caps aren't enforced today, so this is informational. Adding a quota field on PricingPlan + a soft-warning email turns it billable.",
    viz: { kind: "table-only" },
    rows,
    insights: [
      rows.length === 0
        ? { title: "No files yet", body: "Storage report fills as tenants upload.", tone: "neutral" }
        : { title: `Top consumer`, body: `${rows[0]!.tenant} — ${rows[0]!.sizeLabel}.`, tone: "neutral" },
    ],
  };
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/* ────────────────────────────────────────────────────────── */
/* 17. Failed Payment Recovery Funnel                           */
/* ────────────────────────────────────────────────────────── */

async function loadFailedPaymentRecovery(f: ReportFilters): Promise<ReportPayload> {
  const since = f.since ?? new Date(Date.now() - 90 * DAY);
  const until = f.until ?? new Date();

  const failed = await db.payment.findMany({
    where: { failedAt: { gte: since, lte: until } },
    select: { id: true, amount: true, failedAt: true, voidedAt: true, receivedAt: true },
  });

  const totalFailed = failed.length;
  const recovered   = failed.filter((p) => p.receivedAt != null && p.voidedAt == null).length;
  const lost        = failed.filter((p) => p.voidedAt != null || (p.receivedAt == null && (p.failedAt!.getTime() < Date.now() - 30 * DAY))).length;
  const pending     = totalFailed - recovered - lost;

  const failedAmount    = failed.reduce((s, p) => s + Number(p.amount), 0);
  const recoveredAmount = failed.filter((p) => p.receivedAt != null && p.voidedAt == null).reduce((s, p) => s + Number(p.amount), 0);

  const steps = [
    { label: "Failed",     value: totalFailed, pct: 100 },
    { label: "Pending",    value: pending,     pct: totalFailed === 0 ? 0 : (pending / totalFailed) * 100 },
    { label: "Recovered",  value: recovered,   pct: totalFailed === 0 ? 0 : (recovered / totalFailed) * 100 },
    { label: "Lost",       value: lost,        pct: totalFailed === 0 ? 0 : (lost / totalFailed) * 100 },
  ];

  return {
    state: "READY",
    viz: { kind: "funnel", steps },
    rows: [
      { metric: "Total failed",      count: totalFailed, usd: Math.round(failedAmount) },
      { metric: "Recovered",         count: recovered,   usd: Math.round(recoveredAmount) },
      { metric: "Pending",           count: pending,     usd: null },
      { metric: "Lost (>30d unrecovered)", count: lost,  usd: null },
    ],
    insights: [
      totalFailed === 0
        ? { title: "No failed payments", body: "Window is clean.", tone: "positive" }
        : { title: "Recovery rate", body: `${Math.round((recovered / totalFailed) * 100)}% of failed charges later succeeded.`, tone: recovered / totalFailed >= 0.6 ? "positive" : "warning" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 18. Coupon Performance                                       */
/* ────────────────────────────────────────────────────────── */

async function loadCouponPerformance(_f: ReportFilters): Promise<ReportPayload> {
  const coupons = await db.coupon.findMany({
    select: {
      id: true, code: true, status: true, discountType: true, amount: true, currency: true,
      _count: { select: { redemptions: true, activeForTenants: true } },
    },
  });

  const rows = coupons.map((c) => ({
    code: c.code,
    status: c.status,
    discount: c.discountType === "PERCENT"
      ? `${c.amount}% off`
      : `${(c.amount / 100).toFixed(2)} ${c.currency ?? ""} off`.trim(),
    redemptions: c._count.redemptions,
    activeTenants: c._count.activeForTenants,
  })).sort((a, b) => (b.redemptions as number) - (a.redemptions as number));

  return {
    state: "READY",
    viz: { kind: "table-only" },
    rows,
    insights: [
      rows.length === 0
        ? { title: "No coupons", body: "Issue a coupon from /platform/billing/coupons to start tracking.", tone: "neutral" }
        : { title: `Top performer`, body: `${rows[0]!.code} — ${rows[0]!.redemptions} redemptions.`, tone: "neutral" },
    ],
  };
}

/* ────────────────────────────────────────────────────────── */
/* 20. Industry Vertical Benchmarks                             */
/* ────────────────────────────────────────────────────────── */

async function loadIndustryBenchmarks(_f: ReportFilters): Promise<ReportPayload> {
  const plans = await getAllPlans();
  const priceByPlan = new Map<Plan, number>();
  for (const p of plans) priceByPlan.set(p.slug.toUpperCase() as Plan, p.priceMonthly ?? 0);

  const tenants = await db.tenant.findMany({
    select: { businessType: true, plan: true, status: true },
  });

  type Vertical = string;
  const totals = new Map<Vertical, { active: number; trial: number; cancelled: number; mrr: number }>();
  for (const t of tenants) {
    const v = t.businessType ?? "UNKNOWN";
    if (!totals.has(v)) totals.set(v, { active: 0, trial: 0, cancelled: 0, mrr: 0 });
    const cell = totals.get(v)!;
    if (t.status === "ACTIVE")        cell.active += 1;
    else if (t.status === "TRIAL")    cell.trial += 1;
    else if (t.status === "CANCELED" || t.status === "ARCHIVED") cell.cancelled += 1;
    if (t.status === "ACTIVE" || t.status === "PAST_DUE") {
      cell.mrr += priceByPlan.get(t.plan) ?? 0;
    }
  }

  const data = Array.from(totals.entries())
    .map(([label, v]) => ({ label, active: v.active, trial: v.trial, cancelled: v.cancelled, mrr: Math.round(v.mrr) }))
    .sort((a, b) => (b.mrr as number) - (a.mrr as number));

  return {
    state: "READY",
    viz: {
      kind: "bar",
      xKey: "label",
      series: [
        { dataKey: "active",    name: "Active",    color: "var(--emerald-500)" },
        { dataKey: "trial",     name: "Trial",     color: "var(--brand-400)" },
        { dataKey: "cancelled", name: "Cancelled", color: "var(--rose-500)" },
      ],
      data,
      stacked: true,
    },
    rows: data,
    insights: [
      data.length === 0
        ? { title: "No vertical signal", body: "businessType is unset on every tenant.", tone: "neutral" }
        : { title: `Largest vertical`, body: `${data[0]!.label} — $${(data[0]!.mrr as number).toLocaleString()} MRR.`, tone: "positive" },
    ],
  };
}
