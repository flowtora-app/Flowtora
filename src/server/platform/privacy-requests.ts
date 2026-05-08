// Page 52 — Data Privacy Requests data layer (GDPR / CCPA / etc.).

import { db } from "@/lib/db";
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

const DAY = 86_400_000;

/* ── Labels & tone palettes ─────────────────────────────── */

export const TYPE_LABEL: Record<PrivacyRequestType, string> = {
  ACCESS_EXPORT:    "Access / Export",
  DELETION:         "Deletion (Erasure)",
  RECTIFICATION:    "Rectification",
  RESTRICTION:      "Restriction",
  OBJECTION:        "Objection",
  PORTABILITY:      "Portability",
  OPT_OUT_OF_SALE:  "Opt-Out of Sale",
};

export const JURISDICTION_LABEL: Record<PrivacyJurisdiction, string> = {
  GDPR:    "GDPR (EU)",
  UK_GDPR: "UK GDPR",
  CCPA:    "CCPA",
  CPRA:    "CPRA",
  LGPD:    "LGPD (BR)",
  PIPEDA:  "PIPEDA (CA)",
  OTHER:   "Other",
};

export const SOURCE_LABEL: Record<PrivacyRequestSource, string> = {
  TENANT_PORTAL: "Tenant portal",
  EMAIL:         "Email",
  WEB_FORM:      "Web form",
  PHONE:         "Phone",
  API:           "API",
};

export const STATUS_TONE: Record<
  PrivacyRequestStatus,
  { bg: string; fg: string; label: string }
