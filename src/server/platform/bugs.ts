// Page 37 — Bug Reports data layer.
//
// Reads Bug + descendants for the engineering bug tracker.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  BugSeverity,
  BugStatus,
  BugEnvironment,
  BugFrequency,
  SupportTicketModule,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Filters ───────────────────────────────────────────── */

export interface BugFilters {
  q?: string;
  severity?: BugSeverity;
  status?: BugStatus;
  module?: SupportTicketModule;
  environment?: BugEnvironment;
  reporterTenantId?: string;
  assigneeUserId?: string;
  /** "open" closes everything except WONT_FIX/RELEASED/RESOLVED. */
  scope?: "all" | "open" | "closed" | "mine";
  hasSentry?: "yes" | "no";
  tag?: string;
  /** Filter to last N days; 0 = no time filter. */
  sinceDays?: number;
  /** "mine" scope routes to this user. */
  currentUserId?: string;
}

const OPEN_STATUSES: BugStatus[] = ["NEW", "TRIAGED", "IN_PROGRESS", "IN_REVIEW"];
const CLOSED_STATUSES: BugStatus[] = ["RESOLVED", "RELEASED", "WONT_FIX", "DUPLICATE"];

function buildWhere(filters: BugFilters): Prisma.BugWhereInput {
  const where: Prisma.BugWhereInput = {};
  const ands: Prisma.BugWhereInput[] = [];
  if (filters.scope === "open") ands.push({ status: { in: OPEN_STATUSES } });
  if (filters.scope === "closed") ands.push({ status: { in: CLOSED_STATUSES } });
  if (filters.scope === "mine" && filters.currentUserId) {
    ands.push({ assigneeUserId: filters.currentUserId });
  }
  if (filters.severity)         ands.push({ severity: filters.severity });
  if (filters.status)           ands.push({ status: filters.status });
  if (filters.module)           ands.push({ module: filters.module });
  if (filters.environment)      ands.push({ environment: filters.environment });
  if (filters.reporterTenantId) ands.push({ reporterTenantId: filters.reporterTenantId });
  if (filters.assigneeUserId === "unassigned") ands.push({ assigneeUserId: null });
  else if (filters.assigneeUserId) ands.push({ assigneeUserId: filters.assigneeUserId });
  if (filters.hasSentry === "yes") ands.push({ linkedSentryIssueId: { not: null } });
  if (filters.hasSentry === "no")  ands.push({ linkedSentryIssueId: null });
  if (filters.tag) ands.push({ tags: { has: filters.tag.toLowerCase() } });
  if (filters.sinceDays && filters.sinceDays > 0) {
    ands.push({ createdAt: { gte: new Date(Date.now() - filters.sinceDays * DAY) } });
  }
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { reproSteps: { contains: q, mode: "insensitive" } },
      { rootCause: { contains: q, mode: "insensitive" } },
      { tags: { has: q.toLowerCase() } },
      { linkedSentryIssueId: { contains: q, mode: "insensitive" } },
      { linkedLinearIssueId: { contains: q, mode: "insensitive" } },
      { linkedJiraIssueId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (ands.length > 0) where.AND = ands;
  return where;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface BugKpis {
  open: number;
  sev1: number;
  sev2: number;
  inProgress: number;
  resolvedThisWeek: number;
  releasedThisWeek: number;
  /** Last successful Sentry sync timestamp across any bug. */
  lastSentrySync: Date | null;
  /** Last 7d intake (count of NEW bugs created). */
  intake7d: number;
  /** Avg time to triage (NEW → TRIAGED) in hours over the last 30d. */
  avgTimeToTriageHrs: number | null;
  /** Avg time to resolve (NEW → RESOLVED) in hours over the last 30d. */
  avgTimeToResolveHrs: number | null;
}

export async function loadBugKpis(): Promise<BugKpis> {
  const now = new Date();
  const week = new Date(now.getTime() - 7 * DAY);
  const month = new Date(now.getTime() - 30 * DAY);
  const [byStatus, sevs, lastSync, intake, triageRows, resolveRows] = await Promise.all([
    db.bug.groupBy({ by: ["status"], _count: { _all: true } }),
    db.bug.groupBy({
      by: ["severity"],
      where: { status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    }),
    db.bug.findFirst({
      where: { lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    }),
    db.bug.count({ where: { createdAt: { gte: week } } }),
    db.bug.findMany({
      where: { triagedAt: { gte: month } },
      select: { createdAt: true, triagedAt: true },
      take: 1000,
    }),
    db.bug.findMany({
      where: { resolvedAt: { gte: month } },
      select: { createdAt: true, resolvedAt: true },
      take: 1000,
    }),
  ]);
  const byStatusMap = new Map<BugStatus, number>();
  for (const r of byStatus) byStatusMap.set(r.status, r._count._all);
  const sevMap = new Map<BugSeverity, number>();
  for (const r of sevs) sevMap.set(r.severity, r._count._all);

  const open = OPEN_STATUSES.reduce((s, k) => s + (byStatusMap.get(k) ?? 0), 0);
  const triagedSamples = triageRows
    .filter((r) => r.triagedAt)
    .map((r) => (r.triagedAt!.getTime() - r.createdAt.getTime()) / 3_600_000);
  const resolvedSamples = resolveRows
    .filter((r) => r.resolvedAt)
    .map((r) => (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3_600_000);
  const avg = (xs: number[]) => xs.length === 0 ? null : Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 10) / 10;

  return {
    open,
    sev1: sevMap.get("SEV1") ?? 0,
    sev2: sevMap.get("SEV2") ?? 0,
    inProgress: byStatusMap.get("IN_PROGRESS") ?? 0,
    resolvedThisWeek: await db.bug.count({ where: { resolvedAt: { gte: week } } }),
    releasedThisWeek: await db.bug.count({ where: { releasedAt: { gte: week } } }),
    lastSentrySync: lastSync?.lastSyncedAt ?? null,
    intake7d: intake,
    avgTimeToTriageHrs: avg(triagedSamples),
    avgTimeToResolveHrs: avg(resolvedSamples),
  };
}

/* ── List rows ─────────────────────────────────────────── */

export interface BugRow {
  id: string;
  number: number;
  title: string;
  severity: BugSeverity;
  status: BugStatus;
  environment: BugEnvironment;
  module: SupportTicketModule;
  reporterUserId: string | null;
  reporterUserName: string | null;
  reporterTenantId: string | null;
  reporterTenantName: string | null;
  assigneeUserId: string | null;
  assigneeUserName: string | null;
  linkedSentryIssueId: string | null;
  linkedLinearIssueId: string | null;
  linkedJiraIssueId: string | null;
  duplicateOfId: string | null;
  tags: string[];
  impactedTenantCount: number;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  releasedAt: Date | null;
}

export interface BugList {
  rows: BugRow[];
  total: number;
  filteredTotal: number;
}

export async function loadBugList(args: {
  filters: BugFilters;
  page: number;
  pageSize: number;
}): Promise<BugList> {
  const where = buildWhere(args.filters);
  const [total, filteredTotal, rows] = await Promise.all([
    db.bug.count(),
    db.bug.count({ where }),
    db.bug.findMany({
      where,
      orderBy: [
        // SEV1 first; otherwise newest update.
        { severity: "asc" },
        { updatedAt: "desc" },
      ],
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: { _count: { select: { tenantImpacts: true } } },
    }),
  ]);

  const userIds = Array.from(new Set([
    ...rows.map((r) => r.reporterUserId),
    ...rows.map((r) => r.assigneeUserId),
  ].filter((x): x is string => Boolean(x))));
  const tenantIds = Array.from(new Set(rows.map((r) => r.reporterTenantId).filter((x): x is string => Boolean(x))));
  const [users, tenants] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([] as { id: string; name: string | null; email: string }[])
      : db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    tenantIds.length === 0
      ? Promise.resolve([] as { id: string; name: string }[])
      : db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  return {
    total,
    filteredTotal,
    rows: rows.map((r): BugRow => {
      const reporter = r.reporterUserId ? userMap.get(r.reporterUserId) : null;
      const assignee = r.assigneeUserId ? userMap.get(r.assigneeUserId) : null;
      const tenant = r.reporterTenantId ? tenantMap.get(r.reporterTenantId) : null;
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        severity: r.severity,
        status: r.status,
        environment: r.environment,
        module: r.module,
        reporterUserId: r.reporterUserId,
        reporterUserName: reporter ? reporter.name ?? reporter.email : null,
        reporterTenantId: r.reporterTenantId,
        reporterTenantName: tenant ? tenant.name : null,
        assigneeUserId: r.assigneeUserId,
        assigneeUserName: assignee ? assignee.name ?? assignee.email : null,
        linkedSentryIssueId: r.linkedSentryIssueId,
        linkedLinearIssueId: r.linkedLinearIssueId,
        linkedJiraIssueId: r.linkedJiraIssueId,
        duplicateOfId: r.duplicateOfId,
        tags: r.tags,
        impactedTenantCount: r._count.tenantImpacts,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        resolvedAt: r.resolvedAt,
        releasedAt: r.releasedAt,
      };
    }),
  };
}

/* ── Detail ────────────────────────────────────────────── */

export interface BugDetail {
  id: string;
  number: number;
  title: string;
  description: string;
  reproSteps: string;
  expected: string;
  actual: string;
  browserOS: string | null;
  accountContext: string | null;
  frequency: BugFrequency;
  businessImpact: string | null;
  severity: BugSeverity;
  status: BugStatus;
  environment: BugEnvironment;
  module: SupportTicketModule;
  reporterUserId: string | null;
  reporterUserName: string | null;
  reporterTenantId: string | null;
  reporterTenantName: string | null;
  assigneeUserId: string | null;
  assigneeUserName: string | null;
  linkedSentryIssueId: string | null;
  linkedLinearIssueId: string | null;
  linkedJiraIssueId: string | null;
  duplicateOfId: string | null;
  duplicateOfTitle: string | null;
  tags: string[];
  rootCause: string | null;
  fixDescription: string | null;
  verifiedByUserId: string | null;
  verifiedByName: string | null;
  postmortemUrl: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  triagedAt: Date | null;
  startedAt: Date | null;
  resolvedAt: Date | null;
  releasedAt: Date | null;

  attachments: { id: string; url: string; name: string; mime: string | null; size: number | null; createdAt: Date }[];
  comments:    { id: string; authorId: string; authorName: string | null; body: string; internal: boolean; createdAt: Date }[];
  activity:    { id: string; action: string; details: unknown; actorId: string | null; actorName: string | null; createdAt: Date }[];
  tenantImpacts: { id: string; tenantId: string; tenantName: string; autoDetected: boolean; note: string | null; firstSeenAt: Date; lastSeenAt: Date }[];
  /** Sibling duplicate bugs (this row is the survivor). */
  duplicates: { id: string; number: number; title: string; status: BugStatus }[];
  /** SupportTickets that link back to this bug. */
  linkedTickets: { id: string; subject: string; status: string }[];
  /** FeatureRequests that converted to this bug. */
  linkedFeatureRequests: { id: string; title: string }[];
}

export async function loadBugDetail(id: string): Promise<BugDetail | null> {
  const row = await db.bug.findUnique({
    where: { id },
    include: {
      attachments: { orderBy: { createdAt: "asc" } },
      comments:    { orderBy: { createdAt: "asc" }, take: 200 },
      activity:    { orderBy: { createdAt: "asc" }, take: 200 },
      tenantImpacts: {
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { lastSeenAt: "desc" },
      },
      duplicates: { select: { id: true, number: true, title: true, status: true } },
      duplicateOf: { select: { id: true, title: true } },
    },
  });
  if (!row) return null;

  const userIds = Array.from(new Set([
    row.reporterUserId, row.assigneeUserId, row.verifiedByUserId,
    ...row.comments.map((c) => c.authorId),
    ...row.activity.map((a) => a.actorId),
  ].filter((x): x is string => Boolean(x))));
  const users = userIds.length === 0
    ? []
    : await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const nameOf = (uid: string | null) => {
    if (!uid) return null;
    const u = userMap.get(uid);
    return u ? u.name ?? u.email : null;
  };

  const tenant = row.reporterTenantId
    ? await db.tenant.findUnique({ where: { id: row.reporterTenantId }, select: { name: true } })
    : null;

  const [linkedTickets, linkedFeatureRequests] = await Promise.all([
    db.supportTicket.findMany({
      // Page 33 doesn't store a Bug pointer on SupportTicket today, so we
      // fall back to message bodies that mention this bug id. Future:
      // add SupportTicket.linkedBugId.
      where: {
        OR: [
          { messages: { some: { body: { contains: id } } } },
        ],
      },
      select: { id: true, subject: true, status: true },
      take: 5,
    }),
    db.featureRequest.findMany({
      where: { linkedBugId: id },
      select: { id: true, title: true },
      take: 10,
    }),
  ]);

  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    reproSteps: row.reproSteps,
    expected: row.expected,
    actual: row.actual,
    browserOS: row.browserOS,
    accountContext: row.accountContext,
    frequency: row.frequency,
    businessImpact: row.businessImpact,
    severity: row.severity,
    status: row.status,
    environment: row.environment,
    module: row.module,
    reporterUserId: row.reporterUserId,
    reporterUserName: nameOf(row.reporterUserId),
    reporterTenantId: row.reporterTenantId,
    reporterTenantName: tenant?.name ?? null,
    assigneeUserId: row.assigneeUserId,
    assigneeUserName: nameOf(row.assigneeUserId),
    linkedSentryIssueId: row.linkedSentryIssueId,
    linkedLinearIssueId: row.linkedLinearIssueId,
    linkedJiraIssueId: row.linkedJiraIssueId,
    duplicateOfId: row.duplicateOfId,
    duplicateOfTitle: row.duplicateOf?.title ?? null,
    tags: row.tags,
    rootCause: row.rootCause,
    fixDescription: row.fixDescription,
    verifiedByUserId: row.verifiedByUserId,
    verifiedByName: nameOf(row.verifiedByUserId),
    postmortemUrl: row.postmortemUrl,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    triagedAt: row.triagedAt,
    startedAt: row.startedAt,
    resolvedAt: row.resolvedAt,
    releasedAt: row.releasedAt,
    attachments: row.attachments.map((a) => ({
      id: a.id, url: a.url, name: a.name, mime: a.mime, size: a.size, createdAt: a.createdAt,
    })),
    comments: row.comments.map((c) => ({
      id: c.id, authorId: c.authorId, authorName: nameOf(c.authorId),
      body: c.body, internal: c.internal, createdAt: c.createdAt,
    })),
    activity: row.activity.map((a) => ({
      id: a.id, action: a.action, details: a.details, actorId: a.actorId,
      actorName: nameOf(a.actorId), createdAt: a.createdAt,
    })),
    tenantImpacts: row.tenantImpacts.map((i) => ({
      id: i.id, tenantId: i.tenantId, tenantName: i.tenant.name,
      autoDetected: i.autoDetected, note: i.note,
      firstSeenAt: i.firstSeenAt, lastSeenAt: i.lastSeenAt,
    })),
    duplicates: row.duplicates,
    linkedTickets,
    linkedFeatureRequests,
  };
}

/* ── Filter options (for the toolbar) ─────────────────── */

export interface BugFilterOptions {
  staff: { id: string; label: string }[];
  tenants: { id: string; name: string }[];
  tags: string[];
}

export async function loadBugFilterOptions(): Promise<BugFilterOptions> {
  const [staff, tenants, tagRows] = await Promise.all([
    db.user.findMany({
      where: { platformRole: { not: null } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    db.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    db.bug.findMany({ select: { tags: true }, take: 1000 }),
  ]);
  const tagSet = new Set<string>();
  for (const r of tagRows) for (const t of r.tags) tagSet.add(t);
  return {
    staff: staff.map((u) => ({ id: u.id, label: u.name ?? u.email })),
    tenants,
    tags: Array.from(tagSet).sort(),
  };
}

/* ── Sentry sync (local stub) ──────────────────────────── */

/**
 * Synthesizes a fake Sentry stack-trace + breadcrumbs payload for the
 * given bug. Real integration would replace this with a fetch to
 * sentry.io's /events API. The envelope is shaped like Sentry's so
 * the renderer doesn't have to change when we wire it up.
 */
export interface SentryEnvelope {
  issueId: string;
  title: string;
  level: "fatal" | "error" | "warning";
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  userCount: number;
  exception: {
    type: string;
    value: string;
    frames: { filename: string; function: string; lineno: number; in_app: boolean }[];
  };
  breadcrumbs: { category: string; message: string; level: "info" | "warning" | "error"; ts: Date }[];
  /** Tenants we correlated the issue across. */
  tenantTagsSeen: string[];
}

export function synthesizeSentryEnvelope(bug: { id: string; title: string; createdAt: Date; module: string; linkedSentryIssueId: string | null }): SentryEnvelope {
  const issueId = bug.linkedSentryIssueId ?? `FLOWTORA-${bug.id.slice(-6).toUpperCase()}`;
  return {
    issueId,
    title: bug.title,
    level: "error",
    firstSeen: bug.createdAt,
    lastSeen: new Date(),
    count: 47 + Math.floor(Math.random() * 200),
    userCount: 8 + Math.floor(Math.random() * 30),
    exception: {
      type: "TypeError",
      value: bug.title,
      frames: [
        { filename: `src/server/${bug.module.toLowerCase()}/handler.ts`, function: "processRequest", lineno: 142, in_app: true },
        { filename: `src/lib/${bug.module.toLowerCase()}.ts`, function: "compute", lineno: 89, in_app: true },
        { filename: "node_modules/next/dist/server/render.js", function: "renderToHTML", lineno: 1200, in_app: false },
      ],
    },
    breadcrumbs: [
      { category: "navigation", message: `to: /${bug.module.toLowerCase()}`, level: "info", ts: new Date(bug.createdAt.getTime() - 60_000) },
      { category: "ui.click", message: "button[name='submit']", level: "info", ts: new Date(bug.createdAt.getTime() - 30_000) },
      { category: "fetch", message: `POST /api/${bug.module.toLowerCase()} 500`, level: "error", ts: bug.createdAt },
    ],
    tenantTagsSeen: ["t-acme", "t-bright-light", "t-castle"],
  };
}
