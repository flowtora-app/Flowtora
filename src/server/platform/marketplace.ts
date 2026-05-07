// Page 48 — Marketplace data layer.

import { db } from "@/lib/db";
import type {
  MarketplaceAppStatus,
  MarketplacePricingModel,
  MarketplaceRiskLevel,
  MarketplaceReviewStatus,
  MarketplaceSubmissionStage,
  MarketplaceRevenueShareTier,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPIs ───────────────────────────────────────────── */

export interface MarketplaceKpis {
  totalApps: number;
  approvedApps: number;
  pendingApps: number;
  suspendedApps: number;
  totalInstalls: number;
  installs30d: number;
  /** Sum of MRR contribution (cents) across approved apps. */
  mrrContributionCents: number;
  averageRating: number | null;
  flaggedReviews: number;
  pendingPayoutsCents: number;
}

export async function loadMarketplaceKpis(): Promise<MarketplaceKpis> {
  const since30 = new Date(Date.now() - 30 * DAY);
  const [byStatus, totalInstalls, installs30d, mrr, ratings, flagged, payouts] = await Promise.all([
    db.marketplaceApp.groupBy({ by: ["status"], _count: { _all: true } }),
    db.marketplaceInstallation.count({ where: { uninstalledAt: null } }),
    db.marketplaceInstallation.count({ where: { installedAt: { gte: since30 } } }),
    db.marketplaceApp.aggregate({
      where: { status: "APPROVED" },
      _sum: { mrrContributionCents: true },
    }),
    db.marketplaceApp.aggregate({
      where: { status: "APPROVED", ratingCount: { gt: 0 } },
      _avg: { ratingAverage: true },
    }),
    db.marketplaceReview.count({ where: { status: { in: ["FLAGGED", "HIDDEN"] } } }),
    db.marketplacePayoutStatement.aggregate({
      where: { paid: false },
      _sum: { developerCutCents: true },
    }),
  ]);
  const map = new Map<MarketplaceAppStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  return {
    totalApps: Array.from(map.values()).reduce((s, n) => s + n, 0),
    approvedApps: map.get("APPROVED") ?? 0,
    pendingApps: (map.get("DRAFT") ?? 0) + (map.get("IN_REVIEW") ?? 0),
    suspendedApps: map.get("SUSPENDED") ?? 0,
    totalInstalls,
    installs30d,
    mrrContributionCents: mrr._sum.mrrContributionCents ?? 0,
    averageRating: ratings._avg.ratingAverage ?? null,
    flaggedReviews: flagged,
    pendingPayoutsCents: payouts._sum.developerCutCents ?? 0,
  };
}

/* ── List ────────────────────────────────────────────── */

export interface AppRow {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  developerName: string;
  categoryName: string;
  categorySlug: string;
  status: MarketplaceAppStatus;
  pricingModel: MarketplacePricingModel;
  currentVersion: string | null;
  installCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  mrrContributionCents: number;
  riskLevel: MarketplaceRiskLevel;
  riskScore: number;
  featured: boolean;
  createdAt: Date;
  publishedAt: Date | null;
  submittedAt: Date | null;
}

export interface AppFilters {
  q?: string;
  status?: MarketplaceAppStatus | "ALL";
  categoryId?: string;
  paid?: boolean | undefined;
  pricingModel?: MarketplacePricingModel | undefined;
  riskLevel?: MarketplaceRiskLevel | undefined;
  featured?: boolean | undefined;
  /** "submitted from" + "submitted to" date filter. */
  submittedFrom?: Date;
  submittedTo?: Date;
}

export async function loadAppList(filters: AppFilters): Promise<AppRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { name:           { contains: filters.q, mode: "insensitive" } },
        { slug:           { contains: filters.q, mode: "insensitive" } },
        { tagline:        { contains: filters.q, mode: "insensitive" } },
        { developerName:  { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.categoryId)                         conditions.push({ categoryId: filters.categoryId });
  if (filters.pricingModel)                       conditions.push({ pricingModel: filters.pricingModel });
  if (filters.paid === true)                      conditions.push({ pricingModel: { not: "FREE" } });
  if (filters.paid === false)                     conditions.push({ pricingModel: "FREE" });
  if (filters.riskLevel)                          conditions.push({ riskLevel: filters.riskLevel });
  if (filters.featured === true)                  conditions.push({ featured: true });
  if (filters.featured === false)                 conditions.push({ featured: false });
  if (filters.submittedFrom)                      conditions.push({ submittedAt: { gte: filters.submittedFrom } });
  if (filters.submittedTo)                        conditions.push({ submittedAt: { lte: filters.submittedTo } });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const rows = await db.marketplaceApp.findMany({
    where,
    include: { category: { select: { name: true, slug: true } } },
    orderBy: [{ featured: "desc" }, { installCount: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    iconUrl: r.iconUrl,
    developerName: r.developerName,
    categoryName: r.category.name,
    categorySlug: r.category.slug,
    status: r.status,
    pricingModel: r.pricingModel,
    currentVersion: r.currentVersion,
    installCount: r.installCount,
    ratingAverage: r.ratingAverage,
    ratingCount: r.ratingCount,
    mrrContributionCents: r.mrrContributionCents,
    riskLevel: r.riskLevel,
    riskScore: r.riskScore,
    featured: r.featured,
    createdAt: r.createdAt,
    publishedAt: r.publishedAt,
    submittedAt: r.submittedAt,
  }));
}

/* ── Detail ─────────────────────────────────────────── */

export interface AppDetailView {
  app: {
    id: string;
    slug: string;
    name: string;
    iconUrl: string | null;
    tagline: string;
    description: string;
    screenshots: string[];
    videoUrl: string | null;
    categoryId: string;
    categoryName: string;
    status: MarketplaceAppStatus;
    featured: boolean;
    developerName: string;
    developerEmail: string;
    repoUrl: string | null;
    supportUrl: string | null;
    privacyUrl: string | null;
    termsUrl: string | null;
    eulaUrl: string | null;
    pricingModel: MarketplacePricingModel;
    pricingDetails: unknown;
    manifestJson: unknown;
    securityChecklist: Record<string, boolean>;
    riskScore: number;
    riskLevel: MarketplaceRiskLevel;
    riskReasons: string[];
    soc2AttestationUrl: string | null;
    subProcessors: string | null;
    dataResidency: string | null;
    revenueShareTier: MarketplaceRevenueShareTier;
    payoutMethod: string | null;
    taxStatus: string | null;
    installCount: number;
    ratingAverage: number | null;
    ratingCount: number;
    mrrContributionCents: number;
    currentVersion: string | null;
    submittedAt: Date | null;
    approvedAt: Date | null;
    publishedAt: Date | null;
    suspendedAt: Date | null;
    suspendedReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  permissions: Array<{
    id: string;
    scope: string;
    riskLevel: MarketplaceRiskLevel;
    justification: string;
  }>;
  versions: Array<{
    id: string;
    version: string;
    changelog: string | null;
    isCurrent: boolean;
    releasedAt: Date;
    installCount: number;
  }>;
  installations: Array<{
    id: string;
    tenantId: string;
    tenantName: string | null;
    tenantSlug: string | null;
    versionInstalled: string;
    installedAt: Date;
    uninstalledAt: Date | null;
    lastUsedAt: Date | null;
  }>;
  installationTotal: number;
  installTrend: Array<{ date: string; installs: number; uninstalls: number }>;
  reviews: Array<{
    id: string;
    authorName: string;
    rating: number;
    title: string | null;
    body: string;
    status: MarketplaceReviewStatus;
    reply: string | null;
    flaggedReason: string | null;
    createdAt: Date;
  }>;
  submissions: Array<{
    id: string;
    stage: MarketplaceSubmissionStage;
    assigneeName: string | null;
    slaDeadlineAt: Date | null;
    comments: string | null;
    checklist: Array<{ label: string; checked: boolean; note?: string }>;
    enteredAt: Date;
    exitedAt: Date | null;
    overdue: boolean;
  }>;
  payouts: Array<{
    id: string;
    period: string;
    installs: number;
    grossCents: number;
    flowtoraCutCents: number;
    developerCutCents: number;
    paid: boolean;
    paidAt: Date | null;
  }>;
  auditLog: Array<{
    id: string;
    action: string;
    detail: string | null;
    authorName: string | null;
    occurredAt: Date;
  }>;
}

export async function loadAppDetail(slug: string): Promise<AppDetailView | null> {
  const app = await db.marketplaceApp.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true } },
      permissions: { orderBy: { riskLevel: "desc" }, take: 50 },
      versions: { orderBy: { releasedAt: "desc" }, take: 30 },
      reviews: { orderBy: { createdAt: "desc" }, take: 50 },
      submissions: { orderBy: { enteredAt: "asc" }, take: 30 },
      payouts: { orderBy: { period: "desc" }, take: 24 },
      auditLog: { orderBy: { occurredAt: "desc" }, take: 50 },
    },
  });
  if (!app) return null;

  // Installations + tenant resolution.
  const installations = await db.marketplaceInstallation.findMany({
    where: { appId: app.id },
    orderBy: { installedAt: "desc" },
    take: 100,
  });
  const tenantIds = Array.from(new Set(installations.map((i) => i.tenantId)));
  const tenants = tenantIds.length === 0 ? [] : await db.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true, slug: true },
  });
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  // 30-day install/uninstall trend.
  const since30 = new Date(Date.now() - 30 * DAY);
  const day = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const trendBuckets = new Map<string, { installs: number; uninstalls: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    trendBuckets.set(day(d), { installs: 0, uninstalls: 0 });
  }
  for (const inst of installations) {
    if (inst.installedAt >= since30) {
      const k = day(inst.installedAt);
      const b = trendBuckets.get(k);
      if (b) b.installs++;
    }
    if (inst.uninstalledAt && inst.uninstalledAt >= since30) {
      const k = day(inst.uninstalledAt);
      const b = trendBuckets.get(k);
      if (b) b.uninstalls++;
    }
  }
  const installTrend = Array.from(trendBuckets.entries()).map(([date, v]) => ({ date, ...v }));

  // Resolve audit + submission user ids in a single batch.
  const userIds = Array.from(new Set([
    app.approvedById,
    app.suspendedById,
    ...app.auditLog.map((a) => a.authorId),
    ...app.submissions.map((s) => s.assigneeId),
  ].filter((x): x is string => Boolean(x))));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const installationTotal = await db.marketplaceInstallation.count({
    where: { appId: app.id, uninstalledAt: null },
  });

  return {
    app: {
      id: app.id,
      slug: app.slug,
      name: app.name,
      iconUrl: app.iconUrl,
      tagline: app.tagline,
      description: app.description,
      screenshots: app.screenshots,
      videoUrl: app.videoUrl,
      categoryId: app.categoryId,
      categoryName: app.category.name,
      status: app.status,
      featured: app.featured,
      developerName: app.developerName,
      developerEmail: app.developerEmail,
      repoUrl: app.repoUrl,
      supportUrl: app.supportUrl,
      privacyUrl: app.privacyUrl,
      termsUrl: app.termsUrl,
      eulaUrl: app.eulaUrl,
      pricingModel: app.pricingModel,
      pricingDetails: app.pricingDetails,
      manifestJson: app.manifestJson,
      securityChecklist: parseChecklistFlat(app.securityChecklist),
      riskScore: app.riskScore,
      riskLevel: app.riskLevel,
      riskReasons: app.riskReasons,
      soc2AttestationUrl: app.soc2AttestationUrl,
      subProcessors: app.subProcessors,
      dataResidency: app.dataResidency,
      revenueShareTier: app.revenueShareTier,
      payoutMethod: app.payoutMethod,
      taxStatus: app.taxStatus,
      installCount: app.installCount,
      ratingAverage: app.ratingAverage,
      ratingCount: app.ratingCount,
      mrrContributionCents: app.mrrContributionCents,
      currentVersion: app.currentVersion,
      submittedAt: app.submittedAt,
      approvedAt: app.approvedAt,
      publishedAt: app.publishedAt,
      suspendedAt: app.suspendedAt,
      suspendedReason: app.suspendedReason,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    },
    permissions: app.permissions.map((p) => ({
      id: p.id,
      scope: p.scope,
      riskLevel: p.riskLevel,
      justification: p.justification,
    })),
    versions: app.versions.map((v) => ({
      id: v.id,
      version: v.version,
      changelog: v.changelog,
      isCurrent: v.isCurrent,
      releasedAt: v.releasedAt,
      installCount: v.installCount,
    })),
    installations: installations.map((i) => {
      const t = tenantMap.get(i.tenantId);
      return {
        id: i.id,
        tenantId: i.tenantId,
        tenantName: t?.name ?? null,
        tenantSlug: t?.slug ?? null,
        versionInstalled: i.versionInstalled,
        installedAt: i.installedAt,
        uninstalledAt: i.uninstalledAt,
        lastUsedAt: i.lastUsedAt,
      };
    }),
    installationTotal,
    installTrend,
    reviews: app.reviews.map((r) => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      reply: r.reply,
      flaggedReason: r.flaggedReason,
      createdAt: r.createdAt,
    })),
    submissions: app.submissions.map((s) => ({
      id: s.id,
      stage: s.stage,
      assigneeName: s.assigneeId ? userMap.get(s.assigneeId)?.name ?? userMap.get(s.assigneeId)?.email ?? null : null,
      slaDeadlineAt: s.slaDeadlineAt,
      comments: s.comments,
      checklist: parseSubmissionChecklist(s.checklist),
      enteredAt: s.enteredAt,
      exitedAt: s.exitedAt,
      overdue: !s.exitedAt && s.slaDeadlineAt != null && s.slaDeadlineAt < new Date(),
    })),
    payouts: app.payouts.map((p) => ({
      id: p.id,
      period: p.period,
      installs: p.installs,
      grossCents: p.grossCents,
      flowtoraCutCents: p.flowtoraCutCents,
      developerCutCents: p.developerCutCents,
      paid: p.paid,
      paidAt: p.paidAt,
    })),
    auditLog: app.auditLog.map((a) => ({
      id: a.id,
      action: a.action,
      detail: a.detail,
      authorName: a.authorId ? userMap.get(a.authorId)?.name ?? userMap.get(a.authorId)?.email ?? null : null,
      occurredAt: a.occurredAt,
    })),
  };
}

