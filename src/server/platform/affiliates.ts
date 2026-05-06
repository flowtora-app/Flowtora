// Page 42 — Affiliate Program data layer.
//
// Surfaces:
//   - loadAffiliateProgramSettings()  — singleton row, lazy-create
//   - loadAffiliateKpis()             — strip across the top
//   - loadAffiliateList()             — Affiliates tab table
//   - loadAffiliateDetail()           — /[id] page
//   - loadAffiliateApplications()     — Applications tab queue
//   - loadAffiliateTiers()            — Settings tab tier list
//   - loadAffiliateCommissions()      — Commissions tab roll-up
//   - loadAffiliateCreatives()        — Creative Library tab list

import { db } from "@/lib/db";
import type {
  AffiliateStatus,
  AffiliateApplicationStatus,
  AffiliateCommissionKind,
  AffiliateCreativeKind,
  AffiliateMessageDirection,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Settings (singleton) ──────────────────────────────── */

export interface AffiliateProgramSettingsView {
  id: string;
  active: boolean;
  acceptingApplications: boolean;
  cookieDays: number;
  defaultTierId: string | null;
  applicationMode: string;
  minPayoutCents: number;
  trackingDomain: string | null;
  notifyOnConversion: boolean;
  termsUrl: string | null;
  updatedAt: Date;
}

export async function loadAffiliateProgramSettings(): Promise<AffiliateProgramSettingsView> {
  const existing = await db.affiliateProgramSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const created = await db.affiliateProgramSettings.create({ data: { id: "default" } });
  return created;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface AffiliateKpis {
  totalAffiliates: number;
  activeAffiliates: number;
  pendingApplications: number;
  /** Sum of clicks across all affiliates in the period. */
  clicksThisPeriod: number;
  /** Sum of conversions across the period. */
  conversionsThisPeriod: number;
  /** clicks → conversions ratio. */
  conversionRate: number | null;
  /** Total commissions earned by affiliates in the period (minor units). */
  earnedThisPeriodCents: number;
  /** Pending payouts owed (sum of `pendingPayoutCents` across affiliates). */
  pendingPayoutCents: number;
  periodDays: number;
}

export async function loadAffiliateKpis(periodDays = 30): Promise<AffiliateKpis> {
  const since = new Date(Date.now() - periodDays * DAY);
  const [byStatus, pendingApps, clickAgg, convAgg, commAgg, pendingPayoutAgg] = await Promise.all([
    db.affiliate.groupBy({ by: ["status"], _count: { _all: true } }),
    db.affiliateApplication.count({ where: { status: "PENDING" } }),
    db.affiliateClick.count({ where: { occurredAt: { gte: since } } }),
    db.affiliateClick.count({ where: { occurredAt: { gte: since }, converted: true } }),
    db.partnerCommissionLine.aggregate({
      where: { kind: "COMMISSION", earnedAt: { gte: since } },
      _sum: { amount: true },
    }),
    db.affiliate.aggregate({ _sum: { pendingPayoutCents: true } }),
  ]);
  let total = 0;
  let active = 0;
  for (const r of byStatus) {
    total += r._count._all;
    if (r.status === "ACTIVE") active = r._count._all;
  }
  return {
    totalAffiliates: total,
    activeAffiliates: active,
    pendingApplications: pendingApps,
    clicksThisPeriod: clickAgg,
    conversionsThisPeriod: convAgg,
    conversionRate: clickAgg === 0 ? null : convAgg / clickAgg,
    earnedThisPeriodCents: commAgg._sum.amount ?? 0,
    pendingPayoutCents: pendingPayoutAgg._sum.pendingPayoutCents ?? 0,
    periodDays,
  };
}

/* ── Affiliates list ──────────────────────────────────── */

export interface AffiliateListRow {
  id: string;
  name: string;
  email: string;
  code: string;
  status: AffiliateStatus;
  tierName: string | null;
  trackingLink: string;
  clicks: number;
  conversions: number;
  conversionRate: number | null;
  earnedCents: number;
  pendingPayoutCents: number;
  createdAt: Date;
}

export async function loadAffiliateList(opts: {
  q?: string;
  status?: AffiliateStatus;
  tierId?: string;
  pageSize?: number;
  page?: number;
} = {}): Promise<{ rows: AffiliateListRow[]; total: number }> {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);

  const where: Parameters<typeof db.affiliate.findMany>[0] = {};
  const conditions: Record<string, unknown>[] = [];
  if (opts.q) {
    conditions.push({
      OR: [
        { name:  { contains: opts.q, mode: "insensitive" } },
        { email: { contains: opts.q, mode: "insensitive" } },
        { code:  { contains: opts.q, mode: "insensitive" } },
      ],
    });
  }
  if (opts.status) conditions.push({ status: opts.status });
  if (opts.tierId) conditions.push({ tierId: opts.tierId });
  const whereFilter = conditions.length === 0 ? {} : { AND: conditions };

  const [total, rows, settings] = await Promise.all([
    db.affiliate.count({ where: whereFilter }),
    db.affiliate.findMany({
      where: whereFilter,
      orderBy: [{ earnedCents: "desc" }, { createdAt: "desc" }],
      include: { tier: { select: { name: true } } },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.affiliateProgramSettings.findUnique({ where: { id: "default" } }),
  ]);

  const trackingDomain = settings?.trackingDomain ?? "ref.flowtora.com";
  return {
    rows: rows.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      code: a.code,
      status: a.status,
      tierName: a.tier?.name ?? null,
      trackingLink: `https://${trackingDomain}/r/${a.code}`,
      clicks: a.clicks,
      conversions: a.conversions,
      conversionRate: a.clicks === 0 ? null : a.conversions / a.clicks,
      earnedCents: a.earnedCents,
      pendingPayoutCents: a.pendingPayoutCents,
      createdAt: a.createdAt,
    })),
    total,
  };
}

