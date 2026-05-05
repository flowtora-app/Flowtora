// Page 39 — Email Campaigns data layer + segment evaluator.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  EmailCampaignType,
  EmailCampaignStatus,
  EmailRecipientStatus,
  EmailSendStrategy,
  Plan,
  TenantStatus,
  BetaCohort,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Segment DSL ───────────────────────────────────────── */

export interface SegmentFilter {
  /** Tenant.plan ∈ list. */
  plans?: string[];
  /** Tenant.status ∈ list. */
  tenantStatuses?: string[];
  /** Match if Tenant.tags overlaps any. */
  tagsAny?: string[];
  /** Match if Tenant.region matches one of the listed regions. */
  regions?: string[];
  /** Tenant.betaCohort ∈ list. */
  cohorts?: string[];
  /** Tenant.createdAt range. */
  signupAfter?: string;  // ISO
  signupBefore?: string; // ISO
  /** Membership.lastLoginAt range. */
  lastLoginAfter?: string;
  lastLoginBefore?: string;
  /** Tenant MRR range — pulled from PricingPlan.* + Subscription. */
  mrrMin?: number;
  mrrMax?: number;
  /** Recipients are tenant-side users; choose role filter. */
  memberRoles?: ("OWNER" | "ADMIN" | "MEMBER")[];
  /** Whether to include suspended tenants. Default: false. */
  includeSuspended?: boolean;
  /** Hard cap audience size for safety. */
  limit?: number;
}

/** Resolve a segment to a list of recipient candidates with hydrate-able info. */
export interface RecipientCandidate {
  email: string;
  userId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantPlan: string | null;
  region: string | null;
  /** Per-recipient merge fields exposed to the renderer. */
  mergeData: Record<string, unknown>;
}

export async function resolveSegment(filter: SegmentFilter): Promise<RecipientCandidate[]> {
  const tenantWhere: Prisma.TenantWhereInput = {};
  const ands: Prisma.TenantWhereInput[] = [];
  if (filter.plans && filter.plans.length > 0) {
    ands.push({ plan: { in: filter.plans as Plan[] } });
  }
  if (filter.tenantStatuses && filter.tenantStatuses.length > 0) {
    ands.push({ status: { in: filter.tenantStatuses as TenantStatus[] } });
  }
  if (!filter.includeSuspended) {
    ands.push({ status: { notIn: ["SUSPENDED", "ARCHIVED"] as TenantStatus[] } });
  }
  if (filter.regions && filter.regions.length > 0) {
    ands.push({ region: { in: filter.regions } });
  }
  if (filter.cohorts && filter.cohorts.length > 0) {
    ands.push({ betaCohort: { in: filter.cohorts as BetaCohort[] } });
  }
  if (filter.tagsAny && filter.tagsAny.length > 0) {
    ands.push({ adminTags: { hasSome: filter.tagsAny.map((t) => t.toLowerCase()) } });
  }
  if (filter.signupAfter)  ands.push({ createdAt: { gte: new Date(filter.signupAfter) } });
  if (filter.signupBefore) ands.push({ createdAt: { lte: new Date(filter.signupBefore) } });
  if (ands.length > 0) tenantWhere.AND = ands;

  const tenants = await db.tenant.findMany({
    where: tenantWhere,
    select: {
      id: true, name: true, plan: true, region: true, status: true, slug: true,
      memberships: {
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, email: true, name: true, lastLoginAt: true } },
        },
      },
    },
    take: 5_000,
  });

  const out: RecipientCandidate[] = [];
  const memberRoles = filter.memberRoles ?? ["OWNER", "ADMIN"];
  for (const t of tenants) {
    for (const m of t.memberships) {
      if (!memberRoles.includes(m.role as "OWNER" | "ADMIN" | "MEMBER")) continue;
      const userLastLogin = m.user.lastLoginAt;
      if (filter.lastLoginAfter && (!userLastLogin || userLastLogin < new Date(filter.lastLoginAfter))) continue;
      if (filter.lastLoginBefore && (!userLastLogin || userLastLogin > new Date(filter.lastLoginBefore))) continue;
      const email = m.user.email;
      if (!email) continue;
      out.push({
        email,
        userId: m.user.id,
        tenantId: t.id,
        tenantName: t.name,
        tenantPlan: t.plan,
        region: t.region ?? null,
        mergeData: {
          firstName: m.user.name?.split(" ")[0] ?? "",
          tenantName: t.name,
          tenantSlug: t.slug,
          plan: t.plan,
          region: t.region ?? "",
        },
      });
    }
  }

  // Filter out unsubscribed addresses.
  const unsubs = await db.emailUnsubscribe.findMany({ select: { email: true } });
  const unsubSet = new Set(unsubs.map((u) => u.email.toLowerCase()));
  const filtered = out.filter((c) => !unsubSet.has(c.email.toLowerCase()));

  if (filter.limit && filter.limit > 0 && filtered.length > filter.limit) {
    return filtered.slice(0, filter.limit);
  }
  return filtered;
}

