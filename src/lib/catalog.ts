// Phase 8 — catalog taxonomy + formula metadata.
//
// Central place for the human-facing labels, ordering, and hints for the
// ProductKind and PriceFormula enums. Kept out of pricing.ts because that
// file is pure math; this one is copy + presentation choices.

import type { ProductKind, PriceFormula } from "@prisma/client";

export type ProductKindMeta = {
  value: ProductKind;
  label: string;
  /** Short helper line under the picker. Explains when to use it. */
  hint: string;
  /** Coarse grouping used by the list filter + form kind picker. */
  group: "goods" | "service" | "fee";
};

// Order matters — this is the order shown in the form's kind picker and in
// list-page filters. Goods first (most common), then services, then fees.
export const PRODUCT_KINDS: ProductKindMeta[] = [
  { value: "STANDARD",        label: "Standard",         hint: "Generic physical product or fallback.",        group: "goods" },
  { value: "PRINT",           label: "Print",            hint: "Printed items (banners, cards, decals).",     group: "goods" },
  { value: "SIGN",            label: "Sign",             hint: "Fabricated signs, channel letters, monuments.", group: "goods" },
  { value: "INSTALL_SERVICE", label: "Install service",  hint: "On-site installation labor line.",             group: "service" },
  { value: "DESIGN_SERVICE",  label: "Design service",   hint: "Artwork / design labor line.",                 group: "service" },
  { value: "LABOR",           label: "Labor",            hint: "General shop labor (cutting, prep, finishing).", group: "service" },
  { value: "SETUP_FEE",       label: "Setup fee",        hint: "One-time setup (prepress, tooling, plates).",  group: "fee" },
  { value: "RUSH_FEE",        label: "Rush fee",         hint: "Expedite surcharge.",                          group: "fee" },
  { value: "DELIVERY_FEE",    label: "Delivery fee",     hint: "Delivery or shipping charge.",                 group: "fee" },
  { value: "CUSTOM",          label: "Custom",           hint: "One-off custom-quoted item.",                  group: "goods" },
];

export function kindMeta(kind: ProductKind | null | undefined): ProductKindMeta {
  if (!kind) return PRODUCT_KINDS[0];
  return PRODUCT_KINDS.find((k) => k.value === kind) ?? PRODUCT_KINDS[0];
}

export function kindLabel(kind: ProductKind | null | undefined): string {
  return kindMeta(kind).label;
}

export type PriceFormulaMeta = {
  value: PriceFormula;
  label: string;
  hint: string;
};

export const PRICE_FORMULAS: PriceFormulaMeta[] = [
  {
    value: "MANUAL",
    label: "Manual base price",
    hint: "You enter the price directly. Good when the shop already knows what this item should sell for.",
  },
  {
    value: "COST_PLUS_PCT",
    label: "Cost + markup %",
    hint: "Price = cost × (1 + markup%). Keeps a consistent margin across every product priced this way.",
  },
  {
    value: "COST_PLUS_FIXED",
    label: "Cost + fixed $",
    hint: "Price = cost + flat uplift. Good for low-margin parts where a flat dollar works better than a %.",
  },
];

export function formulaMeta(f: PriceFormula | null | undefined): PriceFormulaMeta {
  if (!f) return PRICE_FORMULAS[0];
  return PRICE_FORMULAS.find((m) => m.value === f) ?? PRICE_FORMULAS[0];
}

// Apply a formula for live-preview in forms. Mirrors the server-side helper
// in src/app/actions/products.ts — duplicated intentionally because that
// file is "use server" and importing it into a client component would drag
// the whole action graph along.
export function previewPriceFromFormula(opts: {
  formula: PriceFormula;
  typedBasePrice: number | null;
  cost: number | null;
  markupPct: number | null;
  markupFixed: number | null;
}): number {
  const { formula, typedBasePrice, cost, markupPct, markupFixed } = opts;
  const round2 = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  switch (formula) {
    case "COST_PLUS_PCT":
      if (cost == null || markupPct == null) return typedBasePrice ?? 0;
      return round2(cost * (1 + markupPct / 100));
    case "COST_PLUS_FIXED":
      if (cost == null || markupFixed == null) return typedBasePrice ?? 0;
      return round2(cost + markupFixed);
    case "MANUAL":
    default:
      return round2(typedBasePrice ?? 0);
  }
}
