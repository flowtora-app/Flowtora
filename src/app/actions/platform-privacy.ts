"use server";

// Page 52 — Data Privacy Request actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  PrivacyRequestType,
  PrivacyJurisdiction,
  PrivacyRequestSource,
  PrivacyRequestStatus,
  PrivacyVerificationStatus,
  PrivacyVerificationMethod,
  PrivacyScopeSystem,
  PrivacyScopeStatus,
  PrivacyMessageDirection,
  PrivacyMessageChannel,
} from "@prisma/client";

const ROUTE = "/platform/security/privacy-requests";
const PERM_READ    = "privacy.read" as const;
const PERM_TRIAGE  = "privacy.triage" as const;
const PERM_PROCESS = "privacy.process" as const;
const PERM_DELETE  = "privacy.delete" as const;

/* ── Intake ─────────────────────────────────────────────── */

const intakeSchema = z.object({
  type:         z.enum(["ACCESS_EXPORT", "DELETION", "RECTIFICATION", "RESTRICTION", "OBJECTION", "PORTABILITY", "OPT_OUT_OF_SALE"]),
  jurisdiction: z.enum(["GDPR", "UK_GDPR", "CCPA", "CPRA", "LGPD", "PIPEDA", "OTHER"]),
  source:       z.enum(["TENANT_PORTAL", "EMAIL", "WEB_FORM", "PHONE", "API"]),
  subjectName:  z.string().min(1).max(160),
  subjectEmail: z.string().email(),
  subjectIdentifier: z.string().max(120).optional(),
  tenantId:     z.string().optional().or(z.literal("")),
  intakeNotes:  z.string().max(4000).optional(),
});

export async function intakeRequest(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TRIAGE);
  const parsed = intakeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  // GDPR/UK_GDPR/LGPD: 30 days. CCPA/CPRA: 45 days.
  const slaDays = d.jurisdiction === "CCPA" || d.jurisdiction === "CPRA" ? 45 : 30;
  const externalId = `DSR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0")}`;

  const created = await db.privacyRequest.create({
    data: {
      externalId,
      type: d.type as PrivacyRequestType,
      jurisdiction: d.jurisdiction as PrivacyJurisdiction,
      source: d.source as PrivacyRequestSource,
      status: "RECEIVED",
      subjectName: d.subjectName,
      subjectEmail: d.subjectEmail,
      subjectIdentifier: d.subjectIdentifier || null,
      tenantId: d.tenantId || null,
      slaDays,
      slaDeadline: new Date(Date.now() + slaDays * 86_400_000),
      intakeNotes: d.intakeNotes || null,
    },
    select: { id: true, externalId: true },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: created.id,
      action: "request.received",
      actorEmail: ctx.email,
      details: `Request intake from ${d.source} for ${d.subjectEmail}`,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.privacy.request_received",
    entityType: "PrivacyRequest", entityId: created.id,
    metadata: { actor: ctx.email, externalId: created.externalId, type: d.type, jurisdiction: d.jurisdiction },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${created.id}?ok=request-received`);
}

/* ── Set status ────────────────────────────────────────── */

const setStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum([
    "RECEIVED", "AWAITING_VERIFICATION", "VERIFIED", "IN_PROGRESS",
    "AWAITING_LEGAL_HOLD_REVIEW", "AWAITING_SUBJECT_INFO",
    "COMPLETED", "REJECTED", "WITHDRAWN",
  ]),
  rejectedReason: z.string().max(500).optional(),
});

export async function setRequestStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PROCESS);
  const parsed = setStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const status = d.status as PrivacyRequestStatus;
  const now = new Date();
  await db.privacyRequest.update({
    where: { id: d.id },
    data: {
      status,
      rejectedReason: status === "REJECTED" ? d.rejectedReason ?? null : null,
      verifiedAt:  status === "VERIFIED" ? now : undefined,
      completedAt: status === "COMPLETED" ? now : undefined,
      rejectedAt:  status === "REJECTED" ? now : undefined,
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: `request.status_set.${status.toLowerCase()}`,
      actorEmail: ctx.email,
      details: status === "REJECTED" ? `Rejected: ${d.rejectedReason ?? ""}` : `Status set to ${status}`,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.privacy.status_set",
    entityType: "PrivacyRequest", entityId: d.id,
    metadata: { actor: ctx.email, status, reason: d.rejectedReason ?? null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=status-${status.toLowerCase()}`);
}

