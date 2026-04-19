import { notFound } from "next/navigation";
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
import type { ShareContext } from "@/lib/share";

// Phase 15 Slice A — public invoice share view.
//
// Visually close to the portal invoice page so the customer experience
// is consistent whether they arrived via the portal or a forwarded link.
// Differences:
//   • No sidebar (see share layout) — the whole page is the document.
//   • No cross-entity links (no "view other invoices" — this link only
//     grants access to ONE invoice).
//   • Print / save PDF button at the bottom, same as portal.

export async function PublicInvoiceView({
  shareCtx,
  invoiceId,
}: {
  shareCtx: ShareContext;
  invoiceId: string;
}) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: shareCtx.tenant.id },
    include: {
      items:    { orderBy: { sortOrder: "asc" } },
      payments: {
        where: { voidedAt: null, failedAt: null },
        orderBy: { receivedAt: "desc" },
      },
      refunds: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, createdAt: true, method: true, reference: true },
      },
      order: { select: { id: true, number: true } },
    },
  });
  if (!invoice) notFound();
  // Draft/void invoices aren't customer-ready.
  if (invoice.status === "DRAFT" || invoice.status === "VOID") {
    return (
      <div
        className="rounded-lg px-5 py-8 text-center text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        This invoice isn&apos;t available.
      </div>
    );
  }

  const currency = shareCtx.tenant.currency;
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

      {/* Branding strip */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {shareCtx.tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shareCtx.tenant.logoUrl}
              alt={shareCtx.tenant.name}
              className="mb-2 h-10 w-auto"
            />
          )}
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Invoice from
          </div>
          <div className="text-lg font-semibold">{shareCtx.tenant.name}</div>
        </div>
        <div className="text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
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
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {invoice.issuedAt && <>Issued {formatDate(invoice.issuedAt)}</>}
            {invoice.dueDate && (
              <>
                {" · "}
                <span style={{ color: isOverdue ? "#ef4444" : undefined }}>
                  Due {formatDate(invoice.dueDate)}
                  {isOverdue && <> ({aging.daysPastDue}d past due)</>}
                </span>
              </>
            )}
            {" · "}{termsLabel(invoice.terms)}
          </div>
        </div>
      </div>

      {/* Balance widget */}
      <div
        className="rounded-lg px-5 py-4"
        style={{
          background: balance > 0 ? "var(--surface-1)" : "var(--success-surface)",
          border: `1px solid ${balance > 0 ? "var(--border-subtle)" : "var(--success-fg)"}`,
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
          style={{ color: balance > 0 ? "var(--text-default)" : "var(--success-fg)" }}
        >
          {formatMoney(balance, currency)}
        </div>
        {balance === 0 && (
          <div className="mt-0.5 text-xs font-semibold" style={{ color: "var(--success-fg)" }}>
            Paid in full
          </div>
        )}
        {balance > 0 && (
          <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            To pay, please contact {shareCtx.tenant.name}
            {shareCtx.tenant.phone && <> at {shareCtx.tenant.phone}</>}.
          </div>
        )}
      </div>

      {invoice.customerNote && (
        <Card>
          <CardHeader title="Note" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{invoice.customerNote}</div>
        </Card>
      )}

      <Card>
        <CardHeader title="Line items" />
        <ul>
          {invoice.items.map((it) => (
            <li
              key={it.id}
              className="px-5 py-4"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{it.name}</div>
                  {it.description && (
                    <div
                      className="mt-1 whitespace-pre-wrap text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
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
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No items.
            </li>
          )}
        </ul>
        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
            <span className="tabular-nums">
              {formatMoney(Number(invoice.subtotal), currency)}
            </span>
          </div>
          {Number(invoice.discountAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Discount</span>
              <span className="tabular-nums">
                − {formatMoney(Number(invoice.discountAmount), currency)}
              </span>
            </div>
          )}
          {Number(invoice.taxAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Tax</span>
              <span className="tabular-nums">
                {formatMoney(Number(invoice.taxAmount), currency)}
              </span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>Total</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(Number(invoice.total), currency)}
            </span>
          </div>
          {Number(invoice.amountPaid) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Paid</span>
              <span className="tabular-nums">
                − {formatMoney(Number(invoice.amountPaid), currency)}
              </span>
            </div>
          )}
          {Number(invoice.refundedAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Refunded</span>
              <span className="tabular-nums">
                + {formatMoney(Number(invoice.refundedAmount), currency)}
              </span>
            </div>
          )}
          {Number(invoice.writtenOffAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Written off</span>
              <span className="tabular-nums">
                − {formatMoney(Number(invoice.writtenOffAmount), currency)}
              </span>
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
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
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
                    {formatDate(p.receivedAt)}
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
              <li
                key={r.id}
                className="flex items-center justify-between px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
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
                    {formatDate(r.createdAt)}
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

      <div className="no-print flex justify-end">
        <PrintInvoiceButton />
      </div>
    </div>
  );
}
