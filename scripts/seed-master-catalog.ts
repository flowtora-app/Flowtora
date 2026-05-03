// Page 25 — seed demo Master Product Catalog so the new pages render
// real numbers. Idempotent: skips if seeded products already exist.
//
// 5 representative products covering the main categories:
//   • 13oz Vinyl Banner (BANNERS) — fully fleshed out (attributes,
//     materials, images, marked PUBLISHED + cloned by 1 tenant)
//   • Yard Sign (YARD_SIGNS) — PUBLISHED
//   • Premium Business Cards (BUSINESS_CARDS) — PUBLISHED
//   • Custom T-Shirt (APPAREL_DTG) — DRAFT
//   • Window Decal (WALL_DECALS) — PUBLISHED

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

async function pickAdminId(): Promise<string> {
  const admin = await db.user.findFirst({
    where: { platformRole: { in: ["SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "BILLING_MANAGER"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No platform admin user found");
  console.log(`  using admin: ${admin.email}`);
  return admin.id;
}

async function seedMasterProducts(adminId: string) {
  const existing = await db.masterProduct.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} master products — skipping.`);
    return;
  }

  // 1. Vinyl banner — fully fleshed out
  const banner = await db.masterProduct.create({
    data: {
      slug: "vinyl-banner-13oz",
      name: "13oz Vinyl Banner",
      sku: "BAN-13OZ",
      category: "BANNERS",
      industryVertical: "Sign shop",
      shortDescription: "Standard outdoor banner — printed full color on 13oz scrim vinyl.",
      description: "Our most popular banner. 13oz scrim vinyl handles weather and wind without tearing. Available in custom sizes from 2'×4' up to 10'×30'. Hemmed edges with grommets every 2 ft, optional pole pockets.",
      internalNotes: "Standard runs print on the wide-format Roland; trim with finishing tools. Default lead 3 days, rush 1 day available.",
      tags: ["outdoor", "vinyl", "popular", "wide-format"],
      status: "PUBLISHED",
      priceFromMinor: 2900, // $29
      pricingFormulaSlug: "wide-format-area",
      leadTimeDays: 3,
      rushLeadTimeDays: 1,
      wasteFactorPct: new Prisma.Decimal(8),
      requiredEquipment: ["wide_format_printer", "cutter"],
      capacityUnit: "sq_ft_per_hour",
      capacityValue: new Prisma.Decimal(120),
      certifications: ["FIRE_RATED_NFPA_701"],
      complianceNotes: "Banner stock meets NFPA 701 fire-rated standard. Required for many indoor venue use cases.",
      primaryImageUrl: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=800&h=600&fit=crop",
      seoTitle: "13oz Vinyl Banner — Custom Outdoor Banners",
      seoDescription: "High-quality 13oz scrim vinyl banners. Hemmed + grommeted edges, custom sizes, 3-day standard lead.",
      ogImageUrl: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=1200&h=630&fit=crop",
      publishedAt: new Date(Date.now() - 30 * 86_400_000),
      createdById: adminId,
      attributes: {
        create: [
          {
            key: "width", label: "Width", type: "NUMBER", sortOrder: 1, required: true, customerVisible: true,
            validation: { min: 24, max: 120, step: 1, unit: "in" } as Prisma.InputJsonValue,
            defaultValue: 48 as Prisma.InputJsonValue,
            helpText: "Width in inches. 24\"–120\" supported.",
          },
          {
            key: "height", label: "Height", type: "NUMBER", sortOrder: 2, required: true, customerVisible: true,
            validation: { min: 24, max: 360, step: 1, unit: "in" } as Prisma.InputJsonValue,
            defaultValue: 24 as Prisma.InputJsonValue,
            helpText: "Height in inches. 24\"–360\" supported.",
          },
          {
            key: "sides", label: "Sides", type: "SELECT", sortOrder: 3, required: true, customerVisible: true,
            options: [
              { value: 1, label: "Single-sided" },
              { value: 2, label: "Double-sided" },
            ] as Prisma.InputJsonValue,
            defaultValue: 1 as Prisma.InputJsonValue,
          },
          {
            key: "finish", label: "Finish", type: "SELECT", sortOrder: 4, required: true, customerVisible: true,
            options: [
              { value: "hemmed_grommeted", label: "Hemmed + grommets every 2ft" },
              { value: "pole_pocket_top", label: "Pole pocket top" },
              { value: "pole_pocket_top_bottom", label: "Pole pockets (top + bottom)" },
              { value: "no_finish", label: "No finish (raw edges)" },
            ] as Prisma.InputJsonValue,
            defaultValue: "hemmed_grommeted" as Prisma.InputJsonValue,
          },
          {
            key: "rush", label: "Rush production", type: "BOOLEAN", sortOrder: 5, required: false, customerVisible: true,
            defaultValue: false as Prisma.InputJsonValue,
            helpText: "1-day turnaround instead of 3 days. +50% surcharge.",
          },
        ],
      },
      materials: {
        create: [
          {
            materialKey: "vinyl_13oz",
            label: "13oz scrim vinyl",
            defaultConsumption: "1.08 * area_sqft",
            costPerUnit: 165,  // $1.65/sqft
            unit: "sq_ft",
            preferredSupplier: "Avery / Mutoh / Roland",
            notes: "Includes 8% waste for hemming + bleed.",
          },
          {
            materialKey: "grommets",
            label: "Brass grommets",
            defaultConsumption: "ceil(perimeter_ft / 2)",
            costPerUnit: 8, // 8 cents each
            unit: "each",
          },
          {
            materialKey: "hem_tape",
            label: "Banner hem tape",
            defaultConsumption: "perimeter_ft",
            costPerUnit: 12,
            unit: "linear_ft",
          },
        ],
      },
      images: {
        create: [
          {
            url: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=1200&h=900&fit=crop",
            altText: "13oz vinyl banner mounted on a fence",
            kind: "HERO",
            sortOrder: 0,
          },
          {
            url: "https://images.unsplash.com/photo-1565689157206-0fddef7589a2?w=1200&h=900&fit=crop",
            altText: "Detail shot of grommeted edge",
            kind: "GALLERY",
            sortOrder: 1,
          },
          {
            url: "https://images.unsplash.com/photo-1542744095-291d1f67b221?w=1200&h=900&fit=crop",
            altText: "Banner installed at trade show",
            kind: "LIFESTYLE",
            sortOrder: 2,
          },
        ],
      },
    },
  });
  console.log(`  ✓ ${banner.slug} (PUBLISHED, fully detailed)`);

  // 2. Yard sign
  const yardSign = await db.masterProduct.create({
    data: {
      slug: "corrugated-yard-sign",
      name: "Corrugated Plastic Yard Sign",
      sku: "YRD-COROPLAST",
      category: "YARD_SIGNS",
      industryVertical: "Sign shop",
      shortDescription: "4mm corrugated plastic yard sign — perfect for real estate, political, and event signage.",
      description: "4mm corrugated plastic with full-color UV-resistant inks. Standard sizes 18×24\" and 24×36\". Ships with H-frame stake.",
      tags: ["outdoor", "real-estate", "political", "popular"],
      status: "PUBLISHED",
      priceFromMinor: 1200,
      leadTimeDays: 2,
      wasteFactorPct: new Prisma.Decimal(5),
      requiredEquipment: ["wide_format_printer", "cutter"],
      capacityUnit: "pcs_per_hour",
      capacityValue: new Prisma.Decimal(80),
      primaryImageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop",
      publishedAt: new Date(Date.now() - 45 * 86_400_000),
      createdById: adminId,
      attributes: {
        create: [
          { key: "size", label: "Size", type: "SELECT", sortOrder: 1, required: true,
            options: [
              { value: "18x24", label: "18\" × 24\" — Standard" },
              { value: "24x36", label: "24\" × 36\" — Large" },
            ] as Prisma.InputJsonValue,
            defaultValue: "18x24" as Prisma.InputJsonValue },
          { key: "quantity", label: "Quantity", type: "NUMBER", sortOrder: 2, required: true,
            validation: { min: 1, max: 10000, step: 1 } as Prisma.InputJsonValue,
            defaultValue: 25 as Prisma.InputJsonValue },
          { key: "double_sided", label: "Double-sided", type: "BOOLEAN", sortOrder: 3 },
        ],
      },
      materials: {
        create: [
          { materialKey: "coroplast_4mm", label: "4mm corrugated plastic", costPerUnit: 280, unit: "sq_ft" },
          { materialKey: "h_stake", label: "H-frame wire stake", costPerUnit: 95, unit: "each" },
        ],
      },
    },
  });
  console.log(`  ✓ ${yardSign.slug} (PUBLISHED)`);

  // 3. Business cards
  const cards = await db.masterProduct.create({
    data: {
      slug: "premium-business-cards",
      name: "Premium Business Cards",
      sku: "BCARD-PREMIUM",
      category: "BUSINESS_CARDS",
      industryVertical: "Print shop",
      shortDescription: "16pt cardstock, full-color, optional spot UV / foil / soft-touch lamination.",
      description: "Premium 16pt C2S cardstock with offset printing. Standard 100/250/500/1000 quantities. Spot UV, raised foil, and soft-touch lamination available.",
      tags: ["popular", "trade-print", "small-format"],
      status: "PUBLISHED",
      priceFromMinor: 2500,
      leadTimeDays: 5,
      rushLeadTimeDays: 2,
      requiredEquipment: ["offset_press", "cutter", "spot_uv_press"],
      primaryImageUrl: "https://images.unsplash.com/photo-1572502736569-90c64a4b1d65?w=800&h=600&fit=crop",
      publishedAt: new Date(Date.now() - 20 * 86_400_000),
      createdById: adminId,
      attributes: {
        create: [
          { key: "quantity", label: "Quantity", type: "SELECT", sortOrder: 1, required: true,
            options: [
              { value: 100, label: "100" }, { value: 250, label: "250" },
              { value: 500, label: "500" }, { value: 1000, label: "1000" },
            ] as Prisma.InputJsonValue,
            defaultValue: 500 as Prisma.InputJsonValue },
          { key: "finish", label: "Finish", type: "SELECT", sortOrder: 2,
            options: [
              { value: "matte", label: "Matte" },
              { value: "gloss", label: "Gloss" },
              { value: "soft_touch", label: "Soft-touch lamination (+$15)" },
              { value: "spot_uv", label: "Spot UV (+$25)" },
            ] as Prisma.InputJsonValue,
            defaultValue: "matte" as Prisma.InputJsonValue },
        ],
      },
    },
  });
  console.log(`  ✓ ${cards.slug} (PUBLISHED)`);

  // 4. T-shirt (DRAFT)
  const tshirt = await db.masterProduct.create({
    data: {
      slug: "custom-tshirt-dtg",
      name: "Custom T-Shirt — Direct-to-Garment",
      sku: "APP-TSHIRT-DTG",
      category: "APPAREL_DTG",
      industryVertical: "Apparel",
      shortDescription: "100% combed cotton tee, full-color DTG print. No minimums.",
      description: "Bella + Canvas 3001CVC blanks, 100% combed ringspun cotton. Direct-to-Garment full-color print up to 14×16 inch print area. Perfect for one-offs and small runs.",
      tags: ["apparel", "no-minimum", "DTG"],
      status: "DRAFT",
      priceFromMinor: 1800,
      leadTimeDays: 4,
      requiredEquipment: ["dtg_printer", "heat_press"],
      certifications: ["OEKO_TEX_100"],
      primaryImageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop",
      createdById: adminId,
    },
  });
  console.log(`  ✓ ${tshirt.slug} (DRAFT)`);

  // 5. Window decal
  const decal = await db.masterProduct.create({
    data: {
      slug: "window-decal-printed",
      name: "Printed Window Decal",
      sku: "DECAL-WIN",
      category: "WALL_DECALS",
      industryVertical: "Sign shop",
      shortDescription: "Self-adhesive vinyl decal — printed full color and contour-cut.",
      description: "3M IJ180 cast vinyl with full-color print and laminate. Contour-cut to your shape. Indoor or outdoor rated.",
      tags: ["vinyl", "small-format", "contour-cut"],
      status: "PUBLISHED",
      priceFromMinor: 800,
      leadTimeDays: 3,
      wasteFactorPct: new Prisma.Decimal(12),
      requiredEquipment: ["wide_format_printer", "vinyl_cutter", "laminator"],
      primaryImageUrl: "https://images.unsplash.com/photo-1561070791-2526d30994b8?w=800&h=600&fit=crop",
      publishedAt: new Date(Date.now() - 10 * 86_400_000),
      createdById: adminId,
    },
  });
  console.log(`  ✓ ${decal.slug} (PUBLISHED)`);

  return banner;
}

async function seedClone(banner: { id: string; name: string } | undefined) {
  if (!banner) return;
  // Pick the first tenant + clone the banner into their catalog so
  // adoption metrics show a real number.
  const tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!tenant) return;
  const existingClone = await db.product.findFirst({
    where: { masterProductId: banner.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (existingClone) {
    console.log(`  Clone already exists for ${tenant.name} — skipping.`);
    return;
  }
  await db.product.create({
    data: {
      tenantId: tenant.id,
      name: banner.name,
      description: "Cloned from master template — tenant-customizable.",
      sku: "BAN-13OZ",
      category: "Banners",
      basePrice: new Prisma.Decimal(29),
      taxable: true,
      active: true,
      kind: "PRINT",
      masterProductId: banner.id,
    },
  });
  console.log(`  ✓ ${tenant.name} cloned ${banner.name}`);
}

async function summary() {
  const [products, attrs, materials, images, clones] = await Promise.all([
    db.masterProduct.count(),
    db.masterProductAttribute.count(),
    db.masterProductMaterial.count(),
    db.masterProductImage.count(),
    db.product.count({ where: { masterProductId: { not: null } } }),
  ]);
  console.log("\n── Summary ──");
  console.log(`  master products: ${products}, attributes: ${attrs}, materials: ${materials}, images: ${images}, clones: ${clones}`);
}

async function main() {
  const adminId = await pickAdminId();
  const banner = await seedMasterProducts(adminId);
  await seedClone(banner);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
