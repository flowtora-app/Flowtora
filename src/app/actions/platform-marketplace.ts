"use server";

// Page 48 — Marketplace actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  MarketplaceAppStatus,
  MarketplacePricingModel,
  MarketplaceRiskLevel,
  MarketplaceReviewStatus,
  MarketplaceSubmissionStage,
  MarketplaceRevenueShareTier,
} from "@prisma/client";

const ROUTE = "/platform/integrations/marketplace";
const PERM = "marketplace.manage" as const;
const detailRoute = (slug: string) => `${ROUTE}/${slug}`;

const STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"] as const;
const PRICING_MODELS = ["FREE", "ONE_TIME", "SUBSCRIPTION", "USAGE"] as const;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const REVIEW_STATUSES = ["PUBLISHED", "HIDDEN", "FLAGGED", "REMOVED"] as const;
const STAGES = ["SUBMITTED", "AUTOMATED_CHECKS", "SECURITY_REVIEW", "LISTING_REVIEW", "APPROVED", "REJECTED"] as const;
const TIERS = ["STANDARD", "PREFERRED", "PARTNER"] as const;

/* ── App listing edits ───────────────────────────── */

const listingSchema = z.object({
  id:          z.string().min(1),
  name:        z.string().min(1).max(120),
  slug:        z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  tagline:     z.string().min(1).max(140),
  description: z.string().min(1).max(50_000),
  iconUrl:     z.string().max(500).optional().or(z.literal("")),
  videoUrl:    z.string().max(500).optional().or(z.literal("")),
  screenshotsRaw: z.string().max(5000).optional().or(z.literal("")),
  categoryId:  z.string().min(1),
  developerName:  z.string().min(1).max(120),
  developerEmail: z.string().min(1).max(200),
  repoUrl:     z.string().max(500).optional().or(z.literal("")),
  supportUrl:  z.string().max(500).optional().or(z.literal("")),
  privacyUrl:  z.string().max(500).optional().or(z.literal("")),
  termsUrl:    z.string().max(500).optional().or(z.literal("")),
  eulaUrl:     z.string().max(500).optional().or(z.literal("")),
  pricingModel: z.enum(PRICING_MODELS),
  pricingDetailsRaw: z.string().max(5000).optional().or(z.literal("")),
  featured:    z.coerce.boolean().optional().default(false),
});

