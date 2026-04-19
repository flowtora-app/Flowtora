import type { PricingModel } from "@prisma/client";

export type PricingModelMeta = {
  value: PricingModel;
  label: string;
  unitDefault: string;
  // Which numeric inputs the line-item form should ask for, in addition to base price.
  inputs: ("quantity" | "width" | "height" | "length" | "hours")[];
  hint: string;
};

export const PRICING_MODELS: PricingModelMeta[] = [
  {
    value: "FIXED",
    label: "Fixed price",
    unitDefault: "each",
    inputs: [],
    hint: "Flat price regardless of quantity.",
  },
  {
    value: "PER_UNIT",
    label: "Per unit",
    unitDefault: "each",
    inputs: ["quantity"],
    hint: "Price × quantity.",
  },
  {
    value: "PER_SQFT",
    label: "Per square foot",
    unitDefault: "sq ft",
    inputs: ["width", "height", "quantity"],
    hint: "Price × (width ft × height ft) × quantity.",
  },
  {
    value: "PER_LINEAR_FT",
    label: "Per linear foot",
    unitDefault: "ft",
    inputs: ["length", "quantity"],
    hint: "Price × length ft × quantity.",
  },
  {
    value: "LABOR_HOURLY",
    label: "Labor — hourly",
    unitDefault: "hour",
    inputs: ["hours"],
    hint: "Price × hours.",
  },
  {
    value: "CUSTOM_QUOTE",
    label: "Custom quote",
    unitDefault: "",
    inputs: [],
    hint: "Sales rep enters the price manually on each quote.",
  },
];

export function pricingMeta(model: PricingModel): PricingModelMeta {
  return PRICING_MODELS.find((m) => m.value === model) ?? PRICING_MODELS[0];
}

/**
 * Compute a line subtotal (before tax) for a product with the given inputs and chosen options.
 * Used by the quote builder in Phase 5 — kept here so pricing logic lives in one place.
 *
 * Phase 18 Slice F — `wasteFactorPct` (0-100) grosses up the billable area /
 * length for dimension-based models. Zero/undefined is a pass-through, so
 * existing call sites don't need to change their behavior.
 */
export function computeLineSubtotal(opts: {
  pricingModel: PricingModel;
  basePrice: number;
  quantity?: number;
  width?: number;   // feet
  height?: number;  // feet
  length?: number;  // feet
  hours?: number;
  optionAdjustments?: number[]; // sum of selected option price adjustments
  manualPrice?: number;         // for CUSTOM_QUOTE
  wasteFactorPct?: number;      // 0-100; applied to dimension-based models
}): number {
  const optionsTotal = (opts.optionAdjustments ?? []).reduce((a, b) => a + b, 0);
  const qty = Math.max(0, opts.quantity ?? 1);
  const wasteMul = 1 + Math.max(0, opts.wasteFactorPct ?? 0) / 100;

  switch (opts.pricingModel) {
    case "FIXED":
      return opts.basePrice + optionsTotal;
    case "PER_UNIT":
      return (opts.basePrice + optionsTotal) * qty;
    case "PER_SQFT": {
      const area = Math.max(0, (opts.width ?? 0) * (opts.height ?? 0)) * wasteMul;
      return (opts.basePrice * area + optionsTotal) * qty;
    }
    case "PER_LINEAR_FT":
      return (opts.basePrice * Math.max(0, opts.length ?? 0) * wasteMul + optionsTotal) * qty;
    case "LABOR_HOURLY":
      return opts.basePrice * Math.max(0, opts.hours ?? 0) + optionsTotal;
    case "CUSTOM_QUOTE":
      return Math.max(0, opts.manualPrice ?? 0);
    default:
      return 0;
  }
}

export function marginPercent(price: number, cost: number | null | undefined): number | null {
  if (cost == null || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

/**
 * Phase 18 Slice F — compute a line's *extended* cost for margin reporting.
 * Mirrors `computeLineSubtotal` on the cost side: cost-per-unit × the same
 * quantity / area / length / hours the billable subtotal used. Returns null
 * when cost is unknown so callers can skip margin display for that line.
 */
export function computeLineCost(opts: {
  pricingModel: PricingModel;
  costPerUnit: number | null | undefined; // null if not snapshotted
  quantity?: number;
  width?: number;
  height?: number;
  length?: number;
  hours?: number;
  wasteFactorPct?: number;
}): number | null {
  if (opts.costPerUnit == null) return null;
  const qty = Math.max(0, opts.quantity ?? 1);
  const wasteMul = 1 + Math.max(0, opts.wasteFactorPct ?? 0) / 100;
  const c = Number(opts.costPerUnit);
  if (!Number.isFinite(c)) return null;

  switch (opts.pricingModel) {
    case "FIXED":
      return c;
    case "PER_UNIT":
      return c * qty;
    case "PER_SQFT": {
      const area = Math.max(0, (opts.width ?? 0) * (opts.height ?? 0)) * wasteMul;
      return c * area * qty;
    }
    case "PER_LINEAR_FT":
      return c * Math.max(0, opts.length ?? 0) * wasteMul * qty;
    case "LABOR_HOURLY":
      return c * Math.max(0, opts.hours ?? 0);
    case "CUSTOM_QUOTE":
      // No reliable way to extend a flat cost across a manually-priced line.
      return c;
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Phase 13 — quantity break tiers
// ────────────────────────────────────────────────────────────

export type QuantityTier = { minQuantity: number; pricePerUnit: number };

// Given a set of tiers (already snapshotted on the quote line) and the
// quantity on the line, return the tier's pricePerUnit if any tier applies,
// otherwise null (caller falls back to the stored basePrice).
//
// Picking logic: the tier with the LARGEST minQuantity <= quantity wins.
// We sort defensively because stored tiers come from JSON and we don't trust
// any particular order in the DB.
export function pickTierPrice(tiers: QuantityTier[], quantity: number): number | null {
  if (!tiers || tiers.length === 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const eligible = tiers
    .filter((t) => Number.isFinite(t.minQuantity) && Number.isFinite(t.pricePerUnit))
    .filter((t) => quantity >= t.minQuantity)
    .sort((a, b) => b.minQuantity - a.minQuantity); // largest-first

  return eligible.length > 0 ? eligible[0].pricePerUnit : null;
}
