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

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await requirePermission(slug, "products:view");
  const canManage = ctx.can("products:manage");

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
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/products`} className="underline" style={{ color: "var(--muted)" }}>
          ← Products
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{product.name}</h1>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
              title={kindMeta(product.kind).hint}
            >
              {kindMeta(product.kind).label}
            </span>
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {[product.sku, product.category, humanize(product.active ? "ACTIVE" : "INACTIVE")].filter(Boolean).join(" · ")}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
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
    </div>
  );
}
