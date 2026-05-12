// Page 64 — Logs & Errors data layer.

import { db } from "@/lib/db";
import type {
  LogSeverity,
  LogIssueStatus,
  LogIssueIgnoreType,
  LogAlertChannel,
  LogAlertStatus,
} from "@prisma/client";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const SEVERITY_LABEL: Record<LogSeverity, string> = {
  DEBUG: "Debug",
  INFO:  "Info",
  WARN:  "Warn",
  ERROR: "Error",
  FATAL: "Fatal",
};

export const SEVERITY_TONE: Record<
  LogSeverity,
  { bg: string; fg: string }
> = {
  DEBUG: { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
  INFO:  { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  WARN:  { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  ERROR: { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  FATAL: { bg: "var(--rose-200)",    fg: "var(--rose-800)" },
};

export const ISSUE_STATUS_TONE: Record<
  LogIssueStatus,
  { bg: string; fg: string; label: string }
> = {
  UNRESOLVED: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Unresolved" },
  RESOLVED:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Resolved" },
  IGNORED:    { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Ignored" },
};

export const ALERT_CHANNEL_LABEL: Record<LogAlertChannel, string> = {
  SLACK:      "Slack",
  PAGERDUTY:  "PagerDuty",
  EMAIL:      "Email",
  WEBHOOK:    "Webhook",
};

export const ALERT_STATUS_TONE: Record<
  LogAlertStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:  { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  PAUSED:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Paused" },
  FIRING:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Firing" },
};

export const IGNORE_TYPE_LABEL: Record<LogIssueIgnoreType, string> = {
  NONE:           "Not ignored",
  UNTIL_VERSION:  "Until next release",
  UNTIL_N_EVENTS: "Until N more events",
  UNTIL_N_DAYS:   "Until N days pass",
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface LogKpis {
  events24h: number;
  errors24h: number;
  fatals24h: number;
  openIssues: number;
  criticalIssues: number;
  firingAlerts: number;
  pausedAlerts: number;
  errorRatePctChange: number; // vs prior 24h
}

export async function loadLogKpis(): Promise<LogKpis> {
  const now = new Date();
  const since24 = new Date(now.getTime() - DAY);
  const since48 = new Date(now.getTime() - 2 * DAY);
  const [total24, total48, errors24, fatals24, issues, alerts] = await Promise.all([
    db.logEntry.count({ where: { timestamp: { gte: since24 } } }),
    db.logEntry.count({ where: { timestamp: { gte: since48, lt: since24 } } }),
    db.logEntry.count({ where: { timestamp: { gte: since24 }, severity: "ERROR" } }),
    db.logEntry.count({ where: { timestamp: { gte: since24 }, severity: "FATAL" } }),
    db.logIssue.findMany({ select: { status: true, eventCount: true, tags: true } }),
    db.logAlert.findMany({ select: { status: true } }),
  ]);
  const openIssues = issues.filter((i) => i.status === "UNRESOLVED").length;
  const criticalIssues = issues.filter((i) => i.status === "UNRESOLVED" && (i.tags.includes("critical") || i.eventCount > 500)).length;
  const errorRatePctChange = total48 === 0 ? 0
    : Math.round(((total24 - total48) / total48) * 100);
  return {
    events24h: total24,
    errors24h: errors24,
    fatals24h: fatals24,
    openIssues,
    criticalIssues,
    firingAlerts:  alerts.filter((a) => a.status === "FIRING").length,
    pausedAlerts:  alerts.filter((a) => a.status === "PAUSED").length,
    errorRatePctChange,
  };
}

/* ── Recent log entries (Live Tail) ───────────────────── */

export async function loadRecentLogs(args: {
  severity?: LogSeverity;
  service?: string;
  search?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (args.severity) where.severity = args.severity;
  if (args.service)  where.service = args.service;
  if (args.search && args.search.length > 0) {
    where.message = { contains: args.search, mode: "insensitive" };
  }
  return db.logEntry.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: Math.min(args.limit ?? 100, 500),
  });
}

/* ── Search histogram — buckets per hour over a window ── */

export interface HistogramBucket {
  hour: string;
  total: number;
  errors: number;
  fatals: number;
}

export async function loadLogHistogram(hours = 24): Promise<HistogramBucket[]> {
  const since = new Date(Date.now() - hours * HOUR);
  // Bucket on hour using raw query for speed. For pure JS, group in code.
  const rows = await db.logEntry.findMany({
    where: { timestamp: { gte: since } },
    select: { timestamp: true, severity: true },
  });
  const buckets = new Map<string, HistogramBucket>();
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * HOUR);
    d.setMinutes(0, 0, 0);
    const k = d.toISOString().slice(0, 13);
    buckets.set(k, { hour: k, total: 0, errors: 0, fatals: 0 });
  }
  for (const r of rows) {
    const k = r.timestamp.toISOString().slice(0, 13);
    const b = buckets.get(k);
    if (!b) continue;
    b.total++;
    if (r.severity === "ERROR") b.errors++;
    if (r.severity === "FATAL") b.fatals++;
  }
  return Array.from(buckets.values());
}

/* ── Field facets — top values per field over recent window ── */

export interface FieldFacet {
  field: "service" | "severity";
  values: Array<{ value: string; count: number }>;
}

export async function loadFieldFacets(hours = 24): Promise<FieldFacet[]> {
  const since = new Date(Date.now() - hours * HOUR);
  const [services, severities] = await Promise.all([
    db.logEntry.groupBy({
      by: ["service"],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { service: "desc" } },
      take: 10,
    }),
    db.logEntry.groupBy({
      by: ["severity"],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { severity: "desc" } },
    }),
  ]);
  return [
    { field: "service",  values: services.map((s) => ({ value: s.service,  count: s._count._all })) },
    { field: "severity", values: severities.map((s) => ({ value: s.severity, count: s._count._all })) },
  ];
}

/* ── Issues (Sentry-like) ──────────────────────────────── */

export async function loadIssues(args: {
  status?: LogIssueStatus;
  project?: string;
  env?: string;
  assignee?: string;
  search?: string;
}) {
  const where: Record<string, unknown> = {};
  if (args.status)   where.status = args.status;
  if (args.project)  where.project = args.project;
  if (args.env)      where.env = args.env;
  if (args.assignee) where.assigneeEmail = args.assignee;
  if (args.search && args.search.length > 0) {
    where.OR = [
      { title:   { contains: args.search, mode: "insensitive" } },
      { message: { contains: args.search, mode: "insensitive" } },
      { errorType: { contains: args.search, mode: "insensitive" } },
    ];
  }
  return db.logIssue.findMany({
    where,
    orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
    include: { _count: { select: { occurrences: true } } },
    take: 200,
  });
}

export async function loadIssueDetail(id: string) {
  return db.logIssue.findUnique({
    where: { id },
    include: {
      occurrences: { orderBy: { timestamp: "desc" }, take: 25 },
    },
  });
}

/* ── Saved queries ─────────────────────────────────────── */

export async function loadSavedQueries() {
  return db.logSavedQuery.findMany({
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
}

/* ── Alerts ────────────────────────────────────────────── */

export async function loadAlerts() {
  return db.logAlert.findMany({
    orderBy: [{ status: "asc" }, { lastTriggeredAt: "desc" }],
  });
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadLogSettings() {
  return db.logSettings.findUnique({ where: { id: "default" } });
}

/* ── Helpers ───────────────────────────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const secs = Math.round(abs / 1000);
  if (secs < 60) return future ? "soon" : `${secs}s ago`;
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function timeHHMMSS(d: Date): string {
  return d.toISOString().slice(11, 19);
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadLogsPage() {
  const [kpis, savedQueries, alerts, settings, facets, histogram] = await Promise.all([
    loadLogKpis(),
    loadSavedQueries(),
    loadAlerts(),
    loadLogSettings(),
    loadFieldFacets(24),
    loadLogHistogram(24),
  ]);
  return { kpis, savedQueries, alerts, settings, facets, histogram };
}
