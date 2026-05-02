"use server";

// Page 23 — Dunning & Failed Payments server actions.
//
// All mutations gated on `billing.invoice` (the same lever Page 17 uses
// for retry actions). Audit-logged. Honest deferral: retry-now mints a
// pending PlatformInvoicePayment row — no Stripe SDK round-trip until
// the integration lands.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/billing/dunning";

/* ── Sequences ──────────────────────────────────────────── */

const sequenceSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  planSlug: z.string().trim().toLowerCase().max(60).optional().or(z.literal("")),
  smartRetries: z.union([z.literal("on"), z.literal("")]).optional(),
  active: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function upsertDunningSequence(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const parsed = sequenceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid sequence";
    redirect(`${ROUTE}?tab=sequences&error=${encodeURIComponent(msg)}`);
  }
  if (parsed.data.id) {
    await db.dunningSequence.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description?.trim() || null,
        planSlug: parsed.data.planSlug?.trim() || null,
        smartRetries: parsed.data.smartRetries === "on",
        active: parsed.data.active !== "",
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.dunning_sequence_updated",
      entityType: "DunningSequence",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, name: parsed.data.name },
    });
  } else {
    const created = await db.dunningSequence.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description?.trim() || null,
        planSlug: parsed.data.planSlug?.trim() || null,
        smartRetries: parsed.data.smartRetries === "on",
        active: parsed.data.active !== "",
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.dunning_sequence_created",
      entityType: "DunningSequence",
      entityId: created.id,
      metadata: { actor: ctx.email, name: parsed.data.name },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=sequences&ok=saved`);
}

export async function deleteDunningSequence(sequenceId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const seq = await db.dunningSequence.findUnique({
    where: { id: sequenceId },
    select: { id: true, name: true, _count: { select: { events: true } } },
  });
  if (!seq) redirect(`${ROUTE}?tab=sequences&error=${encodeURIComponent("Sequence not found")}`);
  if (seq._count.events > 0) {
    redirect(`${ROUTE}?tab=sequences&error=${encodeURIComponent(`Can't delete — ${seq._count.events} event${seq._count.events === 1 ? "" : "s"} reference this sequence`)}`);
  }
  await db.dunningSequence.delete({ where: { id: sequenceId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.dunning_sequence_deleted",
    entityType: "DunningSequence",
    entityId: sequenceId,
    metadata: { actor: ctx.email, name: seq.name },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=sequences&ok=deleted`);
}

/* ── Sequence stages ────────────────────────────────────── */

