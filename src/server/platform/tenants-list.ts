// Tenants list server data layer — Page 4 of the admin spec.
//
// Filters parse from a URL querystring; the same shape persists into
// PlatformSavedView rows so saved views round-trip. Filters not
// directly expressible in Prisma (e.g. computed health score) are
// applied post-fetch.

import type { BusinessType, Plan, Prisma, TenantSource, TenantStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getAllPlans, type PlanOut } from "@/lib/plans";
import { normalizeCountry } from "@/lib/country-codes";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Filter shape                                               */
/* ────────────────────────────────────────────────────────── */

export interface TenantsFilters {
  /** Free-text search — name, slug, owner email, billing email, id. */
  q?: string;
  plans?: Plan[];
  statuses?: TenantStatus[];
  countries?: string[];          // ISO2 (uppercased)
  industries?: BusinessType[];
  createdSince?: Date;
  createdUntil?: Date;
  mrrMin?: number;
  mrrMax?: number;
  healthMin?: number;
  healthMax?: number;
  hasPastDue?: boolean;
  hasIntegrations?: boolean;
  trialExpiresWithinDays?: number;
  ownerEmailContains?: string;
  hasCustomDomain?: boolean;
  ssoEnabled?: boolean;
  mfaEnforced?: boolean;
  lastActivitySince?: Date;
  lastActivityUntil?: Date;
  accountManagerIds?: string[];
  tags?: string[];
  storageMin?: number;
  storageMax?: number;
  usersMin?: number;
  usersMax?: number;
  jobsMin?: number;
  jobsMax?: number;
  sources?: TenantSource[];
  /** Tab scope — preset semantic filter. Spec values: all / active /
   *  trial / at-risk / past-due / cancelled / enterprise / my-csm /
   *  recent / view:<id>. */
  scope?: string;
}

/** Parse the URL search params into a normalized filter shape. Empty
 *  / unparseable values fall through silently. */
