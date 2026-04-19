import type { DiscountType, InvoiceItem, InvoiceStatus, PaymentMethod, PaymentTerms } from "@prisma/client";

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: "DRAFT",       label: "Draft",       color: "#6b7280" },
  { value: "SENT",        label: "Sent",        color: "#3b82f6" },
  { value: "PARTIAL",     label: "Partial",     color: "#f59e0b" },
  { value: "PAID",        label: "Paid",        color: "#10b981" },
  { value: "OVERDUE",     label: "Overdue",     color: "#ef4444" },
  { value: "VOID",        label: "Void",        color: "#9ca3af" },
  { value: "WRITTEN_OFF", label: "Written off", color: "#7c3aed" },
];

export function statusLabel(s: InvoiceStatus): string {
  return INVOICE_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function statusColor(s: InvoiceStatus): string {
  return INVOICE_STATUSES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// Statuses that are still "open" — counted on dashboard / AR.
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["SENT", "PARTIAL", "OVERDUE"];

// Terms → number of days from issuedAt until dueDate.
export const TERMS_DAYS: Record<PaymentTerms, number> = {
  DUE_ON_RECEIPT: 0,
  NET_15: 15,
  NET_30: 30,
  NET_45: 45,
  NET_60: 60,
};

export function termsLabel(t: PaymentTerms): string {
  switch (t) {
    case "DUE_ON_RECEIPT": return "Due on receipt";
    case "NET_15": return "Net 15";
    case "NET_30": return "Net 30";
    case "NET_45": return "Net 45";
    case "NET_60": return "Net 60";
  }
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH",        label: "Cash" },
  { value: "CHECK",       label: "Check" },
  { value: "CARD",        label: "Card" },
  { value: "ACH",         label: "ACH / Bank transfer" },
  { value: "CREDIT_MEMO", label: "Credit memo" },
  { value: "OTHER",       label: "Other" },
];

// Methods a human can pick when *recording* a payment. CREDIT_MEMO is
// excluded here because applying a credit memo goes through its own
// flow (applyCreditToInvoice) — we don't want someone typing a manual
// credit-memo payment.
export const RECORDABLE_PAYMENT_METHODS: { value: PaymentMethod; label: string }[] =
  PAYMENT_METHODS.filter((m) => m.value !== "CREDIT_MEMO");

export function paymentMethodLabel(m: PaymentMethod): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m;
}

// Quantity × unitPrice — invoice lines are deliberately simpler than quote lines.
export function computeInvoiceItemSubtotal(item: Pick<InvoiceItem, "quantity" | "unitPrice">): number {
  const qty = Number(item.quantity);
  const price = Number(item.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return round2(qty * price);
}

export type InvoiceTotals = {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
};

export function computeInvoiceTotals(
  items: Pick<InvoiceItem, "subtotal" | "taxable">[],
  opts: {
    discountType: DiscountType;
    discountValue: number;
    taxRate: number;
  },
): InvoiceTotals {
  const subtotal = items.reduce((sum, it) => sum + Number(it.subtotal), 0);

  let discountAmount = 0;
  if (opts.discountType === "FIXED") {
    discountAmount = Math.min(Math.max(0, opts.discountValue), subtotal);
  } else if (opts.discountType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, opts.discountValue));
    discountAmount = subtotal * (pct / 100);
  }

  const taxableSubtotal = items
    .filter((it) => it.taxable)
    .reduce((sum, it) => sum + Number(it.subtotal), 0);

  const taxableBase = subtotal > 0
    ? Math.max(0, taxableSubtotal - discountAmount * (taxableSubtotal / subtotal))
    : 0;

  const taxAmount = taxableBase * Math.max(0, opts.taxRate);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxableBase: round2(taxableBase),
    taxAmount: round2(taxAmount),
    total: round2(total),
  };
}

