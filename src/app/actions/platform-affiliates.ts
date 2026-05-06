"use server";

// Page 42 — Affiliate Program actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  AffiliateCommissionKind,
  AffiliateCreativeKind,
  AffiliateStatus,
} from "@prisma/client";

const ROUTE = "/platform/marketing/affiliates";
const PERM = "affiliates.manage" as const;
const detailRoute = (id: string) => `${ROUTE}/${id}`;

const STATUS_VALUES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
const COMMISSION_KINDS = ["PERCENTAGE", "FLAT"] as const;
const CREATIVE_KINDS = [
  "BANNER", "TEXT_LINK", "EMAIL_TEMPLATE",
  "SOCIAL_POST", "AD_CREATIVE", "VIDEO_SCRIPT",
] as const;
const APPLICATION_MODES = ["AUTO_APPROVE", "MANUAL_REVIEW"] as const;

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  active:                z.coerce.boolean().optional().default(false),
  acceptingApplications: z.coerce.boolean().optional().default(false),
  notifyOnConversion:    z.coerce.boolean().optional().default(false),
  cookieDays:            z.coerce.number().int().min(1).max(365).default(90),
  defaultTierId:         z.string().optional().or(z.literal("")),
  applicationMode:       z.enum(APPLICATION_MODES).default("MANUAL_REVIEW"),
  minPayoutCents:        z.coerce.number().int().min(0).max(10_000_000).default(5_000),
  trackingDomain:        z.string().max(120).optional().or(z.literal("")),
  termsUrl:              z.string().max(500).optional().or(z.literal("")),
});

export async function saveAffiliateSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.active = raw.active === "on" || raw.active === "true" ? "true" : "false";
  raw.acceptingApplications =
    raw.acceptingApplications === "on" || raw.acceptingApplications === "true" ? "true" : "false";
  raw.notifyOnConversion =
    raw.notifyOnConversion === "on" || raw.notifyOnConversion === "true" ? "true" : "false";

  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    active: d.active,
    acceptingApplications: d.acceptingApplications,
    notifyOnConversion: d.notifyOnConversion,
    cookieDays: d.cookieDays,
    defaultTierId: d.defaultTierId || null,
    applicationMode: d.applicationMode,
    minPayoutCents: d.minPayoutCents,
    trackingDomain: d.trackingDomain || null,
    termsUrl: d.termsUrl || null,
    updatedById: ctx.userId,
  };
  await db.affiliateProgramSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.settings_saved",
    entityType: "AffiliateProgramSettings",
    entityId: "default",
    metadata: { actor: ctx.email, active: d.active, applicationMode: d.applicationMode },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Application review ──────────────────────────────── */

const reviewSchema = z.object({
  id:    z.string().min(1),
  note:  z.string().max(500).optional().or(z.literal("")),
  tierId: z.string().optional().or(z.literal("")),
});

export async function approveAffiliateApplication(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=applications&error=invalid`);
  const { id, note, tierId } = parsed.data;

  const app = await db.affiliateApplication.findUnique({ where: { id } });
  if (!app) redirect(`${ROUTE}?tab=applications&error=not-found`);
  if (app.status !== "PENDING") redirect(`${ROUTE}?tab=applications&error=already-reviewed`);

  // Resolve which tier the new affiliate lands in.
  const settings = await db.affiliateProgramSettings.findUnique({ where: { id: "default" } });
  const targetTierId = tierId || settings?.defaultTierId || null;
  const tier = targetTierId
    ? await db.affiliateTier.findUnique({ where: { id: targetTierId } })
    : await db.affiliateTier.findFirst({ where: { isDefault: true } });

  // Mint a unique referral code for this affiliate.
  const code = await pickUniqueCode(app.name);
  const cookieDays = settings?.cookieDays ?? 90;
  const commissionPct = tier?.commissionPct == null ? 20 : Number(tier.commissionPct);

  const affiliate = await db.affiliate.create({
    data: {
      code,
      name: app.name,
      email: app.email,
      websiteUrl: app.websiteUrl,
      promoChannels: app.promoChannels,
      estimatedAudience: app.estimatedAudience,
      status: "ACTIVE",
      tierId: tier?.id ?? null,
      commissionPct,
      commissionDurationMonths: tier?.capDurationMonths ?? 12,
      cookieDays,
      notes: app.why ? `Application pitch: ${app.why}` : null,
    },
    select: { id: true, code: true },
  });

  await db.affiliateApplication.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewerId: ctx.userId,
      reviewerNote: note || null,
      reviewedAt: new Date(),
      affiliateId: affiliate.id,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.application_approved",
    entityType: "AffiliateApplication",
    entityId: id,
    metadata: {
      actor: ctx.email,
      affiliateId: affiliate.id,
      tierId: tier?.id ?? null,
      code: affiliate.code,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${detailRoute(affiliate.id)}?ok=approved`);
}

