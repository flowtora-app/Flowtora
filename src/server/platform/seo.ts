// Page 43 — SEO & Content data layer.
//
// Surfaces:
//   - loadSeoSettings()       — singleton row, lazy-create
//   - loadSeoKpis()           — strip across the top
//   - loadKeywordRankings()   — keyword tracker with movement deltas
//   - loadBacklinks()         — referring domains breakdown + table
//   - loadBrokenLinks()       — open + history queues
//   - loadContentGaps()       — opportunity board
//   - loadPageSpeedSnapshots() — latest CWV per URL + trend

import { db } from "@/lib/db";
import type {
  SeoIntent,
  SeoFollowType,
  SeoBacklinkStatus,
  SeoBrokenLinkStatus,
  SeoContentGapStatus,
  SeoPageSpeedDevice,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Settings (singleton) ──────────────────────────────── */

export interface SeoSettingsView {
  id: string;
  robotsTxt: string;
  sitemapEnabled: boolean;
  sitemapLastGeneratedAt: Date | null;
  sitemapUrlCount: number;
  defaultCanonicalDomain: string | null;
  metaTitleTemplate: string;
  metaDescription: string | null;
  ogImageUrl: string | null;
  hreflangs: Array<{ lang: string; url: string }>;
  updatedAt: Date;
}

export async function loadSeoSettings(): Promise<SeoSettingsView> {
  const existing = await db.seoSettings.findUnique({ where: { id: "default" } });
  if (existing) {
    return {
      ...existing,
      hreflangs: parseHreflangs(existing.hreflangs),
    };
  }
  const created = await db.seoSettings.create({ data: { id: "default" } });
  return { ...created, hreflangs: [] };
}

function parseHreflangs(raw: unknown): Array<{ lang: string; url: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === "object" && "lang" in row && "url" in row)
    .map((row) => ({ lang: String((row as { lang: unknown }).lang), url: String((row as { url: unknown }).url) }))
    .filter((r) => r.lang && r.url);
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface SeoKpis {
  trackedKeywords: number;
  /** Keywords ranking in the top 10. */
  top10Keywords: number;
  /** Sum of position improvements across keywords vs prev snapshot. */
  rankingMomentum: number;
  totalBacklinks: number;
  newBacklinks30d: number;
  lostBacklinks30d: number;
  openBrokenLinks: number;
  contentGapsOpen: number;
  /** Avg perf score across last-90d mobile snapshots. */
  avgMobilePerfScore: number | null;
  avgLcp: number | null;
  avgInp: number | null;
  avgCls: number | null;
}

export async function loadSeoKpis(): Promise<SeoKpis> {
  const since30 = new Date(Date.now() - 30 * DAY);
  const since90 = new Date(Date.now() - 90 * DAY);

  const [
    trackedAgg,
    top10Count,
    keywords,
    backlinkAgg,
    newBacklinks,
    lostBacklinks,
    openBroken,
    openGaps,
    perfRows,
  ] = await Promise.all([
    db.seoKeyword.count({ where: { active: true } }),
    db.seoKeyword.count({ where: { active: true, position: { gt: 0, lte: 10 } } }),
    db.seoKeyword.findMany({
      where: { active: true, position: { not: null }, previousPosition: { not: null } },
      select: { position: true, previousPosition: true },
    }),
    db.seoBacklink.count({ where: { status: "ACTIVE" } }),
    db.seoBacklink.count({ where: { status: "ACTIVE", firstSeenAt: { gte: since30 } } }),
    db.seoBacklink.count({ where: { status: "LOST", lostAt: { gte: since30 } } }),
    db.seoBrokenLink.count({ where: { status: "OPEN" } }),
    db.seoContentGap.count({ where: { status: "OPEN" } }),
    db.seoPageSpeedSnapshot.findMany({
      where: { device: "MOBILE", measuredAt: { gte: since90 } },
      select: { lcp: true, inp: true, cls: true, performanceScore: true },
    }),
  ]);

  // Momentum = sum of (prev - cur) so positive = climbing.
  let momentum = 0;
  for (const k of keywords) {
    if (k.position == null || k.previousPosition == null) continue;
    momentum += k.previousPosition - k.position;
  }

  const avg = (xs: Array<number | null>): number | null => {
    const real = xs.filter((x): x is number => x != null);
    if (real.length === 0) return null;
    return real.reduce((s, x) => s + x, 0) / real.length;
  };

  return {
    trackedKeywords: trackedAgg,
    top10Keywords: top10Count,
    rankingMomentum: momentum,
    totalBacklinks: backlinkAgg,
    newBacklinks30d: newBacklinks,
    lostBacklinks30d: lostBacklinks,
    openBrokenLinks: openBroken,
    contentGapsOpen: openGaps,
    avgMobilePerfScore: avg(perfRows.map((r) => r.performanceScore)),
    avgLcp: avg(perfRows.map((r) => r.lcp)),
    avgInp: avg(perfRows.map((r) => r.inp)),
    avgCls: avg(perfRows.map((r) => r.cls)),
  };
}

/* ── Keyword rankings ─────────────────────────────────── */

export interface KeywordRow {
  id: string;
  keyword: string;
  intent: SeoIntent;
  searchVolume: number | null;
  difficulty: number | null;
  position: number | null;
  previousPosition: number | null;
  delta: number | null;        // positive = climbed
  url: string | null;
  country: string;
  tags: string[];
  lastCheckedAt: Date | null;
}

export async function loadKeywordRankings(opts: {
  q?: string;
  intent?: SeoIntent;
  pageSize?: number;
} = {}): Promise<{ rows: KeywordRow[]; total: number }> {
  const pageSize = opts.pageSize ?? 200;
  const conditions: Record<string, unknown>[] = [{ active: true }];
  if (opts.q) conditions.push({ keyword: { contains: opts.q, mode: "insensitive" } });
  if (opts.intent) conditions.push({ intent: opts.intent });
  const where = { AND: conditions };

  const [rows, total] = await Promise.all([
    db.seoKeyword.findMany({
      where,
      orderBy: [{ position: { sort: "asc", nulls: "last" } }, { searchVolume: "desc" }],
      take: pageSize,
    }),
    db.seoKeyword.count({ where }),
  ]);
  return {
    rows: rows.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      intent: k.intent,
      searchVolume: k.searchVolume,
      difficulty: k.difficulty,
      position: k.position,
      previousPosition: k.previousPosition,
      delta: k.position == null || k.previousPosition == null ? null : k.previousPosition - k.position,
      url: k.url,
      country: k.country,
      tags: k.tags,
      lastCheckedAt: k.lastCheckedAt,
    })),
    total,
  };
}

