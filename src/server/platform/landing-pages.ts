// Page 38 — Landing Pages data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  LandingPageStatus,
  LandingPageMetric,
  LandingPageDevice,
  LandingPageDomainStatus,
} from "@prisma/client";
import { parseBlocks, type LpBlock } from "@/lib/lp-blocks";

const DAY = 86_400_000;

/* ── Filters ───────────────────────────────────────────── */

export interface LandingPageFilters {
  q?: string;
  status?: LandingPageStatus;
  authorId?: string;
}

function buildWhere(f: LandingPageFilters): Prisma.LandingPageWhereInput {
  const where: Prisma.LandingPageWhereInput = {};
  const ands: Prisma.LandingPageWhereInput[] = [];
  if (f.status) ands.push({ status: f.status });
  if (f.authorId) ands.push({ authorId: f.authorId });
  if (f.q) {
    const q = f.q.trim();
    where.OR = [
      { path:  { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (ands.length > 0) where.AND = ands;
  return where;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface LandingPageKpis {
  total: number;
  draft: number;
  scheduled: number;
  live: number;
  archived: number;
  /** Last 30d sessions across all live pages. */
  sessions30d: number;
  /** Last 30d submissions across all pages. */
  submissions30d: number;
  /** sessions → submissions, last 30d. */
  conversionRatePct: number | null;
}

export async function loadLandingPageKpis(): Promise<LandingPageKpis> {
  const since = new Date(Date.now() - 30 * DAY);
  const [byStatus, sessions, submissions] = await Promise.all([
    db.landingPage.groupBy({ by: ["status"], _count: { _all: true } }),
    db.landingPageVisit.count({ where: { createdAt: { gte: since } } }),
    db.landingPageFormSubmission.count({ where: { createdAt: { gte: since } } }),
  ]);
  const map = new Map<LandingPageStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  return {
    total: Array.from(map.values()).reduce((s, n) => s + n, 0),
    draft: map.get("DRAFT") ?? 0,
    scheduled: map.get("SCHEDULED") ?? 0,
    live: map.get("LIVE") ?? 0,
    archived: map.get("ARCHIVED") ?? 0,
    sessions30d: sessions,
    submissions30d: submissions,
    conversionRatePct: sessions === 0 ? null : (submissions / sessions) * 100,
  };
}

/* ── List rows ─────────────────────────────────────────── */

export interface LandingPageRow {
  id: string;
  path: string;
  title: string;
  description: string | null;
  status: LandingPageStatus;
  authorId: string | null;
  authorName: string | null;
  publishAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  customDomainHostname: string | null;
  variantCount: number;
  abTestPrimaryMetric: LandingPageMetric | null;
  /** Sessions in the last 30d. */
  sessions30d: number;
  /** Conversions (submission OR converted=true visit) in 30d. */
  conversions30d: number;
  /** Per-page conversion rate. */
  conversionRatePct: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LandingPageList {
  rows: LandingPageRow[];
  total: number;
  filteredTotal: number;
}

export async function loadLandingPageList(args: {
  filters: LandingPageFilters;
  page: number;
  pageSize: number;
}): Promise<LandingPageList> {
  const where = buildWhere(args.filters);
  const since = new Date(Date.now() - 30 * DAY);

  const [total, filteredTotal, rows] = await Promise.all([
    db.landingPage.count(),
    db.landingPage.count({ where }),
    db.landingPage.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: {
        _count: { select: { variants: true } },
        customDomain: { select: { hostname: true } },
      },
    }),
  ]);

  // Per-page sessions + conversions (single grouped read each).
  const ids = rows.map((r) => r.id);
  const [sessGroups, convGroups, subGroups] = await Promise.all([
    ids.length === 0 ? Promise.resolve([]) :
      db.landingPageVisit.groupBy({
        by: ["pageId"],
        where: { pageId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ids.length === 0 ? Promise.resolve([]) :
      db.landingPageVisit.groupBy({
        by: ["pageId"],
        where: { pageId: { in: ids }, createdAt: { gte: since }, converted: true },
        _count: { _all: true },
      }),
    ids.length === 0 ? Promise.resolve([]) :
      db.landingPageFormSubmission.groupBy({
        by: ["pageId"],
        where: { pageId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
  ]);
  const sessMap = new Map(sessGroups.map((g) => [g.pageId, g._count._all]));
  const convMap = new Map(convGroups.map((g) => [g.pageId, g._count._all]));
  const subMap  = new Map(subGroups.map((g) => [g.pageId, g._count._all]));

  // Author names
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId).filter((x): x is string => Boolean(x))));
  const authors = authorIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: authorIds } }, select: { id: true, name: true, email: true },
  });
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  return {
    total,
    filteredTotal,
    rows: rows.map((r): LandingPageRow => {
      const author = r.authorId ? authorMap.get(r.authorId) : null;
      const sessions = sessMap.get(r.id) ?? 0;
      const convs = (convMap.get(r.id) ?? 0) + (subMap.get(r.id) ?? 0);
      return {
        id: r.id,
        path: r.path,
        title: r.title,
        description: r.description,
        status: r.status,
        authorId: r.authorId,
        authorName: author ? author.name ?? author.email : null,
        publishAt: r.publishAt,
        publishedAt: r.publishedAt,
        archivedAt: r.archivedAt,
        customDomainHostname: r.customDomain?.hostname ?? null,
        variantCount: r._count.variants,
        abTestPrimaryMetric: r.abTestPrimaryMetric,
        sessions30d: sessions,
        conversions30d: convs,
        conversionRatePct: sessions === 0 ? null : (convs / sessions) * 100,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }),
  };
}

/* ── Detail ────────────────────────────────────────────── */

export interface LandingPageDetail {
  id: string;
  path: string;
  title: string;
  description: string | null;
  blocks: LpBlock[];
  customHtml: string | null;
  customCss: string | null;
  customJs: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  schemaJsonLd: string | null;
  canonicalUrl: string | null;
  status: LandingPageStatus;
  publishAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  authorId: string | null;
  authorName: string | null;
  customDomain: { id: string; hostname: string; status: LandingPageDomainStatus } | null;
  abTestPrimaryMetric: LandingPageMetric | null;
  abTestStartedAt: Date | null;
  abTestWinnerLabel: string | null;
  formSchema: { name: string; type: string; required?: boolean; label?: string }[];
  variants: {
    id: string;
    label: string;
    blocks: LpBlock[];
    customHtml: string | null;
    trafficPct: number;
    visitCount: number;
    conversionCount: number;
  }[];
  revisions: {
    id: string;
    note: string | null;
    savedByName: string | null;
    createdAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export async function loadLandingPageDetail(id: string): Promise<LandingPageDetail | null> {
  const row = await db.landingPage.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { label: "asc" } },
      revisions: { orderBy: { createdAt: "desc" }, take: 25 },
      customDomain: true,
    },
  });
  if (!row) return null;

  const userIds = Array.from(new Set([
    row.authorId,
    ...row.revisions.map((r) => r.savedByUserId),
  ].filter((x): x is string => Boolean(x))));
  const users = userIds.length === 0
    ? []
    : await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const nameOf = (uid: string | null) => uid ? (userMap.get(uid)?.name ?? userMap.get(uid)?.email ?? null) : null;

  return {
    id: row.id,
    path: row.path,
    title: row.title,
    description: row.description,
    blocks: parseBlocks(row.blocks),
    customHtml: row.customHtml,
    customCss: row.customCss,
    customJs: row.customJs,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    ogImageUrl: row.ogImageUrl,
    schemaJsonLd: row.schemaJsonLd,
    canonicalUrl: row.canonicalUrl,
    status: row.status,
    publishAt: row.publishAt,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
    authorId: row.authorId,
    authorName: nameOf(row.authorId),
    customDomain: row.customDomain
      ? { id: row.customDomain.id, hostname: row.customDomain.hostname, status: row.customDomain.status }
      : null,
    abTestPrimaryMetric: row.abTestPrimaryMetric,
    abTestStartedAt: row.abTestStartedAt,
    abTestWinnerLabel: row.abTestWinnerLabel,
    formSchema: Array.isArray(row.formSchema)
      ? (row.formSchema as { name: string; type: string; required?: boolean; label?: string }[])
      : [],
    variants: row.variants.map((v) => ({
      id: v.id,
      label: v.label,
      blocks: parseBlocks(v.blocks),
      customHtml: v.customHtml,
      trafficPct: v.trafficPct,
      visitCount: v.visitCount,
      conversionCount: v.conversionCount,
    })),
    revisions: row.revisions.map((r) => ({
      id: r.id,
      note: r.note,
      savedByName: nameOf(r.savedByUserId),
      createdAt: r.createdAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ── Per-page analytics ────────────────────────────────── */

export interface LpAnalytics {
  /** Daily visits + conversions for the last 30d. */
  daily: { date: string; sessions: number; conversions: number }[];
  /** Top sources. */
  sources: { source: string; count: number }[];
  /** Device split. */
  devices: { device: LandingPageDevice; count: number }[];
  /** % bounced. */
  bounceRatePct: number | null;
  /** Mean scroll depth. */
  avgScrollDepth: number | null;
  /** Mean time on page. */
  avgTimeOnPageSec: number | null;
  /** Funnel — page view → ≥75% scroll → click/CTA → submitted. */
  funnel: { label: string; count: number }[];
}

export async function loadLandingPageAnalytics(pageId: string, days = 30): Promise<LpAnalytics> {
  const since = new Date(Date.now() - days * DAY);
  since.setHours(0, 0, 0, 0);
  const [visits, submissions] = await Promise.all([
    db.landingPageVisit.findMany({
      where: { pageId, createdAt: { gte: since } },
      select: { createdAt: true, source: true, device: true, bounced: true, scrollDepth: true, timeOnPage: true, converted: true },
      take: 50_000,
    }),
    db.landingPageFormSubmission.count({
      where: { pageId, createdAt: { gte: since } },
    }),
  ]);

  // Daily.
  const dayMap = new Map<string, { sessions: number; conversions: number }>();
  for (let i = 0; i < days; i++) {
    const k = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    dayMap.set(k, { sessions: 0, conversions: 0 });
  }
  for (const v of visits) {
    const k = v.createdAt.toISOString().slice(0, 10);
    const cell = dayMap.get(k) ?? { sessions: 0, conversions: 0 };
    cell.sessions += 1;
    if (v.converted) cell.conversions += 1;
    dayMap.set(k, cell);
  }
  const daily = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Sources.
  const sourceCounts = new Map<string, number>();
  for (const v of visits) {
    const src = v.source || "direct";
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const sources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Devices.
  const deviceCounts = new Map<LandingPageDevice, number>();
  for (const v of visits) deviceCounts.set(v.device, (deviceCounts.get(v.device) ?? 0) + 1);
  const devices = Array.from(deviceCounts.entries()).map(([device, count]) => ({ device, count }));

  // Bounce + scroll + time.
  const total = visits.length;
  const bounced = visits.filter((v) => v.bounced).length;
  const bounceRatePct = total === 0 ? null : (bounced / total) * 100;
  const scrollSamples = visits.filter((v) => v.scrollDepth > 0).map((v) => v.scrollDepth);
  const avgScrollDepth = scrollSamples.length === 0 ? null : scrollSamples.reduce((s, n) => s + n, 0) / scrollSamples.length;
  const timeSamples = visits.filter((v) => v.timeOnPage != null).map((v) => v.timeOnPage as number);
  const avgTimeOnPageSec = timeSamples.length === 0 ? null : timeSamples.reduce((s, n) => s + n, 0) / timeSamples.length;

  // Funnel — sessions → engaged (≥75% scroll or ≥30s) → converted-visit → submitted.
  const engaged = visits.filter((v) => v.scrollDepth >= 75 || (v.timeOnPage ?? 0) >= 30).length;
  const convertedVisits = visits.filter((v) => v.converted).length;
  const funnel = [
    { label: "Sessions", count: total },
    { label: "Engaged",  count: engaged },
    { label: "Clicked CTA", count: convertedVisits },
    { label: "Submitted",   count: submissions },
  ];

  return { daily, sources, devices, bounceRatePct, avgScrollDepth, avgTimeOnPageSec, funnel };
}

/* ── Domains ───────────────────────────────────────────── */

export async function loadDomains() {
  return db.landingPageDomain.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { pages: true } } },
  });
}

/* ── Templates ─────────────────────────────────────────── */

export async function loadTemplates() {
  return db.landingPageTemplate.findMany({
    orderBy: { name: "asc" },
  });
}

/* ── Submissions ───────────────────────────────────────── */

export interface SubmissionRow {
  id: string;
  pageId: string;
  pageTitle: string;
  pagePath: string;
  email: string | null;
  source: string | null;
  utm: Record<string, string>;
  status: string;
  payload: Record<string, unknown>;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export async function loadSubmissions(args: {
  status?: string;
  pageId?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: SubmissionRow[]; total: number; filteredTotal: number }> {
  const where: Prisma.LandingPageFormSubmissionWhereInput = {};
  if (args.status && args.status !== "all") where.status = args.status;
  if (args.pageId) where.pageId = args.pageId;

  const [total, filteredTotal, rows] = await Promise.all([
    db.landingPageFormSubmission.count(),
    db.landingPageFormSubmission.count({ where }),
    db.landingPageFormSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: { page: { select: { id: true, title: true, path: true } } },
    }),
  ]);
  const reviewerIds = Array.from(new Set(rows.map((r) => r.reviewedByUserId).filter((x): x is string => Boolean(x))));
  const reviewers = reviewerIds.length === 0 ? [] :
    await db.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true, email: true } });
  const reviewerMap = new Map(reviewers.map((u) => [u.id, u]));

  return {
    total, filteredTotal,
    rows: rows.map((r): SubmissionRow => ({
      id: r.id,
      pageId: r.pageId,
      pageTitle: r.page.title,
      pagePath: r.page.path,
      email: r.email,
      source: r.source,
      utm: (r.utm ?? {}) as Record<string, string>,
      status: r.status,
      payload: (r.payload ?? {}) as Record<string, unknown>,
      reviewedByName: r.reviewedByUserId
        ? (() => {
            const u = reviewerMap.get(r.reviewedByUserId!);
            return u ? u.name ?? u.email : null;
          })()
        : null,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
  };
}

/* ── Public reader (live page) ─────────────────────────── */

export interface PublicPagePayload {
  id: string;
  path: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  blocks: LpBlock[];
  customHtml: string | null;
  customCss: string | null;
  customJs: string | null;
  /** A/B variants — empty list when no test running. */
  variants: { id: string; label: string; blocks: LpBlock[]; customHtml: string | null; trafficPct: number }[];
}

export async function loadPublicLandingPage(path: string): Promise<PublicPagePayload | null> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const row = await db.landingPage.findUnique({
    where: { path: normalized },
    include: { variants: true },
  });
  if (!row || row.status !== "LIVE") return null;
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    ogImageUrl: row.ogImageUrl,
    canonicalUrl: row.canonicalUrl,
    blocks: parseBlocks(row.blocks),
    customHtml: row.customHtml,
    customCss: row.customCss,
    customJs: row.customJs,
    variants: row.variants.map((v) => ({
      id: v.id,
      label: v.label,
      blocks: parseBlocks(v.blocks),
      customHtml: v.customHtml,
      trafficPct: v.trafficPct,
    })),
  };
}

/** Deterministic hash bucketing — pick an A/B variant for a given session. */
export function pickVariant(
  variants: { id: string; label: string; trafficPct: number; blocks: LpBlock[]; customHtml: string | null }[],
  sessionId: string,
): { id: string; label: string; blocks: LpBlock[]; customHtml: string | null } | null {
  if (variants.length === 0) return null;
  // Hash sessionId to 0..99.
  let h = 5381;
  for (let i = 0; i < sessionId.length; i++) h = ((h << 5) + h + sessionId.charCodeAt(i)) | 0;
  const bucket = Math.abs(h) % 100;
  let acc = 0;
  for (const v of variants) {
    acc += v.trafficPct;
    if (bucket < acc) return v;
  }
  return null; // remainder → control / parent
}