export async function rejectAffiliateApplication(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=applications&error=invalid`);
  const { id, note } = parsed.data;
  const app = await db.affiliateApplication.findUnique({ where: { id } });
  if (!app) redirect(`${ROUTE}?tab=applications&error=not-found`);

  await db.affiliateApplication.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewerId: ctx.userId,
      reviewerNote: note || null,
      reviewedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.application_rejected",
    entityType: "AffiliateApplication",
    entityId: id,
    metadata: { actor: ctx.email, applicantEmail: app.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=applications&ok=rejected`);
}

/* ── Affiliate edit (status, tier, notes) ───────────── */

const affiliateUpdateSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(STATUS_VALUES).optional(),
  tierId: z.string().optional().or(z.literal("")),
  notes:  z.string().max(2000).optional().or(z.literal("")),
});

export async function updateAffiliate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = affiliateUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const { id, status, tierId, notes } = parsed.data;

  const data: Record<string, unknown> = {};
  if (status) data.status = status as AffiliateStatus;
  if (tierId !== undefined) data.tierId = tierId || null;
  if (notes !== undefined)  data.notes = notes || null;

  // Recompute commissionPct from new tier if tier changed.
  if (tierId) {
    const tier = await db.affiliateTier.findUnique({ where: { id: tierId } });
    if (tier?.commissionPct != null) {
      data.commissionPct = Number(tier.commissionPct);
    }
    if (tier?.capDurationMonths != null) {
      data.commissionDurationMonths = tier.capDurationMonths;
    }
  }

  await db.affiliate.update({ where: { id }, data });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.updated",
    entityType: "Affiliate",
    entityId: id,
    metadata: { actor: ctx.email, status: status ?? null, tierId: tierId ?? null },
  });
  revalidatePath(detailRoute(id));
  revalidatePath(ROUTE);
  redirect(`${detailRoute(id)}?ok=updated`);
}

/* ── Send message ──────────────────────────────────── */

const messageSchema = z.object({
  affiliateId: z.string().min(1),
  subject:     z.string().max(200).optional().or(z.literal("")),
  body:        z.string().min(1, "Message body required").max(5000),
});

export async function sendAffiliateMessage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = messageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("affiliateId");
    redirect(`${detailRoute(String(id ?? ""))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const { affiliateId, subject, body } = parsed.data;
  await db.affiliateMessage.create({
    data: {
      affiliateId,
      direction: "OUT",
      subject: subject || null,
      body,
      authorId: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.message_sent",
    entityType: "Affiliate",
    entityId: affiliateId,
    metadata: { actor: ctx.email, subject: subject || null, length: body.length },
  });
  revalidatePath(detailRoute(affiliateId));
  redirect(`${detailRoute(affiliateId)}?ok=message-sent`);
}

/* ── Tier CRUD ──────────────────────────────────────── */

const tierSchema = z.object({
  id:                    z.string().optional().or(z.literal("")),
  name:                  z.string().min(1).max(80),
  position:              z.coerce.number().int().min(0).max(99).default(0),
  commissionKind:        z.enum(COMMISSION_KINDS).default("PERCENTAGE"),
  commissionPct:         z.coerce.number().min(0).max(100).optional(),
  commissionFlatCents:   z.coerce.number().int().min(0).max(10_000_000).optional(),
  recurring:             z.coerce.boolean().optional().default(false),
  capDurationMonths:     z.coerce.number().int().min(0).max(120).optional(),
  minConversionsPerQuarter: z.coerce.number().int().min(0).max(10_000).default(0),
  minLifetimeConversions:   z.coerce.number().int().min(0).max(100_000).optional(),
  isDefault:             z.coerce.boolean().optional().default(false),
  notes:                 z.string().max(500).optional().or(z.literal("")),
});

export async function saveAffiliateTier(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["recurring", "isDefault"]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  // Strip empty optional numeric strings so zod default kicks in.
  for (const k of ["commissionPct", "commissionFlatCents", "capDurationMonths", "minLifetimeConversions"]) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = tierSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    position: d.position,
    commissionKind: d.commissionKind as AffiliateCommissionKind,
    commissionPct: d.commissionKind === "PERCENTAGE" ? (d.commissionPct ?? 0) : null,
    commissionFlatCents: d.commissionKind === "FLAT" ? (d.commissionFlatCents ?? 0) : null,
    recurring: d.recurring,
    capDurationMonths: d.capDurationMonths == null || d.capDurationMonths === 0 ? null : d.capDurationMonths,
    minConversionsPerQuarter: d.minConversionsPerQuarter,
    minLifetimeConversions: d.minLifetimeConversions == null ? null : d.minLifetimeConversions,
    isDefault: d.isDefault,
    notes: d.notes || null,
  };

  // If this tier is being marked default, clear other defaults first.
  if (d.isDefault) {
    await db.affiliateTier.updateMany({
      where: { isDefault: true, ...(d.id ? { id: { not: d.id } } : {}) },
      data: { isDefault: false },
    });
  }

  if (d.id) {
    await db.affiliateTier.update({ where: { id: d.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.affiliates.tier_updated",
      entityType: "AffiliateTier",
      entityId: d.id,
      metadata: { actor: ctx.email, name: d.name },
    });
  } else {
    const created = await db.affiliateTier.create({ data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.affiliates.tier_created",
      entityType: "AffiliateTier",
      entityId: created.id,
      metadata: { actor: ctx.email, name: d.name },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=tier-saved`);
}