export function parseTenantsFilters(sp: Record<string, string | string[] | undefined>): TenantsFilters {
  const get = (k: string): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const getAll = (k: string): string[] | undefined => {
    const v = sp[k];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === "string") return v.split(",").map((s) => s.trim()).filter(Boolean);
    return undefined;
  };
  const getNum = (k: string): number | undefined => {
    const v = get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const getDate = (k: string): Date | undefined => {
    const v = get(k);
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const getBool = (k: string): boolean | undefined => {
    const v = get(k);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return undefined;
  };

  const f: TenantsFilters = {};
  const q = get("q");
  if (q && q.trim()) f.q = q.trim();
  const plans = getAll("plans");
  if (plans?.length) f.plans = plans.filter(isPlan);
  const statuses = getAll("statuses");
  if (statuses?.length) f.statuses = statuses.filter(isStatus);
  const countries = getAll("countries");
  if (countries?.length) f.countries = countries.map((c) => c.toUpperCase());
  const industries = getAll("industries");
  if (industries?.length) f.industries = industries.filter(isIndustry);
  f.createdSince = getDate("createdSince");
  f.createdUntil = getDate("createdUntil");
  f.mrrMin = getNum("mrrMin");
  f.mrrMax = getNum("mrrMax");
  f.healthMin = getNum("healthMin");
  f.healthMax = getNum("healthMax");
  f.hasPastDue = getBool("hasPastDue");
  f.hasIntegrations = getBool("hasIntegrations");
  f.trialExpiresWithinDays = getNum("trialExpiresWithinDays");
  const owner = get("ownerEmailContains");
  if (owner && owner.trim()) f.ownerEmailContains = owner.trim();
  f.hasCustomDomain = getBool("hasCustomDomain");
  f.ssoEnabled = getBool("ssoEnabled");
  f.mfaEnforced = getBool("mfaEnforced");
  f.lastActivitySince = getDate("lastActivitySince");
  f.lastActivityUntil = getDate("lastActivityUntil");
  const ams = getAll("accountManagerIds");
  if (ams?.length) f.accountManagerIds = ams;
  const tags = getAll("tags");
  if (tags?.length) f.tags = tags.map((t) => t.toLowerCase());
  f.storageMin = getNum("storageMin");
  f.storageMax = getNum("storageMax");
  f.usersMin = getNum("usersMin");
  f.usersMax = getNum("usersMax");
  f.jobsMin = getNum("jobsMin");
  f.jobsMax = getNum("jobsMax");
  const sources = getAll("sources");
  if (sources?.length) f.sources = sources.filter(isSource);
  const scope = get("scope");
  if (scope) f.scope = scope;
  return f;
}

export function serializeTenantsFilters(f: TenantsFilters): string {
  const u = new URLSearchParams();
  const setStr = (k: string, v: string | undefined) => { if (v) u.set(k, v); };
  const setNum = (k: string, v: number | undefined) => { if (v != null) u.set(k, String(v)); };
  const setDate = (k: string, v: Date | undefined) => { if (v) u.set(k, v.toISOString()); };
  const setBool = (k: string, v: boolean | undefined) => { if (v != null) u.set(k, v ? "1" : "0"); };
  const setArr = (k: string, v: string[] | undefined) => { if (v?.length) for (const x of v) u.append(k, x); };

  setStr("q", f.q);
  setArr("plans", f.plans as string[] | undefined);
  setArr("statuses", f.statuses as string[] | undefined);
  setArr("countries", f.countries);
  setArr("industries", f.industries as string[] | undefined);
  setDate("createdSince", f.createdSince);
  setDate("createdUntil", f.createdUntil);
  setNum("mrrMin", f.mrrMin);
  setNum("mrrMax", f.mrrMax);
  setNum("healthMin", f.healthMin);
  setNum("healthMax", f.healthMax);
  setBool("hasPastDue", f.hasPastDue);
  setBool("hasIntegrations", f.hasIntegrations);
  setNum("trialExpiresWithinDays", f.trialExpiresWithinDays);
  setStr("ownerEmailContains", f.ownerEmailContains);
  setBool("hasCustomDomain", f.hasCustomDomain);
  setBool("ssoEnabled", f.ssoEnabled);
  setBool("mfaEnforced", f.mfaEnforced);
  setDate("lastActivitySince", f.lastActivitySince);
  setDate("lastActivityUntil", f.lastActivityUntil);
  setArr("accountManagerIds", f.accountManagerIds);
  setArr("tags", f.tags);
  setNum("storageMin", f.storageMin);
  setNum("storageMax", f.storageMax);
  setNum("usersMin", f.usersMin);
  setNum("usersMax", f.usersMax);
  setNum("jobsMin", f.jobsMin);
  setNum("jobsMax", f.jobsMax);
  setArr("sources", f.sources as string[] | undefined);
  setStr("scope", f.scope);
  return u.toString();
}

const PLAN_VALUES: Plan[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];
const STATUS_VALUES: TenantStatus[] = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED", "ARCHIVED"];
const INDUSTRY_VALUES: BusinessType[] = [
  "SIGN_SHOP", "PRINT_SHOP", "HYBRID", "APPAREL_SCREEN_PRINT",
  "EMBROIDERY", "PROMO_PRODUCTS", "TRADE_PRINTER",
  "WIDE_FORMAT_ONLY", "MULTI_DISCIPLINE", "OTHER",
];
const SOURCE_VALUES: TenantSource[] = ["ORGANIC", "REFERRAL", "PAID", "PARTNER", "OTHER"];

function isPlan(v: string): v is Plan { return (PLAN_VALUES as string[]).includes(v); }
function isStatus(v: string): v is TenantStatus { return (STATUS_VALUES as string[]).includes(v); }
function isIndustry(v: string): v is BusinessType { return (INDUSTRY_VALUES as string[]).includes(v); }
function isSource(v: string): v is TenantSource { return (SOURCE_VALUES as string[]).includes(v); }

/* ────────────────────────────────────────────────────────── */
/* Tab scopes                                                 */
/* ────────────────────────────────────────────────────────── */

export type ScopeId =
  | "all" | "active" | "trial" | "at-risk" | "past-due"
  | "cancelled" | "enterprise" | "my-csm" | "recent";

/** Given a scope id, return a partial filter overlay applied on top
 *  of any explicit filters. Saved-view scopes (scope=view:<id>) are
 *  resolved separately by the page (looks up the saved view, parses
 *  its querystring, merges). */
export function resolveScopeOverlay(scope: string | undefined, currentUserId: string): Partial<TenantsFilters> {
  const now = new Date();
  switch (scope) {
    case "active":     return { statuses: ["ACTIVE"] };
    case "trial":      return { statuses: ["TRIAL"] };
    case "at-risk":    return { statuses: ["PAST_DUE", "SUSPENDED"] };
    case "past-due":   return { statuses: ["PAST_DUE"] };
    case "cancelled":  return { statuses: ["CANCELED", "ARCHIVED"] };
    case "enterprise": return { plans: ["ENTERPRISE"] };
    case "my-csm":     return { accountManagerIds: [currentUserId] };
    case "recent":     return { createdSince: new Date(now.getTime() - 30 * DAY) };
    default:           return {};
  }
  void DAY;
}

/* ────────────────────────────────────────────────────────── */
/* KPI strip                                                  */
/* ────────────────────────────────────────────────────────── */

export interface TenantsKpi {
  total: number;
  totalDeltaPct: number | null;
  activeCount: number;
  activeSharePct: number;
  trialCount: number;
  trialMedianDaysRemaining: number | null;
  pastDueCount: number;
  pastDueDollarsAtRisk: number;
  spark14d: number[];   // signups per day, last 14 days
}

export async function loadTenantsKpi(): Promise<TenantsKpi> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
  const sixtyDaysAgo  = new Date(now.getTime() - 60 * DAY);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * DAY);

  const [byStatus, total, prior30dCount, signups14d, trials, plans] = await Promise.all([
    db.tenant.groupBy({ by: ["status"], _count: { _all: true }, where: { status: { not: "ARCHIVED" } } }),
    db.tenant.count({ where: { status: { not: "ARCHIVED" } } }),
    db.tenant.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    db.tenant.findMany({ where: { createdAt: { gte: fourteenDaysAgo } }, select: { createdAt: true } }),
    db.tenant.findMany({
      where: { status: "TRIAL", trialEndsAt: { gte: now } },
      select: { trialEndsAt: true },
    }),
    getAllPlans(),
  ]);

  const activeCount = byStatus.find((s) => s.status === "ACTIVE")?._count._all ?? 0;
  const trialCount  = byStatus.find((s) => s.status === "TRIAL")?._count._all ?? 0;
  const pastDueCount = byStatus.find((s) => s.status === "PAST_DUE")?._count._all ?? 0;

  // Past-due dollars at risk = sum of plan-prices for PAST_DUE tenants.
  const pastDueTenants = await db.tenant.findMany({
    where: { status: "PAST_DUE" },
    select: { plan: true },
  });
  const priceByPlan = new Map<Plan, number>();
  for (const p of plans) priceByPlan.set(p.slug.toUpperCase() as Plan, p.priceMonthly ?? 0);
  let pastDueDollarsAtRisk = 0;
  for (const t of pastDueTenants) pastDueDollarsAtRisk += priceByPlan.get(t.plan) ?? 0;

  // Trial median days remaining.
  let trialMedianDaysRemaining: number | null = null;
  if (trials.length > 0) {
    const days = trials
      .filter((t) => t.trialEndsAt)
      .map((t) => Math.max(0, Math.ceil((t.trialEndsAt!.getTime() - now.getTime()) / DAY)))
      .sort((a, b) => a - b);
    trialMedianDaysRemaining = days[Math.floor(days.length / 2)] ?? null;
  }

  // 14-day signup sparkline.
  const spark14d = Array.from({ length: 14 }, () => 0);
  for (const t of signups14d) {
    const idx = 13 - Math.floor((now.getTime() - t.createdAt.getTime()) / DAY);
    if (idx >= 0 && idx < 14) spark14d[idx]! += 1;
  }

  // Total delta vs prior 30d window — count tenants created in the
  // most recent 30 days vs the 30 days before that.
  const recent30d = signups14d.length === 0 ? 0 : await db.tenant.count({ where: { createdAt: { gte: thirtyDaysAgo } } });
  const totalDeltaPct = prior30dCount === 0
    ? (recent30d > 0 ? 100 : null)
    : Math.round(((recent30d - prior30dCount) / prior30dCount) * 1000) / 10;

  return {
    total,
    totalDeltaPct,
    activeCount,
    activeSharePct: total === 0 ? 0 : Math.round((activeCount / total) * 1000) / 10,
    trialCount,
    trialMedianDaysRemaining,
    pastDueCount,
    pastDueDollarsAtRisk,
    spark14d,
  };
}