export async function saveAppListing(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.featured = raw.featured === "on" || raw.featured === "true" ? "true" : "false";
  const parsed = listingSchema.safeParse(raw);
  if (!parsed.success) {
    const slugFb = formData.get("slug") ?? "";
    redirect(`${detailRoute(String(slugFb))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const screenshots = (d.screenshotsRaw ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let pricingDetails: unknown = {};
  if (d.pricingDetailsRaw) {
    try { pricingDetails = JSON.parse(d.pricingDetailsRaw); }
    catch { pricingDetails = {}; }
  }
  const updated = await db.marketplaceApp.update({
    where: { id: d.id },
    data: {
      name: d.name,
      slug: d.slug,
      tagline: d.tagline,
      description: d.description,
      iconUrl: d.iconUrl || null,
      videoUrl: d.videoUrl || null,
      screenshots,
      categoryId: d.categoryId,
      developerName: d.developerName,
      developerEmail: d.developerEmail,
      repoUrl: d.repoUrl || null,
      supportUrl: d.supportUrl || null,
      privacyUrl: d.privacyUrl || null,
      termsUrl: d.termsUrl || null,
      eulaUrl: d.eulaUrl || null,
      pricingModel: d.pricingModel as MarketplacePricingModel,
      pricingDetails: pricingDetails as never,
      featured: d.featured,
    },
    select: { slug: true },
  });
  await db.marketplaceAppAudit.create({
    data: { appId: d.id, action: "listing_updated", detail: `Saved by ${ctx.email}`, authorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.listing_updated",
    entityType: "MarketplaceApp",
    entityId: d.id,
    metadata: { actor: ctx.email, slug: d.slug },
  });
  revalidatePath(detailRoute(updated.slug));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(updated.slug)}?ok=saved`);
}

/* ── Approval pipeline transitions ──────────────── */

const transitionSchema = z.object({
  id:        z.string().min(1),
  toStage:   z.enum(STAGES),
  comments:  z.string().max(2000).optional().or(z.literal("")),
});

export async function transitionSubmission(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, toStage, comments } = parsed.data;
  const app = await db.marketplaceApp.findUnique({ where: { id }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  // Close the current open stage if any.
  await db.marketplaceSubmission.updateMany({
    where: { appId: id, exitedAt: null },
    data: { exitedAt: new Date() },
  });
  const slaHours = toStage === "SECURITY_REVIEW" ? 168 : 72;
  await db.marketplaceSubmission.create({
    data: {
      appId: id,
      stage: toStage as MarketplaceSubmissionStage,
      comments: comments || null,
      assigneeId: ctx.userId,
      slaDeadlineAt: new Date(Date.now() + slaHours * 60 * 60 * 1000),
    },
  });
  // Update app status when entering terminal stages.
  let nextStatus: MarketplaceAppStatus | null = null;
  if (toStage === "APPROVED") nextStatus = "APPROVED";
  if (toStage === "REJECTED") nextStatus = "REJECTED";
  if (toStage === "SUBMITTED" || toStage === "AUTOMATED_CHECKS" || toStage === "SECURITY_REVIEW" || toStage === "LISTING_REVIEW") {
    nextStatus = "IN_REVIEW";
  }
  if (nextStatus) {
    await db.marketplaceApp.update({
      where: { id },
      data: {
        status: nextStatus,
        approvedAt: nextStatus === "APPROVED" ? new Date() : undefined,
        approvedById: nextStatus === "APPROVED" ? ctx.userId : undefined,
        publishedAt: nextStatus === "APPROVED" ? new Date() : undefined,
        submittedAt: toStage === "SUBMITTED" ? new Date() : undefined,
      },
    });
  }
  await db.marketplaceAppAudit.create({
    data: { appId: id, action: `stage_${toStage.toLowerCase()}`, detail: comments ?? null, authorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.stage_transition",
    entityType: "MarketplaceApp",
    entityId: id,
    metadata: { actor: ctx.email, toStage, comments: comments ?? null },
  });
  revalidatePath(detailRoute(app.slug));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(app.slug)}?tab=submissions&ok=stage-${toStage.toLowerCase()}`);
}

/* ── Permissions edit ────────────────────────────── */

const permissionSchema = z.object({
  appId:         z.string().min(1),
  scope:         z.string().min(1).max(120),
  riskLevel:     z.enum(RISK_LEVELS),
  justification: z.string().min(1).max(500),
});
export async function addAppPermission(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = permissionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.appId }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  await db.marketplaceAppPermission.upsert({
    where: { appId_scope: { appId: parsed.data.appId, scope: parsed.data.scope } },
    create: {
      appId: parsed.data.appId,
      scope: parsed.data.scope,
      riskLevel: parsed.data.riskLevel as MarketplaceRiskLevel,
      justification: parsed.data.justification,
    },
    update: {
      riskLevel: parsed.data.riskLevel as MarketplaceRiskLevel,
      justification: parsed.data.justification,
    },
  });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.appId, action: "permission_saved", detail: parsed.data.scope, authorId: ctx.userId },
  });
  revalidatePath(detailRoute(app.slug));
  redirect(`${detailRoute(app.slug)}?tab=permissions&ok=permission-saved`);
}

const permissionRemoveSchema = z.object({ id: z.string().min(1), appId: z.string().min(1) });
export async function removeAppPermission(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = permissionRemoveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.appId }, select: { slug: true } });
  await db.marketplaceAppPermission.delete({ where: { id: parsed.data.id } });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.appId, action: "permission_removed", authorId: ctx.userId },
  });
  if (app) {
    revalidatePath(detailRoute(app.slug));
    redirect(`${detailRoute(app.slug)}?tab=permissions&ok=permission-removed`);
  }
  redirect(`${ROUTE}?ok=permission-removed`);
}

/* ── Versions ────────────────────────────────────── */

const versionSchema = z.object({
  appId:     z.string().min(1),
  version:   z.string().min(1).max(50),
  changelog: z.string().max(5000).optional().or(z.literal("")),
  isCurrent: z.coerce.boolean().optional().default(false),
});
export async function createAppVersion(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.isCurrent = raw.isCurrent === "on" || raw.isCurrent === "true" ? "true" : "false";
  const parsed = versionSchema.safeParse(raw);
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.appId }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  if (parsed.data.isCurrent) {
    await db.marketplaceAppVersion.updateMany({ where: { appId: parsed.data.appId }, data: { isCurrent: false } });
    await db.marketplaceApp.update({ where: { id: parsed.data.appId }, data: { currentVersion: parsed.data.version } });
  }
  await db.marketplaceAppVersion.create({
    data: {
      appId: parsed.data.appId,
      version: parsed.data.version,
      changelog: parsed.data.changelog || null,
      isCurrent: parsed.data.isCurrent,
    },
  });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.appId, action: "version_created", detail: parsed.data.version, authorId: ctx.userId },
  });
  revalidatePath(detailRoute(app.slug));
  redirect(`${detailRoute(app.slug)}?tab=versions&ok=version-created`);
}

const setCurrentVersionSchema = z.object({ versionId: z.string().min(1), appId: z.string().min(1) });
export async function setCurrentVersion(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = setCurrentVersionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.appId }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  const target = await db.marketplaceAppVersion.findUnique({ where: { id: parsed.data.versionId } });
  if (!target) redirect(`${ROUTE}?error=not-found`);
  await db.marketplaceAppVersion.updateMany({ where: { appId: parsed.data.appId }, data: { isCurrent: false } });
  await db.marketplaceAppVersion.update({ where: { id: parsed.data.versionId }, data: { isCurrent: true } });
  await db.marketplaceApp.update({ where: { id: parsed.data.appId }, data: { currentVersion: target.version } });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.appId, action: "version_set_current", detail: target.version, authorId: ctx.userId },
  });
  revalidatePath(detailRoute(app.slug));
  redirect(`${detailRoute(app.slug)}?tab=versions&ok=current-set`);
}

/* ── Reviews moderation ─────────────────────────── */

const reviewActionSchema = z.object({
  id:     z.string().min(1),
  appSlug: z.string().min(1),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export async function hideReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = reviewActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  await db.marketplaceReview.update({
    where: { id: parsed.data.id },
    data: {
      status: "HIDDEN",
      hiddenAt: new Date(),
      hiddenById: ctx.userId,
      flaggedReason: parsed.data.reason || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.review_hidden",
    entityType: "MarketplaceReview",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.appSlug));
  revalidatePath(`${ROUTE}?tab=reviews`);
  redirect(`${detailRoute(parsed.data.appSlug)}?tab=reviews&ok=review-hidden`);
}

export async function publishReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = reviewActionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  await db.marketplaceReview.update({
    where: { id: parsed.data.id },
    data: { status: "PUBLISHED", hiddenAt: null, flaggedReason: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.review_published",
    entityType: "MarketplaceReview",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.appSlug));
  redirect(`${detailRoute(parsed.data.appSlug)}?tab=reviews&ok=review-published`);
}

const replySchema = z.object({
  id:      z.string().min(1),
  appSlug: z.string().min(1),
  reply:   z.string().min(1).max(2000),
});
export async function replyToReview(formData: FormData) {
  const ctx = await requirePlatformPermission("marketplace.read");
  const parsed = replySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  await db.marketplaceReview.update({
    where: { id: parsed.data.id },
    data: { reply: parsed.data.reply, replyAuthorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.review_replied",
    entityType: "MarketplaceReview",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, length: parsed.data.reply.length },
  });
  revalidatePath(detailRoute(parsed.data.appSlug));
  redirect(`${detailRoute(parsed.data.appSlug)}?tab=reviews&ok=reply-saved`);
}

const banReviewerSchema = z.object({
  id:      z.string().min(1),
  appSlug: z.string().min(1),
});
export async function banReviewer(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = banReviewerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  await db.marketplaceReview.update({
    where: { id: parsed.data.id },
    data: { reviewerBanned: true, status: "REMOVED", hiddenAt: new Date(), hiddenById: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.reviewer_banned",
    entityType: "MarketplaceReview",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.appSlug));
  redirect(`${detailRoute(parsed.data.appSlug)}?tab=reviews&ok=reviewer-banned`);
}

/* ── Revenue share ──────────────────────────────── */

const tierSchema = z.object({
  appId: z.string().min(1),
  tier:  z.enum(TIERS),
});
export async function setAppRevenueTier(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = tierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.appId }, select: { slug: true } });
  await db.marketplaceApp.update({
    where: { id: parsed.data.appId },
    data: { revenueShareTier: parsed.data.tier as MarketplaceRevenueShareTier },
  });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.appId, action: "revenue_tier_changed", detail: parsed.data.tier, authorId: ctx.userId },
  });
  if (app) {
    revalidatePath(detailRoute(app.slug));
    redirect(`${detailRoute(app.slug)}?tab=revenue&ok=tier-set`);
  }
  redirect(`${ROUTE}?ok=tier-set`);
}

const payoutSchema = z.object({ id: z.string().min(1) });
export async function markPayoutPaid(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = payoutSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  await db.marketplacePayoutStatement.update({
    where: { id: parsed.data.id },
    data: { paid: true, paidAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.payout_marked_paid",
    entityType: "MarketplacePayoutStatement",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${ROUTE}?tab=revenue`);
  redirect(`${ROUTE}?tab=revenue&ok=payout-paid`);
}

/* ── Categories ─────────────────────────────────── */

const categorySchema = z.object({
  id:          z.string().optional().or(z.literal("")),
  slug:        z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name:        z.string().min(1).max(80),
  description: z.string().max(500).optional().or(z.literal("")),
  iconKey:     z.string().max(40).optional().or(z.literal("")),
  featuredOrder: z.coerce.number().int().min(0).max(99).optional(),
});
export async function saveCategory(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  if (raw.featuredOrder === "") delete raw.featuredOrder;
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) redirect(`${ROUTE}?tab=categories&error=invalid`);
  const d = parsed.data;
  const data = {
    slug: d.slug,
    name: d.name,
    description: d.description || null,
    iconKey: d.iconKey || null,
    featuredOrder: d.featuredOrder ?? null,
  };
  if (d.id) {
    await db.marketplaceCategory.update({ where: { id: d.id }, data });
  } else {
    await db.marketplaceCategory.create({ data });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: d.id ? "platform.marketplace.category_updated" : "platform.marketplace.category_created",
    entityType: "MarketplaceCategory",
    entityId: d.id || d.slug,
    metadata: { actor: ctx.email, slug: d.slug },
  });
  revalidatePath(`${ROUTE}?tab=categories`);
  redirect(`${ROUTE}?tab=categories&ok=category-saved`);
}

