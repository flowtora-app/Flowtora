// Page 44 — Lead Inbox data layer.
//
// Surfaces:
//   - loadLeadKpis()      — strip across the top
//   - loadLeadInbox()     — list w/ multi-filter + sort
//   - loadLeadDetail()    — profile + timeline + tasks + emails + routing
//   - loadFilterFacets()  — distinct values for region / industry / tags

import { db } from "@/lib/db";
import type {
  MarketingLeadKind,
  MarketingLeadStatus,
  LeadActivityKind,
  LeadEmailDirection,
} from "@prisma/client";

const DAY = 86_400_000;
const HOUR = 60 * 60 * 1000;

/* ── KPIs ──────────────────────────────────────────────── */

export interface LeadKpis {
  /** New leads created in the last 30 days. */
  leadsThisPeriod: number;
  /** Lead count by status — pulled into KPI cards + filter chip badges. */
  byStatus: Record<MarketingLeadStatus, number>;
  qualified: number;
  /** MQL → SQL conversion rate over the last 90 days. */
  mqlToSqlConvRate: number | null;
  /** Avg hours from lead creation → first contact, last 30 days. */
  avgFirstTouchHours: number | null;
  /** Leads without an owner — should be 0 if routing rules are healthy. */
  unassigned: number;
  periodDays: number;
}

export async function loadLeadKpis(periodDays = 30): Promise<LeadKpis> {
  const since = new Date(Date.now() - periodDays * DAY);
  const since90 = new Date(Date.now() - 90 * DAY);

  const [byStatusGroup, leadsThisPeriod, mqlSet, sqlSet, firstTouchRows, unassigned] = await Promise.all([
    db.marketingLead.groupBy({ by: ["status"], _count: { _all: true } }),
    db.marketingLead.count({ where: { createdAt: { gte: since } } }),
    db.marketingLead.count({ where: { mqlAt: { gte: since90 } } }),
    db.marketingLead.count({ where: { sqlAt: { gte: since90 } } }),
    db.marketingLead.findMany({
      where: {
        firstContactedAt: { gte: since },
        createdAt: { gte: since },
      },
      select: { firstContactedAt: true, createdAt: true },
    }),
    db.marketingLead.count({ where: { assignedToUserId: null, status: "NEW" } }),
  ]);

  const byStatus: Record<MarketingLeadStatus, number> = {
    NEW: 0, CONTACTED: 0, QUALIFIED: 0, CONVERTED: 0, DISQUALIFIED: 0, SPAM: 0,
  };
  for (const r of byStatusGroup) byStatus[r.status] = r._count._all;

  const touchHours = firstTouchRows
    .filter((r) => r.firstContactedAt && r.createdAt && r.firstContactedAt >= r.createdAt)
    .map((r) => (r.firstContactedAt!.getTime() - r.createdAt.getTime()) / HOUR);
  const avgFirstTouchHours = touchHours.length === 0
    ? null
    : touchHours.reduce((s, h) => s + h, 0) / touchHours.length;

  return {
    leadsThisPeriod,
    byStatus,
    qualified: byStatus.QUALIFIED + byStatus.CONVERTED,
    mqlToSqlConvRate: mqlSet === 0 ? null : sqlSet / mqlSet,
    avgFirstTouchHours,
    unassigned,
    periodDays,
  };
}

/* ── List ──────────────────────────────────────────────── */

export interface LeadInboxRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  source: MarketingLeadKind;
  sourcePath: string | null;
  status: MarketingLeadStatus;
  score: number;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerId: string | null;
  region: string | null;
  industry: string | null;
  tags: string[];
  createdAt: Date;
  lastTouchAt: Date | null;
  mqlAt: Date | null;
  sqlAt: Date | null;
}

export interface LeadInboxFilters {
  q?: string;
  status?: MarketingLeadStatus | "ALL";
  source?: MarketingLeadKind | "ALL";
  ownerId?: string | "ALL" | "UNASSIGNED" | "MINE";
  scoreMin?: number;
  scoreMax?: number;
  createdFrom?: Date;
  createdTo?: Date;
  region?: string;
  industry?: string;
  tag?: string;
}

