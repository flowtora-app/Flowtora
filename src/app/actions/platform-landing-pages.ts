"use server";

// Page 38 — Landing Pages actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import { defaultBlock, parseBlocks, type LpBlockKind } from "@/lib/lp-blocks";
import type { LandingPageStatus } from "@prisma/client";

const LIST_ROUTE = "/platform/marketing/landing-pages";
const PERM_WRITE = "announcement.write" as const;
const detailRoute = (id: string) => `${LIST_ROUTE}/${id}`;

function normalizePath(input: string): string {
  let p = input.trim();
  if (!p.startsWith("/")) p = "/" + p;
  // strip trailing slash except root
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  // collapse double slashes
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

async function snapshotRevision(pageId: string, savedByUserId: string, note: string | null) {
  const row = await db.landingPage.findUnique({
    where: { id: pageId },
    select: { blocks: true, customHtml: true, customCss: true, customJs: true, metaTitle: true, metaDescription: true, ogImageUrl: true, formSchema: true },
  });
  if (!row) return;
  await db.landingPageRevision.create({
    data: {
      pageId,
      blocks: row.blocks ?? [],
      customHtml: row.customHtml,
      customCss: row.customCss,
      customJs: row.customJs,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      ogImageUrl: row.ogImageUrl,
      formSchema: row.formSchema ?? [],
      savedByUserId,
      note,
    },
  });
}

/* ── Create ────────────────────────────────────────────── */

const createSchema = z.object({
  path: z.string().min(1, "Path required").max(120),
  title: z.string().min(1, "Title required").max(200),
  templateId: z.string().optional().or(z.literal("")),
});

export async function createLandingPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const path = normalizePath(parsed.data.path);
  const existing = await db.landingPage.findUnique({ where: { path }, select: { id: true } });
  if (existing) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(`Path ${path} is already in use`)}`);
  }

  // Pull blocks from template if specified, else seed with sensible default set.
  let blocks: unknown = [
    defaultBlock("header"),
    defaultBlock("hero"),
    defaultBlock("features"),
    defaultBlock("cta"),
    defaultBlock("footer"),
  ];
  if (parsed.data.templateId) {
    const tmpl = await db.landingPageTemplate.findUnique({
      where: { id: parsed.data.templateId },
      select: { blocks: true },
    });
    if (tmpl) blocks = tmpl.blocks;
  }

  const created = await db.landingPage.create({
    data: {
      path,
      title: parsed.data.title,
      blocks: blocks as never,
      authorId: ctx.userId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.created",
    entityType: "LandingPage",
    entityId: created.id,
    metadata: { actor: ctx.email, path, title: parsed.data.title },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${detailRoute(created.id)}?ok=created`);
}

/* ── Save ──────────────────────────────────────────────── */

const saveSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().max(400).optional().or(z.literal("")),
  blocksJson: z.string().default("[]"),
  customHtml: z.string().max(200_000).optional().or(z.literal("")),
  customCss:  z.string().max(200_000).optional().or(z.literal("")),
  customJs:   z.string().max(200_000).optional().or(z.literal("")),
  metaTitle: z.string().max(200).optional().or(z.literal("")),
  metaDescription: z.string().max(400).optional().or(z.literal("")),
  ogImageUrl: z.string().max(500).optional().or(z.literal("")),
  schemaJsonLd: z.string().max(20_000).optional().or(z.literal("")),
  canonicalUrl: z.string().max(500).optional().or(z.literal("")),
  formSchemaJson: z.string().default("[]"),
  customDomainId: z.string().optional().or(z.literal("")),
  abTestPrimaryMetric: z.enum(["", "SIGNUP", "CLICK", "SCROLL_DEPTH", "TIME_ON_PAGE", "CONVERSION"]).default(""),
  revisionNote: z.string().max(280).optional().or(z.literal("")),
});

export async function saveLandingPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = saveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  // Snapshot before edit.
  await snapshotRevision(d.id, ctx.userId, d.revisionNote || null);

  let blocks: unknown = [];
  try { blocks = JSON.parse(d.blocksJson); } catch { blocks = []; }
  const blocksParsed = parseBlocks(blocks);

  let formSchema: unknown = [];
  try { formSchema = JSON.parse(d.formSchemaJson); } catch { formSchema = []; }

  const path = normalizePath(d.path);
  // Conflict check (allow same id keeping its own path).
  const conflict = await db.landingPage.findUnique({ where: { path }, select: { id: true } });
  if (conflict && conflict.id !== d.id) {
    redirect(`${detailRoute(d.id)}?error=${encodeURIComponent(`Path ${path} already in use`)}`);
  }

  await db.landingPage.update({
    where: { id: d.id },
    data: {
      path,
      title: d.title,
      description: d.description || null,
      blocks: blocksParsed as never,
      customHtml: d.customHtml || null,
      customCss:  d.customCss  || null,
      customJs:   d.customJs   || null,
      metaTitle: d.metaTitle || null,
      metaDescription: d.metaDescription || null,
      ogImageUrl: d.ogImageUrl || null,
      schemaJsonLd: d.schemaJsonLd || null,
      canonicalUrl: d.canonicalUrl || null,
      formSchema: formSchema as never,
      customDomainId: d.customDomainId || null,
      abTestPrimaryMetric: d.abTestPrimaryMetric === "" ? null : d.abTestPrimaryMetric,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.saved",
    entityType: "LandingPage",
    entityId: d.id,
    metadata: { actor: ctx.email, path, blockCount: blocksParsed.length },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(d.id));
  revalidatePath(`/lp${path}`);
  redirect(`${detailRoute(d.id)}?ok=saved`);
}

/* ── Status transitions ────────────────────────────────── */

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"]),
  publishAt: z.string().optional().or(z.literal("")),
});

