"use server";

// Page 51 — Compliance program actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import {
  LIKELIHOOD_LABEL,
  IMPACT_LABEL,
} from "@/server/platform/compliance";
import type {
  ComplianceFrameworkKey,
  ComplianceFrameworkStatus,
  ComplianceControlStatus,
  ComplianceControlDomain,
  EvidenceSource,
  EvidenceKind,
  CompliancePolicyStatus,
  SubProcessorRiskTier,
  SubProcessorCertification,
  DpaStatus,
  RiskLikelihood,
  RiskImpact,
  RiskMitigationStatus,
  VendorReviewStatus,
  ComplianceReportKind,
} from "@prisma/client";

const ROUTE = "/platform/security/compliance";
const PERM_READ   = "compliance.read" as const;
const PERM_MANAGE = "compliance.manage" as const;
const PERM_POLICY = "compliance.policy.write" as const;
const PERM_EVID   = "compliance.evidence.upload" as const;
const PERM_VENDOR = "compliance.vendor.review" as const;
const PERM_REPORT = "compliance.report.generate" as const;

/* ── Frameworks ────────────────────────────────────────── */

const frameworkSchema = z.object({
  id:         z.string().optional(),
  key:        z.enum([
    "SOC2_TYPE_II", "ISO_27001", "GDPR", "CCPA", "HIPAA", "PCI_DSS", "FERPA", "FEDRAMP",
  ]),
  name:       z.string().min(1).max(120),
  status:     z.enum(["IN_SCOPE", "AUDIT_READY", "CERTIFIED", "NOT_IN_SCOPE", "PLANNED"]),
  auditor:    z.string().max(160).optional(),
  lastAuditAt: z.string().optional(),
  nextAuditAt: z.string().optional(),
  notes:      z.string().max(1000).optional(),
});

export async function saveFramework(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = frameworkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=frameworks&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    status: d.status as ComplianceFrameworkStatus,
    auditor: d.auditor || null,
    lastAuditAt: d.lastAuditAt ? new Date(d.lastAuditAt) : null,
    nextAuditAt: d.nextAuditAt ? new Date(d.nextAuditAt) : null,
    notes: d.notes || null,
  };
  const saved = await db.complianceFramework.upsert({
    where: { key: d.key as ComplianceFrameworkKey },
    create: { key: d.key as ComplianceFrameworkKey, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.framework_saved",
    entityType: "ComplianceFramework", entityId: saved.id,
    metadata: { actor: ctx.email, key: d.key, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=frameworks&ok=framework-saved`);
}

/* ── Controls ──────────────────────────────────────────── */

const controlSchema = z.object({
  id:           z.string().optional(),
  externalId:   z.string().min(1).max(40),
  title:        z.string().min(1).max(200),
  description:  z.string().max(2000).optional(),
  domain:       z.enum([
    "ACCESS_CONTROL", "CHANGE_MANAGEMENT", "INCIDENT_RESPONSE", "BUSINESS_CONTINUITY",
    "VENDOR_MANAGEMENT", "DATA_PROTECTION", "CRYPTOGRAPHY", "RISK_MANAGEMENT",
    "SECURE_SDLC", "PHYSICAL_SECURITY", "HR_SECURITY", "MONITORING",
  ]),
  status:       z.enum(["PASSING", "FAILING", "NOT_APPLICABLE", "IN_REVIEW", "PENDING_EVIDENCE"]),
  ownerEmail:   z.string().email().optional().or(z.literal("")),
  testProcedure: z.string().max(2000).optional(),
  testFrequency: z.string().max(60).optional(),
  primaryFrameworkId: z.string().min(1),
  autoCheckEnabled:  z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveControl(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = controlSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=controls&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    title: d.title,
    description: d.description || null,
    domain: d.domain as ComplianceControlDomain,
    status: d.status as ComplianceControlStatus,
    ownerEmail: d.ownerEmail || null,
    testProcedure: d.testProcedure || null,
    testFrequency: d.testFrequency || null,
    primaryFrameworkId: d.primaryFrameworkId,
    autoCheckEnabled: d.autoCheckEnabled === "on",
  };
  const saved = await db.complianceControl.upsert({
    where: { externalId: d.externalId },
    create: { externalId: d.externalId, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.control_saved",
    entityType: "ComplianceControl", entityId: saved.id,
    metadata: { actor: ctx.email, externalId: d.externalId, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=controls&ok=control-saved`);
}

const controlStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(["PASSING", "FAILING", "NOT_APPLICABLE", "IN_REVIEW", "PENDING_EVIDENCE"]),
});