export async function loadLeadInbox(
  filters: LeadInboxFilters,
  opts: { page?: number; pageSize?: number; viewerId?: string | null } = {},
): Promise<{ rows: LeadInboxRow[]; total: number; pageSize: number; page: number }> {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);

  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { email:   { contains: filters.q, mode: "insensitive" } },
        { name:    { contains: filters.q, mode: "insensitive" } },
        { company: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.source && filters.source !== "ALL") conditions.push({ kind:   filters.source });
  if (filters.ownerId === "UNASSIGNED")              conditions.push({ assignedToUserId: null });
  else if (filters.ownerId === "MINE" && opts.viewerId) conditions.push({ assignedToUserId: opts.viewerId });
  else if (filters.ownerId && filters.ownerId !== "ALL") conditions.push({ assignedToUserId: filters.ownerId });
  if (filters.scoreMin != null) conditions.push({ score: { gte: filters.scoreMin } });
  if (filters.scoreMax != null) conditions.push({ score: { lte: filters.scoreMax } });
  if (filters.createdFrom)      conditions.push({ createdAt: { gte: filters.createdFrom } });
  if (filters.createdTo)        conditions.push({ createdAt: { lte: filters.createdTo } });
  if (filters.region)           conditions.push({ region:   filters.region });
  if (filters.industry)         conditions.push({ industry: filters.industry });
  if (filters.tag)              conditions.push({ tags: { has: filters.tag } });

  const where = conditions.length === 0 ? {} : { AND: conditions };

  const [total, rows] = await Promise.all([
    db.marketingLead.count({ where }),
    db.marketingLead.findMany({
      where,
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);

  // Resolve owner names once via a single users query.
  const ownerIds = Array.from(new Set(rows.map((r) => r.assignedToUserId).filter((x): x is string => Boolean(x))));
  const owners = ownerIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, email: true },
  });
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  return {
    rows: rows.map((r) => {
      const owner = r.assignedToUserId ? ownerMap.get(r.assignedToUserId) : undefined;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        company: r.company,
        source: r.kind,
        sourcePath: r.source,
        status: r.status,
        score: r.score,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        ownerId: r.assignedToUserId,
        region: r.region,
        industry: r.industry,
        tags: r.tags,
        createdAt: r.createdAt,
        lastTouchAt: r.lastActivityAt ?? r.lastContactedAt ?? null,
        mqlAt: r.mqlAt,
        sqlAt: r.sqlAt,
      };
    }),
    total,
    pageSize,
    page,
  };
}

/* ── Filter facets ──────────────────────────────────── */

export interface LeadFilterFacets {
  regions: string[];
  industries: string[];
  tags: string[];
  /** Active platform users that own at least one lead. */
  owners: Array<{ id: string; name: string | null; email: string; count: number }>;
}

export async function loadLeadFilterFacets(): Promise<LeadFilterFacets> {
  const [regions, industries, tagsAgg, ownerAgg] = await Promise.all([
    db.marketingLead.findMany({
      where: { region: { not: null } },
      select: { region: true },
      distinct: ["region"],
    }),
    db.marketingLead.findMany({
      where: { industry: { not: null } },
      select: { industry: true },
      distinct: ["industry"],
    }),
    db.marketingLead.findMany({ select: { tags: true } }),
    db.marketingLead.groupBy({
      by: ["assignedToUserId"],
      where: { assignedToUserId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const tags = new Set<string>();
  for (const r of tagsAgg) for (const t of r.tags) tags.add(t);

  const ownerIds = ownerAgg.map((o) => o.assignedToUserId!).filter(Boolean);
  const owners = ownerIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, email: true },
  });
  const ownerCountMap = new Map(ownerAgg.map((o) => [o.assignedToUserId!, o._count._all]));

  return {
    regions: regions.map((r) => r.region!).filter(Boolean).sort(),
    industries: industries.map((r) => r.industry!).filter(Boolean).sort(),
    tags: Array.from(tags).sort(),
    owners: owners.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      count: ownerCountMap.get(u.id) ?? 0,
    })).sort((a, b) => b.count - a.count),
  };
}