export async function transitionLandingPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent("Invalid status")}`);
  }
  const { id, to } = parsed.data;
  const now = new Date();
  await db.landingPage.update({
    where: { id },
    data: {
      status: to,
      publishAt: to === "SCHEDULED" && parsed.data.publishAt
        ? new Date(parsed.data.publishAt)
        : (to === "DRAFT" ? null : undefined),
      publishedAt: to === "LIVE" ? now : undefined,
      archivedAt: to === "ARCHIVED" ? now : (to === "DRAFT" || to === "LIVE" ? null : undefined),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.lp.${to.toLowerCase()}`,
    entityType: "LandingPage",
    entityId: id,
    metadata: { actor: ctx.email, to },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=transitioned`);
}

/* ── Rollback to revision ─────────────────────────────── */

const rollbackSchema = z.object({
  id: z.string().min(1),
  revisionId: z.string().min(1),
});

export async function rollbackLandingPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = rollbackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);

  const rev = await db.landingPageRevision.findUnique({
    where: { id: parsed.data.revisionId },
    select: { blocks: true, customHtml: true, customCss: true, customJs: true, metaTitle: true, metaDescription: true, ogImageUrl: true, formSchema: true, pageId: true, createdAt: true },
  });
  if (!rev || rev.pageId !== parsed.data.id) {
    redirect(`${detailRoute(parsed.data.id)}?error=${encodeURIComponent("Revision not found")}`);
  }
  if (!rev) return;

  // Snapshot the current state before overwriting it, so the rollback itself
  // is reversible.
  await snapshotRevision(parsed.data.id, ctx.userId, `Pre-rollback snapshot (rolling back to ${rev.createdAt.toISOString()})`);

  await db.landingPage.update({
    where: { id: parsed.data.id },
    data: {
      blocks: rev.blocks as never,
      customHtml: rev.customHtml,
      customCss: rev.customCss,
      customJs: rev.customJs,
      metaTitle: rev.metaTitle,
      metaDescription: rev.metaDescription,
      ogImageUrl: rev.ogImageUrl,
      formSchema: rev.formSchema as never,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.rolled_back",
    entityType: "LandingPage",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, toRevision: parsed.data.revisionId },
  });
  revalidatePath(detailRoute(parsed.data.id));
  redirect(`${detailRoute(parsed.data.id)}?ok=rolled-back`);
}

/* ── A/B variants ──────────────────────────────────────── */

const variantSchema = z.object({
  variantId: z.string().optional().or(z.literal("")),
  pageId: z.string().min(1),
  label: z.string().min(1).max(40),
  trafficPct: z.coerce.number().int().min(0).max(100),
  blocksJson: z.string().default("[]"),
  customHtml: z.string().max(200_000).optional().or(z.literal("")),
  customCss:  z.string().max(200_000).optional().or(z.literal("")),
});

export async function upsertLandingPageVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = variantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const pid = formData.get("pageId");
    redirect(`${detailRoute(String(pid))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  let blocks: unknown = [];
  try { blocks = JSON.parse(d.blocksJson); } catch { blocks = []; }

  if (d.variantId) {
    await db.landingPageVariant.update({
      where: { id: d.variantId },
      data: {
        label: d.label,
        trafficPct: d.trafficPct,
        blocks: blocks as never,
        customHtml: d.customHtml || null,
        customCss: d.customCss || null,
      },
    });
  } else {
    await db.landingPageVariant.create({
      data: {
        pageId: d.pageId,
        label: d.label,
        trafficPct: d.trafficPct,
        blocks: blocks as never,
        customHtml: d.customHtml || null,
        customCss: d.customCss || null,
      },
    });
  }
  await db.landingPage.update({
    where: { id: d.pageId },
    data: { abTestStartedAt: { set: new Date() } },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.variant_saved",
    entityType: "LandingPageVariant",
    entityId: d.variantId || d.label,
    metadata: { actor: ctx.email, pageId: d.pageId, label: d.label, trafficPct: d.trafficPct },
  });
  revalidatePath(detailRoute(d.pageId));
  redirect(`${detailRoute(d.pageId)}?tab=ab&ok=saved`);
}

const deleteVariantSchema = z.object({
  variantId: z.string().min(1),
  pageId: z.string().min(1),
});

export async function deleteLandingPageVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = deleteVariantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.landingPageVariant.delete({ where: { id: parsed.data.variantId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.variant_deleted",
    entityType: "LandingPageVariant",
    entityId: parsed.data.variantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.pageId));
  redirect(`${detailRoute(parsed.data.pageId)}?tab=ab&ok=deleted`);
}