/* ── Categories ───────────────────────────────────── */

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  appCount: number;
  featuredOrder: number | null;
}

export async function loadCategories(): Promise<CategoryRow[]> {
  const rows = await db.marketplaceCategory.findMany({
    include: { _count: { select: { apps: true } } },
    orderBy: [{ featuredOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    appCount: c._count.apps,
    featuredOrder: c.featuredOrder,
  }));
}

/* ── Reviews moderation queue ─────────────────────── */

export interface ReviewModerationRow {
  id: string;
  appId: string;
  appName: string;
  appSlug: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  status: MarketplaceReviewStatus;
  reply: string | null;
  flaggedReason: string | null;
  createdAt: Date;
}

export async function loadReviewModerationQueue(opts: {
  status?: MarketplaceReviewStatus | "ALL";
} = {}): Promise<ReviewModerationRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.status && opts.status !== "ALL") where.status = opts.status;
  const rows = await db.marketplaceReview.findMany({
    where,
    include: { app: { select: { name: true, slug: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    appId: r.appId,
    appName: r.app.name,
    appSlug: r.app.slug,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    reply: r.reply,
    flaggedReason: r.flaggedReason,
    createdAt: r.createdAt,
  }));
}

/* ── Revenue share statements (cross-app) ──────────── */

export interface PayoutRow {
  id: string;
  appId: string;
  appName: string;
  appSlug: string;
  developerName: string;
  revenueShareTier: MarketplaceRevenueShareTier;
  period: string;
  installs: number;
  grossCents: number;
  flowtoraCutCents: number;
  developerCutCents: number;
  paid: boolean;
  paidAt: Date | null;
}

export async function loadPayouts(): Promise<{
  rows: PayoutRow[];
  totalDeveloperOwed: number;
  totalFlowtoraEarned: number;
}> {
  const rows = await db.marketplacePayoutStatement.findMany({
    orderBy: [{ period: "desc" }, { developerCutCents: "desc" }],
    include: { app: { select: { name: true, slug: true, developerName: true, revenueShareTier: true } } },
    take: 500,
  });
  let totalDeveloperOwed = 0;
  let totalFlowtoraEarned = 0;
  const out = rows.map((r) => {
    if (!r.paid) totalDeveloperOwed += r.developerCutCents;
    totalFlowtoraEarned += r.flowtoraCutCents;
    return {
      id: r.id,
      appId: r.appId,
      appName: r.app.name,
      appSlug: r.app.slug,
      developerName: r.app.developerName,
      revenueShareTier: r.app.revenueShareTier,
      period: r.period,
      installs: r.installs,
      grossCents: r.grossCents,
      flowtoraCutCents: r.flowtoraCutCents,
      developerCutCents: r.developerCutCents,
      paid: r.paid,
      paidAt: r.paidAt,
    };
  });
  return { rows: out, totalDeveloperOwed, totalFlowtoraEarned };
}

/* ── Settings ─────────────────────────────────────── */

export async function loadMarketplaceSettings(): Promise<{
  id: string;
  acceptingSubmissions: boolean;
  defaultRevenueShareTier: MarketplaceRevenueShareTier;
  reviewSlaHours: number;
  securityReviewSlaHours: number;
  autoChecksEnabled: boolean;
  requireSoc2: boolean;
  requireScreenshots: boolean;
  minScreenshots: number;
  requirePrivacyUrl: boolean;
  requireSupportUrl: boolean;
  updatedAt: Date;
}> {
  const existing = await db.marketplaceSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const created = await db.marketplaceSettings.create({ data: { id: "default" } });
  return created;
}

/* ── Submission kanban ────────────────────────────── */

export async function loadSubmissionsKanban(): Promise<Record<MarketplaceSubmissionStage, Array<{
  id: string; appId: string; appName: string; appSlug: string;
  enteredAt: Date; slaDeadlineAt: Date | null; assigneeName: string | null; overdue: boolean;
}>>> {
  const rows = await db.marketplaceSubmission.findMany({
    where: { exitedAt: null },
    include: { app: { select: { name: true, slug: true } } },
    orderBy: { enteredAt: "asc" },
    take: 200,
  });
  const userIds = Array.from(new Set(rows.map((r) => r.assigneeId).filter((x): x is string => Boolean(x))));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const empty: Record<MarketplaceSubmissionStage, Array<{
    id: string; appId: string; appName: string; appSlug: string;
    enteredAt: Date; slaDeadlineAt: Date | null; assigneeName: string | null; overdue: boolean;
  }>> = {
    SUBMITTED: [], AUTOMATED_CHECKS: [], SECURITY_REVIEW: [], LISTING_REVIEW: [], APPROVED: [], REJECTED: [],
  };
  const now = new Date();
  for (const r of rows) {
    empty[r.stage].push({
      id: r.id,
      appId: r.appId,
      appName: r.app.name,
      appSlug: r.app.slug,
      enteredAt: r.enteredAt,
      slaDeadlineAt: r.slaDeadlineAt,
      assigneeName: r.assigneeId ? userMap.get(r.assigneeId)?.name ?? userMap.get(r.assigneeId)?.email ?? null : null,
      overdue: r.slaDeadlineAt != null && r.slaDeadlineAt < now,
    });
  }
  return empty;
}

/* ── Helpers ──────────────────────────────────────── */

function parseChecklistFlat(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = Boolean(v);
  return out;
}

function parseSubmissionChecklist(raw: unknown): Array<{ label: string; checked: boolean; note?: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        label: String(o.label ?? ""),
        checked: Boolean(o.checked),
        note: typeof o.note === "string" ? o.note : undefined,
      };
    })
    .filter((c) => c.label);
}

