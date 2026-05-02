import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import { loadInvoiceDetail } from "@/server/platform/invoices";
import { CreditNoteCard } from "./_components/CreditNoteCard";
import { EditDraftCard } from "./_components/EditDraftCard";
import { InvoiceActionsRow } from "./_components/InvoiceActionsRow";
import { PaymentRefundButton } from "./_components/PaymentRefundButton";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, { bg: string; fg: string; label: string }> = {
  DRAFT:         { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Draft" },
  SENT:          { bg: "var(--amber-50)",    fg: "var(--amber-700)",   label: "Sent" },
  OPEN:          { bg: "var(--amber-50)",    fg: "var(--amber-700)",   label: "Open" },
  PAID:          { bg: "var(--emerald-50)",  fg: "var(--emerald-700)", label: "Paid" },
  VOIDED:        { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Voided" },
  UNCOLLECTIBLE: { bg: "var(--rose-50)",     fg: "var(--rose-700)",    label: "Uncollectible" },
  REFUNDED:      { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "Refunded" },
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const detail = await loadInvoiceDetail(id);
  if (!detail) notFound();

  const canEdit = ctx.can("billing.invoice");
  const canRefund = ctx.can("billing.refund");
  const pill = STATUS_PILL[detail.status] ?? STATUS_PILL.DRAFT;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Invoices", href: "/platform/billing/invoices" },
          { label: detail.number },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={
              <span className="flex items-center gap-2">
                <span className="font-mono">{detail.number}</span>
                <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: pill!.bg, color: pill!.fg }}>
                  {pill!.label}
                </span>
                {detail.isOverdue && (
                  <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
                    Overdue
                  </span>
                )}
              </span>
            }
            description={
              <span>
                <Link href={`/platform/tenants/${detail.tenant.id}`} className="hover:underline"
                      style={{ color: "var(--accent-primary)" }}>{detail.tenant.name}</Link>
                {" · "}
                {(detail.total / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                {" · "}
                Issued by {detail.createdByEmail}
              </span>
            }
            actions={
              <>
                <Link href={`/api/platform/billing/invoices/${detail.id}/pdf`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="secondary">Download PDF</Button>
                </Link>
                <InvoiceActionsRow detail={detail} canEdit={canEdit} />
              </>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        {/* Left column */}
        <div className="space-y-3">
          {/* Bill to + line items */}
          <Card>
            <CardHeader title="Bill to" />
            <CardBody>
              <div className="text-[13px]" style={{ color: "var(--text-default)" }}>
                <div className="font-semibold">{detail.billTo.name}</div>
                {detail.billTo.addressLine1 && <div>{detail.billTo.addressLine1}</div>}
                {detail.billTo.addressLine2 && <div>{detail.billTo.addressLine2}</div>}
                {(detail.billTo.city || detail.billTo.region || detail.billTo.postalCode) && (
                  <div>
                    {[detail.billTo.city, detail.billTo.region, detail.billTo.postalCode].filter(Boolean).join(", ")}
                  </div>
                )}
                {detail.billTo.country && <div>{detail.billTo.country}</div>}
                {detail.billTo.taxId && (
                  <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Tax ID: <span className="font-mono">{detail.billTo.taxId}</span>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Line items" />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead style={{ background: "var(--surface-2)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Description</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Qty</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Unit</th>
                      <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>{it.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{it.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {(it.unitAmount / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                          {(it.lineTotal / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-3 ml-auto max-w-xs space-y-1 border-t pt-3 text-[12px]"
                   style={{ borderColor: "var(--border-subtle)" }}>
                <Total label="Subtotal" amount={detail.subtotal} currency={detail.currency} />
                {detail.discount > 0 && (
                  <Total label="Discount" amount={-detail.discount} currency={detail.currency} />
                )}
                {detail.taxBreakdown.length === 0 ? (
                  detail.tax > 0 && <Total label="Tax" amount={detail.tax} currency={detail.currency} />
                ) : (
                  detail.taxBreakdown.map((t, i) => (
                    <Total key={i} label={`Tax · ${t.jurisdiction} (${t.rate}%)`}
                           amount={t.amount} currency={detail.currency} />
                  ))
                )}
                <div className="flex justify-between border-t pt-1.5 font-semibold"
                     style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                  <span>Total</span>
                  <span className="tabular-nums">
                    {(detail.total / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                  </span>
                </div>
                {detail.amountPaid > 0 && (
                  <Total label="Amount paid" amount={detail.amountPaid} currency={detail.currency}
                         color="var(--emerald-700)" />
                )}
              </div>
            </CardBody>
          </Card>

          {/* Payment history */}
          <Card>
            <CardHeader title={`Payment history (${detail.payments.length})`}
                        description="Each payment attempt with its gateway response." />
            <CardBody>
              {detail.payments.length === 0 ? (
                <div className="rounded-md border border-dashed py-6 text-center text-[12px]"
                     style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                  No payment attempts yet.
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {detail.payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-[12px]">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  background: p.status === "succeeded" ? "var(--emerald-50)"
                                          : p.status === "failed" ? "var(--rose-50)"
                                          : p.status.includes("refund") ? "var(--accent-surface)"
                                          : "var(--surface-2)",
                                  color: p.status === "succeeded" ? "var(--emerald-700)"
                                      : p.status === "failed" ? "var(--rose-700)"
                                      : p.status.includes("refund") ? "var(--accent-primary)"
                                      : "var(--text-muted)",
                                }}>
                            {p.status.replaceAll("_", " ")}
                          </span>
                          <span className="font-medium" style={{ color: "var(--text-default)" }}>
                            {(p.amount / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                          </span>
                          {p.method && (
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {p.method}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          {p.gateway}
                          {p.gatewayPaymentId && ` · ${p.gatewayPaymentId}`}
                          {p.fee > 0 && ` · fee ${(p.fee / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}`}
                          {p.fee > 0 && ` · net ${(p.net / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}`}
                          · {p.attemptedAt.toLocaleString()}
                        </div>
                        {p.failureCode && (
                          <div className="text-[10px]" style={{ color: "var(--rose-700)" }}>
                            {p.failureCode} — {p.failureReason}
                          </div>
                        )}
                      </div>
                      {canRefund && p.status === "succeeded" && (
                        <PaymentRefundButton paymentId={p.id} amount={p.amount} currency={detail.currency} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {canEdit && detail.status === "DRAFT" && (
            <EditDraftCard detail={detail} />
          )}

          {/* Audit timeline */}
          <Card>
            <CardHeader title="Audit timeline" />
            <CardBody>
              {detail.auditEvents.length === 0 ? (
                <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  No events yet.
                </div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {detail.auditEvents.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2 py-1.5 text-[11px]">
                      <span className="font-mono" style={{ color: "var(--text-default)" }}>{e.action}</span>
                      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        {e.actorEmail ?? "system"} · {e.createdAt.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {/* Customer-visible notes */}
          {detail.notes && (
            <Card>
              <CardHeader title="Customer notes" description="Visible on the PDF + portal." />
              <CardBody>
                <p className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                  {detail.notes}
                </p>
              </CardBody>
            </Card>
          )}

          {detail.termsText && (
            <Card>
              <CardHeader title="Terms" />
              <CardBody>
                <p className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                  {detail.termsText}
                </p>
              </CardBody>
            </Card>
          )}

          {/* Internal notes */}
          {detail.internalNotes && (
            <Card style={{ borderColor: "var(--amber-200)" }}>
              <CardHeader title="Internal notes" description="Platform staff only — never shown to the customer." />
              <CardBody>
                <p className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                  {detail.internalNotes}
                </p>
              </CardBody>
            </Card>
          )}

          {detail.voidReason && (
            <Card style={{ borderColor: "var(--rose-200)" }}>
              <CardHeader title="Void reason" />
              <CardBody>
                <p className="text-[12px]" style={{ color: "var(--text-default)" }}>{detail.voidReason}</p>
              </CardBody>
            </Card>
          )}

          {/* Credit notes */}
          {canRefund && detail.status === "PAID" && (
            <CreditNoteCard invoiceId={detail.id} maxAmount={detail.total} currency={detail.currency} />
          )}

          {detail.creditNotes.length > 0 && (
            <Card>
              <CardHeader title={`Credit notes (${detail.creditNotes.length})`} />
              <CardBody>
                <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {detail.creditNotes.map((c) => (
                    <li key={c.id} className="py-2 text-[12px]">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold" style={{ color: "var(--text-default)" }}>{c.number}</span>
                        <span className="tabular-nums" style={{ color: "var(--rose-700)" }}>
                          −{(c.amount / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                        </span>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.reason}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {c.issuedAt.toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* PDF preview deferral */}
          <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
            <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
              <strong>PDF preview pane</strong> is honestly deferred — the Download-PDF button serves a JSON
              dump today since we haven't wired @react-pdf/renderer for invoices yet. The data shape is final;
              swapping in a renderer is a self-contained change.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Total({
  label, amount, currency, color,
}: {
  label: string;
  amount: number;
  currency: string;
  color?: string;
}) {
  return (
    <div className="flex justify-between" style={{ color: color ?? "var(--text-muted)" }}>
      <span>{label}</span>
      <span className="tabular-nums">
        {(amount / 100).toLocaleString(undefined, { style: "currency", currency })}
      </span>
    </div>
  );
}
