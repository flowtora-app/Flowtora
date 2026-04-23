import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { changeInvoiceStatus, sendInvoiceReminder } from "@/app/actions/invoices";
import { recordPayment } from "@/app/actions/payments";
import {
  statusColor,
  statusLabel,
  termsLabel,
  outstandingBalance,
  agingFor,
  agingBucketColor,
  agingBucketLabel,
  paymentMethodLabel,
  RECORDABLE_PAYMENT_METHODS,
} from "@/lib/invoices";
import { formatMoney, formatDate, formatDateTime, humanize } from "@/lib/format";
import { InvoicePanelTabs, type InvoicePanelTab } from "@/components/invoices/InvoicePanelTabs";
import type { InvoiceStatus, PaymentMethod, PaymentTerms, InvoiceKind } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT:       ["SENT", "VOID"],
  SENT:        ["DRAFT", "VOID"],
  PARTIAL:     ["VOID"],
  PAID:        [],
  OVERDUE:     ["VOID"],
  VOID:        ["DRAFT"],
  WRITTEN_OFF: [],
};

const TRANSITION_LABELS: Partial<Record<InvoiceStatus, string>> = {
  SENT:  "Mark sent",
  DRAFT: "Revert to draft",
  VOID:  "Void",
};

export type InvoicePanelInvoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  kind: InvoiceKind;
  locationId: string | null;
  issuedAt: Date | null;
  dueDate: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  terms: PaymentTerms;
  total: unknown;
  amountPaid: unknown;
  refundedAmount: unknown;
  writtenOffAmount: unknown;
  subtotal: unknown;
  taxAmount: unknown;
  discountAmount: unknown;
  customerNote: string | null;
  internalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  order: { id: string; number: string; status: string } | null;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: unknown;
    unitPrice: unknown;
    subtotal: unknown;
  }>;
  payments: Array<{
    id: string;
    amount: unknown;
    method: PaymentMethod;
    reference: string | null;
    note: string | null;
    receivedAt: Date;
    voidedAt: Date | null;
    voidReason: string | null;
    failedAt: Date | null;
    failureReason: string | null;
    recordedBy: string;
  }>;
};

export type InvoicePanelActivity = {
  id: string;
  action: string;
  userId: string | null;
  createdAt: Date;
  metadata: unknown;
};

interface InvoicePanelProps {
  slug: string;
  currency: string;
  invoice: InvoicePanelInvoice;
  tab: InvoicePanelTab;
  activity: InvoicePanelActivity[];
  canManage: boolean;
  canRecord: boolean;
  memberMap: Map<string, { name: string }>;
}

