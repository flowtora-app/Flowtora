import Link from "next/link";
import { requirePortalToken, portalPath, assertBelongsToPortal } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import {
  statusColor,
  statusLabel,
  paymentMethodLabel,
  termsLabel,
  outstandingBalance,
  agingFor,
  agingBucketColor,
  agingBucketLabel,
} from "@/lib/invoices";
import { PrintInvoiceButton } from "@/components/portal/PrintInvoiceButton";

// Phase 14 — portal invoice detail (customer-facing).
//
// Goals for this rewrite:
//   • mobile-first layout — balance widget stacks above the metadata so
//     phones don't split it across lines
//   • honest balance math — refunds and write-offs flow through
//     outstandingBalance so the customer sees the actual "what do I
//     owe" number
//   • aging visible when overdue — matches what the shop sees
//   • print-friendly — @media print trims chrome, keeps the paper
//     receipt readable. The "Print / save PDF" button triggers the
//     browser's native print dialog which produces a PDF on any modern
//     device.
//   • "Pay now" CTA as a placeholder — we don't have a gateway wired
//     yet; the button reveals the shop's contact info. When Stripe
//     lands later, this block becomes the Checkout session trigger.

export default async function PortalInvoiceDetail({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const ctx = await requirePortalToken(token);

  const invoice = await db.invoice.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      // Only show successful payments. Failed or voided don't deserve
      // airtime on the customer receipt — they'd just confuse things.
      payments: {
        where: { voidedAt: null, failedAt: null },
        orderBy: { receivedAt: "desc" },
      },
      // Refunds show up as a transparent line on the receipt — customers
      // should see when money flowed back to them.
      refunds: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, createdAt: true, method: true, reference: true },
      },
      order: { select: { id: true, number: true } },
    },
  });
  assertBelongsToPortal(ctx, invoice);
  if (!invoice) return null;
  // DRAFT / VOID invoices aren't visible to customers.
  if (invoice.status === "DRAFT" || invoice.status === "VOID") {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Invoice not available.
      </div>
    );
  }

  const currency = ctx.tenant.currency;
  const balance = outstandingBalance(invoice);
  const aging = agingFor({ status: invoice.status, dueDate: invoice.dueDate });
  const isOverdue = aging.daysPastDue > 0;

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>

      <div className="no-print text-sm">
        <Link href={portalPath(token, "invoices")} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Invoices
        </Link>
      </div>

      {/* Header — on mobile, balance widget stacks under the title and
          takes the full width so the number reads at a glance. */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{invoice.number}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: statusColor(invoice.status), color: "white" }}
            >
              {statusLabel(invoice.status)}
            </span>
            {isOverdue && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: agingBucketColor(aging.bucket), color: "white" }}
                title={`${aging.daysPastDue} days past due`}
              >
                {agingBucketLabel(aging.bucket)}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            From {ctx.tenant.name}
            {invoice.issuedAt && <> · Issued {formatDate(invoice.issuedAt, ctx.tenant.dateFormat)}</>}
            {invoice.dueDate && (
              <>
                {" · "}
                <span style={{ color: isOverdue ? "#ef4444" : undefined }}>
                  Due {formatDate(invoice.dueDate, ctx.tenant.dateFormat)}
                  {isOverdue && <> ({aging.daysPastDue}d past due)</>}
                </span>
              </>
            )}
            {" · "}{termsLabel(invoice.terms)}
            {invoice.order && (
              <>
                {" · "}
                <Link href={portalPath(token, `orders/${invoice.order.id}`)} className="underline">
                  Order {invoice.order.number}
                </Link>
              </>
            )}
          </div>
        </div>
        <div
          className="rounded-lg px-5 py-3 md:text-right"
          style={{
            background: balance > 0 ? "var(--surface-1)" : "var(--success-surface)",
            border: `1px solid ${
              balance > 0 ? "var(--border-subtle)" : "var(--success-fg)"
            }`,
          }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Balance due
          </div>
          <div
            className="mt-0.5 text-3xl font-semibold tabular-nums"
            style={{
              color: balance > 0 ? "var(--text-default)" : "var(--success-fg)",
            }}
          >
            {formatMoney(balance, currency)}
          </div>
          {balance === 0 && (
            <div className="mt-0.5 text-xs font-semibold" style={{ color: "var(--success-fg)" }}>
              Paid in full
            </div>
          )}
        </div>
      </div>

      {/* Pay-now CTA block. Today it's a placeholder — once a payment
          gateway is wired (Stripe Checkout is the likely default), this
          becomes a form POSTing to an endpoint that creates the session.
          Leaving the shape of the block here means the swap is a
          one-file change. */}
      {balance > 0 && (
        <Card>
          <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              <div className="font-medium">Ready to pay?</div>
              <div style={{ color: "var(--text-muted)" }}>
                Online payment isn&apos;t wired up yet — please contact {ctx.tenant.name}
                {ctx.tenant.phone && <> at {ctx.tenant.phone}</>}.
              </div>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{
                  background: "var(--accent-muted, #334155)",
                  color: "white",
                  opacity: 0.65,
                  cursor: "not-allowed",
                }}
                title="Online payment coming soon"
              >
                Pay now (coming soon)
              </button>
            </div>
          </div>
        </Card>
      )}

      {invoice.customerNote && (
        <Card>
          <CardHeader title="Note from us" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{invoice.customerNote}</div>
        </Card>
      )}

      <Card>
        <CardHeader title="Line items" />
        <ul>
          {invoice.items.map((it) => (
            <li key={it.id} className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{it.name}</div>
                  {it.description && (
                    <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                      {it.description}
                    </div>
                  )}
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {Number(it.quantity)} × {formatMoney(Number(it.unitPrice), currency)}
                  </div>
                </div>
                <div className="text-right text-sm font-semibold tabular-nums">
                  {formatMoney(Number(it.subtotal), currency)}
                </div>
              </div>
            </li>
          ))}
          {invoice.items.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No items.</li>
          )}
        </ul>
        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
            <span className="tabular-nums">{formatMoney(Number(invoice.subtotal), currency)}</span>
          </div>
          {Number(invoice.discountAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Discount</span>
              <span className="tabular-nums">− {formatMoney(Number(invoice.discountAmount), currency)}</span>
            </div>
          )}
          {Number(invoice.taxAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Tax</span>
              <span className="tabular-nums">{formatMoney(Number(invoice.taxAmount), currency)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>Total</span>
            <span className="font-semibold tabular-nums">{formatMoney(Number(invoice.total), currency)}</span>
          </div>
          {Number(invoice.amountPaid) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Paid</span>
              <span className="tabular-nums">− {formatMoney(Number(invoice.amountPaid), currency)}</span>
            </div>
          )}
          {Number(invoice.refundedAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Refunded</span>
              <span className="tabular-nums">+ {formatMoney(Number(invoice.refundedAmount), currency)}</span>
            </div>
          )}
          {Number(invoice.writtenOffAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Written off</span>
              <span className="tabular-nums">− {formatMoney(Number(invoice.writtenOffAmount), currency)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-base font-semibold">
            <span>Balance due</span>
            <span className="tabular-nums">{formatMoney(balance, currency)}</span>
          </div>
        </div>
      </Card>

      {invoice.payments.length > 0 && (
        <Card>
          <CardHeader title="Payment history" description={`${invoice.payments.length} recorded`} />
          <ul>
            {invoice.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {paymentMethodLabel(p.method)}
                    {p.reference && (
                      <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        #{p.reference}
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(p.receivedAt, ctx.tenant.dateFormat)}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {formatMoney(Number(p.amount), currency)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {invoice.refunds.length > 0 && (
        <Card>
          <CardHeader title="Refunds" description={`${invoice.refunds.length} issued`} />
          <ul>
            {invoice.refunds.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {paymentMethodLabel(r.method)}
                    {r.reference && (
                      <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        #{r.reference}
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(r.createdAt, ctx.tenant.dateFormat)}
                  </div>
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {formatMoney(Number(r.amount), currency)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Phase 21 Slice B — per-tenant payment instructions + invoice
          footer. Kept above the print button so both survive a paper copy. */}
      {ctx.tenant.paymentInstructions && balance > 0 && (
        <Card>
          <CardHeader title="Payment instructions" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{ctx.tenant.paymentInstructions}</div>
        </Card>
      )}
      {ctx.tenant.invoiceFooterText && (
        <div
          className="whitespace-pre-wrap rounded-md px-5 py-4 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          {ctx.tenant.invoiceFooterText}
        </div>
      )}

      {/* Print button — last so it's at the bottom after the content.
          Renders as `no-print` so it's suppressed on the printed page. */}
      <div className="no-print flex justify-end">
        <PrintInvoiceButton />
      </div>
    </div>
  );
}
