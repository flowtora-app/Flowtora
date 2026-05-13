"use server";

// Page 68 — Notification Templates server actions.
//
// Three actor surfaces:
//   1. Editor — metadata, variants, locale rows. Permission: notifications.manage
//   2. Approval — submit, approve, reject, comment. Permission: notifications.review
//   3. Test send / promote — TBD, currently reuses notifications-admin actions

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  NotificationApprovalState,
  NotificationTrigger,
} from "@prisma/client";

const ROUTE = "/platform/notifications";
const PERM_MANAGE = "notifications.manage" as const;
const PERM_REVIEW = "notifications.review" as const;

const TRIGGERS = [
  "TENANT_LIFECYCLE", "SUBSCRIPTION", "INVOICE", "PAYMENT",
  "USER", "JOB", "MARKETING", "SYSTEM", "SECURITY", "SUPPORT",
] as const;

/* ── Metadata edits (trigger, tags, owner, envelope) ──── */

const metadataSchema = z.object({
  templateId: z.string().min(1),
  trigger:    z.enum(TRIGGERS).or(z.literal("")).optional(),
  tags:       z.string().max(500).optional(),
  ownerEmail: z.string().email().or(z.literal("")).optional(),
  fromName:   z.string().max(120).optional(),
  fromEmail:  z.string().email().or(z.literal("")).optional(),
  replyTo:    z.string().email().or(z.literal("")).optional(),
});

export async function saveTemplateMetadata(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = metadataSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const tags = (d.tags ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const row = await db.notificationTemplate.update({
    where: { id: d.templateId },
    data: {
      trigger: d.trigger && d.trigger.length > 0 ? (d.trigger as NotificationTrigger) : null,
      tags,
      ownerEmail: d.ownerEmail || null,
      fromName:   d.fromName  || null,
      fromEmail:  d.fromEmail || null,
      replyTo:    d.replyTo   || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notifications.metadata_saved",
    entityType: "NotificationTemplate",
    entityId: row.id,
    metadata: { actor: ctx.email, kind: row.kind, channel: row.channel, locale: row.locale },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(row.kind)}?ok=metadata-saved`);
}

/* ── Approval workflow ────────────────────────────────── */

const stateTransitionSchema = z.object({
  templateId: z.string().min(1),
  note:       z.string().max(2000).optional(),
});

async function transitionState(
  ctx: { userId: string; email: string | null },
  templateId: string,
  toState: NotificationApprovalState,
  permission: "notifications.manage" | "notifications.review",
  note: string | undefined,
) {
  const tpl = await db.notificationTemplate.findUnique({ where: { id: templateId } });
  if (!tpl) throw new Error("Template not found");
  const fromState = tpl.approvalState;
  // Append-only audit row.
  await db.notificationTemplateReview.create({
    data: {
      templateId,
      fromState, toState,
      actorEmail: ctx.email ?? "system",
      note: note?.trim() || null,
    },
  });
  await db.notificationTemplate.update({
    where: { id: templateId },
    data: {
      approvalState: toState,
      submittedForReviewAt: toState === "IN_REVIEW" ? new Date() : tpl.submittedForReviewAt,
      submittedById:        toState === "IN_REVIEW" ? ctx.userId : tpl.submittedById,
      reviewedAt:           toState === "APPROVED" || toState === "DRAFT" ? new Date() : tpl.reviewedAt,
      reviewedById:         toState === "APPROVED" || toState === "DRAFT" ? ctx.userId : tpl.reviewedById,
      reviewerEmail:        toState === "APPROVED" || toState === "DRAFT" ? ctx.email : tpl.reviewerEmail,
      reviewerNote:         toState === "APPROVED" || toState === "DRAFT" ? (note?.trim() || null) : tpl.reviewerNote,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.notifications.${toState.toLowerCase()}`,
    entityType: "NotificationTemplate",
    entityId: templateId,
    metadata: { actor: ctx.email, permission, fromState, toState, kind: tpl.kind },
  });
  return tpl;
}

export async function submitForReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = stateTransitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const tpl = await transitionState(ctx, parsed.data.templateId, "IN_REVIEW", PERM_MANAGE, parsed.data.note);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl.kind)}?ok=submitted-for-review`);
}

export async function approveTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_REVIEW);
  const parsed = stateTransitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const tpl = await transitionState(ctx, parsed.data.templateId, "APPROVED", PERM_REVIEW, parsed.data.note);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl.kind)}?ok=approved`);
}

export async function rejectTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_REVIEW);
  const parsed = stateTransitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  if (!parsed.data.note || parsed.data.note.trim().length === 0) {
    redirect(`${ROUTE}?error=${encodeURIComponent("A reason is required to reject")}`);
  }
  const tpl = await transitionState(ctx, parsed.data.templateId, "DRAFT", PERM_REVIEW, parsed.data.note);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl.kind)}?ok=rejected`);
}

export async function promoteToLive(formData: FormData) {
  // Promote requires APPROVED first — guard it here.
  const ctx = await requirePlatformPermission(PERM_REVIEW);
  const parsed = stateTransitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const tpl = await db.notificationTemplate.findUnique({ where: { id: parsed.data.templateId } });
  if (!tpl) redirect(`${ROUTE}?error=${encodeURIComponent("Template not found")}`);
  if (tpl!.approvalState !== "APPROVED") {
    redirect(`${ROUTE}/${encodeURIComponent(tpl!.kind)}?error=${encodeURIComponent("Must be Approved before going Live")}`);
  }
  await transitionState(ctx, parsed.data.templateId, "LIVE", PERM_REVIEW, parsed.data.note);
  // Also flip publish state — live serving requires PUBLISHED status.
  await db.notificationTemplate.update({
    where: { id: parsed.data.templateId },
    data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: ctx.userId },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl!.kind)}?ok=live`);
}

