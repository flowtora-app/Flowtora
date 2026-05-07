"use server";

// Page 47 — Developer Documentation actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  DocPageStatus,
  DocSectionKey,
} from "@prisma/client";

const ROUTE = "/platform/integrations/docs";
const PERM_WRITE = "docs.write" as const;
const PERM_PUBLISH = "docs.publish" as const;

const SECTIONS = [
  "GETTING_STARTED", "AUTHENTICATION", "CONCEPTS", "RESOURCES", "WEBHOOKS",
  "SDKS", "RECIPES", "MIGRATION_GUIDES", "CHANGELOG", "ERRORS_REFERENCE",
  "RATE_LIMITS", "GLOSSARY",
] as const;
const STATUSES = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;

const detailRoute = (slug: string) => `${ROUTE}/${slug}`;

/* ── Create page ───────────────────────────────────────── */

const createPageSchema = z.object({
  title:    z.string().min(1).max(200),
  slug:     z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, dashes"),
  section:  z.enum(SECTIONS).default("CONCEPTS"),
  parentId: z.string().optional().or(z.literal("")),
  isFolder: z.coerce.boolean().optional().default(false),
  externalUrl: z.string().max(500).optional().or(z.literal("")),
});

export async function createDocPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const raw = Object.fromEntries(formData.entries());
  raw.isFolder = raw.isFolder === "on" || raw.isFolder === "true" ? "true" : "false";
  const parsed = createPageSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  // Position = max + 1 within parent group.
  const last = await db.docPage.findFirst({
    where: { section: d.section as DocSectionKey, parentId: d.parentId || null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;
  const created = await db.docPage.create({
    data: {
      slug: d.slug,
      title: d.title,
      section: d.section as DocSectionKey,
      parentId: d.parentId || null,
      position,
      isFolder: d.isFolder,
      externalUrl: d.externalUrl || null,
      authorId: ctx.userId,
      lastEditedById: ctx.userId,
      bodyDraft: d.isFolder ? null : `# ${d.title}\n\nWrite your content here…`,
    },
    select: { id: true, slug: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.page_created",
    entityType: "DocPage",
    entityId: created.id,
    metadata: { actor: ctx.email, slug: d.slug, section: d.section },
  });
  revalidatePath(ROUTE);
  redirect(`${detailRoute(created.slug)}?ok=created`);
}

/* ── Save draft / save metadata ─────────────────────── */

const savePageSchema = z.object({
  id:           z.string().min(1),
  title:        z.string().min(1).max(200),
  slug:         z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  section:      z.enum(SECTIONS),
  parentId:     z.string().optional().or(z.literal("")),
  isFolder:     z.coerce.boolean().optional().default(false),
  externalUrl:  z.string().max(500).optional().or(z.literal("")),
  deprecated:   z.coerce.boolean().optional().default(false),
  bodyDraft:    z.string().max(200_000).optional().or(z.literal("")),
  ownerTeam:    z.string().max(80).optional().or(z.literal("")),
  reviewersRaw: z.string().max(2000).optional().or(z.literal("")),
  seoTitle:     z.string().max(200).optional().or(z.literal("")),
  seoDescription: z.string().max(500).optional().or(z.literal("")),
  canonical:    z.string().max(500).optional().or(z.literal("")),
  tagsRaw:      z.string().max(500).optional().or(z.literal("")),
  relatedRaw:   z.string().max(2000).optional().or(z.literal("")),
});

export async function saveDocPageDraft(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["isFolder", "deprecated"]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  const parsed = savePageSchema.safeParse(raw);
  if (!parsed.success) {
    const slug = formData.get("slug") ?? "";
    redirect(`${detailRoute(String(slug))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const reviewers = (d.reviewersRaw ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const tags = (d.tagsRaw ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const related = (d.relatedRaw ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

  const updated = await db.docPage.update({
    where: { id: d.id },
    data: {
      title: d.title,
      slug: d.slug,
      section: d.section as DocSectionKey,
      parentId: d.parentId || null,
      isFolder: d.isFolder,
      externalUrl: d.externalUrl || null,
      deprecated: d.deprecated,
      bodyDraft: d.bodyDraft ?? "",
      ownerTeam: d.ownerTeam || null,
      reviewers,
      seoTitle: d.seoTitle || null,
      seoDescription: d.seoDescription || null,
      canonical: d.canonical || null,
      tags,
      relatedSlugs: related,
      lastEditedById: ctx.userId,
    },
    select: { id: true, slug: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.draft_saved",
    entityType: "DocPage",
    entityId: updated.id,
    metadata: { actor: ctx.email, slug: d.slug, bytes: (d.bodyDraft ?? "").length },
  });
  revalidatePath(detailRoute(updated.slug));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(updated.slug)}?ok=saved`);
}

/* ── Publish + schedule + status changes ─────────── */

const publishSchema = z.object({
  id:         z.string().min(1),
  changeNote: z.string().max(500).optional().or(z.literal("")),
});

export async function publishDocPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = publishSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, changeNote } = parsed.data;
  const page = await db.docPage.findUnique({ where: { id } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  const newBody = page.bodyDraft ?? page.body;
  const nextVersion = page.version + 1;

  await db.$transaction([
    db.docPage.update({
      where: { id },
      data: {
        body: newBody,
        bodyDraft: null,
        status: "PUBLISHED",
        version: nextVersion,
        publishedVersion: nextVersion,
        publishedAt: new Date(),
        publishedById: ctx.userId,
        scheduledPublishAt: null,
      },
    }),
    db.docPageVersion.create({
      data: {
        pageId: id,
        versionNumber: nextVersion,
        body: newBody,
        frontmatter: page.frontmatter as never,
        status: "PUBLISHED",
        authorId: ctx.userId,
        changeNote: changeNote || null,
        publishedAt: new Date(),
      },
    }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.published",
    entityType: "DocPage",
    entityId: id,
    metadata: { actor: ctx.email, slug: page.slug, versionNumber: nextVersion },
  });
  revalidatePath(detailRoute(page.slug));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(page.slug)}?ok=published`);
}

const scheduleSchema = z.object({
  id:        z.string().min(1),
  scheduledFor: z.string().min(1),
});
export async function scheduleDocPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, scheduledFor } = parsed.data;
  const when = new Date(scheduledFor);
  if (isNaN(when.getTime())) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Invalid datetime")}`);
  }
  const page = await db.docPage.findUnique({ where: { id }, select: { slug: true } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  await db.docPage.update({
    where: { id },
    data: {
      scheduledPublishAt: when,
      status: "REVIEW",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.scheduled",
    entityType: "DocPage",
    entityId: id,
    metadata: { actor: ctx.email, scheduledFor: when.toISOString() },
  });
  revalidatePath(detailRoute(page.slug));
  redirect(`${detailRoute(page.slug)}?ok=scheduled`);
}

const idSchema = z.object({ id: z.string().min(1) });
export async function clearScheduledPublish(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const page = await db.docPage.findUnique({ where: { id: parsed.data.id }, select: { slug: true } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  await db.docPage.update({
    where: { id: parsed.data.id },
    data: { scheduledPublishAt: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.unscheduled",
    entityType: "DocPage",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(page.slug));
  redirect(`${detailRoute(page.slug)}?ok=unscheduled`);
}

const statusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(STATUSES),
});
export async function updateDocPageStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, status } = parsed.data;
  const page = await db.docPage.findUnique({ where: { id }, select: { slug: true } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  await db.docPage.update({
    where: { id },
    data: { status: status as DocPageStatus },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.status_updated",
    entityType: "DocPage",
    entityId: id,
    metadata: { actor: ctx.email, status },
  });
  revalidatePath(detailRoute(page.slug));
  redirect(`${detailRoute(page.slug)}?ok=status-updated`);
}

const rollbackSchema = z.object({
  pageId:    z.string().min(1),
  versionId: z.string().min(1),
});
export async function rollbackDocPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = rollbackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { pageId, versionId } = parsed.data;
  const [page, version] = await Promise.all([
    db.docPage.findUnique({ where: { id: pageId }, select: { id: true, slug: true, version: true } }),
    db.docPageVersion.findUnique({ where: { id: versionId } }),
  ]);
  if (!page || !version || version.pageId !== page.id) {
    redirect(`${ROUTE}?error=not-found`);
  }
  const nextVersion = page.version + 1;
  await db.$transaction([
    db.docPage.update({
      where: { id: pageId },
      data: {
        body: version.body,
        bodyDraft: null,
        status: "PUBLISHED",
        version: nextVersion,
        publishedVersion: nextVersion,
        publishedAt: new Date(),
        publishedById: ctx.userId,
      },
    }),
    db.docPageVersion.create({
      data: {
        pageId: pageId,
        versionNumber: nextVersion,
        body: version.body,
        frontmatter: version.frontmatter as never,
        status: "PUBLISHED",
        authorId: ctx.userId,
        changeNote: `Rolled back to v${version.versionNumber}`,
        publishedAt: new Date(),
      },
    }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.rolled_back",
    entityType: "DocPage",
    entityId: pageId,
    metadata: { actor: ctx.email, fromVersion: version.versionNumber, toVersion: nextVersion },
  });
  revalidatePath(detailRoute(page.slug));
  redirect(`${detailRoute(page.slug)}?ok=rolled-back`);
}

/* ── Delete ────────────────────────────────────────── */

export async function deleteDocPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const page = await db.docPage.findUnique({ where: { id: parsed.data.id }, select: { slug: true, title: true } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  await db.docPage.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.deleted",
    entityType: "DocPage",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, slug: page.slug, title: page.title },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=deleted`);
}

/* ── Comments ──────────────────────────────────────── */

const commentSchema = z.object({
  pageId: z.string().min(1),
  body:   z.string().min(1).max(5000),
});
export async function addDocComment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = commentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { pageId, body } = parsed.data;
  const page = await db.docPage.findUnique({ where: { id: pageId }, select: { slug: true } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  await db.docPageComment.create({
    data: { pageId, body, authorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.commented",
    entityType: "DocPage",
    entityId: pageId,
    metadata: { actor: ctx.email, length: body.length },
  });
  revalidatePath(detailRoute(page.slug));
  redirect(`${detailRoute(page.slug)}?ok=comment-added`);
}

const resolveSchema = z.object({ id: z.string().min(1), pageId: z.string().min(1) });
export async function resolveDocComment(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const page = await db.docPage.findUnique({ where: { id: parsed.data.pageId }, select: { slug: true } });
  if (!page) redirect(`${ROUTE}?error=not-found`);
  await db.docPageComment.update({
    where: { id: parsed.data.id },
    data: { resolvedAt: new Date(), resolvedById: ctx.userId },
  });
  revalidatePath(detailRoute(page.slug));
  redirect(`${detailRoute(page.slug)}?ok=comment-resolved`);
}

/* ── OpenAPI specs ─────────────────────────────────── */

const uploadSpecSchema = z.object({
  version:     z.string().min(1).max(50),
  body:        z.string().min(10).max(2_000_000),
  format:      z.enum(["yaml", "json"] as const).default("yaml"),
  autoPublish: z.coerce.boolean().optional().default(false),
});

export async function uploadOpenApiSpec(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const raw = Object.fromEntries(formData.entries());
  raw.autoPublish = raw.autoPublish === "on" || raw.autoPublish === "true" ? "true" : "false";
  const parsed = uploadSpecSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}/openapi?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const validation = validateSpec(d.body, d.format);

  await db.openApiSpec.upsert({
    where: { version: d.version },
    create: {
      version: d.version,
      body: d.body,
      format: d.format,
      validatedAt: new Date(),
      validationErrors: validation.errors,
      autoPublish: d.autoPublish,
      publishedAt: d.autoPublish && validation.errors.length === 0 ? new Date() : null,
      uploadedById: ctx.userId,
    },
    update: {
      body: d.body,
      format: d.format,
      validatedAt: new Date(),
      validationErrors: validation.errors,
      autoPublish: d.autoPublish,
      publishedAt: d.autoPublish && validation.errors.length === 0 ? new Date() : null,
      uploadedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.openapi_uploaded",
    entityType: "OpenApiSpec",
    entityId: d.version,
    metadata: { actor: ctx.email, version: d.version, errorCount: validation.errors.length },
  });
  revalidatePath(`${ROUTE}/openapi`);
  redirect(`${ROUTE}/openapi?ok=spec-${d.autoPublish && validation.errors.length === 0 ? "published" : "uploaded"}`);
}

const publishSpecSchema = z.object({ version: z.string().min(1) });
export async function publishOpenApiSpec(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = publishSpecSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}/openapi?error=invalid`);
  await db.openApiSpec.update({
    where: { version: parsed.data.version },
    data: { publishedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.openapi_published",
    entityType: "OpenApiSpec",
    entityId: parsed.data.version,
    metadata: { actor: ctx.email, version: parsed.data.version },
  });
  revalidatePath(`${ROUTE}/openapi`);
  redirect(`${ROUTE}/openapi?ok=spec-published`);
}

/** Tiny YAML/JSON sniff + structural OpenAPI check. */
function validateSpec(body: string, format: string): { errors: string[] } {
  const errors: string[] = [];
  if (body.length < 10) errors.push("Body too small to be a valid OpenAPI document.");
  if (format === "json") {
    try {
      const parsed = JSON.parse(body) as unknown;
      const errs = inspectOpenApiObject(parsed);
      errors.push(...errs);
    } catch (e) {
      errors.push(`JSON parse error: ${(e as Error).message}`);
    }
  } else {
    // Cheap YAML sniff — make sure it starts with `openapi: ` and contains "paths:" + "info:".
    if (!/^openapi\s*:\s*3\.\d+/.test(body.trim())) {
      errors.push("Top-level `openapi: 3.x` declaration not found.");
    }
    if (!/\binfo\s*:/.test(body)) errors.push("Missing `info:` block.");
    if (!/\npaths\s*:/.test(body)) errors.push("Missing `paths:` block.");
  }
  return { errors };
}

function inspectOpenApiObject(o: unknown): string[] {
  if (!o || typeof o !== "object") return ["Document is not an object."];
  const obj = o as Record<string, unknown>;
  const errs: string[] = [];
  if (typeof obj.openapi !== "string" || !obj.openapi.startsWith("3.")) {
    errs.push("`openapi` field missing or not 3.x.");
  }
  if (!obj.info) errs.push("`info` block missing.");
  if (!obj.paths) errs.push("`paths` block missing.");
  return errs;
}

/* ── Code samples ──────────────────────────────────── */

const codeSampleSchema = z.object({
  endpointKey: z.string().min(1).max(200),
  language:    z.string().min(1).max(50),
  body:        z.string().min(1).max(20_000),
});

export async function saveCodeSample(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = codeSampleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}/code-samples?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const lint = lintCodeSample(d.body, d.language);
  await db.codeSample.upsert({
    where: { endpointKey_language: { endpointKey: d.endpointKey, language: d.language } },
    create: {
      endpointKey: d.endpointKey,
      language: d.language,
      body: d.body,
      lintedAt: new Date(),
      lintStatus: lint.status,
      lintMessage: lint.message,
    },
    update: {
      body: d.body,
      lintedAt: new Date(),
      lintStatus: lint.status,
      lintMessage: lint.message,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.code_sample_saved",
    entityType: "CodeSample",
    entityId: `${d.language}:${d.endpointKey}`,
    metadata: { actor: ctx.email, language: d.language, lintStatus: lint.status },
  });
  revalidatePath(`${ROUTE}/code-samples`);
  redirect(`${ROUTE}/code-samples?ok=code-sample-saved`);
}

const codeSampleDeleteSchema = z.object({ id: z.string().min(1) });
export async function deleteCodeSample(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = codeSampleDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}/code-samples?error=invalid`);
  await db.codeSample.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.docs.code_sample_deleted",
    entityType: "CodeSample",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${ROUTE}/code-samples`);
  redirect(`${ROUTE}/code-samples?ok=code-sample-deleted`);
}

/** Heuristic per-language lint — looks for obvious issues. Real
 *  implementation would shell out to language-specific linters and
 *  test against the sandbox API. */
function lintCodeSample(body: string, language: string): { status: "ok" | "warnings" | "errors"; message: string | null } {
  if (!body.trim()) return { status: "errors", message: "Empty snippet." };
  const messages: string[] = [];
  const lower = body.toLowerCase();
  if (lower.includes("secret_key_replace_me") || lower.includes("your-api-key")) {
    messages.push("Placeholder secret detected — replace with `<API_KEY>` notation.");
  }
  if (language === "curl" && !lower.includes("authorization") && !lower.includes("-h ")) {
    messages.push("No Authorization header — sandbox calls will 401.");
  }
  if (language === "node" && !/(fetch|axios|@flowtora\/sdk)/.test(body)) {
    messages.push("No fetch/axios/SDK usage detected.");
  }
  if (language === "python" && !/(requests|urllib|httpx|flowtora)/.test(body)) {
    messages.push("No requests/httpx/Flowtora SDK detected.");
  }
  if (messages.length === 0) return { status: "ok", message: null };
  // Multiple messages → warnings; placeholder secret → errors.
  if (messages.some((m) => m.startsWith("Placeholder"))) {
    return { status: "errors", message: messages.join(" ") };
  }
  return { status: "warnings", message: messages.join(" ") };
}
