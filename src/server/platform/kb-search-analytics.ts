// Page 34 §Search analytics — drives the search-analytics deep-dive page.

import { db } from "@/lib/db";

const DAY = 86_400_000;

export interface SearchAnalytics {
  /** Total searches in window. */
  totalSearches: number;
  /** Searches that returned 0 results. */
  zeroResultCount: number;
  zeroResultRatePct: number;
  /** Searches that ended in a click. */
  clickedCount: number;
  /** Click-through rate of searches that did return results. */
  ctrPct: number;
  /** Top searches with counts and zero-result %. */
  topSearches: { query: string; count: number; zeroResultCount: number; clickedCount: number }[];
  /** Zero-result queries (drives content gap report). */
  zeroResultQueries: { query: string; count: number }[];
  /** Most-clicked articles per query. */
  mostClickedArticles: { articleId: string; title: string; clicks: number }[];
  /** Daily volume. */
  dailyTrend: { date: string; total: number; zero: number; clicked: number }[];
}

export async function loadSearchAnalytics(days = 30): Promise<SearchAnalytics> {
  const since = new Date(Date.now() - days * DAY);
  since.setHours(0, 0, 0, 0);

  const queries = await db.kbSearchQuery.findMany({
    where: { at: { gte: since } },
    select: { query: true, resultsCount: true, clickedArticleId: true, at: true },
    take: 50_000,
  });

  const total = queries.length;
  const zero = queries.filter((q) => q.resultsCount === 0).length;
  const clicked = queries.filter((q) => q.clickedArticleId != null).length;
  const ctrDenominator = queries.filter((q) => q.resultsCount > 0).length;

  // Aggregate by query.
  const byQuery = new Map<string, { count: number; zero: number; clicked: number }>();
  for (const q of queries) {
    const key = q.query.replace(/^\[seed\]\s*/, "");
    const cell = byQuery.get(key) ?? { count: 0, zero: 0, clicked: 0 };
    cell.count += 1;
    if (q.resultsCount === 0) cell.zero += 1;
    if (q.clickedArticleId) cell.clicked += 1;
    byQuery.set(key, cell);
  }
  const topSearches = Array.from(byQuery.entries())
    .map(([query, v]) => ({ query, count: v.count, zeroResultCount: v.zero, clickedCount: v.clicked }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
  const zeroResultQueries = Array.from(byQuery.entries())
    .filter(([, v]) => v.zero > 0)
    .map(([query, v]) => ({ query, count: v.zero }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);

  // Most-clicked articles in window.
  const articleClicks = new Map<string, number>();
  for (const q of queries) {
    if (!q.clickedArticleId) continue;
    articleClicks.set(q.clickedArticleId, (articleClicks.get(q.clickedArticleId) ?? 0) + 1);
  }
  const articleIds = Array.from(articleClicks.keys());
  const articles = articleIds.length === 0
    ? []
    : await db.kbArticle.findMany({
        where: { id: { in: articleIds } },
        select: { id: true, title: true },
      });
  const titleMap = new Map(articles.map((a) => [a.id, a.title]));
  const mostClickedArticles = Array.from(articleClicks.entries())
    .map(([articleId, clicks]) => ({ articleId, title: titleMap.get(articleId) ?? "(deleted article)", clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 25);

  // Daily trend.
  const dayMap = new Map<string, { total: number; zero: number; clicked: number }>();
  for (let i = 0; i < days; i++) {
    const k = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    dayMap.set(k, { total: 0, zero: 0, clicked: 0 });
  }
  for (const q of queries) {
    const k = q.at.toISOString().slice(0, 10);
    const cell = dayMap.get(k) ?? { total: 0, zero: 0, clicked: 0 };
    cell.total += 1;
    if (q.resultsCount === 0) cell.zero += 1;
    if (q.clickedArticleId) cell.clicked += 1;
    dayMap.set(k, cell);
  }
  const dailyTrend = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalSearches: total,
    zeroResultCount: zero,
    zeroResultRatePct: total === 0 ? 0 : (zero / total) * 100,
    clickedCount: clicked,
    ctrPct: ctrDenominator === 0 ? 0 : (clicked / ctrDenominator) * 100,
    topSearches,
    zeroResultQueries,
    mostClickedArticles,
    dailyTrend,
  };
}