> = {
  RECEIVED:                  { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Received" },
  AWAITING_VERIFICATION:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Awaiting verification" },
  VERIFIED:                  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Verified" },
  IN_PROGRESS:               { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In progress" },
  AWAITING_LEGAL_HOLD_REVIEW:{ bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Legal hold review" },
  AWAITING_SUBJECT_INFO:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Awaiting subject info" },
  COMPLETED:                 { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Completed" },
  REJECTED:                  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Rejected" },
  WITHDRAWN:                 { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Withdrawn" },
};

export const VERIFICATION_TONE: Record<
  PrivacyVerificationStatus,
  { bg: string; fg: string; label: string }
> = {
  VERIFIED: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Verified" },
  PENDING:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  FAILED:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  WAIVED:   { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Waived" },
};

export const VERIFICATION_METHOD_LABEL: Record<PrivacyVerificationMethod, string> = {
  ID_UPLOAD:           "ID upload",
  EMAIL_LINK:          "Email link",
  MFA_CHALLENGE:       "MFA challenge",
  SECURITY_QUESTIONS:  "Security questions",
  VIDEO_CALL:          "Video call",
  KNOWN_AUTH_SESSION:  "Auth session",
};

export const SCOPE_SYSTEM_LABEL: Record<PrivacyScopeSystem, string> = {
  POSTGRES:       "PostgreSQL (primary)",
  S3:             "S3 (proofs/exports)",
  STRIPE:         "Stripe",
  RESEND:         "Resend (email logs)",
  SENTRY:         "Sentry",
  AUDIT_LOG:      "Audit log",
  TENANT_CACHE:   "Tenant cache",
  SUPPORT_INBOX:  "Support inbox",
  ANALYTICS:      "Analytics",
  WEBHOOKS:       "Webhook delivery log",
  OTHER:          "Other",
};

export const SCOPE_STATUS_TONE: Record<
  PrivacyScopeStatus,
  { bg: string; fg: string; label: string }
> = {
  COMPLETE: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Complete" },
  RUNNING:  { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Running" },
  PENDING:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  FAILED:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  SKIPPED:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Skipped" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface PrivacyKpis {
  inbox: number;
  inProgress: number;
  awaitingVerification: number;
  completedThisMonth: number;
  overdue: number;
  averageMttcDays: number | null;   // Mean time to complete
  byType: { type: PrivacyRequestType; count: number }[];
}

export async function loadPrivacyKpis(): Promise<PrivacyKpis> {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const now = new Date();
  const [inbox, inProgress, awaitingVer, completedMonth, overdue, recent, typeAgg] = await Promise.all([
    db.privacyRequest.count({ where: { status: "RECEIVED" } }),
    db.privacyRequest.count({ where: { status: { in: ["IN_PROGRESS", "VERIFIED", "AWAITING_LEGAL_HOLD_REVIEW", "AWAITING_SUBJECT_INFO"] } } }),
    db.privacyRequest.count({ where: { status: "AWAITING_VERIFICATION" } }),
    db.privacyRequest.count({ where: { status: "COMPLETED", completedAt: { gte: monthStart } } }),
    db.privacyRequest.count({
      where: {
        status: { notIn: ["COMPLETED", "REJECTED", "WITHDRAWN"] },
        slaDeadline: { lt: now },
      },
    }),
    db.privacyRequest.findMany({
      where: { status: "COMPLETED", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take: 30,
      select: { receivedAt: true, completedAt: true },
    }),
    db.privacyRequest.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);

  const mttc = recent.length === 0 ? null : Math.round(
    recent.reduce((s, r) => s + Math.max(0, ((r.completedAt!.getTime() - r.receivedAt.getTime()) / DAY)), 0) / recent.length,
  );

  return {
    inbox,
    inProgress,
    awaitingVerification: awaitingVer,
    completedThisMonth: completedMonth,
    overdue,
    averageMttcDays: mttc,
    byType: typeAgg.map((r) => ({ type: r.type, count: r._count._all })),
  };
}

/* ── List filters / rows ────────────────────────────────── */

export type ListTab = "inbox" | "in_progress" | "awaiting_verification" | "completed" | "rejected" | "all";

export interface ListFilters {
  q?: string;
  type?: PrivacyRequestType | "ALL";
  jurisdiction?: PrivacyJurisdiction | "ALL";
  source?: PrivacyRequestSource | "ALL";
  tenantId?: string;
  assignedToId?: string;
  status?: PrivacyRequestStatus | "ALL";
  verification?: PrivacyVerificationStatus | "ALL";
  /** "ALL" / "OVERDUE" / "DUE_24H" / "OK". */
  slaBucket?: "ALL" | "OVERDUE" | "DUE_24H" | "DUE_7D" | "OK";
}

export interface RequestListRow {
  id: string;
  externalId: string;
  type: PrivacyRequestType;
  jurisdiction: PrivacyJurisdiction;
  source: PrivacyRequestSource;
  status: PrivacyRequestStatus;
  subjectName: string;
  subjectEmail: string;
  tenantName: string | null;
  tenantSlug: string | null;
  verificationStatus: PrivacyVerificationStatus;
  slaDeadline: Date;
  slaRemainingHours: number;
  receivedAt: Date;
  assignedToEmail: string | null;
  assignedToName: string | null;
}

function tabToWhere(tab: ListTab): Record<string, unknown> {
  switch (tab) {
    case "inbox":                 return { status: "RECEIVED" };
    case "awaiting_verification": return { status: "AWAITING_VERIFICATION" };
    case "in_progress":           return {
      status: { in: ["VERIFIED", "IN_PROGRESS", "AWAITING_LEGAL_HOLD_REVIEW", "AWAITING_SUBJECT_INFO"] },
    };
    case "completed":             return { status: "COMPLETED" };
    case "rejected":              return { status: { in: ["REJECTED", "WITHDRAWN"] } };
    case "all":                   return {};
  }
}

export async function loadRequestList(
  tab: ListTab,
  filters: ListFilters,
): Promise<RequestListRow[]> {
  const conditions: Record<string, unknown>[] = [tabToWhere(tab)];
  if (filters.q) {
    conditions.push({
      OR: [
        { externalId:   { contains: filters.q, mode: "insensitive" } },
        { subjectEmail: { contains: filters.q, mode: "insensitive" } },
        { subjectName:  { contains: filters.q, mode: "insensitive" } },
        { subjectIdentifier: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.type && filters.type !== "ALL")                 conditions.push({ type: filters.type });
  if (filters.jurisdiction && filters.jurisdiction !== "ALL") conditions.push({ jurisdiction: filters.jurisdiction });
  if (filters.source && filters.source !== "ALL")             conditions.push({ source: filters.source });
  if (filters.tenantId)                                        conditions.push({ tenantId: filters.tenantId });
  if (filters.assignedToId)                                    conditions.push({ assignedToId: filters.assignedToId });
  if (filters.status && filters.status !== "ALL")             conditions.push({ status: filters.status });
  if (filters.verification && filters.verification !== "ALL") conditions.push({ verificationStatus: filters.verification });
  const now = new Date();
  if (filters.slaBucket === "OVERDUE")  conditions.push({ slaDeadline: { lt: now } });
  if (filters.slaBucket === "DUE_24H")  conditions.push({ slaDeadline: { gte: now, lt: new Date(now.getTime() + DAY) } });
  if (filters.slaBucket === "DUE_7D")   conditions.push({ slaDeadline: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } });
  if (filters.slaBucket === "OK")       conditions.push({ slaDeadline: { gte: new Date(now.getTime() + 7 * DAY) } });

  const rows = await db.privacyRequest.findMany({
    where: { AND: conditions },
    orderBy: [{ slaDeadline: "asc" }],
    take: 200,
    include: {
      tenant: { select: { name: true, slug: true } },
      assignedTo: { select: { email: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    externalId: r.externalId,
    type: r.type,
    jurisdiction: r.jurisdiction,
    source: r.source,
    status: r.status,
    subjectName: r.subjectName,
    subjectEmail: r.subjectEmail,
    tenantName: r.tenant?.name ?? null,
    tenantSlug: r.tenant?.slug ?? null,
    verificationStatus: r.verificationStatus,
    slaDeadline: r.slaDeadline,
    slaRemainingHours: Math.round((r.slaDeadline.getTime() - now.getTime()) / 3_600_000),
    receivedAt: r.receivedAt,
    assignedToEmail: r.assignedTo?.email ?? null,
    assignedToName: r.assignedTo?.name ?? null,
  }));
}

/* ── Detail loader ─────────────────────────────────────── */

export async function loadRequestDetail(id: string) {
  const r = await db.privacyRequest.findUnique({
    where: { id },
    include: {
      tenant:       { select: { id: true, name: true, slug: true } },
      assignedTo:   { select: { id: true, email: true, name: true } },
      verifications: { orderBy: { createdAt: "desc" } },
      scopeResults: { orderBy: { system: "asc" } },
      messages:     { orderBy: { occurredAt: "desc" } },
      auditEntries: { orderBy: { occurredAt: "desc" }, take: 100 },
    },
  });
  if (!r) return null;
  const now = new Date();
  return {
    id: r.id,
    externalId: r.externalId,
    type: r.type,
    jurisdiction: r.jurisdiction,
    source: r.source,
    status: r.status,
    subjectName: r.subjectName,
    subjectEmail: r.subjectEmail,
    subjectIdentifier: r.subjectIdentifier,
    tenant: r.tenant,
    verificationStatus: r.verificationStatus,
    slaDays: r.slaDays,
    slaDeadline: r.slaDeadline,
    slaRemainingHours: Math.round((r.slaDeadline.getTime() - now.getTime()) / 3_600_000),
    legalHold: r.legalHold,
    legalHoldReason: r.legalHoldReason,
    intakeNotes: r.intakeNotes,
    internalNotes: r.internalNotes,
    finalReportUrl: r.finalReportUrl,
    exportBundleUrl: r.exportBundleUrl,
    exportBundleExpiresAt: r.exportBundleExpiresAt,
    exportGenerated: r.exportGenerated,
    rejectedReason: r.rejectedReason,
    assignedTo: r.assignedTo,
    receivedAt: r.receivedAt,
    verifiedAt: r.verifiedAt,
    completedAt: r.completedAt,
    rejectedAt: r.rejectedAt,
    verifications: r.verifications,
    scopeResults: r.scopeResults,
    messages: r.messages,
    auditEntries: r.auditEntries,
  };
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

export function slaBadgeTone(remainingHours: number): "good" | "warning" | "danger" {
  if (remainingHours < 0)   return "danger";
  if (remainingHours < 72)  return "warning";
  return "good";
}

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadPrivacyPage(tab: ListTab, filters: ListFilters) {
  const [kpis, rows, tenants, staff] = await Promise.all([
    loadPrivacyKpis(),
    loadRequestList(tab, filters),
    db.tenant.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { platformRole: { not: null } },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
      take: 50,
    }),
  ]);
  return { kpis, rows, tenants, staff };
}