export async function estimateAudience(filter: SegmentFilter): Promise<number> {
  const r = await resolveSegment(filter);
  return r.length;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface CampaignKpis {
  drafts: number;
  scheduled: number;
  sending: number;
  sent: number;
  paused: number;
  /** Sum of all recipients across SENT campaigns in the last 30d. */
  delivered30d: number;
  opens30d: number;
  clicks30d: number;
  unsubscribes30d: number;
  /** opens / delivered, 30d. */
  openRate30d: number | null;
  /** clicks / delivered, 30d. */
  ctr30d: number | null;
}

export async function loadCampaignKpis(): Promise<CampaignKpis> {
  const since = new Date(Date.now() - 30 * DAY);
  const [byStatus, recipients] = await Promise.all([
    db.emailCampaign.groupBy({ by: ["status"], _count: { _all: true } }),
    db.emailCampaignRecipient.findMany({
      where: { sentAt: { gte: since } },
      select: { status: true, deliveredAt: true, openedAt: true, clickedAt: true, unsubscribedAt: true },
      take: 50_000,
    }),
  ]);
  const statusMap = new Map<EmailCampaignStatus, number>();
  for (const r of byStatus) statusMap.set(r.status, r._count._all);
  const delivered = recipients.filter((r) => r.deliveredAt != null).length;
  const opens     = recipients.filter((r) => r.openedAt != null).length;
  const clicks    = recipients.filter((r) => r.clickedAt != null).length;
  const unsubs    = recipients.filter((r) => r.unsubscribedAt != null).length;
  return {
    drafts: statusMap.get("DRAFT") ?? 0,
    scheduled: statusMap.get("SCHEDULED") ?? 0,
    sending: statusMap.get("SENDING") ?? 0,
    sent: statusMap.get("SENT") ?? 0,
    paused: statusMap.get("PAUSED") ?? 0,
    delivered30d: delivered,
    opens30d: opens,
    clicks30d: clicks,
    unsubscribes30d: unsubs,
    openRate30d: delivered === 0 ? null : opens / delivered,
    ctr30d:      delivered === 0 ? null : clicks / delivered,
  };
}

/* ── List rows ─────────────────────────────────────────── */

export interface CampaignRow {
  id: string;
  name: string;
  type: EmailCampaignType;
  status: EmailCampaignStatus;
  language: string;
  audienceSize: number;
  fromEmail: string | null;
  scheduledAt: Date | null;
  startedSendingAt: Date | null;
  completedSendingAt: Date | null;
  /** Recipient counters (denormalized). */
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  bouncedCount: number;
  unsubscribedCount: number;
  /** Rates. */
  openRate: number | null;
  ctr: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
  variantCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignListFilters {
  q?: string;
  status?: EmailCampaignStatus;
  type?: EmailCampaignType;
}

function buildWhere(f: CampaignListFilters): Prisma.EmailCampaignWhereInput {
  const where: Prisma.EmailCampaignWhereInput = {};
  const ands: Prisma.EmailCampaignWhereInput[] = [];
  if (f.status) ands.push({ status: f.status });
  if (f.type)   ands.push({ type: f.type });
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { fromEmail: { contains: f.q, mode: "insensitive" } },
    ];
  }
  if (ands.length > 0) where.AND = ands;
  return where;
}