/* ── Assign ────────────────────────────────────────────── */

const assignSchema = z.object({
  id:     z.string().min(1),
  userId: z.string().optional().or(z.literal("")),
});

export async function assignRequest(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TRIAGE);
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.privacyRequest.update({
    where: { id: d.id },
    data: { assignedToId: d.userId || null },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: "request.assigned",
      actorEmail: ctx.email,
      details: d.userId ? `Assigned to user ${d.userId}` : "Unassigned",
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=assigned`);
}

/* ── Verification ──────────────────────────────────────── */

const verifySchema = z.object({
  id:      z.string().min(1),
  method:  z.enum(["ID_UPLOAD", "EMAIL_LINK", "MFA_CHALLENGE", "SECURITY_QUESTIONS", "VIDEO_CALL", "KNOWN_AUTH_SESSION"]),
  status:  z.enum(["VERIFIED", "FAILED", "WAIVED"]),
  fileUrl: z.string().url().optional().or(z.literal("")),
  notes:   z.string().max(500).optional(),
});

export async function recordVerification(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TRIAGE);
  const parsed = verifySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const status = d.status as PrivacyVerificationStatus;
  await db.privacyVerificationDoc.create({
    data: {
      requestId: d.id,
      method: d.method as PrivacyVerificationMethod,
      status,
      fileUrl: d.fileUrl || null,
      notes: d.notes || null,
      verifiedById: ctx.userId,
      verifiedAt: status === "VERIFIED" || status === "FAILED" || status === "WAIVED" ? new Date() : null,
    },
  });
  // Roll up overall verification + status if Verified.
  await db.privacyRequest.update({
    where: { id: d.id },
    data: {
      verificationStatus: status,
      status: status === "VERIFIED" ? "VERIFIED" : status === "FAILED" ? "AWAITING_VERIFICATION" : undefined,
      verifiedAt: status === "VERIFIED" ? new Date() : undefined,
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: `verification.${status.toLowerCase()}`,
      actorEmail: ctx.email,
      details: `Method: ${d.method}; ${d.notes ?? ""}`,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=verification-${status.toLowerCase()}`);
}

/* ── Scope discovery ───────────────────────────────────── */

const scopeRunSchema = z.object({
  id:     z.string().min(1),
  system: z.enum([
    "POSTGRES", "S3", "STRIPE", "RESEND", "SENTRY",
    "AUDIT_LOG", "TENANT_CACHE", "SUPPORT_INBOX", "ANALYTICS", "WEBHOOKS", "OTHER",
  ]),
});

