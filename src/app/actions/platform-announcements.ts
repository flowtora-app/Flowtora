"use server";

// Page 35 — Announcements & Changelog server actions.
//
// Builds on the legacy /platform/announcements actions but knows
// about the new fields (channels, CTA, hero image, frequency cap,
// changelog category, customers-only flag). State transitions are
// shared with the legacy file via direct DB writes here so we can
// pull metadata for audit logs in one place.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type { AnnouncementChannel } from "@prisma/client";

const LIST_ROUTE = "/platform/operations/announcements";
const PERM_WRITE = "announcement.write" as const;

function detailRoute(id: string) { return `${LIST_ROUTE}/${id}`; }

function splitList(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const CHANNEL_VALUES: AnnouncementChannel[] = ["BANNER", "MODAL", "INBOX", "EMAIL", "CHANGELOG", "PUSH"];

/* ── Create a fresh draft ─────────────────────────────── */

export async function createOpsAnnouncement() {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const a = await db.platformAnnouncement.create({
    data: {
      title: "",
      authorId: ctx.userId,
      // Default to BANNER so something fans out if the author
      // forgets to pick channels.
      channels: ["BANNER"],
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.announcement.created",
    entityType: "PlatformAnnouncement",
    entityId: a.id,
    metadata: { actor: ctx.email, source: "operations" },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${detailRoute(a.id)}?ok=created`);
}

/* ── Save (update) ────────────────────────────────────── */

const saveSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200).default(""),
  body: z.string().max(20_000).default(""),
  type: z.enum(["RELEASE", "NEW_FEATURE", "MAINTENANCE", "INCIDENT", "PRICING", "GENERAL"]),
  priority: z.enum(["INFO", "IMPORTANT", "CRITICAL"]),
  audience: z.enum(["ALL", "PLAN", "COHORT", "TENANT"]),
  audiencePlans: z.string().optional().or(z.literal("")),
  audienceCohorts: z.string().optional().or(z.literal("")),
  audienceTenantIds: z.string().optional().or(z.literal("")),
  audienceCustomersOnly: z.union([z.literal("on"), z.literal("")]).optional(),
  publishAt: z.string().optional().or(z.literal("")),
  expireAt: z.string().optional().or(z.literal("")),
  ctaLabel: z.string().max(60).optional().or(z.literal("")),
  ctaUrl: z.string().max(500).optional().or(z.literal("")),
  heroImageUrl: z.string().max(500).optional().or(z.literal("")),
  frequencyCap: z.enum(["UNLIMITED", "ONCE", "DAILY"]).default("UNLIMITED"),
  changelogCategory: z.enum(["FEATURE", "IMPROVEMENT", "FIX", "SECURITY", "DEPRECATION"]).optional().or(z.literal("")),
  tags: z.string().optional().or(z.literal("")),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
  recurrenceEnd: z.string().optional().or(z.literal("")),
});

export async function saveOpsAnnouncement(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  // Channels arrive as repeated `channels` values from the checkbox
  // group. Pull them off the raw FormData before zod parsing.
  const channelEntries = formData.getAll("channels");
  const channels = channelEntries
    .map((v) => String(v).toUpperCase() as AnnouncementChannel)
    .filter((v) => (CHANNEL_VALUES as string[]).includes(v));

  const parsed = saveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(msg)}`);
  }
  const d = parsed.data;

  await db.platformAnnouncement.update({
    where: { id: d.id },
    data: {
      title: d.title,
      body: d.body,
      type: d.type,
      priority: d.priority,
      audience: d.audience,
      audiencePlans:     splitList(d.audiencePlans).map((s) => s.toUpperCase()),
      audienceCohorts:   splitList(d.audienceCohorts).map((s) => s.toUpperCase()),
      audienceTenantIds: splitList(d.audienceTenantIds),
      audienceCustomersOnly: d.audienceCustomersOnly === "on",
      publishAt: d.publishAt ? new Date(d.publishAt) : null,
      expireAt:  d.expireAt  ? new Date(d.expireAt)  : null,
      ctaLabel: d.ctaLabel || null,
      ctaUrl: d.ctaUrl || null,
      heroImageUrl: d.heroImageUrl || null,
      frequencyCap: d.frequencyCap,
      changelogCategory: d.changelogCategory || null,
      channels,
      tags: splitList(d.tags),
      recurrence: d.recurrence,
      recurrenceEnd: d.recurrenceEnd ? new Date(d.recurrenceEnd) : null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.announcement.updated",
    entityType: "PlatformAnnouncement",
    entityId: d.id,
    metadata: {
      actor: ctx.email,
      channels,
      audience: d.audience,
      type: d.type,
      priority: d.priority,
    },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(d.id));
  redirect(`${detailRoute(d.id)}?ok=saved`);
}

/* ── Per-channel content variants ─────────────────────── */

const channelVariantSchema = z.object({
  announcementId: z.string().min(1),
  channel: z.enum(["BANNER", "MODAL", "INBOX", "EMAIL", "CHANGELOG", "PUSH"]),
  title: z.string().max(200).optional().or(z.literal("")),
  body: z.string().max(20_000).optional().or(z.literal("")),
  ctaLabel: z.string().max(60).optional().or(z.literal("")),
  ctaUrl: z.string().max(500).optional().or(z.literal("")),
  heroImageUrl: z.string().max(500).optional().or(z.literal("")),
});

export async function upsertChannelVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = channelVariantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const allEmpty = !d.title && !d.body && !d.ctaLabel && !d.ctaUrl && !d.heroImageUrl;
  if (allEmpty) {
    // Empty payload = delete the override.
    await db.announcementChannelVariant.deleteMany({
      where: { announcementId: d.announcementId, channel: d.channel },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.announcement.channel_variant_cleared",
      entityType: "AnnouncementChannelVariant",
      entityId: `${d.announcementId}_${d.channel}`,
      metadata: { actor: ctx.email },
    });
  } else {
    await db.announcementChannelVariant.upsert({
      where: { announcementId_channel: { announcementId: d.announcementId, channel: d.channel } },
      create: {
        announcementId: d.announcementId,
        channel: d.channel,
        title: d.title || null,
        body: d.body || null,
        ctaLabel: d.ctaLabel || null,
        ctaUrl: d.ctaUrl || null,
        heroImageUrl: d.heroImageUrl || null,
        updatedBy: ctx.userId,
      },
      update: {
        title: d.title || null,
        body: d.body || null,
        ctaLabel: d.ctaLabel || null,
        ctaUrl: d.ctaUrl || null,
        heroImageUrl: d.heroImageUrl || null,
        updatedBy: ctx.userId,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.announcement.channel_variant_saved",
      entityType: "AnnouncementChannelVariant",
      entityId: `${d.announcementId}_${d.channel}`,
      metadata: { actor: ctx.email },
    });
  }
  revalidatePath(detailRoute(d.announcementId));
  redirect(`${detailRoute(d.announcementId)}?ok=saved`);
}

/* ── A/B variants ────────────────────────────────────── */

const abVariantSchema = z.object({
  variantId: z.string().optional().or(z.literal("")),
  announcementId: z.string().min(1),
  label: z.string().min(1).max(40),
  title: z.string().max(200).optional().or(z.literal("")),
  body: z.string().max(20_000).optional().or(z.literal("")),
  ctaLabel: z.string().max(60).optional().or(z.literal("")),
  ctaUrl: z.string().max(500).optional().or(z.literal("")),
  weightPct: z.coerce.number().int().min(0).max(100),
});

export async function upsertAbVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = abVariantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  if (d.variantId) {
    await db.announcementAbVariant.update({
      where: { id: d.variantId },
      data: {
        label: d.label,
        title: d.title || null,
        body: d.body || null,
        ctaLabel: d.ctaLabel || null,
        ctaUrl: d.ctaUrl || null,
        weightPct: d.weightPct,
      },
    });
  } else {
    await db.announcementAbVariant.create({
      data: {
        announcementId: d.announcementId,
        label: d.label,
        title: d.title || null,
        body: d.body || null,
        ctaLabel: d.ctaLabel || null,
        ctaUrl: d.ctaUrl || null,
        weightPct: d.weightPct,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.announcement.ab_variant_saved",
    entityType: "AnnouncementAbVariant",
    entityId: d.variantId || d.label,
    metadata: { actor: ctx.email, label: d.label, weight: d.weightPct },
  });
  revalidatePath(detailRoute(d.announcementId));
  redirect(`${detailRoute(d.announcementId)}?ok=saved`);
}

const deleteAbSchema = z.object({
  variantId: z.string().min(1),
  announcementId: z.string().min(1),
});

export async function deleteAbVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = deleteAbSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.announcementAbVariant.delete({ where: { id: parsed.data.variantId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.announcement.ab_variant_deleted",
    entityType: "AnnouncementAbVariant",
    entityId: parsed.data.variantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.announcementId));
  redirect(`${detailRoute(parsed.data.announcementId)}?ok=saved`);
}

/* ── Status transitions ───────────────────────────────── */

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]),
});

export async function transitionOpsAnnouncement(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    const msg = parsed.error.issues[0]?.message ?? "Invalid transition";
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(msg)}`);
  }
  const { id, to } = parsed.data;
  const row = await db.platformAnnouncement.findUnique({
    where: { id },
    select: { id: true, title: true, publishAt: true },
  });
  if (!row) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Announcement not found")}`);
  }
  if ((to === "PUBLISHED" || to === "SCHEDULED") && !row.title.trim()) {
    redirect(`${detailRoute(id)}?error=${encodeURIComponent("Add a title before publishing.")}`);
  }
  if (to === "SCHEDULED" && !row.publishAt) {
    redirect(`${detailRoute(id)}?error=${encodeURIComponent("Set a publish date before scheduling.")}`);
  }

  const now = new Date();
  await db.platformAnnouncement.update({
    where: { id },
    data: {
      status: to,
      publishedAt: to === "PUBLISHED" ? now : undefined,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.announcement.${to.toLowerCase()}`,
    entityType: "PlatformAnnouncement",
    entityId: id,
    metadata: { actor: ctx.email, title: row.title },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=transitioned`);
}