/* ── Detail ───────────────────────────────────────── */

export interface LeadActivityRow {
  id: string;
  kind: LeadActivityKind;
  detail: string | null;
  url: string | null;
  occurredAt: Date;
}

export interface LeadTaskRow {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  createdAt: Date;
}

export interface LeadEmailRow {
  id: string;
  direction: LeadEmailDirection;
  subject: string;
  body: string;
  fromEmail: string;
  toEmail: string;
  authorName: string | null;
  createdAt: Date;
}

export interface LeadRoutingRow {
  id: string;
  ruleName: string;
  action: string;
  detail: string | null;
  occurredAt: Date;
}

export interface LeadDetailView {
  lead: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    company: string | null;
    role: string | null;
    teamSize: string | null;
    timezone: string | null;
    region: string | null;
    industry: string | null;
    tags: string[];
    source: MarketingLeadKind;
    sourcePath: string | null;
    referrer: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    status: MarketingLeadStatus;
    score: number;
    scoreFactors: Array<{ factor: string; points: number; source?: string }>;
    notes: string | null;
    message: string | null;
    mqlAt: Date | null;
    sqlAt: Date | null;
    convertedAt: Date | null;
    convertedTenantId: string | null;
    convertedTenantSlug: string | null;
    convertedTenantName: string | null;
    disqualifiedReason: string | null;
    firstContactedAt: Date | null;
    lastContactedAt: Date | null;
    createdAt: Date;
    ownerId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
  };
  activities: LeadActivityRow[];
  tasks: { open: LeadTaskRow[]; completed: LeadTaskRow[] };
  emails: LeadEmailRow[];
  routing: LeadRoutingRow[];
}

export async function loadLeadDetail(id: string): Promise<LeadDetailView | null> {
  const lead = await db.marketingLead.findUnique({ where: { id } });
  if (!lead) return null;

  const [activities, tasks, emails, routing, owner, tenant] = await Promise.all([
    db.leadActivity.findMany({
      where: { leadId: id },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
    db.leadTask.findMany({
      where: { leadId: id },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    db.leadEmailMessage.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.leadRoutingEvent.findMany({
      where: { leadId: id },
      orderBy: { occurredAt: "desc" },
      take: 30,
    }),
    lead.assignedToUserId
      ? db.user.findUnique({ where: { id: lead.assignedToUserId }, select: { id: true, name: true, email: true } })
      : Promise.resolve(null),
    lead.convertedTenantId
      ? db.tenant.findUnique({ where: { id: lead.convertedTenantId }, select: { id: true, name: true, slug: true } })
      : Promise.resolve(null),
  ]);

  const taskOwnerIds = Array.from(new Set(tasks.map((t) => t.assignedToUserId).filter((x): x is string => Boolean(x))));
  const taskOwners = taskOwnerIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: taskOwnerIds } },
    select: { id: true, name: true, email: true },
  });
  const taskOwnerMap = new Map(taskOwners.map((u) => [u.id, u]));

  const authorIds = Array.from(new Set(emails.map((e) => e.authorId).filter((x): x is string => Boolean(x))));
  const authors = authorIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true },
  });
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  const factorsRaw = Array.isArray(lead.scoreFactors) ? lead.scoreFactors as unknown[] : [];
  const scoreFactors: Array<{ factor: string; points: number; source?: string }> = factorsRaw
    .filter((f) => f && typeof f === "object" && "factor" in f && "points" in f)
    .map((f) => {
      const o = f as { factor: unknown; points: unknown; source?: unknown };
      return {
        factor: String(o.factor),
        points: Number(o.points) || 0,
        source: typeof o.source === "string" ? o.source : undefined,
      };
    });

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      role: lead.role,
      teamSize: lead.teamSize,
      timezone: lead.timezone,
      region: lead.region,
      industry: lead.industry,
      tags: lead.tags,
      source: lead.kind,
      sourcePath: lead.source,
      referrer: lead.referrer,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      status: lead.status,
      score: lead.score,
      scoreFactors,
      notes: lead.notes,
      message: lead.message,
      mqlAt: lead.mqlAt,
      sqlAt: lead.sqlAt,
      convertedAt: lead.convertedAt,
      convertedTenantId: lead.convertedTenantId,
      convertedTenantSlug: tenant?.slug ?? null,
      convertedTenantName: tenant?.name ?? null,
      disqualifiedReason: lead.disqualifiedReason,
      firstContactedAt: lead.firstContactedAt,
      lastContactedAt: lead.lastContactedAt,
      createdAt: lead.createdAt,
      ownerId: lead.assignedToUserId,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
    },
    activities: activities.map((a) => ({
      id: a.id,
      kind: a.kind,
      detail: a.detail,
      url: a.url,
      occurredAt: a.occurredAt,
    })),
    tasks: {
      open:      tasks.filter((t) => t.completedAt == null).map((t) => mapTask(t, taskOwnerMap)),
      completed: tasks.filter((t) => t.completedAt != null).map((t) => mapTask(t, taskOwnerMap)),
    },
    emails: emails.map((e) => ({
      id: e.id,
      direction: e.direction,
      subject: e.subject,
      body: e.body,
      fromEmail: e.fromEmail,
      toEmail: e.toEmail,
      authorName: e.authorId ? authorMap.get(e.authorId)?.name ?? null : null,
      createdAt: e.createdAt,
    })),
    routing: routing.map((r) => ({
      id: r.id,
      ruleName: r.ruleName,
      action: r.action,
      detail: r.detail,
      occurredAt: r.occurredAt,
    })),
  };
}