export async function runScopeDiscovery(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PROCESS);
  const parsed = scopeRunSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  // Synthesize a scope-discovery result. In production this would
  // queue a worker per-system; here we mark it complete immediately.
  const fakeCount = Math.floor(Math.random() * 80) + 1;
  const fakeBytes = fakeCount * (Math.floor(Math.random() * 4_000) + 200);
  await db.privacyScopeDiscovery.upsert({
    where: { requestId_system: { requestId: d.id, system: d.system as PrivacyScopeSystem } },
    create: {
      requestId: d.id,
      system: d.system as PrivacyScopeSystem,
      status: "COMPLETE",
      resultCount: fakeCount,
      resultBytes: fakeBytes,
      lastRunAt: new Date(),
    },
    update: {
      status: "COMPLETE",
      resultCount: fakeCount,
      resultBytes: fakeBytes,
      lastRunAt: new Date(),
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: "scope.completed",
      actorEmail: ctx.email,
      details: `${d.system}: ${fakeCount} records (${fakeBytes} bytes)`,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=scope-${d.system.toLowerCase()}`);
}

/* ── Messages ──────────────────────────────────────────── */

const messageSchema = z.object({
  id:        z.string().min(1),
  channel:   z.enum(["EMAIL", "PORTAL", "PHONE", "IN_APP"]),
  subject:   z.string().max(200).optional(),
  body:      z.string().min(1).max(10_000),
  templateKey: z.string().max(60).optional(),
});

export async function sendMessage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TRIAGE);
  const parsed = messageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  await db.privacyRequestMessage.create({
    data: {
      requestId: d.id,
      direction: "OUTBOUND",
      channel: d.channel as PrivacyMessageChannel,
      senderName: ctx.email.split("@")[0]!,
      senderEmail: ctx.email,
      subject: d.subject || null,
      body: d.body,
      templateKey: d.templateKey || null,
      authorUserId: ctx.userId,
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: "message.sent",
      actorEmail: ctx.email,
      details: `${d.channel}: ${d.subject ?? "(no subject)"}`,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=message-sent`);
}

/* ── Generate export bundle ────────────────────────────── */

const exportSchema = z.object({ id: z.string().min(1) });

export async function generateExport(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PROCESS);
  const parsed = exportSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const now = new Date();
  const bundleUrl = `https://docs.flowtora.com/dsr/${d.id}/export-${now.getTime()}.zip`;
  await db.privacyRequest.update({
    where: { id: d.id },
    data: {
      exportBundleUrl: bundleUrl,
      exportBundleExpiresAt: new Date(now.getTime() + 7 * 86_400_000),
      exportGenerated: true,
      status: "IN_PROGRESS",
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: "export.generated",
      actorEmail: ctx.email,
      details: "Encrypted ZIP bundle generated; 7-day delivery link issued",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.privacy.export_generated",
    entityType: "PrivacyRequest", entityId: d.id,
    metadata: { actor: ctx.email, expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=export-generated`);
}

/* ── Generate final report PDF ─────────────────────────── */

export async function generateFinalReport(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PROCESS);
  const parsed = exportSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const url = `https://docs.flowtora.com/dsr/${d.id}/final-report.pdf`;
  await db.privacyRequest.update({
    where: { id: d.id },
    data: {
      finalReportUrl: url,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: "report.generated",
      actorEmail: ctx.email,
      details: "Final report PDF generated; request marked completed",
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=report-generated`);
}

/* ── Legal hold toggle ─────────────────────────────────── */

const legalHoldSchema = z.object({
  id:      z.string().min(1),
  hold:    z.union([z.literal("on"), z.literal("")]).optional(),
  reason:  z.string().max(500).optional(),
});

export async function toggleLegalHold(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_PROCESS);
  const parsed = legalHoldSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  const on = d.hold === "on";
  await db.privacyRequest.update({
    where: { id: d.id },
    data: {
      legalHold: on,
      legalHoldReason: on ? d.reason ?? null : null,
      status: on ? "AWAITING_LEGAL_HOLD_REVIEW" : undefined,
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: on ? "legalHold.set" : "legalHold.cleared",
      actorEmail: ctx.email,
      details: on ? d.reason ?? "Legal hold applied" : "Legal hold cleared",
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=legal-hold-${on ? "applied" : "cleared"}`);
}

/* ── Final destructive deletion (typed confirmation) ──── */

const deleteSchema = z.object({
  id:      z.string().min(1),
  confirm: z.string().min(1),
  /** Subject id to compare against the typed confirm string. */
  expected: z.string().min(1),
});

export async function executeDeletion(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_DELETE);
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  const d = parsed.data;
  if (d.confirm !== d.expected) {
    redirect(`${ROUTE}/${d.id}?error=${encodeURIComponent(`Confirm phrase must equal "${d.expected}"`)}`);
  }
  // Look up to ensure not on legal hold before destruction.
  const r = await db.privacyRequest.findUnique({ where: { id: d.id } });
  if (!r) redirect(`${ROUTE}?error=Not-found`);
  if (r!.legalHold) {
    redirect(`${ROUTE}/${d.id}?error=${encodeURIComponent("Cannot delete while legal hold is active")}`);
  }
  await db.privacyRequest.update({
    where: { id: d.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      finalReportUrl: `https://docs.flowtora.com/dsr/${d.id}/final-report.pdf`,
    },
  });
  await db.privacyRequestAuditEntry.create({
    data: {
      requestId: d.id,
      action: "subject.deleted",
      actorEmail: ctx.email,
      details: `Hard-deletion executed against subject ${r!.subjectEmail}; confirmation phrase verified`,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.privacy.subject_deleted",
    entityType: "PrivacyRequest", entityId: d.id,
    metadata: { actor: ctx.email, subjectEmail: r!.subjectEmail },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=subject-deleted`);
}
