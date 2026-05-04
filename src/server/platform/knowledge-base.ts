// Page 34 — Knowledge Base / Help Center data layer.
//
// Reads/aggregates the KB models. All mutations go through the
// platform-knowledge-base server actions (Page 34 §Permissions).

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  KbArticleStatus,
  KbVisibility,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPIs ──────────────────────────────────────────────── */

export interface KbKpis {
  totalArticles: number;
  published: number;
  draft: number;
  review: number;
  archived: number;
  /** Sum of viewCount across published articles. */
  views30d: number;
  /** Helpfulness ratio (helpful / total) over the last 30 days. */
  helpfulnessPct: number | null;
  helpfulnessSampleSize: number;
  /** % of search queries that returned 0 results, last 30d. */
  zeroResultRatePct: number | null;
  zeroResultSampleSize: number;
}

export async function loadKbKpis(): Promise<KbKpis> {
  const window30 = new Date(Date.now() - 30 * DAY);
  const [byStatus, viewSum, fb30, search30] = await Promise.all([
    db.kbArticle.groupBy({ by: ["status"], _count: { _all: true } }),
    db.kbArticle.aggregate({ where: { status: "PUBLISHED" }, _sum: { viewCount: true } }),
    db.kbArticleFeedback.findMany({
      where: { createdAt: { gte: window30 } },
      select: { helpful: true },
      take: 5_000,
    }),
    db.kbSearchQuery.findMany({
      where: { at: { gte: window30 } },
      select: { resultsCount: true },
      take: 5_000,
    }),
  ]);

  const counts = { DRAFT: 0, REVIEW: 0, PUBLISHED: 0, ARCHIVED: 0 } as Record<KbArticleStatus, number>;
  let total = 0;
  for (const r of byStatus) { counts[r.status] = r._count._all; total += r._count._all; }

  const fbSize = fb30.length;
  const helpfulnessPct = fbSize === 0 ? null : fb30.filter((f) => f.helpful).length / fbSize;

  const searchSize = search30.length;
  const zeroResultRatePct = searchSize === 0
    ? null
    : search30.filter((s) => s.resultsCount === 0).length / searchSize;

  return {
    totalArticles: total,
    published: counts.PUBLISHED,
    draft: counts.DRAFT,
    review: counts.REVIEW,
    archived: counts.ARCHIVED,
    views30d: viewSum._sum.viewCount ?? 0,
    helpfulnessPct,
    helpfulnessSampleSize: fbSize,
    zeroResultRatePct,
    zeroResultSampleSize: searchSize,
  };
}

/* ── Category tree ─────────────────────────────────────── */

export interface CategoryTreeNode {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  /** Article count in this category (not its subtree). */
  articleCount: number;
  children: CategoryTreeNode[];
}

export async function loadCategoryTree(): Promise<CategoryTreeNode[]> {
  const [cats, counts] = await Promise.all([
    db.kbCategory.findMany({
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.kbArticle.groupBy({ by: ["categoryId"], _count: { _all: true } }),
  ]);
  const countMap = new Map<string, number>();
  for (const r of counts) {
    if (r.categoryId) countMap.set(r.categoryId, r._count._all);
  }
  const byParent = new Map<string | null, typeof cats>();
  for (const c of cats) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  // Recursive build, capped at depth 3 (spec).
  const build = (parentId: string | null, depth: number): CategoryTreeNode[] => {
    if (depth > 3) return [];
    return (byParent.get(parentId) ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      sortOrder: c.sortOrder,
      articleCount: countMap.get(c.id) ?? 0,
      children: build(c.id, depth + 1),
    }));
  };
  return build(null, 1);
}

/** Flat lookup, e.g. for breadcrumb labels. */
export async function loadCategoryLookup(): Promise<Map<string, { id: string; name: string; parentId: string | null }>> {
  const all = await db.kbCategory.findMany({
    select: { id: true, name: true, parentId: true },
  });
  return new Map(all.map((c) => [c.id, c]));
}

/* ── Article list ─────────────────────────────────────── */

export interface KbArticleListFilters {
  q?: string;
  status?: KbArticleStatus;
  /** Pass an id, or "_uncategorized_" for articles with no category. */
  categoryId?: string;
  authorId?: string;
  locale?: string;
  visibility?: KbVisibility;
}

export interface KbArticleListRow {
  id: string;
  title: string;
  slug: string;
  locale: string;
  status: KbArticleStatus;
  visibility: KbVisibility;
  featured: boolean;
  categoryId: string | null;
  categoryName: string | null;
  authorId: string | null;
  authorName: string | null;
  views: number;
  helpfulUp: number;
  helpfulDown: number;
  /** helpful / (helpful+down). null when no votes. */
  helpfulnessPct: number | null;
  /** Count of locales sharing this slug. */
  localeVariants: number;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface KbArticleListResult {
  rows: KbArticleListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadKbArticleList(args: {
  filters: KbArticleListFilters;
  page: number;
  pageSize: number;
}): Promise<KbArticleListResult> {
  const { filters, page, pageSize } = args;
  const where: Prisma.KbArticleWhereInput = {};
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { title:   { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { slug:    { contains: q, mode: "insensitive" } },
      { tags:    { has: q.toLowerCase() } },
    ];
  }
  if (filters.status)     where.status     = filters.status;
  if (filters.categoryId === "_uncategorized_") {
    where.categoryId = null;
  } else if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }
  if (filters.authorId)   where.authorId   = filters.authorId;
  if (filters.locale)     where.locale     = filters.locale;
  if (filters.visibility) where.visibility = filters.visibility;

  const [total, filteredTotal, rows] = await Promise.all([
    db.kbArticle.count(),
    db.kbArticle.count({ where }),
    db.kbArticle.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Author lookup
  const authorIds = Array.from(
    new Set(rows.map((r) => r.authorId).filter((x): x is string => Boolean(x))),
  );
  const authors = authorIds.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, email: true },
      });
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  // Locale-variant count: group by slug.
  const slugs = Array.from(new Set(rows.map((r) => r.slug)));
  const variantCounts = slugs.length === 0
    ? []
    : await db.kbArticle.groupBy({
        by: ["slug"],
        where: { slug: { in: slugs } },
        _count: { _all: true },
      });
  const variantMap = new Map(variantCounts.map((v) => [v.slug, v._count._all]));

