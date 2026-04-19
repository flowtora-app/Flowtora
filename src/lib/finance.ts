import type { ExpensePaymentMethod } from "@prisma/client";

// Phase 14 — finance helpers.
//
// Keep this file pure: no DB access, no server action imports. Pages
// and actions both consume these shapes. The Prisma-coupled query
// helpers live alongside their actions.

// ────────────────────────────────────────────────────────────
// Expenses
// ────────────────────────────────────────────────────────────

export const EXPENSE_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: "CASH",            label: "Cash" },
  { value: "CHECK",           label: "Check" },
  { value: "CARD",            label: "Card" },
  { value: "ACH",             label: "ACH / Bank transfer" },
  { value: "OWNER_REIMBURSE", label: "Owner reimbursement" },
  { value: "OTHER",           label: "Other" },
];

export function expenseMethodLabel(m: ExpensePaymentMethod): string {
  return EXPENSE_METHODS.find((x) => x.value === m)?.label ?? m;
}

// Suggested categories — used as autocomplete hints in the expense
// form. The `category` field on Expense is free-form string, so a
// tenant is never locked into this list. Alphabetized deliberately.
export const SUGGESTED_EXPENSE_CATEGORIES = [
  "Advertising",
  "Contractors",
  "Equipment",
  "Insurance",
  "Materials",
  "Office supplies",
  "Rent",
  "Software",
  "Subcontractor",
  "Tools",
  "Travel",
  "Utilities",
  "Vehicle",
] as const;

// ────────────────────────────────────────────────────────────
// Receipt / evidence URL validation.
//
// Same whitelist as Phase 13 install photos: a hosted https URL, a
// server-relative path, or a small data: URL. Rejecting everything
// else keeps us safe from javascript: / file:// / blob: shenanigans if
// a user pastes the wrong string into the form.
// ────────────────────────────────────────────────────────────

export function isSafeEvidenceUrl(url: string): boolean {
  if (!url) return false;
  return /^(https:\/\/|\/|data:image\/)/.test(url);
}

// Rough size cap for inline data: URLs. We aggressively downscale on
// the client, but a jpeg around 300–500KB is typical for receipts (more
// detail than install photos because people actually read them).
export const MAX_RECEIPT_BYTES = 600_000;

// ────────────────────────────────────────────────────────────
// Margin / job-costing.
//
// Revenue = invoice total (excluding void / written-off portion and
// refunds that went back out). Cost = expenses linked to the order
// (billable expenses are still a cost to the shop regardless of whether
// they get rebilled — rebilling just shows up as higher invoice revenue
// later). Returns margin dollars and margin %; both are null-safe so
// the order detail page can render "—" when there's no data yet.
// ────────────────────────────────────────────────────────────

export type MarginInput = {
  invoiceRevenue: number; // sum of invoice.total for this order, excluding VOID+WRITTEN_OFF
  refundedAmount: number; // sum of invoice.refundedAmount for this order
  expenseCost: number;    // sum of expense.amount for this order
};

export type MarginResult = {
  revenue: number;       // net revenue (gross - refunded)
  cost: number;          // total expense cost
  gross: number;         // revenue - cost
  marginPct: number | null; // null when revenue is 0 (undefined margin)
};

export function computeMargin(m: MarginInput): MarginResult {
  const revenue = round2(Math.max(0, m.invoiceRevenue - m.refundedAmount));
  const cost    = round2(Math.max(0, m.expenseCost));
  const gross   = round2(revenue - cost);
  const marginPct = revenue > 0 ? round2((gross / revenue) * 100) : null;
  return { revenue, cost, gross, marginPct };
}

// Badge color for a margin percentage. Healthy jobs are >35%, squeezed
// ones 15–35%, and anything under 15% reads as a warning. Negative is
// the red flag — the shop lost money on the job.
export function marginColor(pct: number | null): string {
  if (pct === null) return "#6b7280";
  if (pct < 0)   return "#b91c1c";
  if (pct < 15)  return "#ef4444";
  if (pct < 35)  return "#f59e0b";
  return "#10b981";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
