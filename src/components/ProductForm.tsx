"use client";

import * as React from "react";
import { Field, SelectField, TextArea, Checkbox, Button } from "@/components/Field";
import { PRICING_MODELS, computeLineSubtotal, computeLineCost, marginPercent } from "@/lib/pricing";
import {
  PRODUCT_KINDS,
  PRICE_FORMULAS,
  previewPriceFromFormula,
} from "@/lib/catalog";
import type { PricingModel, ProductKind, PriceFormula } from "@prisma/client";

// Plain shape of the product's persisted fields — Decimal columns arrive
// pre-stringified so the server→client boundary in Next.js 15 stays happy
// (Decimal is a class instance and can't be serialized by the RSC payload).
// Page-level callers should `.toString()` any Decimal before passing it.
export type ProductFormInitial = {
  name?: string | null;
  description?: string | null;
  sku?: string | null;
  category?: string | null;
  pricingModel?: PricingModel | null;
  basePrice?: string | number | null;
  cost?: string | number | null;
  wasteFactorPct?: string | number | null;
  unit?: string | null;
  imageUrl?: string | null;
  taxable?: boolean | null;
  active?: boolean | null;
  shared?: boolean | null;
  kind?: ProductKind | null;
  priceFormula?: PriceFormula | null;
  markupPct?: string | number | null;
  markupFixed?: string | number | null;
  productionNotes?: string | null;
  specSheet?: string | null;
  internalSku?: string | null;
};

// Phase 8 — product form.
//
// Reworked from a flat list into grouped sections so the catalog scales past
// "name, price, done". Four concerns get their own fieldset:
//
//   1. Classification  — what is this? (kind)
//   2. Customer-facing — what the buyer sees (name, description, pricing)
//   3. Internal        — what the shop floor needs (production notes, specs)
//   4. Assets          — image, SKU dupes, franchise sharing
//
// Formula fields and the live preview calculator are client-driven; everything
// else posts plain form data and lets the server action do the rest.

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  initial?: ProductFormInitial | null;
  submitLabel?: string;
  error?: string;
  isGroupRoot?: boolean;
};

