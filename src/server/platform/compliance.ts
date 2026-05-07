// Page 51 — Compliance program data layer.
//
// Backs nine tabs: Frameworks, Controls, Evidence, Policies,
// Sub-Processors, DPAs, Risk Register, Vendor Reviews, Reports.

import { db } from "@/lib/db";
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
  ComplianceReportStatus,
} from "@prisma/client";

/* ── Labels & tone palettes ─────────────────────────────── */

export const FRAMEWORK_LABELS: Record<ComplianceFrameworkKey, string> = {
  SOC2_TYPE_II: "SOC 2 Type II",
  ISO_27001:    "ISO 27001",
  GDPR:         "GDPR",
  CCPA:         "CCPA / CPRA",
  HIPAA:        "HIPAA",
  PCI_DSS:      "PCI DSS",
  FERPA:        "FERPA",
  FEDRAMP:      "FedRAMP",
};

export const FRAMEWORK_STATUS_TONE: Record<
  ComplianceFrameworkStatus,
  { bg: string; fg: string; label: string }
> = {
  CERTIFIED:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Certified" },
  AUDIT_READY:  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Audit-ready" },
  IN_SCOPE:     { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "In scope" },
  PLANNED:      { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Planned" },
  NOT_IN_SCOPE: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Not in scope" },
};

export const CONTROL_STATUS_TONE: Record<
  ComplianceControlStatus,
  { bg: string; fg: string; label: string }
> = {
  PASSING:           { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Passing" },
  IN_REVIEW:         { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In review" },
  PENDING_EVIDENCE:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending evidence" },
  FAILING:           { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failing" },
  NOT_APPLICABLE:    { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "N/A" },
};

export const CONTROL_DOMAIN_LABEL: Record<ComplianceControlDomain, string> = {
  ACCESS_CONTROL:       "Access control",
  CHANGE_MANAGEMENT:    "Change mgmt",
  INCIDENT_RESPONSE:    "Incident response",
  BUSINESS_CONTINUITY:  "BCP / DR",
  VENDOR_MANAGEMENT:    "Vendor mgmt",
  DATA_PROTECTION:      "Data protection",
  CRYPTOGRAPHY:         "Cryptography",
  RISK_MANAGEMENT:      "Risk mgmt",
  SECURE_SDLC:          "Secure SDLC",
  PHYSICAL_SECURITY:    "Physical security",
  HR_SECURITY:          "HR security",
  MONITORING:           "Monitoring",
};

export const POLICY_STATUS_TONE: Record<
  CompliancePolicyStatus,
  { bg: string; fg: string; label: string }
> = {
  APPROVED:  { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Approved" },
  IN_REVIEW: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In review" },
  DRAFT:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Draft" },
  RETIRED:   { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Retired" },
};

export const RISK_TIER_TONE: Record<SubProcessorRiskTier, { bg: string; fg: string }> = {
  CRITICAL: { bg: "var(--rose-100)",   fg: "var(--rose-700)" },
  HIGH:     { bg: "var(--amber-100)",  fg: "var(--amber-700)" },
  MEDIUM:   { bg: "var(--sky-100)",    fg: "var(--sky-700)" },
  LOW:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
};

export const CERT_LABELS: Record<SubProcessorCertification, string> = {
  SOC2_TYPE_II:     "SOC 2",
  ISO_27001:        "ISO 27001",
  GDPR_DPA:         "GDPR DPA",
  PCI_DSS:          "PCI DSS",
  HIPAA_BAA:        "HIPAA BAA",
  FEDRAMP_MODERATE: "FedRAMP Mod",
  TRUSTED_CLOUD:    "Trusted Cloud",
  HITRUST:          "HITRUST",
};

export const DPA_STATUS_TONE: Record<DpaStatus, { bg: string; fg: string; label: string }> = {
  SIGNED:                   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Signed" },
  PENDING_COUNTERSIGNATURE: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Awaiting counter-sig" },
  PENDING_TENANT_SIGNATURE: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Awaiting tenant" },
  REQUESTED:                { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Requested" },
  EXPIRED:                  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Expired" },
  NOT_REQUESTED:            { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Not requested" },
};

export const LIKELIHOOD_LABEL: Record<RiskLikelihood, { label: string; rank: number }> = {
  RARE:           { label: "Rare",           rank: 1 },
  UNLIKELY:       { label: "Unlikely",       rank: 2 },
  POSSIBLE:       { label: "Possible",       rank: 3 },
  LIKELY:         { label: "Likely",         rank: 4 },
  ALMOST_CERTAIN: { label: "Almost certain", rank: 5 },
};

export const IMPACT_LABEL: Record<RiskImpact, { label: string; rank: number }> = {
  NEGLIGIBLE: { label: "Negligible", rank: 1 },
  MINOR:      { label: "Minor",      rank: 2 },
  MODERATE:   { label: "Moderate",   rank: 3 },
  MAJOR:      { label: "Major",      rank: 4 },
  SEVERE:     { label: "Severe",     rank: 5 },
};

export const RISK_STATUS_TONE: Record<RiskMitigationStatus, { bg: string; fg: string; label: string }> = {
  MITIGATED:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Mitigated" },
  ACCEPTED:     { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Accepted" },
  IN_PROGRESS:  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In progress" },
  PLANNED:      { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Planned" },
  IDENTIFIED:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Identified" },
};

export const VENDOR_STATUS_TONE: Record<VendorReviewStatus, { bg: string; fg: string; label: string }> = {
  APPROVED:               { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Approved" },
  CONDITIONALLY_APPROVED: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Conditional" },
  IN_REVIEW:              { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "In review" },
  PENDING_QUESTIONNAIRE:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending CAIQ" },
  REJECTED:               { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Rejected" },
  ARCHIVED:               { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Archived" },
};

export const REPORT_KIND_LABEL: Record<ComplianceReportKind, string> = {
  SOC2_TYPE_I_PACKAGE:                  "SOC 2 Type I package",
  SOC2_TYPE_II_PACKAGE:                 "SOC 2 Type II package",
  ISO_27001_STATEMENT_OF_APPLICABILITY: "ISO 27001 Statement of Applicability",
  GDPR_ARTICLE_30_RECORD:               "GDPR Article 30 Record",
  HIPAA_RISK_ASSESSMENT:                "HIPAA Risk Assessment",
  PCI_DSS_AOC:                          "PCI DSS Attestation of Compliance",
  CUSTOM:                               "Custom report",
};

export const REPORT_STATUS_TONE: Record<ComplianceReportStatus, { bg: string; fg: string; label: string }> = {
  READY:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Ready" },
  DELIVERED:  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Delivered" },
  GENERATING: { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Generating" },
  EXPIRED:    { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Expired" },
  FAILED:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface ComplianceKpis {
  frameworksTracked: number;
  frameworksCertified: number;
  controlsTotal: number;
  controlsPassing: number;
  controlsFailing: number;
  controlsPendingEvidence: number;
  policiesApproved: number;
  policiesNeedReview: number;
  openRisks: number;
  highResidualRisks: number;
  signedDpas: number;
  pendingDpas: number;
}

export async function loadComplianceKpis(): Promise<ComplianceKpis> {
  const [
    fwCounts,
    controlCounts,
    policyApproved,
    policyNeedReview,
    openRisks,
    highResidual,
    dpaSigned,
    dpaPending,
  ] = await Promise.all([
    db.complianceFramework.groupBy({ by: ["status"], _count: { _all: true } }),
    db.complianceControl.groupBy({ by: ["status"], _count: { _all: true } }),
    db.compliancePolicy.count({ where: { status: "APPROVED" } }),
    db.compliancePolicy.count({
      where: { OR: [{ status: "DRAFT" }, { status: "IN_REVIEW" }, { nextReviewAt: { lte: new Date() } }] },
    }),
    db.riskRegisterItem.count({ where: { status: { in: ["IDENTIFIED", "PLANNED", "IN_PROGRESS"] } } }),
    db.riskRegisterItem.count({ where: { residualScore: { gte: 12 } } }),
    db.tenantDpa.count({ where: { status: "SIGNED" } }),
    db.tenantDpa.count({
      where: { status: { in: ["REQUESTED", "PENDING_TENANT_SIGNATURE", "PENDING_COUNTERSIGNATURE"] } },
    }),
  ]);

  const fwMap = new Map<ComplianceFrameworkStatus, number>();
  for (const r of fwCounts) fwMap.set(r.status, r._count._all);
  const ctrlMap = new Map<ComplianceControlStatus, number>();
  for (const r of controlCounts) ctrlMap.set(r.status, r._count._all);

  const tracked = (fwMap.get("IN_SCOPE") ?? 0) + (fwMap.get("AUDIT_READY") ?? 0)
                + (fwMap.get("CERTIFIED") ?? 0) + (fwMap.get("PLANNED") ?? 0);
  const total = Array.from(ctrlMap.values()).reduce((s, n) => s + n, 0);
  return {
    frameworksTracked: tracked,
    frameworksCertified: fwMap.get("CERTIFIED") ?? 0,
    controlsTotal: total,
    controlsPassing: ctrlMap.get("PASSING") ?? 0,
    controlsFailing: ctrlMap.get("FAILING") ?? 0,
    controlsPendingEvidence: ctrlMap.get("PENDING_EVIDENCE") ?? 0,
    policiesApproved: policyApproved,
    policiesNeedReview: policyNeedReview,
    openRisks,
    highResidualRisks: highResidual,
    signedDpas: dpaSigned,
    pendingDpas: dpaPending,
  };
}

/* ── Frameworks tab ─────────────────────────────────────── */

export interface FrameworkCard {
  id: string;
  key: ComplianceFrameworkKey;
  name: string;
  status: ComplianceFrameworkStatus;
  auditor: string | null;
  lastAuditAt: Date | null;
  nextAuditAt: Date | null;
  passingPct: number;
  totalControls: number;
  passingCount: number;
  notes: string | null;
}

export async function loadFrameworks(): Promise<FrameworkCard[]> {
  const fws = await db.complianceFramework.findMany({
    orderBy: { key: "asc" },
    include: { _count: { select: { controls: true } } },
  });
  return fws.map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    status: f.status,
    auditor: f.auditor,
    lastAuditAt: f.lastAuditAt,
    nextAuditAt: f.nextAuditAt,
    passingPct: f.passingPct,
    totalControls: f._count.controls || f.totalControls,
    passingCount: f.passingCount,
    notes: f.notes,
  }));
}

/* ── Controls tab ───────────────────────────────────────── */

export interface ControlsFilters {
  q?: string;
  frameworkId?: string;
  status?: ComplianceControlStatus | "ALL";
  domain?: ComplianceControlDomain | "ALL";
  ownerEmail?: string;
}

export interface ControlRow {
  id: string;
  externalId: string;
  title: string;
  domain: ComplianceControlDomain;
  status: ComplianceControlStatus;
  ownerEmail: string | null;
  lastTestedAt: Date | null;
  nextTestAt: Date | null;
  evidenceCount: number;
  primaryFrameworkKey: ComplianceFrameworkKey;
  mappedFrameworks: ComplianceFrameworkKey[];
  autoCheckEnabled: boolean;
  autoCheckResult: string | null;
}

export async function loadControls(filters: ControlsFilters): Promise<ControlRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { externalId: { contains: filters.q, mode: "insensitive" } },
        { title:      { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.frameworkId)                          conditions.push({ primaryFrameworkId: filters.frameworkId });
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.domain && filters.domain !== "ALL") conditions.push({ domain: filters.domain });
  if (filters.ownerEmail)                          conditions.push({ ownerEmail: filters.ownerEmail });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const rows = await db.complianceControl.findMany({
    where,
    orderBy: [{ status: "asc" }, { externalId: "asc" }],
    take: 300,
    include: {
      primaryFramework: { select: { key: true } },
      mappings: { select: { frameworkKey: true } },
      _count: { select: { evidence: true } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    externalId: c.externalId,
    title: c.title,
    domain: c.domain,
    status: c.status,
    ownerEmail: c.ownerEmail,
    lastTestedAt: c.lastTestedAt,
    nextTestAt: c.nextTestAt,
    evidenceCount: c._count.evidence || c.evidenceCount,
    primaryFrameworkKey: c.primaryFramework.key,
    mappedFrameworks: c.mappings.map((m) => m.frameworkKey),
    autoCheckEnabled: c.autoCheckEnabled,
    autoCheckResult: c.autoCheckResult,
  }));
}

/* ── Evidence tab ───────────────────────────────────────── */

export interface EvidenceFilters {
  q?: string;
  controlId?: string;
  source?: EvidenceSource | "ALL";
  kind?: EvidenceKind | "ALL";
}

export interface EvidenceRow {
  id: string;
  title: string;
  description: string | null;
  source: EvidenceSource;
  kind: EvidenceKind;
  collector: string | null;
  fileUrl: string | null;
  fileBytes: number | null;
  collectedAt: Date;
  expiresAt: Date | null;
  controlExternalId: string;
  controlTitle: string;
}

export async function loadEvidence(filters: EvidenceFilters): Promise<EvidenceRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { title:       { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
        { collector:   { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.controlId)                          conditions.push({ controlId: filters.controlId });
  if (filters.source && filters.source !== "ALL") conditions.push({ source: filters.source });
  if (filters.kind && filters.kind !== "ALL")    conditions.push({ kind: filters.kind });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const rows = await db.controlEvidence.findMany({
    where,
    orderBy: { collectedAt: "desc" },
    take: 300,
    include: { control: { select: { externalId: true, title: true } } },
  });
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    source: e.source,
    kind: e.kind,
    collector: e.collector,
    fileUrl: e.fileUrl,
    fileBytes: e.fileBytes,
    collectedAt: e.collectedAt,
    expiresAt: e.expiresAt,
    controlExternalId: e.control.externalId,
    controlTitle: e.control.title,
  }));
}

/* ── Policies tab ───────────────────────────────────────── */

export interface PolicyRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  version: string;
  status: CompliancePolicyStatus;
  ownerEmail: string | null;
  lastApprovedAt: Date | null;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  distribution: string | null;
  ackCount: number;
}

export async function loadPolicies(staffCount: number): Promise<{ rows: PolicyRow[]; staffCount: number }> {
  const rows = await db.compliancePolicy.findMany({
    orderBy: { title: "asc" },
    include: { _count: { select: { acknowledgments: true } } },
  });
  return {
    rows: rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      version: p.version,
      status: p.status,
      ownerEmail: p.ownerEmail,
      lastApprovedAt: p.lastApprovedAt,
      lastReviewedAt: p.lastReviewedAt,
      nextReviewAt: p.nextReviewAt,
      distribution: p.distribution,
      ackCount: p._count.acknowledgments,
    })),
    staffCount,
  };
}

/* ── Sub-Processors tab ─────────────────────────────────── */

export interface SubProcessorRow {
  id: string;
  name: string;
  purpose: string;
  dataLocation: string;
  riskTier: SubProcessorRiskTier;
  websiteUrl: string | null;
  privacyUrl: string | null;
  dpaUrl: string | null;
  dpaOnFile: boolean;
  certifications: SubProcessorCertification[];
  publiclyListed: boolean;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  notes: string | null;
}

export async function loadSubProcessors(): Promise<SubProcessorRow[]> {
  const rows = await db.subProcessor.findMany({ orderBy: [{ riskTier: "asc" }, { name: "asc" }] });
  return rows.map((s) => ({
    id: s.id, name: s.name, purpose: s.purpose, dataLocation: s.dataLocation,
    riskTier: s.riskTier,
    websiteUrl: s.websiteUrl, privacyUrl: s.privacyUrl, dpaUrl: s.dpaUrl,
    dpaOnFile: s.dpaOnFile, certifications: s.certifications, publiclyListed: s.publiclyListed,
    lastReviewedAt: s.lastReviewedAt, nextReviewAt: s.nextReviewAt, notes: s.notes,
  }));
}

/* ── Tenant DPAs tab ────────────────────────────────────── */

export interface TenantDpaRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: DpaStatus;
  templateVersion: string | null;
  requestedAt: Date | null;
  signedAt: Date | null;
  countersignedAt: Date | null;
  expiresAt: Date | null;
  pdfUrl: string | null;
  tenantSignerName: string | null;
  tenantSignerEmail: string | null;
  notes: string | null;
}

export async function loadTenantDpas(): Promise<TenantDpaRow[]> {
  const rows = await db.tenantDpa.findMany({
    orderBy: { updatedAt: "desc" },
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  return rows.map((d) => ({
    id: d.id,
    tenantId: d.tenant.id,
    tenantName: d.tenant.name,
    tenantSlug: d.tenant.slug,
    status: d.status,
    templateVersion: d.templateVersion,
    requestedAt: d.requestedAt,
    signedAt: d.signedAt,
    countersignedAt: d.countersignedAt,
    expiresAt: d.expiresAt,
    pdfUrl: d.pdfUrl,
    tenantSignerName: d.tenantSignerName,
    tenantSignerEmail: d.tenantSignerEmail,
    notes: d.notes,
  }));
}

/* ── Risk register tab ──────────────────────────────────── */

export interface RiskRow {
  id: string;
  externalId: string;
  title: string;
  ownerEmail: string | null;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  score: number;
  residualScore: number;
  status: RiskMitigationStatus;
  mitigation: string | null;
  reviewedAt: Date | null;
  nextReviewAt: Date | null;
  controlExternalId: string | null;
}

export async function loadRisks(): Promise<RiskRow[]> {
  const rows = await db.riskRegisterItem.findMany({
    orderBy: [{ status: "asc" }, { score: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id, externalId: r.externalId, title: r.title, ownerEmail: r.ownerEmail,
    likelihood: r.likelihood, impact: r.impact, score: r.score, residualScore: r.residualScore,
    status: r.status, mitigation: r.mitigation, reviewedAt: r.reviewedAt, nextReviewAt: r.nextReviewAt,
    controlExternalId: r.controlExternalId,
  }));
}

/** Builds a 5×5 heatmap matrix where cell[i][j] = count of risks with
 *  likelihood rank (i+1) and impact rank (j+1). */
export function buildRiskHeatmap(rows: { likelihood: RiskLikelihood; impact: RiskImpact }[]): number[][] {
  const grid: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const r of rows) {
    const li = LIKELIHOOD_LABEL[r.likelihood].rank - 1;
    const ii = IMPACT_LABEL[r.impact].rank - 1;
    grid[li]![ii]! += 1;
  }
  return grid;
}

/* ── Vendor reviews tab ─────────────────────────────────── */

export interface VendorReviewRow {
  id: string;
  vendorName: string;
  vendorUrl: string | null;
  ownerEmail: string | null;
  status: VendorReviewStatus;
  dataCategories: string[];
  region: string | null;
  certifications: SubProcessorCertification[];
  questionnaireScore: number | null;
  approvedAt: Date | null;
  nextReviewAt: Date | null;
}

export async function loadVendorReviews(): Promise<VendorReviewRow[]> {
  const rows = await db.vendorReview.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((v) => ({
    id: v.id, vendorName: v.vendorName, vendorUrl: v.vendorUrl, ownerEmail: v.ownerEmail,
    status: v.status, dataCategories: v.dataCategories, region: v.region,
    certifications: v.certifications, questionnaireScore: v.questionnaireScore,
    approvedAt: v.approvedAt, nextReviewAt: v.nextReviewAt,
  }));
}

/* ── Reports tab ────────────────────────────────────────── */

export interface ReportRow {
  id: string;
  kind: ComplianceReportKind;
  title: string;
  status: ComplianceReportStatus;
  periodStart: Date | null;
  periodEnd: Date | null;
  pdfUrl: string | null;
  zipUrl: string | null;
  bytes: number | null;
  deliveredTo: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  frameworkKey: ComplianceFrameworkKey | null;
}

export async function loadReports(): Promise<ReportRow[]> {
  const rows = await db.complianceReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { framework: { select: { key: true } } },
  });
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, status: r.status,
    periodStart: r.periodStart, periodEnd: r.periodEnd,
    pdfUrl: r.pdfUrl, zipUrl: r.zipUrl, bytes: r.bytes,
    deliveredTo: r.deliveredTo, deliveredAt: r.deliveredAt,
    createdAt: r.createdAt,
    frameworkKey: r.framework?.key ?? null,
  }));
}

/* ── Helpers ───────────────────────────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadCompliancePage() {
  const staffCount = await db.user.count({ where: { platformRole: { not: null } } });
  const [
    kpis, frameworks, controls, evidence, policies,
    subProcessors, dpas, risks, vendors, reports,
  ] = await Promise.all([
    loadComplianceKpis(),
    loadFrameworks(),
    loadControls({}),
    loadEvidence({}),
    loadPolicies(staffCount),
    loadSubProcessors(),
    loadTenantDpas(),
    loadRisks(),
    loadVendorReviews(),
    loadReports(),
  ]);
  return { kpis, frameworks, controls, evidence, policies, subProcessors, dpas, risks, vendors, reports, staffCount };
}