/* ── Affiliate detail ─────────────────────────────────── */

export interface AffiliateDetailView {
  affiliate: {
    id: string;
    name: string;
    email: string;
    code: string;
    status: AffiliateStatus;
    websiteUrl: string | null;
    promoChannels: string | null;
    estimatedAudience: number | null;
    notes: string | null;
    cookieDays: number;
    commissionPct: number;
    tierId: string | null;
    tierName: string | null;
    clicks: number;
    conversions: number;
    earnedCents: number;
    pendingPayoutCents: number;
    trackingLink: string;
    createdAt: Date;
  };
  /** Source breakdown — clicks per `source` label, last 90d. */
  trafficSources: Array<{ source: string; clicks: number; conversions: number }>;
  /** Daily clicks + conversions for the last 30 days. */
  trend: Array<{ date: string; clicks: number; conversions: number }>;
  /** Recent commission lines. */
  commissions: Array<{
    id: string;
    description: string;
    amountCents: number;
    earnedAt: Date;
    period: string;
    payoutId: string | null;
    kind: string;
  }>;
  /** Creatives this affiliate has used (joined via clicks). */
  creativesUsed: Array<{
    id: string;
    name: string;
    kind: AffiliateCreativeKind;
    clicks: number;
  }>;
  /** Communication thread, newest first. */
  messages: Array<{
    id: string;
    direction: AffiliateMessageDirection;
    subject: string | null;
    body: string;
    createdAt: Date;
  }>;
}