export function InvoicePanel({
  slug,
  currency,
  invoice,
  tab,
  activity,
  canManage,
  canRecord,
  memberMap,
}: InvoicePanelProps) {
  const transitions = ALLOWED_TRANSITIONS[invoice.status] ?? [];
  const balance = outstandingBalance(invoice as never);
  const aging = agingFor({ status: invoice.status, dueDate: invoice.dueDate });
  const isOverdue = aging.daysPastDue > 0;
  const canSendReminder =
    invoice.status === "SENT" || invoice.status === "PARTIAL" || invoice.status === "OVERDUE";
  const customerHasEmail = !!invoice.customer.email;

  let nextAction = "";
  if (invoice.status === "DRAFT") {
    nextAction = "Mark sent to start the clock on payment.";
  } else if (invoice.status === "VOID") {
    nextAction = "Voided — no balance due.";
  } else if (invoice.status === "WRITTEN_OFF") {
    nextAction = "Written off.";
  } else if (invoice.status === "PAID") {
    nextAction = "Paid in full.";
  } else if (balance > 0.005) {
    if (isOverdue) {
      nextAction = `${formatMoney(balance, currency)} overdue by ${aging.daysPastDue}d — send reminder.`;
    } else if (invoice.dueDate) {
      nextAction = `${formatMoney(balance, currency)} due by ${formatDate(invoice.dueDate)}.`;
    } else {
      nextAction = `${formatMoney(balance, currency)} outstanding.`;
    }
  } else {
    nextAction = "Balance cleared.";
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* STICKY HEADER */}
      <div
        className="sticky top-0 z-20 px-6 py-4"
        style={{
          background: "var(--surface-0)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
                {invoice.number}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: statusColor(invoice.status), color: "white" }}
              >
                {statusLabel(invoice.status)}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {humanize(invoice.kind)}
              </span>
              {isOverdue && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: agingBucketColor(aging.bucket), color: "white" }}
                >
                  {agingBucketLabel(aging.bucket)} · {aging.daysPastDue}d past due
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              For{" "}
              <Link href={`/t/${slug}/customers/${invoice.customer.id}`} className="underline">
                {invoice.customer.name}
              </Link>
              {invoice.order && (
                <>
                  {" · order "}
                  <Link href={`/t/${slug}/orders/${invoice.order.id}`} className="underline">
                    {invoice.order.number}
                  </Link>
                </>
              )}
              {invoice.dueDate && <>{" · due "}{formatDate(invoice.dueDate)}</>}
              {" · "}
              {termsLabel(invoice.terms)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage &&
              transitions.slice(0, 2).map((to) => {
                const action = changeInvoiceStatus.bind(null, slug, invoice.id);
                const isVoid = to === "VOID";
                return (
                  <form key={to} action={action}>
                    <input type="hidden" name="status" value={to} />
                    <Button
                      type="submit"
                      variant={isVoid ? "danger" : to === "SENT" ? "primary" : "secondary"}
                    >
                      {TRANSITION_LABELS[to] ?? statusLabel(to)}
                    </Button>
                  </form>
                );
              })}
            {canSendReminder && customerHasEmail && (
              <form action={sendInvoiceReminder.bind(null, slug, invoice.id)}>
                <Button type="submit" variant="secondary">Send reminder</Button>
              </form>
            )}
            <Link
              href={`/t/${slug}/invoices/${invoice.id}`}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              Open full view ↗
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <InvoicePanelTabs active={tab} />
        </div>
      </div>

      {/* TAB BODY */}
      <div className="flex-1 space-y-5 px-6 py-5">
        {tab === "overview" && (
          <OverviewTab
            slug={slug}
            currency={currency}
            invoice={invoice}
            isOverdue={isOverdue}
            aging={aging}
            balance={balance}
          />
        )}
        {tab === "payments" && (
          <PaymentsTab
            slug={slug}
            currency={currency}
            invoice={invoice}
            balance={balance}
            canRecord={canRecord}
            memberMap={memberMap}
          />
        )}
        {tab === "activity" && (
          <ActivityTab activity={activity} memberMap={memberMap} />
        )}
      </div>

      {/* STICKY MONEY FOOTER */}
      <div
        className="sticky bottom-0 z-10 grid gap-3 px-6 py-3 md:grid-cols-[1fr_1fr_1fr_2fr] md:items-center"
        style={{
          background: "var(--surface-0)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <Stat label="Total" value={formatMoney(invoice.total as never, currency)} />
        <Stat label="Paid" value={formatMoney(invoice.amountPaid as never, currency)} />
        <Stat
          label="Balance"
          value={formatMoney(balance, currency)}
          valueColor={balance > 0.005 ? "var(--danger-fg)" : undefined}
        />
        {nextAction && (
          <div className="text-xs md:text-right" style={{ color: "var(--text-muted)" }}>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              Next ·{" "}
            </span>
            <span style={{ color: "var(--text-default)" }}>{nextAction}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-base font-semibold tabular-nums"
        style={{ color: valueColor ?? "var(--text-default)" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ---------- Overview tab ---------- */

function OverviewTab({
  slug,
  currency,
  invoice,
  isOverdue,
  aging,
  balance,
}: {
  slug: string;
  currency: string;
  invoice: InvoicePanelInvoice;
  isOverdue: boolean;
  aging: ReturnType<typeof agingFor>;
  balance: number;
}) {
  return (
    <>
      {/* Overdue banner */}
      {isOverdue && balance > 0.005 && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-medium">
            {formatMoney(balance, currency)} overdue by {aging.daysPastDue}{" "}
            {aging.daysPastDue === 1 ? "day" : "days"}.
          </div>
          <div className="mt-1 text-xs opacity-90">
            {invoice.customer.email
              ? "Use the Send reminder action above to nudge the customer."
              : "No customer email on file — add one to enable reminders."}
          </div>
        </div>
      )}

      {/* Void / written-off banners */}
      {invoice.status === "VOID" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            Voided
          </div>
          {invoice.voidedAt && (
            <div className="mt-1 text-xs">on {formatDate(invoice.voidedAt)}</div>
          )}
        </div>
      )}
      {invoice.status === "WRITTEN_OFF" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            Written off
          </div>
          <div className="mt-1 text-xs">
            See the{" "}
            <Link href={`/t/${slug}/invoices/${invoice.id}`} className="underline">
              full view
            </Link>{" "}
            for the write-off reason and history.
          </div>
        </div>
      )}

      {/* Line items */}
      <Card>
        <CardHeader
          title="Line items"
          description={`${invoice.items.length} item${invoice.items.length === 1 ? "" : "s"}`}
        />
        <ul>
          {invoice.items.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No line items.
            </li>
          )}
          {invoice.items.map((it) => (
            <li
              key={it.id}
              className="flex items-start justify-between gap-4 px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                  {it.name}
                </div>
                {it.description && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {it.description.length > 160 ? it.description.slice(0, 160) + "…" : it.description}
                  </div>
                )}
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Qty {Number(it.quantity)} · {formatMoney(it.unitPrice as never, currency)} ea
                </div>
              </div>
              <div
                className="shrink-0 text-right text-sm font-medium tabular-nums"
                style={{ color: "var(--text-default)" }}
              >
                {formatMoney(it.subtotal as never, currency)}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Customer + notes grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Customer" />
          <div className="space-y-1 px-5 py-4 text-sm">
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              <Link href={`/t/${slug}/customers/${invoice.customer.id}`} className="underline">
                {invoice.customer.name}
              </Link>
            </div>
            {invoice.customer.email && (
              <div style={{ color: "var(--text-muted)" }}>{invoice.customer.email}</div>
            )}
            {invoice.customer.phone && (
              <div style={{ color: "var(--text-muted)" }}>{invoice.customer.phone}</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Internal notes" />
          <div
            className="whitespace-pre-wrap px-5 py-4 text-sm"
            style={{ color: invoice.internalNotes ? "var(--text-default)" : "var(--text-muted)" }}
          >
            {invoice.internalNotes ?? "No internal notes."}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------- Payments tab ---------- */

function PaymentsTab({
  slug,
  currency,
  invoice,
  balance,
  canRecord,
  memberMap,
}: {
  slug: string;
  currency: string;
  invoice: InvoicePanelInvoice;
  balance: number;
  canRecord: boolean;
  memberMap: Map<string, { name: string }>;
}) {
  const activePayments = invoice.payments.filter((p) => !p.voidedAt && !p.failedAt);
  const canRecordNow =
    canRecord &&
    balance > 0.005 &&
    invoice.status !== "DRAFT" &&
    invoice.status !== "VOID" &&
    invoice.status !== "WRITTEN_OFF";

  return (
    <>
      {canRecordNow && (
        <Card>
          <CardHeader
            title="Record payment"
            description={`${formatMoney(balance, currency)} outstanding`}
          />
          <form
            action={recordPayment.bind(null, slug, invoice.id)}
            className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={balance.toFixed(2)}
              placeholder="Amount"
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
              required
            />
            <select
              name="method"
              defaultValue="CARD"
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              {RECORDABLE_PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <input
              name="reference"
              placeholder="Reference (check #, last 4…)"
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            />
            <Button type="submit" variant="primary">Record</Button>
          </form>
          <div
            className="px-5 pb-4 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            Refunds, credit memos, and write-offs live in the{" "}
            <Link href={`/t/${slug}/invoices/${invoice.id}`} className="underline">
              full view
            </Link>
            .
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Payment history"
          description={
            activePayments.length > 0
              ? `${activePayments.length} active · ${invoice.payments.length - activePayments.length} voided/failed`
              : "No payments recorded."
          }
        />
        <ul>
          {invoice.payments.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No payments recorded yet.
            </li>
          )}
          {invoice.payments.map((p) => {
            const inactive = !!p.voidedAt || !!p.failedAt;
            return (
              <li
                key={p.id}
                className="flex items-start justify-between gap-3 px-5 py-3"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  opacity: inactive ? 0.6 : 1,
                }}
              >
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-medium tabular-nums"
                      style={{
                        color: "var(--text-default)",
                        textDecoration: inactive ? "line-through" : undefined,
                      }}
                    >
                      {formatMoney(p.amount as never, currency)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {paymentMethodLabel(p.method)}
                    </span>
                    {p.voidedAt && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                      >
                        voided
                      </span>
                    )}
                    {p.failedAt && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--danger-fg)", color: "white" }}
                      >
                        failed
                      </span>
                    )}
                  </div>
                  {p.reference && (
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      ref {p.reference}
                    </div>
                  )}
                  {p.note && (
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {p.note}
                    </div>
                  )}
                  {(p.voidReason || p.failureReason) && (
                    <div className="mt-0.5 text-xs" style={{ color: "var(--danger-fg)" }}>
                      {p.voidReason ?? p.failureReason}
                    </div>
                  )}
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDateTime(p.receivedAt)}
                    {memberMap.get(p.recordedBy) && <> · {memberMap.get(p.recordedBy)!.name}</>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/* ---------- Activity tab ---------- */

function ActivityTab({
  activity,
  memberMap,
}: {
  activity: InvoicePanelActivity[];
  memberMap: Map<string, { name: string }>;
}) {
  return (
    <Card>
      <CardHeader
        title="Activity"
        description={`${activity.length} recent event${activity.length === 1 ? "" : "s"}`}
      />
      <ul>
        {activity.length === 0 && (
          <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No activity recorded.
          </li>
        )}
        {activity.map((a) => {
          const who = a.userId ? memberMap.get(a.userId)?.name ?? "Unknown" : "System";
          return (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 px-5 py-2.5 text-xs"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex-1">
                <span className="font-medium" style={{ color: "var(--text-default)" }}>
                  {humanize(a.action)}
                </span>
                <span style={{ color: "var(--text-muted)" }}> · {who}</span>
              </div>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                {formatDateTime(a.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Loader ---------- */

export async function loadInvoiceForPanel(tenantId: string, invoiceId: string) {
  const [invoice, activity] = await Promise.all([
    db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        order:    { select: { id: true, number: true, status: true } },
        items:    { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { receivedAt: "desc" } },
      },
    }),
    db.auditLog.findMany({
      where: { tenantId, entityType: "Invoice", entityId: invoiceId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, userId: true, createdAt: true, metadata: true },
    }),
  ]);
  return { invoice, activity };
}
