import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const adminEmail = "admin@flowtora.local";
  const adminPassword = "flowtora-dev";
  const adminHash = await bcrypt.hash(adminPassword, 12);

  await db.user.upsert({
    where: { email: adminEmail },
    update: { platformRole: "SUPER_ADMIN" },
    create: {
      email: adminEmail,
      name: "Platform Admin",
      passwordHash: adminHash,
      platformRole: "SUPER_ADMIN",
      emailVerified: new Date(),
    },
  });

  // Fully-onboarded demo tenant.
  const ownerHash = await bcrypt.hash("flowtora-dev", 12);
  const owner = await db.user.upsert({
    where: { email: "owner@demoshop.local" },
    update: {},
    create: {
      email: "owner@demoshop.local",
      name: "Demo Owner",
      passwordHash: ownerHash,
      emailVerified: new Date(),
    },
  });
  const tenant = await db.tenant.upsert({
    where: { slug: "demo-shop" },
    update: {},
    create: {
      slug: "demo-shop",
      name: "Demo Sign Shop",
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      timezone: "America/New_York",
      currency: "USD",
      businessType: "SIGN_SHOP",
      services: ["Vinyl banners", "Channel letters", "Vehicle wraps"],
      onboardingCompletedAt: new Date(),
    },
  });
  await db.membership.upsert({
    where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
    update: {},
    create: { userId: owner.id, tenantId: tenant.id, role: "OWNER" },
  });

  // Sample catalog for the demo tenant — idempotent-ish: only seed if empty.
  const demoProductCount = await db.product.count({ where: { tenantId: tenant.id } });
  if (demoProductCount === 0) {
    await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Vinyl banner",
        description: "13oz scrim vinyl, full-color print, hemmed with grommets every 2ft.",
        category: "Banners",
        sku: "BAN-VINYL-13",
        pricingModel: "PER_SQFT",
        basePrice: "8.50",
        cost: "2.75",
        unit: "sq ft",
        optionGroups: {
          create: [
            {
              name: "Finishing",
              required: true,
              sortOrder: 1,
              options: {
                create: [
                  { label: "Hems + grommets", priceAdjustment: "0", sortOrder: 1 },
                  { label: "Pole pockets", priceAdjustment: "25", sortOrder: 2 },
                  { label: "Velcro edges", priceAdjustment: "40", sortOrder: 3 },
                ],
              },
            },
            {
              name: "Sides",
              required: false,
              sortOrder: 2,
              options: {
                create: [
                  { label: "Single-sided", priceAdjustment: "0", sortOrder: 1 },
                  { label: "Double-sided (block-out)", priceAdjustment: "80", sortOrder: 2 },
                ],
              },
            },
          ],
        },
      },
    });

    await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Coroplast yard sign",
        description: "4mm corrugated plastic, full-color, includes H-stake.",
        category: "Yard signs",
        sku: "YS-CORO-18x24",
        pricingModel: "PER_UNIT",
        basePrice: "18.00",
        cost: "4.50",
        unit: "each",
        optionGroups: {
          create: [
            {
              name: "Size",
              required: true,
              sortOrder: 1,
              options: {
                create: [
                  { label: "18\" × 24\"", priceAdjustment: "0", sortOrder: 1 },
                  { label: "24\" × 36\"", priceAdjustment: "12", sortOrder: 2 },
                ],
              },
            },
          ],
        },
      },
    });

    await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Vehicle wrap — partial",
        description: "3M IJ180 cast vinyl, installed. Covers ~60% of vehicle surface.",
        category: "Vehicle graphics",
        pricingModel: "CUSTOM_QUOTE",
        basePrice: "0",
        unit: "job",
      },
    });

    await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Installation labor",
        description: "On-site installation crew. Billed in 30-min increments.",
        category: "Labor",
        sku: "LAB-INSTALL",
        pricingModel: "LABOR_HOURLY",
        basePrice: "95.00",
        cost: "42.00",
        unit: "hour",
        taxable: false,
      },
    });

    await db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Channel letter — 18\" aluminum",
        description: "Fabricated aluminum channel letter with LED illumination. Sold per letter.",
        category: "Channel letters",
        sku: "CL-18-ALU",
        pricingModel: "PER_LINEAR_FT",
        basePrice: "145.00",
        cost: "58.00",
        unit: "ft",
        optionGroups: {
          create: [
            {
              name: "Face color",
              required: true,
              sortOrder: 1,
              options: {
                create: [
                  { label: "White acrylic", priceAdjustment: "0", sortOrder: 1 },
                  { label: "Translucent vinyl overlay", priceAdjustment: "22", sortOrder: 2 },
                ],
              },
            },
          ],
        },
      },
    });
  }

  // Fresh tenant for exercising the onboarding wizard.
  const freshOwner = await db.user.upsert({
    where: { email: "owner@freshshop.local" },
    update: {},
    create: {
      email: "owner@freshshop.local",
      name: "Fresh Owner",
      passwordHash: ownerHash,
      emailVerified: new Date(),
    },
  });
  const fresh = await db.tenant.upsert({
    where: { slug: "fresh-shop" },
    update: {},
    create: {
      slug: "fresh-shop",
      name: "Fresh Sign Shop",
      status: "TRIAL",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  await db.membership.upsert({
    where: { userId_tenantId: { userId: freshOwner.id, tenantId: fresh.id } },
    update: {},
    create: { userId: freshOwner.id, tenantId: fresh.id, role: "OWNER" },
  });

  console.log("Seed complete.");
  console.log("─────────────────────────────────────────────");
  console.log(`Platform admin: ${adminEmail} / ${adminPassword}`);
  console.log("Demo (onboarded): owner@demoshop.local / flowtora-dev → /t/demo-shop");
  console.log("Fresh (run wizard): owner@freshshop.local / flowtora-dev → /t/fresh-shop");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