function mapTask(t: {
  id: string; title: string; notes: string | null; dueAt: Date | null;
  completedAt: Date | null; assignedToUserId: string | null; createdAt: Date;
}, owners: Map<string, { id: string; name: string | null; email: string }>): LeadTaskRow {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    dueAt: t.dueAt,
    completedAt: t.completedAt,
    assignedToUserId: t.assignedToUserId,
    assignedToName: t.assignedToUserId
      ? owners.get(t.assignedToUserId)?.name ?? owners.get(t.assignedToUserId)?.email ?? null
      : null,
    createdAt: t.createdAt,
  };
}

/* ── Helpers ──────────────────────────────────────────── */

export function statusLabel(s: MarketingLeadStatus): string {
  switch (s) {
    case "NEW":          return "New";
    case "CONTACTED":    return "Contacted";
    case "QUALIFIED":    return "Qualified";
    case "CONVERTED":    return "Converted";
    case "DISQUALIFIED": return "Disqualified";
    case "SPAM":         return "Spam";
  }
}

export function statusTone(s: MarketingLeadStatus): { bg: string; fg: string } {
  switch (s) {
    case "NEW":          return { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" };
    case "CONTACTED":    return { bg: "var(--surface-2)",       fg: "var(--text-default)"   };
    case "QUALIFIED":    return { bg: "var(--success-surface)", fg: "var(--success-fg)"     };
    case "CONVERTED":    return { bg: "var(--success-surface)", fg: "var(--success-fg)"     };
    case "DISQUALIFIED": return { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     };
    case "SPAM":         return { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" };
  }
}

export function sourceLabel(s: MarketingLeadKind): string {
  switch (s) {
    case "INQUIRY":       return "Contact form";
    case "DEMO":          return "Demo request";
    case "NEWSLETTER":    return "Newsletter";
    case "TRIAL_ABANDON": return "Trial signup";
  }
}

export function activityLabel(k: LeadActivityKind): string {
  switch (k) {
    case "PAGE_VIEW":         return "Page view";
    case "FORM_SUBMIT":       return "Form submit";
    case "EMAIL_SENT":        return "Email sent";
    case "EMAIL_OPENED":      return "Email opened";
    case "EMAIL_CLICKED":     return "Link clicked";
    case "CALL_MADE":         return "Call made";
    case "CALL_RECEIVED":     return "Call received";
    case "MEETING_SCHEDULED": return "Meeting scheduled";
    case "MEETING_COMPLETED": return "Meeting completed";
    case "NOTE_ADDED":        return "Note added";
    case "STATUS_CHANGED":    return "Status changed";
    case "SCORE_UPDATED":     return "Score updated";
    case "ASSIGNED":          return "Assigned";
    case "CONVERTED":         return "Converted";
    case "TAG_ADDED":         return "Tag added";
    case "TASK_COMPLETED":    return "Task completed";
  }
}

export function activityIcon(k: LeadActivityKind): string {
  switch (k) {
    case "PAGE_VIEW":         return "👁";
    case "FORM_SUBMIT":       return "📝";
    case "EMAIL_SENT":        return "📤";
    case "EMAIL_OPENED":      return "📬";
    case "EMAIL_CLICKED":     return "🔗";
    case "CALL_MADE":         return "📞";
    case "CALL_RECEIVED":     return "📲";
    case "MEETING_SCHEDULED": return "🗓";
    case "MEETING_COMPLETED": return "✅";
    case "NOTE_ADDED":        return "📒";
    case "STATUS_CHANGED":    return "⇄";
    case "SCORE_UPDATED":     return "📈";
    case "ASSIGNED":          return "👤";
    case "CONVERTED":         return "🎯";
    case "TAG_ADDED":         return "🏷";
    case "TASK_COMPLETED":    return "☑";
  }
}

/** Compute a lead score from profile + activity. Pure function — fed by
 *  the recompute action. Returns score (clamped 0-100) + factor list. */
export function computeLeadScore(input: {
  hasCompany: boolean;
  hasPhone: boolean;
  teamSize: string | null;
  hasMessage: boolean;
  source: MarketingLeadKind;
  pageViews: number;
  formSubmits: number;
  emailOpens: number;
  emailClicks: number;
  meetingsScheduled: number;
  callsLogged: number;
  daysSinceCreate: number;
}): { score: number; factors: Array<{ factor: string; points: number; source: string }> } {
  const factors: Array<{ factor: string; points: number; source: string }> = [];
  if (input.hasCompany)  factors.push({ factor: "Provided company name", points: 10, source: "profile" });
  if (input.hasPhone)    factors.push({ factor: "Provided phone number", points: 8, source: "profile" });
  if (input.teamSize === "26-100" || input.teamSize === "100+") {
    factors.push({ factor: "Mid/large team size", points: 10, source: "profile" });
  } else if (input.teamSize === "6-25") {
    factors.push({ factor: "Growing team size", points: 6, source: "profile" });
  }
  if (input.hasMessage)  factors.push({ factor: "Wrote a message", points: 5, source: "profile" });

  if (input.source === "DEMO")          factors.push({ factor: "Demo request",      points: 25, source: "intent" });
  else if (input.source === "INQUIRY")  factors.push({ factor: "Contact inquiry",   points: 12, source: "intent" });
  else if (input.source === "TRIAL_ABANDON") factors.push({ factor: "Started signup", points: 18, source: "intent" });
  else if (input.source === "NEWSLETTER") factors.push({ factor: "Newsletter signup", points: 3, source: "intent" });

  if (input.pageViews >= 5)   factors.push({ factor: "5+ page views", points: 8, source: "engagement" });
  else if (input.pageViews >= 2) factors.push({ factor: "2+ page views", points: 4, source: "engagement" });

  if (input.formSubmits >= 2) factors.push({ factor: "Multiple form submits", points: 6, source: "engagement" });
  if (input.emailOpens >= 3)  factors.push({ factor: "Engaged with emails (3+)", points: 6, source: "engagement" });
  if (input.emailClicks >= 1) factors.push({ factor: "Clicked link in email", points: 8, source: "engagement" });
  if (input.meetingsScheduled >= 1) factors.push({ factor: "Booked a meeting", points: 15, source: "engagement" });
  if (input.callsLogged >= 1) factors.push({ factor: "Phone conversation", points: 10, source: "engagement" });

  if (input.daysSinceCreate > 30 && input.emailOpens === 0 && input.pageViews === 0) {
    factors.push({ factor: "Cold for 30+ days", points: -10, source: "freshness" });
  }

  let score = factors.reduce((s, f) => s + f.points, 0);
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  return { score, factors };
}