/* ── Backlinks ────────────────────────────────────────── */

export interface BacklinkRow {
  id: string;
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string | null;
  domainAuthority: number | null;
  followType: SeoFollowType;
  status: SeoBacklinkStatus;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lostAt: Date | null;
}

export interface BacklinkBreakdown {
  rows: BacklinkRow[];
  total: number;
  byDomain: Array<{ domain: string; count: number; topAnchor: string | null; avgDA: number | null }>;
  anchorDistribution: Array<{ anchor: string; count: number }>;
  newSinceDays: number;
  lostSinceDays: number;
}

export async function loadBacklinks(periodDays = 30): Promise<BacklinkBreakdown> {
  const since = new Date(Date.now() - periodDays * DAY);
  const [rows, total, newCount, lostCount] = await Promise.all([
    db.seoBacklink.findMany({
      orderBy: [{ status: "asc" }, { domainAuthority: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }],
      take: 200,
    }),
    db.seoBacklink.count(),
    db.seoBacklink.count({ where: { status: "ACTIVE", firstSeenAt: { gte: since } } }),
    db.seoBacklink.count({ where: { status: "LOST", lostAt: { gte: since } } }),
  ]);

  // Roll up by source domain.
  const domainMap = new Map<string, { count: number; topAnchor: string | null; daSum: number; daCount: number }>();
  const anchorMap = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "ACTIVE") continue;
    const cur = domainMap.get(r.sourceDomain) ?? { count: 0, topAnchor: null, daSum: 0, daCount: 0 };
    cur.count++;
    if (!cur.topAnchor && r.anchorText) cur.topAnchor = r.anchorText;
    if (r.domainAuthority != null) {
      cur.daSum += r.domainAuthority;
      cur.daCount++;
    }
    domainMap.set(r.sourceDomain, cur);

    if (r.anchorText) {
      anchorMap.set(r.anchorText, (anchorMap.get(r.anchorText) ?? 0) + 1);
    }
  }

  const byDomain = Array.from(domainMap.entries())
    .map(([domain, v]) => ({
      domain,
      count: v.count,
      topAnchor: v.topAnchor,
      avgDA: v.daCount === 0 ? null : v.daSum / v.daCount,
    }))
    .sort((a, b) => b.count - a.count);

  const anchorDistribution = Array.from(anchorMap.entries())
    .map(([anchor, count]) => ({ anchor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      sourceDomain: r.sourceDomain,
      sourceUrl: r.sourceUrl,
      targetUrl: r.targetUrl,
      anchorText: r.anchorText,
      domainAuthority: r.domainAuthority,
      followType: r.followType,
      status: r.status,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      lostAt: r.lostAt,
    })),
    total,
    byDomain,
    anchorDistribution,
    newSinceDays: newCount,
    lostSinceDays: lostCount,
  };
}

