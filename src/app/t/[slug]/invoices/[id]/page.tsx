import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea, Checkbox } from "@/components/Field";
import {
  updateInvoiceMeta,
  addInvoiceItem,
  updateInvoiceItem,
  removeInvoiceItem,
  changeInvoiceStatus,
  deleteInvoice,
  sendInvoiceReminder,
} from "@/app/actions/invoices";
import { recordPayment, voidPayment, markPaymentFailed } from "@/app/actions/payments";
import { recordRefund, deleteRefund } from "@/app/actions/refunds";
import { applyCreditToInvoice } from "@/app/actions/credits";
import { writeOffInvoice, reverseWriteOff } from "@/app/actions/writeoffs";
import { issueInvoiceShareToken, revokeShareToken } from "@/app/actions/share-tokens";
import { ShareLinkPanel } from "@/components/share/ShareLinkPanel";
import {
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  RECORDABLE_PAYMENT_METHODS,
  paymentMethodLabel,
  statusColor,
  statusLabel,
  termsLabel,
  outstandingBalance,
  agingFor,
  agingBucketColor,
  agingBucketLabel,
} from "@/lib/invoices";
import { formatMoney, formatDate, formatDateTime, humanize } from "@/lib/format";
import { memberLookup } from "@/lib/members";
import { InvoiceDetailTabs, type InvoiceDetailTab } from "@/components/invoices/InvoiceDetailTabs";

// Inlined rather than imported from the client component — a value exported
// from a "use client" module is a client reference and can't be called from
// the server.
function parseInvoiceDetailTab(raw: string | undefined): InvoiceDetailTab {
  switch (raw) {
    case "payments":
    case "notes":
    case "sharing":
    case "activity":
      return raw;
    default:
      return "details";
  }
}

const TRANSITION_LABELS: Partial<Record<string, string>> = {
  SENT:  "Mark sent",
  DRAFT: "Revert to draft",
  VOID:  "Void",
};

