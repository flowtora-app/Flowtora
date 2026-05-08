// Page 56 — System Status data layer.

import { db } from "@/lib/db";
import type {
  SystemServiceKind,
  SystemServiceStatus,
  ServiceAlertSeverity,
  ServiceAlertStatus,
  ServiceDeployStatus,
} from "@prisma/client";

const HOUR = 3_600_000;
const DAY  = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const KIND_LABEL: Record<SystemServiceKind, string> = {
  API:            "API",
  WEB_APP:        "Web app",
  AUTH:           "Auth",
  DB_PRIMARY:     "DB primary",
  DB_REPLICA:     "DB replica",
  REDIS:          "Redis",
  QUEUE_WORKER:   "Queue worker",
  OBJECT_STORAGE: "Object storage",
  SEARCH:         "Search",
  EMAIL:          "Email",
  WEBHOOKS:       "Webhooks",
  CDN:            "CDN",
  WEBSOCKET:      "WebSocket",
  AI:             "AI service",
  CRON:           "Cron",
  OTHER:          "Other",
};

export const STATUS_TONE: Record<
  SystemServiceStatus,
  { bg: string; fg: string; label: string; rank: number }
> = {
  OPERATIONAL:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Operational",     rank: 0 },
  MAINTENANCE:    { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Maintenance",     rank: 1 },
  DEGRADED:       { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Degraded",        rank: 2 },
  PARTIAL_OUTAGE: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Partial outage",  rank: 3 },
  MAJOR_OUTAGE:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Major outage",    rank: 4 },
};

export const ALERT_SEVERITY_TONE: Record<
  ServiceAlertSeverity,
  { bg: string; fg: string; label: string }
> = {
  PAGE:    { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Page" },
  WARNING: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Warning" },
  INFO:    { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Info" },
};

export const ALERT_STATUS_TONE: Record<
  ServiceAlertStatus,
  { bg: string; fg: string; label: string }
> = {
  FIRING:        { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Firing" },
  ACKNOWLEDGED:  { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Acked" },
  RESOLVED:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Resolved" },
  SUPPRESSED:    { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Suppressed" },
};

export const DEPLOY_STATUS_TONE: Record<
  ServiceDeployStatus,
  { bg: string; fg: string; label: string }
> = {
  IN_PROGRESS: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In progress" },
  SUCCEEDED:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Succeeded" },
  FAILED:      { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  ROLLED_BACK: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Rolled back" },
};

/* ── Hero / KPIs ───────────────────────────────────────── */

export interface StatusHero {
  rolledUpStatus: SystemServiceStatus;
  uptime90dPct: number;
  uptime30dPct: number;
  servicesByStatus: { status: SystemServiceStatus; count: number }[];
  totalServices: number;
  firingAlerts: number;
  pageAlerts: number;
}

export async function loadStatusHero(): Promise<StatusHero> {
  const [byStatus, totalServices, uptimeAgg, alerts] = await Promise.all([
    db.systemService.groupBy({ by: ["status"], _count: { _all: true } }),
    db.systemService.count(),
    db.systemService.aggregate({
      _avg: { uptime90dPct: true, uptime30dPct: true },
    }),
    db.serviceAlert.groupBy({
      by: ["severity"],
      where: { status: "FIRING" },
      _count: { _all: true },
    }),
  ]);
  const map = new Map<SystemServiceStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  // Roll-up: pick the worst status anyone is in.
  const ranked: SystemServiceStatus[] = ["OPERATIONAL", "MAINTENANCE", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE"];
  const rolledUpStatus = ranked.slice().reverse().find((s) => (map.get(s) ?? 0) > 0) ?? "OPERATIONAL";
  const sevMap = new Map<ServiceAlertSeverity, number>();
  for (const r of alerts) sevMap.set(r.severity, r._count._all);
  return {
    rolledUpStatus,
    uptime90dPct: Math.round((uptimeAgg._avg.uptime90dPct ?? 100) * 10000) / 10000,
    uptime30dPct: Math.round((uptimeAgg._avg.uptime30dPct ?? 100) * 10000) / 10000,
    servicesByStatus: ranked.map((s) => ({ status: s, count: map.get(s) ?? 0 })),
    totalServices,
    firingAlerts: Array.from(sevMap.values()).reduce((s, n) => s + n, 0),
    pageAlerts: sevMap.get("PAGE") ?? 0,
  };
}

/* ── Service grid ──────────────────────────────────────── */

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
  kind: SystemServiceKind;
  description: string | null;
  status: SystemServiceStatus;
  region: string | null;
  uptime30dPct: number;
  uptime90dPct: number;
  latestRps: number | null;
  latestErrorPct: number | null;
  latestP50Ms: number | null;
  latestP95Ms: number | null;
  latestP99Ms: number | null;
  latestCpuPct: number | null;
  latestMemPct: number | null;
  /** Last-12-hour latency p95 sparkline. */
  sparkP95: number[];
  alerts: number;
  runbookSlug: string | null;
}

export async function loadServiceGrid(): Promise<ServiceCard[]> {
  const since = new Date(Date.now() - 12 * HOUR);
  const services = await db.systemService.findMany({
    orderBy: [{ status: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { alerts: { where: { status: "FIRING" } } } },
    },
  });
  // Pull last 24 samples per service for sparkline.
  const ids = services.map((s) => s.id);
  const samples = ids.length === 0 ? [] : await db.serviceMetricSample.findMany({
    where: { serviceId: { in: ids }, occurredAt: { gte: since } },
    orderBy: { occurredAt: "asc" },
    select: { serviceId: true, p95Ms: true, occurredAt: true },
  });
  const sparkMap = new Map<string, number[]>();
  for (const s of samples) {
    if (!sparkMap.has(s.serviceId)) sparkMap.set(s.serviceId, []);
    sparkMap.get(s.serviceId)!.push(s.p95Ms);
  }
  return services.map((s) => ({
    id: s.id, slug: s.slug, name: s.name, kind: s.kind, description: s.description,
    status: s.status, region: s.region,
    uptime30dPct: s.uptime30dPct, uptime90dPct: s.uptime90dPct,
    latestRps: s.latestRps, latestErrorPct: s.latestErrorPct,
    latestP50Ms: s.latestP50Ms, latestP95Ms: s.latestP95Ms, latestP99Ms: s.latestP99Ms,
    latestCpuPct: s.latestCpuPct, latestMemPct: s.latestMemPct,
    sparkP95: sparkMap.get(s.id) ?? [],
    alerts: s._count.alerts,
    runbookSlug: s.runbookSlug,
  }));
}

/* ── Service detail ────────────────────────────────────── */

export interface ServiceDetail {
  id: string;
  slug: string;
  name: string;
  kind: SystemServiceKind;
  description: string | null;
  status: SystemServiceStatus;
  region: string | null;
  uptime30dPct: number;
  uptime90dPct: number;
  runbookSlug: string | null;
  metrics: {
    occurredAt: Date;
    rps: number;
    errorPct: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    cpuPct: number;
    memPct: number;
  }[];
  deploys: {
    id: string;
    deployedAt: Date;
    ref: string;
    title: string | null;
    source: string | null;
    status: ServiceDeployStatus;
    showOnChart: boolean;
  }[];
  alerts: {
    id: string;
    severity: ServiceAlertSeverity;
    status: ServiceAlertStatus;
    title: string;
    description: string | null;
    source: string | null;
    fireCount: number;
    firedAt: Date;
    acknowledgedAt: Date | null;
    resolvedAt: Date | null;
  }[];
  dependsOn: { id: string; slug: string; name: string; status: SystemServiceStatus; critical: boolean; kind: string | null }[];
  dependedOnBy: { id: string; slug: string; name: string; status: SystemServiceStatus; critical: boolean; kind: string | null }[];
}

export async function loadServiceDetail(slug: string, sinceMs: number): Promise<ServiceDetail | null> {
  const r = await db.systemService.findUnique({
    where: { slug },
    include: {
      metrics: {
        where: { occurredAt: { gte: new Date(Date.now() - sinceMs) } },
        orderBy: { occurredAt: "asc" },
        take: 800,
      },
      deploys: {
        where: { deployedAt: { gte: new Date(Date.now() - sinceMs) } },
        orderBy: { deployedAt: "desc" },
        take: 30,
      },
      alerts: { orderBy: { firedAt: "desc" }, take: 30 },
      dependsOn: {
        include: { to: { select: { id: true, slug: true, name: true, status: true } } },
      },
      dependedOnBy: {
        include: { from: { select: { id: true, slug: true, name: true, status: true } } },
      },
    },
  });
  if (!r) return null;
  return {
    id: r.id, slug: r.slug, name: r.name, kind: r.kind, description: r.description,
    status: r.status, region: r.region,
    uptime30dPct: r.uptime30dPct, uptime90dPct: r.uptime90dPct,
    runbookSlug: r.runbookSlug,
    metrics: r.metrics,
    deploys: r.deploys,
    alerts: r.alerts,
    dependsOn:    r.dependsOn.map((d) => ({ ...d.to, critical: d.critical, kind: d.kind })),
    dependedOnBy: r.dependedOnBy.map((d) => ({ ...d.from, critical: d.critical, kind: d.kind })),
  };
}

/* ── Dependency graph ──────────────────────────────────── */

export interface DependencyEdge {
  from: string; // slug
  to: string;   // slug
  critical: boolean;
  kind: string | null;
}

export interface DependencyGraph {
  nodes: { id: string; slug: string; name: string; kind: SystemServiceKind; status: SystemServiceStatus }[];
  edges: DependencyEdge[];
}

export async function loadDependencyGraph(): Promise<DependencyGraph> {
  const [services, deps] = await Promise.all([
    db.systemService.findMany({
      select: { id: true, slug: true, name: true, kind: true, status: true },
      orderBy: { displayOrder: "asc" },
    }),
    db.serviceDependency.findMany({
      include: {
        from: { select: { slug: true } },
        to:   { select: { slug: true } },
      },
    }),
  ]);
  return {
    nodes: services,
    edges: deps.map((d) => ({
      from: d.from.slug, to: d.to.slug,
      critical: d.critical, kind: d.kind,
    })),
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

export function shortDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadSystemStatusPage() {
  const [hero, grid, graph] = await Promise.all([
    loadStatusHero(),
    loadServiceGrid(),
    loadDependencyGraph(),
  ]);
  return { hero, grid, graph };
}
