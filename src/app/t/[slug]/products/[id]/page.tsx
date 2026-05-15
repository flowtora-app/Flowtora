import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, Checkbox } from "@/components/Field";
import { formatMoney, humanize } from "@/lib/format";
import { pricingMeta, marginPercent } from "@/lib/pricing";
import { kindMeta, formulaMeta } from "@/lib/catalog";
import {
  toggleProductActive,
  addOptionGroup,
  deleteOptionGroup,
  addOption,
  deleteOption,
  addProductTier,
  deleteProductTier,
} from "@/app/actions/products";
import { isEntitled } from "@/lib/entitlements";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await requirePermission(slug, "products:view");
  const canManage = ctx.can("products:manage");
  // Quantity tiers (volume discounts) are part of advanced pricing.
  // We hide the "Quantity breaks" card entirely on plans without it
  // rather than showing a paywall here — the rest of the product
  // editor is still useful for Essentials shops.
  const hasAdvancedPricing = await isEntitled(ctx.tenant.id, ctx.tenant.plan, "advancedPricing");

  const product = await db.product.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
      quantityTiers: {
        orderBy: [{ minQuantity: "asc" }],
      },
    },
  });
  if (!product) notFound();

  const tierApplies =
    product.pricingModel === "PER_UNIT" ||
    product.pricingModel === "PER_SQFT" ||
    product.pricingModel === "PER_LINEAR_FT";

  const meta = pricingMeta(product.pricingModel);
  const price = Number(product.basePrice);
  const cost = product.cost != null ? Number(product.cost) : null;
  const margin = marginPercent(price, cost);

  const addGroup = addOptionGroup.bind(null, slug);
  const addOpt = addOption.bind(null, slug);
  const addTier = addProductTier.bind(null, slug);
  const toggleActive = toggleProductActive.bind(null, slug, product.id);

  return (
    <div className="space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/products`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Products
        </Link>
      </div>

      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            {/* Product icon tile. */}
            <span
              aria-hidden
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
                flexShrink: 0,
                boxShadow:
                  "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v10l9 4 9-4V7M12 11v10" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="font-semibold"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 22,
                    letterSpacing: "-0.018em",
                    lineHeight: 1.2,
                  }}
                >
                  {product.name}
                </h1>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "2px 7px",
                    borderRadius: 999,
                    color: "var(--accent-primary)",
                    background: "var(--accent-surface)",
                    border:
                      "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                    lineHeight: 1,
                  }}
                  title={kindMeta(product.kind).hint}
                >
                  {kindMeta(product.kind).label}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: product.active
                      ? "var(--emerald-500)"
                      : "var(--text-muted)",
                    background: product.active
                      ? "color-mix(in oklab, var(--emerald-500) 14%, transparent)"
                      : "var(--surface-2)",
                    border: product.active
                      ? "1px solid color-mix(in oklab, var(--emerald-500) 30%, transparent)"
                      : "1px solid var(--border-subtle)",
                    padding: "2px 7px",
                    borderRadius: 999,
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: product.active
                        ? "var(--emerald-500)"
                        : "var(--text-faint)",
                    }}
                  />
                  {product.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div
                className="mt-1.5 truncate"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 12.5,
                  lineHeight: 1.4,
                }}
              >
                {[product.sku, product.category]
                  .filter(Boolean)
                  .map((v, i, arr) => (
                    <span key={i}>
                      <span style={{ color: "var(--text-default)" }}>{v}</span>
                      {i < arr.length - 1 && (
                        <span style={{ color: "var(--text-faint)" }}> · </span>
                      )}
                    </span>
                  ))}
                {!product.sku && !product.category && (
                  <span style={{ color: "var(--text-faint)" }}>
                    No SKU or category set
                  </span>
                )}
              </div>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <form action={toggleActive}>
                <Button type="submit" variant="secondary">
                  {product.active ? "Deactivate" : "Activate"}
                </Button>
              </form>
              <Link href={`/t/${slug}/products/${product.id}/edit`}>
                <Button type="button">Edit</Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Card className="px-5 py-4">
          <div className="text-xs" style={{ color: "var(--muted)" }}>Pricing model</div>
          <div className="mt-1 font-medium">{meta.label}</div>
          <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{meta.hint}</div>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-xs" style={{ color: "var(--muted)" }}>Base price</div>
          <div className="mt-1 text-2xl font-semibold">
            {product.pricingModel === "CUSTOM_QUOTE" ? "Custom" : formatMoney(price, ctx.tenant.currency)}
          </div>
          {product.pricingModel !== "CUSTOM_QUOTE" && (
            <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              per {product.unit || meta.unitDefault}
            </div>
          )}
          {/* Phase 8 — formula badge. Only surface when the price is
              derived; manual pricing is the default and doesn't need a
              callout. Helps the rep understand why the number moved. */}
          {product.priceFormula !== "MANUAL" && (
            <div
              className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px]"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
              }}
              title={formulaMeta(product.priceFormula).hint}
            >
              {product.priceFormula === "COST_PLUS_PCT" && product.markupPct != null
                ? `Cost × ${Number(product.markupPct).toFixed(0)}% markup`
                : product.priceFormula === "COST_PLUS_FIXED" && product.markupFixed != null
                  ? `Cost + ${formatMoney(Number(product.markupFixed), ctx.tenant.currency)}`
                  : formulaMeta(product.priceFormula).label}
            </div>
          )}
        </Card>
        <Card className="px-5 py-4">
          <div className="text-xs" style={{ color: "var(--muted)" }}>Cost / margin</div>
          <div className="mt-1 font-medium">
            {cost != null ? formatMoney(cost, ctx.tenant.currency) : "—"}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {margin != null ? `${margin.toFixed(1)}% margin` : "No cost recorded"}
          </div>
        </Card>
      </div>

      {product.description && (
        <Card>
          <CardHeader title="Description" />
          <p className="whitespace-pre-wrap px-5 py-4 text-sm">{product.description}</p>
        </Card>
      )}

      {/* Phase 8 — internal-only panel. Only rendered when a shop floor
          field has actually been filled; we don't want to push an empty
          "Internal" card onto every product. The border tint makes it
          visually distinct from customer-facing info above. */}
      {(product.productionNotes || product.specSheet || product.internalSku) && (
        <Card>
          <CardHeader
            title="Internal — shop-floor only"
            right={
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Not shown to customers.
              </span>
            }
          />
          <div className="space-y-4 px-5 py-4 text-sm">
            {product.internalSku && (
              <div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Internal SKU
                </div>
                <div className="mt-0.5 font-medium">{product.internalSku}</div>
              </div>
            )}
            {product.productionNotes && (
              <div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Production notes
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {product.productionNotes}
                </p>
              </div>
            )}
            {product.specSheet && (
              <div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Spec sheet
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">{product.specSheet}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Option groups"
          right={<span className="text-xs" style={{ color: "var(--muted)" }}>
            Customers pick one option per group on a quote.
          </span>}
        />
        <div className="px-5 py-4">
          {product.optionGroups.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No option groups yet. Add one below — e.g. &quot;Material&quot; with options Vinyl / Aluminum / Acrylic.
            </p>
          )}
          <ul className="space-y-4">
            {product.optionGroups.map((g) => {
              const remove = deleteOptionGroup.bind(null, slug, g.id);
              return (
                <li key={g.id} className="rounded-md" style={{ border: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <div className="text-sm font-medium">{g.name}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {g.required ? "Required" : "Optional"} · {g.options.length} option{g.options.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    {canManage && (
                      <form action={remove}>
                        <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>
                          Delete group
                        </button>
                      </form>
                    )}
                  </div>
                  <ul>
                    {g.options.map((o) => {
                      const removeOpt = deleteOption.bind(null, slug, o.id);
                      const adj = Number(o.priceAdjustment);
                      return (
                        <li key={o.id} className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
                          <div>{o.label}</div>
                          <div className="flex items-center gap-3">
                            <span style={{ color: "var(--muted)" }}>
                              {adj === 0 ? "no change" : `${adj > 0 ? "+" : ""}${formatMoney(adj, ctx.tenant.currency)}`}
                            </span>
                            {canManage && (
                              <form action={removeOpt}>
                                <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>
                                  Remove
                                </button>
                              </form>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {canManage && (
                    <form action={addOpt} className="flex items-end gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                      <input type="hidden" name="optionGroupId" value={g.id} />
                      <div className="flex-1">
                        <Field label="Add option" name="label" placeholder="e.g. Aluminum" required />
                      </div>
                      <div className="w-40">
                        <Field label="Price +/−" name="priceAdjustment" type="number" step="0.01" defaultValue="0" />
                      </div>
                      <Button type="submit" variant="secondary">Add</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>

          {canManage && (
            <form action={addGroup} className="mt-6 flex items-end gap-3 rounded-md px-4 py-3" style={{ border: "1px dashed var(--border)" }}>
              <input type="hidden" name="productId" value={product.id} />
              <div className="flex-1">
                <Field label="New option group name" name="name" placeholder="e.g. Material" required />
              </div>
              <Checkbox label="Required" name="required" />
              <Button type="submit" variant="secondary">Add group</Button>
            </form>
          )}
        </div>
      </Card>

      {hasAdvancedPricing && (
      <Card>
        <CardHeader
          title="Quantity breaks"
          right={
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {tierApplies
                ? "When a line's quantity reaches a tier, that tier's price per unit replaces base price."
                : "Tiers only apply to per-unit, per-sqft, or per-linear-ft products."}
            </span>
          }
        />
        <div className="px-5 py-4">
          {product.quantityTiers.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No quantity breaks configured.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {product.quantityTiers.map((t) => {
                const remove = deleteProductTier.bind(null, slug, t.id);
                return (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium">{t.minQuantity}+</span>
                      <span style={{ color: "var(--muted)" }}> units</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span>{formatMoney(Number(t.pricePerUnit), ctx.tenant.currency)} / unit</span>
                      {canManage && (
                        <form action={remove}>
                          <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>
                            Remove
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canManage && tierApplies && (
            <form action={addTier} className="mt-4 flex items-end gap-3 rounded-md px-4 py-3" style={{ border: "1px dashed var(--border)" }}>
              <input type="hidden" name="productId" value={product.id} />
              <div className="w-32">
                <Field label="Min qty" name="minQuantity" type="number" step="1" min="1" placeholder="10" required />
              </div>
              <div className="w-40">
                <Field label="Price / unit" name="pricePerUnit" type="number" step="0.01" min="0" placeholder="12.50" required />
              </div>
              <Button type="submit" variant="secondary">Add tier</Button>
            </form>
          )}
        </div>
      </Card>
      )}
    </div>
  );
}
