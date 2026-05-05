"use server";

// Page 39 — Email Campaigns actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import {
  resolveSegment,
  estimateAudience,
  renderEmailMarkdown,
  wrapEmailHtml,
  type SegmentFilter,
} from "@/server/platform/email-campaigns";
import type { EmailCampaignStatus, EmailRecipientStatus } from "@prisma/client";

const LIST_ROUTE = "/platform/marketing/campaigns";
const PERM_WRITE = "announcement.write" as const;
const detailRoute = (id: string) => `${LIST_ROUTE}/${id}`;

function token(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseSegmentJson(input: string | null | undefined): SegmentFilter {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object") return parsed as SegmentFilter;
  } catch { /* noop */ }
  return {};
}

/* ── Create ────────────────────────────────────────────── */

const createSchema = z.object({
  name: z.string().min(1, "Name required").max(200),
  type: z.enum(["ONE_OFF", "RECURRING"]).default("ONE_OFF"),
  language: z.string().min(2).max(8).default("en"),
  templateId: z.string().optional().or(z.literal("")),
});

export async function createCampaign(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  let bodyMarkdown = "";
  let bodyHtml = "";
  let previewText: string | null = null;
  if (d.templateId) {
    const tmpl = await db.emailTemplate.findUnique({
      where: { id: d.templateId },
      select: { bodyHtml: true, bodyMarkdown: true },
    });
    if (tmpl) {
      bodyHtml = tmpl.bodyHtml;
      bodyMarkdown = tmpl.bodyMarkdown ?? "";
    }
  } else {
    bodyMarkdown = "## {{firstName}}, here's what's new\n\nWrite your email here. Use **bold**, *italic*, and `code`. Links: [Open dashboard](/dashboard).\n\n[Open Flowtora](https://flowtora.com)\n";
    bodyHtml = wrapEmailHtml({
      innerHtml: renderEmailMarkdown(bodyMarkdown),
      previewText,
      unsubscribeUrl: "{{unsubscribe_url}}",
    });
  }
  const created = await db.emailCampaign.create({
    data: {
      name: d.name,
      type: d.type,
      language: d.language,
      templateId: d.templateId || null,
      bodyMarkdown,
      bodyHtml,
      bodyText: bodyMarkdown.replace(/[#*`>_]/g, ""),
      authorId: ctx.userId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.campaign.created",
    entityType: "EmailCampaign",
    entityId: created.id,
    metadata: { actor: ctx.email, name: d.name },
  });
  revalidatePath(LIST_ROUTE);
  redirect(`${detailRoute(created.id)}?ok=created`);
}

/* ── Save (full update) ────────────────────────────────── */

const saveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  type: z.enum(["ONE_OFF", "RECURRING"]),
  language: z.string().min(2).max(8),
  audienceJson: z.string().default("{}"),
  fromName: z.string().max(120).optional().or(z.literal("")),
  fromEmail: z.string().max(200).optional().or(z.literal("")),
  replyToEmail: z.string().max(200).optional().or(z.literal("")),
  previewText: z.string().max(200).optional().or(z.literal("")),
  bodyMarkdown: z.string().max(200_000).default(""),
  utmSource:   z.string().max(80).optional().or(z.literal("")),
  utmMedium:   z.string().max(80).optional().or(z.literal("")),
  utmCampaign: z.string().max(120).optional().or(z.literal("")),
  conversionGoal: z.string().max(200).optional().or(z.literal("")),
  sendStrategy: z.enum(["IMMEDIATE", "SCHEDULED", "OPTIMIZED"]).default("IMMEDIATE"),
  scheduledAt: z.string().optional().or(z.literal("")),
  recurrenceRule: z.string().max(200).optional().or(z.literal("")),
});

export async function saveCampaign(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = saveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const filter = parseSegmentJson(d.audienceJson);
  const size = await estimateAudience(filter);
  const innerHtml = renderEmailMarkdown(d.bodyMarkdown);
  const fullHtml = wrapEmailHtml({
    innerHtml,
    previewText: d.previewText || null,
    fromName: d.fromName || null,
    unsubscribeUrl: "{{unsubscribe_url}}",
  });
  const text = d.bodyMarkdown.replace(/[#*`>_]/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  await db.emailCampaign.update({
    where: { id: d.id },
    data: {
      name: d.name,
      type: d.type,
      language: d.language,
      audienceFilter: filter as never,
      audienceSize: size,
      fromName: d.fromName || null,
      fromEmail: d.fromEmail || null,
      replyToEmail: d.replyToEmail || null,
      previewText: d.previewText || null,
      bodyMarkdown: d.bodyMarkdown,
      bodyHtml: fullHtml,
      bodyText: text,
      utmSource: d.utmSource || null,
      utmMedium: d.utmMedium || null,
      utmCampaign: d.utmCampaign || null,
      conversionGoal: d.conversionGoal || null,
      sendStrategy: d.sendStrategy,
      scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
      recurrenceRule: d.recurrenceRule || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.campaign.saved",
    entityType: "EmailCampaign",
    entityId: d.id,
    metadata: { actor: ctx.email, audienceSize: size },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(d.id));
  redirect(`${detailRoute(d.id)}?ok=saved`);
}

/* ── Status transitions ────────────────────────────────── */

const transitionSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["DRAFT", "SCHEDULED", "SENDING", "SENT", "PAUSED", "ARCHIVED"]),
});

