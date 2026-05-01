"use server";

// Churn & At-Risk server actions — Page 7 of the admin spec.
//
// Permissions:
//   • Per-row save actions (offer / call / engage / suppress / win-back-email):
//     `tenant.tag` (CSMs have it).
//   • Win-back campaign create/start/pause/end: `announcement.write`
//     (Marketing role) — closest equivalent perm in our RBAC.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import { computeWinbackAudience } from "@/server/platform/churn";
import type { ArchiveReasonCode, Prisma } from "@prisma/client";

/* ────────────────────────────────────────────────────────── */
/* Per-row save actions                                       */
/* ────────────────────────────────────────────────────────── */

const offerSchema = z.object({
  tenantId: z.string().min(1),
  couponId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export async function applyRetentionOffer(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag") || !ctx.can("billing.coupon")) {
    return { ok: false, error: "Your role can't apply retention offers" } as const;
  }
  const parsed = offerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  // Apply the coupon to the tenant — Tenant.activeCouponId.
  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { activeCouponId: parsed.data.couponId },
  });
  await db.retentionAttempt.create({
    data: {
      tenantId: parsed.data.tenantId,
      kind: "OFFER",
      couponId: parsed.data.couponId,
      notes: parsed.data.notes ?? null,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.retention_offer_applied",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, couponId: parsed.data.couponId },
  });
  revalidatePath("/platform/tenants/churn");
  revalidatePath(`/platform/tenants/${parsed.data.tenantId}`);
  return { ok: true } as const;
}

