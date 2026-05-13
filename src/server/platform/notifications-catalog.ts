// Page 68 — Notification Templates catalog data layer.
//
// Wraps the existing NotificationTemplate model with the spec's trigger
// taxonomy, A/B variants, 24h metrics, and approval workflow. The shared
// /platform/notifications page consumes these loaders; the per-kind
// editor uses `loadTemplateDetail` for its right-rail metadata.

import { db } from "@/lib/db";
import type {
  NotificationApprovalState,
  NotificationChannel,
  NotificationStatus,
  NotificationTrigger,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Label & tone palettes ───────────────────────────── */

export const TRIGGER_LABEL: Record<NotificationTrigger, string> = {
  TENANT_LIFECYCLE: "Tenant Lifecycle",
  SUBSCRIPTION:     "Subscription",
  INVOICE:          "Invoice",
  PAYMENT:          "Payment",
  USER:             "User",
  JOB:              "Job",
  MARKETING:        "Marketing",
  SYSTEM:           "System",
  SECURITY:         "Security",
  SUPPORT:          "Support",
};

export const TRIGGER_DESCRIPTION: Record<NotificationTrigger, string> = {
  TENANT_LIFECYCLE: "Sign-up, onboarding milestones, churn, reactivation.",
  SUBSCRIPTION:     "Trial reminders, plan changes, cancellations, renewals.",
  INVOICE:          "Invoice sent, paid, overdue, finalization.",
  PAYMENT:          "Payment receipts, failures, retries, refunds.",
  USER:             "Verification, invitations, role assignments, profile changes.",
  JOB:              "Order status, production updates, proof approval, delivery.",
  MARKETING:        "Newsletters, drip sequences, product announcements.",
  SYSTEM:           "Maintenance windows, deployment notices, deprecation warnings.",
  SECURITY:         "Password resets, MFA setup, suspicious sign-ins, audit alerts.",
  SUPPORT:          "Ticket replies, escalations, satisfaction surveys.",
};

export const TRIGGER_ORDER: NotificationTrigger[] = [
  "TENANT_LIFECYCLE", "SUBSCRIPTION", "INVOICE", "PAYMENT",
  "USER", "JOB", "MARKETING", "SYSTEM", "SECURITY", "SUPPORT",
];

export const APPROVAL_TONE: Record<
  NotificationApprovalState,
  { bg: string; fg: string; label: string; description: string }
> = {
  DRAFT: {
    bg: "var(--surface-2)", fg: "var(--text-muted)",
    label: "Draft",
    description: "Author is still editing. Not eligible for live serving.",
  },
  IN_REVIEW: {
    bg: "var(--amber-100)", fg: "var(--amber-700)",
    label: "In review",
    description: "Submitted for sign-off. Reviewer must approve before publish.",
  },
  APPROVED: {
    bg: "var(--violet-100)", fg: "var(--violet-700)",
    label: "Approved",
    description: "Sign-off granted. Ready to promote to live whenever you want.",
  },
  LIVE: {
    bg: "var(--emerald-100)", fg: "var(--emerald-700)",
    label: "Live",
    description: "Content is being served to real users right now.",
  },
};

export const STATUS_TONE: Record<
  NotificationStatus,
  { bg: string; fg: string; label: string }
> = {
  DRAFT:     { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Draft" },
  PUBLISHED: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Published" },
  DISABLED: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Disabled" },
};

export const CHANNEL_ICON: Record<NotificationChannel, string> = {
  EMAIL:  "✉",
  IN_APP: "🔔",
  SMS:    "📱",
  PUSH:   "📨",
};

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  EMAIL:  "Email",
  IN_APP: "In-app",
  SMS:    "SMS",
  PUSH:   "Push",
};

/* ── Loaders ──────────────────────────────────────────── */

/** Full catalog row for the list view + sidebar tree. */
export interface CatalogRow {
  id: string;
  kind: string;
  trigger: NotificationTrigger | null;
  category: string;
  channels: NotificationChannel[];
  locales: string[];
  status: NotificationStatus;
  approvalState: NotificationApprovalState;
  enabled: boolean;
  isCritical: boolean;
  subject: string;
  ownerEmail: string | null;
  tags: string[];
  updatedAt: Date;
  publishedAt: Date | null;
  /** 24h metric rollup (yesterday's row). */
  sentLast24h: number;
  openRate: number;   // 0-1
  clickRate: number;  // 0-1
}

export async function loadCatalog(args?: {
  trigger?: NotificationTrigger;
  status?: NotificationStatus;
  approvalState?: NotificationApprovalState;
  channel?: NotificationChannel;
  search?: string;
}): Promise<CatalogRow[]> {
  const where: Record<string, unknown> = {};
  if (args?.trigger) where.trigger = args.trigger;
  if (args?.status) where.status = args.status;
  if (args?.approvalState) where.approvalState = args.approvalState;
  if (args?.channel) where.channel = args.channel;
  if (args?.search) {
    where.OR = [
      { kind:    { contains: args.search, mode: "insensitive" } },
      { subject: { contains: args.search, mode: "insensitive" } },
      { headline:{ contains: args.search, mode: "insensitive" } },
    ];
  }
  const rows = await db.notificationTemplate.findMany({
    where,
    orderBy: [{ trigger: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { kind: "asc" }],
  });
  // Group by kind so the per-kind row aggregates channel + locale variants.
  const byKind = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byKind.has(r.kind)) byKind.set(r.kind, []);
    byKind.get(r.kind)!.push(r);
  }
  // Last 24h metrics — one query, distribute to rows.
  const since = new Date(Date.now() - DAY);
  const metricRows = await db.notificationTemplateMetric.findMany({
    where: { day: { gte: since } },
  });
  const metricByTemplate = new Map<string, { sent: number; opened: number; clicked: number }>();
  for (const m of metricRows) {
    const prev = metricByTemplate.get(m.templateId) ?? { sent: 0, opened: 0, clicked: 0 };
    metricByTemplate.set(m.templateId, {
      sent:    prev.sent    + m.sent,
      opened:  prev.opened  + m.opened,
      clicked: prev.clicked + m.clicked,
    });
  }
  const out: CatalogRow[] = [];
  for (const [kind, list] of byKind.entries()) {
    // Anchor row = English email (or first locale, first channel).
    const anchor =
      list.find((r) => r.channel === "EMAIL" && r.locale === "en") ??
      list[0]!;
    let sent = 0, opened = 0, clicked = 0;
    for (const r of list) {
      const m = metricByTemplate.get(r.id);
      if (m) { sent += m.sent; opened += m.opened; clicked += m.clicked; }
    }
    out.push({
      id: anchor.id,
      kind,
      trigger: anchor.trigger,
      category: anchor.category,
      channels: Array.from(new Set(list.map((r) => r.channel))),
      locales:  Array.from(new Set(list.map((r) => r.locale))),
      status:        anchor.status,
      approvalState: anchor.approvalState,
      enabled:       anchor.enabled,
      isCritical:    anchor.isCritical,
      subject:       anchor.subject,
      ownerEmail:    anchor.ownerEmail,
      tags:          anchor.tags,
      updatedAt:     anchor.updatedAt,
      publishedAt:   anchor.publishedAt,
      sentLast24h:   sent,
      openRate:  sent > 0 ? opened  / sent : 0,
      clickRate: sent > 0 ? clicked / sent : 0,
    });
  }
  return out;
}