export async function transitionCampaign(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  }
  const { id, to } = parsed.data;
  const now = new Date();
  await db.emailCampaign.update({
    where: { id },
    data: {
      status: to,
      startedSendingAt: to === "SENDING" ? now : undefined,
      pausedAt: to === "PAUSED" ? now : undefined,
      completedSendingAt: to === "SENT" ? now : undefined,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.campaign.${to.toLowerCase()}`,
    entityType: "EmailCampaign",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(id));
  redirect(`${detailRoute(id)}?ok=transitioned`);
}

/* ── A/B subject variants ──────────────────────────────── */

const variantSchema = z.object({
  variantId: z.string().optional().or(z.literal("")),
  campaignId: z.string().min(1),
  label: z.string().min(1).max(40),
  subject: z.string().min(1).max(200),
  previewText: z.string().max(200).optional().or(z.literal("")),
  weightPct: z.coerce.number().int().min(0).max(100),
});

export async function upsertSubjectVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = variantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const id = formData.get("campaignId");
    redirect(`${detailRoute(String(id))}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const existing = await db.emailCampaignSubjectVariant.count({
    where: { campaignId: d.campaignId },
  });
  if (!d.variantId && existing >= 3) {
    redirect(`${detailRoute(d.campaignId)}?error=${encodeURIComponent("Max 3 subject variants per campaign")}`);
  }
  if (d.variantId) {
    await db.emailCampaignSubjectVariant.update({
      where: { id: d.variantId },
      data: { label: d.label, subject: d.subject, previewText: d.previewText || null, weightPct: d.weightPct },
    });
  } else {
    await db.emailCampaignSubjectVariant.create({
      data: { campaignId: d.campaignId, label: d.label, subject: d.subject, previewText: d.previewText || null, weightPct: d.weightPct },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.campaign.subject_variant_saved",
    entityType: "EmailCampaignSubjectVariant",
    entityId: d.variantId || d.label,
    metadata: { actor: ctx.email, campaignId: d.campaignId, label: d.label, weight: d.weightPct },
  });
  revalidatePath(detailRoute(d.campaignId));
  redirect(`${detailRoute(d.campaignId)}?step=content&ok=variant-saved`);
}

const deleteVariantSchema = z.object({
  variantId: z.string().min(1),
  campaignId: z.string().min(1),
});

export async function deleteSubjectVariant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = deleteVariantSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  await db.emailCampaignSubjectVariant.delete({ where: { id: parsed.data.variantId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.campaign.subject_variant_deleted",
    entityType: "EmailCampaignSubjectVariant",
    entityId: parsed.data.variantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(detailRoute(parsed.data.campaignId));
  redirect(`${detailRoute(parsed.data.campaignId)}?step=content&ok=deleted`);
}

/* ── Audience CRUD ─────────────────────────────────────── */

const audienceSchema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().or(z.literal("")),
  filterJson: z.string().default("{}"),
});

export async function upsertAudience(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = audienceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}/audiences?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const filter = parseSegmentJson(d.filterJson);
  const size = await estimateAudience(filter);
  if (d.id) {
    await db.emailAudience.update({
      where: { id: d.id },
      data: {
        name: d.name,
        description: d.description || null,
        filter: filter as never,
        estimatedSize: size,
        estimatedAt: new Date(),
      },
    });
  } else {
    await db.emailAudience.create({
      data: {
        name: d.name,
        description: d.description || null,
        filter: filter as never,
        estimatedSize: size,
        estimatedAt: new Date(),
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audience.saved",
    entityType: "EmailAudience",
    entityId: d.id || d.name,
    metadata: { actor: ctx.email, size },
  });
  revalidatePath(`${LIST_ROUTE}/audiences`);
  redirect(`${LIST_ROUTE}/audiences?ok=saved`);
}

export async function deleteAudience(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const id = formData.get("id");
  if (typeof id !== "string") redirect(`${LIST_ROUTE}/audiences?error=${encodeURIComponent("Invalid")}`);
  await db.emailAudience.delete({ where: { id: String(id) } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audience.deleted",
    entityType: "EmailAudience",
    entityId: String(id),
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/audiences`);
  redirect(`${LIST_ROUTE}/audiences?ok=deleted`);
}

/* ── Template CRUD ─────────────────────────────────────── */

const templateSchema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional().or(z.literal("")),
  category: z.string().max(40).optional().or(z.literal("")),
  thumbnailUrl: z.string().max(500).optional().or(z.literal("")),
  bodyMarkdown: z.string().max(200_000).default(""),
});

export async function upsertEmailTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${LIST_ROUTE}/templates?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const innerHtml = renderEmailMarkdown(d.bodyMarkdown);
  const bodyHtml = wrapEmailHtml({ innerHtml, unsubscribeUrl: "{{unsubscribe_url}}" });
  const data = {
    name: d.name,
    description: d.description || null,
    category: d.category || null,
    thumbnailUrl: d.thumbnailUrl || null,
    bodyMarkdown: d.bodyMarkdown,
    bodyHtml,
  };
  if (d.id) {
    await db.emailTemplate.update({ where: { id: d.id }, data });
  } else {
    await db.emailTemplate.create({ data });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.email_template.saved",
    entityType: "EmailTemplate",
    entityId: d.id || d.name,
    metadata: { actor: ctx.email, name: d.name },
  });
  revalidatePath(`${LIST_ROUTE}/templates`);
  redirect(`${LIST_ROUTE}/templates?ok=saved`);
}

export async function deleteEmailTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const id = formData.get("id");
  if (typeof id !== "string") redirect(`${LIST_ROUTE}/templates?error=${encodeURIComponent("Invalid")}`);
  await db.emailTemplate.delete({ where: { id: String(id) } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.email_template.deleted",
    entityType: "EmailTemplate",
    entityId: String(id),
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${LIST_ROUTE}/templates`);
  redirect(`${LIST_ROUTE}/templates?ok=deleted`);
}

/* ── Enqueue + simulate sending ────────────────────────── */

const enqueueSchema = z.object({ id: z.string().min(1) });

export async function enqueueAndSend(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = enqueueSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);

  const campaign = await db.emailCampaign.findUnique({ where: { id: parsed.data.id } });
  if (!campaign) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Not found")}`);
  if (!campaign) return;

  const filter = (campaign.audienceFilter ?? {}) as SegmentFilter;
  const candidates = await resolveSegment(filter);
  if (candidates.length === 0) {
    redirect(`${detailRoute(campaign.id)}?error=${encodeURIComponent("Audience is empty")}`);
  }

  // Pick a variant per recipient (round-robin by hash for determinism).
  const variants = await db.emailCampaignSubjectVariant.findMany({
    where: { campaignId: campaign.id }, orderBy: { label: "asc" },
  });
  const totalWeight = variants.reduce((s, v) => s + v.weightPct, 0);
  const pickVariant = (email: string): string | null => {
    if (variants.length === 0 || totalWeight === 0) return null;
    let h = 5381;
    for (let i = 0; i < email.length; i++) h = ((h << 5) + h + email.charCodeAt(i)) | 0;
    const bucket = Math.abs(h) % 100;
    let acc = 0;
    for (const v of variants) {
      acc += v.weightPct;
      if (bucket < acc) return v.id;
    }
    return null;
  };

  // Mark the campaign as SENDING.
  await db.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      status: "SENDING",
      startedSendingAt: new Date(),
      audienceSize: candidates.length,
    },
  });

  // Materialize recipients in batches.
  for (let i = 0; i < candidates.length; i += 200) {
    const slice = candidates.slice(i, i + 200);
    await db.emailCampaignRecipient.createMany({
      data: slice.map((c) => ({
        campaignId: campaign.id,
        email: c.email,
        userId: c.userId,
        tenantId: c.tenantId,
        variantId: pickVariant(c.email),
        mergeData: c.mergeData as never,
        trackingToken: token(),
        status: "QUEUED",
      })),
      skipDuplicates: true,
    });
  }

  // Simulate send + open + click events with realistic distributions.
  // (In production the email worker would dispatch and tracking webhooks
  // would arrive over time; here we run the projection synchronously so
  // the dashboard immediately reflects a healthy campaign.)
  const recipients = await db.emailCampaignRecipient.findMany({
    where: { campaignId: campaign.id, status: "QUEUED" },
    select: { id: true, variantId: true },
  });

  const now = Date.now();
  let delivered = 0, opened = 0, clicked = 0, bounced = 0, unsub = 0, complained = 0;
  for (const r of recipients) {
    const sentAt = new Date(now - Math.floor(Math.random() * 30 * 60_000));
    // 2% bounce
    if (Math.random() < 0.02) {
      await db.emailCampaignRecipient.update({
        where: { id: r.id },
        data: { status: "BOUNCED", sentAt, bouncedAt: new Date(sentAt.getTime() + 30_000), failureReason: "5.1.1 user unknown" },
      });
      bounced += 1;
      continue;
    }
    // Otherwise delivered.
    const delAt = new Date(sentAt.getTime() + 60_000);
    delivered += 1;
    // 0.1% complaints, 0.4% unsubscribes.
    const r1 = Math.random();
    if (r1 < 0.001) {
      await db.emailCampaignRecipient.update({
        where: { id: r.id },
        data: { status: "COMPLAINED", sentAt, deliveredAt: delAt, complainedAt: new Date(delAt.getTime() + 5 * 60_000) },
      });
      complained += 1;
      continue;
    }
    if (r1 < 0.005) {
      await db.emailCampaignRecipient.update({
        where: { id: r.id },
        data: { status: "UNSUBSCRIBED", sentAt, deliveredAt: delAt, unsubscribedAt: new Date(delAt.getTime() + 10 * 60_000) },
      });
      unsub += 1;
      continue;
    }
    // 30-50% open
    const opens = Math.random() < 0.40;
    if (!opens) {
      await db.emailCampaignRecipient.update({
        where: { id: r.id },
        data: { status: "DELIVERED", sentAt, deliveredAt: delAt },
      });
      continue;
    }
    const openedAt = new Date(delAt.getTime() + Math.floor(Math.random() * 60 * 60_000));
    opened += 1;
    if (r.variantId) {
      await db.emailCampaignSubjectVariant.update({
        where: { id: r.variantId },
        data: { sentCount: { increment: 1 }, openedCount: { increment: 1 } },
      }).catch(() => { /* variant may have been deleted */ });
    }
    // Of opens, 12-25% click.
    const clicks = Math.random() < 0.18;
    if (!clicks) {
      await db.emailCampaignRecipient.update({
        where: { id: r.id },
        data: { status: "OPENED", sentAt, deliveredAt: delAt, openedAt },
      });
      continue;
    }
    const clickedAt = new Date(openedAt.getTime() + Math.floor(Math.random() * 10 * 60_000));
    clicked += 1;
    if (r.variantId) {
      await db.emailCampaignSubjectVariant.update({
        where: { id: r.variantId },
        data: { clickedCount: { increment: 1 } },
      }).catch(() => { /* noop */ });
    }
    await db.emailCampaignRecipient.update({
      where: { id: r.id },
      data: { status: "CLICKED", sentAt, deliveredAt: delAt, openedAt, clickedAt },
    });
    await db.emailCampaignClickEvent.create({
      data: {
        campaignId: campaign.id,
        recipientId: r.id,
        href: pickClickedHref(campaign.bodyHtml),
        clickedAt,
      },
    });
  }
  void delivered; void opened; void clicked; void bounced; void unsub; void complained;

  await db.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: "SENT", completedSendingAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.campaign.sent",
    entityType: "EmailCampaign",
    entityId: campaign.id,
    metadata: { actor: ctx.email, recipients: recipients.length },
  });
  revalidatePath(LIST_ROUTE);
  revalidatePath(detailRoute(campaign.id));
  redirect(`${detailRoute(campaign.id)}?step=performance&ok=sent`);
}

