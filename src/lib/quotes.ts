import type { DepositType, DiscountType, QuoteItem, QuoteStatus } from "@prisma/client";
import { computeLineSubtotal, pickTierPrice, type QuantityTier } from "@/lib/pricing";

export const QUOTE_STATUSES: { value: QuoteStatus; label: string; color: string }[] = [
  { value: "DRAFT",    label: "Draft",    color: "#6b7280" },
  { value: "SENT",     label: "Sent",     color: "#3b82f6" },
  { value: "VIEWED",   label: "Viewed",   color: "#8b5cf6" },
  { value: "APPROVED", label: "Approved", color: "#10b981" },
  { value: "DECLINED", label: "Declined", color: "#ef4444" },
  { value: "EXPIRED",  label: "Expired",  color: "#9ca3af" },
];

export function statusLabel(s: QuoteStatus): string {
  return QUOTE_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function statusColor(s: QuoteStatus): string {
  return QUOTE_STATUSES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// Statuses where the quote is "open" — counts toward pipeline.
export const OPEN_QUOTE_STATUSES: QuoteStatus[] = ["DRAFT", "SENT", "VIEWED"];

export type SelectedOption = { groupName: string; label: string; adjustment: number };

export function parseSelectedOptions(raw: unknown): SelectedOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (typeof o !== "object" || o == null) return null;
      const r = o as Record<string, unknown>;
      const groupName = typeof r.groupName === "string" ? r.groupName : "";
      const label = typeof r.label === "string" ? r.label : "";
      const adjustment = Number(r.adjustment);
      if (!label) return null;
      return {
        groupName,
        label,
        adjustment: Number.isFinite(adjustment) ? adjustment : 0,
      };
    })
    .filter((o): o is SelectedOption => o != null);
}

// Phase 13 — parse the tier snapshot stored on a QuoteItem. Mirror of
// parseSelectedOptions — defensive because the JSON column can be any shape
// (old rows, bad migrations, manual edits).
export function parseQuantityTiers(raw: unknown): QuantityTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (typeof o !== "object" || o == null) return null;
      const r = o as Record<string, unknown>;
      const minQuantity  = Number(r.minQuantity);
      const pricePerUnit = Number(r.pricePerUnit);
      if (!Number.isFinite(minQuantity) || !Number.isFinite(pricePerUnit)) return null;
      return { minQuantity, pricePerUnit };
    })
    .filter((t): t is QuantityTier => t != null);
}

export function computeItemSubtotal(item: Pick<
  QuoteItem,
  "pricingModel" | "basePrice" | "quantity" | "width" | "height" | "length" | "hours" | "manualPrice" | "selectedOptions" | "quantityTiers" | "wasteFactorPct"
>): number {
  const opts  = parseSelectedOptions(item.selectedOptions as unknown);
  const tiers = parseQuantityTiers(item.quantityTiers as unknown);
  const qty   = item.quantity != null ? Number(item.quantity) : undefined;

  // Phase 13 — tier pricing. If a tier applies to the current quantity,
  // it replaces the stored basePrice. Otherwise we keep the existing price.
  // Only applies to quantity-based models — FIXED / LABOR_HOURLY / CUSTOM
  // use their own logic where tiers don't make sense.
  const tierApplies =
    item.pricingModel === "PER_UNIT" ||
    item.pricingModel === "PER_SQFT" ||
    item.pricingModel === "PER_LINEAR_FT";
  const tierPrice = tierApplies && qty != null
    ? pickTierPrice(tiers, qty)
    : null;
  const effectiveBase = tierPrice ?? Number(item.basePrice);

  return computeLineSubtotal({
    pricingModel: item.pricingModel,
    basePrice: effectiveBase,
    quantity: qty,
    width: item.width != null ? Number(item.width) : undefined,
    height: item.height != null ? Number(item.height) : undefined,
    length: item.length != null ? Number(item.length) : undefined,
    hours: item.hours != null ? Number(item.hours) : undefined,
    manualPrice: item.manualPrice != null ? Number(item.manualPrice) : undefined,
    optionAdjustments: opts.map((o) => o.adjustment),
    wasteFactorPct: item.wasteFactorPct != null ? Number(item.wasteFactorPct) : 0,
  });
}

export type QuoteTotals = {
  subtotal: number;
  discountAmount: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
  // Phase 9 — sum of optional items (rollup; not added into total).
  optionalSubtotal: number;
  // Phase 9 — deposit required up-front. 0 when NONE, clamped to total.
  depositAmount: number;
};

// Phase 9 — optional items are customer-selectable upsells. They don't count
// toward the committed subtotal/tax/total; we surface them separately so the
// customer sees "base quote $X · optional add-ons $Y". If the customer
// accepts an optional line, it's flipped to non-optional (done in the
// approval flow) and the totals recompute.
export function computeQuoteTotals(
  items: Pick<QuoteItem, "subtotal" | "taxable" | "isOptional">[],
  opts: {
    discountType: DiscountType;
    discountValue: number; // flat $ or percent 0-100
    taxRate: number;       // 0.0875 etc
    depositType?: DepositType;
    depositValue?: number;
  },
): QuoteTotals {
  const required = items.filter((it) => !it.isOptional);
  const optional = items.filter((it) => it.isOptional);

  const subtotal = required.reduce((sum, it) => sum + Number(it.subtotal), 0);
  const optionalSubtotal = optional.reduce((sum, it) => sum + Number(it.subtotal), 0);

  let discountAmount = 0;
  if (opts.discountType === "FIXED") {
    discountAmount = Math.min(Math.max(0, opts.discountValue), subtotal);
  } else if (opts.discountType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, opts.discountValue));
    discountAmount = subtotal * (pct / 100);
  }

  // Discount proportionally reduces taxable items' share of subtotal.
  const taxableSubtotal = required
    .filter((it) => it.taxable)
    .reduce((sum, it) => sum + Number(it.subtotal), 0);

  const taxableBase = subtotal > 0
    ? Math.max(0, taxableSubtotal - discountAmount * (taxableSubtotal / subtotal))
    : 0;

  const taxAmount = taxableBase * Math.max(0, opts.taxRate);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  // Deposit. PERCENT is clamped to 0..100; FIXED is clamped to the total.
  let depositAmount = 0;
  const depositType = opts.depositType ?? "NONE";
  const depositValue = opts.depositValue ?? 0;
  if (depositType === "FIXED") {
    depositAmount = Math.min(Math.max(0, depositValue), total);
  } else if (depositType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, depositValue));
    depositAmount = total * (pct / 100);
  }

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxableBase: round2(taxableBase),
    taxAmount: round2(taxAmount),
    total: round2(total),
    optionalSubtotal: round2(optionalSubtotal),
    depositAmount: round2(depositAmount),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
