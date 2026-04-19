import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import { OPEN_INVOICE_STATUSES, statusColor as invoiceColor, statusLabel as invoiceLabel } from "@/lib/invoices";
import { statusColor as quoteColor, statusLabel as quoteLabel } from "@/lib/quotes";
import { proofStatusColor, proofStatusLabel } from "@/lib/proofs";
import {
  PortalActivityTimeline,
  type TimelineEvent,
} from "@/components/portal/PortalActivityTimeline";

export default async function PortalLanding({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);
  const scope = { tenantId: ctx.tenant.id, customerId: ctx.customer.id };
  const currency = ctx.tenant.currency;

  const [pendingQuotes, pendingProofs, openInvoices, recentOrders, recentEmails, recentPayments, recentDecisions] = await Promise.all([
    db.quote.findMany({
      where: { ...scope, status: { in: ["SENT", "VIEWED"] } },
      select: { id: true, number: true, status: true, total: true, expiresAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.proof.findMany({
      where: {
        tenantId: ctx.tenant.id,
        status: "SENT",
        order: { customerId: ctx.customer.id },
      },
      select: {
        id: true, title: true, version: true, status: true,
        orderId: true,
        order: { select: { number: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.invoice.findMany({
      where: { ...scope, status: { in: OPEN_INVOICE_STATUSES } },
      select: { id: true, number: true, status: true, total: true, amountPaid: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    db.order.findMany({
      where: scope,
      select: { id: true, number: true, status: true, total: true, dueDate: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    // Phase 15 Slice C — small activity preview on the landing page. We
    // pull a handful of the most recent events and fold them into the
    // same TimelineEvent shape used by the full /history page so the
    // visual treatment is identical.
    db.emailEvent.findMany({
      where: {
        tenantId:   ctx.tenant.id,
        customerId: ctx.customer.id,
        direction:  "OUTBOUND",
      },
      orderBy: { sentAt: "desc" },
      take: 5,
      select: {
        id: true, kind: true, subject: true, sentAt: true,
        failedAt: true, relatedEntityType: true, relatedEntityId: true,
      },
    }),
    db.payment.findMany({
      where: {
        tenantId: ctx.tenant.id,
        voidedAt: null,
        failedAt: null,
        invoice:  { customerId: ctx.customer.id },
      },
      orderBy: { receivedAt: "desc" },
      take: 5,
      select: {
        id: true, amount: true, receivedAt: true,
        invoice: { select: { id: true, number: true } },
      },
    }),
    db.proofDecision.findMany({
      where: {
        tenantId: ctx.tenant.id,
        decision: { in: ["APPROVED", "CHANGES_REQUESTED"] },
        proof:    { order: { customerId: ctx.customer.id } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, decision: true, createdAt: true,
        proof: {
          select: {
            id: true, version: true, title: true,
            order: { select: { number: true } },
          },
        },
      },
    }),
  ]);

  // Merge into a single short stream for the landing card.
  const previewEvents: TimelineEvent[] = [];
  for (const e of recentEmails) {
    const kind: TimelineEvent["kind"] = e.failedAt
      ? "email.failed"
      : e.kind === "QUOTE_SENT"   ? "quote.sent"
      : e.kind === "PROOF_SENT"   ? "proof.sent"
      : e.kind === "INVOICE_SENT" ? "invoice.sent"
      : "email.sent";
    const href = (() => {
      if (!e.relatedEntityType || !e.relatedEntityId) return null;
      switch (e.relatedEntityType.toLowerCase()) {
        case "quote":   return portalPath(token, `quotes/${e.relatedEntityId}`);
        case "order":   return portalPath(token, `orders/${e.relatedEntityId}`);
        case "invoice": return portalPath(token, `invoices/${e.relatedEntityId}`);
        case "proof":   return portalPath(token, `proofs/${e.relatedEntityId}`);
        default:        return null;
      }
    })();
    previewEvents.push({
      id: `email:${e.id}`,
      at: e.sentAt,
      kind,
      title: e.subject ?? "Email sent",
      href,
    });
  }
  for (const p of recentPayments) {
    previewEvents.push({
      id:    `pay:${p.id}`,
      at:    p.receivedAt,
      kind:  "payment.received",
      title: `Payment received — ${formatMoney(Number(p.amount), currency)}`,
      detail: `Invoice ${p.invoice.number}`,
      href:  portalPath(token, `invoices/${p.invoice.id}`),
    });
  }
  for (const d of recentDecisions) {
    const label = d.proof.title ?? `Proof v${d.proof.version}`;
    previewEvents.push({
      id:    `pd:${d.id}`,
      at:    d.createdAt,
      kind:  d.decision === "APPROVED" ? "proof.approved" : "proof.changes_requested",
      title: d.decision === "APPROVED"
        ? `${label} approved`
        : `${label} — changes requested`,
      detail: `Order ${d.proof.order.number}`,
      href: portalPath(token, `proofs/${d.proof.id}`),
    });
  }
  previewEvents.sort((a, b) => b.at.getTime() - a.at.getTime());
  const preview = previewEvents.slice(0, 6);

  // Phase 15 Slice D — punchy top metrics so the customer sees their
  // own status immediately without having to read bullet points.
  const outstandingTotal = openInvoices.reduce(
    (sum, inv) => sum + Math.max(0, Number(inv.total) - Number(inv.amountPaid)),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Phase 15 Slice D — premium hero card that blends the tenant logo
          with the greeting. Looks consistent in both default and branded
          (accent-override) themes. */}
      <div
        className="flex flex-wrap items-start justify-between gap-6 rounded-lg px-5 py-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            {ctx.tenant.name}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            Welcome, {ctx.customer.name}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Review open work, approve proofs, and settle invoices — all in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Pending your action
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {pendingQuotes.length + pendingProofs.length}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Outstanding
            </div>
            <div className="mt-1 text-2xl font-semibold" style={{ color: outstandingTotal > 0 ? "var(--accent-primary)" : "var(--text-default)" }}>
              {formatMoney(outstandingTotal, currency)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Quotes awaiting your response"
            description={`${pendingQuotes.length} pending`}
            right={<Link href={portalPath(token, "quotes")} className="text-xs underline" style={{ color: "var(--text-muted)" }}>All quotes →</Link>}
          />
          <ul>
            {pendingQuotes.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No quotes need your attention right now.
              </li>
            )}
            {pendingQuotes.map((q) => (
              <li key={q.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <Link href={portalPath(token, `quotes/${q.id}`)} className="text-sm font-medium underline">
                    {q.number}
                  </Link>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: quoteColor(q.status), color: "white" }}>
                    {quoteLabel(q.status)}
                  </span>
                  {q.expiresAt && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      expires {formatDate(q.expiresAt, ctx.tenant.dateFormat)}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium">{formatMoney(Number(q.total), currency)}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Proofs to review"
            description={`${pendingProofs.length} waiting on you`}
            right={<Link href={portalPath(token, "proofs")} className="text-xs underline" style={{ color: "var(--text-muted)" }}>All proofs →</Link>}
          />
          <ul>
            {pendingProofs.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No proofs need your approval right now.
              </li>
            )}
            {pendingProofs.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <Link href={portalPath(token, `proofs/${p.id}`)} className="text-sm font-medium underline">
                    {p.title ?? `Proof v${p.version}`}
                  </Link>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: proofStatusColor(p.status), color: "white" }}>
                    {proofStatusLabel(p.status)}
                  </span>
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Order {p.order.number} · v{p.version}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Open invoices"
            description={`${openInvoices.length} with a balance due`}
            right={<Link href={portalPath(token, "invoices")} className="text-xs underline" style={{ color: "var(--text-muted)" }}>All invoices →</Link>}
          />
          <ul>
            {openInvoices.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                Nothing outstanding — you&apos;re paid up.
              </li>
            )}
            {openInvoices.map((inv) => {
              const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
              return (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-3">
                    <Link href={portalPath(token, `invoices/${inv.id}`)} className="text-sm font-medium underline">
                      {inv.number}
                    </Link>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: invoiceColor(inv.status), color: "white" }}>
                      {invoiceLabel(inv.status)}
                    </span>
                    {inv.dueDate && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        due {formatDate(inv.dueDate, ctx.tenant.dateFormat)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium">{formatMoney(balance, currency)}</div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Recent orders"
            right={<Link href={portalPath(token, "orders")} className="text-xs underline" style={{ color: "var(--text-muted)" }}>All orders →</Link>}
          />
          <ul>
            {recentOrders.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No orders yet.
              </li>
            )}
            {recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <Link href={portalPath(token, `orders/${o.id}`)} className="text-sm font-medium underline">
                  {o.number}
                </Link>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {o.status.replace(/_/g, " ")}
                  {o.dueDate && <> · due {formatDate(o.dueDate, ctx.tenant.dateFormat)}</>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Phase 15 Slice C — short activity preview on the landing page.
          Hidden when there's nothing to show so a fresh customer doesn't
          see an empty card on their first visit. */}
      {preview.length > 0 && (
        <Card>
          <CardHeader
            title="Recent activity"
            description="The latest across your account."
            right={
              <Link
                href={portalPath(token, "history")}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Full history →
              </Link>
            }
          />
          <PortalActivityTimeline events={preview} />
        </Card>
      )}
    </div>
  );
}