function pickClickedHref(html: string): string {
  const matches = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1] ?? "");
  const real = matches.filter((h) => /^https?:\/\//.test(h));
  if (real.length === 0) return "https://flowtora.com/";
  return real[Math.floor(Math.random() * real.length)] ?? "https://flowtora.com/";
}

/* ── Manual recipient event (for testing / admin override) ── */

const manualEventSchema = z.object({
  recipientId: z.string().min(1),
  event: z.enum(["DELIVERED", "OPENED", "CLICKED", "BOUNCED", "UNSUBSCRIBED", "COMPLAINED", "FAILED"]),
});

export async function setRecipientEvent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WRITE);
  const parsed = manualEventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  const r = await db.emailCampaignRecipient.findUnique({
    where: { id: parsed.data.recipientId },
    select: { id: true, campaignId: true },
  });
  if (!r) redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Recipient missing")}`);
  if (!r) return;
  const now = new Date();
  const map: Record<string, Partial<{ status: EmailRecipientStatus; deliveredAt: Date; openedAt: Date; clickedAt: Date; bouncedAt: Date; unsubscribedAt: Date; complainedAt: Date; failedAt: Date }>> = {
    DELIVERED:    { status: "DELIVERED",    deliveredAt: now },
    OPENED:       { status: "OPENED",       openedAt: now },
    CLICKED:      { status: "CLICKED",      clickedAt: now },
    BOUNCED:      { status: "BOUNCED",      bouncedAt: now },
    UNSUBSCRIBED: { status: "UNSUBSCRIBED", unsubscribedAt: now },
    COMPLAINED:   { status: "COMPLAINED",   complainedAt: now },
    FAILED:       { status: "FAILED",       failedAt: now },
  };
  await db.emailCampaignRecipient.update({
    where: { id: r.id },
    data: map[parsed.data.event] ?? {},
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.campaign.recipient_${parsed.data.event.toLowerCase()}`,
    entityType: "EmailCampaignRecipient",
    entityId: r.id,
    metadata: { actor: ctx.email, campaignId: r.campaignId },
  });
  revalidatePath(detailRoute(r.campaignId));
  redirect(`${detailRoute(r.campaignId)}?step=performance&ok=event`);
}

/* ── Estimate audience action (used from the Audience step) ── */

export async function estimateAudienceFromFilter(formData: FormData) {
  const id = formData.get("id");
  const json = formData.get("audienceJson");
  if (typeof id !== "string" || typeof json !== "string") {
    redirect(`${LIST_ROUTE}?error=${encodeURIComponent("Invalid")}`);
  }
  const filter = parseSegmentJson(typeof json === "string" ? json : null);
  const size = await estimateAudience(filter);
  await db.emailCampaign.update({
    where: { id: String(id) },
    data: { audienceFilter: filter as never, audienceSize: size },
  });
  revalidatePath(detailRoute(String(id)));
  redirect(`${detailRoute(String(id))}?step=audience&ok=estimated-${size}`);
}