const categoryDeleteSchema = z.object({ id: z.string().min(1) });
export async function deleteCategory(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = categoryDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=categories&error=invalid`);
  // Check for in-use.
  const inUse = await db.marketplaceApp.count({ where: { categoryId: parsed.data.id } });
  if (inUse > 0) {
    redirect(`${ROUTE}?tab=categories&error=${encodeURIComponent(`Category is in use by ${inUse} app(s)`)}`);
  }
  await db.marketplaceCategory.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.category_deleted",
    entityType: "MarketplaceCategory",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${ROUTE}?tab=categories`);
  redirect(`${ROUTE}?tab=categories&ok=category-deleted`);
}

/* ── Settings ───────────────────────────────────── */

const settingsSchema = z.object({
  acceptingSubmissions:    z.coerce.boolean().optional().default(false),
  defaultRevenueShareTier: z.enum(TIERS),
  reviewSlaHours:          z.coerce.number().int().min(1).max(720).default(72),
  securityReviewSlaHours:  z.coerce.number().int().min(1).max(720).default(168),
  autoChecksEnabled:       z.coerce.boolean().optional().default(false),
  requireSoc2:             z.coerce.boolean().optional().default(false),
  requireScreenshots:      z.coerce.boolean().optional().default(false),
  minScreenshots:          z.coerce.number().int().min(0).max(20).default(2),
  requirePrivacyUrl:       z.coerce.boolean().optional().default(false),
  requireSupportUrl:       z.coerce.boolean().optional().default(false),
});
export async function saveMarketplaceSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of [
    "acceptingSubmissions", "autoChecksEnabled", "requireSoc2",
    "requireScreenshots", "requirePrivacyUrl", "requireSupportUrl",
  ]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) redirect(`${ROUTE}?tab=settings&error=invalid`);
  const d = parsed.data;
  await db.marketplaceSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      acceptingSubmissions: d.acceptingSubmissions,
      defaultRevenueShareTier: d.defaultRevenueShareTier as MarketplaceRevenueShareTier,
      reviewSlaHours: d.reviewSlaHours,
      securityReviewSlaHours: d.securityReviewSlaHours,
      autoChecksEnabled: d.autoChecksEnabled,
      requireSoc2: d.requireSoc2,
      requireScreenshots: d.requireScreenshots,
      minScreenshots: d.minScreenshots,
      requirePrivacyUrl: d.requirePrivacyUrl,
      requireSupportUrl: d.requireSupportUrl,
      updatedById: ctx.userId,
    },
    update: {
      acceptingSubmissions: d.acceptingSubmissions,
      defaultRevenueShareTier: d.defaultRevenueShareTier as MarketplaceRevenueShareTier,
      reviewSlaHours: d.reviewSlaHours,
      securityReviewSlaHours: d.securityReviewSlaHours,
      autoChecksEnabled: d.autoChecksEnabled,
      requireSoc2: d.requireSoc2,
      requireScreenshots: d.requireScreenshots,
      minScreenshots: d.minScreenshots,
      requirePrivacyUrl: d.requirePrivacyUrl,
      requireSupportUrl: d.requireSupportUrl,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.settings_saved",
    entityType: "MarketplaceSettings",
    entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Danger zone ────────────────────────────────── */

const suspendSchema = z.object({
  id:     z.string().min(1),
  reason: z.string().max(500),
});
export async function suspendApp(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = suspendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.id }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  await db.marketplaceApp.update({
    where: { id: parsed.data.id },
    data: {
      status: "SUSPENDED",
      suspendedAt: new Date(),
      suspendedById: ctx.userId,
      suspendedReason: parsed.data.reason,
    },
  });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.id, action: "suspended", detail: parsed.data.reason, authorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.app_suspended",
    entityType: "MarketplaceApp",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, reason: parsed.data.reason },
  });
  revalidatePath(detailRoute(app.slug));
  redirect(`${detailRoute(app.slug)}?ok=suspended`);
}