export async function setControlStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = controlStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=controls&error=Invalid`);
  const d = parsed.data;
  await db.complianceControl.update({
    where: { id: d.id },
    data: {
      status: d.status as ComplianceControlStatus,
      lastTestedAt: d.status === "PASSING" || d.status === "FAILING" ? new Date() : undefined,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.control_status_set",
    entityType: "ComplianceControl", entityId: d.id,
    metadata: { actor: ctx.email, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=controls&ok=status-updated`);
}

/* ── Evidence ──────────────────────────────────────────── */

const evidenceSchema = z.object({
  controlId:   z.string().min(1),
  title:       z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  source:      z.enum(["AUTO", "MANUAL"]),
  collector:   z.string().max(120).optional(),
  kind:        z.enum(["SCREENSHOT", "EXPORT", "LOG", "ATTESTATION", "CONFIG", "REPORT", "OTHER"]),
  fileUrl:     z.string().url().optional().or(z.literal("")),
});

export async function uploadEvidence(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_EVID);
  const parsed = evidenceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=evidence&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const created = await db.controlEvidence.create({
    data: {
      controlId: d.controlId,
      title: d.title,
      description: d.description || null,
      source: d.source as EvidenceSource,
      collector: d.collector || null,
      kind: d.kind as EvidenceKind,
      fileUrl: d.fileUrl || null,
      uploadedById: ctx.userId,
    },
  });
  // Bump cached count.
  await db.complianceControl.update({
    where: { id: d.controlId },
    data: { evidenceCount: { increment: 1 } },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.evidence_uploaded",
    entityType: "ControlEvidence", entityId: created.id,
    metadata: { actor: ctx.email, controlId: d.controlId, kind: d.kind },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=evidence&ok=evidence-uploaded`);
}

const deleteEvidenceSchema = z.object({ id: z.string().min(1) });

export async function deleteEvidence(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_EVID);
  const parsed = deleteEvidenceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=evidence&error=Invalid`);
  const ev = await db.controlEvidence.findUnique({ where: { id: parsed.data.id }, select: { controlId: true } });
  if (!ev) redirect(`${ROUTE}?tab=evidence&error=Not-found`);
  await db.controlEvidence.delete({ where: { id: parsed.data.id } });
  await db.complianceControl.update({
    where: { id: ev!.controlId },
    data: { evidenceCount: { decrement: 1 } },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.evidence_deleted",
    entityType: "ControlEvidence", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=evidence&ok=evidence-deleted`);
}

/* ── Policies ──────────────────────────────────────────── */

const policySchema = z.object({
  id:          z.string().optional(),
  slug:        z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "lowercase letters, digits, dashes"),
  title:       z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  body:        z.string().min(1),
  version:     z.string().min(1).max(20),
  status:      z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "RETIRED"]),
  ownerEmail:  z.string().email().optional().or(z.literal("")),
  distribution: z.string().max(200).optional(),
  nextReviewAt: z.string().optional(),
});

export async function savePolicy(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_POLICY);
  const parsed = policySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=policies&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const status = d.status as CompliancePolicyStatus;
  const data = {
    title: d.title,
    description: d.description || null,
    body: d.body,
    version: d.version,
    status,
    ownerEmail: d.ownerEmail || null,
    distribution: d.distribution || null,
    nextReviewAt: d.nextReviewAt ? new Date(d.nextReviewAt) : null,
    lastReviewedAt: status === "APPROVED" ? new Date() : undefined,
    lastApprovedAt: status === "APPROVED" ? new Date() : undefined,
  };
  const saved = await db.compliancePolicy.upsert({
    where: { slug: d.slug },
    create: { slug: d.slug, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.policy_saved",
    entityType: "CompliancePolicy", entityId: saved.id,
    metadata: { actor: ctx.email, slug: d.slug, version: d.version, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=policies&ok=policy-saved`);
}

const policyAckSchema = z.object({ policyId: z.string().min(1), policyVersion: z.string().min(1) });

export async function acknowledgePolicy(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_READ);
  const parsed = policyAckSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=policies&error=Invalid`);
  const d = parsed.data;
  await db.policyAcknowledgment.upsert({
    where: {
      policyId_userEmail_policyVersion: {
        policyId: d.policyId,
        userEmail: ctx.email,
        policyVersion: d.policyVersion,
      },
    },
    create: {
      policyId: d.policyId,
      userEmail: ctx.email,
      userName: null,
      policyVersion: d.policyVersion,
    },
    update: { acknowledgedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.policy_acknowledged",
    entityType: "CompliancePolicy", entityId: d.policyId,
    metadata: { actor: ctx.email, version: d.policyVersion },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=policies&ok=acknowledged`);
}