export async function loadAffiliateDetail(id: string): Promise<AffiliateDetailView | null> {
  const affiliate = await db.affiliate.findUnique({
    where: { id },
    include: { tier: { select: { name: true } } },
  });
  if (!affiliate) return null;

  const since30 = new Date(Date.now() - 30 * DAY);
  const since90 = new Date(Date.now() - 90 * DAY);

  const settings = await db.affiliateProgramSettings.findUnique({ where: { id: "default" } });
  const trackingDomain = settings?.trackingDomain ?? "ref.flowtora.com";

  const [clicks90d, commissions, messages, creativesUsage] = await Promise.all([
    db.affiliateClick.findMany({
      where: { affiliateId: id, occurredAt: { gte: since90 } },
      select: { source: true, converted: true, occurredAt: true, creativeId: true },
    }),
    db.partnerCommissionLine.findMany({
      where: { affiliateId: id },
      orderBy: { earnedAt: "desc" },
      take: 25,
      select: {
        id: true, description: true, amount: true, earnedAt: true,
        period: true, payoutId: true, kind: true,
      },
    }),
    db.affiliateMessage.findMany({
      where: { affiliateId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.affiliateClick.groupBy({
      by: ["creativeId"],
      where: { affiliateId: id, creativeId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // Traffic sources roll-up.
  const sourceMap = new Map<string, { clicks: number; conversions: number }>();
  for (const c of clicks90d) {
    const key = c.source ?? "(direct)";
    const cur = sourceMap.get(key) ?? { clicks: 0, conversions: 0 };
    cur.clicks++;
    if (c.converted) cur.conversions++;
    sourceMap.set(key, cur);
  }
  const trafficSources = Array.from(sourceMap.entries())
    .map(([source, v]) => ({ source, ...v }))
    .sort((a, b) => b.clicks - a.clicks);

  // Daily trend, last 30 days.
  const day = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const trend = new Map<string, { date: string; clicks: number; conversions: number }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - (29 - i) * DAY);
    const key = day(d);
    trend.set(key, { date: key, clicks: 0, conversions: 0 });
  }
  for (const c of clicks90d) {
    if (c.occurredAt < since30) continue;
    const k = day(c.occurredAt);
    const b = trend.get(k);
    if (!b) continue;
    b.clicks++;
    if (c.converted) b.conversions++;
  }

  // Creatives used breakdown.
  const creativeIds = creativesUsage.map((u) => u.creativeId).filter((x): x is string => Boolean(x));
  const creativeMeta = creativeIds.length === 0 ? [] : await db.affiliateCreative.findMany({
    where: { id: { in: creativeIds } },
    select: { id: true, name: true, kind: true },
  });
  const metaMap = new Map(creativeMeta.map((m) => [m.id, m]));
  const creativesUsed = creativesUsage
    .filter((u) => u.creativeId && metaMap.has(u.creativeId))
    .map((u) => {
      const meta = metaMap.get(u.creativeId!)!;
      return { id: meta.id, name: meta.name, kind: meta.kind, clicks: u._count._all };
    })
    .sort((a, b) => b.clicks - a.clicks);

  return {
    affiliate: {
      id: affiliate.id,
      name: affiliate.name,
      email: affiliate.email,
      code: affiliate.code,
      status: affiliate.status,
      websiteUrl: affiliate.websiteUrl,
      promoChannels: affiliate.promoChannels,
      estimatedAudience: affiliate.estimatedAudience,
      notes: affiliate.notes,
      cookieDays: affiliate.cookieDays,
      commissionPct: Number(affiliate.commissionPct),
      tierId: affiliate.tierId,
      tierName: affiliate.tier?.name ?? null,
      clicks: affiliate.clicks,
      conversions: affiliate.conversions,
      earnedCents: affiliate.earnedCents,
      pendingPayoutCents: affiliate.pendingPayoutCents,
      trackingLink: `https://${trackingDomain}/r/${affiliate.code}`,
      createdAt: affiliate.createdAt,
    },
    trafficSources,
    trend: Array.from(trend.values()),
    commissions: commissions.map((c) => ({
      id: c.id,
      description: c.description,
      amountCents: c.amount,
      earnedAt: c.earnedAt,
      period: c.period,
      payoutId: c.payoutId,
      kind: c.kind,
    })),
    creativesUsed,
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      subject: m.subject,
      body: m.body,
      createdAt: m.createdAt,
    })),
  };
}

/* ── Applications queue ───────────────────────────────── */

export interface AffiliateApplicationRow {
  id: string;
  name: string;
  email: string;
  websiteUrl: string | null;
  promoChannels: string | null;
  estimatedAudience: number | null;
  why: string | null;
  status: AffiliateApplicationStatus;
  reviewerNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  affiliateId: string | null;
}

export async function loadAffiliateApplications(): Promise<{
  pending: AffiliateApplicationRow[];
  reviewed: AffiliateApplicationRow[];
}> {
  const rows = await db.affiliateApplication.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const map = (r: typeof rows[number]): AffiliateApplicationRow => ({
    id: r.id,
    name: r.name,
    email: r.email,
    websiteUrl: r.websiteUrl,
    promoChannels: r.promoChannels,
    estimatedAudience: r.estimatedAudience,
    why: r.why,
    status: r.status,
    reviewerNote: r.reviewerNote,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
    affiliateId: r.affiliateId,
  });
  return {
    pending:  rows.filter((r) => r.status === "PENDING").map(map),
    reviewed: rows.filter((r) => r.status !== "PENDING").map(map),
  };
}

/* ── Tiers ────────────────────────────────────────────── */

export interface AffiliateTierRow {
  id: string;
  name: string;
  position: number;
  commissionKind: AffiliateCommissionKind;
  commissionPct: number | null;
  commissionFlatCents: number | null;
  recurring: boolean;
  capDurationMonths: number | null;
  minConversionsPerQuarter: number;
  minLifetimeConversions: number | null;
  isDefault: boolean;
  notes: string | null;
  affiliateCount: number;
}

export async function loadAffiliateTiers(): Promise<AffiliateTierRow[]> {
  const rows = await db.affiliateTier.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { affiliates: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    position: t.position,
    commissionKind: t.commissionKind,
    commissionPct: t.commissionPct == null ? null : Number(t.commissionPct),
    commissionFlatCents: t.commissionFlatCents,
    recurring: t.recurring,
    capDurationMonths: t.capDurationMonths,
    minConversionsPerQuarter: t.minConversionsPerQuarter,
    minLifetimeConversions: t.minLifetimeConversions,
    isDefault: t.isDefault,
    notes: t.notes,
    affiliateCount: t._count.affiliates,
  }));
}

/* ── Commissions tab ─────────────────────────────────── */

export interface AffiliateCommissionRow {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string;
  description: string;
  amountCents: number;
  earnedAt: Date;
  period: string;
  kind: string;
  payoutId: string | null;
  payoutStatus: string | null;
}

export async function loadAffiliateCommissions(opts: {
  pageSize?: number;
} = {}): Promise<{ rows: AffiliateCommissionRow[]; totalEarned: number; totalPending: number }> {
  const pageSize = opts.pageSize ?? 100;
  const lines = await db.partnerCommissionLine.findMany({
    orderBy: { earnedAt: "desc" },
    take: pageSize,
    include: {
      affiliate: { select: { name: true, code: true } },
      payout: { select: { status: true } },
    },
  });
  const rows = lines.map((l) => ({
    id: l.id,
    affiliateId: l.affiliateId,
    affiliateName: l.affiliate.name,
    affiliateCode: l.affiliate.code,
    description: l.description,
    amountCents: l.amount,
    earnedAt: l.earnedAt,
    period: l.period,
    kind: l.kind,
    payoutId: l.payoutId,
    payoutStatus: l.payout?.status ?? null,
  }));
  const totalEarned = lines
    .filter((l) => l.kind === "COMMISSION")
    .reduce((s, l) => s + l.amount, 0);
  const totalPending = lines
    .filter((l) => l.payoutId == null)
    .reduce((s, l) => s + (l.kind === "DEDUCTION" ? -l.amount : l.amount), 0);
  return { rows, totalEarned, totalPending };
}

/* ── Creative library ────────────────────────────────── */

export interface AffiliateCreativeRow {
  id: string;
  kind: AffiliateCreativeKind;
  name: string;
  description: string | null;
  contentUrl: string | null;
  contentText: string | null;
  destinationPath: string;
  width: number | null;
  height: number | null;
  totalClicks: number;
  active: boolean;
  createdAt: Date;
}

export async function loadAffiliateCreatives(): Promise<AffiliateCreativeRow[]> {
  const rows = await db.affiliateCreative.findMany({
    orderBy: [{ active: "desc" }, { totalClicks: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    description: c.description,
    contentUrl: c.contentUrl,
    contentText: c.contentText,
    destinationPath: c.destinationPath,
    width: c.width,
    height: c.height,
    totalClicks: c.totalClicks,
    active: c.active,
    createdAt: c.createdAt,
  }));
}

/* ── Helpers ──────────────────────────────────────────── */

export function summarizeTierCommission(t: Pick<AffiliateTierRow, "commissionKind" | "commissionPct" | "commissionFlatCents" | "recurring" | "capDurationMonths">): string {
  const base = t.commissionKind === "PERCENTAGE"
    ? `${t.commissionPct == null ? "—" : Number(t.commissionPct).toFixed(1)}%`
    : `$${t.commissionFlatCents == null ? "—" : (t.commissionFlatCents / 100).toFixed(2)}`;
  if (!t.recurring) return `${base} per first payment`;
  if (t.capDurationMonths) return `${base} recurring for ${t.capDurationMonths} months`;
  return `${base} recurring for life`;
}

export function creativeKindLabel(kind: AffiliateCreativeKind): string {
  switch (kind) {
    case "BANNER":         return "Banner";
    case "TEXT_LINK":      return "Text link";
    case "EMAIL_TEMPLATE": return "Email template";
    case "SOCIAL_POST":    return "Social post";
    case "AD_CREATIVE":    return "Ad creative";
    case "VIDEO_SCRIPT":   return "Video script";
  }
}

export function statusLabel(status: AffiliateStatus): string {
  switch (status) {
    case "ACTIVE":   return "Active";
    case "PAUSED":   return "Paused";
    case "ARCHIVED": return "Archived";
  }
}

export function applicationStatusLabel(s: AffiliateApplicationStatus): string {
  switch (s) {
    case "PENDING":   return "Pending review";
    case "APPROVED":  return "Approved";
    case "REJECTED":  return "Rejected";
    case "WITHDRAWN": return "Withdrawn";
  }
}