const unsuspendSchema = z.object({ id: z.string().min(1) });
export async function unsuspendApp(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = unsuspendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.id }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  await db.marketplaceApp.update({
    where: { id: parsed.data.id },
    data: {
      status: "APPROVED",
      suspendedAt: null,
      suspendedById: null,
      suspendedReason: null,
    },
  });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.id, action: "unsuspended", authorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.app_unsuspended",
    entityType: "MarketplaceApp",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(app.slug));
  redirect(`${detailRoute(app.slug)}?ok=unsuspended`);
}

const forceUninstallSchema = z.object({ id: z.string().min(1), confirm: z.string().min(1) });
export async function forceUninstallAll(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = forceUninstallSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const app = await db.marketplaceApp.findUnique({ where: { id: parsed.data.id }, select: { slug: true } });
  if (!app) redirect(`${ROUTE}?error=not-found`);
  if (parsed.data.confirm !== app.slug) {
    redirect(`${detailRoute(app.slug)}?error=confirmation-mismatch`);
  }
  const result = await db.marketplaceInstallation.updateMany({
    where: { appId: parsed.data.id, uninstalledAt: null },
    data: { uninstalledAt: new Date() },
  });
  await db.marketplaceApp.update({ where: { id: parsed.data.id }, data: { installCount: 0 } });
  await db.marketplaceAppAudit.create({
    data: { appId: parsed.data.id, action: "force_uninstall_all", detail: `Uninstalled ${result.count} tenants`, authorId: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.marketplace.force_uninstall_all",
    entityType: "MarketplaceApp",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, count: result.count },
  });
  revalidatePath(detailRoute(app.slug));
  redirect(`${detailRoute(app.slug)}?ok=force-uninstalled-${result.count}`);
}

/* ── Helpers re-exported for type inference ─────────── */
export type ReviewStatusValue = MarketplaceReviewStatus;
