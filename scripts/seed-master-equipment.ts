// Page 27 — seed demo Master Equipment Templates so the new pages
// render real numbers. Idempotent — skips if seeded equipment exists.

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
  const existing = await db.masterEquipment.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} master equipment — skipping.`);
    return;
  }

  // Look up the seeded materials so we can wire compatibility links.
  const [vinyl13oz, ij180, coroplast, inkCMYK, blank] = await Promise.all([
    db.masterMaterial.findUnique({ where: { slug: "vinyl-13oz-scrim" }, select: { id: true } }),
    db.masterMaterial.findUnique({ where: { slug: "vinyl-3m-ij180-cast" }, select: { id: true } }),
    db.masterMaterial.findUnique({ where: { slug: "coroplast-4mm" }, select: { id: true } }),
    db.masterMaterial.findUnique({ where: { slug: "ink-eco-solvent-cmyk" }, select: { id: true } }),
    db.masterMaterial.findUnique({ where: { slug: "blank-bc3001cvc" }, select: { id: true } }),
  ]);

  // 1. Roland TrueVIS VG3 — fully fleshed
  const trueVisMatLinks: Prisma.MasterEquipmentMaterialCreateWithoutEquipmentInput[] = [];
  if (vinyl13oz)  trueVisMatLinks.push({ material: { connect: { id: vinyl13oz.id } }, recommended: true,  notes: "Standard banner profile included" });
  if (ij180)      trueVisMatLinks.push({ material: { connect: { id: ij180.id } },     recommended: true,  notes: "3M tested + ICC profiles supplied" });
  if (inkCMYK)    trueVisMatLinks.push({ material: { connect: { id: inkCMYK.id } },   recommended: false, notes: "TR2 eco-solvent ink set" });

  await db.masterEquipment.create({
    data: {
      slug: "roland-truevis-vg3-540",
      brand: "Roland",
      model: "TrueVIS VG3-540",
      displayName: "Roland TrueVIS VG3-540",
      category: "PRINTER",
      maxWidthIn: new Prisma.Decimal(54),
      maxLengthFt: null,
      colorModes: ["CMYK", "CMYKW"],
      inkTypes: ["eco-solvent"],
      resolution: "1200 dpi",
      ratedSpeed: new Prisma.Decimal(180),
      speedUnit: "sq_ft_per_hour",
      warmupMinutes: 8,
      changeoverMinutes: 15,
      defaultUptimePct: new Prisma.Decimal(82),
      defaultWastePct: new Prisma.Decimal(6),
      purchaseCostMinor: 3500000,           // $35,000
      depreciationYears: 7,
      hourlyOperatingCostMinor: 1850,       // $18.50/hr (energy + ink + labor)
      imageUrl: "https://images.unsplash.com/photo-1581090464777-f3220bbe1b8b?w=800&h=600&fit=crop",
      manualUrl: "https://www.rolanddga.com/support",
      status: "ACTIVE",
      tags: ["wide-format", "popular", "eco-solvent"],
      createdById: adminId,
      materials: { create: trueVisMatLinks },
      maintenance: {
        create: [
          { taskName: "Capping station clean",  frequency: "DAILY",   estimatedMinutes: 5,
            toolsNeeded: ["lint-free wipes", "distilled water"], sortOrder: 0,
            description: "Wipe capping station to prevent ink dry-out." },
          { taskName: "Print head check",       frequency: "DAILY",   estimatedMinutes: 3,
            toolsNeeded: ["test pattern"], sortOrder: 1,
            description: "Run nozzle test, address banding before first job." },
          { taskName: "Wiper blade replacement", frequency: "MONTHLY", estimatedMinutes: 10,
            toolsNeeded: ["wiper blade kit"], sortOrder: 2,
            description: "Swap rubber wiper to maintain head cleaning quality." },
          { taskName: "Full deep clean",         frequency: "QUARTERLY", estimatedMinutes: 45,
            toolsNeeded: ["cleaning solution", "service mode access"], sortOrder: 3,
            description: "Roland service-mode deep clean cycle." },
        ],
      },
    },
  });
  console.log("  ✓ roland-truevis-vg3-540 (PRINTER, 3 materials, 4 tasks)");

  // 2. HP Latex 700
  const latexLinks: Prisma.MasterEquipmentMaterialCreateWithoutEquipmentInput[] = [];
  if (vinyl13oz) latexLinks.push({ material: { connect: { id: vinyl13oz.id } }, recommended: true });
  if (ij180)     latexLinks.push({ material: { connect: { id: ij180.id } },     recommended: false, notes: "Latex prints adhere well; check ICC" });

  await db.masterEquipment.create({
    data: {
      slug: "hp-latex-700",
      brand: "HP",
      model: "Latex 700",
      category: "PRINTER",
      maxWidthIn: new Prisma.Decimal(64),
      colorModes: ["CMYK", "CMYK + White"],
      inkTypes: ["latex"],
      resolution: "1200 dpi",
      ratedSpeed: new Prisma.Decimal(195),
      speedUnit: "sq_ft_per_hour",
      warmupMinutes: 12,
      changeoverMinutes: 12,
      defaultUptimePct: new Prisma.Decimal(85),
      defaultWastePct: new Prisma.Decimal(4),
      purchaseCostMinor: 2900000,
      depreciationYears: 7,
      hourlyOperatingCostMinor: 2100,
      imageUrl: "https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?w=800&h=600&fit=crop",
      status: "ACTIVE",
      tags: ["wide-format", "latex", "low-VOC"],
      createdById: adminId,
      materials: { create: latexLinks },
      maintenance: {
        create: [
          { taskName: "Daily housekeeping",  frequency: "DAILY",   estimatedMinutes: 8,  sortOrder: 0 },
          { taskName: "Lubricate carriage rail", frequency: "MONTHLY", estimatedMinutes: 15, sortOrder: 1,
            toolsNeeded: ["HP-specified grease"] },
          { taskName: "Annual service",      frequency: "ANNUALLY", estimatedMinutes: 240, sortOrder: 2,
            description: "On-site service from HP partner.", notes: "Schedule 6 weeks ahead." },
        ],
      },
    },
  });
  console.log("  ✓ hp-latex-700 (PRINTER, 2 materials, 3 tasks)");

  // 3. Graphtec FC9000-160 cutter
  const cutterLinks: Prisma.MasterEquipmentMaterialCreateWithoutEquipmentInput[] = [];
  if (vinyl13oz) cutterLinks.push({ material: { connect: { id: vinyl13oz.id } } });
  if (ij180)     cutterLinks.push({ material: { connect: { id: ij180.id } } });
  if (coroplast) cutterLinks.push({ material: { connect: { id: coroplast.id } } });

  await db.masterEquipment.create({
    data: {
      slug: "graphtec-fc9000-160",
      brand: "Graphtec",
      model: "FC9000-160",
      category: "CUTTER",
      maxWidthIn: new Prisma.Decimal(64),
      colorModes: [],
      inkTypes: [],
      ratedSpeed: new Prisma.Decimal(58),
      speedUnit: "in_per_second",
      warmupMinutes: 0,
      changeoverMinutes: 5,
      defaultUptimePct: new Prisma.Decimal(90),
      defaultWastePct: new Prisma.Decimal(3),
      purchaseCostMinor: 750000,
      depreciationYears: 8,
      hourlyOperatingCostMinor: 750,
      imageUrl: "https://images.unsplash.com/photo-1559070081-648fb04b04eb?w=800&h=600&fit=crop",
      status: "ACTIVE",
      tags: ["cutter", "vinyl"],
      createdById: adminId,
      materials: { create: cutterLinks },
      maintenance: {
        create: [
          { taskName: "Blade swap", frequency: "WEEKLY", estimatedMinutes: 5, sortOrder: 0,
            toolsNeeded: ["blade holder", "fresh blade"], description: "Swap dull blade — extend cut quality." },
          { taskName: "Cutting strip inspection", frequency: "MONTHLY", estimatedMinutes: 5, sortOrder: 1 },
        ],
      },
    },
  });
  console.log("  ✓ graphtec-fc9000-160 (CUTTER, 3 materials, 2 tasks)");

  // 4. ROQ NextGen screen press
  await db.masterEquipment.create({
    data: {
      slug: "roq-nextgen-press",
      brand: "ROQ",
      model: "NextGen 12-station",
      category: "PRESS",
      colorModes: [],
      inkTypes: ["plastisol", "water-based"],
      ratedSpeed: new Prisma.Decimal(900),
      speedUnit: "prints_per_hour",
      warmupMinutes: 20,
      changeoverMinutes: 30,
      defaultUptimePct: new Prisma.Decimal(75),
      defaultWastePct: new Prisma.Decimal(8),
      purchaseCostMinor: 6500000,
      depreciationYears: 10,
      hourlyOperatingCostMinor: 4200,
      imageUrl: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=800&h=600&fit=crop",
      status: "ACTIVE",
      tags: ["screen-print", "apparel"],
      createdById: adminId,
      maintenance: {
        create: [
          { taskName: "Screen rack cleaning",  frequency: "DAILY",   estimatedMinutes: 30, sortOrder: 0 },
          { taskName: "Pneumatic seal check",  frequency: "MONTHLY", estimatedMinutes: 20, sortOrder: 1 },
          { taskName: "Conveyor calibration",  frequency: "QUARTERLY", estimatedMinutes: 45, sortOrder: 2 },
        ],
      },
    },
  });
  console.log("  ✓ roq-nextgen-press (PRESS, 0 materials, 3 tasks)");

  // 5. Brother GTX Pro Bulk DTG
  const dtgLinks: Prisma.MasterEquipmentMaterialCreateWithoutEquipmentInput[] = [];
  if (blank) dtgLinks.push({ material: { connect: { id: blank.id } }, recommended: true, notes: "Optimized for ringspun cotton" });

  await db.masterEquipment.create({
    data: {
      slug: "brother-gtx-pro-bulk",
      brand: "Brother",
      model: "GTX Pro Bulk",
      category: "PRINTER",
      maxWidthIn: new Prisma.Decimal(16),
      colorModes: ["CMYK + White"],
      inkTypes: ["dtg-pigment"],
      resolution: "1200 dpi",
      ratedSpeed: new Prisma.Decimal(45),
      speedUnit: "prints_per_hour",
      warmupMinutes: 15,
      changeoverMinutes: 6,
      defaultUptimePct: new Prisma.Decimal(80),
      defaultWastePct: new Prisma.Decimal(7),
      purchaseCostMinor: 2500000,
      depreciationYears: 6,
      hourlyOperatingCostMinor: 1450,
      imageUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop",
      status: "ACTIVE",
      tags: ["dtg", "apparel", "popular"],
      createdById: adminId,
      materials: { create: dtgLinks },
      maintenance: {
        create: [
          { taskName: "Auto-clean cycle", frequency: "DAILY", estimatedMinutes: 5, sortOrder: 0,
            description: "Built-in cleaning cycle — runs at startup." },
          { taskName: "Manual head wipe", frequency: "DAILY", estimatedMinutes: 5, sortOrder: 1,
            toolsNeeded: ["lint-free swabs", "Brother cleaner"] },
          { taskName: "Pre-treatment unit clean", frequency: "WEEKLY", estimatedMinutes: 20, sortOrder: 2 },
        ],
      },
    },
  });
  console.log("  ✓ brother-gtx-pro-bulk (PRINTER, 1 material, 3 tasks)");

  // 6. Trotec Speedy 400 — DISCONTINUED demo
  await db.masterEquipment.create({
    data: {
      slug: "trotec-speedy-400-legacy",
      brand: "Trotec",
      model: "Speedy 400 (legacy)",
      category: "LASER",
      maxWidthIn: new Prisma.Decimal(40),
      maxLengthFt: new Prisma.Decimal(2),
      colorModes: [],
      inkTypes: [],
      resolution: "1000 dpi",
      ratedSpeed: new Prisma.Decimal(100),
      speedUnit: "in_per_second",
      warmupMinutes: 5,
      changeoverMinutes: 10,
      defaultUptimePct: new Prisma.Decimal(75),
      defaultWastePct: new Prisma.Decimal(2),
      purchaseCostMinor: 4500000,
      depreciationYears: 10,
      hourlyOperatingCostMinor: 1100,
      status: "DISCONTINUED",
      internalNotes: "Replaced by Speedy 400 flexx in 2025. Kept for reference.",
      tags: ["laser", "legacy"],
      createdById: adminId,
    },
  });
  console.log("  ✓ trotec-speedy-400-legacy (LASER, DISCONTINUED)");
}

async function summary() {
  const [equipment, materialLinks, tasks] = await Promise.all([
    db.masterEquipment.count(),
    db.masterEquipmentMaterial.count(),
    db.masterEquipmentMaintenanceTask.count(),
  ]);
  console.log("\n── Summary ──");
  console.log(`  master equipment: ${equipment}, material compat: ${materialLinks}, maintenance tasks: ${tasks}`);
}

async function main() {
  const adminId = await pickAdminId();
  await seed(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