/* ── Sub-processors ────────────────────────────────────── */

const subProcessorSchema = z.object({
  id:           z.string().optional(),
  name:         z.string().min(1).max(120),
  purpose:      z.string().min(1).max(200),
  dataLocation: z.string().min(1).max(80),
  riskTier:     z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  websiteUrl:   z.string().url().optional().or(z.literal("")),
  privacyUrl:   z.string().url().optional().or(z.literal("")),
  dpaUrl:       z.string().url().optional().or(z.literal("")),
  dpaOnFile:    z.union([z.literal("on"), z.literal("")]).optional(),
  publiclyListed: z.union([z.literal("on"), z.literal("")]).optional(),
  certifications: z.string().optional(),
  notes:        z.string().max(500).optional(),
});

export async function saveSubProcessor(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = subProcessorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=sub-processors&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const certs = (d.certifications ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean) as SubProcessorCertification[];
  const data = {
    name: d.name,
    purpose: d.purpose,
    dataLocation: d.dataLocation,
    riskTier: d.riskTier as SubProcessorRiskTier,
    websiteUrl: d.websiteUrl || null,
    privacyUrl: d.privacyUrl || null,
    dpaUrl: d.dpaUrl || null,
    dpaOnFile: d.dpaOnFile === "on",
    publiclyListed: d.publiclyListed === "on",
    certifications: certs,
    notes: d.notes || null,
    lastReviewedAt: new Date(),
  };
  const saved = d.id
    ? await db.subProcessor.update({ where: { id: d.id }, data })
    : await db.subProcessor.create({ data });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.sub_processor_saved",
    entityType: "SubProcessor", entityId: saved.id,
    metadata: { actor: ctx.email, name: d.name, riskTier: d.riskTier },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=sub-processors&ok=sub-processor-saved`);
}

const deleteSubProcessorSchema = z.object({ id: z.string().min(1) });

export async function deleteSubProcessor(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteSubProcessorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=sub-processors&error=Invalid`);
  await db.subProcessor.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.sub_processor_deleted",
    entityType: "SubProcessor", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=sub-processors&ok=deleted`);
}

/* ── Tenant DPAs ───────────────────────────────────────── */

const dpaSchema = z.object({
  tenantId:        z.string().min(1),
  status:          z.enum([
    "NOT_REQUESTED", "REQUESTED", "PENDING_TENANT_SIGNATURE",
    "PENDING_COUNTERSIGNATURE", "SIGNED", "EXPIRED",
  ]),
  templateVersion: z.string().max(20).optional(),
  pdfUrl:          z.string().url().optional().or(z.literal("")),
  tenantSignerName:  z.string().max(160).optional(),
  tenantSignerEmail: z.string().email().optional().or(z.literal("")),
  tenantSignerTitle: z.string().max(120).optional(),
  notes:           z.string().max(500).optional(),
});

export async function saveTenantDpa(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = dpaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=dpas&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const status = d.status as DpaStatus;
  const now = new Date();
  const data = {
    status,
    templateVersion: d.templateVersion || null,
    pdfUrl: d.pdfUrl || null,
    tenantSignerName: d.tenantSignerName || null,
    tenantSignerEmail: d.tenantSignerEmail || null,
    tenantSignerTitle: d.tenantSignerTitle || null,
    notes: d.notes || null,
    requestedAt:     status === "REQUESTED" ? now : undefined,
    signedAt:        status === "SIGNED" ? now : undefined,
    countersignedAt: status === "SIGNED" ? now : undefined,
  };
  const saved = await db.tenantDpa.upsert({
    where: { tenantId: d.tenantId },
    create: { tenantId: d.tenantId, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.tenant_dpa_saved",
    entityType: "TenantDpa", entityId: saved.id,
    metadata: { actor: ctx.email, tenantId: d.tenantId, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=dpas&ok=dpa-saved`);
}

