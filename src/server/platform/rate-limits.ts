// Page 61 — Rate Limits & Quotas data layer.

import { db } from "@/lib/db";
import type {
  RateLimitAlgorithm,
  RateLimitScope,
  RateLimitAction,
  AbuseAlertSeverity,
  AbuseAlertStatus,
  Plan,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const ALGORITHM_LABEL: Record<RateLimitAlgorithm, string> = {
  TOKEN_BUCKET:   "Token bucket",
  SLIDING_WINDOW: "Sliding window",
  FIXED_WINDOW:   "Fixed window",
  LEAKY_BUCKET:   "Leaky bucket",
};

export const SCOPE_LABEL: Record<RateLimitScope, string> = {
  PER_KEY:    "Per API key",
  PER_IP:     "Per IP",
  PER_TENANT: "Per tenant",
  PER_USER:   "Per user",
  GLOBAL:     "Global",
};

export const ACTION_TONE: Record<
  RateLimitAction,
  { bg: string; fg: string; label: string }
> = {
  THROTTLE:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Throttle" },
  CHALLENGE: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Challenge" },
  BLOCK:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Block" },
  LOG_ONLY:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Log only" },
};

export const ABUSE_SEVERITY_TONE: Record<
  AbuseAlertSeverity,
  { bg: string; fg: string; label: string }
> = {
  CRITICAL: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Critical" },
  HIGH:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "High" },
  MEDIUM:   { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Medium" },
  LOW:      { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Low" },
};

export const ABUSE_STATUS_TONE: Record<
  AbuseAlertStatus,
  { bg: string; fg: string; label: string }
> = {
  OPEN:           { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Open" },
  ACKNOWLEDGED:   { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Acknowledged" },
  ACTION_TAKEN:   { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Action taken" },
  DISMISSED:      { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Dismissed" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface RateLimitKpis {
  rules: number;
  activeRules: number;
  throttled24h: number;
  topThrottledEndpoint: string | null;
  abuseAlerts: number;
  criticalAlerts: number;
  overrideCount: number;
  totalRequests24h: number;
}

export async function loadRateLimitKpis(): Promise<RateLimitKpis> {
  const since24 = new Date(Date.now() - DAY);
  const [rules, throttledAgg, topByEndpoint, abuseByStatus, overrideCount, consumerAgg] = await Promise.all([
    db.rateLimitRule.findMany({ select: { active: true, throttled24h: true } }),
    db.rateLimitRule.aggregate({ _sum: { throttled24h: true, hits24h: true } }),
    db.throttledSample.groupBy({
      by: ["endpoint"],
      where: { day: { gte: since24 } },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: 1,
    }),
    db.abuseAlert.groupBy({
      by: ["severity"],
      where: { status: "OPEN" },
      _count: { _all: true },
    }),
    db.tenantRateLimitOverride.count({ where: { active: true } }),
    db.rateLimitConsumer.aggregate({ _sum: { requests24h: true } }),
  ]);
  const sevMap = new Map<AbuseAlertSeverity, number>();
  for (const r of abuseByStatus) sevMap.set(r.severity, r._count._all);
  return {
    rules: rules.length,
    activeRules: rules.filter((r) => r.active).length,
    throttled24h: throttledAgg._sum.throttled24h ?? 0,
    topThrottledEndpoint: topByEndpoint[0]?.endpoint ?? null,
    abuseAlerts: Array.from(sevMap.values()).reduce((s, n) => s + n, 0),
    criticalAlerts: sevMap.get("CRITICAL") ?? 0,
    overrideCount,
    totalRequests24h: consumerAgg._sum.requests24h ?? throttledAgg._sum.hits24h ?? 0,
  };
}

/* ── Rules ─────────────────────────────────────────────── */

export async function loadRules() {
  return db.rateLimitRule.findMany({
    orderBy: [{ active: "desc" }, { endpoint: "asc" }],
  });
}

/* ── Plan quotas ───────────────────────────────────────── */

export async function loadPlanQuotas() {
  return db.planQuota.findMany({
    orderBy: { plan: "asc" },
  });
}

/* ── Tenant overrides ──────────────────────────────────── */

export async function loadOverrides() {
  const rows = await db.tenantRateLimitOverride.findMany({
    orderBy: [{ active: "desc" }, { expiresAt: "asc" }],
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      rule: { select: { endpoint: true, name: true } },
    },
  });
  return rows;
}

/* ── Top consumers ─────────────────────────────────────── */

export async function loadTopConsumers(limit = 50) {
  return db.rateLimitConsumer.findMany({
    orderBy: { requests24h: "desc" },
    take: limit,
  });
}

/* ── Throttled samples ─────────────────────────────────── */

export async function loadThrottledSamples(days: number) {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.throttledSample.findMany({
    where: { day: { gte: since } },
    orderBy: { day: "asc" },
  });
  // Aggregate by day + by endpoint.
  const byDay = new Map<string, number>();
  const byEndpoint = new Map<string, number>();
  for (const r of rows) {
    const day = r.day.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + r.count);
    byEndpoint.set(r.endpoint, (byEndpoint.get(r.endpoint) ?? 0) + r.count);
  }
  const series = Array.from(byDay.entries()).map(([day, count]) => ({ day, count }));
  const topEndpoints = Array.from(byEndpoint.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([endpoint, count]) => ({ endpoint, count }));
  return { series, topEndpoints };
}

/* ── Abuse alerts ──────────────────────────────────────── */

export async function loadAbuseAlerts(limit = 100) {
  return db.abuseAlert.findMany({
    orderBy: [{ status: "asc" }, { severity: "asc" }, { detectedAt: "desc" }],
    take: limit,
  });
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadRateLimitSettings() {
  return db.rateLimitSettings.findUnique({ where: { id: "default" } });
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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "Unlimited";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadRateLimitsPage() {
  const [kpis, rules, quotas, overrides, consumers, throttled, alerts, settings, tenants] = await Promise.all([
    loadRateLimitKpis(),
    loadRules(),
    loadPlanQuotas(),
    loadOverrides(),
    loadTopConsumers(50),
    loadThrottledSamples(30),
    loadAbuseAlerts(100),
    loadRateLimitSettings(),
    db.tenant.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);
  return { kpis, rules, quotas, overrides, consumers, throttled, alerts, settings, tenants };
}
