import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import type { AttentionGroups, AttentionItem } from "@/lib/attention";
import { totalAttentionCount } from "@/lib/attention";
import { notificationLabel } from "@/lib/notifications";
import { formatDate, relativeDays } from "@/lib/format";
import type { AllViewSection } from "../_components/InboxAllView";

// Aggregates the five surfaces into the "All" view payload.
//
// Each section previews up to 5 items with a "View all N" link. We keep
// this helper separate from the page component so we can unit-test the
// row-shaping independently, and so the page module stays short.
//
// Perf: one query per surface (max 4 DB round-trips since attention is
// pre-loaded by the caller for the summary counts). All queries are
// indexed aggregates or small-take selects.

const PREVIEW_LIMIT = 5;

export async function buildAllSections({
  slug,
  ctx,
  attentionGroups,
}: {
  slug: string;
  ctx: TenantContext;
  attentionGroups: AttentionGroups | null;
}): Promise<AllViewSection[]> {
  const canApprove = ctx.can("quotes:approve_exceptions");

  const [messagesRows, approvalsRows, notificationsRows, tasksRows] = await Promise.all([
    db.portalMessage.findMany({
      where: {
        tenantId:   ctx.tenant.id,
        direction:  "INBOUND",
        readAt:     null,
        archivedAt: null,
      },
      distinct: ["customerId"],
      orderBy:  { createdAt: "desc" },
      take:     PREVIEW_LIMIT,
      select: {
        id:         true,
        customerId: true,
        subject:    true,
        body:       true,
        createdAt:  true,
        customer:   { select: { name: true } },
      },
    }).catch(() => []),
    // Approvers see everything pending; non-approvers see only their own.
    db.approvalRequest.findMany({
      where: {
        tenantId: ctx.tenant.id,
        status:   "PENDING",
        ...(canApprove ? {} : { requestedById: ctx.userId }),
      },
      orderBy: { createdAt: "asc" },
      take:    PREVIEW_LIMIT,
      select: {
        id:         true,
        entityType: true,
        entityId:   true,
        reason:     true,
        createdAt:  true,
      },
    }).catch(() => []),
    db.notification.findMany({
      where:   { tenantId: ctx.tenant.id, userId: ctx.userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take:    PREVIEW_LIMIT,
      select: {
        id:        true,
        type:      true,
        title:     true,
        link:      true,
        createdAt: true,
      },
    }).catch(() => []),
    db.task.findMany({
      where:   { tenantId: ctx.tenant.id, assignedTo: ctx.userId, completedAt: null },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take:    PREVIEW_LIMIT,
      include: {
        customer: { select: { name: true } },
        order:    { select: { id: true, number: true } },
      },
    }).catch(() => []),
  ]);

  // Hydrate quote numbers for approval rows — approvals only surface Quote
  // entities today but this stays safe if more entity types land.
  const quoteIds = Array.from(new Set(
    approvalsRows.filter((r) => r.entityType === "Quote").map((r) => r.entityId),
  ));
  const quotes = quoteIds.length
    ? await db.quote.findMany({
        where:  { tenantId: ctx.tenant.id, id: { in: quoteIds } },
        select: { id: true, number: true, customer: { select: { name: true } } },
      }).catch(() => [])
    : [];
  const quoteById = new Map(quotes.map((q) => [q.id, q] as const));

  // Total counts (for "View all N" text — not chip badges, those come from
  // the page's own cheaper queries).
  const [messagesCount, approvalsCount, notificationsCount, tasksCount] = await Promise.all([
    db.portalMessage.count({
      where: {
        tenantId: ctx.tenant.id, direction: "INBOUND",
        readAt: null, archivedAt: null,
      },
    }).catch(() => 0),
    db.approvalRequest.count({
      where: {
        tenantId: ctx.tenant.id, status: "PENDING",
        ...(canApprove ? {} : { requestedById: ctx.userId }),
      },
    }).catch(() => 0),
    db.notification.count({
      where: { tenantId: ctx.tenant.id, userId: ctx.userId, readAt: null },
    }).catch(() => 0),
    db.task.count({
      where: { tenantId: ctx.tenant.id, assignedTo: ctx.userId, completedAt: null },
    }).catch(() => 0),
  ]);

  // ── Attention: flatten top-5 urgent items from the grouped payload ─────
  const attentionTotal = attentionGroups ? totalAttentionCount(attentionGroups) : 0;
  const attentionFlat: AttentionItem[] = attentionGroups
    ? [
        ...attentionGroups.quotesOverdue,
        ...attentionGroups.invoicesOverdue,
        ...attentionGroups.ordersOverdue,
        ...attentionGroups.installsUnconfirmed,
        ...attentionGroups.proofsStale,
        ...attentionGroups.quotesExpiring,
        ...attentionGroups.quotesStale,
        ...attentionGroups.invoicesUnsent,
        ...attentionGroups.tasksOverdue,
      ]
    : [];

  return [
    {
      chip:       "attention",
      title:      "Needs attention",
      totalCount: attentionTotal,
      emptyTitle: "Nothing on fire right now.",
      emptyBody:  "",
      items: attentionFlat.slice(0, PREVIEW_LIMIT).map((it) => ({
        key:    it.key,
        title:  it.title,
        detail: it.detail,
        href:   `/t/${slug}/${it.href}`,
      })),
    },
    {
      chip:       "messages",
      title:      "Unread messages",
      totalCount: messagesCount,
      emptyTitle: "Inbox zero. No unread portal messages.",
      emptyBody:  "",
      items: messagesRows.map((m) => ({
        key:    m.id,
        title:  m.customer?.name ?? "Customer",
        detail: truncate(m.subject || m.body, 80),
        href:   `/t/${slug}/inbox?chip=messages&c=${m.customerId}`,
      })),
    },
    {
      chip:       "approvals",
      title:      canApprove ? "Waiting on you" : "Your requests",
      totalCount: approvalsCount,
      emptyTitle: canApprove
        ? "Nothing awaiting your decision."
        : "No pending approval requests.",
      emptyBody: "",
      items: approvalsRows.map((r) => {
        const quote = r.entityType === "Quote" ? quoteById.get(r.entityId) : null;
        return {
          key:    r.id,
          title:  quote
            ? `Quote ${quote.number}${quote.customer?.name ? ` · ${quote.customer.name}` : ""}`
            : `${r.entityType} · ${r.entityId.slice(0, 8)}`,
          detail: r.reason,
          href:   `/t/${slug}/inbox?chip=approvals`,
        };
      }),
    },
    {
      chip:       "notifications",
      title:      "Recent notifications",
      totalCount: notificationsCount,
      emptyTitle: "You're all caught up on notifications.",
      emptyBody:  "",
      items: notificationsRows.map((n) => ({
        key:    n.id,
        title:  n.title,
        detail: `${notificationLabel(n.type)} · ${relativeDays(n.createdAt) ?? ""}`,
        href:   n.link ?? `/t/${slug}/inbox?chip=notifications`,
      })),
    },
    {
      chip:       "tasks",
      title:      "Your open tasks",
      totalCount: tasksCount,
      emptyTitle: "No tasks assigned to you.",
      emptyBody:  "",
      items: tasksRows.map((t) => {
        const bits: string[] = [];
        if (t.order)    bits.push(t.order.number);
        if (t.customer) bits.push(t.customer.name);
        if (t.dueDate)  bits.push(`due ${formatDate(t.dueDate)}`);
        return {
          key:    t.id,
          title:  t.title,
          detail: bits.join(" · ") || "No context",
          href:   `/t/${slug}/inbox?chip=tasks`,
        };
      }),
    },
  ];
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
