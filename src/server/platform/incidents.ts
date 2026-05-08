// Page 54 — Incident Log data layer.

import { db } from "@/lib/db";
import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentDetectedBy,
  IncidentTimelineKind,
  AffectedNotificationStatus,
  IncidentCommChannel,
  IncidentCommStatus,
  ActionItemStatus,
  StatusPageComponentStatus,
  StatusPageMaintenanceState,
  RunbookStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const SEVERITY_TONE: Record<
  IncidentSeverity,
  { bg: string; fg: string; label: string; rank: number }
> = {
  SEV1: { bg: "var(--rose-100)",   fg: "var(--rose-700)",   label: "SEV1", rank: 1 },
  SEV2: { bg: "var(--amber-100)",  fg: "var(--amber-700)",  label: "SEV2", rank: 2 },
  SEV3: { bg: "var(--sky-100)",    fg: "var(--sky-700)",    label: "SEV3", rank: 3 },
  SEV4: { bg: "var(--surface-2)",  fg: "var(--text-muted)", label: "SEV4", rank: 4 },
};

export const STATUS_TONE: Record<
  IncidentStatus,
  { bg: string; fg: string; label: string }
> = {
  INVESTIGATING: { bg: "var(--rose-100)",    fg: "var(--rose-700)",   label: "Investigating" },
  IDENTIFIED:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",  label: "Identified" },
  MONITORING:    { bg: "var(--sky-100)",     fg: "var(--sky-700)",    label: "Monitoring" },
  RESOLVED:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Resolved" },
};

export const DETECTED_BY_LABEL: Record<IncidentDetectedBy, string> = {
  ALERT:           "Alert",
  CUSTOMER_REPORT: "Customer report",
  INTERNAL:        "Internal",
  SYNTHETIC_CHECK: "Synthetic check",
  MANUAL:          "Manual",
  PARTNER:         "Partner",
  SECURITY_FEED:   "Security feed",
};

export const TIMELINE_KIND_LABEL: Record<IncidentTimelineKind, string> = {
  STATUS_CHANGE:  "Status change",
  COMMS_SENT:     "Comms sent",
  MITIGATION:     "Mitigation",
  ROLE_ASSIGNED:  "Role assigned",
  NOTE:           "Note",
  DEPLOY:         "Deploy",
  FLAG_TOGGLE:    "Flag toggle",
  PAGE_FIRED:     "Page fired",
  ALERT:          "Alert",
  HANDOFF:        "Hand-off",
  RESOLUTION:     "Resolution",
};

export const NOTIFICATION_TONE: Record<
  AffectedNotificationStatus,
  { bg: string; fg: string; label: string }
> = {
  NOTIFIED:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Notified" },
  PENDING:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  FAILED:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  SUPPRESSED: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Suppressed" },
};

export const COMM_CHANNEL_LABEL: Record<IncidentCommChannel, string> = {
  STATUS_PAGE: "Status page",
  EMAIL:       "Email",
  TWITTER_X:   "X / Twitter",
  IN_APP:      "In-app banner",
  SLACK:       "Slack",
};

export const COMM_STATUS_TONE: Record<
  IncidentCommStatus,
  { bg: string; fg: string; label: string }
> = {
  PUBLISHED: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Published" },
  DRAFT:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Draft" },
  RETRACTED: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Retracted" },
};

export const ACTION_ITEM_TONE: Record<
  ActionItemStatus,
  { bg: string; fg: string; label: string }
