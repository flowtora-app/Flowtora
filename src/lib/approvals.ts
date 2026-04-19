// Phase 13 — workflow / approval rules.
//
// This file is the single source of truth for "is this allowed yet?" checks
// that apply across the order lifecycle. Each function takes the already-loaded
// entities + the tenant's current rule settings, and returns either `null`
// (no block) or a short human-readable reason string. Callers redirect the
// user with that reason; no UI polish lives here.

import { db } from "@/lib/db";

// The subset of Tenant fields the gates care about. Passing just what we need
// keeps callers flexible — they can load from anywhere or pass test fixtures.
export type ApprovalRules = {
  approvalDiscountThresholdPct:   number;
  approvalLargeJobThreshold:      number; // Decimal, coerced to number by caller
  requireProofBeforeProduction:   boolean;
  requireDepositBeforeProduction: boolean;
  requireDepositBeforeInstall:    boolean;
};

// ────────────────────────────────────────────────────────────
// Quote send gate: discount % + large-job total
// ────────────────────────────────────────────────────────────

// Evaluate whether a quote needs manager approval before it can be sent.
// Returns the list of rules that are currently tripped (empty = fine to send).
// We check *both* thresholds so the UI can surface every reason at once
// (avoids the "fix one, hit the other" frustration loop).
export function quoteSendBlockers(
  quote: {
    discountType:  "NONE" | "FIXED" | "PERCENT";
    discountValue: number;  // 0-100 if PERCENT, dollars if FIXED
    subtotal:      number;  // pre-discount
    total:         number;  // post-discount + tax
  },
  rules: Pick<ApprovalRules, "approvalDiscountThresholdPct" | "approvalLargeJobThreshold">,
): string[] {
  const blockers: string[] = [];

  // Compute the effective discount % even if the quote is using FIXED — a $500
  // discount on a $1000 quote is still 50% in practice.
  const effectivePct = (() => {
    if (quote.discountType === "PERCENT") return quote.discountValue;
    if (quote.discountType === "FIXED" && quote.subtotal > 0) {
      return (quote.discountValue / quote.subtotal) * 100;
    }
    return 0;
  })();

  if (
    rules.approvalDiscountThresholdPct > 0 &&
    effectivePct > rules.approvalDiscountThresholdPct
  ) {
    blockers.push(
      `Discount of ${effectivePct.toFixed(1)}% exceeds the ${rules.approvalDiscountThresholdPct}% threshold`,
    );
  }

  if (
    rules.approvalLargeJobThreshold > 0 &&
    quote.total > rules.approvalLargeJobThreshold
  ) {
    blockers.push(
      `Total of $${quote.total.toFixed(2)} exceeds the $${rules.approvalLargeJobThreshold.toFixed(2)} approval threshold`,
    );
  }

  return blockers;
}

// ────────────────────────────────────────────────────────────
// Order → IN_PRODUCTION gate: latest proof must be APPROVED
// ────────────────────────────────────────────────────────────

// Returns null if the transition is allowed, or a reason string if blocked.
// We read the latest proof inline so callers don't have to pre-load it — this
// is only hit on a status change, not on every page render.
export async function orderCanEnterProduction(
  tenantId: string,
  orderId:  string,
  rules:    Pick<ApprovalRules, "requireProofBeforeProduction" | "requireDepositBeforeProduction">,
): Promise<string | null> {
  // Phase 10 — unresolved blockers always trump forward motion. We check
  // this before the proof gate so the user sees the most actionable reason
  // first ("waiting on the customer" beats "proof needs approval" when both
  // are true — fix the blocker and the other gate becomes the next step).
  const activeBlocker = await db.orderBlocker.findFirst({
    where:   { tenantId, orderId, resolvedAt: null },
    select:  { reason: true, notes: true },
    orderBy: { createdAt: "asc" },
  });
  if (activeBlocker) {
    const label = BLOCKER_LABEL[activeBlocker.reason];
    return activeBlocker.notes
      ? `Order is blocked: ${label} — ${activeBlocker.notes}. Resolve the blocker before starting production.`
      : `Order is blocked: ${label}. Resolve the blocker before starting production.`;
  }

  // Phase A Slice 1 — deposit must be collected before the shop starts work.
  // Reuses orderHasDepositPaid so the same math backs both gates (production
  // here, installs below).
  if (rules.requireDepositBeforeProduction) {
    const depositReason = await orderHasDepositPaid(tenantId, orderId);
    if (depositReason) return depositReason;
  }

  if (!rules.requireProofBeforeProduction) return null;

  const latestProof = await db.proof.findFirst({
    where:   { tenantId, orderId },
    orderBy: { version: "desc" },
    select:  { status: true, version: true },
  });

  if (!latestProof) {
    return "This order has no proof yet. Send and get customer approval before starting production.";
  }
  if (latestProof.status !== "APPROVED") {
    return `Proof v${latestProof.version} is ${latestProof.status} — customer must approve before production starts.`;
  }
  return null;
}

