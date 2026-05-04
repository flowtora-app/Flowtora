"use server";

// Page 34 — Knowledge Base server actions.
//
// Authoring lifecycle (draft → review → published → archived) plus
// category CRUD. Translation auto-suggest, AI replies, slash menu
// embeds, and the live SEO score remain deferred.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";

const LIST_ROUTE = "/platform/operations/knowledge-base";
const PERM_WRITE = "support.macro_manage" as const;

/* ── Helpers ───────────────────────────────────────────── */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

async function uniqueSlug(base: string, locale: string, ignoreId?: string): Promise<string> {
  let candidate = base;
  let i = 1;
  // Loop is bounded (titles aren't usually duplicated 100x).
  while (true) {
    const existing = await db.kbArticle.findUnique({
      where: { slug_locale: { slug: candidate, locale } },
      select: { id: true },
    });
    if (!existing || existing.id === ignoreId) return candidate;
    i += 1;
    candidate = `${base}-${i}`;
    if (i > 50) return `${base}-${Date.now().toString(36)}`;
  }
}

async function snapshotRevision(articleId: string, savedByUserId: string, note: string | null) {
  const a = await db.kbArticle.findUnique({
    where: { id: articleId },
    select: { title: true, bodyMarkdown: true, status: true },
  });
  if (!a) return;
  await db.kbArticleRevision.create({
    data: {
      articleId,
      title: a.title,
      bodyMarkdown: a.bodyMarkdown,
      status: a.status,
      savedByUserId,
      note,
    },
  });
}

/* ── Article CRUD ──────────────────────────────────────── */

const createArticleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  categoryId: z.string().optional().or(z.literal("")),
  locale: z.string().min(2).max(8).default("en"),
});

