"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// Phase 4 Slice C — sample / demo data seeder.
//
// Motivation — a first-time user stares at nine empty list pages and
// wonders what good the product is. Giving them a "Load sample data"
// option lets them click through customers, quotes, orders, invoices
// and SEE the shape of a real shop before they've typed anything in.
//
// Safety constraints:
//   • Can only be loaded once per tenant. The `sampleDataLoadedAt` column
//     guards re-seeding — we don't want sample data stacking up.
//   • Every sample row carries an identifier marker ("demo" tag on
//     customers; "DEMO-" SKU prefix on products) so `clearSampleData`
//     can surgically remove them without touching real data.
//   • Clearing is allowed even after real data has mixed in — we only
//     remove rows we can prove came from the seeder, never by date/time.
//
// The seed covers:
//   • 5 customers spanning the pipeline (NEW_LEAD → WON + 1 LOST)
//   • 6 products across the main pricing models
//   • 3 quotes (DRAFT / SENT / APPROVED) with line items
//   • 1 order converted from the approved quote (IN_PRODUCTION)
//   • 1 invoice issued against the order (SENT, open)
//
// All totals are hand-computed so the demo numbers look plausible.

const DEMO_TAG = "demo";
const DEMO_SKU_PREFIX = "DEMO-";

export async function loadSampleData(slug: string, _formData?: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const tenant = ctx.tenant;

  if (tenant.sampleDataLoadedAt) {
    redirect(`/t/${slug}/onboarding/sample?error=already_loaded`);
  }

  await loadSampleDataForTenant(tenant, ctx.userId);
  await logAudit({
    tenantId: tenant.id,
    userId:   ctx.userId,
    action:   "onboarding.sample.load",
  });
  revalidatePath(`/t/${slug}`, "layout");
  redirect(`/t/${slug}/onboarding/sample?ok=1`);
}