export async function loadCampaignList(args: {
  filters: CampaignListFilters;
  page: number;
  pageSize: number;
}): Promise<{ rows: CampaignRow[]; total: number; filteredTotal: number }> {
  const where = buildWhere(args.filters);
  const [total, filteredTotal, rows] = await Promise.all([
    db.emailCampaign.count(),
    db.emailCampaign.count({ where }),
    db.emailCampaign.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: { _count: { select: { variants: true } } },
    }),
  ]);

  // Per-campaign recipient counters (single grouped read each).
  const ids = rows.map((r) => r.id);
  const groups = ids.length === 0 ? [] : await db.emailCampaignRecipient.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { in: ids } },
    _count: { _all: true },
  });
  const tally = new Map<string, Record<EmailRecipientStatus, number>>();
  for (const g of groups) {
    const cell = tally.get(g.campaignId) ?? emptyTally();
    cell[g.status] = g._count._all;
    tally.set(g.campaignId, cell);
  }
  // The "delivered+" counters are cumulative — anyone who reached OPENED or
  // CLICKED also DELIVERED. Compute totals properly.
  const cumulative = (row: string): { delivered: number; opened: number; clicked: number; bounced: number; unsub: number; sent: number } => {
    const t = tally.get(row) ?? emptyTally();
    return {
      sent:      t.SENT + t.DELIVERED + t.OPENED + t.CLICKED + t.BOUNCED + t.UNSUBSCRIBED + t.COMPLAINED,
      delivered: t.DELIVERED + t.OPENED + t.CLICKED + t.UNSUBSCRIBED,
      opened:    t.OPENED + t.CLICKED,
      clicked:   t.CLICKED,
      bounced:   t.BOUNCED,
      unsub:     t.UNSUBSCRIBED,
    };
  };

  return {
    total, filteredTotal,
    rows: rows.map((r): CampaignRow => {
      const c = cumulative(r.id);
      const openRate  = c.delivered === 0 ? null : c.opened    / c.delivered;
      const ctr       = c.delivered === 0 ? null : c.clicked   / c.delivered;
      const bouncRate = c.sent      === 0 ? null : c.bounced   / c.sent;
      const unsubRate = c.delivered === 0 ? null : c.unsub     / c.delivered;
      return {
        id: r.id,
        name: r.name,
        type: r.type,
        status: r.status,
        language: r.language,
        audienceSize: r.audienceSize,
        fromEmail: r.fromEmail,
        scheduledAt: r.scheduledAt,
        startedSendingAt: r.startedSendingAt,
        completedSendingAt: r.completedSendingAt,
        sentCount:        c.sent,
        deliveredCount:   c.delivered,
        openedCount:      c.opened,
        clickedCount:     c.clicked,
        bouncedCount:     c.bounced,
        unsubscribedCount: c.unsub,
        openRate, ctr, bounceRate: bouncRate, unsubscribeRate: unsubRate,
        variantCount: r._count.variants,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    }),
  };
}

function emptyTally(): Record<EmailRecipientStatus, number> {
  return {
    QUEUED: 0, SENT: 0, DELIVERED: 0, OPENED: 0, CLICKED: 0,
    BOUNCED: 0, UNSUBSCRIBED: 0, COMPLAINED: 0, FAILED: 0,
  };
}

/* ── Detail ────────────────────────────────────────────── */

export interface CampaignDetail extends CampaignRow {
  audienceFilter: SegmentFilter;
  fromName: string | null;
  replyToEmail: string | null;
  previewText: string | null;
  bodyHtml: string;
  bodyText: string;
  bodyMarkdown: string;
  templateId: string | null;
  templateName: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  conversionGoal: string | null;
  sendStrategy: EmailSendStrategy;
  recurrenceRule: string | null;
  pausedAt: Date | null;
  variants: {
    id: string;
    label: string;
    subject: string;
    previewText: string | null;
    weightPct: number;
    sentCount: number;
    openedCount: number;
    clickedCount: number;
  }[];
  /** Funnel counters for the per-campaign performance section. */
  funnel: { label: string; count: number }[];
  /** Click heatmap — top hrefs with counts. */
  topClicks: { href: string; count: number }[];
  /** Per-recipient drill-down (paged separately). */
  recipientCount: number;
}

