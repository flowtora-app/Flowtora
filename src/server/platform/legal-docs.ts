// Page 71 — Legal Documents data layer.

import { db } from "@/lib/db";
import type {
  LegalDocumentKind,
  LegalDocumentStatus,
  LegalAcceptanceMethod,
} from "@prisma/client";

export const KIND_LABEL: Record<LegalDocumentKind, string> = {
  TERMS_OF_SERVICE:           "Terms of Service",
  PRIVACY_POLICY:             "Privacy Policy",
  ACCEPTABLE_USE_POLICY:      "Acceptable Use Policy",
  DPA:                        "Data Processing Addendum",
  SUB_PROCESSOR_ADDENDUM:     "Sub-Processor Addendum",
  SLA:                        "Service Level Agreement",
  COOKIE_POLICY:              "Cookie Policy",
  COOKIE_CONSENT_CATEGORIES:  "Cookie Consent Categories",
  REFUND_POLICY:              "Refund Policy",
  ANTI_SPAM_POLICY:           "Anti-Spam Policy",
  MASTER_SERVICE_AGREEMENT:   "Master Service Agreement",
  ORDER_FORM_TEMPLATE:        "Order Form Template",
  RESELLER_AGREEMENT:         "Reseller Agreement",
  AFFILIATE_AGREEMENT:        "Affiliate Agreement",
  MARKETPLACE_DEV_AGREEMENT:  "Marketplace Developer Agreement",
};

export const KIND_ORDER: LegalDocumentKind[] = [
  "TERMS_OF_SERVICE", "PRIVACY_POLICY", "ACCEPTABLE_USE_POLICY",
  "DPA", "SUB_PROCESSOR_ADDENDUM", "SLA",
  "COOKIE_POLICY", "COOKIE_CONSENT_CATEGORIES",
  "REFUND_POLICY", "ANTI_SPAM_POLICY",
  "MASTER_SERVICE_AGREEMENT", "ORDER_FORM_TEMPLATE",
  "RESELLER_AGREEMENT", "AFFILIATE_AGREEMENT", "MARKETPLACE_DEV_AGREEMENT",
];

export const STATUS_TONE: Record<
  LegalDocumentStatus,
  { bg: string; fg: string; label: string; description: string }
> = {
  DRAFT: {
    bg: "var(--surface-2)", fg: "var(--text-muted)",
    label: "Draft", description: "Authoring in progress."
  },
  LEGAL_REVIEW: {
    bg: "var(--amber-100)", fg: "var(--amber-700)",
    label: "Legal review", description: "With the legal team for review."
  },
  COUNSEL_SIGN_OFF: {
    bg: "var(--violet-100)", fg: "var(--violet-700)",
    label: "Counsel sign-off", description: "Awaiting General Counsel approval."
  },
  PUBLISHED: {
    bg: "var(--emerald-100)", fg: "var(--emerald-700)",
    label: "Published", description: "Active version — what tenants accept."
  },
  ARCHIVED: {
    bg: "var(--rose-100)", fg: "var(--rose-700)",
    label: "Archived", description: "Superseded by a newer version."
  },
};

export const METHOD_LABEL: Record<LegalAcceptanceMethod, string> = {
  CLICKWRAP:          "Clickwrap",
  EMAIL_CONFIRMATION: "Email confirmation",
  SIGNED_PDF:         "Signed PDF",
  API:                "API",
};

/* ── Loaders ──────────────────────────────────────────── */

export async function loadDocuments() {
  return db.legalDocument.findMany({
    orderBy: [{ kind: "asc" }],
  });
}

export async function loadDocumentDetail(slug: string) {
  return db.legalDocument.findUnique({
    where: { slug },
    include: {
      versions: { orderBy: { version: "desc" } },
      locales:  { orderBy: { locale: "asc" } },
    },
  });
}

export async function loadAcceptances(args?: {
  documentId?: string;
  version?: number;
  tenantId?: string;
  sinceDays?: number;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (args?.documentId) where.documentId = args.documentId;
  if (args?.version !== undefined) where.version = args.version;
  if (args?.tenantId) where.tenantId = args.tenantId;
  if (args?.sinceDays) where.acceptedAt = { gte: new Date(Date.now() - args.sinceDays * 86_400_000) };
  return db.legalDocumentAcceptance.findMany({
    where,
    orderBy: { acceptedAt: "desc" },
    take: Math.min(args?.limit ?? 200, 1000),
  });
}

export async function loadActiveReacceptances() {
  return db.mandatoryReAcceptance.findMany({
    where: { activatedAt: { not: null }, closedAt: null },
    orderBy: { activatedAt: "desc" },
  });
}

export async function loadLegalSettings() {
  let row = await db.legalSettings.findUnique({ where: { id: "default" } });
  if (!row) row = await db.legalSettings.create({ data: { id: "default" } });
  return row;
}

/* ── KPIs ─────────────────────────────────────────────── */

export interface LegalKpis {
  totalDocs: number;
  publishedCount: number;
  draftCount: number;
  reviewCount: number;
  acceptances30d: number;
  reacceptsPending: number;
  staleLocales: number;
}

export async function loadLegalKpis(): Promise<LegalKpis> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [docs, versions, accepts, reaccepts, locales] = await Promise.all([
    db.legalDocument.findMany({ select: { id: true, publishedAt: true, pendingReacceptCount: true } }),
    db.legalDocumentVersion.findMany({ select: { status: true } }),
    db.legalDocumentAcceptance.count({ where: { acceptedAt: { gte: since } } }),
    db.mandatoryReAcceptance.count({ where: { activatedAt: { not: null }, closedAt: null } }),
    db.legalDocumentLocale.findMany({ select: { completenessPct: true } }),
  ]);
  return {
    totalDocs:        docs.length,
    publishedCount:   docs.filter((d) => d.publishedAt).length,
    draftCount:       versions.filter((v) => v.status === "DRAFT").length,
    reviewCount:      versions.filter((v) => v.status === "LEGAL_REVIEW" || v.status === "COUNSEL_SIGN_OFF").length,
    acceptances30d:   accepts,
    reacceptsPending: reaccepts,
    staleLocales:     locales.filter((l) => l.completenessPct < 95).length,
  };
}

/* ── Helpers ──────────────────────────────────────────── */

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

export async function loadLegalPage() {
  const [kpis, documents, reaccepts, settings] = await Promise.all([
    loadLegalKpis(),
    loadDocuments(),
    loadActiveReacceptances(),
    loadLegalSettings(),
  ]);
  return { kpis, documents, reaccepts, settings };
}
