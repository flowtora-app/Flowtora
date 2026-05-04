// Page 33 — Support Tickets data layer.
//
// Cross-tenant helpdesk command center. Reads SupportTicket rows
// platform-wide with saved-view filtering, KPI aggregation, and
// a preview-pane shape. The detail page lives at /platform/support/[id]
// (existing legacy route reused for now); this surface is the queue
// command center.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
  SupportTicketModule,
  SupportTicketChannel,
} from "@prisma/client";

const DAY = 86_400_000;

const ACTIVE: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"];

/* ── Saved views ─────────────────────────────────────────── */

export type SavedViewKey =
  | "unassigned"
  | "mine"
  | "open"
  | "pending"
  | "solved_today"
  | "sla_breach"
  | "urgent_high"
  | "all_active"
  | "all";

export const SAVED_VIEW_KEYS: readonly SavedViewKey[] = [
  "unassigned", "mine", "open", "pending",
  "solved_today", "sla_breach", "urgent_high",
  "all_active", "all",
];

export interface TicketFilters {
  view: SavedViewKey;
  q?: string;
  priority?: SupportTicketPriority;
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  module?: SupportTicketModule;
  channel?: SupportTicketChannel;
  tenantId?: string;
  /** "unassigned" or a User.id */
  assignedTo?: string;
}

function buildWhere(filters: TicketFilters, currentUserId: string): Prisma.SupportTicketWhereInput {
  const where: Prisma.SupportTicketWhereInput = {};
  const ands: Prisma.SupportTicketWhereInput[] = [];

  // Saved-view base filter
  switch (filters.view) {
    case "unassigned":
      ands.push({ status: { in: ACTIVE } }, { assignedTo: null });
      break;
    case "mine":
      ands.push({ assignedTo: currentUserId });
      break;
    case "open":
      ands.push({ status: "OPEN" });
      break;
    case "pending":
      ands.push({ status: "WAITING_CUSTOMER" });
      break;
    case "solved_today": {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      ands.push({ status: { in: ["RESOLVED", "CLOSED"] } }, { resolvedAt: { gte: t } });
      break;
    }
    case "sla_breach":
      ands.push({ status: { in: ACTIVE } }, { dueBy: { lt: new Date() } });
      break;
    case "urgent_high":
      ands.push({ status: { in: ACTIVE } }, { priority: { in: ["URGENT", "HIGH"] } });
      break;
    case "all_active":
      ands.push({ status: { in: ACTIVE } });
      break;
    case "all":
      // no view restriction
      break;
  }

  // Additional filters layered on top
  if (filters.priority)        ands.push({ priority: filters.priority });
  if (filters.status)          ands.push({ status: filters.status });
  if (filters.category)        ands.push({ category: filters.category });
  if (filters.module)          ands.push({ module: filters.module });
  if (filters.channel)         ands.push({ channel: filters.channel });
  if (filters.tenantId)        ands.push({ tenantId: filters.tenantId });
  if (filters.assignedTo === "unassigned") ands.push({ assignedTo: null });
  else if (filters.assignedTo) ands.push({ assignedTo: filters.assignedTo });

  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { id:      { startsWith: q } },
      { tenant: { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ] } },
    ];
  }

  if (ands.length > 0) where.AND = ands;
  return where;
}

/* ── KPIs ──────────────────────────────────────────────── */

export interface TicketKpis {
  open: number;
  pendingCustomer: number;
  solvedToday: number;
  breachingSla: number;
  /** Rolling 30-day average of (firstStaffReplyAt - createdAt). */
  avgFirstResponseMs: number | null;
  /** 30-day CSAT — fraction of rated tickets with rating >= 4. */
  csatPct: number | null;
  csatSampleSize: number;
}

