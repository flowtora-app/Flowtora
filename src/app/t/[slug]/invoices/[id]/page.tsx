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

const TRANSITION_LABELS: Partial<Record<string, string>> = {
  SENT:  "Mark sent",
  DRAFT: "Revert to draft",
  VOID:  "Void",
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
  searchParams: Promise<{ error?: string; flash?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "invoices:view");
  const canManage  = ctx.can("invoices:manage");
  const canRecord  = ctx.can("payments:record");
  const canRefund  = ctx.can("refunds:issue");
  const canCredit  = ctx.can("credits:issue");
  const canWriteOff = ctx.can("writeoffs:record");

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
      // Phase 15 — share tokens for this invoice; shown in a panel so
      // staff can issue / revoke forwardable public links.
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

  // Phase 14 — all balance math flows through outstandingBalance so the
  // page and the actions agree on what "balance" means (total - paid +
  // refunded - writtenOff, clamped to [0, total]).
  const balance = outstandingBalance(invoice);
  const aging = agingFor({ status: invoice.status, dueDate: invoice.dueDate });
  const isOverdue = aging.daysPastDue > 0;
  const editable = invoice.status !== "VOID" && invoice.status !== "PAID" && invoice.status !== "WRITTEN_OFF";
  const canSendReminder = invoice.status === "SENT" || invoice.status === "PARTIAL" || invoice.status === "OVERDUE";
  const customerHasEmail = !!invoice.customer.email;

  // Credit memos available for this customer (non-voided, positive balance).
  const availableCredits = canCredit && balance > 0
    ? await db.creditMemo.findMany({
        where: { tenantId: ctx.tenant.id, customerId: invoice.customerId, voidedAt: null, balance: { gt: 0 } },
        orderBy: { issuedAt: "desc" },
        select: { id: true, number: true, balance: true, reason: true },
      })
    : [];

  // Transitions (mirror of ALLOWED_TRANSITIONS in actions).
  const transitions: Record<string, string[]> = {
    DRAFT:       ["SENT", "VOID"],
    SENT:        ["DRAFT", "VOID"],
    PARTIAL:     ["VOID"],
    PAID:        [],
    OVERDUE:     ["VOID"],
    VOID:        ["DRAFT"],
    WRITTEN_OFF: [],
  };
  const available = transitions[invoice.status] ?? [];

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/invoices`} className="underline" style={{ color: "var(--muted)" }}>
          ← Invoices
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
          {sp.error}
        </div>
      )}
      {sp.flash && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)" }}>
          {sp.flash}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{invoice.number}</h1>
            <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: statusColor(invoice.status), color: "white" }}>
              {statusLabel(invoice.status)}
            </span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {humanize(invoice.kind)}
            </span>
            {isOverdue && (
              <span className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: agingBucketColor(aging.bucket), color: "white" }}>
                {agingBucketLabel(aging.bucket)} · {aging.daysPastDue}d past due
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            For <Link href={`/t/${slug}/customers/${invoice.customer.id}`} className="underline">{invoice.customer.name}</Link>
            {invoice.order && (
              <>{" · "}Order <Link href={`/t/${slug}/orders/${invoice.order.id}`} className="underline">{invoice.order.number}</Link></>
            )}
            {invoice.dueDate && <>{" · "}Due {formatDate(invoice.dueDate)}</>}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {canManage && canSendReminder && customerHasEmail && (
            <form action={remind}>
              <Button type="submit" variant="secondary">Send reminder</Button>
            </form>
          )}
          {canManage && (invoice.status === "DRAFT" || invoice.status === "VOID") && (
            <form action={del}>
              <Button type="submit" variant="danger">Delete</Button>
            </form>
          )}
        </div>
      </div>

      {/* Status actions */}
      {canManage && available.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Actions:</span>
            {available.map((to) => {
              const action = changeInvoiceStatus.bind(null, slug, invoice.id);
              const isVoid = to === "VOID";
              return (
                <form key={to} action={action}>
                  <input type="hidden" name="status" value={to} />
                  <Button type="submit" variant={isVoid ? "danger" : (to === "DRAFT" ? "secondary" : "primary")}>
                    {TRANSITION_LABELS[to] ?? statusLabel(to as never)}
                  </Button>
                </form>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Items */}
        <Card className="col-span-2">
          <CardHeader title="Line items" description={`${invoice.items.length} ${invoice.items.length === 1 ? "line" : "lines"}`} />
          <ul>
            {invoice.items.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No items yet.</li>
            )}
            {invoice.items.map((item) => {
              const itemUpdate = updateInvoiceItem.bind(null, slug, item.id);
              const itemRemove = removeInvoiceItem.bind(null, slug, item.id);
              return (
                <li key={item.id} className="px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  {canManage && editable ? (
                    <form action={itemUpdate} className="grid grid-cols-6 gap-2 text-sm">
                      <div className="col-span-6">
                        <input
                          name="name"
                          required
                          defaultValue={item.name}
                          className="w-full rounded-md px-3 py-2 font-medium outline-none"
                          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                        />
                      </div>
                      <div className="col-span-6">
                        <textarea
                          name="description"
                          rows={2}
                          placeholder="Description (optional)"
                          defaultValue={item.description ?? ""}
                          className="w-full rounded-md px-3 py-2 text-xs outline-none"
                          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                        />
                      </div>
                      <label className="col-span-2 text-xs" style={{ color: "var(--muted)" }}>
                        <span className="mb-1 block">Quantity</span>
                        <input name="quantity" type="number" step="0.001" defaultValue={item.quantity.toString()} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
                      </label>
                      <label className="col-span-2 text-xs" style={{ color: "var(--muted)" }}>
                        <span className="mb-1 block">Unit price</span>
                        <input name="unitPrice" type="number" step="0.01" defaultValue={item.unitPrice.toString()} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
                      </label>
                      <label className="col-span-2 flex items-end gap-2 text-xs">
                        <input type="checkbox" name="taxable" defaultChecked={item.taxable} />
                        <span>Taxable</span>
                      </label>
                      <div className="col-span-6 mt-1 flex items-center justify-between">
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          Subtotal: <span style={{ color: "var(--text)" }}>{formatMoney(item.subtotal.toString(), ctx.tenant.currency)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="submit" variant="secondary">Save line</Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                          qty {item.quantity.toString()} × {formatMoney(item.unitPrice.toString(), ctx.tenant.currency)}
                          {item.taxable ? " · taxable" : ""}
                        </div>
                        {item.description && (
                          <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>{item.description}</div>
                        )}
                      </div>
                      <div className="text-right text-sm font-medium">
                        {formatMoney(item.subtotal.toString(), ctx.tenant.currency)}
                      </div>
                    </div>
                  )}
                  {canManage && editable && (
                    <form action={itemRemove} className="mt-2 text-right">
                      <Button type="submit" variant="danger">Remove</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>

          {canManage && editable && (
            <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>Add line</div>
              <form action={addItem} className="grid grid-cols-6 gap-2">
                <div className="col-span-6">
                  <Field label="Name" name="name" required />
                </div>
                <div className="col-span-2">
                  <Field label="Quantity" name="quantity" type="number" step="0.001" defaultValue="1" />
                </div>
                <div className="col-span-2">
                  <Field label="Unit price" name="unitPrice" type="number" step="0.01" defaultValue="0" />
                </div>
                <div className="col-span-2 flex items-end">
                  <Checkbox label="Taxable" name="taxable" defaultChecked />
                </div>
                <div className="col-span-6">
                  <Button type="submit" variant="secondary">Add line</Button>
                </div>
              </form>
            </div>
          )}
        </Card>

        {/* Financials */}
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
            <div style={{ borderTop: "1px solid var(--border)" }} className="pt-2">
              <Row label="Total" value={formatMoney(invoice.total.toString(), ctx.tenant.currency)} bold />
            </div>
            <div style={{ borderTop: "1px solid var(--border)" }} className="pt-2 space-y-1">
              <Row label="Paid" value={formatMoney(invoice.amountPaid.toString(), ctx.tenant.currency)} muted />
              {Number(invoice.refundedAmount) > 0 && (
                <Row label="Refunded" value={`− ${formatMoney(invoice.refundedAmount.toString(), ctx.tenant.currency)}`} muted />
              )}
              {Number(invoice.writtenOffAmount) > 0 && (
                <Row label="Written off" value={`− ${formatMoney(invoice.writtenOffAmount.toString(), ctx.tenant.currency)}`} muted />
              )}
              <Row label="Balance" value={formatMoney(balance, ctx.tenant.currency)} bold />
            </div>
            <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Terms: {termsLabel(invoice.terms)}
            </div>
          </div>
        </Card>
      </div>

      {/* Meta form */}
      {canManage && (
        <Card>
          <CardHeader title="Invoice details" />
          <form action={saveMeta} className="grid grid-cols-2 gap-4 px-5 py-4">
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
            <div className="col-span-2">
              <TextArea label="Customer-facing note" name="customerNote" rows={2} defaultValue={invoice.customerNote ?? ""} />
            </div>
            <div className="col-span-2">
              <TextArea label="Internal notes" name="internalNotes" rows={2} defaultValue={invoice.internalNotes ?? ""} />
            </div>
            <div className="col-span-2">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Payments */}
      <Card>
        <CardHeader
          title="Payments"
          description={`${invoice.payments.filter((p) => p.voidedAt == null && p.failedAt == null).length} recorded`}
        />

        {canRecord && invoice.status !== "VOID" && invoice.status !== "DRAFT" && invoice.status !== "WRITTEN_OFF" && balance > 0 && (
          <form action={recordPay} className="grid grid-cols-5 gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
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
              defaultValue="CHECK"
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
            <div className="col-span-5">
              <TextArea label="Note" name="note" rows={1} />
            </div>
          </form>
        )}

        <ul>
          {invoice.payments.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No payments yet.</li>
          )}
          {invoice.payments.map((p) => {
            const recorder = memberMap.get(p.recordedBy)?.name ?? "—";
            const doVoid = voidPayment.bind(null, slug, p.id);
            const doFail = markPaymentFailed.bind(null, slug, p.id);
            const struck = p.voidedAt || p.failedAt;
            return (
              <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <div className={`text-sm font-medium ${struck ? "line-through opacity-70" : ""}`}>
                    {formatMoney(p.amount.toString(), ctx.tenant.currency)} · {paymentMethodLabel(p.method)}
                    {p.reference && <> · {p.reference}</>}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    {formatDate(p.receivedAt)} · recorded by {recorder}
                    {p.voidedAt && <> · voided {formatDateTime(p.voidedAt)}{p.voidReason ? ` — ${p.voidReason}` : ""}</>}
                    {p.failedAt && !p.voidedAt && (
                      <> · <span style={{ color: "#b91c1c" }}>failed {formatDateTime(p.failedAt)}{p.failureReason ? ` — ${p.failureReason}` : ""}</span></>
                    )}
                  </div>
                  {p.note && !struck && (
                    <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{p.note}</div>
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
                        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", minWidth: 220 }}
                      />
                      <Button type="submit" variant="danger">Mark failed</Button>
                    </form>
                    <form action={doVoid} className="flex items-center gap-2">
                      <input
                        name="voidReason"
                        placeholder="Void reason (optional)"
                        className="rounded-md px-3 py-1.5 text-xs outline-none"
                        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", minWidth: 220 }}
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

      {/* Phase 14 — Refunds */}
      {(canRefund || invoice.refunds.length > 0) && (
        <Card>
          <CardHeader
            title="Refunds"
            description={`${invoice.refunds.length} issued · ${formatMoney(invoice.refundedAmount.toString(), ctx.tenant.currency)} returned`}
          />

          {canRefund && Number(invoice.amountPaid) > 0 && invoice.status !== "VOID" && invoice.status !== "DRAFT" && (
            <form action={refund} className="grid grid-cols-5 gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
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
              <div className="col-span-5">
                <Field label="Reason" name="reason" required />
              </div>
            </form>
          )}

          <ul>
            {invoice.refunds.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No refunds on this invoice.</li>
            )}
            {invoice.refunds.map((r) => {
              const recorder = memberMap.get(r.recordedBy)?.name ?? "—";
              const doDelete = deleteRefund.bind(null, slug, r.id);
              return (
                <li key={r.id} className="flex items-start justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div className="text-sm font-medium">
                      {formatMoney(r.amount.toString(), ctx.tenant.currency)} · {paymentMethodLabel(r.method)}
                      {r.reference && <> · {r.reference}</>}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
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

      {/* Phase 14 — Credits applied */}
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
            <form action={applyCredit} className="grid grid-cols-3 gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
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
            <div className="px-5 py-3 text-xs" style={{ color: "var(--muted)" }}>
              No available credit memos for this customer. Issue one from their customer page.
            </div>
          )}

          <ul>
            {invoice.creditApplications.length === 0 && balance > 0 && availableCredits.length === 0 && null}
            {invoice.creditApplications.map((a) => {
              const recorder = memberMap.get(a.recordedBy)?.name ?? "—";
              return (
                <li key={a.id} className="flex items-start justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div className="text-sm font-medium">
                      {formatMoney(a.amount.toString(), ctx.tenant.currency)} from {a.creditMemo.number}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {formatDate(a.appliedAt)} · by {recorder}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Phase 14 — Write-offs */}
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
            <form action={writeOff} className="grid grid-cols-3 gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <Field label="Amount (blank = full balance)" name="amount" type="number" step="0.01" min="0.01" placeholder={balance.toFixed(2)} />
              <div className="col-span-2">
                <Field label="Reason" name="reason" required placeholder="Bankruptcy, goodwill concession, etc." />
              </div>
              <div className="col-span-3 flex justify-end">
                <Button type="submit" variant="danger">Write off balance</Button>
              </div>
            </form>
          )}

          <ul>
            {invoice.writeOffs.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No write-offs recorded.</li>
            )}
            {invoice.writeOffs.map((w) => {
              const recorder = memberMap.get(w.recordedBy)?.name ?? "—";
              const doReverse = reverseWriteOff.bind(null, slug, w.id);
              const reversed = w.reversedAt != null;
              return (
                <li key={w.id} className="flex items-start justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div className={`text-sm font-medium ${reversed ? "line-through opacity-70" : ""}`}>
                      {formatMoney(w.amount.toString(), ctx.tenant.currency)}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
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

      {canManage && (
        <ShareLinkPanel
          tokens={invoice.shareTokens}
          createAction={issueShare}
          revokeAction={revokeShare}
          kind="INVOICE"
        />
      )}

      {/* Timeline */}
      <Card>
        <CardHeader title="Timeline" />
        <div className="grid grid-cols-5 gap-0 px-5 py-3 text-xs">
          {INVOICE_STATUSES.filter((s) => s.value !== "PARTIAL" && s.value !== "OVERDUE" && s.value !== "WRITTEN_OFF").map((s) => {
            const stamp =
              s.value === "DRAFT" ? invoice.createdAt
              : s.value === "SENT" ? invoice.sentAt
              : s.value === "PAID" ? invoice.paidAt
              : s.value === "VOID" ? invoice.voidedAt
              : null;
            return (
              <div key={s.value}>
                <div style={{ color: invoice.status === s.value ? s.color : "var(--muted)" }}>{s.label}</div>
                <div style={{ color: "var(--muted)" }}>{stamp ? formatDate(stamp) : "—"}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, muted, bold }: { label: string; value: React.ReactNode; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: muted ? "var(--muted)" : "var(--text)" }}>{label}</span>
      <span className={bold ? "text-lg font-semibold" : ""}>{value}</span>
    </div>
  );
}
