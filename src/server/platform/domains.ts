// Page 70 — Domain Management data layer.

import { db } from "@/lib/db";
import type {
  CustomDomainStatus,
  CustomDomainType,
  SslIssuer,
  SslCertStatus,
  AcmeChallengeType,
} from "@prisma/client";

const DAY = 86_400_000;

export const STATUS_TONE: Record<
  CustomDomainStatus,
  { bg: string; fg: string; label: string }
> = {
  PENDING_DNS: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending DNS" },
  VERIFYING:   { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Verifying" },
  ISSUING_SSL: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Issuing SSL" },
  ACTIVE:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  EXPIRING:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Expiring" },
  FAILED:      { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  DISABLED:    { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Disabled" },
};

export const ISSUER_LABEL: Record<SslIssuer, string> = {
  LETS_ENCRYPT: "Let's Encrypt",
  ZEROSSL:      "ZeroSSL",
  GOOGLE_TRUST_SERVICES: "Google Trust Services",
  CUSTOM_UPLOAD: "Custom upload",
};

export const CERT_STATUS_TONE: Record<
  SslCertStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  PENDING:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  EXPIRING: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Expiring" },
  EXPIRED:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Expired" },
  REVOKED:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Revoked" },
  FAILED:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
};

export const CHALLENGE_LABEL: Record<AcmeChallengeType, string> = {
  HTTP_01: "HTTP-01 (file challenge)",
  DNS_01:  "DNS-01 (TXT challenge)",
};

/* ── Loaders ──────────────────────────────────────────── */

export async function loadDomains(args?: {
  status?: CustomDomainStatus;
  type?: CustomDomainType;
  tenantId?: string;
  expiringWithinDays?: number;
}) {
  const where: Record<string, unknown> = {};
  if (args?.status)   where.status = args.status;
  if (args?.type)     where.type   = args.type;
  if (args?.tenantId) where.tenantId = args.tenantId;
  if (args?.expiringWithinDays) {
    where.sslExpiresAt = { lte: new Date(Date.now() + args.expiringWithinDays * DAY) };
  }
  return db.customDomain.findMany({
    where,
    include: { tenant: { select: { id: true, slug: true, name: true } } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
}

export async function loadDomainDetail(id: string) {
  return db.customDomain.findUnique({
    where: { id },
    include: {
      tenant: true,
      certs: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function loadDnsTemplates() {
  return db.dnsTemplate.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function loadApexGuides() {
  return db.apexSetupGuide.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function loadCerts() {
  return db.customDomainCert.findMany({
    orderBy: [{ expiresAt: "asc" }],
    include: { domain: { select: { domain: true, tenantId: true } } },
  });
}

export async function loadDomainSettings() {
  let row = await db.domainSettings.findUnique({ where: { id: "default" } });
  if (!row) row = await db.domainSettings.create({ data: { id: "default" } });
  return row;
}

/* ── KPIs ─────────────────────────────────────────────── */

export interface DomainKpis {
  total: number;
  active: number;
  pending: number;
  failed: number;
  expiringSoon: number;       // within 30 days
  apexCount: number;
  subdomainCount: number;
}

export async function loadDomainKpis(): Promise<DomainKpis> {
  const all = await db.customDomain.findMany({
    select: { status: true, type: true, sslExpiresAt: true },
  });
  const now = Date.now();
  return {
    total: all.length,
    active:        all.filter((d) => d.status === "ACTIVE").length,
    pending:       all.filter((d) => ["PENDING_DNS", "VERIFYING", "ISSUING_SSL"].includes(d.status)).length,
    failed:        all.filter((d) => d.status === "FAILED").length,
    expiringSoon:  all.filter((d) => d.sslExpiresAt && d.sslExpiresAt.getTime() - now < 30 * DAY).length,
    apexCount:     all.filter((d) => d.type === "APEX").length,
    subdomainCount:all.filter((d) => d.type === "SUBDOMAIN").length,
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

export function daysUntil(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.round((d.getTime() - Date.now()) / DAY);
}

export async function loadDomainsPage() {
  const [kpis, domains, certs, templates, guides, settings] = await Promise.all([
    loadDomainKpis(),
    loadDomains(),
    loadCerts(),
    loadDnsTemplates(),
    loadApexGuides(),
    loadDomainSettings(),
  ]);
  return { kpis, domains, certs, templates, guides, settings };
}