// Given current total & amountPaid and (optionally) whether it's been sent,
// return the status the invoice *should* carry. Voided / written-off
// invoices stay as-is (explicit terminal states). Drafts stay drafts until
// explicitly sent.
export function deriveInvoiceStatus(args: {
  current: InvoiceStatus;
  total: number;
  amountPaid: number;
  dueDate: Date | null;
  now?: Date;
}): InvoiceStatus {
  if (
    args.current === "VOID" ||
    args.current === "DRAFT" ||
    args.current === "WRITTEN_OFF"
  ) {
    return args.current;
  }
  const now = args.now ?? new Date();

  if (args.amountPaid >= args.total && args.total > 0) return "PAID";
  if (args.amountPaid > 0) return "PARTIAL";
  if (args.dueDate && args.dueDate < now) return "OVERDUE";
  return "SENT";
}

// ────────────────────────────────────────────────────────────
// Phase 14 — outstanding balance, aging, and friends.
//
// The canonical "what does the customer still owe on this invoice"
// number considers refunds and write-offs. Refunds *increase* the
// balance back to what the customer owes (money left the shop), while
// write-offs *decrease* the balance to zero because we've given up.
// Credits applied to an invoice are already baked into amountPaid via
// CREDIT_MEMO payments, so they don't need separate handling here.
// ────────────────────────────────────────────────────────────

export type InvoiceBalanceInput = {
  total: number | { toString(): string };
  amountPaid: number | { toString(): string };
  refundedAmount?: number | { toString(): string } | null;
  writtenOffAmount?: number | { toString(): string } | null;
};

// outstanding = total - amountPaid + refunded - writtenOff
// Clamped to [0, total] so rounding noise never flips the sign.
export function outstandingBalance(i: InvoiceBalanceInput): number {
  const total = Number(i.total);
  const paid  = Number(i.amountPaid);
  const refd  = Number(i.refundedAmount ?? 0);
  const woff  = Number(i.writtenOffAmount ?? 0);
  const raw   = total - paid + refd - woff;
  if (!Number.isFinite(raw)) return 0;
  return round2(Math.max(0, Math.min(total, raw)));
}

// Aging buckets used everywhere AR is summarized — list page, financial
// reports, overdue escalation emails. Days-past-due is measured against
// `now`; an invoice not yet due reports `bucket: "CURRENT"`, days = 0.
export type AgingBucket = "CURRENT" | "D_1_30" | "D_31_60" | "D_61_90" | "D_90_PLUS";

export const AGING_BUCKETS: { value: AgingBucket; label: string; color: string }[] = [
  { value: "CURRENT",   label: "Current",     color: "#10b981" },
  { value: "D_1_30",    label: "1–30 days",   color: "#f59e0b" },
  { value: "D_31_60",   label: "31–60 days",  color: "#ef4444" },
  { value: "D_61_90",   label: "61–90 days",  color: "#b91c1c" },
  { value: "D_90_PLUS", label: "90+ days",    color: "#7f1d1d" },
];

export function agingBucketLabel(b: AgingBucket): string {
  return AGING_BUCKETS.find((x) => x.value === b)?.label ?? b;
}
export function agingBucketColor(b: AgingBucket): string {
  return AGING_BUCKETS.find((x) => x.value === b)?.color ?? "#6b7280";
}

export type AgingSnapshot = {
  daysPastDue: number;
  bucket: AgingBucket;
};

// Compute how many days an invoice is past due and which bucket it
// falls into. Invoices with no dueDate (e.g. DRAFTs) or that aren't in
// an open status return CURRENT / 0. The caller decides whether to
// render the bucket at all based on status.
export function agingFor(args: {
  status: InvoiceStatus;
  dueDate: Date | null;
  now?: Date;
}): AgingSnapshot {
  if (!args.dueDate || !OPEN_INVOICE_STATUSES.includes(args.status)) {
    return { daysPastDue: 0, bucket: "CURRENT" };
  }
  const now = args.now ?? new Date();
  const msPerDay = 86_400_000;
  const diff = Math.floor((now.getTime() - args.dueDate.getTime()) / msPerDay);
  const days = Math.max(0, diff);
  let bucket: AgingBucket = "CURRENT";
  if (days > 90) bucket = "D_90_PLUS";
  else if (days > 60) bucket = "D_61_90";
  else if (days > 30) bucket = "D_31_60";
  else if (days > 0)  bucket = "D_1_30";
  return { daysPastDue: days, bucket };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
