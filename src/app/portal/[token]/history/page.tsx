import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatMoney } from "@/lib/format";
import {
  PortalActivityTimeline,
  type TimelineEvent,
} from "@/components/portal/PortalActivityTimeline";
import { installKindLabel } from "@/lib/installs";

// Phase 15 Slice C — portal activity history.
//
// Customers keep asking "did you ever send me that invoice?" or "when did
// I approve the proof?" The timeline is the answer: we merge the durable
// records we already keep (EmailEvent, ProofDecision, Payment, InstallEvent)
// into one stream so they never have to chase.
//
// Rules:
//   • Everything is scoped to this customerId+tenantId.
//   • We only surface OUTBOUND email — inbound (future) needs its own UX.
//   • Payments that were voided or marked failed are excluded (they didn't
//     actually happen from the customer's POV).
//   • DRAFT proof decisions aren't user-visible; neither are staff-internal
//     decisions like REVISED or SUPERSEDED — the customer only cares about
//     things their portal persona took part in (SENT → you → APPROVED /
//     CHANGES_REQUESTED).

const RECENT_WINDOW_DAYS = 180;
const MAX_EVENTS = 80;

export default async function PortalHistory({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);
  const scope = { tenantId: ctx.tenant.id, customerId: ctx.customer.id };
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 3600_000);
  const currency = ctx.tenant.currency;

  const [emails, decisions, payments, installs] = await Promise.all([
    db.emailEvent.findMany({
      where: {
        tenantId:  ctx.tenant.id,
        customerId: ctx.customer.id,
        direction: "OUTBOUND",
        sentAt:    { gte: since },
      },
      orderBy: { sentAt: "desc" },
      take: 60,
    }),
    // Proof decisions that visibly involved the customer: SENT (we pushed
    // something to them), APPROVED / CHANGES_REQUESTED / REJECTED (they
    // responded). Scope via the proof → order → customer path so we don't
    // leak decisions on proofs that don't belong to this portal.
    db.proofDecision.findMany({
      where: {
        tenantId: ctx.tenant.id,
        decision: { in: ["SENT", "APPROVED", "CHANGES_REQUESTED", "REJECTED"] },
        proof:    { order: { customerId: ctx.customer.id } },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        decision: true,
        createdAt: true,
        notes: true,
        proof: {
          select: {
            id: true,
            version: true,
            title: true,
            order: { select: { id: true, number: true } },
          },
        },
      },
    }),
    db.payment.findMany({
      where: {
        tenantId: ctx.tenant.id,
        voidedAt: null,
        failedAt: null,
        receivedAt: { gte: since },
        invoice: { customerId: ctx.customer.id },
      },
      orderBy: { receivedAt: "desc" },
      take: 40,
      select: {
        id: true,
        amount: true,
        method: true,
        receivedAt: true,
        reference: true,
        invoice: { select: { id: true, number: true } },
      },
    }),
    db.installEvent.findMany({
      where: {
        ...scope,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        title: true,
        createdAt: true,
        scheduledStart: true,
        scheduledEnd: true,
        orderId: true,
      },
    }),
  ]);

  // Fold everything into the common TimelineEvent shape.
  const events: TimelineEvent[] = [];

  for (const e of emails) {
    const kind: TimelineEvent["kind"] = (() => {
      if (e.failedAt) return "email.failed";
      switch (e.kind) {
        case "QUOTE_SENT":   return "quote.sent";
        case "PROOF_SENT":   return "proof.sent";
        case "INVOICE_SENT": return "invoice.sent";
        default:             return "email.sent";
      }
    })();
    events.push({
      id:    `email:${e.id}`,
      at:    e.sentAt,
      kind,
      title: e.subject ?? subjectFallback(e.kind),
      detail: e.failedAt
        ? (e.failReason ? `Delivery failed — ${e.failReason}` : "Delivery failed.")
        : (e.bodyPreview ?? null),
      href: hrefForEmail(token, e.relatedEntityType, e.relatedEntityId),
    });
  }

  for (const d of decisions) {
    const proofHref = portalPath(token, `proofs/${d.proof.id}`);
    const proofLabel = d.proof.title ?? `Proof v${d.proof.version}`;
    if (d.decision === "SENT") {
      events.push({
        id:    `pd:${d.id}`,
        at:    d.createdAt,
        kind:  "proof.sent",
        title: `${proofLabel} sent for your review`,
        detail: `Order ${d.proof.order.number}`,
        href:  proofHref,
      });
    } else if (d.decision === "APPROVED") {
      events.push({
        id:    `pd:${d.id}`,
        at:    d.createdAt,
        kind:  "proof.approved",
        title: `${proofLabel} approved`,
        detail: d.notes ?? `Order ${d.proof.order.number}`,
        href:  proofHref,
      });
    } else {
      // CHANGES_REQUESTED or REJECTED — group under the same "changes" bucket
      // so the customer sees a single predictable label for "you sent it back."
      events.push({
        id:    `pd:${d.id}`,
        at:    d.createdAt,
        kind:  "proof.changes_requested",
        title: `${proofLabel} — changes requested`,
        detail: d.notes ?? `Order ${d.proof.order.number}`,
        href:  proofHref,
      });
    }
  }

  for (const p of payments) {
    events.push({
      id:    `pay:${p.id}`,
      at:    p.receivedAt,
      kind:  "payment.received",
      title: `Payment received — ${formatMoney(Number(p.amount), currency)}`,
      detail: [
        p.method.replace(/_/g, " ").toLowerCase(),
        p.reference ? `ref ${p.reference}` : null,
        `Invoice ${p.invoice.number}`,
      ]
        .filter(Boolean)
        .join(" · "),
      href: portalPath(token, `invoices/${p.invoice.id}`),
    });
  }

  for (const iv of installs) {
    events.push({
      id:    `iv:${iv.id}`,
      at:    iv.createdAt,
      kind:  "install.scheduled",
      title: iv.title ?? `${installKindLabel(iv.kind)} scheduled`,
      detail: formatInstallWindow(iv.scheduledStart, iv.scheduledEnd),
      href:  portalPath(token, `orders/${iv.orderId}`),
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  const trimmed = events.slice(0, MAX_EVENTS);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity history</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Everything we&apos;ve sent you, every decision you&apos;ve made, and every
          payment we&apos;ve recorded — all in one place.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Recent activity"
          description={
            trimmed.length === 0
              ? "Nothing in the last 180 days."
              : `${trimmed.length} event${trimmed.length === 1 ? "" : "s"} · last ${RECENT_WINDOW_DAYS} days`
          }
        />
        <PortalActivityTimeline
          events={trimmed}
          emptyLabel="No activity in the last 180 days."
        />
      </Card>
    </div>
  );
}

function subjectFallback(kind: string): string {
  switch (kind) {
    case "QUOTE_SENT":     return "Quote sent";
    case "PROOF_SENT":     return "Proof sent";
    case "INVOICE_SENT":   return "Invoice sent";
    case "PAYMENT_RECEIPT":return "Payment receipt";
    case "PORTAL_INVITE":  return "Portal invitation";
    case "REMINDER":       return "Reminder";
    case "UPDATE_MESSAGE": return "Update from us";
    default:               return "Email sent";
  }
}

function hrefForEmail(
  token: string,
  entityType: string | null,
  entityId: string | null,
): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType.toLowerCase()) {
    case "quote":   return portalPath(token, `quotes/${entityId}`);
    case "order":   return portalPath(token, `orders/${entityId}`);
    case "invoice": return portalPath(token, `invoices/${entityId}`);
    case "proof":   return portalPath(token, `proofs/${entityId}`);
    default:        return null;
  }
}

function formatInstallWindow(start: Date, end: Date): string {
  const d = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    hour:    "numeric",
    minute:  "2-digit",
  });
  const e = new Intl.DateTimeFormat(undefined, {
    hour:   "numeric",
    minute: "2-digit",
  });
  return `${d.format(start)} – ${e.format(end)}`;
}