/* ────────────────────────────────────────────────────────── */
/* List query                                                 */
/* ────────────────────────────────────────────────────────── */

export type SortKey =
  | "name" | "slug" | "plan" | "status" | "mrr" | "users"
  | "jobs" | "health" | "created" | "activity" | "owner";
export type SortDir = "asc" | "desc";

export interface LoadTenantsArgs {
  filters: TenantsFilters;
  sortKey: SortKey;
  sortDir: SortDir;
  page: number;
  pageSize: number;
  /** Used to resolve `scope=my-csm`. */
  currentUserId: string;
}

export interface TenantListRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: Plan;
  planName: string;
  status: TenantStatus;
  country: string | null;
  countryIso2: string | null;
  countryName: string | null;
  mrr: number;
  users: number;
  jobsThisMonth: number;
  healthScore: number;
  createdAt: Date;
  trialEndsAt: Date | null;
  lastActivityAt: Date | null;
  ownerEmail: string | null;
  adminTags: string[];
  accountManager: { id: string; name: string | null; email: string } | null;
  customDomain: string | null;
  ssoEnabled: boolean;
  ssoProvider: string | null;
  mfaEnforced: boolean;
  signupSource: TenantSource;
  industry: BusinessType | null;
  storageBytes: number;
  hasIntegrations: boolean;
  stripeCustomerId: string | null;
  pastDueDollars: number;
}