export async function createKbArticle(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createArticleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  const slugBase = slugify(parsed.data.title);
  const slug = await uniqueSlug(slugBase, parsed.data.locale);
  const created = await db.kbArticle.create({
    data: {
      title: parsed.data.title,
      slug,
      locale: parsed.data.locale,
      categoryId: parsed.data.categoryId || null,
      authorId: ctx.userId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.kb.article_created",
    entityType: "KbArticle",
    entityId: created.id,
    metadata: {
      actor: ctx.email,
      title: parsed.data.title,
      slug,
      locale: parsed.data.locale,
    },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${LIST_ROUTE}/${created.id}?ok=created`);
}

const saveArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required").max(200),
  summary: z.string().max(400).optional().or(z.literal("")),
  bodyMarkdown: z.string().max(200_000).default(""),
  categoryId: z.string().optional().or(z.literal("")),
  locale: z.string().min(2).max(8),
  visibility: z.enum(["PUBLIC", "INTERNAL", "PLAN_RESTRICTED"]),
  featured: z.union([z.literal("on"), z.literal("")]).optional(),
  tags: z.string().optional().or(z.literal("")),
  metaTitle: z.string().max(200).optional().or(z.literal("")),
  metaDescription: z.string().max(400).optional().or(z.literal("")),
  canonicalUrl: z.string().max(400).optional().or(z.literal("")),
  ogImageUrl: z.string().max(400).optional().or(z.literal("")),
  revisionNote: z.string().max(280).optional().or(z.literal("")),
  visibilityPlans: z.string().optional().or(z.literal("")),
  relatedArticleIds: z.string().optional().or(z.literal("")),
  inProductPaths: z.string().optional().or(z.literal("")),
});

export async function saveKbArticle(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = saveArticleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const id = formData.get("id");
    const msg = issue?.message ?? "Invalid input";
    redirect(`${LIST_ROUTE}/${id}?error=${encodeURIComponent(msg)}`);
  }
  const data = parsed.data;
  // Snapshot before edit so we can diff later.
  await snapshotRevision(data.id, ctx.userId, data.revisionNote || null);
  const tagList = data.tags
    ? data.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  const visibilityPlans = (data.visibilityPlans ?? "")
    .split(/[,\n]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const relatedArticleIds = (data.relatedArticleIds ?? "")
    .split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const inProductPaths = (data.inProductPaths ?? "")
    .split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  await db.kbArticle.update({
    where: { id: data.id },
    data: {
      title: data.title,
      summary: data.summary || null,
      bodyMarkdown: data.bodyMarkdown,
      categoryId: data.categoryId || null,
      locale: data.locale,
      visibility: data.visibility,
      featured: data.featured === "on",
      tags: tagList,
      metaTitle: data.metaTitle || null,
      metaDescription: data.metaDescription || null,
      canonicalUrl: data.canonicalUrl || null,
      ogImageUrl: data.ogImageUrl || null,
      visibilityPlans,
      relatedArticleIds,
      inProductPaths,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.kb.article_saved",
    entityType: "KbArticle",
    entityId: data.id,
    metadata: { actor: ctx.email, note: data.revisionNote || undefined },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(`${LIST_ROUTE}/${data.id}`);
  redirect(`${LIST_ROUTE}/${data.id}?ok=saved`);
}

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]),
  note: z.string().max(280).optional().or(z.literal("")),
});

export async function transitionKbArticle(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    const msg = parsed.error.issues[0]?.message ?? "Invalid transition";
    redirect(`${LIST_ROUTE}/${id}?error=${encodeURIComponent(msg)}`);
  }
  const { id, to, note } = parsed.data;
  await snapshotRevision(id, ctx.userId, note || null);
  const now = new Date();
  await db.kbArticle.update({
    where: { id },
    data: {
      status: to,
      publishedAt: to === "PUBLISHED" ? now : undefined,
      publishedById: to === "PUBLISHED" ? ctx.userId : undefined,
      archivedAt: to === "ARCHIVED" ? now : (to === "DRAFT" || to === "REVIEW" || to === "PUBLISHED") ? null : undefined,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.kb.article_${to.toLowerCase()}`,
    entityType: "KbArticle",
    entityId: id,
    metadata: { actor: ctx.email, note: note || undefined },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(`${LIST_ROUTE}/${id}`);
  redirect(`${LIST_ROUTE}/${id}?ok=transitioned`);
}

/* ── Category CRUD ─────────────────────────────────────── */

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  parentId: z.string().optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function createKbCategory(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createCategorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  const baseSlug = slugify(parsed.data.name);
  // Slug is unique across all categories — just append a counter on conflict.
  let slug = baseSlug;
  let i = 1;
  while (await db.kbCategory.findUnique({ where: { slug }, select: { id: true } })) {
    i += 1;
    slug = `${baseSlug}-${i}`;
    if (i > 50) { slug = `${baseSlug}-${Date.now().toString(36)}`; break; }
  }
  // Enforce 3-level cap (spec).
  if (parsed.data.parentId) {
    const depth = await categoryDepth(parsed.data.parentId);
    if (depth >= 3) {
      redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Category nesting capped at 3 levels")}`);
    }
  }
  const cat = await db.kbCategory.create({
    data: {
      name: parsed.data.name,
      slug,
      parentId: parsed.data.parentId || null,
      sortOrder: parsed.data.sortOrder,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.kb.category_created",
    entityType: "KbCategory",
    entityId: cat.id,
    metadata: {
      actor: ctx.email,
      name: parsed.data.name,
      slug,
      parentId: parsed.data.parentId || null,
    },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${LIST_ROUTE}?category=${cat.id}&ok=category-created`);
}

/* ── Drag-to-reorder ─────────────────────────────────── */

const reorderCategoriesSchema = z.object({
  /** JSON array of {id, sortOrder, parentId} tuples. */
  payload: z.string(),
});

export async function reorderKbCategories(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = reorderCategoriesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid reorder payload")}`);
  }
  let rows: { id: string; sortOrder: number; parentId: string | null }[];
  try {
    rows = JSON.parse(parsed.data.payload);
    if (!Array.isArray(rows)) throw new Error("expected array");
  } catch {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid reorder JSON")}`);
  }
  for (const r of rows) {
    if (typeof r.id !== "string") continue;
    await db.kbCategory.update({
      where: { id: r.id },
      data: {
        sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : 0,
        parentId: r.parentId ?? null,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.kb.categories_reordered",
    entityType: "KbCategory",
    entityId: "(many)",
    metadata: { actor: ctx.email, count: rows.length },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${LIST_ROUTE}?ok=reordered`);
}

/* ── Translation copy ────────────────────────────────── */

const cloneSchema = z.object({
  id: z.string().min(1),
  locale: z.string().min(2).max(8),
});

export async function cloneKbArticleToLocale(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = cloneSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const src = await db.kbArticle.findUnique({
    where: { id: parsed.data.id },
  });
  if (!src) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Source article not found")}`);
  }
  if (src.locale === parsed.data.locale) {
    redirect(`${LIST_ROUTE}/${src.id}?error=${encodeURIComponent("That locale already exists")}`);
  }
  const existing = await db.kbArticle.findUnique({
    where: { slug_locale: { slug: src.slug, locale: parsed.data.locale } },
    select: { id: true },
  });
  if (existing) {
    redirect(`${LIST_ROUTE}/${existing.id}?ok=opened-existing`);
  }
  const clone = await db.kbArticle.create({
    data: {
      slug: src.slug,
      locale: parsed.data.locale,
      title: src.title,
      summary: src.summary,
      bodyMarkdown: `<!-- Translation pending — placeholder copy from ${src.locale}. -->\n\n${src.bodyMarkdown}`,
      categoryId: src.categoryId,
      status: "DRAFT",
      visibility: src.visibility,
      featured: false,
      authorId: ctx.userId,
      tags: src.tags,
      metaTitle: src.metaTitle,
      metaDescription: src.metaDescription,
      canonicalUrl: src.canonicalUrl,
      ogImageUrl: src.ogImageUrl,
      visibilityPlans: src.visibilityPlans,
      relatedArticleIds: src.relatedArticleIds,
      inProductPaths: src.inProductPaths,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.kb.article_translation_cloned",
    entityType: "KbArticle",
    entityId: clone.id,
    metadata: {
      actor: ctx.email,
      sourceId: src.id,
      sourceLocale: src.locale,
      targetLocale: parsed.data.locale,
    },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${LIST_ROUTE}/${clone.id}?ok=cloned`);
}

/* ── Feedback triage ─────────────────────────────────── */

const feedbackSchema = z.object({
  feedbackId: z.string().min(1),
  articleId: z.string().min(1),
  to: z.enum(["RESOLVED", "DISMISSED", "PENDING"]),
  note: z.string().max(280).optional().or(z.literal("")),
});

export async function transitionKbFeedback(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid request")}`);
  }
  const { feedbackId, articleId, to, note } = parsed.data;
  await db.kbArticleFeedback.update({
    where: { id: feedbackId },
    data: {
      status: to,
      resolvedAt: to === "PENDING" ? null : new Date(),
      resolvedBy: to === "PENDING" ? null : ctx.userId,
      resolutionNote: note || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.kb.feedback_${to.toLowerCase()}`,
    entityType: "KbArticleFeedback",
    entityId: feedbackId,
    metadata: { actor: ctx.email, articleId, note: note || undefined },
  });
  revalidatePath(`${LIST_ROUTE}/${articleId}`);
  redirect(`${LIST_ROUTE}/${articleId}?tab=feedback&ok=feedback-triaged`);
}

async function categoryDepth(categoryId: string): Promise<number> {
  // 1-based depth where a root category has depth 1.
  let depth = 1;
  let cursor: string | null = categoryId;
  while (cursor && depth < 5) {
    const c: { parentId: string | null } | null = await db.kbCategory.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    if (!c || !c.parentId) break;
    depth += 1;
    cursor = c.parentId;
  }
  return depth;
}