export async function loadCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const row = await db.emailCampaign.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { label: "asc" } },
      template: { select: { id: true, name: true } },
      _count: { select: { recipients: true } },
    },
  });
  if (!row) return null;

  // Recipient tally for funnel/rates.
  const groups = await db.emailCampaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  const t = emptyTally();
  for (const g of groups) t[g.status] = g._count._all;

  const sent      = t.SENT + t.DELIVERED + t.OPENED + t.CLICKED + t.BOUNCED + t.UNSUBSCRIBED + t.COMPLAINED;
  const delivered = t.DELIVERED + t.OPENED + t.CLICKED + t.UNSUBSCRIBED;
  const opened    = t.OPENED + t.CLICKED;
  const clicked   = t.CLICKED;
  const unsub     = t.UNSUBSCRIBED;
  const bounced   = t.BOUNCED;
  const complained = t.COMPLAINED;
  const conv = await db.emailCampaignClickEvent.count({ where: { campaignId: id } });
  void conv;

  const funnel = [
    { label: "Sent",         count: sent },
    { label: "Delivered",    count: delivered },
    { label: "Opened",       count: opened },
    { label: "Clicked",      count: clicked },
    { label: "Unsubscribed", count: unsub },
    { label: "Complained",   count: complained },
  ];

  const topClicksRaw = await db.emailCampaignClickEvent.groupBy({
    by: ["href"],
    where: { campaignId: id },
    _count: { _all: true },
    orderBy: { _count: { href: "desc" } },
    take: 12,
  });

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    language: row.language,
    audienceSize: row.audienceSize,
    fromEmail: row.fromEmail,
    scheduledAt: row.scheduledAt,
    startedSendingAt: row.startedSendingAt,
    completedSendingAt: row.completedSendingAt,
    sentCount: sent,
    deliveredCount: delivered,
    openedCount: opened,
    clickedCount: clicked,
    bouncedCount: bounced,
    unsubscribedCount: unsub,
    openRate:    delivered === 0 ? null : opened   / delivered,
    ctr:         delivered === 0 ? null : clicked  / delivered,
    bounceRate:  sent      === 0 ? null : bounced  / sent,
    unsubscribeRate: delivered === 0 ? null : unsub / delivered,
    variantCount: row.variants.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,

    audienceFilter: (row.audienceFilter ?? {}) as SegmentFilter,
    fromName: row.fromName,
    replyToEmail: row.replyToEmail,
    previewText: row.previewText,
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    bodyMarkdown: row.bodyMarkdown,
    templateId: row.templateId,
    templateName: row.template?.name ?? null,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    conversionGoal: row.conversionGoal,
    sendStrategy: row.sendStrategy,
    recurrenceRule: row.recurrenceRule,
    pausedAt: row.pausedAt,
    variants: row.variants.map((v) => ({
      id: v.id,
      label: v.label,
      subject: v.subject,
      previewText: v.previewText,
      weightPct: v.weightPct,
      sentCount: v.sentCount,
      openedCount: v.openedCount,
      clickedCount: v.clickedCount,
    })),
    funnel,
    topClicks: topClicksRaw.map((c) => ({ href: c.href, count: c._count._all })),
    recipientCount: row._count.recipients,
  };
}

/* ── Per-recipient drill-down ──────────────────────────── */

export interface RecipientRow {
  id: string;
  email: string;
  tenantId: string | null;
  tenantName: string | null;
  status: EmailRecipientStatus;
  variantLabel: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  bouncedAt: Date | null;
  unsubscribedAt: Date | null;
  failureReason: string | null;
}

export async function loadRecipients(args: {
  campaignId: string;
  status?: EmailRecipientStatus;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: RecipientRow[]; total: number }> {
  const where: Prisma.EmailCampaignRecipientWhereInput = { campaignId: args.campaignId };
  if (args.status) where.status = args.status;
  if (args.q) where.email = { contains: args.q, mode: "insensitive" };

  const [total, rows] = await Promise.all([
    db.emailCampaignRecipient.count({ where }),
    db.emailCampaignRecipient.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
    }),
  ]);
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => Boolean(x))));
  const variantIds = Array.from(new Set(rows.map((r) => r.variantId).filter((x): x is string => Boolean(x))));
  const [tenants, variants] = await Promise.all([
    tenantIds.length === 0 ? [] : db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    variantIds.length === 0 ? [] : db.emailCampaignSubjectVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, label: true } }),
  ]);
  const tMap = new Map(tenants.map((t) => [t.id, t]));
  const vMap = new Map(variants.map((v) => [v.id, v]));
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      tenantId: r.tenantId,
      tenantName: r.tenantId ? tMap.get(r.tenantId)?.name ?? null : null,
      status: r.status,
      variantLabel: r.variantId ? vMap.get(r.variantId)?.label ?? null : null,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
      openedAt: r.openedAt,
      clickedAt: r.clickedAt,
      bouncedAt: r.bouncedAt,
      unsubscribedAt: r.unsubscribedAt,
      failureReason: r.failureReason,
    })),
  };
}