const tierDeleteSchema = z.object({ id: z.string().min(1) });

export async function deleteAffiliateTier(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = tierDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=settings&error=invalid`);
  const { id } = parsed.data;
  // Setting tierId to null on dependents — allow delete to proceed.
  await db.affiliate.updateMany({ where: { tierId: id }, data: { tierId: null } });
  await db.affiliateTier.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.tier_deleted",
    entityType: "AffiliateTier",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=tier-deleted`);
}

/* ── Creative CRUD ──────────────────────────────────── */

const creativeSchema = z.object({
  id:              z.string().optional().or(z.literal("")),
  kind:            z.enum(CREATIVE_KINDS).default("TEXT_LINK"),
  name:            z.string().min(1).max(200),
  description:     z.string().max(500).optional().or(z.literal("")),
  contentUrl:      z.string().max(1000).optional().or(z.literal("")),
  contentText:     z.string().max(10_000).optional().or(z.literal("")),
  destinationPath: z.string().max(500).default("/"),
  width:           z.coerce.number().int().min(0).max(4000).optional(),
  height:          z.coerce.number().int().min(0).max(4000).optional(),
  active:          z.coerce.boolean().optional().default(false),
});

export async function saveAffiliateCreative(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.active = raw.active === "on" || raw.active === "true" ? "true" : "false";
  for (const k of ["width", "height"]) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = creativeSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=creative&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    kind: d.kind as AffiliateCreativeKind,
    name: d.name,
    description: d.description || null,
    contentUrl: d.contentUrl || null,
    contentText: d.contentText || null,
    destinationPath: d.destinationPath || "/",
    width: d.width == null || d.width === 0 ? null : d.width,
    height: d.height == null || d.height === 0 ? null : d.height,
    active: d.active,
  };
  if (d.id) {
    await db.affiliateCreative.update({ where: { id: d.id }, data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.affiliates.creative_updated",
      entityType: "AffiliateCreative",
      entityId: d.id,
      metadata: { actor: ctx.email, name: d.name, kind: d.kind },
    });
  } else {
    const created = await db.affiliateCreative.create({ data });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.affiliates.creative_created",
      entityType: "AffiliateCreative",
      entityId: created.id,
      metadata: { actor: ctx.email, name: d.name, kind: d.kind },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=creative&ok=creative-saved`);
}

const creativeDeleteSchema = z.object({ id: z.string().min(1) });

export async function deleteAffiliateCreative(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = creativeDeleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=creative&error=invalid`);
  const { id } = parsed.data;
  // Detach click rows that referenced this creative.
  await db.affiliateClick.updateMany({ where: { creativeId: id }, data: { creativeId: null } });
  await db.affiliateCreative.delete({ where: { id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.affiliates.creative_deleted",
    entityType: "AffiliateCreative",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=creative&ok=creative-deleted`);
}

/* ── Helpers ──────────────────────────────────────────── */

async function pickUniqueCode(nameSeed: string): Promise<string> {
  const safe = nameSeed.replace(/[^a-z0-9]+/gi, "").toUpperCase().slice(0, 6) || "AFF";
  for (let attempt = 0; attempt < 6; attempt++) {
    const tail = randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
    const candidate = `${safe}-${tail}`;
    const collision = await db.affiliate.findUnique({ where: { code: candidate } });
    if (!collision) return candidate;
  }
  return `AFF-${randomBytes(4).toString("hex").toUpperCase()}`;
}
