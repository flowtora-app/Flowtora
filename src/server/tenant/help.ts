// Tenant-side help center data layer (T-105).
//
// Reads the KB models authored at /platform/operations/knowledge-base
// and filters to what's safe to surface inside the workspace:
//   - status = PUBLISHED
//   - visibility = PUBLIC (PLAN_RESTRICTED + INTERNAL are excluded
//     from the v1 surface; plan-gating ships when we wire tenants'
//     plan slugs through)
//
// Locale is fixed to "en" for now — the multi-locale UI ships when
// per-tenant locale switching lands.
//
// Mutations live in `src/app/actions/help.ts`.

import { db } from "@/lib/db";

const LOCALE = "en";

/** A category with the count of published articles inside it. */
export interface HelpCategoryEntry {
  id:           string;
  slug:         string;
  name:         string;
  articleCount: number;
}

/** A trimmed article record suitable for list / popular surfaces. */
export interface HelpArticleSummary {
  id:        string;
  slug:      string;
  title:     string;
  summary:   string | null;
  viewCount: number;
  // Category slug + name for breadcrumb / category chip on cards.
  categorySlug: string | null;
  categoryName: string | null;
  updatedAt: Date;
  /** Estimated reading time in minutes from word count. */
  readMinutes: number;
}

/** A full article for the reader. */
export interface HelpArticleFull extends HelpArticleSummary {
  bodyMarkdown:  string;
  helpfulUp:     number;
  helpfulDown:   number;
  relatedArticleIds: string[];
}

const ARTICLE_BASE_WHERE = {
  status:     "PUBLISHED" as const,
  visibility: "PUBLIC"    as const,
  locale:     LOCALE,
  archivedAt: null,
};

/** Estimate reading time at ~220 wpm; round up, min 1. */
export function estimateReadMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

/** Load every top-level category (parentId=null) with its published-
 *  article count. Categories with zero published articles are still
 *  included so the workspace surface mirrors what authors set up — the
 *  page-level fallback decides whether to swap in the scaffold copy. */
export async function loadHelpCategories(): Promise<HelpCategoryEntry[]> {
  const cats = await db.kbCategory.findMany({
    where: { parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      _count: { select: { articles: { where: ARTICLE_BASE_WHERE } } },
    },
  });
  return cats.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    articleCount: c._count.articles,
  }));
}

/** Most-viewed published articles, sorted by viewCount desc. */
export async function loadPopularArticles(
  limit = 6,
): Promise<HelpArticleSummary[]> {
  const rows = await db.kbArticle.findMany({
    where: ARTICLE_BASE_WHERE,
    orderBy: [{ featured: "desc" }, { viewCount: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      viewCount: true,
      bodyMarkdown: true,
      updatedAt: true,
      category: { select: { slug: true, name: true } },
    },
  });
  return rows.map(toSummary);
}

/** Published articles in a given category, ordered by sort then title. */
export async function loadArticlesByCategorySlug(
  categorySlug: string,
): Promise<{
  category: { id: string; slug: string; name: string } | null;
  articles: HelpArticleSummary[];
}> {
  const cat = await db.kbCategory.findUnique({
    where: { slug: categorySlug },
    select: { id: true, slug: true, name: true },
  });
  if (!cat) return { category: null, articles: [] };

  const rows = await db.kbArticle.findMany({
    where: { ...ARTICLE_BASE_WHERE, categoryId: cat.id },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      viewCount: true,
      bodyMarkdown: true,
      updatedAt: true,
      category: { select: { slug: true, name: true } },
    },
  });
  return { category: cat, articles: rows.map(toSummary) };
}

/** Load one article by (categorySlug, articleSlug). Returns null if the
 *  article isn't published or doesn't live in that category. */
export async function loadArticleByPath(
  categorySlug: string,
  articleSlug: string,
): Promise<HelpArticleFull | null> {
  const row = await db.kbArticle.findFirst({
    where: {
      ...ARTICLE_BASE_WHERE,
      slug: articleSlug,
      category: { slug: categorySlug },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      viewCount: true,
      bodyMarkdown: true,
      helpfulUp: true,
      helpfulDown: true,
      relatedArticleIds: true,
      updatedAt: true,
      category: { select: { slug: true, name: true } },
    },
  });
  if (!row) return null;
  const s = toSummary(row);
  return {
    ...s,
    bodyMarkdown:      row.bodyMarkdown,
    helpfulUp:         row.helpfulUp,
    helpfulDown:       row.helpfulDown,
    relatedArticleIds: row.relatedArticleIds,
  };
}

/** Bulk load article summaries by id (used to render "Related"). */
export async function loadArticleSummariesByIds(
  ids: string[],
): Promise<HelpArticleSummary[]> {
  if (ids.length === 0) return [];
  const rows = await db.kbArticle.findMany({
    where: { ...ARTICLE_BASE_WHERE, id: { in: ids } },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      viewCount: true,
      bodyMarkdown: true,
      updatedAt: true,
      category: { select: { slug: true, name: true } },
    },
  });
  // Preserve the order the author chose.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toSummary);
}

/** Naive full-text search across title + summary + body. Postgres ILIKE
 *  scan against the published set — small KB, no need for a search
 *  index yet. We rank by viewCount as a quality proxy. */
export async function searchHelpArticles(
  query: string,
  limit = 25,
): Promise<HelpArticleSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await db.kbArticle.findMany({
    where: {
      ...ARTICLE_BASE_WHERE,
      OR: [
        { title:        { contains: q, mode: "insensitive" } },
        { summary:      { contains: q, mode: "insensitive" } },
        { bodyMarkdown: { contains: q, mode: "insensitive" } },
        { tags:         { has: q.toLowerCase() } },
      ],
    },
    orderBy: [{ viewCount: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      viewCount: true,
      bodyMarkdown: true,
      updatedAt: true,
      category: { select: { slug: true, name: true } },
    },
  });
  return rows.map(toSummary);
}

/** Normalize the joined-category shape into the trimmer HelpArticleSummary. */
function toSummary(row: {
  id:         string;
  slug:       string;
  title:      string;
  summary:    string | null;
  viewCount:  number;
  bodyMarkdown: string;
  updatedAt:  Date;
  category:   { slug: string; name: string } | null;
}): HelpArticleSummary {
  return {
    id:           row.id,
    slug:         row.slug,
    title:        row.title,
    summary:      row.summary,
    viewCount:    row.viewCount,
    categorySlug: row.category?.slug ?? null,
    categoryName: row.category?.name ?? null,
    updatedAt:    row.updatedAt,
    readMinutes:  estimateReadMinutes(row.bodyMarkdown),
  };
}