const declareWinnerSchema = z.object({
  pageId: z.string().min(1),
  label: z.string().min(1),
});

export async function declareAbWinner(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = declareWinnerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.landingPage.update({
    where: { id: parsed.data.pageId },
    data: { abTestWinnerLabel: parsed.data.label },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.ab_winner_declared",
    entityType: "LandingPage",
    entityId: parsed.data.pageId,
    metadata: { actor: ctx.email, label: parsed.data.label },
  });
  revalidatePath(detailRoute(parsed.data.pageId));
  redirect(`${detailRoute(parsed.data.pageId)}?tab=ab&ok=winner-${parsed.data.label}`);
}

/* ── Domains ───────────────────────────────────────────── */

const domainSchema = z.object({
  hostname: z.string().min(3).max(120).regex(/^[a-z0-9.-]+$/i, "lowercase hostname"),
});

function generateVerificationToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createLandingPageDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = domainSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}/domains?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const hostname = parsed.data.hostname.toLowerCase();
  await db.landingPageDomain.create({
    data: {
      hostname,
      verificationToken: generateVerificationToken(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.domain_added",
    entityType: "LandingPageDomain",
    entityId: hostname,
    metadata: { actor: ctx.email, hostname },
  });
  revalidatePath(`${LIST_ROUTE}/domains`);
  redirect(`${LIST_ROUTE}/domains?ok=added`);
}

const verifyDomainSchema = z.object({ id: z.string().min(1) });

export async function verifyLandingPageDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = verifyDomainSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}/domains?error=${encodeURIComponent("Invalid")}`);
  // In a real run we'd dig the TXT record at the configured hostname and
  // compare against the stored token. For the admin tooling we mark verified
  // optimistically and stamp lastChecked. Future runtime replaces this body.
  await db.landingPageDomain.update({
    where: { id: parsed.data.id },
    data: { status: "VERIFIED", verifiedAt: new Date(), errorMessage: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.domain_verified",
    entityType: "LandingPageDomain",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/domains`);
  redirect(`${LIST_ROUTE}/domains?ok=verified`);
}

const removeDomainSchema = z.object({ id: z.string().min(1) });

export async function removeLandingPageDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = removeDomainSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}/domains?error=${encodeURIComponent("Invalid")}`);
  // Detach pages first.
  await db.landingPage.updateMany({
    where: { customDomainId: parsed.data.id },
    data: { customDomainId: null },
  });
  await db.landingPageDomain.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.domain_removed",
    entityType: "LandingPageDomain",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/domains`);
  redirect(`${LIST_ROUTE}/domains?ok=removed`);
}

/* ── Templates ─────────────────────────────────────────── */

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().or(z.literal("")),
  thumbnailUrl: z.string().max(500).optional().or(z.literal("")),
  category: z.string().max(40).optional().or(z.literal("")),
  blocksFromPageId: z.string().optional().or(z.literal("")),
});

export async function createTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}/templates?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  let blocks: unknown = [defaultBlock("hero"), defaultBlock("cta")];
  if (d.blocksFromPageId) {
    const src = await db.landingPage.findUnique({
      where: { id: d.blocksFromPageId },
      select: { blocks: true },
    });
    if (src) blocks = src.blocks ?? [];
  }
  await db.landingPageTemplate.create({
    data: {
      name: d.name,
      description: d.description || null,
      thumbnailUrl: d.thumbnailUrl || null,
      category: d.category || null,
      blocks: blocks as never,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.template_created",
    entityType: "LandingPageTemplate",
    entityId: d.name,
    metadata: { actor: ctx.email, name: d.name },
  });
  revalidatePath(`${LIST_ROUTE}/templates`);
  redirect(`${LIST_ROUTE}/templates?ok=created`);
}

const removeTemplateSchema = z.object({ id: z.string().min(1) });

export async function removeTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = removeTemplateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}/templates?error=${encodeURIComponent("Invalid")}`);
  await db.landingPageTemplate.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.lp.template_removed",
    entityType: "LandingPageTemplate",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/templates`);
  redirect(`${LIST_ROUTE}/templates?ok=removed`);
}

/* ── Submission triage ─────────────────────────────────── */

const submissionStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "reviewed", "spam", "converted"]),
});

export async function setSubmissionStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = submissionStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}/submissions?error=${encodeURIComponent("Invalid")}`);
  await db.landingPageFormSubmission.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.status,
      reviewedByUserId: parsed.data.status === "new" ? null : ctx.userId,
      reviewedAt: parsed.data.status === "new" ? null : new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.lp.submission_${parsed.data.status}`,
    entityType: "LandingPageFormSubmission",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/submissions`);
  redirect(`${LIST_ROUTE}/submissions?ok=${parsed.data.status}`);
}

/* ── Block kind helper for client builder ──────────────── */

export async function newDefaultBlock(kind: LpBlockKind) {
  // Wrap defaultBlock so the client component can call this server action
  // when the user picks a block kind (avoids shipping the default factory
  // to the client bundle).
  return defaultBlock(kind);
}
