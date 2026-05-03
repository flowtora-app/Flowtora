// Page 26 — seed demo Master Material Library so the new pages render
// real numbers. Idempotent: skips if seeded materials already exist.
//
// 6 materials covering the main categories:
//   • 13oz Scrim Vinyl (VINYL/Calendared) — 2 suppliers + 4 swatches, fully fleshed
//   • 4mm Coroplast (SUBSTRATES/Coroplast) — primary supplier only
//   • 3M IJ180 Cast Vinyl (VINYL/Cast) — 1 supplier, has stale price
//   • Eco-solvent Ink Set (INKS/Eco-solvent) — 4-color swatches, 1 supplier
//   • Bella+Canvas 3001CVC blank (BLANKS/T-shirt) — 1 supplier
//   • Brass grommets #2 (HARDWARE/Grommets) — DISCONTINUED

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

async function seed(adminId: string) {
  const existing = await db.masterMaterial.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} master materials — skipping.`);
    return;
  }

  const day = 86_400_000;

  // 1. 13oz scrim vinyl — fully fleshed
  await db.masterMaterial.create({
    data: {
      slug: "vinyl-13oz-scrim",
      name: "13oz Scrim Vinyl",
      sku: "VIN-13OZ-SCRIM",
      category: "VINYL",
      subcategory: "Calendared",
      widthIn: new Prisma.Decimal(54),
      rollLengthFt: new Prisma.Decimal(165),
      thicknessMil: new Prisma.Decimal(13),
      gsm: 440,
      colorHex: "#FFFFFF",
      finish: "MATTE",
      usage: "OUTDOOR",
      durabilityYears: 5,
      fireRating: "NFPA 701",
      recyclable: false,
      opacityPct: 100,
      adhesiveType: null,
      defaultCost: 165,
      defaultUnit: "sq_ft",
      defaultMarkupPct: new Prisma.Decimal(60),
      wasteFactorPct: new Prisma.Decimal(8),
      minOrderQty: new Prisma.Decimal(50),
      imageUrl: "https://images.unsplash.com/photo-1559456040-3e9d9d6b9c8e?w=800&h=600&fit=crop",
      datasheetUrl: "https://example.com/datasheets/vinyl-13oz-scrim.pdf",
      equipmentCompatibility: ["wide_format_printer", "cutter"],
      compatibleProductSlugs: ["vinyl-banner-13oz"],
      status: "ACTIVE",
      tags: ["banner", "outdoor", "popular"],
      createdById: adminId,
      suppliers: {
        create: [
          {
            supplierName: "Avery Dennison",
            supplierSku: "AVR-S5000-13OZ",
            leadTimeDays: 5,
            moq: new Prisma.Decimal(100),
            costAtSupplier: 158,
            lastPriceUpdate: new Date(Date.now() - 14 * day),
            portalUrl: "https://averydennisongraphics.com",
            isPrimary: true,
            notes: "Standard contract pricing, NET 30",
          },
          {
            supplierName: "FDC Graphic Films",
            supplierSku: "FDC-S5000-13",
            leadTimeDays: 7,
            moq: new Prisma.Decimal(75),
            costAtSupplier: 172,
            lastPriceUpdate: new Date(Date.now() - 30 * day),
            portalUrl: "https://fdcfilms.com",
            isPrimary: false,
            notes: "Backup — 7d lead but reliable when Avery is out",
          },
        ],
      },
      swatches: {
        create: [
          { colorName: "White",      colorKey: "white",      hex: "#FFFFFF", skuSuffix: "-WHT", sortOrder: 0 },
          { colorName: "Black",      colorKey: "black",      hex: "#000000", skuSuffix: "-BLK", sortOrder: 1 },
          { colorName: "Cardinal",   colorKey: "cardinal",   hex: "#C8102E", pantoneCode: "186 C", skuSuffix: "-RED", sortOrder: 2 },
          { colorName: "Reflex Blue",colorKey: "reflex_blue",hex: "#002FA7", pantoneCode: "Reflex Blue C", skuSuffix: "-BLU", sortOrder: 3 },
        ],
      },
    },
  });
  console.log("  ✓ vinyl-13oz-scrim (VINYL, 2 suppliers, 4 swatches)");

  // 2. Coroplast
  await db.masterMaterial.create({
    data: {
      slug: "coroplast-4mm",
      name: "4mm Corrugated Plastic (Coroplast)",
      sku: "SUB-COROPLAST-4MM",
      category: "SUBSTRATES",
      subcategory: "Coroplast",
      widthIn: new Prisma.Decimal(48),
      rollLengthFt: null,
      thicknessMil: new Prisma.Decimal(160),
      gsm: null,
      colorHex: "#FFFFFF",
      finish: "MATTE",
      usage: "OUTDOOR",
      durabilityYears: 1,
      recyclable: true,
      opacityPct: 90,
      defaultCost: 280,
      defaultUnit: "sq_ft",
      defaultMarkupPct: new Prisma.Decimal(70),
      wasteFactorPct: new Prisma.Decimal(5),
      imageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop",
      equipmentCompatibility: ["wide_format_printer", "cutter"],
      compatibleProductSlugs: ["corrugated-yard-sign"],
      status: "ACTIVE",
      tags: ["yard-sign", "real-estate", "political"],
      createdById: adminId,
      suppliers: {
        create: [
          {
            supplierName: "Coroplast (Inteplast Group)",
            supplierSku: "INT-4MM-WHT",
            leadTimeDays: 4,
            costAtSupplier: 240,
            lastPriceUpdate: new Date(Date.now() - 21 * day),
            isPrimary: true,
          },
        ],
      },
    },
  });
  console.log("  ✓ coroplast-4mm (SUBSTRATES, 1 supplier)");

  // 3. 3M IJ180 cast vinyl — premium with stale price
  await db.masterMaterial.create({
    data: {
      slug: "vinyl-3m-ij180-cast",
      name: "3M IJ180mC-10 Cast Vinyl",
      sku: "VIN-3M-IJ180",
      category: "VINYL",
      subcategory: "Cast",
      widthIn: new Prisma.Decimal(54),
      rollLengthFt: new Prisma.Decimal(50),
      thicknessMil: new Prisma.Decimal(2),
      finish: "GLOSS",
      usage: "OUTDOOR",
      durabilityYears: 7,
      adhesiveType: "permanent",
      recyclable: false,
      opacityPct: 100,
      defaultCost: 850,
      defaultUnit: "sq_ft",
      defaultMarkupPct: new Prisma.Decimal(50),
      wasteFactorPct: new Prisma.Decimal(12),
      imageUrl: "https://images.unsplash.com/photo-1559070081-648fb04b04eb?w=800&h=600&fit=crop",
      equipmentCompatibility: ["wide_format_printer", "vinyl_cutter", "laminator"],
      compatibleProductSlugs: ["window-decal-printed", "vehicle-wraps"],
      status: "ACTIVE",
      tags: ["premium", "vehicle-wrap", "decal", "long-life"],
      createdById: adminId,
      suppliers: {
        create: [
          {
            supplierName: "3M Direct",
            supplierSku: "3M-IJ180-mC10",
            leadTimeDays: 10,
            moq: new Prisma.Decimal(50),
            costAtSupplier: 820,
            // Stale: > 90 days ago
            lastPriceUpdate: new Date(Date.now() - 120 * day),
            portalUrl: "https://3m.com/graphics",
            isPrimary: true,
            notes: "Direct from 3M — long lead, refresh quote quarterly",
          },
        ],
      },
    },
  });
  console.log("  ✓ vinyl-3m-ij180-cast (VINYL/Cast, stale price)");

  // 4. Eco-solvent ink — color swatches
  await db.masterMaterial.create({
    data: {
      slug: "ink-eco-solvent-cmyk",
      name: "Eco-solvent Ink (CMYK)",
      sku: "INK-ES-CMYK",
      category: "INKS",
      subcategory: "Eco-solvent",
      defaultCost: 4500, // $45/L equivalent in cents (per liter); display as per_l
      defaultUnit: "liter",
      defaultMarkupPct: new Prisma.Decimal(40),
      wasteFactorPct: new Prisma.Decimal(2),
      minOrderQty: new Prisma.Decimal(1),
      usage: "BOTH",
      recyclable: false,
      equipmentCompatibility: ["wide_format_printer"],
      compatibleProductSlugs: ["vinyl-banner-13oz", "window-decal-printed", "corrugated-yard-sign"],
      status: "ACTIVE",
      tags: ["consumable", "eco-solvent"],
      createdById: adminId,
      suppliers: {
        create: [
          {
            supplierName: "Roland DGA",
            supplierSku: "ROL-ECO-CMYK",
            leadTimeDays: 3,
            costAtSupplier: 4200,
            lastPriceUpdate: new Date(Date.now() - 7 * day),
            isPrimary: true,
            portalUrl: "https://rolanddga.com",
          },
        ],
      },
      swatches: {
        create: [
          { colorName: "Cyan",     colorKey: "cyan",    hex: "#00AEEF", skuSuffix: "-C", sortOrder: 0 },
          { colorName: "Magenta",  colorKey: "magenta", hex: "#EC008C", skuSuffix: "-M", sortOrder: 1 },
          { colorName: "Yellow",   colorKey: "yellow",  hex: "#FFF200", skuSuffix: "-Y", sortOrder: 2 },
          { colorName: "Black",    colorKey: "black",   hex: "#000000", skuSuffix: "-K", sortOrder: 3 },
        ],
      },
    },
  });
  console.log("  ✓ ink-eco-solvent-cmyk (INKS, 4 swatches)");

  // 5. T-shirt blank
  await db.masterMaterial.create({
    data: {
      slug: "blank-bc3001cvc",
      name: "Bella + Canvas 3001CVC T-Shirt",
      sku: "BLK-BC3001CVC",
      category: "BLANKS",
      subcategory: "T-shirts",
      gsm: 145,
      finish: "MATTE",
      usage: "INDOOR",
      durabilityYears: null,
      recyclable: true,
      defaultCost: 575,
      defaultUnit: "each",
      defaultMarkupPct: new Prisma.Decimal(120),
      wasteFactorPct: new Prisma.Decimal(2),
      minOrderQty: new Prisma.Decimal(1),
      imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop",
      equipmentCompatibility: ["dtg_printer", "screen_printing_press", "heat_press"],
      compatibleProductSlugs: ["custom-tshirt-dtg"],
      status: "ACTIVE",
      tags: ["apparel", "blank", "popular"],
      createdById: adminId,
      suppliers: {
        create: [
          {
            supplierName: "S&S Activewear",
            supplierSku: "SS-3001CVC",
            leadTimeDays: 2,
            costAtSupplier: 525,
            lastPriceUpdate: new Date(Date.now() - 14 * day),
            isPrimary: true,
            portalUrl: "https://ssactivewear.com",
          },
        ],
      },
    },
  });
  console.log("  ✓ blank-bc3001cvc (BLANKS, 1 supplier)");

  // 6. Brass grommets — DISCONTINUED
  await db.masterMaterial.create({
    data: {
      slug: "grommet-brass-no2",
      name: "Brass Grommets #2 (legacy)",
      sku: "HW-GROM-BR-2",
      category: "HARDWARE",
      subcategory: "Grommets",
      defaultCost: 8,
      defaultUnit: "each",
      defaultMarkupPct: new Prisma.Decimal(100),
      wasteFactorPct: new Prisma.Decimal(0),
      status: "DISCONTINUED",
      internalNotes: "Replaced by brass #4 in 2025-Q4. Kept for historical orders.",
      tags: ["banner", "hardware", "legacy"],
      createdById: adminId,
    },
  });
  console.log("  ✓ grommet-brass-no2 (HARDWARE, DISCONTINUED)");
}

async function summary() {
  const [materials, suppliers, swatches] = await Promise.all([
    db.masterMaterial.count(),
    db.masterMaterialSupplier.count(),
    db.masterMaterialColorSwatch.count(),
  ]);
  console.log("\n── Summary ──");
  console.log(`  master materials: ${materials}, suppliers: ${suppliers}, swatches: ${swatches}`);
}

async function main() {
  const adminId = await pickAdminId();
  await seed(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
