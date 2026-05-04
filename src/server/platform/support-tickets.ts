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

/* ── List rows ──────────────────────────────────────────── */

export interface TicketListRow {
  id: string;
  subject: string;
  excerpt: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  module: SupportTicketModule;
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