/* ── Risk register ─────────────────────────────────────── */

const riskSchema = z.object({
  id:           z.string().optional(),
  externalId:   z.string().min(1).max(40),
  title:        z.string().min(1).max(200),
  description:  z.string().max(2000).optional(),
  ownerEmail:   z.string().email().optional().or(z.literal("")),
  likelihood:   z.enum(["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"]),
  impact:       z.enum(["NEGLIGIBLE", "MINOR", "MODERATE", "MAJOR", "SEVERE"]),
  status:       z.enum(["IDENTIFIED", "PLANNED", "IN_PROGRESS", "MITIGATED", "ACCEPTED"]),
  mitigation:   z.string().max(2000).optional(),
  residualLikelihood: z.enum(["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"]).optional(),
  residualImpact:     z.enum(["NEGLIGIBLE", "MINOR", "MODERATE", "MAJOR", "SEVERE"]).optional(),
  controlExternalId:  z.string().max(40).optional(),
  nextReviewAt: z.string().optional(),
});

export async function saveRisk(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = riskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=risks&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const score = LIKELIHOOD_LABEL[d.likelihood as RiskLikelihood].rank
              * IMPACT_LABEL[d.impact as RiskImpact].rank;
  const residual = d.residualLikelihood && d.residualImpact
    ? LIKELIHOOD_LABEL[d.residualLikelihood as RiskLikelihood].rank
      * IMPACT_LABEL[d.residualImpact as RiskImpact].rank
    : 0;
  const data = {
    title: d.title,
    description: d.description || null,
    ownerEmail: d.ownerEmail || null,
    likelihood: d.likelihood as RiskLikelihood,
    impact: d.impact as RiskImpact,
    score,
    residualScore: residual,
    status: d.status as RiskMitigationStatus,
    mitigation: d.mitigation || null,
    controlExternalId: d.controlExternalId || null,
    nextReviewAt: d.nextReviewAt ? new Date(d.nextReviewAt) : null,
    reviewedAt: new Date(),
  };
  const saved = await db.riskRegisterItem.upsert({
    where: { externalId: d.externalId },
    create: { externalId: d.externalId, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.risk_saved",
    entityType: "RiskRegisterItem", entityId: saved.id,
    metadata: { actor: ctx.email, externalId: d.externalId, score, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=risks&ok=risk-saved`);
}

/* ── Vendor reviews ────────────────────────────────────── */

const vendorSchema = z.object({
  id:                 z.string().optional(),
  vendorName:         z.string().min(1).max(160),
  vendorUrl:          z.string().url().optional().or(z.literal("")),
  ownerEmail:         z.string().email().optional().or(z.literal("")),
  status:             z.enum([
    "PENDING_QUESTIONNAIRE", "IN_REVIEW", "APPROVED", "CONDITIONALLY_APPROVED",
    "REJECTED", "ARCHIVED",
  ]),
  region:             z.string().max(80).optional(),
  dataCategories:     z.string().optional(),
  certifications:     z.string().optional(),
  questionnaireBody:  z.string().max(20000).optional(),
  questionnaireScore: z.coerce.number().int().min(0).max(100).optional(),
  soc2Url:            z.string().url().optional().or(z.literal("")),
  contractUrl:        z.string().url().optional().or(z.literal("")),
  rejectedReason:     z.string().max(500).optional(),
  nextReviewAt:       z.string().optional(),
});

export async function saveVendorReview(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_VENDOR);
  const parsed = vendorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=vendors&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const dataCategories = (d.dataCategories ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const certs = (d.certifications ?? "").split(",").map((s) => s.trim()).filter(Boolean) as SubProcessorCertification[];
  const status = d.status as VendorReviewStatus;
  const data = {
    vendorName: d.vendorName,
    vendorUrl: d.vendorUrl || null,
    ownerEmail: d.ownerEmail || null,
    status,
    region: d.region || null,
    dataCategories,
    certifications: certs,
    questionnaireBody:  d.questionnaireBody || null,
    questionnaireScore: d.questionnaireScore ?? null,
    soc2Url: d.soc2Url || null,
    contractUrl: d.contractUrl || null,
    rejectedReason: d.rejectedReason || null,
    nextReviewAt: d.nextReviewAt ? new Date(d.nextReviewAt) : null,
    approvedAt: status === "APPROVED" || status === "CONDITIONALLY_APPROVED" ? new Date() : undefined,
  };
  const saved = d.id
    ? await db.vendorReview.update({ where: { id: d.id }, data })
    : await db.vendorReview.create({ data });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.vendor_review_saved",
    entityType: "VendorReview", entityId: saved.id,
    metadata: { actor: ctx.email, status: d.status, score: d.questionnaireScore ?? null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=vendors&ok=vendor-saved`);
}

/* ── Reports ───────────────────────────────────────────── */

const reportSchema = z.object({
  kind:        z.enum([
    "SOC2_TYPE_I_PACKAGE", "SOC2_TYPE_II_PACKAGE",
    "ISO_27001_STATEMENT_OF_APPLICABILITY", "GDPR_ARTICLE_30_RECORD",
    "HIPAA_RISK_ASSESSMENT", "PCI_DSS_AOC", "CUSTOM",
  ]),
  title:       z.string().min(1).max(200),
  frameworkId: z.string().optional().or(z.literal("")),
  periodStart: z.string().optional(),
  periodEnd:   z.string().optional(),
  notes:       z.string().max(1000).optional(),
});

export async function generateReport(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_REPORT);
  const parsed = reportSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=reports&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const created = await db.complianceReport.create({
    data: {
      kind: d.kind as ComplianceReportKind,
      title: d.title,
      frameworkId: d.frameworkId || null,
      periodStart: d.periodStart ? new Date(d.periodStart) : null,
      periodEnd: d.periodEnd ? new Date(d.periodEnd) : null,
      notes: d.notes || null,
      status: "GENERATING",
      generatedById: ctx.userId,
    },
  });
  // Simulate immediate completion — in production this would fan out
  // to a worker that bundles the PDF + ZIP.
  await db.complianceReport.update({
    where: { id: created.id },
    data: {
      status: "READY",
      pdfUrl: `https://docs.flowtora.com/audits/${created.id}.pdf`,
      zipUrl: `https://docs.flowtora.com/audits/${created.id}.zip`,
      bytes:  Math.floor(Math.random() * 5_000_000) + 1_000_000,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.compliance.report_generated",
    entityType: "ComplianceReport", entityId: created.id,
    metadata: { actor: ctx.email, kind: d.kind },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=reports&ok=report-generated`);
}