export async function loadTicketKpis(): Promise<TicketKpis> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const window30 = new Date(Date.now() - 30 * DAY);

  const [open, pending, solvedToday, breaching, frResponses, csatRows] = await Promise.all([
    db.supportTicket.count({ where: { status: { in: ACTIVE } } }),
    db.supportTicket.count({ where: { status: "WAITING_CUSTOMER" } }),
    db.supportTicket.count({
      where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: todayStart } },
    }),
    db.supportTicket.count({
      where: { status: { in: ACTIVE }, dueBy: { lt: new Date() } },
    }),
    db.supportTicket.findMany({
      where: { firstStaffReplyAt: { gte: window30 }, createdAt: { gte: window30 } },
      select: { createdAt: true, firstStaffReplyAt: true },
      take: 5_000,
    }),
    db.supportTicket.findMany({
      where: { satisfactionAt: { gte: window30 }, satisfactionRating: { not: null } },
      select: { satisfactionRating: true },
      take: 5_000,
    }),
  ]);

  const valid = frResponses.filter(
    (r): r is { createdAt: Date; firstStaffReplyAt: Date } => r.firstStaffReplyAt != null,
  );
  const avgFirstResponseMs = valid.length === 0
    ? null
    : valid.reduce((s, r) => s + (r.firstStaffReplyAt.getTime() - r.createdAt.getTime()), 0) / valid.length;

  const rated = csatRows.filter((r) => r.satisfactionRating != null);
  const csatPct = rated.length === 0
    ? null
    : rated.filter((r) => (r.satisfactionRating ?? 0) >= 4).length / rated.length;

  return {
    open,
    pendingCustomer: pending,
    solvedToday,
    breachingSla: breaching,
    avgFirstResponseMs,
    csatPct,
    csatSampleSize: rated.length,
  };
}

/* ── Saved-view counts (for left rail) ───────────────────── */

export interface SavedViewCounts {
  unassigned: number;
  mine: number;
  open: number;
  pending: number;
  solvedToday: number;
  slaBreach: number;
  urgentHigh: number;
  allActive: number;
}

export async function loadSavedViewCounts(currentUserId: string): Promise<SavedViewCounts> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const now = new Date();
  const [unassigned, mine, open, pending, solvedToday, slaBreach, urgentHigh, allActive] = await Promise.all([
    db.supportTicket.count({ where: { status: { in: ACTIVE }, assignedTo: null } }),
    db.supportTicket.count({ where: { assignedTo: currentUserId, status: { in: ACTIVE } } }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.supportTicket.count({ where: { status: "WAITING_CUSTOMER" } }),
    db.supportTicket.count({
      where: { status: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: todayStart } },
    }),
    db.supportTicket.count({ where: { status: { in: ACTIVE }, dueBy: { lt: now } } }),
    db.supportTicket.count({ where: { status: { in: ACTIVE }, priority: { in: ["URGENT", "HIGH"] } } }),
    db.supportTicket.count({ where: { status: { in: ACTIVE } } }),
  ]);
  return { unassigned, mine, open, pending, solvedToday, slaBreach, urgentHigh, allActive };
}

/* ── Channel folder counts ─────────────────────────────── */

export interface ChannelCounts {
  EMAIL: number;
  CHAT: number;
  IN_APP: number;
  PHONE: number;
  FORUM: number;
}

export async function loadChannelCounts(): Promise<ChannelCounts> {
  const rows = await db.supportTicket.groupBy({
    by: ["channel"],
    where: { status: { in: ACTIVE } },
    _count: { _all: true },
  });
  const out: ChannelCounts = { EMAIL: 0, CHAT: 0, IN_APP: 0, PHONE: 0, FORUM: 0 };
  for (const r of rows) out[r.channel] = r._count._all;
  return out;
}

/* ── AI suggested replies (rule-based) ────────────────── */

export interface SuggestedReply {
  rank: number;
  body: string;
  /** Why we picked it — shown in the picker tooltip. */
  rationale: string;
}