// Phase 10 — human-readable labels for blocker reasons. Kept here next to
// the gate that uses them so we get a compile error if the enum changes
// without the UI catching up. Exported so the order detail UI can use the
// same labels as the gate messages.
export const BLOCKER_LABEL: Record<
  "AWAITING_CUSTOMER" | "AWAITING_APPROVAL" | "AWAITING_MATERIALS" |
  "AWAITING_PROOF" | "AWAITING_PAYMENT" | "CUSTOM",
  string
> = {
  AWAITING_CUSTOMER:  "awaiting customer",
  AWAITING_APPROVAL:  "awaiting approval",
  AWAITING_MATERIALS: "awaiting materials",
  AWAITING_PROOF:     "awaiting proof",
  AWAITING_PAYMENT:   "awaiting payment",
  CUSTOM:             "custom",
};

// ────────────────────────────────────────────────────────────
// Deposit check: used by both the production and install gates.
// ────────────────────────────────────────────────────────────

// Returns null if the deposit is satisfied (or not required), or a reason
// string if more is owed. "Deposit paid" = order.paidAmount >= total * pct/100.
// paidAmount is kept in sync by recomputeInvoiceTotals, so this is one row read.
export async function orderHasDepositPaid(
  tenantId: string,
  orderId:  string,
): Promise<string | null> {
  const order = await db.order.findFirst({
    where:  { id: orderId, tenantId },
    select: { depositPercent: true, paidAmount: true, total: true, number: true },
  });
  if (!order) return null; // let the caller's own existence check decide

  // If deposit is 0 the rule implicitly passes — nothing is required.
  if (order.depositPercent <= 0) return null;

  const total   = Number(order.total);
  const paid    = Number(order.paidAmount);
  const needed  = (total * order.depositPercent) / 100;

  if (paid + 0.005 < needed) { // tiny epsilon — floats + dollars
    return `Order ${order.number} still needs a ${order.depositPercent}% deposit ($${needed.toFixed(2)}). Paid so far: $${paid.toFixed(2)}.`;
  }
  return null;
}

// Legacy entry point for the install gate — preserves the rules-shaped API
// used by callers that already thread ApprovalRules into a single check.
export async function orderHasDeposit(
  tenantId: string,
  orderId:  string,
  rules:    Pick<ApprovalRules, "requireDepositBeforeInstall">,
): Promise<string | null> {
  if (!rules.requireDepositBeforeInstall) return null;
  return orderHasDepositPaid(tenantId, orderId);
}

// ────────────────────────────────────────────────────────────
// Tenant lookup convenience
// ────────────────────────────────────────────────────────────

// Load the rule flags off a tenant in one shot. Every gate action uses this so
// the query shape stays identical everywhere — makes it easy to grep for rule
// consumers if we ever add or rename a field.
export async function loadApprovalRules(tenantId: string): Promise<ApprovalRules> {
  const t = await db.tenant.findUnique({
    where:  { id: tenantId },
    select: {
      approvalDiscountThresholdPct:   true,
      approvalLargeJobThreshold:      true,
      requireProofBeforeProduction:   true,
      requireDepositBeforeProduction: true,
      requireDepositBeforeInstall:    true,
    },
  });
  return {
    approvalDiscountThresholdPct:   t?.approvalDiscountThresholdPct ?? 0,
    approvalLargeJobThreshold:      Number(t?.approvalLargeJobThreshold ?? 0),
    requireProofBeforeProduction:   t?.requireProofBeforeProduction   ?? false,
    requireDepositBeforeProduction: t?.requireDepositBeforeProduction ?? false,
    requireDepositBeforeInstall:    t?.requireDepositBeforeInstall    ?? false,
  };
}