/* ── Broken links ────────────────────────────────────── */

export interface BrokenLinkRow {
  id: string;
  pageUrl: string;
  brokenUrl: string;
  statusCode: number;
  anchorText: string | null;
  context: string | null;
  status: SeoBrokenLinkStatus;
  fixSuggestion: string | null;
  firstDetectedAt: Date;
  lastCheckedAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export async function loadBrokenLinks(): Promise<{
  open: BrokenLinkRow[];
  resolved: BrokenLinkRow[];
}> {
  const rows = await db.seoBrokenLink.findMany({
    orderBy: [{ status: "asc" }, { firstDetectedAt: "desc" }],
    take: 200,
  });
  const map = (r: typeof rows[number]): BrokenLinkRow => ({
    id: r.id,
    pageUrl: r.pageUrl,
    brokenUrl: r.brokenUrl,
    statusCode: r.statusCode,
    anchorText: r.anchorText,
    context: r.context,
    status: r.status,
    fixSuggestion: r.fixSuggestion,
    firstDetectedAt: r.firstDetectedAt,
    lastCheckedAt: r.lastCheckedAt,
    resolvedAt: r.resolvedAt,
    resolutionNote: r.resolutionNote,
  });
  return {
    open:     rows.filter((r) => r.status === "OPEN").map(map),
    resolved: rows.filter((r) => r.status !== "OPEN").map(map),
  };
}

/* ── Content gaps ───────────────────────────────────── */

export interface ContentGapRow {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  intent: SeoIntent;
  competitorUrl: string | null;
  competitorDomain: string | null;
  ourPosition: number | null;
  status: SeoContentGapStatus;
  notes: string | null;
  createdAt: Date;
  closedAt: Date | null;
  /** Heuristic priority — high volume, low difficulty, OPEN. */
  priorityScore: number;
}

export async function loadContentGaps(): Promise<ContentGapRow[]> {
  const rows = await db.seoContentGap.findMany({
    orderBy: [{ status: "asc" }, { searchVolume: { sort: "desc", nulls: "last" } }],
    take: 200,
  });
  return rows.map((g) => {
    const vol = g.searchVolume ?? 0;
    const diff = g.difficulty ?? 50;
    const score = g.status === "OPEN" ? Math.round((vol / Math.max(1, diff)) * 10) / 10 : 0;
    return {
      id: g.id,
      keyword: g.keyword,
      searchVolume: g.searchVolume,
      difficulty: g.difficulty,
      intent: g.intent,
      competitorUrl: g.competitorUrl,
      competitorDomain: g.competitorDomain,
      ourPosition: g.ourPosition,
      status: g.status,
      notes: g.notes,
      createdAt: g.createdAt,
      closedAt: g.closedAt,
      priorityScore: score,
    };
  });
}

/* ── Page Speed / Core Web Vitals ─────────────────────── */

export interface PageSpeedRow {
  url: string;
  device: SeoPageSpeedDevice;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  ttfb: number | null;
  performanceScore: number | null;
  measuredAt: Date;
  /** Trend over the last 8 measurements — performance scores. */
  trend: number[];
}

export async function loadPageSpeedSnapshots(): Promise<{
  mobile: PageSpeedRow[];
  desktop: PageSpeedRow[];
}> {
  const since = new Date(Date.now() - 90 * DAY);
  const all = await db.seoPageSpeedSnapshot.findMany({
    where: { measuredAt: { gte: since } },
    orderBy: { measuredAt: "desc" },
    take: 2000,
  });

  // For each (url, device) keep the latest snapshot + assemble trend
  // from up to 8 prior snapshots in chronological order.
  const groupKey = (url: string, device: SeoPageSpeedDevice) => `${device}:${url}`;
  const groups = new Map<string, typeof all>();
  for (const r of all) {
    const k = groupKey(r.url, r.device);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const result: PageSpeedRow[] = [];
  for (const [, list] of groups) {
    const latest = list[0]!;
    const trend = list
      .slice(0, 8)
      .map((r) => r.performanceScore ?? 0)
      .reverse();
    result.push({
      url: latest.url,
      device: latest.device,
      lcp: latest.lcp,
      inp: latest.inp,
      cls: latest.cls,
      ttfb: latest.ttfb,
      performanceScore: latest.performanceScore,
      measuredAt: latest.measuredAt,
      trend,
    });
  }
  result.sort((a, b) => (a.performanceScore ?? 0) - (b.performanceScore ?? 0));
  return {
    mobile:  result.filter((r) => r.device === "MOBILE"),
    desktop: result.filter((r) => r.device === "DESKTOP"),
  };
}

/* ── Helpers ──────────────────────────────────────────── */

export function intentLabel(i: SeoIntent): string {
  switch (i) {
    case "INFORMATIONAL":  return "Informational";
    case "NAVIGATIONAL":   return "Navigational";
    case "COMMERCIAL":     return "Commercial";
    case "TRANSACTIONAL":  return "Transactional";
  }
}

export function intentTone(i: SeoIntent): { bg: string; fg: string } {
  switch (i) {
    case "INFORMATIONAL":  return { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
    case "NAVIGATIONAL":   return { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" };
    case "COMMERCIAL":     return { bg: "var(--warning-surface)", fg: "var(--warning-fg)" };
    case "TRANSACTIONAL":  return { bg: "var(--success-surface)", fg: "var(--success-fg)" };
  }
}

export function backlinkStatusTone(s: SeoBacklinkStatus): { bg: string; fg: string } {
  switch (s) {
    case "ACTIVE": return { bg: "var(--success-surface)", fg: "var(--success-fg)" };
    case "LOST":   return { bg: "var(--surface-2)",       fg: "var(--text-faint)" };
    case "TOXIC":  return { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" };
  }
}

export function gapStatusTone(s: SeoContentGapStatus): { bg: string; fg: string } {
  switch (s) {
    case "OPEN":         return { bg: "var(--warning-surface)", fg: "var(--warning-fg)" };
    case "IN_PROGRESS":  return { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" };
    case "PUBLISHED":    return { bg: "var(--success-surface)", fg: "var(--success-fg)" };
    case "IGNORED":      return { bg: "var(--surface-2)",       fg: "var(--text-faint)" };
  }
}

/** LCP good < 2.5s, needs work 2.5-4s, poor > 4s. */
export function lcpTone(lcp: number | null): "good" | "warning" | "danger" | "default" {
  if (lcp == null) return "default";
  if (lcp <= 2.5) return "good";
  if (lcp <= 4) return "warning";
  return "danger";
}

/** INP good < 200ms, needs work 200-500, poor > 500. */
export function inpTone(inp: number | null): "good" | "warning" | "danger" | "default" {
  if (inp == null) return "default";
  if (inp <= 200) return "good";
  if (inp <= 500) return "warning";
  return "danger";
}

/** CLS good < 0.1, needs work 0.1-0.25, poor > 0.25. */
export function clsTone(cls: number | null): "good" | "warning" | "danger" | "default" {
  if (cls == null) return "default";
  if (cls <= 0.1) return "good";
  if (cls <= 0.25) return "warning";
  return "danger";
}