// Non-primary status transitions. Primary (DRAFT→SENT) is promoted to the
// header CTA, so it's filtered out of the secondary row for DRAFT.
const SECONDARY_TRANSITIONS: Record<string, string[]> = {
  DRAFT:       ["VOID"],
  SENT:        ["DRAFT", "VOID"],
  PARTIAL:     ["VOID"],
  PAID:        [],
  OVERDUE:     ["VOID"],
  VOID:        ["DRAFT"],
  WRITTEN_OFF: [],
};

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { id } = await params;
  const inv = await db.invoice.findUnique({
    where:  { id },
    select: { number: true },
  });
  return { title: inv?.number ? `Invoice ${inv.number}` : "Invoice" };
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; flash?: string; tab?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "invoices:view");
  const canManage  = ctx.can("invoices:manage");
  const canRecord  = ctx.can("payments:record");
  const canRefund  = ctx.can("refunds:issue");
  const canCredit  = ctx.can("credits:issue");
  const canWriteOff = ctx.can("writeoffs:record");
  const activeTab = parseInvoiceDetailTab(sp.tab);

  const invoice = await db.invoice.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      customer: true,
      order: { select: { id: true, number: true, status: true } },
      items: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { receivedAt: "desc" } },
      refunds: { orderBy: { refundedAt: "desc" } },
      creditApplications: {
        orderBy: { appliedAt: "desc" },
        include: { creditMemo: { select: { id: true, number: true } } },
      },
      writeOffs: { orderBy: { writtenOffAt: "desc" } },
      shareTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, token: true, label: true, expiresAt: true, revokedAt: true,
          lastUsedAt: true, viewCount: true, createdAt: true,
        },
      },
    },
  });
  if (!invoice) notFound();
  ctx.assertBranchAccess(invoice.locationId);

  const memberMap = await memberLookup(ctx.tenant.id);

  const saveMeta = updateInvoiceMeta.bind(null, slug, invoice.id);
  const addItem = addInvoiceItem.bind(null, slug, invoice.id);
  const del = deleteInvoice.bind(null, slug, invoice.id);
  const recordPay = recordPayment.bind(null, slug, invoice.id);
  const remind = sendInvoiceReminder.bind(null, slug, invoice.id);
  const refund = recordRefund.bind(null, slug, invoice.id);
  const applyCredit = applyCreditToInvoice.bind(null, slug, invoice.id);
  const writeOff = writeOffInvoice.bind(null, slug, invoice.id);
  const issueShare = issueInvoiceShareToken.bind(null, slug, invoice.id);
  const revokeShare = revokeShareToken.bind(null, slug);
  const setStatus = changeInvoiceStatus.bind(null, slug, invoice.id);

  const balance = outstandingBalance(invoice);
  const aging = agingFor({ status: invoice.status, dueDate: invoice.dueDate });
  const isOverdue = aging.daysPastDue > 0;
  const editable = invoice.status !== "VOID" && invoice.status !== "PAID" && invoice.status !== "WRITTEN_OFF";
  const canSendReminder = invoice.status === "SENT" || invoice.status === "PARTIAL" || invoice.status === "OVERDUE";
  const customerHasEmail = !!invoice.customer.email;

  const availableCredits = canCredit && balance > 0
    ? await db.creditMemo.findMany({
        where: { tenantId: ctx.tenant.id, customerId: invoice.customerId, voidedAt: null, balance: { gt: 0 } },
        orderBy: { issuedAt: "desc" },
        select: { id: true, number: true, balance: true, reason: true },
      })
    : [];

  const secondaryTransitions = SECONDARY_TRANSITIONS[invoice.status] ?? [];
  const canRecordPaymentInline =
    canRecord &&
    balance > 0 &&
    invoice.status !== "VOID" &&
    invoice.status !== "DRAFT" &&
    invoice.status !== "WRITTEN_OFF";

  // Primary CTA — the one most important action for this status. Lives in the
  // sticky header; everything else goes into the secondary actions row.
  let primaryCta: React.ReactNode = null;
  if (canManage && invoice.status === "DRAFT") {
    primaryCta = (
      <form action={setStatus}>
        <input type="hidden" name="status" value="SENT" />
        <Button type="submit">Mark sent</Button>
      </form>
    );
  } else if (canRecordPaymentInline) {
    primaryCta = (
      <Link
        href={`/t/${slug}/invoices/${invoice.id}?tab=payments`}
        className="ts-focus inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        style={{ background: "var(--accent)", color: "white" }}
      >
        Record payment
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href={`/t/${slug}/invoices`} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Invoices
        </Link>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}
      {sp.flash && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          {sp.flash}
        </div>
      )}

      {/* Status-specific banners. Above the sticky header so they scroll away. */}
      {invoice.status === "VOID" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
          }}
        >
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            Invoice voided{invoice.voidedAt ? ` on ${formatDate(invoice.voidedAt)}` : ""}
          </div>
          <div className="mt-1 text-xs">
            Voided invoices are kept for audit but no longer contribute to receivables.
          </div>
        </div>
      )}
      {invoice.status === "WRITTEN_OFF" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-muted)",
          }}
        >
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            Balance written off
          </div>
          <div className="mt-1 text-xs">
            {formatMoney(invoice.writtenOffAmount.toString(), ctx.tenant.currency)} removed from receivables.
          </div>
        </div>
      )}

      {/* STICKY HEADER — premium-redesigned to match Customer + Quote + Order detail. */}
      <header
        className="sticky top-0 z-10 overflow-hidden rounded-2xl"
        style={{
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 2px 8px -2px rgba(0,0,0,0.25)",
          backdropFilter: "saturate(140%) blur(2px)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <Link
              href={`/t/${slug}/customers/${invoice.customer.id}`}
              aria-label={`View ${invoice.customer.name}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
                color: "var(--accent-primary)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
                fontSize: 18,
                fontWeight: 700,
                flexShrink: 0,
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
              }}
            >
              {(invoice.customer.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="font-semibold"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 22,
                    letterSpacing: "-0.018em",
                    lineHeight: 1.2,
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {invoice.number}
                </h1>
                {(() => {
                  const sc = statusColor(invoice.status);
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: 999,
                        color: sc,
                        background: `color-mix(in oklab, ${sc} 16%, transparent)`,
                        border: `1px solid color-mix(in oklab, ${sc} 32%, transparent)`,
                        lineHeight: 1,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 999,
                          background: sc,
                          boxShadow: `0 0 0 1.5px color-mix(in oklab, ${sc} 25%, transparent)`,
                        }}
                      />
                      {statusLabel(invoice.status)}
                    </span>
                  );
                })()}
                {invoice.kind !== "STANDARD" && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      padding: "2px 6px",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                      lineHeight: 1,
                    }}
                  >
                    {humanize(invoice.kind)}
                  </span>
                )}
                {isOverdue && (() => {
                  const ac = agingBucketColor(aging.bucket);
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        padding: "2px 8px",
                        borderRadius: 999,
                        color: "white",
                        background: ac,
                        border: `1px solid color-mix(in oklab, ${ac} 60%, black 40%)`,
                        lineHeight: 1,
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {agingBucketLabel(aging.bucket)} · {aging.daysPastDue}d past due
                    </span>
                  );
                })()}
              </div>
              <div
                className="mt-1.5 truncate"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                }}
              >
                For{" "}
                <Link
                  href={`/t/${slug}/customers/${invoice.customer.id}`}
                  style={{
                    color: "var(--text-default)",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                  className="hover:underline"
                >
                  {invoice.customer.name}
                </Link>
                {invoice.order && (
                  <>
                    <span style={{ color: "var(--text-faint)" }}> · </span>
                    Order{" "}
                    <Link
                      href={`/t/${slug}/orders/${invoice.order.id}`}
                      style={{
                        color: "var(--accent-primary)",
                        fontWeight: 500,
                        textDecoration: "none",
                      }}
                      className="hover:underline"
                    >
                      {invoice.order.number}
                    </Link>
                  </>
                )}
                {invoice.dueDate && (
                  <>
                    <span style={{ color: "var(--text-faint)" }}> · </span>
                    Due{" "}
                    <span style={{ color: "var(--text-default)" }}>
                      {formatDate(invoice.dueDate)}
                    </span>
                  </>
                )}
                <span style={{ color: "var(--text-faint)" }}> · </span>
                Terms{" "}
                <span style={{ color: "var(--text-default)" }}>
                  {termsLabel(invoice.terms)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div
                style={{
                  color: "var(--text-faint)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                }}
              >
                {balance > 0 ? "Balance" : "Total"}
              </div>
              <div
                className="mt-1 font-semibold"
                style={{
                  color: balance > 0 && isOverdue ? "var(--danger-fg, var(--rose-500))" : "var(--text-default)",
                  fontSize: 22,
                  letterSpacing: "-0.018em",
                  lineHeight: 1.1,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {formatMoney(balance > 0 ? balance : Number(invoice.total), ctx.tenant.currency)}
              </div>
              {balance > 0 && (
                <div
                  className="mt-0.5"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  of {formatMoney(invoice.total.toString(), ctx.tenant.currency)} total
                </div>
              )}
            </div>
            {canManage && primaryCta && (
              <div className="flex items-center gap-2">{primaryCta}</div>
            )}
          </div>
        </div>
      </header>

      {/* Compact actions row — transitions + reminder + delete. */}
      {canManage &&
        (secondaryTransitions.length > 0 ||
          (canSendReminder && customerHasEmail) ||
          invoice.status === "DRAFT" ||
          invoice.status === "VOID") && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryTransitions.map((to) => {
              const isVoid = to === "VOID";
              return (
                <form key={to} action={setStatus}>
                  <input type="hidden" name="status" value={to} />
                  <Button
                    type="submit"
                    variant={isVoid ? "danger" : "secondary"}
                  >
                    {TRANSITION_LABELS[to] ?? humanize(to)}
                  </Button>
                </form>
              );
            })}
            {canSendReminder && customerHasEmail && (
              <form action={remind}>
                <Button type="submit" variant="secondary">Send reminder</Button>
              </form>
            )}
            {(invoice.status === "DRAFT" || invoice.status === "VOID") && (
              <form action={del}>
                <Button type="submit" variant="danger">Delete</Button>
              </form>
            )}
          </div>
        )}

      {/* MAIN WORKSPACE — line items editor + sticky financial summary. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Line items"
              description={
                invoice.items.length === 0
                  ? "Add lines below to get started."
                  : `${invoice.items.length} ${invoice.items.length === 1 ? "line" : "lines"}`
              }
            />
            <ul
              className="space-y-3 px-5 py-4"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              {invoice.items.length === 0 && (
                <li className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No items yet.
                </li>
              )}
              {invoice.items.map((item) => {
                const itemUpdate = updateInvoiceItem.bind(null, slug, item.id);
                const itemRemove = removeInvoiceItem.bind(null, slug, item.id);
                return (
                  <li key={item.id}>
                    <div
                      className="overflow-hidden rounded-lg"
                      style={{
                        background: "var(--surface-0)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {canManage && editable ? (
                        <form action={itemUpdate} className="contents">
                          <div className="flex items-start gap-4 p-4">
                            <div className="min-w-0 flex-1 space-y-2">
                              <Field
                                label="Line name"
                                name="name"
                                required
                                defaultValue={item.name}
                              />
                            </div>
                            <div className="shrink-0 text-right">
                              <div
                                className="text-[10px] uppercase tracking-wide"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Line total
                              </div>
                              <div
                                className="text-2xl font-semibold tabular-nums leading-tight"
                                style={{ color: "var(--text-default)" }}
                              >
                                {formatMoney(item.subtotal.toString(), ctx.tenant.currency)}
                              </div>
                              {item.taxable ? (
                                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                                  taxable
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 px-4 pb-4 md:grid-cols-3">
                            <Field
                              label="Quantity"
                              name="quantity"
                              type="number"
                              step="0.001"
                              defaultValue={item.quantity.toString()}
                            />
                            <Field
                              label="Unit price"
                              name="unitPrice"
                              type="number"
                              step="0.01"
                              defaultValue={item.unitPrice.toString()}
                            />
                            <div className="flex items-end">
                              <Checkbox label="Taxable" name="taxable" defaultChecked={item.taxable} />
                            </div>
                          </div>

                          <details
                            style={{ borderTop: "1px solid var(--border-subtle)" }}
                          >
                            <summary
                              className="cursor-pointer select-none px-4 py-2 text-xs font-medium"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Description
                            </summary>
                            <div className="px-4 pb-4 pt-2">
                              <TextArea
                                label="Description"
                                name="description"
                                rows={2}
                                defaultValue={item.description ?? ""}
                              />
                            </div>
                          </details>

                          <div
                            className="flex items-center justify-between gap-3 px-4 py-2"
                            style={{
                              borderTop: "1px solid var(--border-subtle)",
                              background: "var(--surface-1)",
                            }}
                          >
                            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                              Edits stay pending until you save this row.
                            </div>
                            <Button type="submit" variant="secondary">Save row</Button>
                          </div>
                        </form>
                      ) : (
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{item.name}</div>
                              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                qty {item.quantity.toString()} × {formatMoney(item.unitPrice.toString(), ctx.tenant.currency)}
                                {item.taxable ? " · taxable" : ""}
                              </div>
                              {item.description && (
                                <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                                  {item.description}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                              {formatMoney(item.subtotal.toString(), ctx.tenant.currency)}
                            </div>
                          </div>
                        </div>
                      )}

                      {canManage && editable && (
                        <div
                          className="flex justify-end px-4 py-2"
                          style={{
                            borderTop: "1px solid var(--border-subtle)",
                            background: "var(--surface-0)",
                          }}
                        >
                          <form action={itemRemove}>
                            <button
                              type="submit"
                              className="text-xs underline"
                              style={{ color: "var(--danger-fg)" }}
                            >
                              Remove line
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {canManage && editable && (
              <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="text-sm font-medium">Add line item</div>
                <form action={addItem} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6 md:items-end">
                  <div className="md:col-span-6">
                    <Field label="Name" name="name" required />
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Quantity" name="quantity" type="number" step="0.001" defaultValue="1" />
                  </div>
                  <div className="md:col-span-2">
                    <Field label="Unit price" name="unitPrice" type="number" step="0.01" defaultValue="0" />
                  </div>
                  <div className="md:col-span-2 flex items-end">
                    <Checkbox label="Taxable" name="taxable" defaultChecked />
                  </div>
                  <div className="md:col-span-6">
                    <Button type="submit" variant="secondary">Add line</Button>
                  </div>
                </form>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Financials" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <Row label="Subtotal" value={formatMoney(invoice.subtotal.toString(), ctx.tenant.currency)} />
              {Number(invoice.discountAmount) > 0 && (
                <Row
                  label={`Discount${invoice.discountType === "PERCENT" ? ` (${invoice.discountValue}%)` : ""}`}
                  value={`− ${formatMoney(invoice.discountAmount.toString(), ctx.tenant.currency)}`}
                  muted
                />
              )}
              <Row
                label={`Tax (${(Number(invoice.taxRate) * 100).toFixed(2)}%)`}
                value={formatMoney(invoice.taxAmount.toString(), ctx.tenant.currency)}
                muted
              />
              <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="pt-2">
                <Row label="Total" value={formatMoney(invoice.total.toString(), ctx.tenant.currency)} bold />
              </div>
              <div style={{ borderTop: "1px solid var(--border-subtle)" }} className="pt-2 space-y-1">
                <Row label="Paid" value={formatMoney(invoice.amountPaid.toString(), ctx.tenant.currency)} muted />
                {Number(invoice.refundedAmount) > 0 && (
                  <Row label="Refunded" value={`− ${formatMoney(invoice.refundedAmount.toString(), ctx.tenant.currency)}`} muted />
                )}
                {Number(invoice.writtenOffAmount) > 0 && (
                  <Row label="Written off" value={`− ${formatMoney(invoice.writtenOffAmount.toString(), ctx.tenant.currency)}`} muted />
                )}
                <Row label="Balance" value={formatMoney(balance, ctx.tenant.currency)} bold />
              </div>
            </div>
          </Card>
        </aside>
      </div>

      {/* SECONDARY TABS */}
      <div className="space-y-5 pt-2">
        <InvoiceDetailTabs active={activeTab} />

        {activeTab === "details" && (
          <Card>
            <CardHeader title="Details" description="Dates, terms, tax and discount. Saved independently of notes and line items." />
            <form action={saveMeta} className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
              <Field
                label="Issued at"
                name="issuedAt"
                type="date"
                defaultValue={invoice.issuedAt ? formatDate(invoice.issuedAt) : ""}
                hint="Leaving blank keeps the invoice un-issued."
              />
              <Field
                label="Due date"
                name="dueDate"
                type="date"
                defaultValue={invoice.dueDate ? formatDate(invoice.dueDate) : ""}
                hint="Auto-derived from terms if left blank."
              />
              <SelectField
                label="Terms"
                name="terms"
                defaultValue={invoice.terms}
                options={[
                  { value: "DUE_ON_RECEIPT", label: "Due on receipt" },
                  { value: "NET_15", label: "Net 15" },
                  { value: "NET_30", label: "Net 30" },
                  { value: "NET_45", label: "Net 45" },
                  { value: "NET_60", label: "Net 60" },
                ]}
              />
              <Field
                label="Tax rate (%)"
                name="taxRatePercent"
                type="number"
                step="0.01"
                defaultValue={(Number(invoice.taxRate) * 100).toString()}
              />
              <SelectField
                label="Discount type"
                name="discountType"
                defaultValue={invoice.discountType}
                options={[
                  { value: "NONE",    label: "None" },
                  { value: "FIXED",   label: "Fixed amount" },
                  { value: "PERCENT", label: "Percent" },
                ]}
              />
              <Field
                label="Discount value"
                name="discountValue"
                type="number"
                step="0.01"
                defaultValue={Number(invoice.discountValue) > 0 ? invoice.discountValue.toString() : ""}
                hint="$ if fixed, % if percent."
              />
              {canManage && (
                <div className="md:col-span-2">
                  <Button type="submit">Save details</Button>
                </div>
              )}
            </form>
          </Card>
        )}

        {activeTab === "payments" && (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Payments"
                description={`${invoice.payments.filter((p) => p.voidedAt == null && p.failedAt == null).length} recorded · ${formatMoney(invoice.amountPaid.toString(), ctx.tenant.currency)} paid`}
              />

              {canRecordPaymentInline && (
                <form
                  action={recordPay}
                  className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-5"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <Field
                    label="Amount"
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={balance.toFixed(2)}
                    required
                  />
                  <SelectField
                    label="Method"
                    name="method"
                    defaultValue="CARD"
                    options={RECORDABLE_PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
                  />
                  <Field label="Reference" name="reference" placeholder="Check # / txn id" />
                  <Field
                    label="Received"
                    name="receivedAt"
                    type="date"
                    defaultValue={formatDate(new Date())}
                  />
                  <div className="flex items-end">
                    <Button type="submit">Record payment</Button>
                  </div>
                  <div className="md:col-span-5">
                    <TextArea label="Note" name="note" rows={1} />
                  </div>
                </form>
              )}

              <ul>
                {invoice.payments.length === 0 && (
                  <li
                    className="px-5 py-4 text-sm"
                    style={{
                      color: "var(--text-muted)",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    No payments yet.
                  </li>
                )}
                {invoice.payments.map((p) => {
                  const recorder = memberMap.get(p.recordedBy)?.name ?? "—";
                  const doVoid = voidPayment.bind(null, slug, p.id);
                  const doFail = markPaymentFailed.bind(null, slug, p.id);
                  const struck = p.voidedAt || p.failedAt;
                  return (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-3 px-5 py-3"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <div>
                        <div className={`text-sm font-medium ${struck ? "line-through opacity-70" : ""}`}>
                          {formatMoney(p.amount.toString(), ctx.tenant.currency)} · {paymentMethodLabel(p.method)}
                          {p.reference && <> · {p.reference}</>}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatDate(p.receivedAt)} · recorded by {recorder}
                          {p.voidedAt && <> · voided {formatDateTime(p.voidedAt)}{p.voidReason ? ` — ${p.voidReason}` : ""}</>}
                          {p.failedAt && !p.voidedAt && (
                            <>
                              {" · "}
                              <span style={{ color: "var(--danger-fg)" }}>
                                failed {formatDateTime(p.failedAt)}{p.failureReason ? ` — ${p.failureReason}` : ""}
                              </span>
                            </>
                          )}
                        </div>
                        {p.note && !struck && (
                          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{p.note}</div>
                        )}
                      </div>
                      {canRecord && !struck && (
                        <div className="flex flex-col items-end gap-1">
                          <form action={doFail} className="flex items-center gap-2">
                            <input
                              name="failureReason"
                              required
                              placeholder="Reason (declined, bounced, etc.)"
                              className="rounded-md px-3 py-1.5 text-xs outline-none"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-default)",
                                minWidth: 220,
                              }}
                            />
                            <Button type="submit" variant="danger">Mark failed</Button>
                          </form>
                          <form action={doVoid} className="flex items-center gap-2">
                            <input
                              name="voidReason"
                              placeholder="Void reason (optional)"
                              className="rounded-md px-3 py-1.5 text-xs outline-none"
                              style={{
                                background: "var(--surface-1)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-default)",
                                minWidth: 220,
                              }}
                            />
                            <Button type="submit" variant="secondary">Void</Button>
                          </form>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>

            {(canRefund || invoice.refunds.length > 0) && (
              <Card>
                <CardHeader
                  title="Refunds"
                  description={`${invoice.refunds.length} issued · ${formatMoney(invoice.refundedAmount.toString(), ctx.tenant.currency)} returned`}
                />

                {canRefund && Number(invoice.amountPaid) > 0 && invoice.status !== "VOID" && invoice.status !== "DRAFT" && (
                  <form
                    action={refund}
                    className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-5"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <Field label="Amount" name="amount" type="number" step="0.01" min="0.01" required />
                    <SelectField
                      label="Method"
                      name="method"
                      defaultValue="CARD"
                      options={PAYMENT_METHODS.filter((m) => m.value !== "CREDIT_MEMO").map((m) => ({ value: m.value, label: m.label }))}
                    />
                    <Field label="Reference" name="reference" placeholder="External refund ID" />
                    <SelectField
                      label="Against payment"
                      name="paymentId"
                      defaultValue=""
                      options={[
                        { value: "", label: "Standalone" },
                        ...invoice.payments
                          .filter((p) => p.voidedAt == null && p.failedAt == null)
                          .map((p) => ({
                            value: p.id,
                            label: `${formatMoney(p.amount.toString(), ctx.tenant.currency)} · ${paymentMethodLabel(p.method)} · ${formatDate(p.receivedAt)}`,
                          })),
                      ]}
                    />
                    <div className="flex items-end">
                      <Button type="submit" variant="danger">Issue refund</Button>
                    </div>
                    <div className="md:col-span-5">
                      <Field label="Reason" name="reason" required />
                    </div>
                  </form>
                )}

                <ul>
                  {invoice.refunds.length === 0 && (
                    <li
                      className="px-5 py-4 text-sm"
                      style={{
                        color: "var(--text-muted)",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      No refunds on this invoice.
                    </li>
                  )}
                  {invoice.refunds.map((r) => {
                    const recorder = memberMap.get(r.recordedBy)?.name ?? "—";
                    const doDelete = deleteRefund.bind(null, slug, r.id);
                    return (
                      <li
                        key={r.id}
                        className="flex items-start justify-between px-5 py-3"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {formatMoney(r.amount.toString(), ctx.tenant.currency)} · {paymentMethodLabel(r.method)}
                            {r.reference && <> · {r.reference}</>}
                          </div>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatDate(r.refundedAt)} · by {recorder}
                          </div>
                          <div className="mt-1 text-xs">{r.reason}</div>
                        </div>
                        {canRefund && (
                          <form action={doDelete}>
                            <Button type="submit" variant="danger">Remove</Button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {(canCredit || invoice.creditApplications.length > 0) && (
              <Card>
                <CardHeader
                  title="Credits applied"
                  description={
                    invoice.creditApplications.length > 0
                      ? `${invoice.creditApplications.length} applied`
                      : "No credits applied yet"
                  }
                />

                {canCredit && balance > 0 && availableCredits.length > 0 && (
                  <form
                    action={applyCredit}
                    className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <SelectField
                      label="Credit memo"
                      name="creditMemoId"
                      defaultValue=""
                      options={[
                        { value: "", label: "Choose…" },
                        ...availableCredits.map((c) => ({
                          value: c.id,
                          label: `${c.number} · ${formatMoney(c.balance.toString(), ctx.tenant.currency)} left`,
                        })),
                      ]}
                      required
                    />
                    <Field label="Apply amount" name="amount" type="number" step="0.01" min="0.01" required defaultValue={balance.toFixed(2)} />
                    <div className="flex items-end">
                      <Button type="submit">Apply credit</Button>
                    </div>
                  </form>
                )}
                {canCredit && balance > 0 && availableCredits.length === 0 && (
                  <div
                    className="px-5 py-3 text-xs"
                    style={{
                      color: "var(--text-muted)",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    No available credit memos for this customer. Issue one from their customer page.
                  </div>
                )}

                <ul>
                  {invoice.creditApplications.map((a) => {
                    const recorder = memberMap.get(a.recordedBy)?.name ?? "—";
                    return (
                      <li
                        key={a.id}
                        className="flex items-start justify-between px-5 py-3"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {formatMoney(a.amount.toString(), ctx.tenant.currency)} from {a.creditMemo.number}
                          </div>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatDate(a.appliedAt)} · by {recorder}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {(canWriteOff || invoice.writeOffs.length > 0) && (
              <Card>
                <CardHeader
                  title="Write-offs"
                  description={
                    invoice.writeOffs.length > 0
                      ? `${formatMoney(invoice.writtenOffAmount.toString(), ctx.tenant.currency)} written off`
                      : "None"
                  }
                />

                {canWriteOff && balance > 0 && invoice.status !== "WRITTEN_OFF" && invoice.status !== "VOID" && invoice.status !== "DRAFT" && invoice.status !== "PAID" && (
                  <form
                    action={writeOff}
                    className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-3"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <Field label="Amount (blank = full balance)" name="amount" type="number" step="0.01" min="0.01" placeholder={balance.toFixed(2)} />
                    <div className="md:col-span-2">
                      <Field label="Reason" name="reason" required placeholder="Bankruptcy, goodwill concession, etc." />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button type="submit" variant="danger">Write off balance</Button>
                    </div>
                  </form>
                )}

                <ul>
                  {invoice.writeOffs.length === 0 && (
                    <li
                      className="px-5 py-4 text-sm"
                      style={{
                        color: "var(--text-muted)",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      No write-offs recorded.
                    </li>
                  )}
                  {invoice.writeOffs.map((w) => {
                    const recorder = memberMap.get(w.recordedBy)?.name ?? "—";
                    const doReverse = reverseWriteOff.bind(null, slug, w.id);
                    const reversed = w.reversedAt != null;
                    return (
                      <li
                        key={w.id}
                        className="flex items-start justify-between px-5 py-3"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <div>
                          <div className={`text-sm font-medium ${reversed ? "line-through opacity-70" : ""}`}>
                            {formatMoney(w.amount.toString(), ctx.tenant.currency)}
                          </div>
                          <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatDate(w.writtenOffAt)} · by {recorder}
                            {reversed && <> · reversed {formatDateTime(w.reversedAt!)}</>}
                          </div>
                          <div className="mt-1 text-xs">{w.reason}</div>
                        </div>
                        {canWriteOff && !reversed && (
                          <form action={doReverse}>
                            <Button type="submit" variant="secondary">Reverse</Button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        )}

        {activeTab === "notes" && (
          <Card>
            <CardHeader
              title="Notes"
              description="Customer-facing note appears on the invoice copy and share portal. Internal notes are staff-only."
            />
            <form action={saveMeta} className="space-y-4 px-5 py-4">
              <TextArea
                label="Customer-facing note"
                name="customerNote"
                rows={3}
                defaultValue={invoice.customerNote ?? ""}
              />
              <TextArea
                label="Internal notes"
                name="internalNotes"
                rows={3}
                defaultValue={invoice.internalNotes ?? ""}
              />
              {canManage && (
                <div>
                  <Button type="submit">Save notes</Button>
                </div>
              )}
            </form>
          </Card>
        )}

        {activeTab === "sharing" && (
          <>
            {canManage ? (
              <ShareLinkPanel
                tokens={invoice.shareTokens}
                createAction={issueShare}
                revokeAction={revokeShare}
                kind="INVOICE"
              />
            ) : (
              <Card>
                <CardHeader title="Sharing" description="You don't have permission to manage share links." />
              </Card>
            )}
          </>
        )}

        {activeTab === "activity" && (
          <Card>
            <CardHeader title="Timeline" description="Status milestones for this invoice." />
            <div className="grid grid-cols-2 gap-3 px-5 py-4 text-xs sm:grid-cols-3 md:grid-cols-5">
              {INVOICE_STATUSES.filter((s) => s.value !== "PARTIAL" && s.value !== "OVERDUE" && s.value !== "WRITTEN_OFF").map((s) => {
                const stamp =
                  s.value === "DRAFT" ? invoice.createdAt
                  : s.value === "SENT" ? invoice.sentAt
                  : s.value === "PAID" ? invoice.paidAt
                  : s.value === "VOID" ? invoice.voidedAt
                  : null;
                const isActive = invoice.status === s.value;
                return (
                  <div
                    key={s.value}
                    className="rounded-md px-3 py-2"
                    style={{
                      background: isActive ? "var(--accent-surface)" : "var(--surface-1)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      className="text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: isActive ? s.color : "var(--text-muted)" }}
                    >
                      {s.label}
                    </div>
                    <div className="mt-1" style={{ color: "var(--text-default)" }}>
                      {stamp ? formatDate(stamp) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: React.ReactNode; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text-default)" }}>{label}</span>
      <span className={bold ? "text-lg font-semibold" : ""}>{value}</span>
    </div>
  );
}