/** Full editor payload for one template (one kind+channel+locale row). */
export async function loadTemplateDetail(templateId: string) {
  return db.notificationTemplate.findUnique({
    where: { id: templateId },
    include: {
      variants: { orderBy: { label: "asc" } },
      versions: { orderBy: { version: "desc" }, take: 25 },
      reviews:  { orderBy: { createdAt: "desc" }, take: 25 },
      metrics:  { orderBy: { day: "asc" }, where: { day: { gte: new Date(Date.now() - 30 * DAY) } } },
    },
  });
}

/** All locales+channels for the per-locale tabs on the editor. */
export async function loadKindVariants(kind: string) {
  return db.notificationTemplate.findMany({
    where: { kind },
    orderBy: [{ channel: "asc" }, { locale: "asc" }],
    select: {
      id: true, channel: true, locale: true,
      status: true, approvalState: true,
      subject: true, updatedAt: true,
    },
  });
}

/* ── KPIs ─────────────────────────────────────────────── */

export interface CatalogKpis {
  totalKinds: number;
  totalTemplates: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  liveCount: number;
  channels: Record<NotificationChannel, number>;
  sentLast24h: number;
  avgOpenRate: number;
  avgClickRate: number;
}

export async function loadCatalogKpis(): Promise<CatalogKpis> {
  const rows = await db.notificationTemplate.findMany({
    select: {
      id: true, kind: true, channel: true, approvalState: true,
    },
  });
  const counts: Record<NotificationApprovalState, number> = {
    DRAFT: 0, IN_REVIEW: 0, APPROVED: 0, LIVE: 0,
  };
  const channels: Record<NotificationChannel, number> = {
    EMAIL: 0, IN_APP: 0, SMS: 0, PUSH: 0,
  };
  const kinds = new Set<string>();
  for (const r of rows) {
    counts[r.approvalState]++;
    channels[r.channel]++;
    kinds.add(r.kind);
  }
  const since = new Date(Date.now() - DAY);
  const metrics = await db.notificationTemplateMetric.findMany({
    where: { day: { gte: since } },
    select: { sent: true, opened: true, clicked: true },
  });
  let sent = 0, opened = 0, clicked = 0;
  for (const m of metrics) { sent += m.sent; opened += m.opened; clicked += m.clicked; }
  return {
    totalKinds: kinds.size,
    totalTemplates: rows.length,
    draftCount:    counts.DRAFT,
    reviewCount:   counts.IN_REVIEW,
    approvedCount: counts.APPROVED,
    liveCount:     counts.LIVE,
    channels,
    sentLast24h: sent,
    avgOpenRate:  sent > 0 ? opened  / sent : 0,
    avgClickRate: sent > 0 ? clicked / sent : 0,
  };
}

/* ── Helpers ──────────────────────────────────────────── */

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatThousands(n: number): string {
  return n.toLocaleString("en-US");
}

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

/* ── Aggregate page loader ────────────────────────────── */

export async function loadCatalogPage(args?: {
  trigger?: NotificationTrigger;
  status?: NotificationStatus;
  approvalState?: NotificationApprovalState;
  channel?: NotificationChannel;
  search?: string;
}) {
  const [kpis, rows] = await Promise.all([
    loadCatalogKpis(),
    loadCatalog(args),
  ]);
  return { kpis, rows };
}