export function ProductForm({
  action,
  initial,
  submitLabel = "Save",
  error,
  isGroupRoot = false,
}: Props) {
  const i = initial ?? {};

  // Controlled state for fields that drive the formula panel and the live
  // preview calculator. Everything else stays uncontrolled so the form is
  // still cheap on keystroke.
  const [kind, setKind] = React.useState<ProductKind>(i.kind ?? "STANDARD");
  const [priceFormula, setPriceFormula] = React.useState<PriceFormula>(
    i.priceFormula ?? "MANUAL",
  );
  const [pricingModel, setPricingModel] = React.useState<PricingModel>(
    i.pricingModel ?? "FIXED",
  );

  const [basePriceStr, setBasePriceStr] = React.useState<string>(
    i.basePrice?.toString() ?? "",
  );
  const [costStr, setCostStr] = React.useState<string>(i.cost?.toString() ?? "");
  const [markupPctStr, setMarkupPctStr] = React.useState<string>(
    i.markupPct?.toString() ?? "",
  );
  const [markupFixedStr, setMarkupFixedStr] = React.useState<string>(
    i.markupFixed?.toString() ?? "",
  );
  const [wasteStr, setWasteStr] = React.useState<string>(
    i.wasteFactorPct?.toString() ?? "0",
  );

  // Preview inputs — not saved, just drive the live calculator at the bottom.
  const [previewQty, setPreviewQty] = React.useState<string>("10");
  const [previewW, setPreviewW] = React.useState<string>("2");
  const [previewH, setPreviewH] = React.useState<string>("4");
  const [previewLen, setPreviewLen] = React.useState<string>("10");
  const [previewHours, setPreviewHours] = React.useState<string>("1");

  const parseN = (s: string): number | null => {
    if (!s || s.length === 0) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const typedBasePrice = parseN(basePriceStr);
  const cost = parseN(costStr);
  const markupPct = parseN(markupPctStr);
  const markupFixed = parseN(markupFixedStr);
  const waste = parseN(wasteStr) ?? 0;

  const effectiveBasePrice = previewPriceFromFormula({
    formula: priceFormula,
    typedBasePrice,
    cost,
    markupPct,
    markupFixed,
  });

  // Live preview — compute a sample subtotal + margin using whatever inputs
  // the pricing model cares about. For CUSTOM_QUOTE we skip the preview
  // because the price is rep-entered at quote time.
  const showPreview = pricingModel !== "CUSTOM_QUOTE";
  const previewSubtotal = showPreview
    ? computeLineSubtotal({
        pricingModel,
        basePrice: effectiveBasePrice,
        quantity: parseN(previewQty) ?? 1,
        width: parseN(previewW) ?? 0,
        height: parseN(previewH) ?? 0,
        length: parseN(previewLen) ?? 0,
        hours: parseN(previewHours) ?? 0,
        wasteFactorPct: waste,
      })
    : 0;
  const previewCost = showPreview
    ? computeLineCost({
        pricingModel,
        costPerUnit: cost,
        quantity: parseN(previewQty) ?? 1,
        width: parseN(previewW) ?? 0,
        height: parseN(previewH) ?? 0,
        length: parseN(previewLen) ?? 0,
        hours: parseN(previewHours) ?? 0,
        wasteFactorPct: waste,
      })
    : null;
  const previewMargin =
    previewCost != null ? marginPercent(previewSubtotal, previewCost) : null;

  const dimensionBased =
    pricingModel === "PER_SQFT" || pricingModel === "PER_LINEAR_FT";
  const manualBasePriceDisabled = priceFormula !== "MANUAL";

  return (
    <form action={action} className="space-y-6">
      {error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {error}
        </div>
      )}

      {/* ───────── Classification ───────── */}
      <fieldset
        className="rounded-md px-4 py-4"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <legend className="px-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Classification
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProductKind)}
            options={PRODUCT_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          />
          <div className="block">
            <span className="mb-1 block text-sm" style={{ color: "var(--text-default)" }}>
              What this controls
            </span>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {PRODUCT_KINDS.find((k) => k.value === kind)?.hint}
              {" "}
              Kind is used by the catalog filters and by the quote builder to
              suggest the right item in the right slot (install services under
              services, rush fees under fees).
            </p>
          </div>
        </div>
      </fieldset>

      {/* ───────── Customer-facing identity ───────── */}
      <fieldset
        className="rounded-md px-4 py-4"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <legend className="px-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Customer-facing
        </legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" name="name" required defaultValue={i.name ?? ""} />
          <Field
            label="SKU"
            name="sku"
            defaultValue={i.sku ?? ""}
            hint="Short code shown on the quote. Optional."
          />
        </div>
        <div className="mt-3">
          <TextArea
            label="Description"
            name="description"
            rows={3}
            defaultValue={i.description ?? ""}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Field
            label="Category"
            name="category"
            defaultValue={i.category ?? ""}
            hint="e.g. Vinyl, Banners, Installation, Labor"
          />
          <Field
            label="Unit label"
            name="unit"
            defaultValue={i.unit ?? ""}
            hint="Displayed in quotes (each, sq ft, hour, …)."
          />
        </div>
      </fieldset>

      {/* ───────── Pricing ───────── */}
      <fieldset
        className="rounded-md px-4 py-4"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <legend className="px-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Pricing
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Pricing model"
            name="pricingModel"
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value as PricingModel)}
            options={PRICING_MODELS.map((m) => ({ value: m.value, label: m.label }))}
          />
          <SelectField
            label="Price formula"
            name="priceFormula"
            value={priceFormula}
            onChange={(e) => setPriceFormula(e.target.value as PriceFormula)}
            options={PRICE_FORMULAS.map((m) => ({ value: m.value, label: m.label }))}
          />
        </div>

        <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {PRICE_FORMULAS.find((m) => m.value === priceFormula)?.hint}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-4">
          <Field
            label={manualBasePriceDisabled ? "Base price (derived)" : "Base price"}
            name="basePrice"
            type="number"
            step="0.01"
            min="0"
            value={manualBasePriceDisabled ? effectiveBasePrice.toString() : basePriceStr}
            onChange={(e) => setBasePriceStr(e.target.value)}
            readOnly={manualBasePriceDisabled}
            hint={
              manualBasePriceDisabled
                ? "Computed from the formula below."
                : "Flat number the shop types in."
            }
          />
          <Field
            label="Cost"
            name="cost"
            type="number"
            step="0.01"
            min="0"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            hint="Unit cost. Drives margin + formula pricing."
          />
          <Field
            label="Waste factor (%)"
            name="wasteFactorPct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={wasteStr}
            onChange={(e) => setWasteStr(e.target.value)}
            hint="Grosses up sq ft / linear ft to cover trim."
          />
        </div>

        {priceFormula === "COST_PLUS_PCT" && (
          <div className="mt-3">
            <Field
              label="Markup %"
              name="markupPct"
              type="number"
              step="0.01"
              min="0"
              max="1000"
              value={markupPctStr}
              onChange={(e) => setMarkupPctStr(e.target.value)}
              hint="E.g. 50 means sell at 1.5× cost. Leave blank to skip the formula."
            />
          </div>
        )}
        {priceFormula === "COST_PLUS_FIXED" && (
          <div className="mt-3">
            <Field
              label="Markup ($)"
              name="markupFixed"
              type="number"
              step="0.01"
              min="0"
              value={markupFixedStr}
              onChange={(e) => setMarkupFixedStr(e.target.value)}
              hint="Flat dollar amount added on top of cost."
            />
          </div>
        )}
        {/* Keep the unused-formula inputs as hidden fields so the server
            can still null them out if the user flips formulas back and forth
            — prevents stale markup values lingering on a MANUAL product. */}
        {priceFormula !== "COST_PLUS_PCT" && (
          <input type="hidden" name="markupPct" value={markupPctStr} />
        )}
        {priceFormula !== "COST_PLUS_FIXED" && (
          <input type="hidden" name="markupFixed" value={markupFixedStr} />
        )}

        {/* ─ Live preview ─ */}
        {showPreview && (
          <div
            className="mt-4 rounded-md px-3 py-3"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                Live preview
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Sample numbers — not saved.
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {pricingModel !== "FIXED" &&
                pricingModel !== "LABOR_HOURLY" && (
                  <Field
                    label="Qty"
                    type="number"
                    step="1"
                    min="0"
                    value={previewQty}
                    onChange={(e) => setPreviewQty(e.target.value)}
                  />
                )}
              {pricingModel === "PER_SQFT" && (
                <>
                  <Field
                    label="Width (ft)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={previewW}
                    onChange={(e) => setPreviewW(e.target.value)}
                  />
                  <Field
                    label="Height (ft)"
                    type="number"
                    step="0.01"
                    min="0"
                    value={previewH}
                    onChange={(e) => setPreviewH(e.target.value)}
                  />
                </>
              )}
              {pricingModel === "PER_LINEAR_FT" && (
                <Field
                  label="Length (ft)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={previewLen}
                  onChange={(e) => setPreviewLen(e.target.value)}
                />
              )}
              {pricingModel === "LABOR_HOURLY" && (
                <Field
                  label="Hours"
                  type="number"
                  step="0.25"
                  min="0"
                  value={previewHours}
                  onChange={(e) => setPreviewHours(e.target.value)}
                />
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div
                className="rounded-md px-3 py-2"
                style={{ background: "var(--surface-2)" }}
              >
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Effective base
                </div>
                <div className="mt-0.5 font-medium" style={{ color: "var(--text-default)" }}>
                  ${effectiveBasePrice.toFixed(2)}
                </div>
              </div>
              <div
                className="rounded-md px-3 py-2"
                style={{ background: "var(--surface-2)" }}
              >
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Sample subtotal
                </div>
                <div className="mt-0.5 font-medium" style={{ color: "var(--text-default)" }}>
                  ${previewSubtotal.toFixed(2)}
                </div>
              </div>
              <div
                className="rounded-md px-3 py-2"
                style={{ background: "var(--surface-2)" }}
              >
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Margin
                </div>
                <div
                  className="mt-0.5 font-medium"
                  style={{
                    color:
                      previewMargin == null
                        ? "var(--text-muted)"
                        : previewMargin >= 40
                          ? "var(--success-fg)"
                          : previewMargin >= 20
                            ? "var(--text-default)"
                            : "var(--danger-fg)",
                  }}
                >
                  {previewMargin == null
                    ? "—"
                    : `${previewMargin.toFixed(1)}%`}
                </div>
              </div>
            </div>

            {dimensionBased && waste > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Waste factor {waste}% grosses up the billable{" "}
                {pricingModel === "PER_SQFT" ? "area" : "length"} before the
                price is applied.
              </p>
            )}
          </div>
        )}

        {/* Full pricing-model legend — keeps the historical behavior, tucked
            under a details disclosure so the form doesn't feel noisy. */}
        <details className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <summary className="cursor-pointer select-none">
            All pricing models explained
          </summary>
          <div className="mt-2 space-y-1">
            {PRICING_MODELS.map((m) => (
              <div key={m.value}>
                <strong style={{ color: "var(--text-default)" }}>{m.label}:</strong>{" "}
                {m.hint}
              </div>
            ))}
          </div>
        </details>
      </fieldset>

      {/* ───────── Internal (shop-floor only) ───────── */}
      <fieldset
        className="rounded-md px-4 py-4"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <legend className="px-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Internal — shop-floor only
        </legend>
        <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Never shown to customers. Lives only in the catalog, order-side
          production views, and internal reports.
        </p>

        <Field
          label="Internal SKU"
          name="internalSku"
          defaultValue={i.internalSku ?? ""}
          hint="Separate from customer-facing SKU — for inventory / purchasing systems."
        />

        <div className="mt-3">
          <TextArea
            label="Production notes"
            name="productionNotes"
            rows={3}
            defaultValue={i.productionNotes ?? ""}
            placeholder="Material stock, print profile, mounting hardware…"
          />
        </div>

        <div className="mt-3">
          <TextArea
            label="Spec sheet"
            name="specSheet"
            rows={6}
            defaultValue={i.specSheet ?? ""}
            placeholder={
              "Longer technical reference. Tolerances, layering, RIP settings, warranty notes — anything production needs before starting."
            }
          />
        </div>
      </fieldset>

      {/* ───────── Assets + flags ───────── */}
      <fieldset
        className="rounded-md px-4 py-4"
        style={{ border: "1px solid var(--border-subtle)" }}
      >
        <legend className="px-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Assets &amp; availability
        </legend>
        <Field
          label="Image URL"
          name="imageUrl"
          type="url"
          defaultValue={i.imageUrl ?? ""}
          hint="Shown on the catalog list and the customer portal."
        />
        <div className="mt-3 flex flex-wrap gap-4">
          <Checkbox label="Taxable" name="taxable" defaultChecked={i.taxable ?? true} />
          <Checkbox
            label="Active (available on quotes)"
            name="active"
            defaultChecked={i.active ?? true}
          />
        </div>
      </fieldset>

      {isGroupRoot && (
        <fieldset
          className="rounded-md px-4 py-4"
          style={{ border: "1px solid var(--border-subtle)" }}
        >
          <legend className="px-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Franchise sharing
          </legend>
          <Checkbox
            label="Share with group (all child tenants see this product on their quotes)"
            name="shared"
            defaultChecked={i.shared ?? false}
          />
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Children see shared products as read-only with a &ldquo;Shared&rdquo; badge.
            Quote line items snapshot pricing at add-time, so unsharing later
            doesn&apos;t reach back into in-flight quotes.
          </p>
        </fieldset>
      )}

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