const callSchema = z.object({
  tenantId: z.string().min(1),
  scheduledFor: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export async function scheduleSaveCall(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't schedule save calls" } as const;
  }
  const parsed = callSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const when = new Date(parsed.data.scheduledFor);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Invalid date" } as const;

  await db.retentionAttempt.create({
    data: {
      tenantId: parsed.data.tenantId,
      kind: "SCHEDULE_CALL",
      scheduledFor: when,
      notes: parsed.data.notes ?? null,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.retention_call_scheduled",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, scheduledFor: when.toISOString() },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true } as const;
}

const markEngagedSchema = z.object({
  tenantId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export async function markEngaged(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't mark engaged" } as const;
  }
  const parsed = markEngagedSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  // 30-day suppression so the row drops off until the next review cycle.
  const suppressUntil = new Date(Date.now() + 30 * 86_400_000);
  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { atRiskSuppressedUntil: suppressUntil },
  });
  await db.retentionAttempt.create({
    data: {
      tenantId: parsed.data.tenantId,
      kind: "MARK_ENGAGED",
      suppressUntil,
      notes: parsed.data.notes ?? null,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.retention_marked_engaged",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, suppressUntil: suppressUntil.toISOString() },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true } as const;
}

const suppressSchema = z.object({
  tenantId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(365).default(14),
  notes: z.string().max(500).optional(),
});

export async function suppressAtRiskAlert(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't suppress alerts" } as const;
  }
  const parsed = suppressSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const suppressUntil = new Date(Date.now() + parsed.data.days * 86_400_000);
  await db.tenant.update({
    where: { id: parsed.data.tenantId },
    data: { atRiskSuppressedUntil: suppressUntil },
  });
  await db.retentionAttempt.create({
    data: {
      tenantId: parsed.data.tenantId,
      kind: "SUPPRESS_ALERT",
      suppressUntil,
      notes: parsed.data.notes ?? null,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.retention_alert_suppressed",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, suppressUntil: suppressUntil.toISOString(), days: parsed.data.days },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Win-back campaigns                                          */
/* ────────────────────────────────────────────────────────── */

const audienceFilterSchema = z.object({
  reasonCodes: z.array(z.string()).optional(),
  cancelledSinceDays: z.coerce.number().int().min(1).max(3650).optional(),
}).strict();

const upsertCampaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  audienceFilterJson: z.string().min(2),
  emailSubject: z.string().min(1).max(200),
  emailBody: z.string().min(1).max(8_000),
});

export async function upsertWinbackCampaign(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("announcement.write")) {
    return { ok: false, error: "Your role can't author campaigns" } as const;
  }
  const parsed = upsertCampaignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;

  let audienceFilter: { reasonCodes?: string[]; cancelledSinceDays?: number };
  try {
    audienceFilter = audienceFilterSchema.parse(JSON.parse(parsed.data.audienceFilterJson));
  } catch {
    return { ok: false, error: "Audience filter must be valid JSON" } as const;
  }

  // Compute audience size up front so the card shows it without
  // waiting for the cron.
  const aud = await computeWinbackAudience({
    reasonCodes: (audienceFilter.reasonCodes ?? []) as ArchiveReasonCode[],
    cancelledSinceDays: audienceFilter.cancelledSinceDays,
  });

  const audienceFilterJson = audienceFilter as Prisma.InputJsonValue;
  let campaignId: string;
  if (parsed.data.id) {
    const updated = await db.winbackCampaign.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        audienceFilter: audienceFilterJson,
        emailSubject: parsed.data.emailSubject,
        emailBody: parsed.data.emailBody,
        audienceSize: aud.tenantIds.length,
      },
    });
    campaignId = updated.id;
  } else {
    const created = await db.winbackCampaign.create({
      data: {
        name: parsed.data.name,
        audienceFilter: audienceFilterJson,
        emailSubject: parsed.data.emailSubject,
        emailBody: parsed.data.emailBody,
        audienceSize: aud.tenantIds.length,
        status: "DRAFT",
        createdBy: ctx.userId,
      },
    });
    campaignId = created.id;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.id ? "platform.winback_campaign_updated" : "platform.winback_campaign_created",
    entityType: "WinbackCampaign",
    entityId: campaignId,
    metadata: { actor: ctx.email, name: parsed.data.name, audienceSize: aud.tenantIds.length },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true, id: campaignId } as const;
}

const lifecycleSchema = z.object({
  campaignId: z.string().min(1),
  action: z.union([
    z.literal("start"), z.literal("pause"), z.literal("resume"), z.literal("end"),
  ]),
});

export async function setWinbackCampaignLifecycle(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("announcement.write")) {
    return { ok: false, error: "Your role can't manage campaigns" } as const;
  }
  const parsed = lifecycleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const now = new Date();
  let dataPatch: Record<string, unknown>;
  switch (parsed.data.action) {
    case "start":  dataPatch = { status: "ACTIVE", startedAt: now, pausedAt: null, endedAt: null }; break;
    case "pause":  dataPatch = { status: "PAUSED", pausedAt: now }; break;
    case "resume": dataPatch = { status: "ACTIVE", pausedAt: null }; break;
    case "end":    dataPatch = { status: "ENDED",  endedAt: now };  break;
  }
  await db.winbackCampaign.update({ where: { id: parsed.data.campaignId }, data: dataPatch });
  await logPlatformAudit({
    userId: ctx.userId,
    action: `platform.winback_campaign_${parsed.data.action}`,
    entityType: "WinbackCampaign",
    entityId: parsed.data.campaignId,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* One-off win-back email + bulk enrol                         */
/* ────────────────────────────────────────────────────────── */

const winbackEmailSchema = z.object({
  tenantId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8_000),
});

export async function sendOneOffWinbackEmail(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't send win-back emails" } as const;
  }
  const parsed = winbackEmailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const tenant = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: {
      id: true, name: true,
      memberships: { where: { role: "OWNER" }, select: { user: { select: { email: true } } }, take: 1 },
    },
  });
  const ownerEmail = tenant?.memberships[0]?.user?.email ?? null;
  if (!ownerEmail) return { ok: false, error: "No owner email on file" } as const;

  await sendEmail({
    to: ownerEmail,
    subject: parsed.data.subject,
    text: parsed.data.body,
    html: `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;">${escapeHtml(parsed.data.body)}</pre>`,
  });
  await db.retentionAttempt.create({
    data: {
      tenantId: parsed.data.tenantId,
      kind: "WINBACK_EMAIL",
      notes: parsed.data.subject,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: parsed.data.tenantId,
    action: "platform.winback_email_sent",
    entityType: "Tenant",
    entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email, recipient: ownerEmail },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true } as const;
}

const bulkEnrolSchema = z.object({
  tenantIds: z.string().min(1), // CSV
  campaignId: z.string().min(1),
});

export async function bulkEnrolInRetentionCampaign(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.tag")) {
    return { ok: false, error: "Your role can't enrol tenants" } as const;
  }
  const parsed = bulkEnrolSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.tenantIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No tenants selected" } as const;

  let count = 0;
  for (const tenantId of ids) {
    try {
      await db.winbackEnrollment.create({
        data: { campaignId: parsed.data.campaignId, tenantId },
      });
      count += 1;
    } catch (err) {
      // Unique-constraint failure (tenant already enrolled) is fine.
      void err;
    }
  }
  await db.winbackCampaign.update({
    where: { id: parsed.data.campaignId },
    data: { audienceSize: { increment: count } },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.winback_bulk_enrolled",
    entityType: "WinbackCampaign",
    entityId: parsed.data.campaignId,
    metadata: { actor: ctx.email, count },
  });
  revalidatePath("/platform/tenants/churn");
  return { ok: true, count } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Helpers                                                     */
/* ────────────────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