/**
 * Rule-based "AI" suggestion engine. Inspired by past resolved tickets
 * and the current ticket's category/module, it returns 3 ranked
 * candidate replies. No external LLM call — purely deterministic so
 * it works offline and there's no latency / cost.
 *
 * The engine matches on (a) category, (b) module, (c) past staff
 * messages on similar tickets, then templates them with the tenant +
 * subject. Future iterations can swap this for a real LLM provider.
 */
export async function suggestRepliesForTicket(
  ticketId: string,
  count = 3,
): Promise<SuggestedReply[]> {
  const t = await db.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      subject: true, category: true, module: true, status: true,
      tenant: { select: { name: true } },
    },
  });
  if (!t) return [];

  // Sample staff replies from recent resolved tickets in the same category.
  const peers = await db.supportTicket.findMany({
    where: {
      category: t.category,
      status: { in: ["RESOLVED", "CLOSED"] },
      id: { not: ticketId },
    },
    orderBy: { resolvedAt: "desc" },
    take: 12,
    include: {
      messages: {
        where: { isStaff: true, internal: false },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { body: true },
      },
    },
  });
  const peerSnippets = peers
    .map((p) => p.messages[0]?.body)
    .filter((b): b is string => !!b && b.length >= 30);

  const tenantName = t.tenant.name;
  const subject = t.subject.replace(/^\[seed\]\s*/, "");

  // Curated category-aware templates. Every template uses {{tenantName}} +
  // {{subject}} placeholders so they feel personalized when surfaced.
  const TEMPLATES: Record<typeof t.category, { body: string; rationale: string }[]> = {
    BILLING: [
      {
        body: `Hi ${tenantName} team — thanks for flagging this. I'm pulling the Stripe webhook logs for your account now. To save us a round-trip, could you share the charge id or the customer email so I can match it up? I'll have an answer back within the hour.`,
        rationale: "Common BILLING reply — asks for the matching identifier so the issue doesn't bounce.",
      },
      {
        body: `Thanks for the patience. I confirmed the refund hit Stripe at ${new Date().toLocaleDateString()} but we hadn't processed the webhook yet. I've manually reconciled the invoice on our side; you should see the balance update within 5 minutes.`,
        rationale: "Resolution template for refund-not-reflected — closes the loop with timing.",
      },
      {
        body: `Got it — looking at the subscription change for ${tenantName}. The plan was upgraded but the entitlements cache hadn't refreshed. I've cleared it and you should see Pro-tier features within 2 minutes. Let me know if anything's still hidden.`,
        rationale: "Plan-change diagnostic + manual cache invalidation — covers the most-frequent BILLING bug.",
      },
    ],
    BUG: [
      {
        body: `Thanks for the report — reproducing this on a clone of your tenant now. Can you confirm: (1) the browser you saw it in, (2) whether it happens for every customer or just one, and (3) the order id? That'll get me to a fix faster.`,
        rationale: "Diagnostic intake — the three questions cover ~80% of bug reports.",
      },
      {
        body: `Reproduced on our side. This is a regression from yesterday's deploy — engineering has a fix in flight. I'll ping you the moment it's live (typically within 2 hours). Sorry about the disruption.`,
        rationale: "Acknowledged + timeline — used when QA has confirmed an active bug.",
      },
      {
        body: `I wasn't able to reproduce on my end — could you grab a screenshot or short Loom of the error and reply with it? It's possible a browser extension is interfering, or that there's an account-specific edge case I need to see.`,
        rationale: "Cannot-reproduce template — asks for richer evidence without sounding dismissive.",
      },
    ],
    FEATURE_REQUEST: [
      {
        body: `Thanks for the request, ${tenantName}! Filed it on our roadmap board — we batch feature reviews on Fridays and I'll come back here once the team has weighed in (usually within a week). If others on your team would benefit from this, having them comment here helps prioritize.`,
        rationale: "Acknowledge + commit to timing without overpromising.",
      },
      {
        body: `Good news — this is on the roadmap for next quarter. I've added your tenant to the request so you'll be notified when the early access window opens. Anything specific about the workflow you'd like us to make sure we cover?`,
        rationale: "Already-roadmapped reply — converts into discovery conversation.",
      },
      {
        body: `I'd love more context here — could you describe the exact workflow you're stuck on today? Sometimes there's an existing way to solve it; if not, your description helps the spec.`,
        rationale: "Discovery prompt — used when the request is too vague to triage.",
      },
    ],
    QUESTION: [
      {
        body: `Great question. The setting you're looking for is in **Settings → ${t.module === "AUTH" ? "Security" : "General"}**. Let me know once you're in — happy to walk through the next step on a call if it's easier.`,
        rationale: "Quick navigational answer — points to settings + offers escalation.",
      },
      {
        body: `Yes — that's exactly how it works. The only nuance is that changes take effect on the next session, so you'll need to sign out and back in once. Let me know if it doesn't behave as expected and I'll dig in.`,
        rationale: "Confirm + caveat — common Q&A pattern.",
      },
      {
        body: `The short answer is no, but there's a workaround that gets you 90% of the way there. Want me to write it up step-by-step, or would a 10-minute call be easier?`,
        rationale: "Expectation-setter when the answer is 'not yet, but…'",
      },
    ],
    OTHER: [
      {
        body: `Hi ${tenantName} — thanks for reaching out. Could you share a bit more detail so I can route this to the right person? Specifically: what were you trying to do, what happened, and what you expected to happen.`,
        rationale: "Generic intake when category was set to OTHER.",
      },
      {
        body: `Got it — looking into this now and I'll have an update within the next hour.`,
        rationale: "Quick acknowledgement to start the SLA clock.",
      },
      {
        body: `Thanks for the patience. I've routed this to engineering since it touches the ${t.module.toLowerCase()} subsystem; expect an update by end of day.`,
        rationale: "Routing acknowledgment — moves the ball without committing to a fix yet.",
      },
    ],
  };

  const baseList = TEMPLATES[t.category] ?? TEMPLATES.OTHER;

  // Optionally substitute one slot with a real peer snippet to feel less canned.
  let withPeer: SuggestedReply[] = baseList.map((b, idx) => ({
    rank: idx + 1, body: b.body, rationale: b.rationale,
  }));
  if (peerSnippets.length > 0 && Math.random() < 0.5) {
    const snippet = peerSnippets[0]!.replace(/\[seed\]\s*/g, "").trim();
    withPeer[withPeer.length - 1] = {
      rank: withPeer.length,
      body: snippet,
      rationale: `Pulled from a recent ${t.category.toLowerCase()} ticket the team resolved.`,
    };
  }

  // Subject substitution
  withPeer = withPeer.map((r) => ({
    ...r,
    body: r.body.replace(/{{subject}}/g, subject).replace(/{{tenantName}}/g, tenantName),
  }));

  return withPeer.slice(0, count);
}

