// Page 58 — Email Deliverability data layer.

import { db } from "@/lib/db";
import type {
  EmailVolumeKind,
  EmailBounceType,
  EmailBounceStatus,
  EmailSuppressionSource,
  DomainAuthStatus,
  EmailProviderRole,
  EmailProviderHealth,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const BOUNCE_TYPE_LABEL: Record<EmailBounceType, string> = {
  HARD:    "Hard",
  SOFT:    "Soft",
  BLOCK:   "Block",
  CONTENT: "Content",
  UNKNOWN: "Unknown",
};

export const BOUNCE_TYPE_TONE: Record<
  EmailBounceType,
  { bg: string; fg: string }
> = {
  HARD:    { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  SOFT:    { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  BLOCK:   { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  CONTENT: { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  UNKNOWN: { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
};

export const BOUNCE_STATUS_TONE: Record<
  EmailBounceStatus,
  { bg: string; fg: string; label: string }
> = {
  OPEN:           { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Open" },
  SUPPRESSED:     { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Suppressed" },
  INVESTIGATING:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Investigating" },
  RESOLVED:       { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Resolved" },
};

export const SUPPRESSION_SOURCE_LABEL: Record<EmailSuppressionSource, string> = {
  BOUNCE:       "Bounce",
  COMPLAINT:    "Complaint",
  MANUAL:       "Manual",
  CSV_IMPORT:   "CSV import",
  GDPR_REQUEST: "GDPR request",
};

export const AUTH_STATUS_TONE: Record<
  DomainAuthStatus,
  { bg: string; fg: string; label: string }
> = {
  PASS:         { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Pass" },
  WARN:         { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Warn" },
  FAIL:         { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Fail" },
  UNCONFIGURED: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Unconfigured" },
};

export const PROVIDER_ROLE_TONE: Record<
  EmailProviderRole,
  { bg: string; fg: string; label: string }
> = {
  PRIMARY:       { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Primary" },
  BACKUP:        { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Backup" },
  BULK:          { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Bulk" },
  TRANSACTIONAL: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Transactional" },
  DISABLED:      { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Disabled" },
};

export const PROVIDER_HEALTH_TONE: Record<
  EmailProviderHealth,
  { bg: string; fg: string; label: string }
> = {
  HEALTHY:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Healthy" },
  DEGRADED:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Degraded" },
  WARNING:   { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Warning" },
  OFFLINE:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Offline" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface EmailKpis {
  sent24h: number;
  delivered24h: number;
  opens24h: number;
  clicks24h: number;
  bounces24h: number;
  complaints24h: number;
  unsubscribes24h: number;
  bouncePct: number;
  complaintPct: number;
  bounceTargetPct: number;
  complaintTargetPct: number;
  /** Roll-up domain auth grade. */
  domainGrade: "A+" | "A" | "B" | "C" | "F";
  domains: number;
  passDomains: number;
  suppressionCount: number;
}

export async function loadEmailKpis(): Promise<EmailKpis> {
  const since24 = new Date(Date.now() - DAY);
  const [byKind, settings, domains, suppression] = await Promise.all([
    db.emailVolumeSample.groupBy({
      by: ["kind"],
      where: { day: { gte: since24 } },
      _sum: { count: true },
    }),
    db.emailDeliverabilitySettings.findUnique({ where: { id: "default" } }),
    db.emailSendingDomain.findMany({
      select: { spfStatus: true, dkimStatus: true, dmarcStatus: true, bimiStatus: true },
    }),
    db.emailSuppression.count(),
  ]);
  const kindMap = new Map<EmailVolumeKind, number>();
  for (const r of byKind) kindMap.set(r.kind, r._sum.count ?? 0);
  const sent      = kindMap.get("SENT")        ?? 0;
  const delivered = kindMap.get("DELIVERED")   ?? sent;
  const opens     = kindMap.get("OPEN")        ?? 0;
  const clicks    = kindMap.get("CLICK")       ?? 0;
  const bounces   = kindMap.get("BOUNCE")      ?? 0;
  const complaints = kindMap.get("COMPLAINT")  ?? 0;
  const unsubs    = kindMap.get("UNSUBSCRIBE") ?? 0;
  const bouncePct    = sent === 0 ? 0 : Math.round((bounces / sent)    * 10000) / 100;
  const complaintPct = sent === 0 ? 0 : Math.round((complaints / sent) * 10000) / 100;

  // Domain rollup grade.
  const total = domains.length || 1;
  let passes = 0;
  for (const d of domains) {
    if (d.spfStatus  === "PASS") passes++;
    if (d.dkimStatus === "PASS") passes++;
    if (d.dmarcStatus === "PASS") passes++;
    if (d.bimiStatus === "PASS") passes++;
  }
  const score = passes / (total * 4); // 0..1
  const domainGrade: EmailKpis["domainGrade"] =
    score >= 0.95 ? "A+" :
    score >= 0.85 ? "A"  :
    score >= 0.70 ? "B"  :
    score >= 0.50 ? "C"  :
                    "F";

  return {
    sent24h: sent, delivered24h: delivered,
    opens24h: opens, clicks24h: clicks,
    bounces24h: bounces, complaints24h: complaints, unsubscribes24h: unsubs,
    bouncePct, complaintPct,
    bounceTargetPct:    settings?.bounceTargetPct ?? 2.0,
    complaintTargetPct: settings?.complaintTargetPct ?? 0.1,
    domainGrade,
    domains: domains.length,
    passDomains: domains.filter((d) =>
      d.spfStatus === "PASS" && d.dkimStatus === "PASS" && d.dmarcStatus === "PASS",
    ).length,
    suppressionCount: suppression,
  };
}

/* ── Volume time-series ────────────────────────────────── */

export async function loadVolumeSeries(days: number) {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.emailVolumeSample.findMany({
    where: { day: { gte: since } },
    orderBy: { day: "asc" },
  });
  // Build per-day map.
  const map = new Map<string, Record<EmailVolumeKind, number>>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    if (!map.has(key)) {
      map.set(key, {
        SENT: 0, DELIVERED: 0, OPEN: 0, CLICK: 0,
        BOUNCE: 0, COMPLAINT: 0, UNSUBSCRIBE: 0,
      });
    }
    const cur = map.get(key)!;
    cur[r.kind] = (cur[r.kind] ?? 0) + r.count;
  }
  return Array.from(map.entries()).map(([day, counts]) => ({ day, ...counts }));
}

/* ── Bounces / Complaints ──────────────────────────────── */

export interface BounceFilters {
  q?: string;
  type?: EmailBounceType | "ALL";
  provider?: string;
  status?: EmailBounceStatus | "ALL";
}

export async function loadBounces(filters: BounceFilters, limit = 200) {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { recipient: { contains: filters.q, mode: "insensitive" } },
        { reason:    { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.type     && filters.type     !== "ALL") conditions.push({ type: filters.type });
  if (filters.provider)                                conditions.push({ provider: filters.provider });
  if (filters.status   && filters.status   !== "ALL") conditions.push({ status: filters.status });
  const where = conditions.length === 0 ? {} : { AND: conditions };
  return db.emailBounce.findMany({
    where, orderBy: { bouncedAt: "desc" }, take: limit,
  });
}

export async function loadComplaints(limit = 200) {
  return db.emailComplaint.findMany({
    orderBy: { reportedAt: "desc" }, take: limit,
  });
}

/* ── Suppression ───────────────────────────────────────── */

export interface SuppressionFilters {
  q?: string;
  source?: EmailSuppressionSource | "ALL";
}

export async function loadSuppressions(filters: SuppressionFilters, limit = 200) {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { email:  { contains: filters.q, mode: "insensitive" } },
        { reason: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.source && filters.source !== "ALL") conditions.push({ source: filters.source });
  const where = conditions.length === 0 ? {} : { AND: conditions };
  return db.emailSuppression.findMany({
    where, orderBy: { createdAt: "desc" }, take: limit,
  });
}

/* ── Domain authentication ─────────────────────────────── */

export async function loadDomains() {
  return db.emailSendingDomain.findMany({
    orderBy: { domain: "asc" },
    include: {
      reports: { orderBy: { receivedAt: "desc" }, take: 5 },
    },
  });
}

/* ── Templates ─────────────────────────────────────────── */

export async function loadTemplateStats() {
  return db.emailTemplateStats.findMany({
    orderBy: [{ suspended: "asc" }, { sent24h: "desc" }],
  });
}

/* ── Providers ─────────────────────────────────────────── */

export async function loadProviders() {
  return db.emailProvider.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function loadEmailSettings() {
  return db.emailDeliverabilitySettings.findUnique({ where: { id: "default" } });
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

export function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadEmailPage(bounceFilters: BounceFilters, suppressionFilters: SuppressionFilters) {
  const [kpis, volume, bounces, complaints, suppressions, domains, templates, providers, settings] = await Promise.all([
    loadEmailKpis(),
    loadVolumeSeries(30),
    loadBounces(bounceFilters, 200),
    loadComplaints(200),
    loadSuppressions(suppressionFilters, 200),
    loadDomains(),
    loadTemplateStats(),
    loadProviders(),
    loadEmailSettings(),
  ]);
  return { kpis, volume, bounces, complaints, suppressions, domains, templates, providers, settings };
}