/* ── A/B variants ─────────────────────────────────────── */

const variantSchema = z.object({
  id:         z.string().optional(),
  templateId: z.string().min(1),
  label:      z.string().min(1).max(40),
  weight:     z.coerce.number().int().min(0).max(100),
  active:     z.union([z.literal("on"), z.literal("")]).optional(),
  subject:    z.string().min(1).max(300),
  preheader:  z.string().max(300).optional(),
  headline:   z.string().min(1).max(300),
  subheading: z.string().max(300).optional(),
  body:       z.string().min(1).max(8000),
  ctaLabel:   z.string().max(100).optional(),
  ctaUrlToken: z.string().max(200).optional(),
  footerNote: z.string().max(500).optional(),
});

export async function saveVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = variantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const tpl = await db.notificationTemplate.findUnique({ where: { id: d.templateId } });
  if (!tpl) redirect(`${ROUTE}?error=${encodeURIComponent("Template not found")}`);
  const data = {
    label: d.label,
    weight: d.weight,
    active: d.active === "on",
    subject: d.subject,
    preheader:  d.preheader  || null,
    headline:   d.headline,
    subheading: d.subheading || null,
    body:       d.body,
    ctaLabel:   d.ctaLabel    || null,
    ctaUrlToken: d.ctaUrlToken || null,
    footerNote: d.footerNote   || null,
  };
  const row = await db.notificationTemplateVariant.upsert({
    where: { templateId_label: { templateId: d.templateId, label: d.label } },
    create: { templateId: d.templateId, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notifications.variant_saved",
    entityType: "NotificationTemplateVariant",
    entityId: row.id,
    metadata: { actor: ctx.email, kind: tpl!.kind, label: d.label, weight: d.weight },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl!.kind)}?ok=variant-saved#variants`);
}

export async function deleteVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect(`${ROUTE}?error=Invalid`);
  const row = await db.notificationTemplateVariant.findUnique({ where: { id: id as string } });
  if (!row) redirect(`${ROUTE}?error=${encodeURIComponent("Variant not found")}`);
  await db.notificationTemplateVariant.delete({ where: { id: id as string } });
  const tpl = await db.notificationTemplate.findUnique({ where: { id: row!.templateId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notifications.variant_deleted",
    entityType: "NotificationTemplateVariant",
    entityId: id as string,
    metadata: { actor: ctx.email, kind: tpl?.kind, label: row!.label },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl?.kind ?? "")}?ok=variant-deleted#variants`);
}

/* ── Per-locale row provisioning ──────────────────────── */

const provisionLocaleSchema = z.object({
  templateId: z.string().min(1),
  locale:     z.string().min(2).max(20).regex(/^[a-z]{2}(-[A-Z]{2,3})?$/, "BCP 47 like en-US"),
});

export async function provisionLocale(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = provisionLocaleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const tpl = await db.notificationTemplate.findUnique({ where: { id: d.templateId } });
  if (!tpl) redirect(`${ROUTE}?error=${encodeURIComponent("Template not found")}`);
  // Idempotent: skip if it already exists.
  const existing = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind: tpl!.kind, channel: tpl!.channel, locale: d.locale } },
  });
  if (existing) {
    redirect(`${ROUTE}/${encodeURIComponent(tpl!.kind)}?ok=locale-exists&locale=${d.locale}`);
  }
  const row = await db.notificationTemplate.create({
    data: {
      kind: tpl!.kind,
      channel: tpl!.channel,
      locale: d.locale,
      status: "DRAFT",
      category: tpl!.category,
      sortOrder: tpl!.sortOrder,
      // Copy English content as the starting point — translator overwrites.
      subject: tpl!.subject,
      preheader: tpl!.preheader,
      headline: tpl!.headline,
      subheading: tpl!.subheading,
      body: tpl!.body,
      ctaLabel: tpl!.ctaLabel,
      ctaUrlToken: tpl!.ctaUrlToken,
      footerNote: tpl!.footerNote,
      enabled: tpl!.enabled,
      isCritical: tpl!.isCritical,
      tokenSchema: tpl!.tokenSchema as never,
      trigger: tpl!.trigger,
      ownerEmail: tpl!.ownerEmail,
      tags: tpl!.tags,
      approvalState: "DRAFT",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notifications.locale_provisioned",
    entityType: "NotificationTemplate",
    entityId: row.id,
    metadata: { actor: ctx.email, kind: tpl!.kind, channel: tpl!.channel, locale: d.locale },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(tpl!.kind)}?ok=locale-added&locale=${d.locale}`);
}