// Pure seeder: creates demo products, customers, quotes, an order, and an
// invoice, and stamps `sampleDataLoadedAt`. Callers own auth, audit, and
// navigation. Used by both the tenant-facing onboarding action above and
// the platform-side sandbox reset.
export async function loadSampleDataForTenant(
  tenant: { id: string; quoteNumberPrefix: string; orderNumberPrefix: string; invoiceNumberPrefix: string; defaultTaxRate: unknown },
  actorUserId: string,
) {
  // Primary location (for branch-aware shops). Null is fine for legacy.
  const primaryLocation = await db.location.findFirst({
    where: { tenantId: tenant.id, isDefault: true },
    select: { id: true },
  });
  const locationId = primaryLocation?.id ?? null;
  const ctx = { userId: actorUserId };

  // ── Products ──
  const products = await db.$transaction([
    db.product.create({
      data: {
        tenantId: tenant.id,
        name: "3' × 6' Vinyl Banner",
        sku: `${DEMO_SKU_PREFIX}BNR-36`,
        category: "Banners",
        description: "Standard 13oz vinyl banner, grommets included.",
        pricingModel: "FIXED",
        basePrice: 85,
        cost: 28,
        unit: "each",
      },
    }),
    db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Full-color Business Cards",
        sku: `${DEMO_SKU_PREFIX}BC-500`,
        category: "Print",
        description: "500 cards, 16pt matte, full color both sides.",
        pricingModel: "PER_UNIT",
        basePrice: 0.12,
        cost: 0.04,
        unit: "card",
      },
    }),
    db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Wall Graphics",
        sku: `${DEMO_SKU_PREFIX}WG-SF`,
        category: "Large format",
        description: "Wall decals, wrap-grade vinyl, priced per square foot.",
        pricingModel: "PER_SQFT",
        basePrice: 12,
        cost: 4,
        unit: "sq ft",
        wasteFactorPct: 15,
      },
    }),
    db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Channel Letter Sign (installed)",
        sku: `${DEMO_SKU_PREFIX}CL-INST`,
        category: "Signage",
        description: "Aluminum channel letters with LED illumination. Install included.",
        pricingModel: "CUSTOM_QUOTE",
        basePrice: 0,
        cost: 0,
      },
    }),
    db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Design Hour",
        sku: `${DEMO_SKU_PREFIX}DESIGN-HR`,
        category: "Services",
        description: "Graphic design time — layout, proofing, revisions.",
        pricingModel: "LABOR_HOURLY",
        basePrice: 75,
        cost: 40,
        unit: "hour",
      },
    }),
    db.product.create({
      data: {
        tenantId: tenant.id,
        name: "Yard Sign (24 × 18)",
        sku: `${DEMO_SKU_PREFIX}YS-2418`,
        category: "Yard signs",
        description: "Corrugated plastic, 4mm, single-sided. H-stake included.",
        pricingModel: "FIXED",
        basePrice: 22,
        cost: 7,
        unit: "each",
      },
    }),
  ]);

  // Pull typed refs for the ones we'll cite below
  const [bannerProduct, bcProduct, wallGrProduct] = products;

  // ── Customers ──
  const [winery, firm, realtor, restaurant, gym] = await db.$transaction([
    db.customer.create({
      data: {
        tenantId: tenant.id,
        locationId,
        kind: "BUSINESS",
        name: "Ridgecrest Winery",
        stage: "WON",
        status: "ACTIVE",
        source: "referral",
        tags: [DEMO_TAG],
        email: "ops@ridgecrest.example",
        phone: "(555) 201-4412",
        billingCity: "Napa",
        billingRegion: "CA",
        billingCountry: "US",
        estimatedValue: 12800,
        closeProbability: 100,
        notes: "Annual tasting-room refresh. Repeat client since 2022.",
      },
    }),
    db.customer.create({
      data: {
        tenantId: tenant.id,
        locationId,
        kind: "BUSINESS",
        name: "Harrison & Lowe Law Firm",
        stage: "QUOTED",
        status: "ACTIVE",
        source: "website",
        tags: [DEMO_TAG],
        email: "admin@hlowelaw.example",
        phone: "(555) 318-0907",
        estimatedValue: 4400,
        closeProbability: 60,
      },
    }),
    db.customer.create({
      data: {
        tenantId: tenant.id,
        locationId,
        kind: "BUSINESS",
        name: "Lakeside Realty",
        stage: "NEGOTIATING",
        status: "ACTIVE",
        source: "cold-call",
        tags: [DEMO_TAG],
        email: "marketing@lakesiderealty.example",
        estimatedValue: 2200,
        closeProbability: 40,
      },
    }),
    db.customer.create({
      data: {
        tenantId: tenant.id,
        locationId,
        kind: "BUSINESS",
        name: "Lucia's Trattoria",
        stage: "NEW_LEAD",
        status: "ACTIVE",
        source: "walk-in",
        tags: [DEMO_TAG],
        phone: "(555) 663-1100",
        estimatedValue: 950,
        closeProbability: 25,
        notes: "Owner stopped by asking about an A-frame sidewalk sign.",
      },
    }),
    db.customer.create({
      data: {
        tenantId: tenant.id,
        locationId,
        kind: "BUSINESS",
        name: "Peak Fitness",
        stage: "LOST",
        status: "ACTIVE",
        source: "referral",
        tags: [DEMO_TAG],
        email: "info@peakfit.example",
        lostReason: "Went with a cheaper competitor.",
        estimatedValue: 0,
        closeProbability: 0,
      },
    }),
  ]);

  // ── Quotes ──
  // Quote #1 — Winery, APPROVED (feeds the order/invoice below).
  const wineryQuote = await db.quote.create({
    data: {
      tenantId: tenant.id,
      customerId: winery.id,
      locationId,
      number: `${tenant.quoteNumberPrefix}DEMO-001`,
      status: "APPROVED",
      issuedAt: daysAgo(21),
      sentAt: daysAgo(21),
      viewedAt: daysAgo(20),
      approvedAt: daysAgo(18),
      subtotal: 1245,
      taxRate: Number(tenant.defaultTaxRate) || 0.0875,
      taxAmount: 108.94,
      total: 1353.94,
      createdBy: ctx.userId,
      customerNote: "Four banners + 500 sq ft of wall graphics for the new tasting-room wing.",
      items: {
        create: [
          {
            productId: bannerProduct.id,
            name: bannerProduct.name,
            pricingModel: "FIXED",
            basePrice: 85,
            unit: "each",
            quantity: 4,
            sortOrder: 0,
          },
          {
            productId: wallGrProduct.id,
            name: wallGrProduct.name,
            pricingModel: "PER_SQFT",
            basePrice: 12,
            unit: "sq ft",
            width: 25,
            height: 3.5,
            sortOrder: 1,
            wasteFactorPct: 15,
          },
        ],
      },
    },
  });

  // Quote #2 — Law firm, SENT (open pipeline).
  await db.quote.create({
    data: {
      tenantId: tenant.id,
      customerId: firm.id,
      locationId,
      number: `${tenant.quoteNumberPrefix}DEMO-002`,
      status: "SENT",
      issuedAt: daysAgo(4),
      sentAt: daysAgo(4),
      subtotal: 240,
      taxRate: Number(tenant.defaultTaxRate) || 0.0875,
      taxAmount: 21,
      total: 261,
      createdBy: ctx.userId,
      customerNote: "2 boxes of business cards — partner rebranding.",
      items: {
        create: [
          {
            productId: bcProduct.id,
            name: bcProduct.name,
            pricingModel: "PER_UNIT",
            basePrice: 0.12,
            unit: "card",
            quantity: 1000,
            sortOrder: 0,
          },
          {
            name: "Design revisions",
            pricingModel: "LABOR_HOURLY",
            basePrice: 75,
            unit: "hour",
            hours: 1.6,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // Quote #3 — Realtor, DRAFT (in-flight, not sent).
  await db.quote.create({
    data: {
      tenantId: tenant.id,
      customerId: realtor.id,
      locationId,
      number: `${tenant.quoteNumberPrefix}DEMO-003`,
      status: "DRAFT",
      subtotal: 440,
      taxRate: Number(tenant.defaultTaxRate) || 0.0875,
      taxAmount: 38.5,
      total: 478.5,
      createdBy: ctx.userId,
      customerNote: "20 open-house yard signs, same artwork as last year.",
      items: {
        create: [
          {
            name: "Yard Sign (24 × 18)",
            pricingModel: "FIXED",
            basePrice: 22,
            unit: "each",
            quantity: 20,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // ── Order (from the approved winery quote) ──
  const wineryOrder = await db.order.create({
    data: {
      tenantId: tenant.id,
      customerId: winery.id,
      locationId,
      quoteId: wineryQuote.id,
      number: `${tenant.orderNumberPrefix}DEMO-001`,
      status: "IN_PRODUCTION",
      subtotal: 1245,
      taxAmount: 108.94,
      total: 1353.94,
      depositPercent: 50,
      paidAmount: 676.97,
      startedAt: daysAgo(14),
      createdBy: ctx.userId,
      items: {
        create: [
          {
            name: bannerProduct.name,
            pricingModel: "FIXED",
            basePrice: 85,
            unit: "each",
            quantity: 4,
            subtotal: 340,
            sortOrder: 0,
          },
          {
            name: wallGrProduct.name,
            pricingModel: "PER_SQFT",
            basePrice: 12,
            unit: "sq ft",
            width: 25,
            height: 3.5,
            subtotal: 905,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // ── Invoice (deposit, SENT) ──
  await db.invoice.create({
    data: {
      tenantId: tenant.id,
      customerId: winery.id,
      orderId: wineryOrder.id,
      locationId,
      number: `${tenant.invoiceNumberPrefix}DEMO-001`,
      status: "SENT",
      kind: "DEPOSIT",
      issuedAt: daysAgo(18),
      sentAt: daysAgo(18),
      dueDate: daysAhead(12),
      subtotal: 676.97,
      taxRate: Number(tenant.defaultTaxRate) || 0.0875,
      taxAmount: 0,
      total: 676.97,
      amountPaid: 0,
      terms: "NET_30",
      createdBy: ctx.userId,
    },
  });

  await db.tenant.update({
    where: { id: tenant.id },
    data: { sampleDataLoadedAt: new Date(), sampleDataClearedAt: null },
  });
}

export async function clearSampleData(slug: string, _formData?: FormData) {
  const ctx = await requirePermission(slug, "tenant:manage");
  const tenantId = ctx.tenant.id;

  await clearSampleDataForTenant(tenantId);
  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "onboarding.sample.clear",
  });
  revalidatePath(`/t/${slug}`, "layout");
  redirect(`/t/${slug}/settings?sample=cleared`);
}

// Pure clear: removes only rows we can prove were seeded (customers tagged
// "demo", products with DEMO- SKU). Cascades through quotes / orders /
// invoices / tasks / install events in the correct order. Callers own
// auth, audit, and navigation.
export async function clearSampleDataForTenant(
  tenantId: string,
): Promise<{ customersRemoved: number; productsRemoved: number }> {
  // Find every customer that came from the seeder. The tag is our
  // trust anchor — nothing else in the system sets "demo" on Customer.
  const demoCustomers = await db.customer.findMany({
    where: { tenantId, tags: { has: DEMO_TAG } },
    select: { id: true },
  });
  const customerIds = demoCustomers.map((c) => c.id);

  // Delete dependents first — Quote.customer is onDelete: Restrict so
  // a direct Customer delete would fail until quotes/orders/invoices
  // are gone.
  if (customerIds.length > 0) {
    await db.$transaction([
      db.installEvent.deleteMany({
        where: { tenantId, customerId: { in: customerIds } },
      }),
      db.invoice.deleteMany({
        where: { tenantId, customerId: { in: customerIds } },
      }),
      db.order.deleteMany({
        where: { tenantId, customerId: { in: customerIds } },
      }),
      db.quote.deleteMany({
        where: { tenantId, customerId: { in: customerIds } },
      }),
      db.task.deleteMany({
        where: { tenantId, customerId: { in: customerIds } },
      }),
      db.customer.deleteMany({
        where: { tenantId, id: { in: customerIds } },
      }),
    ]);
  }

  // Products — anything whose SKU starts with DEMO- was seeded. Orders/
  // quote items reference product by id with SetNull on delete, so we
  // can wipe them safely now that the demo customers are gone.
  const productDelete = await db.product.deleteMany({
    where: { tenantId, sku: { startsWith: DEMO_SKU_PREFIX } },
  });

  await db.tenant.update({
    where: { id: tenantId },
    data: { sampleDataClearedAt: new Date() },
  });

  return { customersRemoved: customerIds.length, productsRemoved: productDelete.count };
}

// ────────────────────────────────────────────────────────────
// Small date helpers — sample data should look "lived in" not all
// dated today, so we offset timestamps by hand where it matters.
// ────────────────────────────────────────────────────────────
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function daysAhead(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
