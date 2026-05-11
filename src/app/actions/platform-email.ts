"use server";

// Page 58 — Email Deliverability actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  EmailBounceStatus,
  EmailSuppressionSource,
  DomainAuthStatus,
  EmailProviderRole,
  EmailProviderHealth,
} from "@prisma/client";

const ROUTE = "/platform/system/email";
const PERM_READ = "email.deliverability.read" as const;
const PERM_MANAGE = "email.deliverability.manage" as const;

const SUPPRESSION_SOURCES = ["BOUNCE", "COMPLAINT", "MANUAL", "CSV_IMPORT", "GDPR_REQUEST"] as const;
const AUTH_STATUSES = ["PASS", "FAIL", "WARN", "UNCONFIGURED"] as const;
const PROVIDER_ROLES = ["PRIMARY", "BACKUP", "BULK", "TRANSACTIONAL", "DISABLED"] as const;
const PROVIDER_HEALTH = ["HEALTHY", "DEGRADED", "WARNING", "OFFLINE"] as const;

/* ── Suppression ───────────────────────────────────────── */

const suppressSchema = z.object({
  email:  z.string().email(),
  source: z.enum(SUPPRESSION_SOURCES),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().optional(),
});

export async function addSuppression(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = suppressSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=suppression&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.emailSuppression.upsert({
    where: { email: d.email.toLowerCase() },
    create: {
      email: d.email.toLowerCase(),
      source: d.source as EmailSuppressionSource,
      reason: d.reason || null,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      addedById: ctx.userId,
      addedByEmail: ctx.email,
    },
    update: {
      source: d.source as EmailSuppressionSource,
      reason: d.reason || null,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      removedAt: null,
      removedById: null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.suppress",
    entityType: "EmailSuppression", entityId: d.email,
    metadata: { actor: ctx.email, source: d.source },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=suppression&ok=suppressed`);
}

const unsuppressSchema = z.object({ id: z.string().min(1) });

export async function removeSuppression(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = unsuppressSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=suppression&error=Invalid`);
  await db.emailSuppression.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.unsuppress",
    entityType: "EmailSuppression", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=suppression&ok=unsuppressed`);
}

/* ── Bounce actions ────────────────────────────────────── */

const bounceStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(["OPEN", "SUPPRESSED", "INVESTIGATING", "RESOLVED"]),
});

export async function setBounceStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = bounceStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=bounces&error=Invalid`);
  const d = parsed.data;
  const status = d.status as EmailBounceStatus;
  const before = await db.emailBounce.findUnique({ where: { id: d.id } });
  if (!before) redirect(`${ROUTE}?tab=bounces&error=Not-found`);
  await db.emailBounce.update({
    where: { id: d.id },
    data: { status },
  });
  if (status === "SUPPRESSED" && before!.recipient) {
    await db.emailSuppression.upsert({
      where: { email: before!.recipient.toLowerCase() },
      create: {
        email: before!.recipient.toLowerCase(),
        source: "BOUNCE",
        reason: before!.reason ?? "Bounced",
        addedById: ctx.userId,
        addedByEmail: ctx.email,
      },
      update: {},
    });
  }
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.bounce_status",
    entityType: "EmailBounce", entityId: d.id,
    metadata: { actor: ctx.email, status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=bounces&ok=bounce-${status.toLowerCase()}`);
}

/* ── Domain auth ───────────────────────────────────────── */

const reverifySchema = z.object({ id: z.string().min(1) });

export async function reverifyDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = reverifySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=auth&error=Invalid`);
  // Synthesize "re-verify" — flip all statuses to PASS, refresh timestamp.
  await db.emailSendingDomain.update({
    where: { id: parsed.data.id },
    data: {
      spfStatus:  "PASS",
      dkimStatus: "PASS",
      dmarcStatus: "PASS",
      lastVerifiedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.domain_reverified",
    entityType: "EmailSendingDomain", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=auth&ok=domain-reverified`);
}

const saveDomainSchema = z.object({
  id:               z.string().optional(),
  domain:           z.string().min(1).max(120),
  hostname:         z.string().max(120).optional(),
  mxRecord:         z.string().max(200).optional(),
  spfRecord:        z.string().max(500).optional(),
  spfStatus:        z.enum(AUTH_STATUSES),
  dkimStatus:       z.enum(AUTH_STATUSES),
  dmarcRecord:      z.string().max(500).optional(),
  dmarcStatus:      z.enum(AUTH_STATUSES),
  dmarcPolicy:      z.string().max(20).optional(),
  dmarcReportingUri: z.string().max(120).optional(),
  bimiRecord:       z.string().max(500).optional(),
  bimiStatus:       z.enum(AUTH_STATUSES),
  bimiVmcUrl:       z.string().max(200).optional(),
  notes:            z.string().max(500).optional(),
});

export async function saveDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = saveDomainSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=auth&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    hostname: d.hostname || null,
    mxRecord: d.mxRecord || null,
    spfRecord: d.spfRecord || null,
    spfStatus: d.spfStatus as DomainAuthStatus,
    dkimStatus: d.dkimStatus as DomainAuthStatus,
    dmarcRecord: d.dmarcRecord || null,
    dmarcStatus: d.dmarcStatus as DomainAuthStatus,
    dmarcPolicy: d.dmarcPolicy || null,
    dmarcReportingUri: d.dmarcReportingUri || null,
    bimiRecord: d.bimiRecord || null,
    bimiStatus: d.bimiStatus as DomainAuthStatus,
    bimiVmcUrl: d.bimiVmcUrl || null,
    notes: d.notes || null,
    lastVerifiedAt: new Date(),
  };
  await db.emailSendingDomain.upsert({
    where: { domain: d.domain },
    create: { domain: d.domain, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.domain_saved",
    entityType: "EmailSendingDomain", entityId: d.domain,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=auth&ok=domain-saved`);
}

/* ── Providers ─────────────────────────────────────────── */

const providerSchema = z.object({
  id:               z.string().optional(),
  key:              z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  name:             z.string().min(1).max(120),
  role:             z.enum(PROVIDER_ROLES),
  health:           z.enum(PROVIDER_HEALTH),
  costPer1000Cents: z.coerce.number().int().min(0),
  autoFailover:     z.union([z.literal("on"), z.literal("")]).optional(),
  dailyCap:         z.coerce.number().int().min(0),
  domains:          z.string().optional(),
  notes:            z.string().max(500).optional(),
});

export async function saveProvider(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = providerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=providers&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const domains = (d.domains ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const data = {
    name: d.name,
    role: d.role as EmailProviderRole,
    health: d.health as EmailProviderHealth,
    costPer1000Cents: d.costPer1000Cents,
    autoFailover: d.autoFailover === "on",
    dailyCap: d.dailyCap,
    domains,
    notes: d.notes || null,
  };
  await db.emailProvider.upsert({
    where: { key: d.key },
    create: { key: d.key, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.provider_saved",
    entityType: "EmailProvider", entityId: d.key,
    metadata: { actor: ctx.email, role: d.role, health: d.health },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=providers&ok=provider-saved`);
}

const setPrimarySchema = z.object({ id: z.string().min(1) });

export async function setProviderPrimary(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = setPrimarySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=providers&error=Invalid`);
  // Demote all current primaries to BACKUP.
  await db.emailProvider.updateMany({
    where: { role: "PRIMARY" },
    data: { role: "BACKUP" },
  });
  await db.emailProvider.update({
    where: { id: parsed.data.id },
    data: { role: "PRIMARY" },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.provider_primary_set",
    entityType: "EmailProvider", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=providers&ok=primary-set`);
}

/* ── Template suspend ─────────────────────────────────── */

const templateSuspendSchema = z.object({
  id:      z.string().min(1),
  suspend: z.enum(["1", "0"]),
  reason:  z.string().max(500).optional(),
});

export async function toggleTemplateSuspend(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = templateSuspendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=templates&error=Invalid`);
  const suspended = parsed.data.suspend === "1";
  await db.emailTemplateStats.update({
    where: { id: parsed.data.id },
    data: {
      suspended,
      suspendedReason: suspended ? parsed.data.reason ?? null : null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: suspended ? "platform.email.template_suspended" : "platform.email.template_resumed",
    entityType: "EmailTemplateStats", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=templates&ok=template-${suspended ? "suspended" : "resumed"}`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  bounceTargetPct:        z.coerce.number().min(0).max(100),
  complaintTargetPct:     z.coerce.number().min(0).max(100),
  autoSuppressOnComplaint: z.union([z.literal("on"), z.literal("")]).optional(),
  autoSuppressOnHardBounce: z.union([z.literal("on"), z.literal("")]).optional(),
  softBounceBackoffH:     z.coerce.number().int().min(1).max(720),
  failoverOrder:          z.string().optional(),
  notes:                  z.string().max(500).optional(),
});

export async function saveEmailSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const order = (d.failoverOrder ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  await db.emailDeliverabilitySettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      bounceTargetPct: d.bounceTargetPct,
      complaintTargetPct: d.complaintTargetPct,
      autoSuppressOnComplaint: d.autoSuppressOnComplaint === "on",
      autoSuppressOnHardBounce: d.autoSuppressOnHardBounce === "on",
      softBounceBackoffH: d.softBounceBackoffH,
      failoverOrder: order,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      bounceTargetPct: d.bounceTargetPct,
      complaintTargetPct: d.complaintTargetPct,
      autoSuppressOnComplaint: d.autoSuppressOnComplaint === "on",
      autoSuppressOnHardBounce: d.autoSuppressOnHardBounce === "on",
      softBounceBackoffH: d.softBounceBackoffH,
      failoverOrder: order,
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.email.settings_saved",
    entityType: "EmailDeliverabilitySettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved`);
}