/* ── List rows ──────────────────────────────────────────── */

export interface TicketListRow {
  id: string;
  subject: string;
  excerpt: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  module: SupportTicketModule;
  channel: SupportTicketChannel;
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: Date;
  updatedAt: Date;
  dueBy: Date | null;
  firstStaffReplyAt: Date | null;
  /** Open ticket past dueBy. */
  isLate: boolean;
  /** Open ticket without a staff reply yet. */
  isUnread: boolean;
  messageCount: number;
  satisfactionRating: number | null;
}

export interface TicketListResult {
  rows: TicketListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadTicketList(args: {
  filters: TicketFilters;
  currentUserId: string;
  page: number;
  pageSize: number;
}): Promise<TicketListResult> {
  const { filters, currentUserId, page, pageSize } = args;
  const where = buildWhere(filters, currentUserId);

  const [total, filteredTotal, tickets] = await Promise.all([
    db.supportTicket.count(),
    db.supportTicket.count({ where }),
    db.supportTicket.findMany({
      where,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count:   { select: { messages: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
        tenant:   { select: { id: true, name: true, plan: true } },
      },
    }),
  ]);

  const assigneeIds = Array.from(
    new Set(tickets.map((t) => t.assignedTo).filter((x): x is string => Boolean(x))),
  );
  const assignees = assigneeIds.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true, email: true },
      });
  const assigneeMap = new Map(assignees.map((u) => [u.id, u]));

  const now = Date.now();
  const rows: TicketListRow[] = tickets.map((t) => {
    const isLate   = !!t.dueBy && t.dueBy.getTime() < now && (ACTIVE as string[]).includes(t.status);
    const isUnread = t.firstStaffReplyAt == null && (t.status === "OPEN" || t.status === "WAITING_CUSTOMER");
    const firstMsg = t.messages[0]?.body ?? "";
    const excerpt  = firstMsg.length > 140 ? firstMsg.slice(0, 137) + "…" : firstMsg;
    const a        = t.assignedTo ? assigneeMap.get(t.assignedTo) : null;
    return {
      id: t.id,
      subject: t.subject,
      excerpt,
      status: t.status,
      priority: t.priority,
      category: t.category,
      module: t.module,
      channel: t.channel,
      tenantId: t.tenantId,
      tenantName: t.tenant.name,
      tenantPlan: t.tenant.plan,
      assignedTo: t.assignedTo,
      assigneeName: a ? a.name ?? a.email : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      dueBy: t.dueBy,
      firstStaffReplyAt: t.firstStaffReplyAt,
      isLate, isUnread,
      messageCount: t._count.messages,
      satisfactionRating: t.satisfactionRating,
    };
  });

  return { rows, total, filteredTotal };
}