/* ── Audiences + templates ─────────────────────────────── */

export async function loadAudiences() {
  return db.emailAudience.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function loadEmailTemplates() {
  return db.emailTemplate.findMany({ orderBy: { name: "asc" } });
}

/* ── Performance dashboard ─────────────────────────────── */

export interface PerformanceSnapshot {
  /** Daily delivered/opened/clicked counts for the last 30d. */
  daily: { date: string; delivered: number; opened: number; clicked: number }[];
  /** Top campaigns by CTR in last 30d. */
  top: { id: string; name: string; ctr: number; openRate: number; sent: number }[];
}

export async function loadPerformanceSnapshot(days = 30): Promise<PerformanceSnapshot> {
  const since = new Date(Date.now() - days * DAY);
  since.setHours(0, 0, 0, 0);

  const recipients = await db.emailCampaignRecipient.findMany({
    where: { sentAt: { gte: since } },
    select: { sentAt: true, deliveredAt: true, openedAt: true, clickedAt: true, campaignId: true },
    take: 50_000,
  });

  const dayMap = new Map<string, { delivered: number; opened: number; clicked: number }>();
  for (let i = 0; i < days; i++) {
    const k = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    dayMap.set(k, { delivered: 0, opened: 0, clicked: 0 });
  }
  for (const r of recipients) {
    if (r.deliveredAt) {
      const k = r.deliveredAt.toISOString().slice(0, 10);
      const cell = dayMap.get(k); if (cell) cell.delivered += 1;
    }
    if (r.openedAt) {
      const k = r.openedAt.toISOString().slice(0, 10);
      const cell = dayMap.get(k); if (cell) cell.opened += 1;
    }
    if (r.clickedAt) {
      const k = r.clickedAt.toISOString().slice(0, 10);
      const cell = dayMap.get(k); if (cell) cell.clicked += 1;
    }
  }
  const daily = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top campaigns.
  const perCampaign = new Map<string, { delivered: number; opened: number; clicked: number; sent: number }>();
  for (const r of recipients) {
    const cell = perCampaign.get(r.campaignId) ?? { delivered: 0, opened: 0, clicked: 0, sent: 0 };
    cell.sent += r.sentAt ? 1 : 0;
    cell.delivered += r.deliveredAt ? 1 : 0;
    cell.opened += r.openedAt ? 1 : 0;
    cell.clicked += r.clickedAt ? 1 : 0;
    perCampaign.set(r.campaignId, cell);
  }
  const ids = Array.from(perCampaign.keys());
  const campaigns = ids.length === 0 ? [] : await db.emailCampaign.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(campaigns.map((c) => [c.id, c.name]));
  const top = Array.from(perCampaign.entries())
    .map(([id, v]) => ({
      id,
      name: nameMap.get(id) ?? "(deleted)",
      ctr: v.delivered === 0 ? 0 : v.clicked / v.delivered,
      openRate: v.delivered === 0 ? 0 : v.opened / v.delivered,
      sent: v.sent,
    }))
    .filter((c) => c.sent >= 5)
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 10);

  return { daily, top };
}

/* ── Preflight checks ──────────────────────────────────── */

export interface PreflightCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

export interface PreflightReport {
  score: number; // 0..100
  checks: PreflightCheck[];
  /** Spam-score heuristic: 0 (clean) → 5 (very spammy). */
  spamScore: number;
}

