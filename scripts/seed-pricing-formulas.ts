// Page 28 — seed sample Pricing Formulas matching the spec examples.
// Idempotent.

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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
  const existing = await db.pricingFormula.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} formulas — skipping.`);
    return;
  }
  const day = 86_400_000;

  // 1. Banner SqFt — full BoM-style formula
  await db.pricingFormula.create({
    data: {
      slug: "banner-sqft",
      name: "Banner SqFt (full)",
      category: "SQ_FT",
      description: "Standard banner pricing: cost × area × waste + finishing + setup × (1 + markup).",
      summary: "(materialCost × area × wasteFactor + finishingCost × perimeter + setupFee + laborRate × runHours) × (1 + markup)",
      expression: `
const a = area(width, height);
const p = perimeter(width, height);
const finishing = perimeter_ft_cost * p;
const labor = laborRate * runHours;
const subtotal = (materialCost * a * wasteFactor) + finishing + setupFee + labor;
return Math.max(minimumCharge, subtotal * (1 + markup));
      `.trim(),
      variables: [
        { key: "width",      type: "number", label: "Width (in)",  default: 48, min: 1, max: 360 },
        { key: "height",     type: "number", label: "Height (in)", default: 24, min: 1, max: 360 },
        { key: "runHours",   type: "number", label: "Run hours",   default: 0.25, min: 0 },
      ] as Prisma.InputJsonValue,
      constants: [
        { key: "materialCost",      value: 1.65, label: "Material cost / sq ft" },
        { key: "wasteFactor",       value: 1.08, label: "Waste factor (1.08 = 8%)" },
        { key: "perimeter_ft_cost", value: 0.50, label: "Finishing cost / linear ft" },
        { key: "setupFee",          value: 12.00, label: "Setup fee" },
        { key: "laborRate",         value: 35.00, label: "Labor rate / hour" },
        { key: "markup",            value: 0.60,  label: "Markup (60%)" },
        { key: "minimumCharge",     value: 29.00, label: "Minimum charge" },
      ] as Prisma.InputJsonValue,
      status: "PUBLISHED",
      tags: ["banner", "wide-format", "popular"],
      publishedAt: new Date(Date.now() - 30 * day),
      createdById: adminId,
    },
  });
  console.log("  ✓ banner-sqft (PUBLISHED)");

  // 2. Tiered quantity (business cards)
  await db.pricingFormula.create({
    data: {
      slug: "tiered-quantity",
      name: "Tiered Quantity",
      category: "TIERED_QTY",
      description: "Quantity-tier price breaks. Looks up unit price from the tier table, multiplies by qty, adds setup.",
      summary: "tier(qty) * qty + setupFee",
      expression: `tier(qty) * qty + setupFee`,
      variables: [
        { key: "qty", type: "number", label: "Quantity", default: 250, min: 1 },
      ] as Prisma.InputJsonValue,
      constants: [
        { key: "setupFee", value: 15.00, label: "Setup fee" },
      ] as Prisma.InputJsonValue,
      tierTable: [
        { qty: 100,  unitPrice: 0.45 },
        { qty: 250,  unitPrice: 0.32 },
        { qty: 500,  unitPrice: 0.22 },
        { qty: 1000, unitPrice: 0.16 },
        { qty: 2500, unitPrice: 0.12 },
      ] as Prisma.InputJsonValue,
      status: "PUBLISHED",
      tags: ["business-cards", "trade-print", "popular"],
      publishedAt: new Date(Date.now() - 20 * day),
      createdById: adminId,
    },
  });
  console.log("  ✓ tiered-quantity (PUBLISHED)");

  // 3. Apparel screen print
  await db.pricingFormula.create({
    data: {
      slug: "apparel-screen-print",
      name: "Apparel Screen Print",
      category: "SETUP_RUN",
      description: "Screen-print pricing: blank cost + ink × colors + per-piece labor, all × qty × markup, plus screen setup × colors.",
      summary: "(blankCost + colors × inkCost + laborPerPiece) × qty × (1 + markup) + screenSetup × colors",
      expression: `
const perPiece = blankCost + (colors * inkCost) + laborPerPiece;
return perPiece * qty * (1 + markup) + screenSetupFee * colors;
      `.trim(),
      variables: [
        { key: "qty",    type: "number", label: "Quantity",          default: 50, min: 1 },
        { key: "colors", type: "number", label: "Number of colors",  default: 2, min: 1, max: 8 },
      ] as Prisma.InputJsonValue,
      constants: [
        { key: "blankCost",      value: 5.75, label: "Blank cost / piece" },
        { key: "inkCost",        value: 0.60, label: "Ink cost / piece / color" },
        { key: "laborPerPiece",  value: 1.20, label: "Labor / piece" },
        { key: "markup",         value: 1.20, label: "Markup (120%)" },
        { key: "screenSetupFee", value: 25.00, label: "Screen setup fee / color" },
      ] as Prisma.InputJsonValue,
      status: "PUBLISHED",
      tags: ["apparel", "screen-print", "popular"],
      publishedAt: new Date(Date.now() - 14 * day),
      createdById: adminId,
    },
  });
  console.log("  ✓ apparel-screen-print (PUBLISHED)");

  // 4. Hourly install (simple, DRAFT)
  await db.pricingFormula.create({
    data: {
      slug: "install-hourly",
      name: "Hourly install",
      category: "INSTALL_HOURLY",
      description: "Flat-rate hourly install with travel surcharge above N miles.",
      summary: "max(minHours, hours) × hourlyRate × (1 + markup) + ifElse(miles > minMiles, (miles − minMiles) × mileageRate, 0)",
      expression: `
const billedHours = Math.max(minHours, hours);
const travel = ifElse(miles > minMiles, (miles - minMiles) * mileageRate, 0);
return billedHours * hourlyRate * (1 + markup) + travel;
      `.trim(),
      variables: [
        { key: "hours", type: "number", label: "Estimated hours", default: 4, min: 0.5, step: 0.5 },
        { key: "miles", type: "number", label: "Round-trip miles", default: 25, min: 0 },
      ] as Prisma.InputJsonValue,
      constants: [
        { key: "hourlyRate",   value: 95.00, label: "Hourly rate" },
        { key: "markup",       value: 0.30,  label: "Markup (30%)" },
        { key: "minHours",     value: 2,     label: "Minimum billable hours" },
        { key: "minMiles",     value: 30,    label: "Free travel radius" },
        { key: "mileageRate",  value: 0.85,  label: "Per-mile surcharge" },
      ] as Prisma.InputJsonValue,
      status: "DRAFT",
      tags: ["install", "service", "labor"],
      createdById: adminId,
    },
  });
  console.log("  ✓ install-hourly (DRAFT)");
}

async function summary() {
  const [formulas, versions] = await Promise.all([
    db.pricingFormula.count(),
    db.pricingFormulaVersion.count(),
  ]);
  console.log("\n── Summary ──");
  console.log(`  pricing formulas: ${formulas}, versions: ${versions}`);
}

async function main() {
  const adminId = await pickAdminId();
  await seed(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