const stageSchema = z.object({
  id: z.string().optional(),
  sequenceId: z.string().min(1),
  position: z.coerce.number().int().min(1),
  triggerDays: z.coerce.number().int().min(0).max(365),
  action: z.enum([
    "SEND_EMAIL", "SEND_SMS", "IN_APP_BANNER",
    "RETRY_PAYMENT", "NOTIFY_CSM", "SURRENDER",
  ]),
  templateKind: z.string().trim().max(120).optional().or(z.literal("")),
  label: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function upsertDunningStage(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const parsed = stageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid stage";
    redirect(`${ROUTE}?tab=sequences&error=${encodeURIComponent(msg)}`);
  }
  if (parsed.data.id) {
    await db.dunningSequenceStage.update({
      where: { id: parsed.data.id },
      data: {
        position: parsed.data.position,
        triggerDays: parsed.data.triggerDays,
        action: parsed.data.action,
        templateKind: parsed.data.templateKind?.trim() || null,
        label: parsed.data.label?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
      },
    });
  } else {
    await db.dunningSequenceStage.create({
      data: {
        sequenceId: parsed.data.sequenceId,
        position: parsed.data.position,
        triggerDays: parsed.data.triggerDays,
        action: parsed.data.action,
        templateKind: parsed.data.templateKind?.trim() || null,
        label: parsed.data.label?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.dunning_stage_saved",
    entityType: "DunningSequenceStage",
    entityId: parsed.data.id ?? "(new)",
    metadata: { actor: ctx.email, sequenceId: parsed.data.sequenceId, action: parsed.data.action, position: parsed.data.position },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=sequences&ok=stage_saved`);
}

export async function deleteDunningStage(stageId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const stage = await db.dunningSequenceStage.findUnique({
    where: { id: stageId },
    select: { id: true, sequenceId: true, position: true },
  });
  if (!stage) redirect(`${ROUTE}?tab=sequences&error=${encodeURIComponent("Stage not found")}`);
  await db.dunningSequenceStage.delete({ where: { id: stageId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.dunning_stage_deleted",
    entityType: "DunningSequenceStage",
    entityId: stageId,
    metadata: { actor: ctx.email, sequenceId: stage.sequenceId, position: stage.position },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=sequences&ok=stage_deleted`);
}

/* ── Settings (DunningConfig singleton) ─────────────────── */

const configSchema = z.object({
  defaultSequenceId: z.string().optional().or(z.literal("")),
  maxRetries: z.coerce.number().int().min(0).max(20).default(4),
  autoCancelAfterDays: z.coerce.number().int().min(0).max(365).default(30),
  ccBillingEmail: z.union([z.literal("on"), z.literal("")]).optional(),
  maxRetriesPerDay: z.coerce.number().int().min(0).max(20).default(2),
  smartRetriesEnabled: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveDunningConfig(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const parsed = configSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid config";
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(msg)}`);
  }
  await db.dunningConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultSequenceId: parsed.data.defaultSequenceId || null,
      maxRetries: parsed.data.maxRetries,
      autoCancelAfterDays: parsed.data.autoCancelAfterDays,
      ccBillingEmail: parsed.data.ccBillingEmail === "on",
      maxRetriesPerDay: parsed.data.maxRetriesPerDay,
      smartRetriesEnabled: parsed.data.smartRetriesEnabled === "on",
      updatedBy: ctx.userId,
    },
    update: {
      defaultSequenceId: parsed.data.defaultSequenceId || null,
      maxRetries: parsed.data.maxRetries,
      autoCancelAfterDays: parsed.data.autoCancelAfterDays,
      ccBillingEmail: parsed.data.ccBillingEmail === "on",
      maxRetriesPerDay: parsed.data.maxRetriesPerDay,
      smartRetriesEnabled: parsed.data.smartRetriesEnabled === "on",
      updatedBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.dunning_config_updated",
    entityType: "DunningConfig",
    entityId: "default",
    metadata: { actor: ctx.email, defaultSequenceId: parsed.data.defaultSequenceId || null, maxRetries: parsed.data.maxRetries },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Queue actions (per-event) ──────────────────────────── */

export async function retryDunningPayment(eventId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const event = await db.dunningEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true, paymentId: true, invoiceId: true, tenantId: true, retriesAttempted: true,
      payment: { select: { gateway: true, method: true, amount: true } },
    },
  });
  if (!event) redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Event not found")}`);

  // Mint a fresh pending payment attempt — same shape as Page 17's
  // retryInvoicePayment. The Stripe call goes here when the SDK lands.
  await db.platformInvoicePayment.create({
    data: {
      invoiceId: event.invoiceId,
      gateway: event.payment.gateway,
      method: event.payment.method,
      amount: event.payment.amount,
      status: "pending",
    },
  });
  await db.dunningEvent.update({
    where: { id: eventId },
    data: {
      retriesAttempted: { increment: 1 },
      lastActionAt: new Date(),
      lastOutcome: "Manual retry queued",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: event.tenantId,
    action: "platform.dunning_retry_now",
    entityType: "DunningEvent",
    entityId: eventId,
    metadata: { actor: ctx.email, paymentId: event.paymentId },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=queue&ok=retried`);
}

export async function skipDunningStage(eventId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const event = await db.dunningEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true, currentStage: true, sequenceId: true, tenantId: true,
      sequence: { include: { stages: { orderBy: { position: "asc" } } } },
    },
  });
  if (!event) redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Event not found")}`);
  const totalStages = event.sequence.stages.length;
  const next = event.currentStage + 1;
  if (next >= totalStages) {
    redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Already on the final stage — surrender to exit")}`);
  }
  const nextStage = event.sequence.stages[next];
  const nextActionAt = new Date(Date.now() + nextStage.triggerDays * 86_400_000);
  await db.dunningEvent.update({
    where: { id: eventId },
    data: {
      currentStage: next,
      nextActionAt,
      lastActionAt: new Date(),
      lastOutcome: `Skipped to stage ${next + 1}`,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: event.tenantId,
    action: "platform.dunning_stage_skipped",
    entityType: "DunningEvent",
    entityId: eventId,
    metadata: { actor: ctx.email, fromStage: event.currentStage, toStage: next },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=queue&ok=skipped`);
}

export async function pauseDunningEvent(eventId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const event = await db.dunningEvent.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, tenantId: true },
  });
  if (!event) redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Event not found")}`);
  const newStatus = event.status === "PAUSED" ? "IN_PROGRESS" : "PAUSED";
  await db.dunningEvent.update({
    where: { id: eventId },
    data: {
      status: newStatus,
      nextActionAt: newStatus === "PAUSED" ? null : new Date(Date.now() + 86_400_000),
      lastActionAt: new Date(),
      lastOutcome: newStatus === "PAUSED" ? "Paused by admin" : "Resumed by admin",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: event.tenantId,
    action: newStatus === "PAUSED" ? "platform.dunning_paused" : "platform.dunning_resumed",
    entityType: "DunningEvent",
    entityId: eventId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=queue&ok=${newStatus === "PAUSED" ? "paused" : "resumed"}`);
}

export async function surrenderDunningEvent(eventId: string) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const event = await db.dunningEvent.findUnique({
    where: { id: eventId },
    select: { id: true, invoiceId: true, tenantId: true, status: true },
  });
  if (!event) redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Event not found")}`);
  if (event.status === "SURRENDERED" || event.status === "RECOVERED") {
    redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Already terminal")}`);
  }
  await db.$transaction([
    db.dunningEvent.update({
      where: { id: eventId },
      data: {
        status: "SURRENDERED",
        surrenderedAt: new Date(),
        nextActionAt: null,
        lastActionAt: new Date(),
        lastOutcome: "Surrendered by admin",
      },
    }),
    db.platformBillingInvoice.update({
      where: { id: event.invoiceId },
      data: { status: "UNCOLLECTIBLE", voidReason: "Dunning surrendered by admin" },
    }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: event.tenantId,
    action: "platform.dunning_surrendered",
    entityType: "DunningEvent",
    entityId: eventId,
    metadata: { actor: ctx.email, invoiceId: event.invoiceId },
    severity: "CRITICAL",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=queue&ok=surrendered`);
}

const customEmailSchema = z.object({
  eventId: z.string().min(1),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(10).max(5000),
});

export async function sendDunningCustomEmail(formData: FormData) {
  const ctx = await requirePlatformPermission("billing.invoice");
  const parsed = customEmailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid email";
    redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent(msg)}`);
  }

  const event = await db.dunningEvent.findUnique({
    where: { id: parsed.data.eventId },
    select: {
      id: true, tenantId: true,
      tenant: {
        select: {
          name: true,
          memberships: {
            where: { role: "OWNER" },
            select: { user: { select: { email: true } } },
            take: 1,
          },
        },
      },
    },
  });
  if (!event) redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("Event not found")}`);
  const ownerEmail = event.tenant.memberships[0]?.user?.email;
  if (!ownerEmail) redirect(`${ROUTE}?tab=queue&error=${encodeURIComponent("No owner email on file")}`);

  // Render a minimal HTML wrapper around the plaintext body — same
  // shape every other transactional email uses.
  const escaped = parsed.data.body
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await sendEmail({
    to: ownerEmail,
    subject: parsed.data.subject,
    text: parsed.data.body,
    html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;">${escaped.split("\n").map((l) => `<p>${l}</p>`).join("")}</div>`,
  });
  await db.dunningEvent.update({
    where: { id: parsed.data.eventId },
    data: {
      lastActionAt: new Date(),
      lastOutcome: `Custom email sent: "${parsed.data.subject}"`,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: event.tenantId,
    action: "platform.dunning_custom_email_sent",
    entityType: "DunningEvent",
    entityId: parsed.data.eventId,
    metadata: { actor: ctx.email, subject: parsed.data.subject, recipient: ownerEmail },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=queue&ok=email_sent`);
}

// Suppress unused-import warnings by referencing the Prisma namespace.
void Prisma;