  return {
    total, filteredTotal,
    rows: rows.map((r) => {
      const total = r.helpfulUp + r.helpfulDown;
      const a = r.authorId ? authorMap.get(r.authorId) : null;
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        locale: r.locale,
        status: r.status,
        visibility: r.visibility,
        featured: r.featured,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
        authorId: r.authorId,
        authorName: a ? a.name ?? a.email : null,
        views: r.viewCount,
        helpfulUp: r.helpfulUp,
        helpfulDown: r.helpfulDown,
        helpfulnessPct: total === 0 ? null : r.helpfulUp / total,
        localeVariants: variantMap.get(r.slug) ?? 1,
        updatedAt: r.updatedAt,
        publishedAt: r.publishedAt,
      };
    }),
  };
}

/* ── Article detail ────────────────────────────────────── */

export interface KbArticleDetail {
  id: string;
  title: string;
  slug: string;
  locale: string;
  summary: string | null;
  bodyMarkdown: string;
  categoryId: string | null;
  status: KbArticleStatus;
  visibility: KbVisibility;
  featured: boolean;
  tags: string[];
  relatedArticleIds: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  authorId: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  viewCount: number;
  helpfulUp: number;
  helpfulDown: number;
  revisions: {
    id: string;
    title: string;
    status: KbArticleStatus;
    note: string | null;
    savedByName: string | null;
    createdAt: Date;
  }[];
  feedback: {
    id: string;
    helpful: boolean;
    comment: string | null;
    createdAt: Date;
  }[];
  /** Other locale rows sharing this slug. */
  localeVariants: { id: string; locale: string; status: KbArticleStatus }[];
}

export async function loadKbArticleDetail(id: string): Promise<KbArticleDetail | null> {
  const a = await db.kbArticle.findUnique({
    where: { id },
    include: {
      revisions: { orderBy: { createdAt: "desc" }, take: 25 },
      feedback:  { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!a) return null;

  // Author + revision-author lookups in one round-trip.
  const userIds = Array.from(
    new Set(
      [a.authorId, ...a.revisions.map((r) => r.savedByUserId)]
        .filter((x): x is string => Boolean(x)),
    ),
  );
  const users = userIds.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const localeVariants = await db.kbArticle.findMany({
    where: { slug: a.slug, NOT: { id } },
    select: { id: true, locale: true, status: true },
    orderBy: { locale: "asc" },
  });

  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    locale: a.locale,
    summary: a.summary,
    bodyMarkdown: a.bodyMarkdown,
    categoryId: a.categoryId,
    status: a.status,
    visibility: a.visibility,
    featured: a.featured,
    tags: a.tags,
    relatedArticleIds: a.relatedArticleIds,
    metaTitle: a.metaTitle,
    metaDescription: a.metaDescription,
    canonicalUrl: a.canonicalUrl,
    ogImageUrl: a.ogImageUrl,
    authorId: a.authorId,
    authorName: a.authorId ? (() => {
      const u = userMap.get(a.authorId!);
      return u ? u.name ?? u.email : null;
    })() : null,
    publishedAt: a.publishedAt,
    archivedAt: a.archivedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    viewCount: a.viewCount,
    helpfulUp: a.helpfulUp,
    helpfulDown: a.helpfulDown,
    revisions: a.revisions.map((r) => {
      const u = r.savedByUserId ? userMap.get(r.savedByUserId) : null;
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        note: r.note,
        savedByName: u ? u.name ?? u.email : null,
        createdAt: r.createdAt,
      };
    }),
    feedback: a.feedback.map((f) => ({
      id: f.id,
      helpful: f.helpful,
      comment: f.comment,
      createdAt: f.createdAt,
    })),
    localeVariants,
  };
}

/* ── Filter options ────────────────────────────────────── */

export interface KbFilterOptions {
  authors: { id: string; label: string }[];
  locales: string[];
}

export async function loadKbFilterOptions(): Promise<KbFilterOptions> {
  const [authorIdsRaw, locales] = await Promise.all([
    db.kbArticle.findMany({
      where: { authorId: { not: null } },
      distinct: ["authorId"],
      select: { authorId: true },
      take: 200,
    }),
    db.kbArticle.findMany({
      distinct: ["locale"],
      select: { locale: true },
      orderBy: { locale: "asc" },
      take: 50,
    }),
  ]);
  const ids = authorIdsRaw.map((r) => r.authorId).filter((x): x is string => Boolean(x));
  const users = ids.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      });
  return {
    authors: users.map((u) => ({ id: u.id, label: u.name ?? u.email })),
    locales: locales.map((l) => l.locale),
  };
}