export const STATUS_TONE: Record<MarketplaceAppStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  IN_REVIEW: { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  APPROVED:  { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  REJECTED:  { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  SUSPENDED: { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const RISK_TONE: Record<MarketplaceRiskLevel, { bg: string; fg: string }> = {
  LOW:      { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  MEDIUM:   { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  HIGH:     { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  CRITICAL: { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const REVIEW_STATUS_TONE: Record<MarketplaceReviewStatus, { bg: string; fg: string }> = {
  PUBLISHED: { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  HIDDEN:    { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  FLAGGED:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  REMOVED:   { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const STAGE_LABELS: Record<MarketplaceSubmissionStage, string> = {
  SUBMITTED:        "Submitted",
  AUTOMATED_CHECKS: "Automated checks",
  SECURITY_REVIEW:  "Security review",
  LISTING_REVIEW:   "Listing review",
  APPROVED:         "Approved",
  REJECTED:         "Rejected",
};

export const PRICING_LABELS: Record<MarketplacePricingModel, string> = {
  FREE:         "Free",
  ONE_TIME:     "One-time",
  SUBSCRIPTION: "Subscription",
  USAGE:        "Usage-based",
};

export const TIER_LABELS: Record<MarketplaceRevenueShareTier, string> = {
  STANDARD:  "Standard · 70/30",
  PREFERRED: "Preferred · 80/20",
  PARTNER:   "Partner · 85/15",
};

export const TIER_DEVELOPER_PCT: Record<MarketplaceRevenueShareTier, number> = {
  STANDARD: 70,
  PREFERRED: 80,
  PARTNER: 85,
};