export function runPreflight(opts: {
  fromName: string | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  subject: string | null;
  bodyHtml: string;
  bodyText: string;
  previewText: string | null;
}): PreflightReport {
  const checks: PreflightCheck[] = [];

  // From / reply-to
  checks.push({
    id: "from",
    label: "Sender configured",
    status: opts.fromEmail && /.+@.+\..+/.test(opts.fromEmail) ? "pass" : "fail",
    detail: opts.fromEmail
      ? `${opts.fromName ?? ""} <${opts.fromEmail}>`
      : "From address required",
  });
  checks.push({
    id: "reply-to",
    label: "Reply-to set",
    status: opts.replyToEmail && /.+@.+\..+/.test(opts.replyToEmail) ? "pass" : "warn",
    detail: opts.replyToEmail ?? "Optional but recommended",
  });

  // Subject
  const subj = opts.subject ?? "";
  checks.push({
    id: "subject-length",
    label: "Subject length 30-60",
    status: subj.length >= 30 && subj.length <= 60 ? "pass"
          : subj.length === 0 ? "fail"
          : "warn",
    detail: `${subj.length} chars`,
  });
  checks.push({
    id: "preview-text",
    label: "Preview text set",
    status: opts.previewText ? "pass" : "warn",
    detail: opts.previewText ?? "Inboxes show the body's first sentence when missing",
  });

  // Body content
  const text = opts.bodyText.trim();
  const wc = (text.match(/\b\w+\b/g) ?? []).length;
  checks.push({
    id: "body-length",
    label: "Body has ≥50 words",
    status: wc >= 50 ? "pass" : wc >= 20 ? "warn" : "fail",
    detail: `${wc} words`,
  });

  // Image alt
  const imgs = opts.bodyHtml.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((tag) => !/alt\s*=/i.test(tag)).length;
  checks.push({
    id: "image-alt",
    label: "All images have alt",
    status: imgs.length === 0 ? "pass" : missingAlt === 0 ? "pass" : "warn",
    detail: imgs.length === 0 ? "No images" : `${missingAlt} of ${imgs.length} missing alt`,
  });

  // Dead-link sniff (just verify URL shape; HTTP HEAD is too slow + flaky for preflight).
  const hrefs = Array.from(opts.bodyHtml.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
  const malformed = hrefs.filter((h) => !/^(https?:\/\/|mailto:|tel:|\/|#|\{\{)/i.test(h ?? ""));
  checks.push({
    id: "dead-links",
    label: "Hrefs well-formed",
    status: hrefs.length === 0 ? "pass" : malformed.length === 0 ? "pass" : "warn",
    detail: hrefs.length === 0 ? "No links" : `${hrefs.length} links · ${malformed.length} malformed`,
  });

  // Unsubscribe link present
  const hasUnsub = /unsubscribe|\{\{unsubscribe_url\}\}|<a [^>]*unsub/i.test(opts.bodyHtml + opts.bodyText);
  checks.push({
    id: "unsubscribe",
    label: "Unsubscribe link present",
    status: hasUnsub ? "pass" : "fail",
    detail: hasUnsub ? "found" : "Required by CAN-SPAM / GDPR",
  });

  // Spam heuristic
  const spam = computeSpamScore({ subject: subj, html: opts.bodyHtml, text: opts.bodyText });
  checks.push({
    id: "spam",
    label: "Spam score ≤ 2",
    status: spam <= 1 ? "pass" : spam <= 2 ? "warn" : "fail",
    detail: `Score ${spam.toFixed(1)} · ${spamReasons(opts).join(", ") || "no obvious flags"}`,
  });

  // Score
  const passes = checks.filter((c) => c.status === "pass").length;
  const warns  = checks.filter((c) => c.status === "warn").length;
  const score = Math.round(((passes + warns * 0.5) / checks.length) * 100);

  return { score, checks, spamScore: spam };
}

function computeSpamScore(opts: { subject: string; html: string; text: string }): number {
  let score = 0;
  const subj = opts.subject;
  const text = opts.text;
  // Title-case detector
  const upperRatio = subj.length === 0 ? 0 : subj.replace(/[^A-Z]/g, "").length / Math.max(1, subj.replace(/[^a-zA-Z]/g, "").length);
  if (upperRatio > 0.5) score += 0.8;
  if (/!!!|FREE|GUARANTEED|ACT NOW|LIMITED TIME/i.test(subj)) score += 1.2;
  if (/\$\$\$|💰|🔥{2,}/.test(subj)) score += 0.6;
  if ((text.match(/!/g) ?? []).length > 5) score += 0.5;
  if (opts.html.length > 200_000) score += 0.4; // huge HTML
  // Excessive image-to-text ratio
  const imgCount = (opts.html.match(/<img\b/gi) ?? []).length;
  if (imgCount >= 6 && text.length < 200) score += 0.7;
  return Math.min(5, Math.round(score * 10) / 10);
}

function spamReasons(opts: { subject: string | null; bodyHtml: string; bodyText: string }): string[] {
  const out: string[] = [];
  const subj = opts.subject ?? "";
  if (/!!!|FREE|GUARANTEED|ACT NOW|LIMITED TIME/i.test(subj)) out.push("trigger words in subject");
  const upperRatio = subj.length === 0 ? 0 : subj.replace(/[^A-Z]/g, "").length / Math.max(1, subj.replace(/[^a-zA-Z]/g, "").length);
  if (upperRatio > 0.5) out.push("subject ALL CAPS");
  if ((opts.bodyText.match(/!/g) ?? []).length > 5) out.push("many exclamations");
  if ((opts.bodyHtml.match(/<img\b/gi) ?? []).length >= 6) out.push("image-heavy");
  return out;
}

/* ── Markdown → email-safe HTML ────────────────────────── */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string | undefined | null) => (s ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/**
 * Tiny Markdown → email-safe HTML renderer. Email clients hate
 * complex layouts so we keep the output as plain block elements
 * (h1-h3, p, ul/ol, blockquote, code) wrapped in a 600px-max
 * single-column container with inline styles.
 */
export function renderEmailMarkdown(md: string, opts: { brandColor?: string } = {}): string {
  const brand = opts.brandColor ?? "#2563eb";
  if (!md.trim()) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) { i += 1; continue; }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const level = h[1]!.length;
      out.push(`<h${level} style="margin:24px 0 12px;font-size:${level === 1 ? 24 : level === 2 ? 20 : 16}px;color:#0f172a;">${inline(h[2]!, brand)}</h${level}>`);
      i += 1; continue;
    }
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i] ?? "")) {
        items.push(lines[i]!.replace(/^[-*+]\s/, ""));
        i += 1;
      }
      out.push(`<ul style="margin:0 0 16px 16px;padding:0;color:#0f172a;font-size:14px;line-height:1.6;">${items.map((it) => `<li>${inline(it, brand)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i] ?? "")) {
        items.push(lines[i]!.replace(/^\d+\.\s/, ""));
        i += 1;
      }
      out.push(`<ol style="margin:0 0 16px 16px;padding:0;color:#0f172a;font-size:14px;line-height:1.6;">${items.map((it) => `<li>${inline(it, brand)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        buf.push(lines[i]!.slice(2));
        i += 1;
      }
      out.push(`<blockquote style="margin:16px 0;padding:8px 16px;border-left:3px solid ${brand};color:#475569;font-size:14px;">${inline(buf.join(" "), brand)}</blockquote>`);
      continue;
    }
    // Paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|>\s|[-*+]\s|\d+\.\s)/.test(lines[i]!)) {
      buf.push(lines[i] ?? "");
      i += 1;
    }
    out.push(`<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">${inline(buf.join(" "), brand)}</p>`);
  }
  return out.join("\n");
}

