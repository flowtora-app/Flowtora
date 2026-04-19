"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { computeItemSubtotal, computeQuoteTotals } from "@/lib/quotes";
import { getGroupContext } from "@/lib/franchise";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong = z.string().max(2000).optional().or(z.literal(""));
const optionalSpec = z.string().max(10_000).optional().or(z.literal(""));

const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);
const emptyNum = (s: string | undefined) => {
  if (!s || s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const asBool = (v: FormDataEntryValue | null) => v === "on" || v === "true";

// Phase 8 — enum guards. Kept in sync with the Prisma schema; any new kind
// or formula added to the enum must land here too or the form will reject it.
const PRODUCT_KINDS = [
  "STANDARD",
  "PRINT",
  "SIGN",
  "INSTALL_SERVICE",
  "DESIGN_SERVICE",
  "LABOR",
  "SETUP_FEE",
  "RUSH_FEE",
  "DELIVERY_FEE",
  "CUSTOM",
] as const;

const PRICE_FORMULAS = ["MANUAL", "COST_PLUS_PCT", "COST_PLUS_FIXED"] as const;

const productSchema = z.object({
  name: z.string().min(1).max(160),
  description: optionalLong,
  sku: optionalString,
  category: optionalString,
  pricingModel: z.enum(["FIXED", "PER_UNIT", "PER_SQFT", "PER_LINEAR_FT", "LABOR_HOURLY", "CUSTOM_QUOTE"]),
  basePrice: z.string().optional().or(z.literal("")),
  cost: z.string().optional().or(z.literal("")),
  // Phase 18 Slice F — industry-aware waste factor for trim / offcut.
  wasteFactorPct: z.string().optional().or(z.literal("")),
  unit: optionalString,
  imageUrl: z.string().url().optional().or(z.literal("")),

  // Phase 8 — taxonomy + formula pricing + internal fields.
  kind: z.enum(PRODUCT_KINDS).optional(),
  priceFormula: z.enum(PRICE_FORMULAS).optional(),
  markupPct: z.string().optional().or(z.literal("")),
  markupFixed: z.string().optional().or(z.literal("")),
  productionNotes: optionalLong,
  specSheet: optionalSpec,
  internalSku: optionalString,
});

// Phase 8 — derive the effective basePrice from a formula + inputs.
//
// MANUAL: honor whatever the shop typed. If nothing was typed, we fall back
// to 0 (same behavior as before formulas existed).
// COST_PLUS_PCT: basePrice = cost × (1 + pct/100). Needs cost. If cost is
// missing the formula can't run and we fall through to the typed basePrice.
// COST_PLUS_FIXED: basePrice = cost + flat. Same fallback rule.
//
// Rounded to 2 decimals so the stored value matches the Decimal(12,2) column
// exactly — otherwise Prisma silently truncates and the number shown on the
// form doesn't match the number in the DB.
function applyPriceFormula(opts: {
  formula: (typeof PRICE_FORMULAS)[number];
  typedBasePrice: number | null;
  cost: number | null;
  markupPct: number | null;
  markupFixed: number | null;
}): number {
  const { formula, typedBasePrice, cost, markupPct, markupFixed } = opts;
  const round2 = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  switch (formula) {
    case "COST_PLUS_PCT": {
      if (cost == null || markupPct == null) return typedBasePrice ?? 0;
      return round2(cost * (1 + markupPct / 100));
    }
    case "COST_PLUS_FIXED": {
      if (cost == null || markupFixed == null) return typedBasePrice ?? 0;
      return round2(cost + markupFixed);
    }
    case "MANUAL":
    default:
      return round2(typedBasePrice ?? 0);
  }
}

export async function createProduct(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const raw = Object.fromEntries(formData.entries());
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/t/${slug}/products/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const d = parsed.data;
  const taxable = asBool(formData.get("taxable"));
  const active = asBool(formData.get("active"));
  // Phase 15 Slice D — only group roots can flip `shared`. Defensive
  // gate so a crafted POST from a non-root tenant can't promote a row.
  const shared = ctx.tenant.isGroupRoot && asBool(formData.get("shared"));

  const typedBasePrice = emptyNum(d.basePrice);
  const cost = emptyNum(d.cost);
  const wasteFactorPct = Math.min(100, Math.max(0, emptyNum(d.wasteFactorPct) ?? 0));
  const kind = d.kind ?? "STANDARD";
  const priceFormula = d.priceFormula ?? "MANUAL";
  const markupPct = emptyNum(d.markupPct);
  const markupFixed = emptyNum(d.markupFixed);
  const basePrice = applyPriceFormula({
    formula: priceFormula,
    typedBasePrice,
    cost,
    markupPct,
    markupFixed,
  });

  const product = await db.product.create({
    data: {
      tenantId: ctx.tenant.id,
      name: d.name,
      description: empty(d.description),
      sku: empty(d.sku),
      category: empty(d.category),
      pricingModel: d.pricingModel,
      basePrice: basePrice as never,
      cost: (cost ?? null) as never,
      wasteFactorPct: wasteFactorPct as never,
      unit: empty(d.unit),
      imageUrl: empty(d.imageUrl),
      taxable,
      active,
      shared,
      // Phase 8 — new fields. Markup inputs only get saved when they're
      // actually used by the chosen formula; otherwise we store NULL so
      // stale values don't re-activate if the user later switches back.
      kind,
      priceFormula,
      markupPct: (priceFormula === "COST_PLUS_PCT" ? markupPct : null) as never,
      markupFixed: (priceFormula === "COST_PLUS_FIXED" ? markupFixed : null) as never,
      productionNotes: empty(d.productionNotes),
      specSheet: empty(d.specSheet),
      internalSku: empty(d.internalSku),
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "product.created",
    entityType: "Product",
    entityId: product.id,
  });

  revalidatePath(`/t/${slug}/products`);
  redirect(`/t/${slug}/products/${product.id}`);
}

export async function updateProduct(slug: string, productId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const parsed = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/products/${productId}/edit?error=${encodeURIComponent("Invalid input")}`);
  }
  const existing = await db.product.findFirst({
    where: { id: productId, tenantId: ctx.tenant.id },
  });
  if (!existing) redirect(`/t/${slug}/products`);

  const d = parsed.data;
  const taxable = asBool(formData.get("taxable"));
  const active = asBool(formData.get("active"));
  // If the tenant lost group-root status since this row was last saved,
  // we leave `shared` untouched — flipping it off here would silently
  // break inheritance for child tenants. The settings page is the
  // single chokepoint for becoming/leaving a group root.
  const sharedField = ctx.tenant.isGroupRoot
    ? { shared: asBool(formData.get("shared")) }
    : {};
  const typedBasePrice = emptyNum(d.basePrice);
  const cost = emptyNum(d.cost);
  const wasteFactorPct = Math.min(100, Math.max(0, emptyNum(d.wasteFactorPct) ?? 0));
  const kind = d.kind ?? existing.kind;
  const priceFormula = d.priceFormula ?? existing.priceFormula;
  const markupPct = emptyNum(d.markupPct);
  const markupFixed = emptyNum(d.markupFixed);
  const basePrice = applyPriceFormula({
    formula: priceFormula,
    typedBasePrice,
    cost,
    markupPct,
    markupFixed,
  });

  await db.product.update({
    where: { id: productId },
    data: {
      name: d.name,
      description: empty(d.description),
      sku: empty(d.sku),
      category: empty(d.category),
      pricingModel: d.pricingModel,
      basePrice: basePrice as never,
      cost: (cost ?? null) as never,
      wasteFactorPct: wasteFactorPct as never,
      unit: empty(d.unit),
      imageUrl: empty(d.imageUrl),
      taxable,
      active,
      ...sharedField,
      kind,
      priceFormula,
      markupPct: (priceFormula === "COST_PLUS_PCT" ? markupPct : null) as never,
      markupFixed: (priceFormula === "COST_PLUS_FIXED" ? markupFixed : null) as never,
      productionNotes: empty(d.productionNotes),
      specSheet: empty(d.specSheet),
      internalSku: empty(d.internalSku),
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "product.updated",
    entityType: "Product",
    entityId: productId,
  });

  revalidatePath(`/t/${slug}/products/${productId}`);
  redirect(`/t/${slug}/products/${productId}`);
}

export async function toggleProductActive(slug: string, productId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const p = await db.product.findFirst({ where: { id: productId, tenantId: ctx.tenant.id } });
  if (!p) return;
  await db.product.update({
    where: { id: p.id },
    data: { active: !p.active },
  });
  revalidatePath(`/t/${slug}/products`);
  revalidatePath(`/t/${slug}/products/${productId}`);
}

export async function deleteProduct(slug: string, productId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  await db.product.deleteMany({ where: { id: productId, tenantId: ctx.tenant.id } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "product.deleted",
    entityType: "Product",
    entityId: productId,
  });
  redirect(`/t/${slug}/products`);
}

// ────────────────────────────────────────────────────────────
// Option groups
// ────────────────────────────────────────────────────────────

const groupSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1).max(120),
  required: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

async function productInTenant(productId: string, tenantId: string) {
  return db.product.findFirst({ where: { id: productId, tenantId } });
}

export async function addOptionGroup(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const parsed = groupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const p = await productInTenant(parsed.data.productId, ctx.tenant.id);
  if (!p) return;

  const last = await db.productOptionGroup.findFirst({
    where: { productId: p.id },
    orderBy: { sortOrder: "desc" },
  });

  await db.productOptionGroup.create({
    data: {
      productId: p.id,
      name: parsed.data.name,
      required: parsed.data.required ?? false,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath(`/t/${slug}/products/${p.id}`);
}

export async function deleteOptionGroup(slug: string, groupId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const g = await db.productOptionGroup.findFirst({
    where: { id: groupId, product: { tenantId: ctx.tenant.id } },
    include: { product: true },
  });
  if (!g) return;
  await db.productOptionGroup.delete({ where: { id: g.id } });
  revalidatePath(`/t/${slug}/products/${g.productId}`);
}

// ────────────────────────────────────────────────────────────
// Options (within a group)
// ────────────────────────────────────────────────────────────

const optionSchema = z.object({
  optionGroupId: z.string().min(1),
  label: z.string().min(1).max(120),
  priceAdjustment: z.string().optional().or(z.literal("")),
});

export async function addOption(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const parsed = optionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const g = await db.productOptionGroup.findFirst({
    where: { id: parsed.data.optionGroupId, product: { tenantId: ctx.tenant.id } },
    include: { product: true },
  });
  if (!g) return;

  const last = await db.productOption.findFirst({
    where: { optionGroupId: g.id },
    orderBy: { sortOrder: "desc" },
  });

  await db.productOption.create({
    data: {
      optionGroupId: g.id,
      label: parsed.data.label,
      priceAdjustment: (emptyNum(parsed.data.priceAdjustment) ?? 0) as never,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath(`/t/${slug}/products/${g.productId}`);
}

export async function deleteOption(slug: string, optionId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const o = await db.productOption.findFirst({
    where: { id: optionId, optionGroup: { product: { tenantId: ctx.tenant.id } } },
    include: { optionGroup: true },
  });
  if (!o) return;
  await db.productOption.delete({ where: { id: o.id } });
  revalidatePath(`/t/${slug}/products/${o.optionGroup.productId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 13 — Quantity break tiers
// ────────────────────────────────────────────────────────────
//
// Tiers live on Product as a separate table (easier to edit) and get
// snapshotted to QuoteItem.quantityTiers JSON at add-time so historical
// quotes don't reprice when the shop later tweaks the catalog.

const tierSchema = z.object({
  productId: z.string().min(1),
  minQuantity: z.string().min(1),
  pricePerUnit: z.string().min(1),
});

export async function addProductTier(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const parsed = tierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const p = await productInTenant(parsed.data.productId, ctx.tenant.id);
  if (!p) return;

  const minQuantity = Math.max(1, Math.floor(Number(parsed.data.minQuantity)));
  const pricePerUnit = Number(parsed.data.pricePerUnit);
  if (!Number.isFinite(minQuantity) || !Number.isFinite(pricePerUnit) || pricePerUnit < 0) return;

  const last = await db.productQuantityTier.findFirst({
    where: { productId: p.id },
    orderBy: { sortOrder: "desc" },
  });

  const tier = await db.productQuantityTier.create({
    data: {
      productId: p.id,
      minQuantity,
      pricePerUnit: pricePerUnit as never,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "product.tier_added",
    entityType: "Product",
    entityId:   p.id,
    metadata:   { tierId: tier.id, minQuantity, pricePerUnit },
  });

  revalidatePath(`/t/${slug}/products/${p.id}`);
}

export async function deleteProductTier(slug: string, tierId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const t = await db.productQuantityTier.findFirst({
    where: { id: tierId, product: { tenantId: ctx.tenant.id } },
  });
  if (!t) return;
  await db.productQuantityTier.delete({ where: { id: t.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "product.tier_deleted",
    entityType: "Product",
    entityId:   t.productId,
    metadata:   { tierId: t.id, minQuantity: t.minQuantity },
  });

  revalidatePath(`/t/${slug}/products/${t.productId}`);
}

// ────────────────────────────────────────────────────────────
// Phase 8 — Package templates
// ────────────────────────────────────────────────────────────
//
// Packages are reusable bundles a rep can drop onto a quote in one click.
// The template stays the template — when expanded we create individual
// QuoteItem rows snapshotting each component's current product data, which
// means later catalog edits don't rewrite historical quotes.

const packageSchema = z.object({
  name: z.string().min(1).max(160),
  description: optionalLong,
  internalNotes: optionalLong,
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function createPackage(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const parsed = packageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(
      `/t/${slug}/products/packages/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  }
  const d = parsed.data;
  const pkg = await db.productPackage.create({
    data: {
      tenantId: ctx.tenant.id,
      name: d.name,
      description: empty(d.description),
      internalNotes: empty(d.internalNotes),
      active: d.active ?? true,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "package.created",
    entityType: "ProductPackage",
    entityId: pkg.id,
    metadata: { name: pkg.name },
  });

  revalidatePath(`/t/${slug}/products/packages`);
  redirect(`/t/${slug}/products/packages/${pkg.id}`);
}

export async function updatePackage(slug: string, packageId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const existing = await db.productPackage.findFirst({
    where: { id: packageId, tenantId: ctx.tenant.id },
  });
  if (!existing) redirect(`/t/${slug}/products/packages`);
  const parsed = packageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(
      `/t/${slug}/products/packages/${packageId}?error=${encodeURIComponent("Invalid input")}`,
    );
  }
  const d = parsed.data;
  await db.productPackage.update({
    where: { id: packageId },
    data: {
      name: d.name,
      description: empty(d.description),
      internalNotes: empty(d.internalNotes),
      active: d.active ?? false,
    },
  });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "package.updated",
    entityType: "ProductPackage",
    entityId: packageId,
  });

  revalidatePath(`/t/${slug}/products/packages`);
  revalidatePath(`/t/${slug}/products/packages/${packageId}`);
}

export async function togglePackageActive(slug: string, packageId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const pkg = await db.productPackage.findFirst({
    where: { id: packageId, tenantId: ctx.tenant.id },
  });
  if (!pkg) return;
  await db.productPackage.update({
    where: { id: pkg.id },
    data: { active: !pkg.active },
  });
  revalidatePath(`/t/${slug}/products/packages`);
  revalidatePath(`/t/${slug}/products/packages/${packageId}`);
}

export async function deletePackage(slug: string, packageId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const pkg = await db.productPackage.findFirst({
    where: { id: packageId, tenantId: ctx.tenant.id },
  });
  if (!pkg) return;
  // Components cascade from the package; existing quote items are untouched
  // because the expansion only snapshots data, it never referenced the pkg.
  await db.productPackage.delete({ where: { id: pkg.id } });

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "package.deleted",
    entityType: "ProductPackage",
    entityId: packageId,
    metadata: { name: pkg.name },
  });

  redirect(`/t/${slug}/products/packages`);
}

const componentSchema = z.object({
  packageId: z.string().min(1),
  productId: z.string().min(1),
  defaultQuantity: z.string().optional().or(z.literal("")),
  note: optionalString,
});

export async function addPackageComponent(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "products:manage");
  const parsed = componentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const pkg = await db.productPackage.findFirst({
    where: { id: parsed.data.packageId, tenantId: ctx.tenant.id },
  });
  if (!pkg) return;

  // Accept either a tenant-owned product or an inherited shared one from the
  // group root. This mirrors the quote-item add behaviour so shops using
  // franchise inheritance can build packages around shared catalog rows.
  const groupCtx = await getGroupContext(ctx.tenant.id);
  const product = await db.product.findFirst({
    where: {
      id: parsed.data.productId,
      OR: [
        { tenantId: ctx.tenant.id },
        ...(groupCtx.parentTenantId
          ? [{ tenantId: groupCtx.parentTenantId, shared: true } as const]
          : []),
      ],
    },
  });
  if (!product) return;

  const last = await db.productPackageComponent.findFirst({
    where: { packageId: pkg.id },
    orderBy: { sortOrder: "desc" },
  });

  const qty = Number(parsed.data.defaultQuantity);
  const defaultQuantity =
    Number.isFinite(qty) && qty > 0 ? Math.round(qty * 1000) / 1000 : 1;

  await db.productPackageComponent.create({
    data: {
      packageId: pkg.id,
      productId: product.id,
      defaultQuantity: defaultQuantity as never,
      note: empty(parsed.data.note),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  revalidatePath(`/t/${slug}/products/packages/${pkg.id}`);
}

export async function removePackageComponent(slug: string, componentId: string) {
  const ctx = await requirePermission(slug, "products:manage");
  const c = await db.productPackageComponent.findFirst({
    where: { id: componentId, package: { tenantId: ctx.tenant.id } },
  });
  if (!c) return;
  await db.productPackageComponent.delete({ where: { id: c.id } });
  revalidatePath(`/t/${slug}/products/packages/${c.packageId}`);
}

// Expand a package template into individual QuoteItems on the target quote.
// Each component snapshots its current product pricing onto the new line so
// the quote stays stable even if the catalog changes tomorrow. The package
// itself is not linked — deleting the package later doesn't touch any quote.
export async function addPackageToQuote(
  slug: string,
  quoteId: string,
  formData: FormData,
) {
  const ctx = await requirePermission(slug, "quotes:manage");
  const packageId = String(formData.get("packageId") ?? "");
  if (!packageId) return;

  const quote = await db.quote.findFirst({
    where: { id: quoteId, tenantId: ctx.tenant.id },
    select: { id: true, status: true, discountType: true, discountValue: true, taxRate: true },
  });
  if (!quote) return;
  // Don't silently mutate quotes that have already gone out the door. The
  // detail page disables the control but someone could POST around it.
  if (quote.status !== "DRAFT") return;

  const groupCtx = await getGroupContext(ctx.tenant.id);

  const pkg = await db.productPackage.findFirst({
    where: { id: packageId, tenantId: ctx.tenant.id, active: true },
    include: {
      components: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            include: { quantityTiers: { orderBy: [{ minQuantity: "asc" }] } },
          },
        },
      },
    },
  });
  if (!pkg || pkg.components.length === 0) return;

  // Validate every component product is still reachable by this tenant —
  // a component could point at a shared parent product that has since been
  // un-shared. We just skip those lines instead of aborting the whole thing
  // so the rep still gets the rest of the bundle.
  const allowedTenants = new Set<string>([ctx.tenant.id]);
  if (groupCtx.parentTenantId) allowedTenants.add(groupCtx.parentTenantId);

  const lastItem = await db.quoteItem.findFirst({
    where: { quoteId },
    orderBy: { sortOrder: "desc" },
  });
  let sortOrder = (lastItem?.sortOrder ?? 0) + 1;

  const createdIds: string[] = [];
  for (const comp of pkg.components) {
    const p = comp.product;
    // Inherited-shared guard: if this product came from the parent, the
    // parent tenant must still mark it shared.
    if (
      p.tenantId !== ctx.tenant.id &&
      !(groupCtx.parentTenantId === p.tenantId && p.shared)
    ) {
      continue;
    }
    if (!allowedTenants.has(p.tenantId)) continue;

    const tierSnapshot = p.quantityTiers.map((t) => ({
      minQuantity: t.minQuantity,
      pricePerUnit: Number(t.pricePerUnit),
    }));

    // Quantity default: the package says "two of these" for dimension-based
    // rows the multiplier acts as the quantity on the quote line — the rep
    // can still override width/height/etc. after expansion.
    const qty =
      p.pricingModel !== "FIXED" && p.pricingModel !== "CUSTOM_QUOTE"
        ? Number(comp.defaultQuantity)
        : null;

    // Preserve the package note on the line description so context doesn't
    // get lost. If the product already carries a description we append.
    const lineDescription =
      [p.description, comp.note].filter(Boolean).join("\n\n") || null;

    const data: Prisma.QuoteItemUncheckedCreateInput = {
      quoteId,
      productId: p.id,
      name: p.name,
      description: lineDescription,
      pricingModel: p.pricingModel,
      basePrice: p.basePrice,
      unit: p.unit,
      taxable: p.taxable,
      quantity: qty as never,
      selectedOptions: [] as never,
      quantityTiers: tierSnapshot as never,
      wasteFactorPct: p.wasteFactorPct as never,
      costSnapshot: (p.cost ?? null) as never,
      subtotal: 0 as never,
      sortOrder: sortOrder++,
    };
    const created = await db.quoteItem.create({ data });
    const subtotal = computeItemSubtotal(created);
    await db.quoteItem.update({
      where: { id: created.id },
      data: { subtotal: subtotal as never },
    });
    createdIds.push(created.id);
  }

  if (createdIds.length === 0) return;

  // Recompute quote totals — mirror the private helper in quotes.ts. A
  // transaction would be cleaner but each quoteItem update above already
  // settled, so we just re-read and roll up.
  const q = await db.quote.findUnique({
    where: { id: quoteId },
    include: { items: true },
  });
  if (q) {
    const totals = computeQuoteTotals(
      q.items.map((it) => ({
        subtotal: it.subtotal,
        taxable: it.taxable,
        isOptional: it.isOptional,
      })),
      {
        discountType: q.discountType,
        discountValue: Number(q.discountValue),
        taxRate: Number(q.taxRate),
        depositType: q.depositType,
        depositValue: Number(q.depositValue),
      },
    );
    await db.quote.update({
      where: { id: quoteId },
      data: {
        subtotal: totals.subtotal as never,
        discountAmount: totals.discountAmount as never,
        taxAmount: totals.taxAmount as never,
        total: totals.total as never,
        optionalSubtotal: totals.optionalSubtotal as never,
        depositAmount: totals.depositAmount as never,
      },
    });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "quote.package_expanded",
    entityType: "Quote",
    entityId: quoteId,
    metadata: {
      packageId: pkg.id,
      packageName: pkg.name,
      lineCount: createdIds.length,
    },
  });

  revalidatePath(`/t/${slug}/quotes/${quoteId}`);
}
