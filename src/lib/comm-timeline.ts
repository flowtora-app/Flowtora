import { db } from "@/lib/db";

// Phase 14 Slice C — unified customer communication timeline.
//
// Blends three signal streams into a single chronological feed for a customer:
//
//   1. Comments — internal team notes attached to the customer, or to any of
//      its quotes / orders / proofs / invoices / install events (comments
//      that refer to a scoped object still belong on the customer timeline).
//   2. Interactions — the CRM "note / call / email / meeting" log from
//      Phase 3. These are customer-level by construction.
//   3. EmailEvents — the system-generated record of each outbound customer
//      email (quote sent, proof sent, etc).
//
// We surface these as discriminated `TimelineEntry` rows so the page renderer
// can style each kind without re-fetching anything. This is a read-only view
// layer — nothing here mutates state.

export type TimelineEntry =
  | {
      kind:      "comment";
      id:        string;
      occurredAt: Date;
      authorId:  string | null;
      body:      string;
      deleted:   boolean;
      // Where the comment originally lives — used to build a deep link.
      scope:     TimelineScope;
    }
  | {
      kind:      "interaction";
      id:        string;
      occurredAt: Date;
      authorId:  string | null;
      subKind:   string; // NOTE / CALL / EMAIL / MEETING / TEXT — from InteractionType enum
      subject:   string | null;
      note:      string;
    }
  | {
      kind:      "email";
      id:        string;
      occurredAt: Date;
      senderUserId: string | null;
      emailKind: string; // EmailEventKind enum literal
      toAddress: string;
      subject:   string | null;
      bodyPreview: string | null;
      relatedEntityType: string | null;
      relatedEntityId:   string | null;
    };

export type TimelineScope =
  | { kind: "customer"; customerId: string }
  | { kind: "quote";    quoteId:    string }
  | { kind: "order";    orderId:    string }
  | { kind: "proof";    proofId:    string; orderId: string }
  | { kind: "install";  installEventId: string };

export async function loadCustomerTimeline(
  tenantId: string,
  customerId: string,
  limit = 200,
): Promise<TimelineEntry[]> {
  // Find every quote/order/proof/install tied to this customer so we can pull
  // comments attached to those downstream objects too. The per-list limits
  // are generous on purpose — the timeline wants the long tail, not just
  // recents.
  const [quotes, orders, interactions, emailEvents] = await Promise.all([
    db.quote.findMany({
      where: { tenantId, customerId },
      select: { id: true },
    }),
    db.order.findMany({
      where: { tenantId, customerId },
      select: { id: true },
    }),
    db.interaction.findMany({
      where: { tenantId, customerId },
      orderBy: { occurredAt: "desc" },
      take: limit,
      select: {
        id: true, occurredAt: true, type: true,
        userId: true, subject: true, body: true,
      },
    }),
    db.emailEvent.findMany({
      where: { tenantId, customerId },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        id: true, sentAt: true,
        senderUserId: true, kind: true,
        toAddress: true, subject: true, bodyPreview: true,
        relatedEntityType: true, relatedEntityId: true,
      },
    }),
  ]);

  const quoteIds = quotes.map((q) => q.id);
  const orderIds = orders.map((o) => o.id);

  // Pull proofs + installs tied to any of these orders.
  const [proofs, installs] = await Promise.all([
    orderIds.length === 0
      ? Promise.resolve([] as { id: string; orderId: string }[])
      : db.proof.findMany({
          where: { tenantId, orderId: { in: orderIds } },
          select: { id: true, orderId: true },
        }),
    orderIds.length === 0
      ? Promise.resolve([] as { id: string }[])
      : db.installEvent.findMany({
          where: { tenantId, orderId: { in: orderIds } },
          select: { id: true },
        }),
  ]);

  const proofIds   = proofs.map((p) => p.id);
  const installIds = installs.map((i) => i.id);
  const proofOrderLookup = new Map(proofs.map((p) => [p.id, p.orderId] as const));

  const comments = await db.comment.findMany({
    where: {
      tenantId,
      OR: [
        { customerId },
        ...(quoteIds.length   > 0 ? [{ quoteId:        { in: quoteIds   } }] : []),
        ...(orderIds.length   > 0 ? [{ orderId:        { in: orderIds   } }] : []),
        ...(proofIds.length   > 0 ? [{ proofId:        { in: proofIds   } }] : []),
        ...(installIds.length > 0 ? [{ installEventId: { in: installIds } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, createdAt: true, authorId: true,
      body: true, deletedAt: true,
      customerId: true, quoteId: true, orderId: true,
      proofId: true, installEventId: true,
    },
  });

  const entries: TimelineEntry[] = [];

  for (const c of comments) {
    entries.push({
      kind:       "comment",
      id:         c.id,
      occurredAt: c.createdAt,
      authorId:   c.authorId,
      body:       c.body,
      deleted:    c.deletedAt != null,
      scope:      resolveCommentScope(c, proofOrderLookup),
    });
  }
  for (const i of interactions) {
    entries.push({
      kind:       "interaction",
      id:         i.id,
      occurredAt: i.occurredAt,
      authorId:   i.userId ?? null,
      subKind:    i.type,
      subject:    i.subject ?? null,
      note:       i.body ?? "",
    });
  }
  for (const e of emailEvents) {
    entries.push({
      kind:             "email",
      id:               e.id,
      occurredAt:       e.sentAt,
      senderUserId:     e.senderUserId,
      emailKind:        e.kind,
      toAddress:        e.toAddress,
      subject:          e.subject,
      bodyPreview:      e.bodyPreview,
      relatedEntityType: e.relatedEntityType,
      relatedEntityId:   e.relatedEntityId,
    });
  }

  entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return entries.slice(0, limit);
}

function resolveCommentScope(
  c: {
    customerId: string | null;
    quoteId: string | null;
    orderId: string | null;
    proofId: string | null;
    installEventId: string | null;
  },
  proofOrderLookup: Map<string, string>,
): TimelineScope {
  if (c.proofId) {
    const orderId = proofOrderLookup.get(c.proofId) ?? "";
    return { kind: "proof", proofId: c.proofId, orderId };
  }
  if (c.installEventId) return { kind: "install", installEventId: c.installEventId };
  if (c.orderId)        return { kind: "order",   orderId: c.orderId };
  if (c.quoteId)        return { kind: "quote",   quoteId: c.quoteId };
  // Fallback — shouldn't happen if the comment query filtered to customer-
  // attached comments; customerId will always be set in that case.
  return { kind: "customer", customerId: c.customerId ?? "" };
}