function inline(s: string, brand: string): string {
  let o = esc(s);
  // links
  o = o.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    if (!/^(https?:\/\/|mailto:|\/|\{\{)/.test(href)) return `[${label}](${href})`;
    return `<a href="${href}" style="color:${brand};text-decoration:underline;">${label}</a>`;
  });
  // bold/italic/code
  o = o.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;font-family:ui-monospace,monospace;">$1</code>');
  o = o.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  o = o.replace(/(?<!\*)\*([^*]+)\*/g, "<em>$1</em>");
  return o;
}

/** Wrap rendered block HTML in an email-safe outer shell. */
export function wrapEmailHtml(opts: {
  innerHtml: string;
  previewText?: string | null;
  brandColor?: string;
  unsubscribeUrl?: string;
  fromName?: string | null;
}): string {
  const preview = opts.previewText
    ? `<div style="display:none;visibility:hidden;opacity:0;max-height:0;max-width:0;color:transparent;font-size:0;line-height:0;">${esc(opts.previewText)}</div>`
    : "";
  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:24px 0 8px;color:#94a3b8;font-size:11px;text-align:center;">You're receiving this because you have a Flowtora account. <a href="${opts.unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a>.</p>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.fromName ?? "Flowtora")}</title></head><body style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">${preview}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:24px 0;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;padding:32px;max-width:600px;">${opts.innerHtml}${unsub}</table></td></tr></table></body></html>`;
}
