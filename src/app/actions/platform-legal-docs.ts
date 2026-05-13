"use server";

// Page 71 — Legal Documents server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type { LegalDocumentKind } from "@prisma/client";

const ROUTE = "/platform/settings/legal";
const PERM_WRITE   = "legal.write"   as const;
const PERM_PUBLISH = "legal.publish" as const;

const KINDS = [
  "TERMS_OF_SERVICE", "PRIVACY_POLICY", "ACCEPTABLE_USE_POLICY",
  "DPA", "SUB_PROCESSOR_ADDENDUM", "SLA",
  "COOKIE_POLICY", "COOKIE_CONSENT_CATEGORIES",
  "REFUND_POLICY", "ANTI_SPAM_POLICY",
  "MASTER_SERVICE_AGREEMENT", "ORDER_FORM_TEMPLATE",
  "RESELLER_AGREEMENT", "AFFILIATE_AGREEMENT", "MARKETPLACE_DEV_AGREEMENT",
] as const;

/* ── Document metadata ────────────────────────────────── */

const documentSchema = z.object({
  kind:        z.enum(KINDS),
  slug:        z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "slug — lowercase + hyphens"),
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ownerEmail:  z.string().email().or(z.literal("")).optional(),
});

export async function saveDocument(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = documentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const row = await db.legalDocument.upsert({
    where: { kind: d.kind as LegalDocumentKind },
    create: {
      kind: d.kind as LegalDocumentKind,
      slug: d.slug,
      title: d.title,
      description: d.description || null,
      ownerEmail: d.ownerEmail || null,
    },
    update: {
      slug: d.slug,
      title: d.title,
      description: d.description || null,
      ownerEmail: d.ownerEmail || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.document_saved",
    entityType: "LegalDocument", entityId: row.id,
    metadata: { actor: ctx.email, kind: d.kind, slug: d.slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=documents&slug=${row.slug}&ok=document-saved#documents`);
}

/* ── Version CRUD + approval pipeline ─────────────────── */

const versionSchema = z.object({
  id:          z.string().optional(),
  documentId:  z.string().min(1),
  body:        z.string().min(1).max(200000),
  changeSummary: z.string().max(2000).optional(),
});

export async function saveDraftVersion(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = versionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=versions&error=${msg}#versions`);
  }
  const d = parsed.data;
  const doc = await db.legalDocument.findUnique({ where: { id: d.documentId } });
  if (!doc) redirect(`${ROUTE}?error=${encodeURIComponent("Document not found")}`);
  // Find the highest existing version for this doc.
  const latest = await db.legalDocumentVersion.findFirst({
    where: { documentId: d.documentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;
  const row = await db.legalDocumentVersion.create({
    data: {
      documentId: d.documentId,
      version: nextVersion,
      body: d.body,
      status: "DRAFT",
      changeSummary: d.changeSummary || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.draft_saved",
    entityType: "LegalDocumentVersion", entityId: row.id,
    metadata: { actor: ctx.email, version: nextVersion, doc: doc!.slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=versions&slug=${doc!.slug}&version=${nextVersion}&ok=draft-saved#versions`);
}

const idSchema = z.object({
  id:    z.string().min(1),
  note:  z.string().max(2000).optional(),
});

export async function submitForLegalReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.legalDocumentVersion.update({
    where: { id: parsed.data.id },
    data: { status: "LEGAL_REVIEW", notes: parsed.data.note || null },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.submitted_for_review",
    entityType: "LegalDocumentVersion", entityId: row.id,
    metadata: { actor: ctx.email, version: row.version },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=versions&ok=submitted#versions`);
}

export async function approveLegalReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.legalDocumentVersion.update({
    where: { id: parsed.data.id },
    data: {
      status: "COUNSEL_SIGN_OFF",
      reviewedByEmail: ctx.email,
      reviewedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.legal_reviewed",
    entityType: "LegalDocumentVersion", entityId: row.id,
    metadata: { actor: ctx.email, version: row.version },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=versions&ok=reviewed#versions`);
}

export async function signOffAndPublish(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const target = await db.legalDocumentVersion.findUnique({ where: { id: parsed.data.id } });
  if (!target) redirect(`${ROUTE}?error=${encodeURIComponent("Version not found")}`);
  const now = new Date();
  // Archive any other PUBLISHED version on this document.
  await db.legalDocumentVersion.updateMany({
    where: { documentId: target!.documentId, status: "PUBLISHED" },
    data: { status: "ARCHIVED" },
  });
  const row = await db.legalDocumentVersion.update({
    where: { id: parsed.data.id },
    data: {
      status: "PUBLISHED",
      signedOffByEmail: ctx.email,
      signedOffAt: now,
      publishedByEmail: ctx.email,
      publishedAt: now,
      effectiveAt: now,
    },
  });
  await db.legalDocument.update({
    where: { id: target!.documentId },
    data: {
      currentVersion: row.version,
      publishedAt: now,
      effectiveAt: now,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.published",
    entityType: "LegalDocumentVersion", entityId: row.id,
    metadata: { actor: ctx.email, version: row.version },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=versions&ok=published#versions`);
}

export async function rejectReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  if (!parsed.data.note || parsed.data.note.trim().length === 0) {
    redirect(`${ROUTE}?error=${encodeURIComponent("A rejection note is required")}`);
  }
  const row = await db.legalDocumentVersion.update({
    where: { id: parsed.data.id },
    data: { status: "DRAFT", notes: parsed.data.note ?? null },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.rejected",
    entityType: "LegalDocumentVersion", entityId: row.id,
    metadata: { actor: ctx.email, version: row.version },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=versions&ok=rejected#versions`);
}

/* ── Locale management ────────────────────────────────── */

const localeSchema = z.object({
  documentId: z.string().min(1),
  locale:     z.string().min(2).max(20).regex(/^[a-z]{2}(-[A-Z]{2,3})?$/, "BCP 47"),
  body:       z.string().min(1).max(200000),
  syncedFromVersion: z.coerce.number().int().min(0),
  completenessPct:   z.coerce.number().int().min(0).max(100),
  source:            z.string().max(60).optional(),
  translatorNote:    z.string().max(2000).optional(),
});

export async function saveLocaleTranslation(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = localeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=locales&error=${msg}#locales`);
  }
  const d = parsed.data;
  const data = {
    body: d.body,
    syncedFromVersion: d.syncedFromVersion,
    completenessPct:   d.completenessPct,
    source:            d.source || null,
    translatorNote:    d.translatorNote || null,
  };
  await db.legalDocumentLocale.upsert({
    where: { documentId_locale: { documentId: d.documentId, locale: d.locale } },
    create: { documentId: d.documentId, locale: d.locale, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.locale_saved",
    entityType: "LegalDocumentLocale", entityId: d.documentId,
    metadata: { actor: ctx.email, locale: d.locale, completenessPct: d.completenessPct },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=locales&ok=locale-saved#locales`);
}

/* ── Mandatory re-acceptance ──────────────────────────── */

const reacceptSchema = z.object({
  id:               z.string().optional(),
  documentId:       z.string().min(1),
  requiredVersion:  z.coerce.number().int().min(1),
  tenantPlanScope:  z.string().max(200).optional(),
  bannerCopy:       z.string().min(1).max(2000),
  gracePeriodDays:  z.coerce.number().int().min(0).max(180),
  enforceBlock:     z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function createReacceptance(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = reacceptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=reaccept&error=${msg}#reaccept`);
  }
  const d = parsed.data;
  const plans = (d.tenantPlanScope ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const row = await db.mandatoryReAcceptance.create({
    data: {
      documentId: d.documentId,
      requiredVersion: d.requiredVersion,
      tenantPlanScope: plans,
      tenantIdScope: [],
      bannerCopy: d.bannerCopy,
      gracePeriodDays: d.gracePeriodDays,
      enforceBlock: d.enforceBlock === "on",
      activatedAt: new Date(),
      createdByEmail: ctx.email,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.reaccept_activated",
    entityType: "MandatoryReAcceptance", entityId: row.id,
    metadata: { actor: ctx.email, version: d.requiredVersion },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=reaccept&ok=activated#reaccept`);
}

export async function closeReacceptance(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect(`${ROUTE}?tab=reaccept&error=Invalid#reaccept`);
  await db.mandatoryReAcceptance.update({ where: { id: id as string }, data: { closedAt: new Date() } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.reaccept_closed",
    entityType: "MandatoryReAcceptance", entityId: id as string,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=reaccept&ok=closed#reaccept`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  defaultJurisdiction:    z.string().min(1).max(120),
  governingLaw:           z.string().min(1).max(120),
  arbitrationProvider:    z.string().max(120).optional(),
  venue:                  z.string().max(200).optional(),
  effectiveDateOffsetDays: z.coerce.number().int().min(0).max(180),
  cookieBannerCopy:       z.string().max(4000).optional(),
  notes:                  z.string().max(2000).optional(),
});

export async function saveLegalSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PUBLISH);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=settings&error=${msg}#settings`);
  }
  const d = parsed.data;
  const data = {
    defaultJurisdiction:     d.defaultJurisdiction,
    governingLaw:            d.governingLaw,
    arbitrationProvider:     d.arbitrationProvider || null,
    venue:                   d.venue || null,
    effectiveDateOffsetDays: d.effectiveDateOffsetDays,
    cookieBannerCopy:        d.cookieBannerCopy || null,
    notes:                   d.notes || null,
    updatedById:             ctx.userId,
  };
  await db.legalSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.legal.settings_saved",
    entityType: "LegalSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved#settings`);
}