/* ── Preview pane ───────────────────────────────────────── */

export interface TicketPreview {
  id: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  module: SupportTicketModule;
  createdAt: Date;
  updatedAt: Date;
  dueBy: Date | null;
  firstStaffReplyAt: Date | null;
  satisfactionRating: number | null;
  satisfactionComment: string | null;
  tenant: { id: string; name: string; slug: string; plan: string };
  openedBy: { id: string; name: string | null; email: string } | null;
  assignee: { id: string; name: string | null; email: string } | null;
  /** First customer message, trimmed for preview. */
  firstMessage: string;
  messageCount: number;
}

export async function loadTicketPreview(id: string): Promise<TicketPreview | null> {
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: {
      tenant:   { select: { id: true, name: true, slug: true, plan: true } },
      _count:   { select: { messages: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 1, select: { body: true } },
    },
  });
  if (!t) return null;
  const userIds = Array.from(
    new Set([t.openedByUserId, t.assignedTo].filter((x): x is string => Boolean(x))),
  );
  const users = userIds.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
  const byId = new Map(users.map((u) => [u.id, u]));

  const firstMessage = (t.messages[0]?.body ?? "(no messages)").trim();
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    category: t.category,
    module: t.module,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    dueBy: t.dueBy,
    firstStaffReplyAt: t.firstStaffReplyAt,
    satisfactionRating: t.satisfactionRating,
    satisfactionComment: t.satisfactionComment,
    tenant: t.tenant,
    openedBy: t.openedByUserId ? byId.get(t.openedByUserId) ?? null : null,
    assignee: t.assignedTo ? byId.get(t.assignedTo) ?? null : null,
    firstMessage: firstMessage.length > 600 ? firstMessage.slice(0, 597) + "…" : firstMessage,
    messageCount: t._count.messages,
  };
}

/* ── Filter options ─────────────────────────────────────── */

export interface TicketFilterOptions {
  tenants: { id: string; name: string }[];
  staff:   { id: string; label: string }[];
}

export async function loadTicketFilterOptions(): Promise<TicketFilterOptions> {
  const [tenants, staff] = await Promise.all([
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 500,
    }),
    db.user.findMany({
      where: { platformRole: { not: null } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
      take: 200,
    }),
  ]);
  return {
    tenants,
    staff: staff.map((u) => ({ id: u.id, label: u.name ?? u.email })),
  };
}