> = {
  TODO:        { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Todo" },
  IN_PROGRESS: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In progress" },
  DONE:        { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Done" },
  BLOCKED:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Blocked" },
  CANCELLED:   { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Cancelled" },
};

export const COMPONENT_STATUS_TONE: Record<
  StatusPageComponentStatus,
  { bg: string; fg: string; label: string }
> = {
  OPERATIONAL:    { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Operational" },
  DEGRADED:       { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Degraded" },
  PARTIAL_OUTAGE: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Partial outage" },
  MAJOR_OUTAGE:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Major outage" },
  MAINTENANCE:    { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Maintenance" },
};

export const MAINT_STATE_TONE: Record<
  StatusPageMaintenanceState,
  { bg: string; fg: string; label: string }
> = {
  SCHEDULED:   { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Scheduled" },
  IN_PROGRESS: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "In progress" },
  COMPLETED:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Completed" },
  CANCELLED:   { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Cancelled" },
};

export const RUNBOOK_STATUS_TONE: Record<
  RunbookStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  DRAFT:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Draft" },
  ARCHIVED: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Archived" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface IncidentKpis {
  openCount: number;
  openBySev: { sev: IncidentSeverity; count: number }[];
  mttr30dMinutes: number | null;
  mttd30dMinutes: number | null;
  count90d: number;
  byDay90d: { day: string; sev1: number; sev2: number; sev3: number; sev4: number }[];
}

export async function loadIncidentKpis(): Promise<IncidentKpis> {
  const since30d = new Date(Date.now() - 30 * DAY);
  const since90d = new Date(Date.now() - 90 * DAY);
  const [openBySev, recent30d, last90d] = await Promise.all([
    db.incident.groupBy({
      by: ["severity"],
      where: { status: { not: "RESOLVED" } },
      _count: { _all: true },
    }),
    db.incident.findMany({
      where: { status: "RESOLVED", resolvedAt: { gte: since30d } },
      select: { startedAt: true, detectedAt: true, identifiedAt: true, resolvedAt: true },
    }),
    db.incident.findMany({
      where: { startedAt: { gte: since90d } },
      select: { severity: true, startedAt: true },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const sevMap = new Map<IncidentSeverity, number>();
  for (const r of openBySev) sevMap.set(r.severity, r._count._all);
  const openCount = Array.from(sevMap.values()).reduce((s, n) => s + n, 0);

  const mttrMinutes = recent30d.length === 0 ? null : Math.round(
    recent30d.reduce((s, r) => s + Math.max(0, ((r.resolvedAt!.getTime() - r.startedAt.getTime()) / 60_000)), 0) / recent30d.length,
  );
  const detectedSamples = recent30d.filter((r) => r.detectedAt != null);
  const mttdMinutes = detectedSamples.length === 0 ? null : Math.round(
    detectedSamples.reduce((s, r) => s + Math.max(0, ((r.detectedAt!.getTime() - r.startedAt.getTime()) / 60_000)), 0) / detectedSamples.length,
  );

  // Buckets per day for the sparkline.
  const byDayMap = new Map<string, { sev1: number; sev2: number; sev3: number; sev4: number }>();
  for (let i = 0; i < 90; i++) {
    const d = new Date(Date.now() - (89 - i) * DAY);
    const k = d.toISOString().slice(0, 10);
    byDayMap.set(k, { sev1: 0, sev2: 0, sev3: 0, sev4: 0 });
  }
  for (const r of last90d) {
    const k = r.startedAt.toISOString().slice(0, 10);
    const cur = byDayMap.get(k);
    if (cur) {
      if (r.severity === "SEV1") cur.sev1 += 1;
      if (r.severity === "SEV2") cur.sev2 += 1;
      if (r.severity === "SEV3") cur.sev3 += 1;
      if (r.severity === "SEV4") cur.sev4 += 1;
    }
  }
  const byDay90d = Array.from(byDayMap.entries()).map(([day, b]) => ({ day, ...b }));

  return {
    openCount,
    openBySev: (["SEV1", "SEV2", "SEV3", "SEV4"] as IncidentSeverity[])
      .map((sev) => ({ sev, count: sevMap.get(sev) ?? 0 })),
    mttr30dMinutes: mttrMinutes,
    mttd30dMinutes: mttdMinutes,
    count90d: last90d.length,
    byDay90d,
  };
}

/* ── List ───────────────────────────────────────────────── */

export type IncidentTab = "active" | "resolved" | "postmortems" | "status_page" | "runbooks" | "on_call";

export interface IncidentFilters {
  q?: string;
  severity?: IncidentSeverity | "ALL";
  status?: IncidentStatus | "ALL";
  service?: string;
  assigneeId?: string;
  postmortemDue?: boolean;
}

export interface IncidentRow {
  id: string;
  externalId: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: Date;
  detectedAt: Date | null;
  detectedBy: IncidentDetectedBy;
  durationMin: number | null;
  commanderEmail: string | null;
  commanderName: string | null;
  services: string[];
  affectedTenantsCount: number;
  hasPostmortem: boolean;
  postmortemDueAt: Date | null;
  postmortemPublishedAt: Date | null;
  resolvedAt: Date | null;
}

export async function loadIncidentList(
  tab: IncidentTab,
  filters: IncidentFilters,
): Promise<IncidentRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (tab === "active")        conditions.push({ status: { not: "RESOLVED" } });
  if (tab === "resolved")      conditions.push({ status: "RESOLVED" });
  if (tab === "postmortems")   conditions.push({ postmortemRequired: true });
  if (filters.q) {
    conditions.push({
      OR: [
        { externalId: { contains: filters.q, mode: "insensitive" } },
        { title:      { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.severity && filters.severity !== "ALL") conditions.push({ severity: filters.severity });
  if (filters.status   && filters.status   !== "ALL") conditions.push({ status: filters.status });
  if (filters.service) conditions.push({ services: { has: filters.service } });
  if (filters.assigneeId) conditions.push({ commanderId: filters.assigneeId });
  if (filters.postmortemDue) conditions.push({
    postmortemRequired: true,
    postmortemPublishedAt: null,
    status: "RESOLVED",
  });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const rows = await db.incident.findMany({
    where,
    orderBy: [{ status: "asc" }, { severity: "asc" }, { startedAt: "desc" }],
    take: 200,
    include: { _count: { select: { affectedTen: true } } },
  });
  // Look up commander emails separately.
  const commanderIds = Array.from(new Set(rows.map((r) => r.commanderId).filter((u): u is string => !!u)));
  const users = commanderIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: commanderIds } },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    id: r.id, externalId: r.externalId, title: r.title,
    severity: r.severity, status: r.status,
    startedAt: r.startedAt, detectedAt: r.detectedAt, detectedBy: r.detectedBy,
    durationMin: r.durationMin,
    commanderEmail: r.commanderId ? userMap.get(r.commanderId)?.email ?? null : null,
    commanderName:  r.commanderId ? userMap.get(r.commanderId)?.name  ?? null : null,
    services: r.services,
    affectedTenantsCount: r._count.affectedTen,
    hasPostmortem: !!r.postmortemBody,
    postmortemDueAt: r.postmortemDueAt,
    postmortemPublishedAt: r.postmortemPublishedAt,
    resolvedAt: r.resolvedAt,
  }));
}

/* ── Detail ─────────────────────────────────────────────── */

export async function loadIncidentDetail(id: string) {
  const r = await db.incident.findUnique({
    where: { id },
    include: {
      timeline:    { orderBy: { occurredAt: "asc" } },
      affectedSvc: { orderBy: { serviceName: "asc" } },
      affectedTen: {
        orderBy: { notificationStatus: "asc" },
        include: { tenant: { select: { name: true, slug: true } } },
      },
      comms:       { orderBy: { createdAt: "desc" } },
      mitigations: { orderBy: { appliedAt: "asc" } },
      actionItems: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
      runbook:     { select: { id: true, slug: true, title: true } },
    },
  });
  if (!r) return null;
  // Resolve role users.
  const userIds = Array.from(new Set([
    r.commanderId, r.scribeId, r.commsLeadId,
  ].filter((u): u is string => !!u)));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  return {
    ...r,
    commander:  r.commanderId ? userMap.get(r.commanderId)  ?? null : null,
    scribe:     r.scribeId    ? userMap.get(r.scribeId)     ?? null : null,
    commsLead:  r.commsLeadId ? userMap.get(r.commsLeadId)  ?? null : null,
  };
}

/* ── Status page ───────────────────────────────────────── */

export async function loadStatusPage() {
  const [components, maintenance] = await Promise.all([
    db.statusPageComponent.findMany({ orderBy: { position: "asc" } }),
    db.statusPageMaintenance.findMany({ orderBy: { startsAt: "desc" }, take: 10 }),
  ]);
  return { components, maintenance };
}

/* ── Runbooks ──────────────────────────────────────────── */

export async function loadRunbooks() {
  return db.runbook.findMany({
    orderBy: [{ status: "asc" }, { service: "asc" }, { title: "asc" }],
  });
}

/* ── On-call schedule ──────────────────────────────────── */

export async function loadOnCallSchedule() {
  const now = new Date();
  const [shifts, teams] = await Promise.all([
    db.onCallShift.findMany({
      where: {
        OR: [
          { startsAt: { lte: new Date(now.getTime() + 30 * DAY) }, endsAt: { gte: now } },
        ],
      },
      orderBy: { startsAt: "asc" },
      take: 100,
      include: {
        team: { select: { id: true, name: true, key: true, color: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    db.platformTeam.findMany({
      where: { archivedAt: null },
      select: {
        id: true, name: true, key: true, color: true,
        notifySlack: true, notifyPagerDuty: true, notifySms: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return { shifts, teams };
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

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function shortDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadIncidentsPage(tab: IncidentTab, filters: IncidentFilters) {
  const [kpis, list, statusPage, runbooks, onCall, staff] = await Promise.all([
    loadIncidentKpis(),
    tab === "active" || tab === "resolved" || tab === "postmortems" ? loadIncidentList(tab, filters) : [] as IncidentRow[],
    tab === "status_page" ? loadStatusPage() : { components: [], maintenance: [] },
    tab === "runbooks" ? loadRunbooks() : [],
    tab === "on_call" ? loadOnCallSchedule() : { shifts: [], teams: [] },
    db.user.findMany({
      where: { platformRole: { not: null } },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
      take: 50,
    }),
  ]);
  return { kpis, list, statusPage, runbooks, onCall, staff };
}