export interface LoadTenantsResult {
  rows: TenantListRow[];
  total: number;
  /** Honest count of "passed all filters" — used by the pagination
   *  footer + the `{N} shown` header. */
  filteredTotal: number;
}

export async function loadTenantsList(args: LoadTenantsArgs): Promise<LoadTenantsResult> {
  const { filters, sortKey, sortDir, page, pageSize, currentUserId } = args;
  const overlay = resolveScopeOverlay(filters.scope, currentUserId);
  const merged: TenantsFilters = { ...filters, ...overlay };

  const where = buildPrismaWhere(merged);

  // Tenant list query — pull a generous page so we can post-filter
  // computed dimensions (MRR ranges, health, jobs/month) without
  // truncating mid-page. We slice to pageSize after post-filtering.
  // For now, take pageSize × 4 — enough headroom for the few computed
  // filters without needing a second round trip.
  const take = pageSize * 4;
  const skip = (page - 1) * pageSize;

  const orderBy = buildOrderBy(sortKey, sortDir);

  const [rawRows, baseCount] = await Promise.all([
    db.tenant.findMany({
      where,
      orderBy,
      take,
      skip: 0, // we paginate on filtered results below
      select: {
        id: true, name: true, slug: true, logoUrl: true,
        plan: true, status: true, country: true,
        createdAt: true, trialEndsAt: true, lastActivityAt: true,
        adminTags: true, customDomain: true, ssoEnabled: true,
        ssoProvider: true, mfaEnforced: true, signupSource: true, businessType: true,
        stripeCustomerId: true,
        accountManagerId: true,
        accountManager: { select: { id: true, name: true, email: true } },
        memberships: {
          where: { role: "OWNER" },
          select: { user: { select: { email: true } } },
          take: 1,
        },
        _count: { select: { memberships: true } },
      },
    }),
    db.tenant.count({ where }),
  ]);

  // Resolve plan prices.
  const plans = await getAllPlans();
  const priceByPlan = new Map<Plan, { price: number; plan: PlanOut }>();
  for (const p of plans) priceByPlan.set(p.slug.toUpperCase() as Plan, { price: p.priceMonthly ?? 0, plan: p });

  // Per-tenant counters: jobs (orders) this month, file storage. We
  // batch these so we don't N+1 the DB.
  const tenantIds = rawRows.map((r) => r.id);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [jobsByTenant, storageByTenant, integrationsByTenant, pastDueByTenant] = await Promise.all([
    tenantIds.length === 0
      ? Promise.resolve([] as { tenantId: string; _count: { _all: number } }[])
      : db.order.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: tenantIds }, createdAt: { gte: monthStart } },
          _count: { _all: true },
        }),
    tenantIds.length === 0
      ? Promise.resolve([] as { tenantId: string; _sum: { sizeBytes: number | null } }[])
      : db.file.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: tenantIds } },
          _sum: { sizeBytes: true },
        }),
    // Quick "has integrations" detector — tenants with at least one
    // active feature flag override (we use feature flags as the
    // poor-man's integrations toggle today; a future slice swaps in
    // an Integration table).
    tenantIds.length === 0
      ? Promise.resolve([] as { tenantId: string }[])
      : db.featureFlag.findMany({
          where: { tenantId: { in: tenantIds }, enabled: true },
          select: { tenantId: true },
          distinct: ["tenantId"],
        }),
    // Past-due dollars per tenant — sum of failed-not-recovered Payment.
    tenantIds.length === 0
      ? Promise.resolve([] as Awaited<ReturnType<typeof db.payment.groupBy>>)
      : db.payment.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: tenantIds }, failedAt: { not: null }, voidedAt: null },
          _sum: { amount: true },
        }),
  ]);
  const jobsMap = new Map(jobsByTenant.map((j) => [j.tenantId, j._count._all]));
  const storageMap = new Map(storageByTenant.map((s) => [s.tenantId, Number(s._sum.sizeBytes ?? 0)]));
  const integrationsSet = new Set(integrationsByTenant.map((i) => i.tenantId));
  const pastDueMap = new Map(
    pastDueByTenant.map((p) => [p.tenantId, Number((p._sum?.amount as unknown) ?? 0)]),
  );

  // Decorate.
  const decorated: TenantListRow[] = rawRows.map((t) => {
    const price = priceByPlan.get(t.plan);
    const norm = normalizeCountry(t.country);
    const lastDays = t.lastActivityAt
      ? Math.floor((Date.now() - t.lastActivityAt.getTime()) / DAY)
      : null;
    const baseScore = t.status === "ACTIVE" ? 90 : t.status === "PAST_DUE" ? 40 : t.status === "TRIAL" ? 70 : 30;
    const activityPenalty = lastDays == null ? 20 : lastDays > 30 ? 30 : lastDays > 7 ? 10 : 0;
    const healthScore = Math.max(0, Math.min(100, baseScore - activityPenalty));
    const isPaying = t.status === "ACTIVE" || t.status === "PAST_DUE";
    const ownerEmail = t.memberships[0]?.user?.email ?? null;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logoUrl,
      plan: t.plan,
      planName: price?.plan.name ?? String(t.plan),
      status: t.status,
      country: t.country,
      countryIso2: norm?.iso2 ?? null,
      countryName: norm?.name ?? null,
      mrr: isPaying ? (price?.price ?? 0) : 0,
      users: t._count.memberships,
      jobsThisMonth: jobsMap.get(t.id) ?? 0,
      healthScore,
      createdAt: t.createdAt,
      trialEndsAt: t.trialEndsAt,
      lastActivityAt: t.lastActivityAt,
      ownerEmail,
      adminTags: t.adminTags,
      accountManager: t.accountManager
        ? { id: t.accountManager.id, name: t.accountManager.name ?? null, email: t.accountManager.email }
        : null,
      customDomain: t.customDomain,
      ssoEnabled: t.ssoEnabled,
      ssoProvider: t.ssoProvider,
      mfaEnforced: t.mfaEnforced,
      signupSource: t.signupSource,
      industry: t.businessType,
      storageBytes: storageMap.get(t.id) ?? 0,
      hasIntegrations: integrationsSet.has(t.id),
      stripeCustomerId: t.stripeCustomerId,
      pastDueDollars: pastDueMap.get(t.id) ?? 0,
    };
  });

  // Apply post-filters that don't fit cleanly in Prisma.
  let postFiltered = decorated;
  if (merged.mrrMin != null) postFiltered = postFiltered.filter((r) => r.mrr >= merged.mrrMin!);
  if (merged.mrrMax != null) postFiltered = postFiltered.filter((r) => r.mrr <= merged.mrrMax!);
  if (merged.healthMin != null) postFiltered = postFiltered.filter((r) => r.healthScore >= merged.healthMin!);
  if (merged.healthMax != null) postFiltered = postFiltered.filter((r) => r.healthScore <= merged.healthMax!);
  if (merged.usersMin != null) postFiltered = postFiltered.filter((r) => r.users >= merged.usersMin!);
  if (merged.usersMax != null) postFiltered = postFiltered.filter((r) => r.users <= merged.usersMax!);
  if (merged.jobsMin != null) postFiltered = postFiltered.filter((r) => r.jobsThisMonth >= merged.jobsMin!);
  if (merged.jobsMax != null) postFiltered = postFiltered.filter((r) => r.jobsThisMonth <= merged.jobsMax!);
  if (merged.storageMin != null) postFiltered = postFiltered.filter((r) => r.storageBytes >= merged.storageMin!);
  if (merged.storageMax != null) postFiltered = postFiltered.filter((r) => r.storageBytes <= merged.storageMax!);
  if (merged.hasIntegrations != null) postFiltered = postFiltered.filter((r) => r.hasIntegrations === merged.hasIntegrations);
  if (merged.hasPastDue != null) postFiltered = postFiltered.filter((r) => (r.pastDueDollars > 0) === merged.hasPastDue);
  if (merged.trialExpiresWithinDays != null) {
    const cutoff = new Date(Date.now() + merged.trialExpiresWithinDays * DAY);
    postFiltered = postFiltered.filter((r) => r.trialEndsAt != null && r.trialEndsAt <= cutoff && r.trialEndsAt >= new Date());
  }
  if (merged.tags?.length) {
    postFiltered = postFiltered.filter((r) =>
      merged.tags!.every((t) => r.adminTags.map((x) => x.toLowerCase()).includes(t)),
    );
  }
  if (merged.ownerEmailContains) {
    const needle = merged.ownerEmailContains.toLowerCase();
    postFiltered = postFiltered.filter((r) => r.ownerEmail?.toLowerCase().includes(needle));
  }
  if (merged.countries?.length) {
    const set = new Set(merged.countries.map((c) => c.toUpperCase()));
    postFiltered = postFiltered.filter((r) => r.countryIso2 != null && set.has(r.countryIso2));
  }

  // Re-sort if the sort key is computed (mrr / users / jobs / health
  // / activity sort applies to *post-decoration* values).
  if (sortKey === "mrr" || sortKey === "users" || sortKey === "jobs" || sortKey === "health" || sortKey === "activity" || sortKey === "owner") {
    postFiltered = postFiltered.slice().sort((a, b) => {
      const pick = (r: TenantListRow): string | number | Date | null =>
          sortKey === "mrr"      ? r.mrr
        : sortKey === "users"    ? r.users
        : sortKey === "jobs"     ? r.jobsThisMonth
        : sortKey === "health"   ? r.healthScore
        : sortKey === "activity" ? (r.lastActivityAt ?? new Date(0))
        : /* owner */              (r.ownerEmail ?? "");
      const av = pick(a), bv = pick(b);
      let cmp = 0;
      if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  // Slice to the pagination window.
  const filteredTotal = postFiltered.length;
  const pageRows = postFiltered.slice(skip, skip + pageSize);

  return { rows: pageRows, total: baseCount, filteredTotal };
}

function buildPrismaWhere(f: TenantsFilters): Prisma.TenantWhereInput {
  const where: Prisma.TenantWhereInput = {};

  // Default: hide ARCHIVED unless explicitly included by the
  // statuses filter.
  const includesArchived = f.statuses?.includes("ARCHIVED");
  if (f.statuses?.length) {
    where.status = { in: f.statuses };
  } else if (!includesArchived) {
    where.status = { not: "ARCHIVED" };
  }
  if (f.plans?.length) where.plan = { in: f.plans };
  if (f.industries?.length) where.businessType = { in: f.industries };
  if (f.sources?.length) where.signupSource = { in: f.sources };
  if (f.accountManagerIds?.length) where.accountManagerId = { in: f.accountManagerIds };
  if (f.hasCustomDomain != null) where.customDomain = f.hasCustomDomain ? { not: null } : null;
  if (f.ssoEnabled != null) where.ssoEnabled = f.ssoEnabled;
  if (f.mfaEnforced != null) where.mfaEnforced = f.mfaEnforced;

  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { slug: { contains: f.q, mode: "insensitive" } },
      { id: { equals: f.q } },
      { customDomain: { contains: f.q, mode: "insensitive" } },
      { stripeCustomerId: { equals: f.q } },
      { memberships: { some: { user: { email: { contains: f.q, mode: "insensitive" } } } } },
    ];
  }

  if (f.createdSince || f.createdUntil) {
    const c: Prisma.DateTimeFilter = {};
    if (f.createdSince) c.gte = f.createdSince;
    if (f.createdUntil) c.lte = f.createdUntil;
    where.createdAt = c;
  }
  if (f.lastActivitySince || f.lastActivityUntil) {
    const a: Prisma.DateTimeFilter = {};
    if (f.lastActivitySince) a.gte = f.lastActivitySince;
    if (f.lastActivityUntil) a.lte = f.lastActivityUntil;
    where.lastActivityAt = a;
  }

  return where;
}

function buildOrderBy(sortKey: SortKey, dir: SortDir): Prisma.TenantOrderByWithRelationInput[] {
  switch (sortKey) {
    case "name":     return [{ name: dir }];
    case "slug":     return [{ slug: dir }];
    case "plan":     return [{ plan: dir }];
    case "status":   return [{ status: dir }];
    case "created":  return [{ createdAt: dir }];
    // Computed columns sort post-fetch — return a stable secondary
    // here so Prisma still orders the page meaningfully.
    case "mrr":
    case "users":
    case "jobs":
    case "health":
    case "owner":
    case "activity":
    default:
      return [{ lastActivityAt: { sort: dir, nulls: "last" } as Prisma.SortOrderInput }, { createdAt: dir }];
  }
}
