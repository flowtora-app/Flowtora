// Seed data for Pages 31-35 — Operations command center.
//
// Generates realistic dummy data so every chart, KPI, and list on:
//   • /platform/operations/jobs           (Page 31)
//   • /platform/operations/production     (Page 32)
//   • /platform/operations/tickets        (Page 33)
//   • /platform/operations/knowledge-base (Page 34)
//   • /platform/operations/announcements  (Page 35)
// renders against meaningful numbers instead of empty states.
//
// Idempotent — re-running is safe: every row is tagged "[seed]" in
// notes / tags, and we delete-then-insert by tag.

import { db } from "../src/lib/db";
import { randomBytes, createHash } from "node:crypto";
import type {
  OrderStatus, OrderPriority,
  SupportTicketStatus, SupportTicketPriority,
  SupportTicketCategory, SupportTicketModule,
  KbArticleStatus, KbVisibility,
  AnnouncementType, AnnouncementPriority, AnnouncementStatus,
  AnnouncementAudience, AnnouncementChannel,
  ChangelogCategory,
  FeatureRequestStatus, EngineeringEffort, VoteDirection,
  BugSeverity, BugStatus, BugEnvironment, BugFrequency,
  LandingPageStatus, LandingPageDevice, LandingPageMetric,
  EmailRecipientStatus,
} from "@prisma/client";
import { defaultBlock } from "../src/lib/lp-blocks";

const SEED_TAG = "[seed]";
const DAY = 86_400_000;

const rand = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const sample = <T>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
};
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  console.log("\n══ Operations seed (Pages 31-35) ════════════════════\n");

  await wipeOldSeed();
  const tenants = await ensureTenants();
  const platformUsers = await ensurePlatformUsers();

  await seedCustomersAndProducts(tenants);
  await seedOrders(tenants);                    // Pages 31-32
  await seedProductionMetrics(tenants);         // Page 32 — uptime, waste, rework
  await seedSupportTickets(tenants, platformUsers); // Page 33
  await seedKnowledgeBase(platformUsers);       // Page 34
  await seedAnnouncements(platformUsers, tenants);  // Page 35
  await seedFeatureRequests(platformUsers, tenants); // Page 36
  await seedBugs(platformUsers, tenants);            // Page 37
  await seedLandingPages(platformUsers);             // Page 38
  await seedEmailCampaigns(platformUsers);           // Page 39
  await seedSequences(platformUsers, tenants);       // Page 40
  await seedReferrals(tenants);                       // Page 41
  await seedAffiliates();                             // Page 42
  await seedSeo();                                    // Page 43
  await seedLeadInbox(platformUsers, tenants);        // Page 44
  await seedIntegrationCatalog(tenants);              // Page 45
  await seedApiAndWebhooks(platformUsers, tenants);   // Page 46
  await seedDeveloperDocs(platformUsers);             // Page 47
  await seedMarketplace(platformUsers, tenants);      // Page 48

  console.log("\n✓ Seed complete.\n");
  await db.$disconnect();
}

/* ── Wipe ────────────────────────────────────────────── */

async function wipeOldSeed() {
  console.log("── Wiping prior seed rows…");
  // Orders + dependents (stages, material usage, defects all cascade).
  const oldOrders = await db.order.findMany({
    where: { customerNote: { contains: SEED_TAG } },
    select: { id: true },
  });
  if (oldOrders.length) {
    const ids = oldOrders.map((o) => o.id);
    await db.defectReport.deleteMany({ where: { orderId: { in: ids } } });
    await db.materialUsage.deleteMany({ where: { orderId: { in: ids } } });
    await db.productionStage.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
    console.log(`  deleted ${oldOrders.length} orders + descendants`);
  }
  // SupportTickets where subject prefixed [seed].
  const oldTickets = await db.supportTicket.findMany({
    where: { subject: { startsWith: SEED_TAG } },
    select: { id: true },
  });
  if (oldTickets.length) {
    await db.supportTicket.deleteMany({ where: { id: { in: oldTickets.map((t) => t.id) } } });
    console.log(`  deleted ${oldTickets.length} support tickets`);
  }
  // KbArticles + KbCategories tagged seed.
  const oldArticles = await db.kbArticle.findMany({
    where: { tags: { has: "seed" } },
    select: { id: true },
  });
  if (oldArticles.length) {
    await db.kbArticle.deleteMany({ where: { id: { in: oldArticles.map((a) => a.id) } } });
    console.log(`  deleted ${oldArticles.length} KB articles`);
  }
  await db.kbCategory.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  await db.kbSearchQuery.deleteMany({ where: { query: { startsWith: SEED_TAG } } });
  // Article views from seed articles cascade-delete with article rows
  // already, but if any survive we clean them here:
  // (no-op left as a safety placeholder — viewLog rows reference articleId)
  // Announcements tagged seed.
  const oldAnn = await db.platformAnnouncement.findMany({
    where: { tags: { has: "seed" } },
    select: { id: true },
  });
  if (oldAnn.length) {
    await db.platformAnnouncement.deleteMany({ where: { id: { in: oldAnn.map((a) => a.id) } } });
    console.log(`  deleted ${oldAnn.length} announcements`);
  }
  // Feature requests tagged seed.
  const oldFr = await db.featureRequest.findMany({
    where: { tags: { has: "seed" } },
    select: { id: true },
  });
  if (oldFr.length) {
    await db.featureRequest.deleteMany({ where: { id: { in: oldFr.map((f) => f.id) } } });
    console.log(`  deleted ${oldFr.length} feature requests`);
  }
  // Bugs tagged seed.
  const oldBugs = await db.bug.findMany({
    where: { tags: { has: "seed" } },
    select: { id: true },
  });
  if (oldBugs.length) {
    await db.bug.deleteMany({ where: { id: { in: oldBugs.map((b) => b.id) } } });
    console.log(`  deleted ${oldBugs.length} bugs`);
  }
  // Landing pages — paths under /lp/seed/* are ours.
  const oldLp = await db.landingPage.findMany({
    where: { path: { startsWith: "/seed-" } },
    select: { id: true },
  });
  if (oldLp.length) {
    await db.landingPage.deleteMany({ where: { id: { in: oldLp.map((p) => p.id) } } });
    console.log(`  deleted ${oldLp.length} landing pages`);
  }
  await db.landingPageDomain.deleteMany({ where: { hostname: { startsWith: "seed-" } } });
  await db.landingPageTemplate.deleteMany({ where: { name: { startsWith: "[seed]" } } });
  // Email campaigns + templates + audiences tagged seed.
  const oldCampaigns = await db.emailCampaign.findMany({
    where: { name: { startsWith: "[seed]" } },
    select: { id: true },
  });
  if (oldCampaigns.length) {
    await db.emailCampaign.deleteMany({ where: { id: { in: oldCampaigns.map((c) => c.id) } } });
    console.log(`  deleted ${oldCampaigns.length} email campaigns`);
  }
  await db.emailTemplate.deleteMany({ where: { name: { startsWith: "[seed]" } } });
  await db.emailAudience.deleteMany({ where: { name: { startsWith: "[seed]" } } });
  // Sequences tagged seed.
  const oldSequences = await db.sequence.findMany({
    where: { name: { startsWith: "[seed]" } },
    select: { id: true },
  });
  if (oldSequences.length) {
    await db.sequence.deleteMany({ where: { id: { in: oldSequences.map((s) => s.id) } } });
    console.log(`  deleted ${oldSequences.length} sequences`);
  }
  // Templates aren't tagged — leave them for the prebuilt loader to manage.
  // Page 41 — referral funnel rows + codes that we minted via seed.
  // We can't tag the referral row itself, so we wipe by code prefix.
  const seedCodes = await db.tenantReferralCode.findMany({
    where: { code: { startsWith: "SEED-" } },
    select: { id: true },
  });
  if (seedCodes.length) {
    await db.tenantReferralCode.deleteMany({ where: { id: { in: seedCodes.map((c) => c.id) } } });
    console.log(`  deleted ${seedCodes.length} seed referral codes (cascades to funnel rows)`);
  }
  // Page 42 — affiliate program seed wipe.
  // Code prefix: SEED- on Affiliate; tier names start with [seed]; creative names too.
  const seedAffiliates = await db.affiliate.findMany({
    where: { code: { startsWith: "SEED-" } },
    select: { id: true },
  });
  if (seedAffiliates.length) {
    // Cascades wipe applications, clicks, messages.
    await db.affiliate.deleteMany({ where: { id: { in: seedAffiliates.map((a) => a.id) } } });
    console.log(`  deleted ${seedAffiliates.length} seed affiliates`);
  }
  await db.affiliateApplication.deleteMany({ where: { email: { endsWith: "@seed.flowtora.example" } } });
  await db.affiliateTier.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  await db.affiliateCreative.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  // Page 43 — SEO seed wipe. Keywords/backlinks/broken/gaps/snapshots
  // are tagged by deterministic markers so we can clean cleanly.
  await db.seoKeyword.deleteMany({ where: { keyword: { startsWith: "[seed] " } } });
  await db.seoBacklink.deleteMany({ where: { sourceDomain: { endsWith: ".seedlinks.example" } } });
  await db.seoBrokenLink.deleteMany({ where: { brokenUrl: { contains: "seed-broken" } } });
  await db.seoContentGap.deleteMany({ where: { keyword: { startsWith: "[seed] " } } });
  await db.seoPageSpeedSnapshot.deleteMany({ where: { url: { endsWith: ".seed.flowtora.com" } } });
  // Page 44 — leads tagged "@seed.flowtora.example" plus their cascaded
  // activity/tasks/emails/routing.
  const seedLeads = await db.marketingLead.findMany({
    where: { email: { endsWith: "@seed.flowtora.example" } },
    select: { id: true },
  });
  if (seedLeads.length) {
    await db.marketingLead.deleteMany({ where: { id: { in: seedLeads.map((l) => l.id) } } });
    console.log(`  deleted ${seedLeads.length} seed leads (cascades to activities/tasks/emails/routing)`);
  }
  // Page 45 — integration catalog rows tagged with [seed] in name (and
  // their sync events / versions / incidents / audit cascading away).
  const seedIntegrations = await db.integrationCatalog.findMany({
    where: { name: { startsWith: "[seed] " } },
    select: { id: true },
  });
  if (seedIntegrations.length) {
    await db.integrationCatalog.deleteMany({ where: { id: { in: seedIntegrations.map((i) => i.id) } } });
    console.log(`  deleted ${seedIntegrations.length} seed integrations (cascades versions/incidents/sync events/audit)`);
  }
  // Page 46 — API keys + webhook endpoints + events tagged with [seed].
  const seedKeys = await db.platformApiKey.findMany({
    where: { name: { startsWith: "[seed] " } },
    select: { id: true },
  });
  if (seedKeys.length) {
    await db.platformApiKey.deleteMany({ where: { id: { in: seedKeys.map((k) => k.id) } } });
    console.log(`  deleted ${seedKeys.length} seed API keys (cascades usage events)`);
  }
  const seedEndpoints = await db.webhookEndpoint.findMany({
    where: { description: { contains: "[seed]" } },
    select: { id: true },
  });
  if (seedEndpoints.length) {
    await db.webhookEndpoint.deleteMany({ where: { id: { in: seedEndpoints.map((e) => e.id) } } });
    console.log(`  deleted ${seedEndpoints.length} seed webhook endpoints (cascades deliveries)`);
  }
  await db.webhookEvent.deleteMany({ where: { description: { startsWith: "[seed] " } } });
  // Page 47 — doc pages tagged with [seed] in title; cascades versions + comments.
  const seedDocPages = await db.docPage.findMany({
    where: { title: { startsWith: "[seed] " } },
    select: { id: true },
  });
  if (seedDocPages.length) {
    await db.docPage.deleteMany({ where: { id: { in: seedDocPages.map((p) => p.id) } } });
    console.log(`  deleted ${seedDocPages.length} seed doc pages (cascades versions + comments)`);
  }
  await db.openApiSpec.deleteMany({ where: { version: { startsWith: "[seed]-" } } });
  await db.codeSample.deleteMany({ where: { endpointKey: { startsWith: "[seed] " } } });
  // Page 48 — marketplace apps + categories tagged with [seed].
  const seedMpApps = await db.marketplaceApp.findMany({
    where: { name: { startsWith: "[seed] " } },
    select: { id: true },
  });
  if (seedMpApps.length) {
    await db.marketplaceApp.deleteMany({ where: { id: { in: seedMpApps.map((a) => a.id) } } });
    console.log(`  deleted ${seedMpApps.length} seed marketplace apps (cascades versions + installs + reviews + …)`);
  }
  await db.marketplaceCategory.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  // Customers tagged seed (after orders are gone).
  await db.customer.deleteMany({ where: { tags: { has: "seed" } } });
  // Products tagged seed (use description marker since Product has no tags array).
  await db.product.deleteMany({ where: { description: { startsWith: SEED_TAG } } });
}

/* ── Tenants & users ─────────────────────────────────── */

async function ensureTenants() {
  const tenants = await db.tenant.findMany({
    select: { id: true, slug: true, name: true, plan: true },
    orderBy: { createdAt: "asc" },
  });
  if (tenants.length === 0) {
    throw new Error("No tenants found — run base seed first.");
  }
  console.log(`\n── Found ${tenants.length} tenants — seeding into all of them.`);
  return tenants;
}

async function ensurePlatformUsers() {
  const users = await db.user.findMany({
    where: { platformRole: { not: null } },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (users.length === 0) throw new Error("No platform staff found.");
  console.log(`── Found ${users.length} platform staff users for assignments.`);
  return users;
}

/* ── Customers + Products ────────────────────────────── */

const CUSTOMER_NAMES = [
  "Acme Storefronts LLC", "Bright Light Signs", "Castle Real Estate",
  "Davis Dental", "Evergreen Bakery", "Foothill Coffee Roasters",
  "Gemini Auto Detail", "Harbor Boutique", "Iron Oak Barbershop",
  "Jefferson High Athletics", "Kona Surf Co", "Lumen Yoga Studio",
  "Mountainside Brewing", "Northshore Marina", "Olive Branch Catering",
  "Pacific Pediatrics", "Quartz Tile & Stone", "Riverbend Outdoors",
  "Sunset Auto Body", "Trailhead Bicycle Co", "Urban Oasis Spa",
  "Vertex Office Park", "Westside Pharmacy", "Yellowstone Outfitters",
  "Zenith Medical Group",
];

const PRODUCT_TEMPLATES = [
  { name: "Channel letters — internal LED", basePrice: 280000, cost: 145000 },
  { name: "Storefront acrylic sign 4ft",     basePrice: 95000,  cost: 38000  },
  { name: "Vinyl banner 6x3",                basePrice: 18000,  cost: 5500   },
  { name: "Window decals — set of 8",        basePrice: 24000,  cost: 7200   },
  { name: "Vehicle wrap — full sedan",       basePrice: 320000, cost: 145000 },
  { name: "Wayfinding sign panel",           basePrice: 42000,  cost: 17500  },
  { name: "Trade show pop-up display",       basePrice: 78000,  cost: 28500  },
  { name: "Real estate yard sign",           basePrice: 4500,   cost: 1200   },
];

async function seedCustomersAndProducts(tenants: { id: string }[]) {
  console.log("\n── Seeding customers & products…");
  let cust = 0, prod = 0;
  for (const t of tenants) {
    // 12 customers per tenant
    const customerSlice = sample(CUSTOMER_NAMES, 12);
    for (const name of customerSlice) {
      await db.customer.create({
        data: {
          tenantId: t.id,
          name,
          kind: Math.random() < 0.85 ? "BUSINESS" : "INDIVIDUAL",
          status: "ACTIVE",
          stage: rand(["WON", "WON", "WON", "QUOTED", "NEGOTIATING"] as const),
          email: `contact@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
          tags: ["seed"],
        },
      });
      cust += 1;
    }
    // 6 products per tenant
    const productSlice = sample(PRODUCT_TEMPLATES, 6);
    for (const p of productSlice) {
      await db.product.create({
        data: {
          tenantId: t.id,
          name: p.name,
          basePrice: p.basePrice / 100,
          cost: p.cost / 100,
          description: `${SEED_TAG} demo product`,
        },
      });
      prod += 1;
    }
  }
  console.log(`  ✓ ${cust} customers, ${prod} products`);
}

/* ── Orders (Pages 31 + 32) ──────────────────────────── */

async function seedOrders(tenants: { id: string }[]) {
  console.log("\n── Seeding orders (Pages 31-32)…");
  let total = 0;
  for (const t of tenants) {
    const customers = await db.customer.findMany({
      where: { tenantId: t.id, tags: { has: "seed" } },
      select: { id: true },
      take: 50,
    });
    const products = await db.product.findMany({
      where: { tenantId: t.id, description: { startsWith: SEED_TAG } },
      select: { id: true, basePrice: true, cost: true, name: true },
      take: 20,
    });
    if (customers.length === 0 || products.length === 0) continue;

    const owner = await db.tenant.findUnique({
      where: { id: t.id },
      select: { memberships: { take: 1, select: { userId: true } } },
    });
    const createdBy = owner?.memberships[0]?.userId ?? "unknown";
    if (createdBy === "unknown") continue;

    // Find the highest existing number for this tenant so we don't collide.
    const lastOrder = await db.order.findFirst({
      where: { tenantId: t.id, number: { startsWith: "O-" } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const lastNum = lastOrder ? parseInt(lastOrder.number.replace(/^O-/, ""), 10) || 0 : 0;
    let counter = Math.max(1000, lastNum + 100);
    for (let i = 0; i < 60; i++) {
      counter += 1;
      const ageDays = randInt(0, 60);
      const createdAt = daysAgo(ageDays);

      // Pick status based on age — older = more likely completed.
      const status: OrderStatus = (() => {
        if (ageDays > 35) return Math.random() < 0.85 ? "COMPLETED" : (Math.random() < 0.5 ? "READY" : "CANCELED");
        if (ageDays > 18) return Math.random() < 0.55 ? "COMPLETED" : (Math.random() < 0.5 ? "OUT_FOR_INSTALL" : "READY");
        if (ageDays > 7)  return Math.random() < 0.4  ? "IN_PRODUCTION" : (Math.random() < 0.5 ? "READY" : "OUT_FOR_INSTALL");
        if (ageDays > 2)  return Math.random() < 0.55 ? "IN_PRODUCTION" : "NEW";
        return Math.random() < 0.5 ? "NEW" : "IN_PRODUCTION";
      })();

      const dueOffset = randInt(-10, 21);
      const dueDate = new Date(createdAt.getTime() + (10 + dueOffset) * DAY);
      const isLate = dueDate.getTime() < Date.now() && (status === "NEW" || status === "IN_PRODUCTION" || status === "READY");

      const startedAt = status !== "NEW" ? new Date(createdAt.getTime() + randInt(1, 4) * DAY) : null;
      const readyAt   = (status === "READY" || status === "OUT_FOR_INSTALL" || status === "COMPLETED")
        ? new Date((startedAt ?? createdAt).getTime() + randInt(2, 12) * DAY)
        : null;
      const completedAt = status === "COMPLETED"
        ? new Date((readyAt ?? startedAt ?? createdAt).getTime() + randInt(1, 6) * DAY)
        : null;
      const canceledAt = status === "CANCELED"
        ? new Date(createdAt.getTime() + randInt(1, 14) * DAY)
        : null;

      const itemCount = randInt(1, 4);
      const items: { productId: string | null; description: string; quantity: number; unitPrice: number; subtotal: number; cost: number }[] = [];
      let subtotal = 0;
      for (let k = 0; k < itemCount; k++) {
        const product = rand(products);
        const qty = randInt(1, 6);
        const price = Number(product.basePrice);
        const cost = Number(product.cost ?? 0);
        const lineSubtotal = price * qty;
        items.push({
          productId: product.id,
          description: product.name,
          quantity: qty,
          unitPrice: price,
          subtotal: lineSubtotal,
          cost: cost * qty,
        });
        subtotal += lineSubtotal;
      }

      const priority: OrderPriority = Math.random() < 0.06 ? "RUSH" : (Math.random() < 0.18 ? "HIGH" : "NORMAL");
      const customer = rand(customers);

      await db.order.create({
        data: {
          tenantId: t.id,
          customerId: customer.id,
          number: `O-${counter}`,
          status,
          priority,
          subtotal,
          total: subtotal,
          dueDate,
          startedAt,
          readyAt,
          completedAt,
          canceledAt,
          createdAt,
          updatedAt: completedAt ?? canceledAt ?? readyAt ?? startedAt ?? createdAt,
          createdBy,
          customerNote: `${SEED_TAG} ${isLate ? "marked late by seed" : "demo order"}`,
          productionNotes: rand([
            "Standard run.",
            "Customer requested matte finish.",
            "Verify pantone match before lamination.",
            "Coordinate with installer for next-day pickup.",
            "Rush — escalated by AE.",
          ]),
          items: {
            create: items.map((it) => ({
              productId: it.productId,
              name: it.description,
              description: it.description,
              pricingModel: "PER_UNIT",
              basePrice: it.unitPrice,
              quantity: it.quantity,
              subtotal: it.subtotal,
            })),
          },
        },
      });
      total += 1;
    }
  }
  console.log(`  ✓ ${total} orders across ${tenants.length} tenants`);
}

/* ── Production metrics (Page 32) ────────────────────── */

async function seedProductionMetrics(tenants: { id: string }[]) {
  console.log("\n── Seeding production metrics (Page 32)…");
  let stages = 0, defects = 0, mats = 0;
  for (const t of tenants) {
    // Pick a sample of recent + completed orders to attach data to.
    const orders = await db.order.findMany({
      where: {
        tenantId: t.id,
        customerNote: { contains: SEED_TAG },
      },
      select: { id: true, status: true, createdAt: true, completedAt: true, startedAt: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    if (orders.length === 0) continue;

    const owner = await db.membership.findFirst({
      where: { tenantId: t.id },
      select: { userId: true },
    });
    const reporter = owner?.userId;
    if (!reporter) continue;

    // Pretend each tenant has 4 workstations — IDs are synthetic strings,
    // not WorkStation rows, since the loader only needs a stable key.
    const stationIds = ["ws-print-1", "ws-print-2", "ws-cnc", "ws-laminator"]
      .map((s) => `${t.id}::${s}`);

    // ProductionStages — 1-3 per order with a station id assigned.
    for (const o of orders) {
      const stageCount = randInt(1, 3);
      const orderStart = o.startedAt ?? o.createdAt;
      for (let i = 0; i < stageCount; i++) {
        const stationId = rand(stationIds);
        const stageStart = new Date(orderStart.getTime() + i * randInt(2, 24) * 3_600_000);
        const stageDurationHrs = randInt(1, 6);
        const stageEnd = new Date(stageStart.getTime() + stageDurationHrs * 3_600_000);
        const completed = o.status === "COMPLETED" || (Math.random() < 0.7 && stageEnd.getTime() < Date.now());

        // We can't reference a real WorkStation row, so we pass null and
        // store the synthetic id as part of the title for traceability.
        // The uptime computation will still bucket per-tenant time — we
        // accept the synthetic-station limitation for seed purposes.
        await db.productionStage.create({
          data: {
            tenantId: t.id,
            orderId: o.id,
            title: `Stage ${i + 1} (${stationId.split("::")[1]})`,
            status: completed ? "DONE" : "ACTIVE",
            sortOrder: i,
            startedAt: stageStart,
            completedAt: completed ? stageEnd : null,
            startedBy: reporter,
            completedBy: completed ? reporter : null,
          },
        });
        stages += 1;
      }
    }

    // MaterialUsage — log on ~70% of orders.
    const materials = ["3M Scotchcal", "Coroplast 4mm", "Aluminum Composite", "Vinyl Roll", "PMS Ink Set"];
    for (const o of orders) {
      if (Math.random() > 0.7) continue;
      const usageCount = randInt(1, 3);
      for (let i = 0; i < usageCount; i++) {
        await db.materialUsage.create({
          data: {
            tenantId: t.id,
            orderId: o.id,
            material: rand(materials),
            quantity: randInt(2, 80),
            unit: rand(["ft", "sqft", "sheet", "roll"]),
            // Distribution centered around ~10%, occasionally high spikes.
            wastePct: Math.random() < 0.85 ? randInt(2, 12) : randInt(15, 30),
            loggedBy: reporter,
            createdAt: new Date(o.createdAt.getTime() + randInt(1, 12) * 3_600_000),
          },
        });
        mats += 1;
      }
    }

    // DefectReports — ~8% of completed orders pick up a MAJOR/CRITICAL
    // defect (drives the rework rate). 4% MINOR (cosmetic-only).
    for (const o of orders) {
      if (o.status !== "COMPLETED") continue;
      const r = Math.random();
      if (r > 0.12) continue;
      const severity = r < 0.04 ? "MINOR" : (r < 0.10 ? "MAJOR" : "CRITICAL");
      await db.defectReport.create({
        data: {
          tenantId: t.id,
          orderId: o.id,
          severity,
          cause: rand(["misaligned cut", "wrong ink", "peel-off after laminate", "color drift", "operator error"]),
          notes: `${SEED_TAG} demo defect — ${severity.toLowerCase()}`,
          reportedBy: reporter,
          resolvedAt: severity === "MINOR" ? null : new Date((o.completedAt ?? new Date()).getTime() + randInt(1, 24) * 3_600_000),
          resolvedBy: severity === "MINOR" ? null : reporter,
          resolution: severity === "MINOR" ? null : rand(["Reprinted and replaced", "Re-laminated", "Sent to rework"]),
        },
      });
      defects += 1;
    }
  }
  console.log(`  ✓ ${stages} stages, ${mats} material usages, ${defects} defects`);
}

/* ── SupportTickets (Page 33) ────────────────────────── */

const TICKET_SUBJECTS: { subject: string; category: SupportTicketCategory; module: SupportTicketModule; bodies: string[] }[] = [
  {
    subject: "Stripe webhook is failing for our prod env",
    category: "BILLING", module: "BILLING",
    bodies: [
      "Hey — we just upgraded to Pro and Stripe shows the charge succeeded but our portal still says trial. Can you sync?",
      "Updated, took ~10 min to propagate. Working now.",
    ],
  },
  {
    subject: "Proof email never arrived for customer",
    category: "BUG", module: "PROOFS",
    bodies: [
      "Sent a proof to acme@example.com 2 hours ago and they say nothing in spam. Resend button greyed out.",
    ],
  },
  {
    subject: "Can we add Square as a payment processor?",
    category: "FEATURE_REQUEST", module: "INTEGRATIONS",
    bodies: [
      "Hi, several of our shops are on Square already. Adding it would let us migrate without breaking their accounting.",
    ],
  },
  {
    subject: "Order status reverted unexpectedly",
    category: "BUG", module: "ORDERS",
    bodies: [
      "Order O-1042 went back from READY to IN_PRODUCTION overnight. Nobody on our team touched it.",
    ],
  },
  {
    subject: "How do I reset 2FA for a team member?",
    category: "QUESTION", module: "AUTH",
    bodies: [
      "She lost her phone and we can't find a clear option in the team settings.",
    ],
  },
  {
    subject: "Quote PDF showing wrong logo",
    category: "BUG", module: "QUOTES",
    bodies: [
      "Uploaded the new logo last Friday but the quote PDF still shows the old one.",
    ],
  },
  {
    subject: "Bulk export of completed jobs",
    category: "FEATURE_REQUEST", module: "REPORTS",
    bodies: [
      "Need a CSV export with customer, total, due date, and completion date for the last 90 days.",
    ],
  },
  {
    subject: "Customer portal page is loading slow",
    category: "BUG", module: "PORTAL",
    bodies: [
      "Customers reporting 8-10s load times on the proof view page. Started Tuesday morning.",
    ],
  },
  {
    subject: "Refund isn't reflecting in invoice",
    category: "BILLING", module: "INVOICES",
    bodies: [
      "Issued a $250 refund through Stripe two days ago. Invoice still shows full balance paid.",
    ],
  },
  {
    subject: "Can we get an SSO option for Google Workspace?",
    category: "FEATURE_REQUEST", module: "AUTH",
    bodies: [
      "Several of our larger customers are asking — would unblock enterprise tier conversations.",
    ],
  },
  {
    subject: "Email templates don't preserve our brand color",
    category: "BUG", module: "EMAIL",
    bodies: [
      "Set #FF6600 in branding but quote emails arrive with the default blue.",
    ],
  },
  {
    subject: "Where do I edit production notes?",
    category: "QUESTION", module: "ORDERS",
    bodies: [
      "Looking for a way to add per-order production notes that the install team can see.",
    ],
  },
];

async function seedSupportTickets(
  tenants: { id: string; name: string }[],
  staff: { id: string; email: string; name: string | null }[],
) {
  console.log("\n── Seeding support tickets (Page 33)…");
  let count = 0;
  // 35 tickets total spread across tenants/statuses/priorities.
  for (let i = 0; i < 35; i++) {
    const t = rand(tenants);
    const tmpl = rand(TICKET_SUBJECTS);
    const ageDays = randInt(0, 21);
    const createdAt = daysAgo(ageDays);

    const status: SupportTicketStatus = (() => {
      if (ageDays > 14) return Math.random() < 0.7 ? "RESOLVED" : "CLOSED";
      if (ageDays > 7)  return Math.random() < 0.4 ? "WAITING_CUSTOMER" : "RESOLVED";
      if (ageDays > 3)  return Math.random() < 0.5 ? "IN_PROGRESS" : "WAITING_CUSTOMER";
      return Math.random() < 0.55 ? "OPEN" : "IN_PROGRESS";
    })();

    const priority: SupportTicketPriority = (() => {
      const r = Math.random();
      if (r < 0.08) return "URGENT";
      if (r < 0.25) return "HIGH";
      if (r < 0.85) return "NORMAL";
      return "LOW";
    })();

    const slaHoursByPriority: Record<SupportTicketPriority, number> = {
      URGENT: 1, HIGH: 4, NORMAL: 24, LOW: 72,
    };
    const dueBy = new Date(createdAt.getTime() + slaHoursByPriority[priority] * 3_600_000);

    const tenantOwner = await db.membership.findFirst({
      where: { tenantId: t.id },
      select: { userId: true },
    });
    if (!tenantOwner) continue;

    const assigned = (status === "OPEN" && Math.random() < 0.5) ? null : rand(staff);
    const firstStaffReplyAt = (status !== "OPEN")
      ? new Date(createdAt.getTime() + randInt(15, 480) * 60_000)
      : null;

    const isResolved = status === "RESOLVED" || status === "CLOSED";
    const resolvedAt = isResolved
      ? new Date(createdAt.getTime() + randInt(2, 12) * 3_600_000 + ageDays * DAY * 0.5)
      : null;

    const csat = isResolved && Math.random() < 0.55
      ? { rating: rand([3, 4, 4, 4, 5, 5, 5, 5, 2]), comment: rand(["Quick fix, thanks!", "Took a while but resolved.", "Great communication.", "Wish it had been escalated sooner.", null, null]) }
      : null;

    const ticket = await db.supportTicket.create({
      data: {
        tenantId: t.id,
        subject: `${SEED_TAG} ${tmpl.subject}`,
        category: tmpl.category,
        module: tmpl.module,
        priority,
        status,
        channel: rand(["EMAIL", "EMAIL", "EMAIL", "IN_APP", "CHAT", "PHONE", "FORUM"] as const),
        openedByUserId: tenantOwner.userId,
        assignedTo: assigned ? assigned.id : null,
        createdAt,
        dueBy,
        firstStaffReplyAt,
        resolvedAt,
        closedAt: status === "CLOSED" ? resolvedAt : null,
        satisfactionRating: csat?.rating ?? null,
        satisfactionComment: csat?.comment ?? null,
        satisfactionAt: csat ? new Date((resolvedAt?.getTime() ?? createdAt.getTime()) + randInt(60, 720) * 60_000) : null,
        ratedByUserId: csat ? tenantOwner.userId : null,
      },
    });

    // Customer message + optional staff replies.
    await db.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: tenantOwner.userId,
        isStaff: false,
        body: tmpl.bodies[0]!,
        createdAt,
      },
    });
    if (firstStaffReplyAt && assigned) {
      await db.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: assigned.id,
          isStaff: true,
          body: rand([
            "Thanks for flagging — checking now.",
            "Got it. Looking at the logs from your tenant — I'll be back in a few minutes.",
            "We see the issue on our end. Pulling in engineering.",
          ]),
          createdAt: firstStaffReplyAt,
        },
      });
    }
    if (tmpl.bodies[1]) {
      await db.supportTicketMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: tenantOwner.userId,
          isStaff: false,
          body: tmpl.bodies[1],
          createdAt: new Date(createdAt.getTime() + randInt(60, 600) * 60_000),
        },
      });
    }

    count += 1;
  }
  console.log(`  ✓ ${count} support tickets`);
}

/* ── Knowledge Base (Page 34) ────────────────────────── */

const CATEGORY_TREE: { slug: string; name: string; children?: { slug: string; name: string }[] }[] = [
  {
    slug: "seed-getting-started",
    name: "Getting started",
    children: [
      { slug: "seed-onboarding",   name: "Onboarding" },
      { slug: "seed-quickstart",   name: "Quickstart" },
    ],
  },
  {
    slug: "seed-orders-jobs",
    name: "Orders & jobs",
    children: [
      { slug: "seed-create-quote", name: "Quotes & estimates" },
      { slug: "seed-production",   name: "Production workflow" },
    ],
  },
  {
    slug: "seed-billing",
    name: "Billing & payments",
  },
  {
    slug: "seed-integrations",
    name: "Integrations",
  },
  {
    slug: "seed-troubleshooting",
    name: "Troubleshooting",
  },
];

const ARTICLE_TEMPLATES: { title: string; summary: string; body: string; categorySlug: string; tags: string[] }[] = [
  {
    title: "Setting up your first storefront",
    summary: "How to launch your customer-facing storefront in under 10 minutes.",
    body: "## Overview\n\nThis guide walks you through configuring branding, adding your first product, and sending your first quote.\n\n## Branding\n\nNavigate to Settings → Branding and upload your logo, set your accent color, and pick a font. The storefront uses these for every customer touchpoint.\n\n## Products\n\nCreate at least one product before sharing your storefront. Customers can request quotes against any active product.\n\n## Going live\n\nOnce branding + at least one product are in, the storefront is automatically published at `/yourshop/`.",
    categorySlug: "seed-onboarding",
    tags: ["seed", "storefront", "onboarding"],
  },
  {
    title: "Inviting team members",
    summary: "Add admins, sales reps, and production staff to your shop.",
    body: "## Adding teammates\n\nGo to **Settings → Team** and click **Invite member**. Pick a role:\n\n- **Owner** — full access\n- **Admin** — everything except billing\n- **Sales rep** — quotes, orders, customers\n- **Production** — orders + production stages only\n\n## What invitees see\n\nThey'll receive an email with a magic link valid for 7 days.",
    categorySlug: "seed-onboarding",
    tags: ["seed", "team", "permissions"],
  },
  {
    title: "Building your first quote",
    summary: "Turn a customer inquiry into a polished, branded quote PDF.",
    body: "## Step 1 — Find or create the customer\n\n## Step 2 — Add line items\n\n## Step 3 — Apply discounts (optional)\n\n## Step 4 — Send for approval\n\nYour customer gets a link with one-click approve / decline. Approved quotes auto-convert to orders if you've enabled that in Settings.",
    categorySlug: "seed-create-quote",
    tags: ["seed", "quotes"],
  },
  {
    title: "Production stages explained",
    summary: "How orders move through Cut, Print, Laminate, Ship, Install.",
    body: "## What is a production stage?\n\nA stage represents a unit of work in your shop — Cutting, Printing, Laminating, Shipping, Installing.\n\n## Configuring stages\n\nBy default, every order gets the standard pipeline. Per-order overrides let you skip stages (digital-only orders skip Lamination).\n\n## Status colors\n\n- 🔵 In progress\n- 🟢 Ready\n- 🟠 Blocked\n- ⚫ Skipped",
    categorySlug: "seed-production",
    tags: ["seed", "production", "stages"],
  },
  {
    title: "Connecting Stripe for payments",
    summary: "One-time setup so customers can pay invoices online.",
    body: "## Prerequisites\n\nYou'll need a verified Stripe account with the products + tax settings already filled in.\n\n## Steps\n\n1. **Settings → Billing → Connect Stripe**\n2. Authorize the connection\n3. Pick which Stripe account if you have multiple\n4. Test with a $1 invoice\n\n## What's pulled\n\n- Charges + refunds\n- Dispute notifications\n- Customer payment methods (last 4 only)",
    categorySlug: "seed-billing",
    tags: ["seed", "stripe", "billing"],
  },
  {
    title: "Tax setup by region",
    summary: "Set per-location tax rates so quotes and invoices are accurate.",
    body: "## Why per-location?\n\nIf you operate in multiple states/regions, the tax rate on a customer's invoice depends on where the work ships. Configure each location independently.\n\n## How\n\nSettings → Tax → Add region.",
    categorySlug: "seed-billing",
    tags: ["seed", "tax"],
  },
  {
    title: "Connecting Google Calendar",
    summary: "Sync install appointments to your team's calendar.",
    body: "Calendar sync is one-way (Flowtora → Google) by default. Two-way sync requires a Pro plan.",
    categorySlug: "seed-integrations",
    tags: ["seed", "calendar", "google"],
  },
  {
    title: "Why is my proof email not arriving?",
    summary: "Common causes and how to fix them.",
    body: "## Most common causes\n\n1. The customer's domain blocks our sending domain — ask them to whitelist `@email.flowtora.com`.\n2. Resend cooldown — we throttle resends to 1 per hour to avoid spam flags.\n3. Soft bounce — the address briefly rejected the email; we retry automatically for 4 hours.\n\n## How to check\n\nSettings → Email log shows every send + status.",
    categorySlug: "seed-troubleshooting",
    tags: ["seed", "email", "proofs"],
  },
  {
    title: "Recovering a deleted quote",
    summary: "Soft-deleted quotes stick around for 30 days.",
    body: "Trash → Quotes. Restore returns it to draft state.",
    categorySlug: "seed-troubleshooting",
    tags: ["seed", "trash"],
  },
  {
    title: "Subscription billing cycles",
    summary: "How monthly + annual cycles work, mid-cycle changes, and prorations.",
    body: "## Monthly\n\nBills on the same day each month based on signup date.\n\n## Annual\n\nFlat 12-month price, prorated refund on cancel.\n\n## Mid-cycle upgrades\n\nWe charge the difference immediately and reset the cycle.",
    categorySlug: "seed-billing",
    tags: ["seed", "subscriptions"],
  },
  {
    title: "Quickstart: from signup to first order in 30 minutes",
    summary: "The fastest path through onboarding.",
    body: "1. Sign up\n2. Brand it (logo + color)\n3. Add 1 product\n4. Add 1 customer\n5. Send 1 quote\n6. Approve + convert\n\nDone.",
    categorySlug: "seed-quickstart",
    tags: ["seed", "quickstart", "onboarding"],
  },
  {
    title: "Bulk import customers from CSV",
    summary: "Move your existing customer list in 5 minutes.",
    body: "## CSV format\n\nRequired columns: `name`, `email`. Optional: `phone`, `tags` (comma-separated), `billingAddress`.\n\n## Where\n\nCustomers → Import.",
    categorySlug: "seed-onboarding",
    tags: ["seed", "import", "csv"],
  },
];

async function seedKnowledgeBase(staff: { id: string; email: string; name: string | null }[]) {
  console.log("\n── Seeding knowledge base (Page 34)…");
  // Categories first — parents, then children.
  const slugToId = new Map<string, string>();
  for (const c of CATEGORY_TREE) {
    const cat = await db.kbCategory.create({
      data: { slug: c.slug, name: c.name, sortOrder: 0 },
      select: { id: true, slug: true },
    });
    slugToId.set(cat.slug, cat.id);
    if (c.children) {
      for (const child of c.children) {
        const sub = await db.kbCategory.create({
          data: { slug: child.slug, name: child.name, parentId: cat.id, sortOrder: 0 },
          select: { id: true, slug: true },
        });
        slugToId.set(sub.slug, sub.id);
      }
    }
  }

  const statusMix: KbArticleStatus[] = ["PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "PUBLISHED", "DRAFT", "DRAFT", "REVIEW", "ARCHIVED"];
  const visibilityMix: KbVisibility[] = ["PUBLIC", "PUBLIC", "PUBLIC", "PUBLIC", "PUBLIC", "INTERNAL"];

  let articleCount = 0;
  for (const tmpl of ARTICLE_TEMPLATES) {
    const slug = tmpl.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const status = rand(statusMix);
    const visibility = rand(visibilityMix);
    const author = rand(staff);
    const ageDays = randInt(2, 90);
    const createdAt = daysAgo(ageDays);
    const updatedAt = daysAgo(randInt(0, ageDays));
    const publishedAt = status === "PUBLISHED" ? daysAgo(randInt(0, ageDays - 1)) : null;

    const a = await db.kbArticle.create({
      data: {
        slug,
        locale: "en",
        title: tmpl.title,
        summary: tmpl.summary,
        bodyMarkdown: tmpl.body,
        categoryId: slugToId.get(tmpl.categorySlug) ?? null,
        status,
        visibility,
        featured: Math.random() < 0.18,
        authorId: author.id,
        publishedById: status === "PUBLISHED" ? author.id : null,
        publishedAt,
        viewCount: status === "PUBLISHED" ? randInt(40, 4200) : 0,
        helpfulUp: status === "PUBLISHED" ? randInt(2, 80) : 0,
        helpfulDown: status === "PUBLISHED" ? randInt(0, 12) : 0,
        metaTitle: tmpl.title,
        metaDescription: tmpl.summary,
        tags: tmpl.tags,
        createdAt,
        updatedAt,
      },
      select: { id: true },
    });

    // Add a couple of revisions.
    const revCount = randInt(1, 4);
    for (let i = 0; i < revCount; i++) {
      await db.kbArticleRevision.create({
        data: {
          articleId: a.id,
          title: tmpl.title,
          bodyMarkdown: tmpl.body.slice(0, Math.max(60, tmpl.body.length - i * 80)),
          status: i === 0 ? "DRAFT" : (i === revCount - 1 ? status : "REVIEW"),
          note: rand(["Initial draft", "Cleaned up wording", "Added screenshots", "Fixed link", "Updated for new UI", null]),
          savedByUserId: rand(staff).id,
          createdAt: new Date(createdAt.getTime() + i * randInt(1, 6) * DAY),
        },
      });
    }

    // Reader feedback on published articles.
    if (status === "PUBLISHED") {
      const fbCount = randInt(0, 5);
      for (let i = 0; i < fbCount; i++) {
        const helpful = Math.random() < 0.85;
        await db.kbArticleFeedback.create({
          data: {
            articleId: a.id,
            helpful,
            comment: !helpful && Math.random() < 0.6
              ? rand(["Wasn't quite what I was looking for.", "Could use a video.", "Out of date — UI doesn't match.", "Too short, missing detail."])
              : (Math.random() < 0.2 ? rand(["Nailed it.", "Saved me an hour."]) : null),
            createdAt: new Date(createdAt.getTime() + randInt(2, 60) * DAY),
          },
        });
      }
    }

    // Spanish locale variant for ~20% of published articles.
    if (status === "PUBLISHED" && Math.random() < 0.2) {
      await db.kbArticle.create({
        data: {
          slug,
          locale: "es",
          title: tmpl.title + " (ES)",
          summary: tmpl.summary,
          bodyMarkdown: tmpl.body,
          categoryId: slugToId.get(tmpl.categorySlug) ?? null,
          status: rand(["PUBLISHED", "DRAFT", "REVIEW"] as KbArticleStatus[]),
          visibility,
          featured: false,
          authorId: author.id,
          tags: tmpl.tags,
          createdAt,
          updatedAt,
        },
      });
    }

    articleCount += 1;
  }

  // Search analytics rows — clicks link to actual seeded articles when
  // results > 0. Drives the search-analytics page (most clicks, zero
  // result, daily trend) and the per-article Analytics tab.
  const queries = [
    "stripe", "invoice not paid", "reset password", "production stages",
    "google calendar", "csv import", "tax setup", "refund customer",
    "quote pdf", "team invite", "cancel subscription", "two factor",
    "white label", "api key", "webhook",
  ];
  const allArticles = await db.kbArticle.findMany({
    where: { tags: { has: "seed" }, status: "PUBLISHED" },
    select: { id: true },
    take: 100,
  });
  for (let i = 0; i < 200; i++) {
    const q = rand(queries);
    const isZeroResult = q === "white label" || q === "api key";
    const resultsCount = isZeroResult ? 0 : randInt(1, 8);
    const clicked = !isZeroResult && Math.random() < 0.45 && allArticles.length > 0
      ? rand(allArticles).id
      : null;
    await db.kbSearchQuery.create({
      data: {
        query: `${SEED_TAG} ${q}`,
        resultsCount,
        clickedArticleId: clicked,
        at: daysAgo(randInt(0, 29)),
      },
    });
  }

  // KbArticleView impressions — power the per-article analytics charts.
  let viewLogs = 0;
  for (const a of allArticles) {
    const samples = randInt(20, 250);
    for (let i = 0; i < samples; i++) {
      await db.kbArticleView.create({
        data: {
          articleId: a.id,
          source: rand(["search", "in-product", "category", "direct"] as const),
          createdAt: daysAgo(randInt(0, 29)),
        },
      });
      viewLogs += 1;
    }
  }

  console.log(`  ✓ ${slugToId.size} categories, ${articleCount} articles, 200 search queries, ${viewLogs} view logs`);
}

/* ── Announcements (Page 35) ─────────────────────────── */

const ANNOUNCEMENT_TEMPLATES: {
  title: string;
  body: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  channels: AnnouncementChannel[];
  changelogCategory?: ChangelogCategory;
  cta?: { label: string; url: string };
}[] = [
  {
    title: "New: Bulk customer import from CSV",
    body: "Spreadsheet too long to copy-paste? You can now import customers in bulk from a CSV file. Includes tag auto-creation and dedupe by email.",
    type: "NEW_FEATURE", priority: "INFO",
    channels: ["BANNER", "INBOX", "CHANGELOG", "EMAIL"],
    changelogCategory: "FEATURE",
    cta: { label: "Open import wizard", url: "/customers/import" },
  },
  {
    title: "Quote PDF rendering 4x faster",
    body: "We rebuilt the PDF pipeline. Quotes with 50+ line items used to take ~12 seconds to generate; now they're under 3.",
    type: "RELEASE", priority: "INFO",
    channels: ["INBOX", "CHANGELOG"],
    changelogCategory: "IMPROVEMENT",
  },
  {
    title: "Scheduled maintenance — Sunday 02:00-03:00 UTC",
    body: "We're upgrading the primary database. The app will be read-only for ~30 minutes during the window.",
    type: "MAINTENANCE", priority: "IMPORTANT",
    channels: ["BANNER", "MODAL", "EMAIL"],
  },
  {
    title: "Stripe webhooks delayed — investigating",
    body: "We're seeing 5-10 minute delays on Stripe webhook processing for some tenants. The team is rolling out a fix; subscription states will catch up once deployed.",
    type: "INCIDENT", priority: "CRITICAL",
    channels: ["BANNER", "EMAIL"],
  },
  {
    title: "Pricing update — new Enterprise tier",
    body: "We're introducing a dedicated Enterprise tier with SSO, audit log export, and priority support. Existing Pro customers retain their current pricing.",
    type: "PRICING", priority: "IMPORTANT",
    channels: ["EMAIL", "CHANGELOG"],
    changelogCategory: "FEATURE",
    cta: { label: "See pricing", url: "/pricing" },
  },
  {
    title: "Fixed: Production stage sort order",
    body: "Stages saved out of order in some browsers. Now persists exactly as you arrange them.",
    type: "RELEASE", priority: "INFO",
    channels: ["INBOX", "CHANGELOG"],
    changelogCategory: "FIX",
  },
  {
    title: "Security: 2FA now required for owners",
    body: "Effective next month, two-factor auth will be required for tenant owners. Set yours up now to avoid disruption.",
    type: "GENERAL", priority: "IMPORTANT",
    channels: ["BANNER", "EMAIL", "CHANGELOG"],
    changelogCategory: "SECURITY",
    cta: { label: "Set up 2FA", url: "/settings/security" },
  },
  {
    title: "Deprecating legacy v1 API",
    body: "The v1 API will sunset on 2026-09-01. v2 is fully backward-compatible for all read endpoints — write endpoints need a small migration.",
    type: "GENERAL", priority: "INFO",
    channels: ["EMAIL", "CHANGELOG"],
    changelogCategory: "DEPRECATION",
  },
  {
    title: "Real-time order updates rolling out",
    body: "Your jobs board now updates live as production stages move — no more manual refresh.",
    type: "NEW_FEATURE", priority: "INFO",
    channels: ["INBOX", "CHANGELOG", "PUSH"],
    changelogCategory: "FEATURE",
  },
  {
    title: "iOS app v2.4 is live",
    body: "iPad layout, offline proof signing, and a redesigned customer detail screen.",
    type: "RELEASE", priority: "INFO",
    channels: ["INBOX", "CHANGELOG", "PUSH"],
    changelogCategory: "FEATURE",
    cta: { label: "Update on App Store", url: "https://apps.apple.com/" },
  },
];

async function seedAnnouncements(
  staff: { id: string; email: string }[],
  tenants: { id: string }[],
) {
  console.log("\n── Seeding announcements (Page 35)…");
  let count = 0;

  for (const tmpl of ANNOUNCEMENT_TEMPLATES) {
    const ageDays = randInt(0, 60);
    const createdAt = daysAgo(ageDays);
    const author = rand(staff);

    const status: AnnouncementStatus = (() => {
      if (ageDays > 30) return Math.random() < 0.5 ? "ARCHIVED" : "PUBLISHED";
      if (ageDays > 5)  return Math.random() < 0.7 ? "PUBLISHED" : "ARCHIVED";
      const r = Math.random();
      if (r < 0.15) return "DRAFT";
      if (r < 0.30) return "SCHEDULED";
      return "PUBLISHED";
    })();

    const audience: AnnouncementAudience = rand(["ALL", "ALL", "ALL", "PLAN", "COHORT"] as const);
    const publishAt = status === "SCHEDULED"
      ? new Date(Date.now() + randInt(1, 7) * DAY)
      : null;
    const publishedAt = status === "PUBLISHED" || status === "ARCHIVED"
      ? new Date(createdAt.getTime() + randInt(0, 24) * 3_600_000)
      : null;

    const expireAt = (status === "PUBLISHED" && Math.random() < 0.4)
      ? new Date((publishedAt ?? createdAt).getTime() + randInt(7, 60) * DAY)
      : null;

    const a = await db.platformAnnouncement.create({
      data: {
        title: tmpl.title,
        body: tmpl.body,
        type: tmpl.type,
        priority: tmpl.priority,
        status,
        audience,
        audiencePlans: audience === "PLAN" ? rand([["GROWTH", "PRO", "ENTERPRISE"], ["PRO", "ENTERPRISE"], ["ENTERPRISE"]]) : [],
        audienceCohorts: audience === "COHORT" ? rand([["BETA"], ["ALPHA", "BETA"]]) : [],
        audienceTenantIds: [],
        channels: tmpl.channels,
        ctaLabel: tmpl.cta?.label ?? null,
        ctaUrl: tmpl.cta?.url ?? null,
        heroImageUrl: Math.random() < 0.3
          ? `https://images.unsplash.com/photo-${rand(["1517336714731", "1554475901", "1551836022"])}-bb6f04c4d65f?w=1200`
          : null,
        frequencyCap: rand(["UNLIMITED", "ONCE", "ONCE", "DAILY"] as const),
        changelogCategory: tmpl.changelogCategory ?? null,
        audienceCustomersOnly: tmpl.changelogCategory === "DEPRECATION",
        publishAt,
        publishedAt,
        expireAt,
        emailedAt: tmpl.channels.includes("EMAIL") && status === "PUBLISHED"
          ? new Date((publishedAt ?? createdAt).getTime() + 60 * 60 * 1000)
          : null,
        emailedRecipientCount: tmpl.channels.includes("EMAIL") && status === "PUBLISHED"
          ? randInt(50, 500)
          : 0,
        tags: ["seed"],
        authorId: author.id,
        createdAt,
        updatedAt: publishedAt ?? createdAt,
      },
      select: { id: true },
    });

    // Generate views/clicks/dismissals for published items.
    if (status === "PUBLISHED" || status === "ARCHIVED") {
      const tenantUsers = await db.user.findMany({
        where: { memberships: { some: { tenantId: { in: tenants.map((t) => t.id) } } } },
        select: { id: true, memberships: { select: { tenantId: true }, take: 1 } },
        take: 50,
      });
      const sampleUsers = sample(tenantUsers, randInt(2, Math.max(2, tenantUsers.length)));
      for (const u of sampleUsers) {
        const tenantId = u.memberships[0]?.tenantId;
        if (!tenantId) continue;
        const seenAt = new Date((publishedAt ?? createdAt).getTime() + randInt(0, 6) * 3_600_000);
        const clicked = Math.random() < 0.18;
        const dismissed = !clicked && Math.random() < 0.5;
        await db.platformAnnouncementView.upsert({
          where: { announcementId_userId: { announcementId: a.id, userId: u.id } },
          create: {
            announcementId: a.id,
            userId: u.id,
            tenantId,
            seenAt,
            dismissedAt: dismissed ? new Date(seenAt.getTime() + randInt(5, 600) * 60_000) : null,
            clickedAt:   clicked  ? new Date(seenAt.getTime() + randInt(5, 300) * 60_000) : null,
          },
          update: {},
        });
      }
    }
    count += 1;
  }

  // Seed a few channel-variant overrides + A/B variants on a couple
  // of published announcements so the new editor sections aren't empty.
  const liveAnns = await db.platformAnnouncement.findMany({
    where: { status: "PUBLISHED", tags: { has: "seed" } },
    select: { id: true, channels: true, body: true },
    take: 3,
  });
  for (const a of liveAnns) {
    if (a.channels.includes("EMAIL")) {
      await db.announcementChannelVariant.upsert({
        where: { announcementId_channel: { announcementId: a.id, channel: "EMAIL" } },
        create: {
          announcementId: a.id,
          channel: "EMAIL",
          title: null,
          body: `${a.body}\n\nSent because you're subscribed to Flowtora product updates. Manage your preferences in Settings → Notifications.`,
          ctaLabel: "Read on the changelog",
        },
        update: {},
      });
    }
    // Two A/B variants per announcement.
    const labels = ["A — short", "B — long"];
    for (let i = 0; i < labels.length; i++) {
      const existing = await db.announcementAbVariant.findFirst({
        where: { announcementId: a.id, label: labels[i]! },
      });
      if (existing) continue;
      await db.announcementAbVariant.create({
        data: {
          announcementId: a.id,
          label: labels[i]!,
          title: null,
          body: i === 0 ? a.body.slice(0, 80) + "…" : a.body + "\n\nLearn more about this update on the blog.",
          weightPct: 50,
          viewCount: randInt(40, 600),
          clickCount: randInt(5, 80),
        },
      });
    }
  }

  // Seed a few extra DRAFT templates so the Templates tab isn't empty.
  for (let i = 0; i < 3; i++) {
    await db.platformAnnouncement.create({
      data: {
        title: `Template — ${rand(["Outage post-mortem", "Feature launch", "Pricing change", "Holiday hours"])}`,
        body: "Reusable copy. Replace tokens before sending.",
        type: "GENERAL",
        priority: "INFO",
        status: "DRAFT",
        audience: "ALL",
        channels: ["BANNER"],
        tags: ["seed", "template"],
        authorId: rand(staff).id,
        createdAt: daysAgo(randInt(20, 90)),
      },
    });
  }

  console.log(`  ✓ ${count + 3} announcements with view tracking`);
}

/* ── Feature Requests (Page 36) ──────────────────────── */

const FR_TEMPLATES: {
  title: string;
  description: string;
  swimlane: string;
  tags: string[];
  preferredStatus?: FeatureRequestStatus;
  effort?: EngineeringEffort;
  ice?: { i: number; c: number; e: number };
}[] = [
  { title: "Bulk export of completed jobs as CSV",
    description: "## Why\n\nAccounting software needs a CSV with customer, total, and completion date for every closed job in a window.\n\n## What\n\n- Filter by date range\n- Pick columns\n- Background job for >5k rows + email when done",
    swimlane: "Reports", tags: ["export", "csv", "reports"],
    preferredStatus: "PLANNED", effort: "M", ice: { i: 7, c: 8, e: 6 } },
  { title: "Square as a payment processor",
    description: "Several shops are on Square for in-store and want one accounting flow. Connect Square via OAuth, sync payouts, and reconcile invoices.",
    swimlane: "Billing", tags: ["square", "payments"],
    preferredStatus: "UNDER_REVIEW", effort: "L", ice: { i: 9, c: 6, e: 3 } },
  { title: "Mobile app — offline proof signing",
    description: "Installers in the field lose signal mid-job. Cache the proof PDF locally, capture the signature, and sync once back on Wi-Fi.",
    swimlane: "Mobile", tags: ["mobile", "offline", "proofs"],
    preferredStatus: "BETA", effort: "L", ice: { i: 8, c: 7, e: 4 } },
  { title: "Two-way Google Calendar sync",
    description: "Today the sync is one-way. Pulling external events from a tech's calendar would prevent double-booking.",
    swimlane: "Integrations", tags: ["google", "calendar"],
    preferredStatus: "BACKLOG", effort: "L", ice: { i: 6, c: 5, e: 4 } },
  { title: "Per-customer default tax rate",
    description: "Some commercial customers are tax-exempt; today reps have to remember to zero out tax line. Make it a customer-level default.",
    swimlane: "Sales", tags: ["tax", "customer"],
    preferredStatus: "IN_PROGRESS", effort: "S", ice: { i: 7, c: 9, e: 9 } },
  { title: "Dashboards exportable to PDF",
    description: "Owners want to email weekly KPIs to investors. Add an Export → PDF button on the executive dashboard with auto-generated annotations.",
    swimlane: "Reports", tags: ["dashboard", "pdf", "executive"],
    preferredStatus: "BACKLOG", effort: "M", ice: { i: 5, c: 6, e: 6 } },
  { title: "Native mobile push notifications for installers",
    description: "When an install is rescheduled or the customer reschedules, the assigned installer should get a push within seconds — not at the next email check.",
    swimlane: "Mobile", tags: ["push", "installs"],
    preferredStatus: "PLANNED", effort: "M", ice: { i: 8, c: 7, e: 5 } },
  { title: "Custom proof watermark per tenant",
    description: "Currently watermarks are fixed text. Let shops set their own watermark — logo or shop name.",
    swimlane: "Proofs", tags: ["proofs", "branding"],
    preferredStatus: "SHIPPED", effort: "S", ice: { i: 5, c: 9, e: 9 } },
  { title: "Stripe Tax integration",
    description: "Move tax calculation from our internal table to Stripe Tax for automatic compliance across jurisdictions.",
    swimlane: "Billing", tags: ["stripe", "tax"],
    preferredStatus: "UNDER_REVIEW", effort: "XL", ice: { i: 9, c: 5, e: 2 } },
  { title: "Quote → recurring contract",
    description: "Some commercial customers buy the same job monthly (cleaning vinyl, replacement decals). Convert a quote to a recurring schedule.",
    swimlane: "Sales", tags: ["quotes", "recurring"],
    preferredStatus: "BACKLOG", effort: "L", ice: { i: 7, c: 6, e: 3 } },
  { title: "Production board — split into shifts",
    description: "Day vs night shifts have different team members; let supervisors filter the production board by shift window.",
    swimlane: "Production", tags: ["production", "shifts"],
    preferredStatus: "SUBMITTED" },
  { title: "Webhook events for order status changes",
    description: "Tenants integrating with their own ERP need a webhook when an order moves status. JSON payload with the new status + tenant id.",
    swimlane: "API", tags: ["webhooks", "api"],
    preferredStatus: "PLANNED", effort: "S", ice: { i: 8, c: 8, e: 8 } },
  { title: "Inline tax-exempt certificate uploads",
    description: "Customers with a resale certificate need to upload it once and have it apply to every invoice. Today it's a free-form note.",
    swimlane: "Billing", tags: ["tax", "compliance"],
    preferredStatus: "SUBMITTED" },
  { title: "Bulk email all open quotes",
    description: "Send a follow-up email to every quote that's been sitting >7 days without a response.",
    swimlane: "Sales", tags: ["quotes", "automation"],
    preferredStatus: "BETA", effort: "M", ice: { i: 6, c: 7, e: 7 } },
  { title: "Slack notifications for high-priority tickets",
    description: "When a P1 support ticket lands, ping a Slack channel so the on-call sees it immediately.",
    swimlane: "Integrations", tags: ["slack", "alerts"],
    preferredStatus: "IN_PROGRESS", effort: "S", ice: { i: 7, c: 9, e: 8 } },
];

async function seedFeatureRequests(
  staff: { id: string; email: string; name: string | null }[],
  tenants: { id: string; name: string }[],
) {
  console.log("\n── Seeding feature requests (Page 36)…");
  let count = 0;
  let voteCount = 0;
  let commentCount = 0;

  // Pull a couple of tenant users to author submissions.
  const tenantUsers = await db.user.findMany({
    where: { memberships: { some: { tenantId: { in: tenants.map((t) => t.id) } } } },
    select: { id: true, memberships: { select: { tenantId: true }, take: 1 } },
    take: 20,
  });

  // Pull a few real ticket ids to link.
  const seedTickets = await db.supportTicket.findMany({
    where: { subject: { startsWith: SEED_TAG } },
    select: { id: true },
    take: 10,
  });

  for (const tmpl of FR_TEMPLATES) {
    const ageDays = randInt(1, 120);
    const createdAt = daysAgo(ageDays);
    const submitter = rand(tenantUsers);
    const submitterTenantId = submitter?.memberships[0]?.tenantId ?? rand(tenants).id;

    const status: FeatureRequestStatus = tmpl.preferredStatus
      ?? rand(["SUBMITTED", "BACKLOG", "UNDER_REVIEW"] as FeatureRequestStatus[]);

    // Per-status quarter assignment.
    const quarter = (() => {
      if (status === "SHIPPED") return null;
      if (status === "IN_PROGRESS" || status === "BETA") return "2026Q2";
      if (status === "PLANNED") return rand(["2026Q3", "2026Q4"] as const);
      return null;
    })();

    const upvotes = randInt(2, 80);
    const downvotes = randInt(0, 6);
    const linkedTickets = seedTickets.length > 0 && Math.random() < 0.4
      ? sample(seedTickets, randInt(1, 3)).map((t) => t.id)
      : [];

    const fr = await db.featureRequest.create({
      data: {
        title: tmpl.title,
        description: tmpl.description,
        status,
        submitterUserId: submitter?.id ?? rand(staff).id,
        submitterTenantId,
        upvoteCount: upvotes,
        downvoteCount: downvotes,
        iceImpact: tmpl.ice?.i ?? null,
        iceConfidence: tmpl.ice?.c ?? null,
        iceEase: tmpl.ice?.e ?? null,
        effort: tmpl.effort ?? null,
        plannedRelease: quarter ?? null,
        swimlane: tmpl.swimlane,
        isPublic: status !== "SUBMITTED" && status !== "BACKLOG" && Math.random() < 0.6,
        tags: ["seed", ...tmpl.tags],
        linkedSupportTicketIds: linkedTickets,
        createdAt,
        shippedAt: status === "SHIPPED" ? daysAgo(randInt(0, 30)) : null,
      },
      select: { id: true },
    });
    count += 1;

    // Dedicated FeatureRequestVote rows (matches the counters above).
    const voteRows = [
      ...Array.from({ length: upvotes }, (): VoteDirection => "UP"),
      ...Array.from({ length: downvotes }, (): VoteDirection => "DOWN"),
    ];
    const voters = sample(tenantUsers, Math.min(tenantUsers.length, voteRows.length));
    for (let i = 0; i < voters.length; i++) {
      const u = voters[i];
      const dir = voteRows[i];
      if (!u || !dir) continue;
      try {
        await db.featureRequestVote.create({
          data: {
            requestId: fr.id,
            userId: u.id,
            direction: dir,
            createdAt: new Date(createdAt.getTime() + randInt(60, 60 * 24) * 60_000),
          },
        });
        voteCount += 1;
      } catch {
        // unique violation — skip
      }
    }

    // 0-3 comments per request from random staff/tenant users.
    const cmts = randInt(0, 3);
    for (let i = 0; i < cmts; i++) {
      const author = Math.random() < 0.5 ? rand(staff) : (rand(tenantUsers) ?? rand(staff));
      await db.featureRequestComment.create({
        data: {
          requestId: fr.id,
          authorId: author.id,
          body: rand([
            "Strong +1 — this would unblock our biggest accounts.",
            "We've been working around this with a hacky CSV. A native option would be so much cleaner.",
            "Pinged engineering; we want to scope this in the next sprint.",
            "Could we ship a smaller version first? Even just the date filter.",
            "I tagged the related tickets so the conversion threshold is clearer.",
          ]),
          createdAt: new Date(createdAt.getTime() + randInt(2, 60) * 3_600_000),
        },
      });
      commentCount += 1;
    }
  }

  // Also create one merged-into example so the merged-in panel has data.
  const survivors = await db.featureRequest.findMany({
    where: { tags: { has: "seed" }, status: { in: ["PLANNED", "IN_PROGRESS"] } },
    select: { id: true, title: true },
    take: 1,
  });
  if (survivors.length > 0) {
    const survivor = survivors[0]!;
    const merged = await db.featureRequest.create({
      data: {
        title: "Duplicate — pls let us export jobs to CSV",
        description: "Same as the survivor, just opened separately by another tenant. Marking as merged.",
        status: "BACKLOG",
        tags: ["seed", "merged-test"],
        upvoteCount: 5,
        mergedIntoId: survivor.id,
        mergedAt: daysAgo(7),
        submitterUserId: rand(staff).id,
        submitterTenantId: rand(tenants).id,
      },
    });
    console.log(`  ✓ marked ${merged.id.slice(0, 8)} as merged into ${survivor.id.slice(0, 8)}`);
  }

  console.log(`  ✓ ${count} feature requests, ${voteCount} votes, ${commentCount} comments`);
}

/* ── Bugs (Page 37) ──────────────────────────────────── */

const BUG_TEMPLATES: {
  title: string;
  module: SupportTicketModule;
  severity: BugSeverity;
  status: BugStatus;
  environment: BugEnvironment;
  description: string;
  reproSteps: string;
  expected: string;
  actual: string;
  browserOS?: string;
  frequency: BugFrequency;
  businessImpact?: string;
  tags: string[];
  hasSentry?: boolean;
  hasLinear?: boolean;
  hasJira?: boolean;
  rootCause?: string;
  fixDescription?: string;
}[] = [
  {
    title: "Stripe webhooks 5xx after invoice voids",
    module: "BILLING", severity: "SEV1", status: "IN_REVIEW", environment: "PRODUCTION",
    description: "Voiding a paid invoice triggers a webhook handler that throws on null charge id.\n\nObserved on 2026-04-22 ~14:00 UTC.",
    reproSteps: "1. Issue an invoice and pay it via Stripe.\n2. Go to invoice detail → Void invoice.\n3. Watch logs — webhook handler throws.",
    expected: "Webhook returns 200 and invoice flips to VOID.",
    actual: "Webhook returns 500; invoice stays paid + an audit row complains about the null charge.",
    browserOS: "n/a (server)",
    frequency: "ALWAYS",
    businessImpact: "Blocks finance team from voiding mistaken invoices for ~12 active tenants.",
    tags: ["seed", "stripe", "regression", "billing"],
    hasSentry: true, hasLinear: true,
  },
  {
    title: "Quote PDF logo renders fuzzy on Retina",
    module: "QUOTES", severity: "SEV3", status: "RESOLVED", environment: "PRODUCTION",
    description: "Logo on the quote PDF is rasterized at 1x; looks fuzzy on retina displays + when printed.",
    reproSteps: "1. Generate any quote PDF as a tenant with a logo set.\n2. View on a 2x display or print.",
    expected: "Crisp logo at 2x density.",
    actual: "Visibly jagged.",
    browserOS: "Chrome 124 / macOS 14",
    frequency: "ALWAYS",
    businessImpact: "Cosmetic — but customers screenshot quotes for proposals.",
    tags: ["seed", "pdf", "branding"],
    hasSentry: false,
    rootCause: "PDF kit was rendering raster at 1x device pixels because the logo URL skipped the @2x suffix selector.",
    fixDescription: "Changed PdfKit logo loader to fetch the original asset and embed it as a vector when SVG, fallback to 2x raster otherwise.",
  },
  {
    title: "Order status reverts overnight on tenants in EST",
    module: "ORDERS", severity: "SEV2", status: "IN_PROGRESS", environment: "PRODUCTION",
    description: "Some EST tenants find their READY orders reverting to IN_PRODUCTION at ~02:00 local.",
    reproSteps: "1. Mark an order READY before midnight EST.\n2. Wait until 02:00 EST.\n3. Refresh — status is IN_PRODUCTION again.",
    expected: "Status persists.",
    actual: "Reverts.",
    frequency: "OFTEN",
    businessImpact: "On-time delivery rate is materially affected for the eastern shops.",
    tags: ["seed", "timezone", "schedule"],
    hasSentry: true,
  },
  {
    title: "Sign-in fails with `Unable to handle code` on magic links",
    module: "AUTH", severity: "SEV2", status: "TRIAGED", environment: "PRODUCTION",
    description: "A subset of magic-link sign-ins return Unable to handle code. No pattern by browser yet — possibly link-prefetch by anti-phishing scanners.",
    reproSteps: "Receive magic link email → click the button.",
    expected: "Sign in.",
    actual: "Generic error page.",
    frequency: "SOMETIMES",
    tags: ["seed", "auth", "magic-link"],
    hasSentry: true,
  },
  {
    title: "Proof email doesn't render the inline image on Outlook",
    module: "EMAIL", severity: "SEV3", status: "WONT_FIX", environment: "PRODUCTION",
    description: "Outlook 2016/2019 doesn't display the inline preview image — only the attached one. Workaround: use the attached version.",
    reproSteps: "Send a proof to an Outlook 2016 address; open the email.",
    expected: "Inline preview renders.",
    actual: "Empty image placeholder.",
    frequency: "ALWAYS",
    tags: ["seed", "email", "outlook"],
    hasSentry: false,
    rootCause: "Outlook strips inline images served via base64 over a certain size.",
    fixDescription: "Documented workaround in the help center; not patching for legacy Outlook.",
  },
  {
    title: "Production stage timing skews when WorkStation is reassigned mid-job",
    module: "ORDERS", severity: "SEV3", status: "NEW", environment: "PRODUCTION",
    description: "If you move a stage from one WorkStation to another mid-run, the active-time accounting double-counts.",
    reproSteps: "1. Start a stage on Station A.\n2. Pause it.\n3. Reassign to Station B and resume.",
    expected: "Active time totals to elapsed minus pauses.",
    actual: "It's overcounted.",
    frequency: "RARE",
    tags: ["seed", "production", "metrics"],
    hasSentry: false,
  },
  {
    title: "Customer portal becomes unresponsive on slow networks",
    module: "PORTAL", severity: "SEV2", status: "IN_PROGRESS", environment: "PRODUCTION",
    description: "Tenants with throttled networks (3G class) report 8-10s loads on the proof viewer page; sometimes never finishes.",
    reproSteps: "Throttle to 3G in DevTools, load /portal/p/<token>.",
    expected: "<3s.",
    actual: "8-10s+.",
    browserOS: "Chrome 124, mobile Safari iOS 17",
    frequency: "OFTEN",
    businessImpact: "Customers bail before reviewing — proofs sit unviewed for days.",
    tags: ["seed", "portal", "performance"],
    hasSentry: true, hasLinear: true,
  },
  {
    title: "Bulk import mis-maps `phone_number` column",
    module: "REPORTS", severity: "SEV4", status: "RESOLVED", environment: "PRODUCTION",
    description: "CSV import maps `phone_number` to billingEmail instead of phone.",
    reproSteps: "Import a CSV with a column literally named `phone_number`.",
    expected: "Maps to phone.",
    actual: "Maps to billingEmail.",
    frequency: "OFTEN",
    tags: ["seed", "import", "csv"],
    hasSentry: false,
    rootCause: "Heuristic column matcher matched `phone_number` against `billing_email` because both contain `_` — fixed precedence rule.",
    fixDescription: "Replaced lexical match with a hand-tuned label list; added regression test for the failing case.",
  },
  {
    title: "Search index returns stale results after article re-publish",
    module: "REPORTS", severity: "SEV3", status: "RELEASED", environment: "PRODUCTION",
    description: "KB article search shows the previous body for ~5 minutes after re-publish.",
    reproSteps: "Publish edits, immediately search the changed phrase.",
    expected: "New body indexed.",
    actual: "Old body until cache expires.",
    frequency: "ALWAYS",
    tags: ["seed", "search", "cache"],
    hasSentry: false,
    rootCause: "Search cache TTL didn't invalidate on KbArticle.update.",
    fixDescription: "Added invalidation hook in saveKbArticle; verified by support staff.",
  },
  {
    title: "Settings → Team add-member loops on duplicate email",
    module: "ADMIN", severity: "SEV4", status: "NEW", environment: "STAGING",
    description: "Inviting a teammate whose email is already a tenant member shows a flash error and leaves the form in a half-submitted state.",
    reproSteps: "Settings → Team → invite member with an existing member's email.",
    expected: "Clear error + reset form.",
    actual: "Form spinner stuck.",
    frequency: "ALWAYS",
    tags: ["seed", "ux", "team"],
    hasSentry: false,
  },
];

async function seedBugs(
  staff: { id: string; email: string; name: string | null }[],
  tenants: { id: string; name: string }[],
) {
  console.log("\n── Seeding bugs (Page 37)…");
  let count = 0;
  let activityCount = 0;
  let impactCount = 0;
  let commentCount = 0;
  for (const tmpl of BUG_TEMPLATES) {
    const ageDays = randInt(1, 60);
    const createdAt = daysAgo(ageDays);
    const reporter = rand(staff);
    const reporterTenant = rand(tenants);
    const assignee = (tmpl.status === "NEW" || tmpl.status === "TRIAGED") && Math.random() < 0.4
      ? null
      : rand(staff);

    const triagedAt = (["NEW"].includes(tmpl.status)) ? null
      : new Date(createdAt.getTime() + randInt(1, 12) * 3_600_000);
    const startedAt = (["NEW", "TRIAGED"].includes(tmpl.status)) ? null
      : new Date((triagedAt ?? createdAt).getTime() + randInt(2, 24) * 3_600_000);
    const resolvedAt = (["RESOLVED", "RELEASED"].includes(tmpl.status))
      ? new Date((startedAt ?? createdAt).getTime() + randInt(4, 72) * 3_600_000)
      : null;
    const releasedAt = tmpl.status === "RELEASED"
      ? new Date((resolvedAt ?? createdAt).getTime() + randInt(2, 36) * 3_600_000)
      : null;

    const sentryId = tmpl.hasSentry
      ? `FLOWTORA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      : null;
    const linearId = tmpl.hasLinear
      ? `ENG-${randInt(1000, 9999)}`
      : null;
    const jiraId = tmpl.hasJira
      ? `PLT-${randInt(100, 999)}`
      : null;

    const bug = await db.bug.create({
      data: {
        title: tmpl.title,
        description: tmpl.description,
        reproSteps: tmpl.reproSteps,
        expected: tmpl.expected,
        actual: tmpl.actual,
        browserOS: tmpl.browserOS ?? null,
        frequency: tmpl.frequency,
        businessImpact: tmpl.businessImpact ?? null,
        severity: tmpl.severity,
        status: tmpl.status,
        environment: tmpl.environment,
        module: tmpl.module,
        reporterUserId: reporter.id,
        reporterTenantId: reporterTenant.id,
        assigneeUserId: assignee ? assignee.id : null,
        linkedSentryIssueId: sentryId,
        linkedLinearIssueId: linearId,
        linkedJiraIssueId: jiraId,
        tags: tmpl.tags,
        rootCause: tmpl.rootCause ?? null,
        fixDescription: tmpl.fixDescription ?? null,
        verifiedByUserId: tmpl.fixDescription ? rand(staff).id : null,
        postmortemUrl: (tmpl.severity === "SEV1" || tmpl.severity === "SEV2") && (tmpl.status === "RESOLVED" || tmpl.status === "RELEASED")
          ? `https://flowtora.com/postmortems/${createdAt.toISOString().slice(0, 10)}-${tmpl.module.toLowerCase()}`
          : null,
        lastSyncedAt: tmpl.hasSentry ? new Date(createdAt.getTime() + randInt(60, 600) * 60_000) : null,
        createdAt,
        triagedAt,
        startedAt,
        resolvedAt,
        releasedAt,
      },
      select: { id: true, number: true },
    });
    count += 1;

    // Activity feed
    await db.bugActivity.create({
      data: { bugId: bug.id, action: "created", actorId: reporter.id, details: { severity: tmpl.severity }, createdAt },
    });
    activityCount += 1;
    if (triagedAt) {
      await db.bugActivity.create({
        data: { bugId: bug.id, action: "status_changed", actorId: rand(staff).id, details: { from: "NEW", to: "TRIAGED" }, createdAt: triagedAt },
      });
      activityCount += 1;
    }
    if (assignee) {
      await db.bugActivity.create({
        data: { bugId: bug.id, action: "assignee_changed", actorId: rand(staff).id, details: { from: null, to: assignee.id }, createdAt: triagedAt ?? createdAt },
      });
      activityCount += 1;
    }
    if (sentryId) {
      await db.bugActivity.create({
        data: { bugId: bug.id, action: "sentry_synced", actorId: rand(staff).id, details: { issueId: sentryId, count: randInt(50, 500), userCount: randInt(5, 80) }, createdAt: new Date(createdAt.getTime() + 600_000) },
      });
      activityCount += 1;
    }

    // Comments
    const cmts = randInt(0, 3);
    for (let i = 0; i < cmts; i++) {
      await db.bugComment.create({
        data: {
          bugId: bug.id,
          authorId: rand(staff).id,
          body: rand([
            "Reproduced locally — looks like a race condition.",
            "Talked to the reporter; they confirmed it's still happening this week.",
            "Pulled the Sentry breadcrumbs — the failing call is in handler.ts:142.",
            "Holding pending QA review on staging.",
            "PR up — link in Linear.",
          ]),
          internal: Math.random() < 0.3,
          createdAt: new Date(createdAt.getTime() + (i + 1) * randInt(1, 12) * 3_600_000),
        },
      });
      commentCount += 1;
      activityCount += 1;
      await db.bugActivity.create({
        data: { bugId: bug.id, action: "commented", actorId: rand(staff).id, details: {}, createdAt: new Date(createdAt.getTime() + (i + 1) * randInt(1, 12) * 3_600_000) },
      });
    }

    // Tenant impacts (auto-detected when there's a Sentry link).
    const impactedTenants = sentryId
      ? sample(tenants, randInt(1, Math.min(3, tenants.length)))
      : (Math.random() < 0.5 ? sample(tenants, 1) : []);
    for (const t of impactedTenants) {
      await db.bugTenantImpact.upsert({
        where: { bugId_tenantId: { bugId: bug.id, tenantId: t.id } },
        create: {
          bugId: bug.id,
          tenantId: t.id,
          autoDetected: !!sentryId,
          firstSeenAt: createdAt,
          lastSeenAt: new Date(createdAt.getTime() + randInt(1, ageDays) * DAY),
          note: !sentryId ? "Reported via support ticket" : null,
        },
        update: {},
      });
      impactCount += 1;
    }
  }

  // Seed one duplicate-of bug to validate the duplicate UI.
  const survivor = await db.bug.findFirst({
    where: { tags: { has: "seed" }, status: "IN_REVIEW" },
    select: { id: true, title: true },
  });
  if (survivor) {
    const dup = await db.bug.create({
      data: {
        title: `[dup] ${survivor.title}`,
        description: "Filed separately by another tenant — same root cause.",
        severity: "SEV2",
        status: "DUPLICATE",
        environment: "PRODUCTION",
        module: "BILLING",
        reporterUserId: rand(staff).id,
        reporterTenantId: rand(tenants).id,
        duplicateOfId: survivor.id,
        tags: ["seed", "duplicate-test"],
      },
    });
    await db.bugActivity.create({
      data: { bugId: dup.id, action: "status_changed", actorId: rand(staff).id, details: { from: "NEW", to: "DUPLICATE" } },
    });
    activityCount += 1;
  }

  console.log(`  ✓ ${count} bugs (+1 duplicate), ${activityCount} activity events, ${commentCount} comments, ${impactCount} tenant-impacts`);
}

/* ── Landing Pages (Page 38) ─────────────────────────── */

const LP_TEMPLATES = [
  {
    path: "/seed-pricing",
    title: "Flowtora — Pricing",
    description: "Plans + Stripe-Connected billing card",
    status: "LIVE" as LandingPageStatus,
    blocks: [
      defaultBlock("header"),
      defaultBlock("hero"),
      defaultBlock("pricing"),
      defaultBlock("faq"),
      defaultBlock("cta"),
      defaultBlock("footer"),
    ],
    isPublic: true,
    abTestPrimaryMetric: "SIGNUP" as LandingPageMetric,
    metaTitle: "Pricing — Flowtora",
    metaDescription: "Plans starting at $49/month. Built for sign + print shops.",
  },
  {
    path: "/seed-features-automation",
    title: "Flowtora — Automation features",
    description: "Long-form features page",
    status: "LIVE" as LandingPageStatus,
    blocks: [
      defaultBlock("header"),
      defaultBlock("hero"),
      defaultBlock("features"),
      defaultBlock("testimonials"),
      defaultBlock("cta"),
      defaultBlock("footer"),
    ],
    isPublic: true,
    metaTitle: "Automation — Flowtora",
    metaDescription: "Quotes, jobs, and invoices on autopilot.",
  },
  {
    path: "/seed-promo-summer",
    title: "Summer promo — 30% off",
    description: "Time-limited promo lander",
    status: "DRAFT" as LandingPageStatus,
    blocks: [
      defaultBlock("hero"),
      { ...defaultBlock("cta"), props: {
        ...(defaultBlock("cta") as { props: Record<string, unknown> }).props,
        formCapture: true,
        headline: "Get 30% off your first 6 months",
        primaryLabel: "Claim my discount",
      } },
      defaultBlock("footer"),
    ],
    isPublic: false,
  },
  {
    path: "/seed-launch-mobile",
    title: "Mobile app launch",
    description: "Scheduled to publish in 2 days",
    status: "SCHEDULED" as LandingPageStatus,
    publishAtOffsetDays: 2,
    blocks: [
      defaultBlock("hero"),
      defaultBlock("features"),
      defaultBlock("cta"),
    ],
  },
];

async function seedLandingPages(staff: { id: string }[]) {
  console.log("\n── Seeding landing pages (Page 38)…");

  // Domain
  const domain = await db.landingPageDomain.create({
    data: {
      hostname: "seed-go.flowtora.example",
      verificationToken: "seed-" + Math.random().toString(36).slice(2, 10),
      status: "VERIFIED",
      verifiedAt: daysAgo(20),
    },
  });

  // Template (used by createLandingPage)
  await db.landingPageTemplate.create({
    data: {
      name: "[seed] Product page starter",
      description: "Hero · features · testimonials · pricing · CTA",
      blocks: [
        defaultBlock("header"),
        defaultBlock("hero"),
        defaultBlock("features"),
        defaultBlock("testimonials"),
        defaultBlock("pricing"),
        defaultBlock("cta"),
        defaultBlock("footer"),
      ] as never,
      category: "Product",
    },
  });

  let pageCount = 0;
  let visitCount = 0;
  let submissionCount = 0;

  for (const tmpl of LP_TEMPLATES) {
    const author = rand(staff);
    const createdAt = daysAgo(randInt(15, 60));
    const publishedAt = tmpl.status === "LIVE" ? daysAgo(randInt(2, 14)) : null;
    const publishAt = ((tmpl as { publishAtOffsetDays?: number }).publishAtOffsetDays ?? 0) > 0
      ? new Date(Date.now() + ((tmpl as { publishAtOffsetDays?: number }).publishAtOffsetDays ?? 0) * DAY)
      : null;

    const page = await db.landingPage.create({
      data: {
        path: tmpl.path,
        title: tmpl.title,
        description: tmpl.description,
        blocks: tmpl.blocks as never,
        status: tmpl.status,
        publishAt,
        publishedAt,
        authorId: author.id,
        customDomainId: tmpl.path === "/seed-pricing" ? domain.id : null,
        abTestPrimaryMetric: (tmpl as { abTestPrimaryMetric?: LandingPageMetric }).abTestPrimaryMetric ?? null,
        metaTitle: (tmpl as { metaTitle?: string }).metaTitle ?? null,
        metaDescription: (tmpl as { metaDescription?: string }).metaDescription ?? null,
        formSchema: tmpl.path === "/seed-promo-summer"
          ? [{ name: "email", type: "email", required: true, label: "Work email" }] as never
          : [] as never,
        createdAt,
      },
    });
    pageCount += 1;

    // Variants — only for the LIVE pricing page.
    if (tmpl.path === "/seed-pricing") {
      const variantBlocks = [
        defaultBlock("hero"),
        defaultBlock("pricing"),
      ];
      const v1 = await db.landingPageVariant.create({
        data: {
          pageId: page.id,
          label: "B — short copy",
          blocks: variantBlocks as never,
          trafficPct: 50,
          visitCount: randInt(80, 300),
          conversionCount: randInt(4, 18),
        },
      });
      void v1;
    }

    // Visits — only for live pages.
    if (tmpl.status === "LIVE") {
      const totalVisits = randInt(220, 600);
      for (let i = 0; i < totalVisits; i++) {
        const ageDays = randInt(0, 29);
        const sessionId = `seed-${page.id.slice(-6)}-${i}`;
        const device = rand(["DESKTOP", "DESKTOP", "DESKTOP", "MOBILE", "MOBILE", "TABLET"] as LandingPageDevice[]);
        const source = rand(["google", "twitter", "linkedin", "direct", "newsletter", "producthunt"] as const);
        const scrollDepth = rand([10, 25, 40, 60, 75, 90, 100] as const);
        const timeOnPage = randInt(2, 240);
        const converted = scrollDepth >= 60 && Math.random() < 0.06;
        const bounced = scrollDepth < 25 && timeOnPage < 5;
        await db.landingPageVisit.create({
          data: {
            pageId: page.id,
            sessionId,
            source,
            utmSource: source === "google" ? "google" : null,
            utmMedium: source === "newsletter" ? "email" : (source === "google" ? "cpc" : null),
            utmCampaign: source === "newsletter" ? "weekly-digest" : null,
            device,
            scrollDepth,
            timeOnPage,
            converted,
            bounced,
            createdAt: daysAgo(ageDays),
          },
        });
        visitCount += 1;
      }
    }

    // Submissions — only for the promo page (which has formCapture).
    if (tmpl.path === "/seed-promo-summer") {
      for (let i = 0; i < 8; i++) {
        await db.landingPageFormSubmission.create({
          data: {
            pageId: page.id,
            payload: {
              email: `prospect+${i}@example.com`,
              note: i % 3 === 0 ? "Interested for our second location" : "",
            } as never,
            email: `prospect+${i}@example.com`,
            source: "newsletter",
            utm: { source: "newsletter", campaign: "summer-promo" } as never,
            status: i < 2 ? "converted" : i < 5 ? "reviewed" : "new",
            createdAt: daysAgo(randInt(0, 12)),
          },
        });
        submissionCount += 1;
      }
    }

    // Initial revision so Versions tab isn't empty.
    await db.landingPageRevision.create({
      data: {
        pageId: page.id,
        blocks: tmpl.blocks as never,
        formSchema: [] as never,
        savedByUserId: author.id,
        note: "Initial save",
        createdAt,
      },
    });
  }

  console.log(`  ✓ ${pageCount} landing pages, ${visitCount} visits, ${submissionCount} form submissions, 1 domain, 1 template`);
}

/* ── Email Campaigns (Page 39) ───────────────────────── */

async function seedEmailCampaigns(staff: { id: string }[]) {
  console.log("\n── Seeding email campaigns (Page 39)…");

  // Audiences
  const audOwners = await db.emailAudience.create({
    data: {
      name: "[seed] Active owners on Growth+",
      description: "Tenant owners on Growth or Pro who logged in in the last 30 days.",
      filter: {
        plans: ["GROWTH", "PRO"],
        tenantStatuses: ["ACTIVE"],
        memberRoles: ["OWNER"],
      } as never,
      estimatedSize: 0,
      estimatedAt: daysAgo(2),
    },
  });
  await db.emailAudience.create({
    data: {
      name: "[seed] Beta cohort",
      description: "Owners + admins flagged as beta.",
      filter: { cohorts: ["BETA"], memberRoles: ["OWNER", "ADMIN"] } as never,
      estimatedSize: 0,
    },
  });

  // Templates
  const tmpl = await db.emailTemplate.create({
    data: {
      name: "[seed] Onboarding nudge",
      description: "Friendly check-in for new tenants",
      category: "Onboarding",
      bodyMarkdown: "## Hi {{firstName}},\n\nIt's been a week since {{tenantName}} started using Flowtora. A few quick wins from shops at your stage:\n\n- Connect Stripe so quotes auto-generate invoices\n- Import your customer list (CSV)\n- Brand your storefront\n\n[Open dashboard](https://flowtora.com/dashboard)",
      bodyHtml: "<p>Placeholder — saved by the action wrapper on next save.</p>",
    },
  });

  void audOwners;
  void tmpl;

  const CAMPAIGNS = [
    {
      name: "[seed] Q3 onboarding nudge",
      type: "ONE_OFF" as const,
      status: "SENT" as const,
      fromName: "Hugo at Flowtora",
      fromEmail: "hugo@flowtora.com",
      replyToEmail: "support@flowtora.com",
      previewText: "A few quick wins from shops at your stage.",
      bodyMarkdown: "## Hi {{firstName}},\n\nA few **quick wins** from shops at your stage:\n\n- Connect Stripe so quotes auto-generate invoices\n- Import your customer list (CSV)\n- Brand your storefront\n\n[Open dashboard](https://flowtora.com/dashboard)\n\nReplies come straight to me.",
      audienceFilter: { plans: ["STARTER", "GROWTH"], tenantStatuses: ["ACTIVE"], memberRoles: ["OWNER"] } as SegmentFilterSeed,
      utmSource: "campaign", utmMedium: "email", utmCampaign: "q3-onboarding-nudge",
      conversionGoal: "url:/dashboard",
      variants: [
        { label: "A", subject: "Two things shops typically miss in week 1", weightPct: 50 },
        { label: "B", subject: "Quick wins for {{tenantName}}", weightPct: 50 },
      ],
      simulate: { recipients: 240, openRate: 0.42, clickRate: 0.10, bounceRate: 0.015, unsubRate: 0.005 },
    },
    {
      name: "[seed] Summer promo — 30% off",
      type: "ONE_OFF" as const,
      status: "SENT" as const,
      fromName: "Flowtora",
      fromEmail: "promos@flowtora.com",
      replyToEmail: "support@flowtora.com",
      previewText: "30% off the Pro plan for the next 14 days.",
      bodyMarkdown: "## Save 30% on Pro\n\n{{firstName}}, claim **30% off** your first 6 months on Pro — multi-location, API access, premium support.\n\n[Claim my discount](https://flowtora.com/pricing?utm_source=email&utm_campaign=summer-promo)\n\nOffer ends in 14 days.",
      audienceFilter: { plans: ["GROWTH"], tenantStatuses: ["ACTIVE"], memberRoles: ["OWNER", "ADMIN"] } as SegmentFilterSeed,
      utmSource: "campaign", utmMedium: "email", utmCampaign: "summer-promo",
      variants: [
        { label: "A", subject: "30% off Pro — 14 days", weightPct: 33 },
        { label: "B", subject: "Save 30% on multi-location billing", weightPct: 33 },
        { label: "C", subject: "{{tenantName}}, ready for Pro?", weightPct: 34 },
      ],
      simulate: { recipients: 420, openRate: 0.38, clickRate: 0.14, bounceRate: 0.025, unsubRate: 0.008 },
    },
    {
      name: "[seed] Mobile app launch",
      type: "ONE_OFF" as const,
      status: "SCHEDULED" as const,
      fromName: "Flowtora Product",
      fromEmail: "product@flowtora.com",
      previewText: "iPad layout, offline proof signing, redesigned customer detail.",
      bodyMarkdown: "## Mobile v2.4 — out tomorrow\n\nWe rebuilt the mobile experience around the way installers actually work in the field.\n\n- iPad-class layout\n- Offline proof signing\n- Redesigned customer detail\n\n[Update on App Store](https://apps.apple.com/) · [Read the changelog](/changelog)",
      audienceFilter: { tenantStatuses: ["ACTIVE"], memberRoles: ["OWNER", "ADMIN"] } as SegmentFilterSeed,
      utmCampaign: "mobile-2-4-launch",
      scheduledAt: new Date(Date.now() + 2 * DAY),
      variants: [],
      simulate: null,
    },
    {
      name: "[seed] Weekly digest",
      type: "RECURRING" as const,
      status: "DRAFT" as const,
      fromName: "Flowtora Weekly",
      fromEmail: "weekly@flowtora.com",
      previewText: "What you missed this week — quick reads, no fluff.",
      bodyMarkdown: "## This week on Flowtora\n\n- New report: rolling 30d gross margin\n- Production board now supports drag-to-reschedule\n- Help center search got 3× faster\n\nAs always, [hit reply](mailto:weekly@flowtora.com) with feedback.",
      audienceFilter: { tenantStatuses: ["ACTIVE"], memberRoles: ["OWNER"] } as SegmentFilterSeed,
      utmCampaign: "weekly-digest",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
      variants: [],
      simulate: null,
    },
  ];

  let campaignCount = 0;
  let recipientCount = 0;
  let clickCount = 0;
  for (const tmpl of CAMPAIGNS) {
    const author = rand(staff);
    const createdAt = daysAgo(randInt(8, 45));
    const completedSendingAt = tmpl.status === "SENT" ? daysAgo(randInt(0, 14)) : null;
    const startedSendingAt = tmpl.status === "SENT" ? new Date((completedSendingAt ?? new Date()).getTime() - 30 * 60_000) : null;

    const audienceSize = tmpl.simulate?.recipients ?? 0;
    const innerHtml = renderEmailMarkdownInline(tmpl.bodyMarkdown);
    const fullHtml = wrapEmail(innerHtml, tmpl.previewText);
    const text = tmpl.bodyMarkdown.replace(/[#*`>_]/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

    const c = await db.emailCampaign.create({
      data: {
        name: tmpl.name,
        type: tmpl.type,
        status: tmpl.status,
        fromName: tmpl.fromName,
        fromEmail: tmpl.fromEmail,
        replyToEmail: tmpl.replyToEmail ?? null,
        previewText: tmpl.previewText ?? null,
        bodyMarkdown: tmpl.bodyMarkdown,
        bodyHtml: fullHtml,
        bodyText: text,
        audienceFilter: tmpl.audienceFilter as never,
        audienceSize,
        utmSource: tmpl.utmSource ?? null,
        utmMedium: tmpl.utmMedium ?? null,
        utmCampaign: tmpl.utmCampaign ?? null,
        conversionGoal: (tmpl as { conversionGoal?: string }).conversionGoal ?? null,
        sendStrategy: (tmpl as { scheduledAt?: Date }).scheduledAt ? "SCHEDULED" : "IMMEDIATE",
        scheduledAt: (tmpl as { scheduledAt?: Date }).scheduledAt ?? null,
        recurrenceRule: (tmpl as { recurrenceRule?: string }).recurrenceRule ?? null,
        startedSendingAt,
        completedSendingAt,
        authorId: author.id,
        createdAt,
      },
      select: { id: true },
    });
    campaignCount += 1;

    // Variants
    for (const v of tmpl.variants) {
      await db.emailCampaignSubjectVariant.create({
        data: {
          campaignId: c.id,
          label: v.label,
          subject: v.subject,
          weightPct: v.weightPct,
          sentCount: tmpl.simulate ? Math.round(audienceSize * (v.weightPct / 100)) : 0,
          openedCount: tmpl.simulate ? Math.round(audienceSize * (v.weightPct / 100) * tmpl.simulate.openRate) : 0,
          clickedCount: tmpl.simulate ? Math.round(audienceSize * (v.weightPct / 100) * tmpl.simulate.clickRate) : 0,
        },
      });
    }

    // Simulated recipients + click events.
    if (tmpl.simulate) {
      const sim = tmpl.simulate;
      for (let i = 0; i < sim.recipients; i++) {
        const sentAt = new Date((completedSendingAt ?? new Date()).getTime() - randInt(0, 30 * 60_000));
        const r = Math.random();
        let status: EmailRecipientStatus = "DELIVERED";
        const data: Record<string, unknown> = { sentAt, deliveredAt: new Date(sentAt.getTime() + 60_000) };
        if (r < sim.bounceRate) {
          status = "BOUNCED";
          data.bouncedAt = new Date(sentAt.getTime() + 30_000);
          data.deliveredAt = null;
          data.failureReason = "5.1.1 user unknown";
        } else if (r < sim.bounceRate + 0.001) {
          status = "COMPLAINED";
          data.complainedAt = new Date(sentAt.getTime() + 5 * 60_000);
        } else if (r < sim.bounceRate + sim.unsubRate) {
          status = "UNSUBSCRIBED";
          data.unsubscribedAt = new Date(sentAt.getTime() + 10 * 60_000);
        } else if (Math.random() < sim.openRate) {
          const openedAt = new Date(sentAt.getTime() + randInt(2, 60) * 60_000);
          data.openedAt = openedAt;
          status = "OPENED";
          if (Math.random() < (sim.clickRate / sim.openRate)) {
            const clickedAt = new Date(openedAt.getTime() + randInt(1, 10) * 60_000);
            data.clickedAt = clickedAt;
            status = "CLICKED";
          }
        }
        const created = await db.emailCampaignRecipient.create({
          data: {
            campaignId: c.id,
            email: `seed-recipient+${c.id.slice(-4)}-${i}@example.com`,
            trackingToken: `seed-${c.id.slice(-6)}-${i}-${Math.random().toString(36).slice(2, 8)}`,
            status,
            sentAt: data.sentAt as Date | null,
            deliveredAt: (data.deliveredAt as Date | null | undefined) ?? null,
            openedAt: (data.openedAt as Date | undefined) ?? null,
            clickedAt: (data.clickedAt as Date | undefined) ?? null,
            bouncedAt: (data.bouncedAt as Date | undefined) ?? null,
            unsubscribedAt: (data.unsubscribedAt as Date | undefined) ?? null,
            complainedAt: (data.complainedAt as Date | undefined) ?? null,
            failureReason: (data.failureReason as string | undefined) ?? null,
          },
          select: { id: true },
        });
        recipientCount += 1;
        if (status === "CLICKED") {
          await db.emailCampaignClickEvent.create({
            data: {
              campaignId: c.id,
              recipientId: created.id,
              href: rand(["https://flowtora.com/dashboard", "https://flowtora.com/pricing", "https://flowtora.com/changelog", "https://apps.apple.com/"]),
              clickedAt: data.clickedAt as Date,
            },
          });
          clickCount += 1;
        }
      }
    }
  }

  console.log(`  ✓ ${campaignCount} email campaigns, ${recipientCount} recipients, ~${clickCount} click events, 2 audiences, 1 template`);
}

interface SegmentFilterSeed {
  plans?: string[];
  tenantStatuses?: string[];
  cohorts?: string[];
  memberRoles?: string[];
  tagsAny?: string[];
  regions?: string[];
}

function renderEmailMarkdownInline(md: string): string {
  const escMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => escMap[c] ?? c);
  if (!md.trim()) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) { i += 1; continue; }
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      const level = h[1]!.length;
      out.push(`<h${level} style="margin:24px 0 12px;font-size:${level === 1 ? 24 : level === 2 ? 20 : 16}px;color:#0f172a;">${inline(esc(h[2]!))}</h${level}>`);
      i += 1; continue;
    }
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i] ?? "")) {
        items.push(esc(lines[i]!.replace(/^[-*+]\s/, "")));
        i += 1;
      }
      out.push(`<ul style="margin:0 0 16px 16px;color:#0f172a;font-size:14px;line-height:1.6;">${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|[-*+]\s)/.test(lines[i] ?? "")) {
      buf.push(esc(lines[i] ?? ""));
      i += 1;
    }
    out.push(`<p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*/g, "<em>$1</em>");
}

function wrapEmail(innerHtml: string, previewText: string | null | undefined): string {
  const preview = previewText
    ? `<div style="display:none;visibility:hidden;opacity:0;max-height:0;max-width:0;color:transparent;font-size:0;line-height:0;">${previewText.replace(/[<&>]/g, "")}</div>`
    : "";
  const unsub = `<p style="margin:24px 0 8px;color:#94a3b8;font-size:11px;text-align:center;">You're receiving this because you have a Flowtora account. <a href="{{unsubscribe_url}}" style="color:#94a3b8;">Unsubscribe</a>.</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Flowtora</title></head><body style="margin:0;padding:0;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">${preview}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:24px 0;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:12px;padding:32px;max-width:600px;">${innerHtml}${unsub}</table></td></tr></table></body></html>`;
}

/* ── Lifecycle / Drip Sequences (Page 40) ────────────── */

async function seedSequences(staff: { id: string }[], tenants: { id: string; name: string }[]) {
  console.log("\n── Seeding sequences (Page 40)…");

  // Install pre-built templates if not already there.
  const { PREBUILT_TEMPLATES } = await import("../src/lib/sequence-steps");
  let templateCount = 0;
  for (const t of PREBUILT_TEMPLATES) {
    const existing = await db.sequenceTemplate.findFirst({
      where: { name: t.name },
      select: { id: true },
    });
    if (existing) continue;
    await db.sequenceTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        category: t.category,
        triggerType: t.triggerType,
        triggerConfig: t.triggerConfig as never,
        blueprint: t.blueprint as never,
      },
    });
    templateCount += 1;
  }

  // Build a few realistic seeded sequences using the prebuilt blueprints.
  const SEED_PLANS = [
    {
      tmpl: PREBUILT_TEMPLATES[0]!, // Onboarding
      name: "[seed] Onboarding (active)",
      status: "ACTIVE" as const,
      enrollments: 18,
      conversionRate: 0.55,
    },
    {
      tmpl: PREBUILT_TEMPLATES[1]!, // Trial conversion
      name: "[seed] Trial conversion",
      status: "ACTIVE" as const,
      enrollments: 12,
      conversionRate: 0.33,
    },
    {
      tmpl: PREBUILT_TEMPLATES[2]!, // Win-back
      name: "[seed] Win-back (paused)",
      status: "PAUSED" as const,
      enrollments: 6,
      conversionRate: 0.16,
    },
    {
      tmpl: PREBUILT_TEMPLATES[3]!, // Feature adoption
      name: "[seed] Production board adoption",
      status: "DRAFT" as const,
      enrollments: 0,
      conversionRate: 0,
    },
  ];

  let seqCount = 0;
  let stepCount = 0;
  let enrollmentCount = 0;
  let eventCount = 0;

  for (const plan of SEED_PLANS) {
    const created = await db.sequence.create({
      data: {
        name: plan.name,
        description: plan.tmpl.description,
        triggerType: plan.tmpl.triggerType,
        triggerConfig: plan.tmpl.triggerConfig as never,
        status: plan.status,
        publishedAt: plan.status === "ACTIVE" || plan.status === "PAUSED" ? daysAgo(randInt(7, 30)) : null,
        pausedAt: plan.status === "PAUSED" ? daysAgo(randInt(1, 5)) : null,
        conversionGoal: plan.tmpl.triggerType === "TRIAL_ENDING" ? "tag:trial-converted"
                       : plan.tmpl.triggerType === "DAYS_INACTIVE" ? "event:logged_in"
                       : null,
        authorId: rand(staff).id,
      },
      select: { id: true },
    });
    seqCount += 1;

    // Materialize blueprint into steps with parent linkage.
    const idByPosition = new Map<number, string>();
    let lastBranchPos: number | null = null;
    let lastLinearPos: number | null = null;
    const stepIdsByEntry: string[] = [];
    for (let i = 0; i < plan.tmpl.blueprint.length; i++) {
      const node = plan.tmpl.blueprint[i]!;
      let parentId: string | null = null;
      let branchKey: string | null = null;
      if (node.branchKey) {
        parentId = lastBranchPos != null ? idByPosition.get(lastBranchPos) ?? null : null;
        branchKey = node.branchKey;
      } else {
        parentId = lastLinearPos != null ? idByPosition.get(lastLinearPos) ?? null : null;
      }
      const stepRow = await db.sequenceStep.create({
        data: {
          sequenceId: created.id,
          position: i,
          parentStepId: parentId,
          branchKey,
          kind: node.kind,
          config: (node.config ?? {}) as never,
          title: node.title ?? null,
        },
        select: { id: true },
      });
      idByPosition.set(i, stepRow.id);
      stepIdsByEntry.push(stepRow.id);
      stepCount += 1;
      if (node.kind === "BRANCH" || node.kind === "SPLIT") lastBranchPos = i;
      if (!node.branchKey) lastLinearPos = i;
    }

    // Seeded enrollments — distribute across step positions.
    const tenantSubset = sample(tenants, Math.min(plan.enrollments, tenants.length));
    for (let i = 0; i < plan.enrollments; i++) {
      const enrolledAt = daysAgo(randInt(1, 21));
      const isCompleted = Math.random() < plan.conversionRate;
      const isExited = !isCompleted && Math.random() < 0.15;
      const tenantPick = tenantSubset[i % tenantSubset.length] ?? rand(tenants);
      const currentStepIdx = isCompleted || isExited ? stepIdsByEntry.length - 1 : randInt(0, Math.max(0, stepIdsByEntry.length - 2));
      const enrollment = await db.sequenceEnrollment.create({
        data: {
          sequenceId: created.id,
          tenantId: tenantPick.id,
          enrolledAt,
          status: isCompleted ? "COMPLETED" : isExited ? "EXITED" : "ACTIVE",
          currentStepId: isCompleted || isExited ? null : stepIdsByEntry[currentStepIdx] ?? null,
          completedAt: isCompleted ? daysAgo(randInt(0, 3)) : null,
          exitedAt: isExited ? daysAgo(randInt(0, 5)) : null,
          exitReason: isExited ? rand(["unsubscribed", "manual exit", "goal mismatch"]) : null,
        },
        select: { id: true },
      });
      enrollmentCount += 1;

      // Generate step events along the path the enrollee walked through.
      const reachedIdx = isCompleted ? stepIdsByEntry.length - 1 : currentStepIdx;
      for (let k = 0; k <= reachedIdx; k++) {
        const stepId = stepIdsByEntry[k];
        if (!stepId) continue;
        await db.sequenceStepEvent.create({
          data: {
            enrollmentId: enrollment.id,
            stepId,
            event: "entered",
            occurredAt: new Date(enrolledAt.getTime() + k * 6 * 3_600_000),
          },
        });
        eventCount += 1;
        if (k < reachedIdx) {
          await db.sequenceStepEvent.create({
            data: {
              enrollmentId: enrollment.id,
              stepId,
              event: "completed",
              occurredAt: new Date(enrolledAt.getTime() + (k * 6 + 3) * 3_600_000),
            },
          });
          eventCount += 1;
        }
      }

      // Bump per-step entered/converted counters
      for (let k = 0; k <= reachedIdx; k++) {
        const stepId = stepIdsByEntry[k];
        if (!stepId) continue;
        await db.sequenceStep.update({
          where: { id: stepId },
          data: { enteredCount: { increment: 1 } },
        });
      }
      if (isCompleted) {
        const lastStep = stepIdsByEntry[stepIdsByEntry.length - 1];
        if (lastStep) {
          await db.sequenceStep.update({
            where: { id: lastStep },
            data: { convertedCount: { increment: 1 } },
          });
        }
      }
    }

    // Update aggregate counters on the sequence.
    const completed = Math.round(plan.enrollments * plan.conversionRate);
    const exited = Math.round(plan.enrollments * 0.15);
    const active = plan.enrollments - completed - exited;
    await db.sequence.update({
      where: { id: created.id },
      data: {
        totalEnrolled: plan.enrollments,
        activeEnrolled: Math.max(0, active),
        totalConverted: completed,
      },
    });
  }

  console.log(`  ✓ ${seqCount} sequences, ${stepCount} steps, ${enrollmentCount} enrollments, ${eventCount} events, ${templateCount} new templates`);
}

/* ── Page 41 — Referrals ─────────────────────────────── */

async function seedReferrals(tenants: { id: string; name: string; slug: string }[]) {
  console.log("── Seeding referral program (Page 41)…");
  if (tenants.length < 2) {
    console.log("  skipped — need at least 2 tenants for referrer/referee pairs");
    return;
  }

  // 1. Singleton settings — explicitly stamp something concrete so the
  // editor renders against a real edited row rather than the lazy default.
  await db.referralProgramSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      active: true,
      referrerRewardKind: "CREDIT",
      referrerRewardCreditCents: 10_000,
      referrerRewardFreeMonths: 1,
      referrerRewardCashCents: 5_000,
      refereeDiscountPct: 20,
      refereeDiscountMonths: 3,
      minimumSpendCents: 10_000,
      attributionWindowDays: 60,
      signupToPaidWindowDays: 45,
      rewardHoldDays: 14,
    },
    update: { active: true },
  });

  // 2. Mint codes for ~8 of the seeded tenants. Code format SEED-<rand>
  // so the wipe can remove them cleanly.
  const referrers = tenants.slice(0, Math.min(8, tenants.length));
  const codes: { id: string; tenantId: string; tenantName: string; code: string }[] = [];
  for (const t of referrers) {
    const safe = t.slug.replace(/[^a-z0-9]+/gi, "").toUpperCase().slice(0, 4) || "TNT";
    const code = `SEED-${safe}-${randInt(1000, 9999)}`;
    const created = await db.tenantReferralCode.create({
      data: { tenantId: t.id, code },
    });
    codes.push({ id: created.id, tenantId: t.id, tenantName: t.name, code });
  }

  // 3. Funnel rows. We pick varying outcome distributions per referrer so
  // the leaderboard ranks differently and KPIs reflect a realistic mix.
  // Each referrer drives anywhere from 3-14 funnel rows.
  let totalRows = 0;
  let totalSignups = 0;
  let totalConversions = 0;
  let totalRewards = 0;
  let fraudFlags = 0;

  type Plan = {
    clicked: number;       // ends as just CLICKED (no signup)
    signedUp: number;      // SIGNED_UP only
    trialed: number;       // got into trial, didn't pay
    paid: number;          // hit PAID
    rewarded: number;      // PAID + reward released
    expired: number;       // signed up but window lapsed
    fraud: number;         // flagged
  };
  const plans: Plan[] = [
    // Strong referrer: lots of conversions, mostly clean
    { clicked: 6, signedUp: 1, trialed: 1, paid: 2, rewarded: 4, expired: 0, fraud: 0 },
    // Mid — healthy conversions
    { clicked: 4, signedUp: 2, trialed: 1, paid: 1, rewarded: 2, expired: 1, fraud: 0 },
    // Volume but low quality — many clicks, some fraud
    { clicked: 9, signedUp: 1, trialed: 1, paid: 0, rewarded: 1, expired: 1, fraud: 1 },
    // Mid-low
    { clicked: 3, signedUp: 1, trialed: 0, paid: 0, rewarded: 1, expired: 0, fraud: 0 },
    // Just signups — no one converted
    { clicked: 5, signedUp: 3, trialed: 1, paid: 0, rewarded: 0, expired: 1, fraud: 0 },
    // Suspicious — multiple fraud flags
    { clicked: 2, signedUp: 0, trialed: 0, paid: 0, rewarded: 0, expired: 0, fraud: 2 },
    // Just clicks
    { clicked: 4, signedUp: 0, trialed: 0, paid: 0, rewarded: 0, expired: 0, fraud: 0 },
    // Steady performer
    { clicked: 3, signedUp: 1, trialed: 1, paid: 1, rewarded: 1, expired: 0, fraud: 0 },
  ];

  const fraudFlagPool = [
    "SAME_IP", "SAME_FINGERPRINT", "BURST_SIGNUPS",
    "BLACKLISTED_DOMAIN", "RAPID_CLICKS", "PAYMENT_REVERSED",
  ] as const;
  const fraudReasons: Record<string, string> = {
    SAME_IP: "Three signups from the same /24 in 24h",
    SAME_FINGERPRINT: "Browser fingerprint matched referrer's session",
    BURST_SIGNUPS: "5 conversions in under 30 minutes — outside normal pattern",
    BLACKLISTED_DOMAIN: "Email domain on the disposable-mailbox blocklist",
    RAPID_CLICKS: "200+ clicks from one IP in <5min",
    PAYMENT_REVERSED: "Referee charged back the first invoice within 7 days",
  };

  const refereeNames = [
    "Bright Sign Co.", "Dakota Print Lab", "Edge Banner Studio", "Foothills Imaging",
    "Gateway Wide-Format", "Helio Display", "Ironside Sign Works", "Junction Print",
    "Kestrel Signage", "Lighthouse Visuals", "Magnolia Print Co.", "Northstar Studio",
    "Oakridge Signs", "Pacific Wrap House", "Quartz Display", "Riverside Banner",
    "Summit Sign Lab", "Twilight Vinyl", "Unity Print", "Vanguard Signs",
    "Westwind Imaging", "Xenon Print Studio", "Yellowstone Signs", "Zenith Banner",
  ];

  for (let pi = 0; pi < codes.length; pi++) {
    const code = codes[pi]!;
    const plan = plans[pi % plans.length]!;

    const mkRow = async (kind: keyof Plan, idx: number) => {
      // Stagger across the last 30 days so the trend chart has variation.
      const ageDays = randInt(0, 29);
      const clickedAt = daysAgo(ageDays);
      const refereeEmail = `${kind.toLowerCase()}-${pi}-${idx}-${randInt(100, 999)}@example.com`;
      const refereeName = rand(refereeNames);
      // We don't have synthetic tenants for every funnel row (creating
      // tenants via seed is expensive + cascades into a lot of other
      // tables). For PAID/REWARDED rows, link to an existing tenant
      // that isn't the referrer; for others, leave referredTenantId null.
      const linkRealReferee = kind === "paid" || kind === "rewarded";
      let referredTenantId: string | null = null;
      if (linkRealReferee) {
        const candidates = tenants.filter((t) => t.id !== code.tenantId);
        // Already-attached referees skip — we only have @@unique on
        // referredTenantId so each tenant can be a referee once.
        const taken = new Set<string>(
          (await db.tenantReferral.findMany({
            where: { referredTenantId: { not: null } },
            select: { referredTenantId: true },
          })).map((r) => r.referredTenantId!).filter(Boolean),
        );
        const free = candidates.filter((c) => !taken.has(c.id));
        if (free.length > 0) {
          referredTenantId = rand(free).id;
        }
      }

      const ipBucket = randInt(1, 200);
      const baseFields = {
        codeId: code.id,
        referrerTenantId: code.tenantId,
        referredTenantId,
        referredEmail: refereeEmail,
        source: rand(["share-link", "in-app", "email", "social"] as const),
        clickedAt,
        ipHash: `ip${ipBucket.toString().padStart(3, "0")}` + Math.random().toString(36).slice(2, 8),
        fingerprintHash: Math.random().toString(36).slice(2, 18),
      };

      switch (kind) {
        case "clicked": {
          await db.tenantReferral.create({
            data: { ...baseFields, status: "CLICKED" },
          });
          break;
        }
        case "signedUp": {
          await db.tenantReferral.create({
            data: {
              ...baseFields,
              status: "SIGNED_UP",
              signedUpAt: new Date(clickedAt.getTime() + randInt(1, 48) * 3_600_000),
            },
          });
          break;
        }
        case "trialed": {
          const signedUpAt = new Date(clickedAt.getTime() + randInt(1, 12) * 3_600_000);
          await db.tenantReferral.create({
            data: {
              ...baseFields,
              status: "TRIALED",
              signedUpAt,
              trialedAt: new Date(signedUpAt.getTime() + randInt(1, 6) * 3_600_000),
            },
          });
          break;
        }
        case "paid": {
          const signedUpAt = new Date(clickedAt.getTime() + randInt(1, 12) * 3_600_000);
          const trialedAt = new Date(signedUpAt.getTime() + randInt(1, 6) * 3_600_000);
          const paidAt = new Date(trialedAt.getTime() + randInt(7, 21) * DAY);
          const spend = randInt(8000, 25000);
          // PAID but reward not yet released (still inside hold window).
          await db.tenantReferral.create({
            data: {
              ...baseFields,
              status: "PAID",
              signedUpAt,
              trialedAt,
              paidAt,
              refereeSpendCents: spend,
              rewardAmountCents: 10_000, // matches default referrer credit
              rewardKind: "CREDIT",
            },
          });
          break;
        }
        case "rewarded": {
          const signedUpAt = new Date(clickedAt.getTime() + randInt(1, 12) * 3_600_000);
          const trialedAt = new Date(signedUpAt.getTime() + randInt(1, 6) * 3_600_000);
          const paidAt = new Date(trialedAt.getTime() + randInt(7, 21) * DAY);
          const releasedAt = new Date(paidAt.getTime() + 14 * DAY);
          const spend = randInt(15000, 50000);
          await db.tenantReferral.create({
            data: {
              ...baseFields,
              status: "REWARDED",
              signedUpAt,
              trialedAt,
              paidAt,
              rewardReleasedAt: releasedAt,
              refereeSpendCents: spend,
              rewardAmountCents: 10_000,
              rewardKind: "CREDIT",
            },
          });
          break;
        }
        case "expired": {
          const signedUpAt = new Date(clickedAt.getTime() + randInt(1, 12) * 3_600_000);
          await db.tenantReferral.create({
            data: {
              ...baseFields,
              status: "EXPIRED",
              signedUpAt,
              expiredAt: daysAgo(randInt(0, 5)),
            },
          });
          break;
        }
        case "fraud": {
          const flag = rand(fraudFlagPool);
          // Fraud rows generally fired at signup or post-payment. We
          // model them as having reached SIGNED_UP at minimum so the
          // queue has a real referee to review.
          const signedUpAt = new Date(clickedAt.getTime() + randInt(1, 12) * 3_600_000);
          // 1/3 of fraud rows are payment-reversed (had reached PAID).
          const reversedPayment = flag === "PAYMENT_REVERSED";
          const paidAt = reversedPayment ? new Date(signedUpAt.getTime() + randInt(7, 21) * DAY) : null;
          await db.tenantReferral.create({
            data: {
              ...baseFields,
              status: "FRAUD",
              signedUpAt,
              paidAt,
              fraudFlag: flag,
              fraudReason: fraudReasons[flag] ?? null,
              fraudResolution: "PENDING",
              refereeSpendCents: paidAt ? randInt(8000, 22000) : 0,
              rewardAmountCents: paidAt ? 10_000 : 0,
              rewardKind: paidAt ? "CREDIT" : null,
            },
          });
          break;
        }
      }
    };

    for (let i = 0; i < plan.clicked;  i++) await mkRow("clicked", i);
    for (let i = 0; i < plan.signedUp; i++) await mkRow("signedUp", i);
    for (let i = 0; i < plan.trialed;  i++) await mkRow("trialed", i);
    for (let i = 0; i < plan.paid;     i++) await mkRow("paid", i);
    for (let i = 0; i < plan.rewarded; i++) await mkRow("rewarded", i);
    for (let i = 0; i < plan.expired;  i++) await mkRow("expired", i);
    for (let i = 0; i < plan.fraud;    i++) await mkRow("fraud", i);

    // Update denorm counters on the code row to reflect the funnel.
    const signupRows = plan.signedUp + plan.trialed + plan.paid + plan.rewarded + plan.expired;
    const conversions = plan.paid + plan.rewarded;
    const earned = plan.rewarded * 10_000;
    const trials  = plan.trialed + plan.paid + plan.rewarded;
    await db.tenantReferralCode.update({
      where: { id: code.id },
      data: {
        clicks:      plan.clicked + plan.signedUp + plan.trialed + plan.paid + plan.rewarded + plan.expired + plan.fraud,
        signups:     signupRows,
        trials,
        conversions,
        earnedCents: earned,
      },
    });

    totalRows += plan.clicked + plan.signedUp + plan.trialed + plan.paid + plan.rewarded + plan.expired + plan.fraud;
    totalSignups += signupRows;
    totalConversions += conversions;
    totalRewards += earned;
    fraudFlags += plan.fraud;
  }

  console.log(
    `  ✓ ${codes.length} referral codes, ${totalRows} funnel rows, ${totalSignups} signups, ${totalConversions} conversions, $${(totalRewards/100).toLocaleString()} rewards, ${fraudFlags} fraud flags`,
  );
}

/* ── Page 42 — Affiliate Program ─────────────────────── */

async function seedAffiliates() {
  console.log("── Seeding affiliate program (Page 42)…");

  // 1. Singleton settings.
  const settings = await db.affiliateProgramSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      active: true,
      acceptingApplications: true,
      cookieDays: 90,
      applicationMode: "MANUAL_REVIEW",
      minPayoutCents: 5_000,
      trackingDomain: "ref.flowtora.com",
      notifyOnConversion: true,
      termsUrl: "https://flowtora.com/legal/affiliate-terms",
    },
    update: { active: true, acceptingApplications: true },
  });

  // 2. Commission tiers.
  const tierBlueprints = [
    {
      name: "[seed] Bronze", position: 0,
      commissionPct: 15, recurring: true, capDurationMonths: 12,
      minConversionsPerQuarter: 0, isDefault: true,
      notes: "Entry tier. Promotes to Silver at 10 lifetime conversions.",
    },
    {
      name: "[seed] Silver", position: 1,
      commissionPct: 20, recurring: true, capDurationMonths: 24,
      minConversionsPerQuarter: 3, minLifetimeConversions: 10,
      notes: "Mid tier. Promotes to Gold at 25 lifetime conversions.",
    },
    {
      name: "[seed] Gold", position: 2,
      commissionPct: 30, recurring: true, capDurationMonths: null,
      minConversionsPerQuarter: 8, minLifetimeConversions: 25,
      notes: "Top tier. Lifetime recurring commission.",
    },
    {
      name: "[seed] Launch Promo", position: 3,
      commissionPct: null, commissionFlatCents: 5000, commissionKind: "FLAT" as const,
      recurring: false, capDurationMonths: null,
      minConversionsPerQuarter: 0,
      notes: "Flat $50 per conversion — limited-time launch tier.",
    },
  ];
  const tierMap = new Map<string, string>(); // name → id
  for (const t of tierBlueprints) {
    const created = await db.affiliateTier.create({
      data: {
        name: t.name,
        position: t.position,
        commissionKind: t.commissionKind ?? "PERCENTAGE",
        commissionPct: t.commissionPct == null ? null : t.commissionPct,
        commissionFlatCents: t.commissionFlatCents ?? null,
        recurring: t.recurring,
        capDurationMonths: t.capDurationMonths ?? null,
        minConversionsPerQuarter: t.minConversionsPerQuarter,
        minLifetimeConversions: t.minLifetimeConversions ?? null,
        isDefault: t.isDefault ?? false,
        notes: t.notes,
      },
    });
    tierMap.set(t.name, created.id);
  }
  const bronzeId = tierMap.get("[seed] Bronze")!;
  const silverId = tierMap.get("[seed] Silver")!;
  const goldId   = tierMap.get("[seed] Gold")!;

  // Update settings with default tier.
  await db.affiliateProgramSettings.update({
    where: { id: settings.id },
    data: { defaultTierId: bronzeId },
  });

  // 3. Creatives.
  const creativeBlueprints = [
    {
      kind: "BANNER" as const, name: "[seed] 728x90 leaderboard",
      contentUrl: "https://cdn.flowtora.com/affiliates/728x90.png",
      destinationPath: "/", width: 728, height: 90,
      description: "Classic leaderboard banner — works in most blog headers.",
    },
    {
      kind: "BANNER" as const, name: "[seed] 300x250 medium rectangle",
      contentUrl: "https://cdn.flowtora.com/affiliates/300x250.png",
      destinationPath: "/", width: 300, height: 250,
      description: "Medium rectangle. Highest CTR slot for sidebar placements.",
    },
    {
      kind: "TEXT_LINK" as const, name: "[seed] Try Flowtora — text link",
      contentText: "Try Flowtora free for 14 days. The all-in-one shop OS for sign + print businesses.",
      destinationPath: "/pricing",
      description: "One-line callout. Drop into blog footers / forum signatures.",
    },
    {
      kind: "EMAIL_TEMPLATE" as const, name: "[seed] Newsletter intro",
      contentText: `Hi {{firstName}},

I've been using Flowtora to run my sign shop for the last few months and it's transformed how we quote, produce, and bill jobs. Use my link below to get 20% off your first 3 months:

→ https://ref.flowtora.com/r/{{code}}

— {{affiliateName}}`,
      destinationPath: "/pricing?utm_source=newsletter",
      description: "Plain-text newsletter intro. Replaces {{firstName}} / {{code}} / {{affiliateName}} via affiliate dashboard.",
    },
    {
      kind: "SOCIAL_POST" as const, name: "[seed] Twitter / X thread opener",
      contentText: `5 things every sign shop needs to ditch the spreadsheet 🧵

1. Real-time queue visibility
2. Proof workflows that don't get lost in email
3. Materials tracking that doesn't lie
4. ...

Tools I'm using → https://ref.flowtora.com/r/{{code}}`,
      destinationPath: "/",
      description: "Thread opener for Twitter / X. ~280 char first tweet, link in tweet 2.",
    },
    {
      kind: "AD_CREATIVE" as const, name: "[seed] Google Ads RSA copy",
      contentText: "Headline 1: Run Your Sign Shop From One Place\nHeadline 2: Quote → Produce → Bill\nHeadline 3: 14-Day Free Trial\n\nDescription 1: Replace 5 spreadsheets and 3 apps with Flowtora. Built for sign + print businesses.\nDescription 2: Try free for 14 days. Cancel anytime. Earn back the cost in your first job.",
      destinationPath: "/pricing?utm_medium=cpc",
      description: "Google Ads responsive search — 3 headlines + 2 descriptions ready to paste.",
    },
    {
      kind: "VIDEO_SCRIPT" as const, name: "[seed] YouTube review outline",
      contentText: `0:00 — Open: "I run a 3-person sign shop and I just switched our entire workflow to Flowtora..."
0:30 — The before: 5 spreadsheets, paper proofs, shared inbox chaos
1:30 — Walk through Flowtora's quote → order → proof flow
4:00 — Materials + production tracking demo
6:00 — Honest cons: it's still missing X, Y
7:30 — Pricing breakdown
8:30 — CTA: link in description for 20% off first 3 months`,
      destinationPath: "/pricing?utm_medium=youtube",
      description: "8-minute review outline. Beats / hooks already validated in similar SaaS niches.",
    },
  ];
  const creativeMap = new Map<string, string>();
  for (const c of creativeBlueprints) {
    const created = await db.affiliateCreative.create({
      data: {
        kind: c.kind,
        name: c.name,
        contentUrl: c.contentUrl ?? null,
        contentText: c.contentText ?? null,
        destinationPath: c.destinationPath,
        width: c.width ?? null,
        height: c.height ?? null,
        description: c.description,
        active: true,
      },
    });
    creativeMap.set(c.name, created.id);
  }
  const creativeIds = Array.from(creativeMap.values());

  // 4. Affiliates with applications.
  const affiliateBlueprints = [
    {
      name: "Mira Patel",        email: "mira@signsmithpodcast.com",
      website: "https://signsmithpodcast.com", channels: "podcast, newsletter",
      audience: 8500,  tier: goldId, status: "ACTIVE", clicks: 1240, conversions: 38,
      pitch: "I host the SignSmith Podcast (8.5k weekly subs). I've been recommending Flowtora unofficially — let's make it official.",
    },
    {
      name: "Carlos Rivera",     email: "hello@bigformatblog.com",
      website: "https://bigformatblog.com", channels: "blog, youtube",
      audience: 22_000, tier: silverId, status: "ACTIVE", clicks: 920, conversions: 24,
      pitch: "I run BigFormat Blog and a YouTube channel about wide-format printing. My audience is mostly small print shops.",
    },
    {
      name: "Yuki Tanaka",       email: "yuki@printpro-jp.com",
      website: "https://printpro-jp.com", channels: "twitter, instagram",
      audience: 4200,  tier: silverId, status: "ACTIVE", clicks: 480, conversions: 11,
      pitch: "Japanese print-shop community on Twitter / IG. Translated material requests welcome.",
    },
    {
      name: "Alex Kim",          email: "alex@signgrowth.io",
      website: "https://signgrowth.io", channels: "newsletter, linkedin",
      audience: 3800,  tier: bronzeId, status: "ACTIVE", clicks: 320, conversions: 6,
      pitch: "I'm a SaaS marketer specifically for the sign + print niche. I'd love to bundle Flowtora into my recommended-stack content.",
    },
    {
      name: "Priya Singh",       email: "priya@thesignshop.coach",
      website: "https://thesignshop.coach", channels: "coaching cohort",
      audience: 800,   tier: bronzeId, status: "ACTIVE", clicks: 180, conversions: 4,
      pitch: "I coach 3 cohorts of sign shop owners per year (~250 people total). Flowtora would be a natural recommendation.",
    },
    {
      name: "Devon Brooks",      email: "devon@signhustle.com",
      website: "https://signhustle.com", channels: "instagram",
      audience: 14_000, tier: bronzeId, status: "PAUSED", clicks: 240, conversions: 3,
      pitch: "Instagram-first audience. Mostly aspiring sign shop owners.",
    },
  ];

  let totalClicks = 0;
  let totalConversions = 0;
  let totalEarned = 0;

  const affiliateRows: { id: string; code: string; tierId: string; clicks: number }[] = [];

  for (const b of affiliateBlueprints) {
    const code = `SEED-${b.name.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 4) || "AFF"}-${randInt(1000, 9999)}`;
    const tier = await db.affiliateTier.findUnique({ where: { id: b.tier } });
    const commissionPct = tier?.commissionPct == null ? 20 : Number(tier.commissionPct);
    // Earnings ≈ conversions × $50 (conservative) — match what realistic
    // commission lines in Page 24 would pay out. Adjust by tier.
    const earnedCents = b.conversions * (b.tier === goldId ? 7500 :
                                          b.tier === silverId ? 5000 : 3000);
    const pendingPayoutCents = Math.round(earnedCents * 0.35); // 35% un-paid out

    const aff = await db.affiliate.create({
      data: {
        code,
        name: b.name,
        email: b.email,
        websiteUrl: b.website,
        promoChannels: b.channels,
        estimatedAudience: b.audience,
        status: b.status as never,
        tierId: b.tier,
        commissionPct,
        commissionDurationMonths: tier?.capDurationMonths ?? 12,
        cookieDays: 90,
        clicks: b.clicks,
        conversions: b.conversions,
        earnedCents,
        pendingPayoutCents,
        notes: `Application pitch: ${b.pitch}`,
      },
    });

    // Link an approved application record.
    await db.affiliateApplication.create({
      data: {
        name: b.name,
        email: b.email.replace("@", "@seed."), // tag for wipe? simpler: use distinct domain
        websiteUrl: b.website,
        promoChannels: b.channels,
        estimatedAudience: b.audience,
        why: b.pitch,
        status: "APPROVED",
        reviewerNote: `Approved into ${tier?.name ?? "default"} tier.`,
        reviewedAt: daysAgo(randInt(7, 60)),
        affiliateId: aff.id,
      },
    });
    // Override the email back to the real one — but we used a different one for app.
    // Actually let's just leave the @seed.flowtora.example tagging on the app row.
    await db.affiliateApplication.updateMany({
      where: { affiliateId: aff.id },
      data: { email: `${b.name.split(" ")[0]!.toLowerCase()}-${randInt(100, 999)}@seed.flowtora.example` },
    });

    affiliateRows.push({ id: aff.id, code, tierId: b.tier, clicks: b.clicks });
    totalClicks += b.clicks;
    totalConversions += b.conversions;
    totalEarned += earnedCents;

    // Click events — sample down to ~30 per affiliate so we don't blow
    // up the table; the denorm counters above are the source of truth
    // for the leaderboard, the click rows feed the trend chart + traffic
    // sources breakdown on the detail page.
    const clickSampleSize = Math.min(40, Math.max(5, Math.round(b.clicks / 30)));
    const sources = ["blog", "twitter", "youtube", "newsletter", "instagram", "podcast", "linkedin"];
    for (let i = 0; i < clickSampleSize; i++) {
      const ageDays = randInt(0, 89);
      const converted = Math.random() < (b.conversions / Math.max(b.clicks, 1));
      await db.affiliateClick.create({
        data: {
          affiliateId: aff.id,
          source: rand(sources),
          ipHash: Math.random().toString(36).slice(2, 18),
          userAgent: rand(["Mozilla/5.0 Chrome", "Mozilla/5.0 Safari", "Mozilla/5.0 Firefox"]),
          referrer: b.website,
          creativeId: rand(creativeIds),
          converted,
          occurredAt: daysAgo(ageDays),
        },
      });
    }

    // Communication thread — 2-4 messages per active affiliate.
    if (b.status === "ACTIVE") {
      const threadCount = randInt(2, 4);
      for (let i = 0; i < threadCount; i++) {
        const isOut = i % 2 === 0;
        await db.affiliateMessage.create({
          data: {
            affiliateId: aff.id,
            direction: isOut ? "OUT" : "IN",
            subject: i === 0 ? "Welcome to the Flowtora affiliate program" : undefined,
            body: isOut
              ? rand([
                  "Hey! Just confirming you're approved into the program. Let me know if you need any custom creative for your audience — happy to mock up something on-brand for your channel.",
                  "Quick heads up: we just added a new launch promo tier. You're already on a higher tier so this doesn't affect you, but let your audience know there's a flat $50/conversion option for niche partners.",
                  "Q3 is off to a great start — your conversions are up 18% MoM. If you're planning a content push, we can co-fund some of the production cost. Let me know.",
                ])
              : rand([
                  "Thanks for the welcome! Quick question — is there a way to track conversions back to a specific blog post vs. newsletter?",
                  "Got the new banners, dropping them into next week's newsletter. Will report back once it sends.",
                  "FYI my audience asked about the multi-location pricing. Could you send the latest one-pager?",
                ]),
            authorId: null,
            createdAt: daysAgo(randInt(1, 60)),
          },
        });
      }
    }
  }

  // 5. Pending applications (for the queue).
  const pendingApps = [
    {
      name: "Jordan Lee", email: "jordan@printersweekly-seed.flowtora.example",
      website: "https://printersweekly.io", channels: "blog, newsletter",
      audience: 3200, why: "I write a weekly print-industry newsletter. Always looking for high-quality SaaS to recommend.",
    },
    {
      name: "Sam Chen", email: "sam@signshoppodcast-seed.flowtora.example",
      website: "https://signshoppodcast.fm", channels: "podcast",
      audience: 1100, why: "Solo podcast about sign shop operations. Niche but engaged audience.",
    },
    {
      name: "Riley Sosa", email: "riley@vinyltips-seed.flowtora.example",
      website: "https://vinyltips.tv", channels: "youtube",
      audience: 18_000, why: "YouTube channel focused on vinyl wrap and signage. 18k subs, ~500k views/year.",
    },
  ];
  for (const a of pendingApps) {
    await db.affiliateApplication.create({
      data: {
        name: a.name,
        email: a.email,
        websiteUrl: a.website,
        promoChannels: a.channels,
        estimatedAudience: a.audience,
        why: a.why,
        status: "PENDING",
        createdAt: daysAgo(randInt(1, 14)),
      },
    });
  }

  // 6. Update creative click counts based on click rows just created.
  const clickAggBy = await db.affiliateClick.groupBy({
    by: ["creativeId"],
    where: { creativeId: { in: creativeIds } },
    _count: { _all: true },
  });
  for (const agg of clickAggBy) {
    if (!agg.creativeId) continue;
    await db.affiliateCreative.update({
      where: { id: agg.creativeId },
      data: { totalClicks: agg._count._all },
    });
  }

  // 7. Synthetic commission lines so the Commissions tab shows data.
  // Drive lines off the existing Page 24 PartnerCommissionLine model.
  for (const a of affiliateRows) {
    const tier = await db.affiliateTier.findUnique({ where: { id: a.tierId } });
    const lineCount = randInt(2, 6);
    const today = new Date();
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    for (let i = 0; i < lineCount; i++) {
      const amount = tier?.commissionPct == null
        ? (tier?.commissionFlatCents ?? 5000)
        : Math.round((randInt(8000, 25000) * Number(tier.commissionPct)) / 100);
      await db.partnerCommissionLine.create({
        data: {
          affiliateId: a.id,
          payoutId: null,
          kind: i === lineCount - 1 ? "BONUS" : "COMMISSION",
          description: i === lineCount - 1
            ? "[seed] Q3 performance bonus"
            : `[seed] Commission on attributed payment ${randInt(1, 999).toString().padStart(3, "0")}`,
          tenantId: null,
          amount,
          period,
          earnedAt: daysAgo(randInt(0, 27)),
        },
      });
    }
  }

  console.log(
    `  ✓ ${affiliateRows.length} affiliates, ${tierBlueprints.length} tiers, ${creativeBlueprints.length} creatives, ${pendingApps.length} pending apps, ${totalClicks.toLocaleString()} clicks, ${totalConversions} conversions, $${(totalEarned/100).toLocaleString()} earned`,
  );
}

/* ── Page 43 — SEO & Content ─────────────────────────── */

async function seedSeo() {
  console.log("── Seeding SEO & Content (Page 43)…");

  // 1. Singleton settings.
  await db.seoSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      robotsTxt:
        "User-agent: *\nAllow: /\nDisallow: /platform/\nDisallow: /t/\nDisallow: /api/\n\nSitemap: https://flowtora.com/sitemap.xml\n",
      sitemapEnabled: true,
      sitemapLastGeneratedAt: daysAgo(2),
      sitemapUrlCount: 13,
      defaultCanonicalDomain: "https://flowtora.com",
      metaTitleTemplate: "{{page}} | Flowtora",
      metaDescription:
        "Flowtora is the all-in-one shop OS for sign and print businesses. Quote, produce, proof, and bill from one place.",
      ogImageUrl: "https://flowtora.com/og/default.png",
      hreflangs: [
        { lang: "en-us", url: "https://flowtora.com/" },
        { lang: "en-ca", url: "https://flowtora.com/ca/" },
      ],
    },
    update: {
      sitemapLastGeneratedAt: daysAgo(2),
      sitemapUrlCount: 13,
    },
  });

  // 2. Tracked keywords. Mix of intent + position bands so the table
  // renders meaningfully. Names tagged with "[seed] " for the wipe.
  const keywordBlueprints: Array<{
    keyword: string;
    intent: "INFORMATIONAL" | "NAVIGATIONAL" | "COMMERCIAL" | "TRANSACTIONAL";
    searchVolume: number;
    difficulty: number;
    position: number | null;
    url?: string;
    tags?: string[];
  }> = [
    { keyword: "[seed] sign shop software", intent: "COMMERCIAL", searchVolume: 1900, difficulty: 42, position: 4, url: "/", tags: ["core", "category"] },
    { keyword: "[seed] print shop management software", intent: "COMMERCIAL", searchVolume: 1300, difficulty: 47, position: 7, url: "/for-print-shops", tags: ["core", "category"] },
    { keyword: "[seed] sign making business software", intent: "COMMERCIAL", searchVolume: 880, difficulty: 38, position: 2, url: "/for-sign-shops", tags: ["category"] },
    { keyword: "[seed] wide format printing software", intent: "COMMERCIAL", searchVolume: 720, difficulty: 51, position: 14, url: "/for-print-shops", tags: ["niche"] },
    { keyword: "[seed] vinyl wrap shop software", intent: "COMMERCIAL", searchVolume: 590, difficulty: 36, position: 5, url: "/for-sign-shops", tags: ["niche"] },
    { keyword: "[seed] flowtora", intent: "NAVIGATIONAL", searchVolume: 410, difficulty: 5, position: 1, url: "/", tags: ["brand"] },
    { keyword: "[seed] flowtora pricing", intent: "TRANSACTIONAL", searchVolume: 320, difficulty: 8, position: 1, url: "/pricing", tags: ["brand", "pricing"] },
    { keyword: "[seed] flowtora vs printavo", intent: "COMMERCIAL", searchVolume: 260, difficulty: 22, position: 6, url: "/compare/printavo", tags: ["brand", "compare"] },
    { keyword: "[seed] sign shop quote template", intent: "INFORMATIONAL", searchVolume: 1600, difficulty: 28, position: 18, url: "/blog/sign-shop-quote-template", tags: ["content"] },
    { keyword: "[seed] how to price wide format prints", intent: "INFORMATIONAL", searchVolume: 1100, difficulty: 31, position: 22, url: "/blog/wide-format-pricing-guide", tags: ["content"] },
    { keyword: "[seed] sign shop workflow checklist", intent: "INFORMATIONAL", searchVolume: 480, difficulty: 18, position: 12, url: "/blog/sign-shop-workflow", tags: ["content"] },
    { keyword: "[seed] best signage CRM", intent: "COMMERCIAL", searchVolume: 540, difficulty: 44, position: 9, url: "/", tags: ["category", "crm"] },
    { keyword: "[seed] print shop estimating software", intent: "COMMERCIAL", searchVolume: 920, difficulty: 53, position: 23, url: "/features/estimating", tags: ["category"] },
    { keyword: "[seed] proof approval software for sign shops", intent: "COMMERCIAL", searchVolume: 360, difficulty: 29, position: 8, url: "/features/proofs", tags: ["niche", "feature"] },
    { keyword: "[seed] flowtora reviews", intent: "COMMERCIAL", searchVolume: 220, difficulty: 14, position: 3, url: "/reviews", tags: ["brand"] },
    { keyword: "[seed] sign shop CRM open source", intent: "INFORMATIONAL", searchVolume: 170, difficulty: 22, position: null, tags: ["niche"] },
    { keyword: "[seed] print job tracking software", intent: "COMMERCIAL", searchVolume: 1400, difficulty: 49, position: 28, url: "/features/queue", tags: ["category"] },
    { keyword: "[seed] sign making jobs near me", intent: "NAVIGATIONAL", searchVolume: 800, difficulty: 32, position: null, tags: ["geo"] },
    { keyword: "[seed] flowtora demo", intent: "NAVIGATIONAL", searchVolume: 90, difficulty: 5, position: 1, url: "/contact", tags: ["brand"] },
    { keyword: "[seed] sign shop accounting software integration", intent: "COMMERCIAL", searchVolume: 270, difficulty: 36, position: 15, url: "/integrations/quickbooks", tags: ["integration"] },
    { keyword: "[seed] how to start a sign shop", intent: "INFORMATIONAL", searchVolume: 2400, difficulty: 26, position: 31, url: "/blog/start-a-sign-shop", tags: ["content", "top-funnel"] },
    { keyword: "[seed] sign shop production scheduling", intent: "COMMERCIAL", searchVolume: 350, difficulty: 41, position: 11, url: "/features/scheduling", tags: ["feature"] },
  ];

  let keywordsCreated = 0;
  let rankingsCreated = 0;
  for (const k of keywordBlueprints) {
    const previousPosition = k.position == null ? null : Math.max(1, k.position + (Math.floor(Math.random() * 7) - 3));
    const created = await db.seoKeyword.create({
      data: {
        keyword: k.keyword,
        intent: k.intent,
        searchVolume: k.searchVolume,
        difficulty: k.difficulty,
        position: k.position,
        previousPosition: k.position == null ? null : previousPosition,
        url: k.url ?? null,
        country: "US",
        tags: k.tags ?? [],
        active: true,
        lastCheckedAt: daysAgo(randInt(0, 3)),
      },
    });
    keywordsCreated++;
    // 30 days of historical ranking snapshots so the trend has shape.
    let cur = previousPosition ?? k.position;
    for (let i = 30; i >= 0; i--) {
      const date = new Date(Date.now() - i * DAY);
      const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      // Drift slightly each day; null positions stay null.
      if (cur != null) {
        cur = Math.max(1, Math.min(100, cur + (Math.floor(Math.random() * 5) - 2)));
      }
      await db.seoKeywordRanking.create({
        data: { keywordId: created.id, date: utcDate, position: cur },
      });
      rankingsCreated++;
    }
  }

  // 3. Backlinks. Use deterministic source domains tagged with
  // "*.seedlinks.example" so the wipe finds them. Realistic mix of
  // active / lost / toxic + dofollow / nofollow.
  const backlinkSources = [
    { domain: "techbeat.seedlinks.example",     da: 78, anchor: "Flowtora",                   target: "/",                         type: "DOFOLLOW", age: 120 },
    { domain: "ecomtoday.seedlinks.example",    da: 71, anchor: "all-in-one shop OS",         target: "/",                         type: "DOFOLLOW", age: 95 },
    { domain: "printersquarterly.seedlinks.example", da: 64, anchor: "print shop software",   target: "/for-print-shops",          type: "DOFOLLOW", age: 80 },
    { domain: "signsmag.seedlinks.example",     da: 68, anchor: "sign shop CRM",              target: "/for-sign-shops",           type: "DOFOLLOW", age: 60 },
    { domain: "smallbizadvice.seedlinks.example", da: 55, anchor: "Flowtora review",          target: "/reviews",                  type: "DOFOLLOW", age: 45 },
    { domain: "marketingweek.seedlinks.example", da: 82, anchor: "click here",                 target: "/pricing",                  type: "NOFOLLOW", age: 40 },
    { domain: "wideformatworld.seedlinks.example", da: 59, anchor: "Flowtora pricing",        target: "/pricing",                  type: "DOFOLLOW", age: 30 },
    { domain: "saasreviews.seedlinks.example",  da: 62, anchor: "Flowtora",                   target: "/",                         type: "DOFOLLOW", age: 25 },
    { domain: "vinylwrappros.seedlinks.example", da: 48, anchor: "vinyl wrap shop software",  target: "/for-sign-shops",           type: "DOFOLLOW", age: 22 },
    { domain: "ugcforum.seedlinks.example",     da: 35, anchor: "Flowtora is great",          target: "/",                         type: "UGC",      age: 18 },
    { domain: "printavoblog.seedlinks.example", da: 55, anchor: "competitor comparison",      target: "/compare/printavo",         type: "DOFOLLOW", age: 14 },
    { domain: "signbusinesshub.seedlinks.example", da: 41, anchor: "see this",                target: "/",                         type: "NOFOLLOW", age: 9 },
    { domain: "shopownerpod.seedlinks.example", da: 50, anchor: "Flowtora podcast sponsor",   target: "/",                         type: "SPONSORED", age: 7 },
    { domain: "designersweekly.seedlinks.example", da: 67, anchor: "best proof tool",         target: "/features/proofs",          type: "DOFOLLOW", age: 5 },
    { domain: "linkfarm.seedlinks.example",     da: 12, anchor: "click",                      target: "/",                         type: "DOFOLLOW", age: 70, status: "TOXIC" as const },
    // Lost backlinks
    { domain: "oldnewsletter.seedlinks.example", da: 40, anchor: "Flowtora",                  target: "/",                         type: "DOFOLLOW", age: 200, status: "LOST" as const },
    { domain: "deadblog.seedlinks.example",     da: 30, anchor: "sign shop software",         target: "/",                         type: "DOFOLLOW", age: 150, status: "LOST" as const },
  ];
  let backlinksCreated = 0;
  for (const b of backlinkSources) {
    await db.seoBacklink.create({
      data: {
        sourceDomain: b.domain,
        sourceUrl: `https://${b.domain}/article/${randInt(1000, 9999)}`,
        targetUrl: b.target,
        anchorText: b.anchor,
        domainAuthority: b.da,
        followType: b.type as "DOFOLLOW" | "NOFOLLOW" | "UGC" | "SPONSORED",
        status: b.status ?? "ACTIVE",
        firstSeenAt: daysAgo(b.age),
        lastSeenAt: b.status === "LOST" ? daysAgo(b.age - 30) : daysAgo(randInt(0, 7)),
        lostAt: b.status === "LOST" ? daysAgo(randInt(5, 25)) : null,
        notes: b.status === "TOXIC" ? "Low-DA link farm — disavow candidate." : null,
      },
    });
    backlinksCreated++;
  }

  // 4. Broken links — realistic 404/500 mix on real-feeling page paths.
  const brokenSeeds = [
    {
      pageUrl: "/blog/sign-shop-workflow",
      brokenUrl: "https://oldpartner.com/seed-broken/case-study-1",
      statusCode: 404, anchor: "case study", context: "body",
      fixSuggestion: "Replace with internal link to /reviews — partner site decommissioned that case study.",
    },
    {
      pageUrl: "/blog/start-a-sign-shop",
      brokenUrl: "https://archive.org/seed-broken/wayback-redirect",
      statusCode: 500, anchor: "see archived guide", context: "body",
      fixSuggestion: "Wayback link is timing out; switch to a stable archive snapshot URL.",
    },
    {
      pageUrl: "/for-sign-shops",
      brokenUrl: "https://samplecdn.example.com/seed-broken/icon-old.svg",
      statusCode: 404, anchor: "icon", context: "header",
      fixSuggestion: "Asset moved to /assets/icons/v2/. Update src= reference.",
    },
    {
      pageUrl: "/pricing",
      brokenUrl: "https://payments.stripe.com/seed-broken/legacy-checkout",
      statusCode: 410, anchor: "secure checkout", context: "footer",
      fixSuggestion: "Stripe legacy URL gone — point at /api/checkout instead.",
    },
    {
      pageUrl: "/blog/wide-format-pricing-guide",
      brokenUrl: "https://gist.github.com/seed-broken/old-formula",
      statusCode: 404, anchor: "pricing formula gist", context: "body",
      fixSuggestion: "Gist deleted by author. Replace with embedded snippet on our docs site.",
    },
    {
      pageUrl: "/for-print-shops",
      brokenUrl: "https://docs.flowtora.com/seed-broken/legacy-page",
      statusCode: 404, anchor: "RIP integration docs", context: "body",
      fixSuggestion: "Docs path moved to /integrations/onyx — add 301 redirect or update link.",
    },
  ];
  for (const b of brokenSeeds) {
    await db.seoBrokenLink.create({
      data: {
        pageUrl: b.pageUrl,
        brokenUrl: b.brokenUrl,
        statusCode: b.statusCode,
        anchorText: b.anchor,
        context: b.context,
        fixSuggestion: b.fixSuggestion,
        firstDetectedAt: daysAgo(randInt(2, 30)),
        lastCheckedAt: daysAgo(randInt(0, 2)),
        status: "OPEN",
      },
    });
  }
  // 2 resolved historical entries.
  for (let i = 0; i < 2; i++) {
    await db.seoBrokenLink.create({
      data: {
        pageUrl: "/blog/post-" + i,
        brokenUrl: `https://archived.example.com/seed-broken/old-${i}`,
        statusCode: 404,
        anchorText: "previous post",
        context: "footer",
        fixSuggestion: "Pointed at root of section index.",
        firstDetectedAt: daysAgo(60 + i * 10),
        lastCheckedAt: daysAgo(40 + i * 10),
        resolvedAt: daysAgo(35 + i * 10),
        resolutionNote: "Replaced with internal canonical link.",
        status: "RESOLVED",
      },
    });
  }

  // 5. Content gaps — opportunities, tagged with [seed] keyword prefix.
  const gapSeeds = [
    { keyword: "[seed] sign shop pricing calculator",   sv: 1300, diff: 24, intent: "INFORMATIONAL", competitor: "https://printavo.com/blog/pricing-calculator", competitorDomain: "printavo.com",   ourPos: null, status: "OPEN" },
    { keyword: "[seed] sign shop POS integration",      sv: 880,  diff: 31, intent: "COMMERCIAL",    competitor: "https://shopvox.com/pos",                       competitorDomain: "shopvox.com",     ourPos: null, status: "OPEN" },
    { keyword: "[seed] vinyl signs cost guide",          sv: 1900, diff: 22, intent: "INFORMATIONAL", competitor: "https://signshopadvisor.com/vinyl-signs-cost", competitorDomain: "signshopadvisor.com", ourPos: 47, status: "OPEN" },
    { keyword: "[seed] commercial signage maintenance", sv: 480,  diff: 18, intent: "INFORMATIONAL", competitor: "https://nationalsigns.com/maintenance",         competitorDomain: "nationalsigns.com", ourPos: null, status: "IN_PROGRESS" },
    { keyword: "[seed] print shop estimating template", sv: 720,  diff: 28, intent: "INFORMATIONAL", competitor: "https://printingnews.com/templates",            competitorDomain: "printingnews.com", ourPos: 38, status: "OPEN" },
    { keyword: "[seed] sign shop hiring guide",          sv: 320,  diff: 14, intent: "INFORMATIONAL", competitor: null,                                            competitorDomain: null,              ourPos: null, status: "OPEN" },
    { keyword: "[seed] best small business invoicing software", sv: 8100, diff: 67, intent: "COMMERCIAL", competitor: "https://wave.financial/invoicing",      competitorDomain: "wave.financial",  ourPos: null, status: "IGNORED" },
    { keyword: "[seed] proof approval workflow examples", sv: 240, diff: 19, intent: "INFORMATIONAL", competitor: "https://proofhq.com/blog/workflow",            competitorDomain: "proofhq.com",     ourPos: null, status: "PUBLISHED" },
  ];
  for (const g of gapSeeds) {
    await db.seoContentGap.create({
      data: {
        keyword: g.keyword,
        searchVolume: g.sv,
        difficulty: g.diff,
        intent: g.intent as "INFORMATIONAL" | "NAVIGATIONAL" | "COMMERCIAL" | "TRANSACTIONAL",
        competitorUrl: g.competitor,
        competitorDomain: g.competitorDomain,
        ourPosition: g.ourPos,
        status: g.status as "OPEN" | "IN_PROGRESS" | "PUBLISHED" | "IGNORED",
        notes: g.status === "PUBLISHED" ? "Shipped Mar '26 — ranking on page 2 already." :
               g.status === "IN_PROGRESS" ? "Outline drafted, copy in review." :
               g.status === "IGNORED" ? "Out of niche — too broad for our audience." : null,
        createdAt: daysAgo(randInt(7, 90)),
        closedAt: g.status === "PUBLISHED" || g.status === "IGNORED" ? daysAgo(randInt(0, 30)) : null,
      },
    });
  }

  // 6. Page Speed snapshots — 8 snapshots per (url, device) over 60d.
  const urls = [
    "home.seed.flowtora.com",
    "pricing.seed.flowtora.com",
    "for-sign-shops.seed.flowtora.com",
    "for-print-shops.seed.flowtora.com",
    "features.seed.flowtora.com",
    "blog.seed.flowtora.com",
    "contact.seed.flowtora.com",
  ];
  const baselineByUrl: Record<string, { lcp: number; inp: number; cls: number; ttfb: number; mobileScore: number; desktopScore: number }> = {
    "home.seed.flowtora.com":            { lcp: 2.1, inp: 145, cls: 0.04, ttfb: 220, mobileScore: 88, desktopScore: 96 },
    "pricing.seed.flowtora.com":         { lcp: 2.8, inp: 195, cls: 0.07, ttfb: 280, mobileScore: 78, desktopScore: 92 },
    "for-sign-shops.seed.flowtora.com":  { lcp: 2.5, inp: 165, cls: 0.05, ttfb: 240, mobileScore: 82, desktopScore: 94 },
    "for-print-shops.seed.flowtora.com": { lcp: 2.7, inp: 185, cls: 0.08, ttfb: 270, mobileScore: 79, desktopScore: 91 },
    "features.seed.flowtora.com":        { lcp: 3.4, inp: 260, cls: 0.12, ttfb: 320, mobileScore: 64, desktopScore: 84 },
    "blog.seed.flowtora.com":            { lcp: 4.2, inp: 380, cls: 0.18, ttfb: 410, mobileScore: 48, desktopScore: 72 },
    "contact.seed.flowtora.com":         { lcp: 1.9, inp: 130, cls: 0.03, ttfb: 200, mobileScore: 91, desktopScore: 97 },
  };
  let snapshots = 0;
  for (const url of urls) {
    const base = baselineByUrl[url]!;
    for (const device of ["MOBILE", "DESKTOP"] as const) {
      for (let snap = 7; snap >= 0; snap--) {
        const measuredAt = daysAgo(snap * 8); // every 8 days for 56 days total
        // Mobile typically scores lower; jitter slightly per snapshot.
        const isMobile = device === "MOBILE";
        const baselineScore = isMobile ? base.mobileScore : base.desktopScore;
        const jitter = Math.floor(Math.random() * 7) - 3;
        const score = Math.max(20, Math.min(100, baselineScore + jitter));
        const lcpJitter = (Math.random() * 0.4 - 0.2);
        const inpJitter = (Math.random() * 40 - 20);
        const clsJitter = (Math.random() * 0.04 - 0.02);
        const ttfbJitter = (Math.random() * 60 - 30);
        await db.seoPageSpeedSnapshot.create({
          data: {
            url,
            device,
            lcp: Math.max(0.5, +(base.lcp + (isMobile ? 0 : -0.5) + lcpJitter).toFixed(3)),
            inp: Math.max(40, +(base.inp + (isMobile ? 0 : -40) + inpJitter).toFixed(1)),
            cls: Math.max(0, +(base.cls + clsJitter).toFixed(3)),
            ttfb: Math.max(80, +(base.ttfb + ttfbJitter).toFixed(1)),
            performanceScore: score,
            measuredAt,
          },
        });
        snapshots++;
      }
    }
  }

  console.log(
    `  ✓ ${keywordsCreated} keywords (+ ${rankingsCreated} ranking history rows), ${backlinksCreated} backlinks, ${brokenSeeds.length}+2 broken links, ${gapSeeds.length} content gaps, ${snapshots} page-speed snapshots`,
  );
}

/* ── Page 44 — Lead Inbox ───────────────────────────── */

async function seedLeadInbox(
  staff: { id: string }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding lead inbox (Page 44)…");

  const owners = staff.slice(0, Math.min(5, staff.length));
  if (owners.length === 0) {
    console.log("  skipped — no platform staff to assign as owners");
    return;
  }

  // Realistic lead blueprints — mix of statuses, sources, scores,
  // owners, regions, industries, tags. All tagged via @seed.flowtora.example.
  type LeadPlan = {
    name: string;
    company: string | null;
    role: string | null;
    phone: string | null;
    region: string;
    industry: string;
    tags: string[];
    teamSize: string | null;
    source: "INQUIRY" | "DEMO" | "NEWSLETTER" | "TRIAL_ABANDON";
    sourcePath: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "DISQUALIFIED" | "SPAM";
    score: number;
    pageViews: number;
    formSubmits: number;
    emailOpens: number;
    emailClicks: number;
    callsLogged: number;
    meetings: number;
    ageDays: number;
    message: string | null;
    convertTenantIdx?: number;
  };

  const leadPlans: LeadPlan[] = [
    {
      name: "Sandra Mitchell", company: "BrightSign Co.", role: "Owner",
      phone: "+1 (503) 555-0199", region: "Pacific Northwest", industry: "Sign shop",
      tags: ["high-intent", "demo-booked"], teamSize: "6-25",
      source: "DEMO", sourcePath: "/contact", utmSource: "google", utmMedium: "cpc", utmCampaign: "spring-2026-shops",
      status: "QUALIFIED", score: 78,
      pageViews: 14, formSubmits: 2, emailOpens: 6, emailClicks: 3, callsLogged: 1, meetings: 1,
      ageDays: 18,
      message: "Looking to consolidate 5 spreadsheets + Trello + a paper proof process into one app. Ready to evaluate seriously.",
    },
    {
      name: "Diego Reyes", company: "Costa Print Studios", role: "Operations Manager",
      phone: "+1 (305) 555-0143", region: "Southeast US", industry: "Print shop",
      tags: ["multi-location", "from-podcast"], teamSize: "26-100",
      source: "DEMO", sourcePath: "/for-print-shops", utmSource: "podcast", utmMedium: "audio", utmCampaign: "shop-owner-fm-q2",
      status: "QUALIFIED", score: 82,
      pageViews: 22, formSubmits: 1, emailOpens: 9, emailClicks: 5, callsLogged: 2, meetings: 2,
      ageDays: 12,
      message: "We have 3 locations and Printavo isn't scaling. Need multi-location support and customer portal.",
    },
    {
      name: "Ada Nwosu", company: "Lagos Letters", role: "Founder",
      phone: null, region: "EU-NG", industry: "Sign shop",
      tags: ["international"], teamSize: "1-5",
      source: "INQUIRY", sourcePath: "/contact", utmSource: null, utmMedium: null, utmCampaign: null,
      status: "CONTACTED", score: 42,
      pageViews: 7, formSubmits: 1, emailOpens: 2, emailClicks: 0, callsLogged: 0, meetings: 0,
      ageDays: 5,
      message: "Do you support local Nigerian payment rails? Curious if Flowtora fits a 2-person sign shop.",
    },
    {
      name: "Tom Hanson", company: "Mountain Wraps", role: "Owner",
      phone: "+1 (406) 555-0124", region: "Mountain West", industry: "Vinyl wraps",
      tags: ["wraps-niche"], teamSize: "1-5",
      source: "DEMO", sourcePath: "/for-sign-shops", utmSource: "facebook", utmMedium: "social", utmCampaign: "wraps-jan",
      status: "CONVERTED", score: 88,
      pageViews: 28, formSubmits: 2, emailOpens: 12, emailClicks: 7, callsLogged: 3, meetings: 2,
      ageDays: 35,
      message: "Demo went great. Moving from spreadsheets. Need to start with quote → proof → invoice asap.",
      convertTenantIdx: 0,
    },
    {
      name: "Yuki Tanaka", company: "PrintPro Tokyo", role: "Studio Lead",
      phone: "+81 90-5555-2210", region: "Asia-JP", industry: "Print shop",
      tags: ["international", "translated-needs"], teamSize: "6-25",
      source: "NEWSLETTER", sourcePath: "/", utmSource: "twitter", utmMedium: "social", utmCampaign: null,
      status: "NEW", score: 18,
      pageViews: 3, formSubmits: 1, emailOpens: 1, emailClicks: 0, callsLogged: 0, meetings: 0,
      ageDays: 1,
      message: null,
    },
    {
      name: "Rachel Goldman", company: "Lighthouse Design", role: "Co-founder",
      phone: "+1 (617) 555-0188", region: "Northeast US", industry: "Design agency",
      tags: ["agency", "design"], teamSize: "6-25",
      source: "INQUIRY", sourcePath: "/contact", utmSource: "linkedin", utmMedium: "social", utmCampaign: "agency-q2",
      status: "CONTACTED", score: 51,
      pageViews: 11, formSubmits: 1, emailOpens: 4, emailClicks: 2, callsLogged: 1, meetings: 0,
      ageDays: 9,
      message: "We white-label sign jobs to a partner shop. Curious if Flowtora's portal works for that handoff.",
    },
    {
      name: "Marco Bianchi", company: "Bianchi Insegne", role: "Owner",
      phone: "+39 320 555 4421", region: "EU-IT", industry: "Sign shop",
      tags: ["international"], teamSize: "1-5",
      source: "TRIAL_ABANDON", sourcePath: "/signup", utmSource: null, utmMedium: null, utmCampaign: null,
      status: "NEW", score: 28,
      pageViews: 6, formSubmits: 0, emailOpens: 0, emailClicks: 0, callsLogged: 0, meetings: 0,
      ageDays: 2,
      message: null,
    },
    {
      name: "Priya Sharma", company: "Bangalore Banner Co.", role: "Sales Lead",
      phone: "+91 98 5555 1109", region: "Asia-IN", industry: "Sign shop",
      tags: ["international"], teamSize: "26-100",
      source: "DEMO", sourcePath: "/contact", utmSource: "google", utmMedium: "cpc", utmCampaign: "intl-shops-q2",
      status: "QUALIFIED", score: 71,
      pageViews: 18, formSubmits: 2, emailOpens: 7, emailClicks: 3, callsLogged: 1, meetings: 1,
      ageDays: 22,
      message: "We do volume work for retail chains. Need quote-to-cash automation. Currently using spreadsheets + WhatsApp.",
    },
    {
      name: "Brandon Lee", company: "Texas Signworks", role: "Owner",
      phone: "+1 (214) 555-0067", region: "Southwest US", industry: "Sign shop",
      tags: ["pricing-objection"], teamSize: "1-5",
      source: "INQUIRY", sourcePath: "/pricing", utmSource: "google", utmMedium: "organic", utmCampaign: null,
      status: "DISQUALIFIED", score: 22,
      pageViews: 5, formSubmits: 1, emailOpens: 2, emailClicks: 0, callsLogged: 1, meetings: 0,
      ageDays: 28,
      message: "Pricing is a bit steep for a 2-person shop. Will revisit if we hire a third.",
    },
    {
      name: "Olivia Park", company: "Park & Parker Press", role: "Operations",
      phone: "+1 (415) 555-7741", region: "West Coast", industry: "Print shop",
      tags: ["west-coast"], teamSize: "6-25",
      source: "DEMO", sourcePath: "/for-print-shops", utmSource: "twitter", utmMedium: "social", utmCampaign: null,
      status: "CONTACTED", score: 56,
      pageViews: 13, formSubmits: 1, emailOpens: 5, emailClicks: 2, callsLogged: 1, meetings: 1,
      ageDays: 7,
      message: "Booked a demo. Currently on Shopvox; the proof workflow there is hurting us.",
    },
    {
      name: "Hassan Al-Rashid", company: null, role: null,
      phone: null, region: "MENA-AE", industry: "Sign shop",
      tags: ["consumer-spam-pattern"], teamSize: null,
      source: "NEWSLETTER", sourcePath: "/", utmSource: null, utmMedium: null, utmCampaign: null,
      status: "SPAM", score: 0,
      pageViews: 0, formSubmits: 1, emailOpens: 0, emailClicks: 0, callsLogged: 0, meetings: 0,
      ageDays: 14,
      message: "Buy cheap watches reply now",
    },
    {
      name: "Megan Fitzgerald", company: "Hudson Sign Lab", role: "Co-owner",
      phone: "+1 (212) 555-3398", region: "Northeast US", industry: "Sign shop",
      tags: ["agency-partner"], teamSize: "6-25",
      source: "INQUIRY", sourcePath: "/contact", utmSource: "newsletter", utmMedium: "email", utmCampaign: "biz-mag-feb",
      status: "CONVERTED", score: 84,
      pageViews: 24, formSubmits: 3, emailOpens: 11, emailClicks: 6, callsLogged: 2, meetings: 2,
      ageDays: 60,
      message: "Came in via the trade mag feature. We've been on Excel for 8 years. Time to stop.",
      convertTenantIdx: 1,
    },
    {
      name: "Liam Sanchez", company: "Sanchez Vinyl", role: "Owner",
      phone: "+1 (305) 555-0991", region: "Southeast US", industry: "Vinyl wraps",
      tags: ["wraps-niche", "podcast-listener"], teamSize: "1-5",
      source: "DEMO", sourcePath: "/contact", utmSource: "podcast", utmMedium: "audio", utmCampaign: "shop-owner-fm-q2",
      status: "QUALIFIED", score: 67,
      pageViews: 16, formSubmits: 1, emailOpens: 6, emailClicks: 3, callsLogged: 1, meetings: 1,
      ageDays: 11,
      message: "Heard you on the podcast. Need real proof tracking for car wraps — paper sucks.",
    },
    {
      name: "Sophia Klein", company: "Klein & Co. Studios", role: "Founder",
      phone: null, region: "EU-DE", industry: "Design agency",
      tags: ["international", "agency"], teamSize: "1-5",
      source: "INQUIRY", sourcePath: "/contact", utmSource: null, utmMedium: null, utmCampaign: null,
      status: "NEW", score: 32,
      pageViews: 4, formSubmits: 1, emailOpens: 1, emailClicks: 0, callsLogged: 0, meetings: 0,
      ageDays: 0,
      message: "Curious about EU GDPR compliance for portal data.",
    },
    {
      name: "Carlos Vega", company: "Vega Wide-Format", role: "Owner",
      phone: "+1 (520) 555-2233", region: "Southwest US", industry: "Wide-format print",
      tags: ["wide-format"], teamSize: "6-25",
      source: "DEMO", sourcePath: "/for-print-shops", utmSource: "google", utmMedium: "cpc", utmCampaign: "wide-format-q2",
      status: "CONTACTED", score: 49,
      pageViews: 9, formSubmits: 1, emailOpens: 3, emailClicks: 1, callsLogged: 0, meetings: 0,
      ageDays: 4,
      message: "Replacing a clunky in-house tool. Need RIP integration roadmap.",
    },
    {
      name: "Jenna Phillips", company: "Phillips Print Group", role: "GM",
      phone: "+1 (404) 555-7710", region: "Southeast US", industry: "Print shop",
      tags: ["growth-stage"], teamSize: "26-100",
      source: "INQUIRY", sourcePath: "/contact", utmSource: "linkedin", utmMedium: "social", utmCampaign: null,
      status: "QUALIFIED", score: 75,
      pageViews: 19, formSubmits: 2, emailOpens: 8, emailClicks: 4, callsLogged: 2, meetings: 1,
      ageDays: 16,
      message: "We're 38 staff across 2 locations. Roll-up coming. Need Flowtora to scale with us.",
    },
    {
      name: "Lori Adams", company: "Adams Sign Co.", role: "Owner",
      phone: "+1 (303) 555-3334", region: "Mountain West", industry: "Sign shop",
      tags: ["small-biz"], teamSize: "1-5",
      source: "TRIAL_ABANDON", sourcePath: "/signup", utmSource: "facebook", utmMedium: "social", utmCampaign: null,
      status: "CONTACTED", score: 38,
      pageViews: 5, formSubmits: 0, emailOpens: 2, emailClicks: 1, callsLogged: 1, meetings: 0,
      ageDays: 6,
      message: null,
    },
    {
      name: "Felix Rosenberg", company: "Rosenberg Press", role: "Owner",
      phone: "+1 (612) 555-9991", region: "Midwest US", industry: "Print shop",
      tags: ["legacy-systems"], teamSize: "26-100",
      source: "DEMO", sourcePath: "/for-print-shops", utmSource: "google", utmMedium: "cpc", utmCampaign: "legacy-replace",
      status: "CONTACTED", score: 61,
      pageViews: 17, formSubmits: 1, emailOpens: 5, emailClicks: 2, callsLogged: 1, meetings: 1,
      ageDays: 13,
      message: "Replacing PrintSmith. Big project — need a clear migration plan and support during cutover.",
    },
    {
      name: "Aiko Watanabe", company: "Watanabe Sign Studio", role: "Studio Manager",
      phone: "+81 90-5555-7733", region: "Asia-JP", industry: "Sign shop",
      tags: ["international"], teamSize: "1-5",
      source: "NEWSLETTER", sourcePath: "/", utmSource: null, utmMedium: null, utmCampaign: null,
      status: "NEW", score: 8,
      pageViews: 1, formSubmits: 1, emailOpens: 0, emailClicks: 0, callsLogged: 0, meetings: 0,
      ageDays: 3,
      message: null,
    },
    {
      name: "Daniel Roth", company: "Roth Sign Group", role: "President",
      phone: "+1 (415) 555-1102", region: "West Coast", industry: "Sign shop",
      tags: ["enterprise-fit"], teamSize: "100+",
      source: "INQUIRY", sourcePath: "/contact", utmSource: "linkedin", utmMedium: "social", utmCampaign: "enterprise-q2",
      status: "QUALIFIED", score: 91,
      pageViews: 32, formSubmits: 3, emailOpens: 14, emailClicks: 9, callsLogged: 4, meetings: 3,
      ageDays: 25,
      message: "120 staff, 6 locations. We're shopping a real platform. Looking for SSO + advanced reporting.",
    },
  ];

  let leadCount = 0;
  let activityCount = 0;
  let taskCount = 0;
  let emailCount = 0;
  let routingCount = 0;

  // Real templates for activities/emails so the timeline reads naturally.
  const templates = {
    pageViews: ["/", "/pricing", "/for-sign-shops", "/for-print-shops", "/blog/sign-shop-workflow", "/contact", "/features/proofs", "/features/scheduling"],
    emailSent: [
      { subj: "Welcome to Flowtora", body: "Thanks for reaching out! Here's a quick overview of how Flowtora replaces 5 spreadsheets and a paper proof process — happy to walk through any of it on a call." },
      { subj: "Quick demo recap + next steps", body: "Following up on our call. As discussed, here's a 2-week trial link with sample data already loaded so you can poke around the queue + proof flows immediately." },
      { subj: "Pricing for your team size", body: "Quick note on pricing — based on a 6-25 person team you'd land on the Pro plan, $X/month with the multi-location addon." },
      { subj: "Just checking in", body: "Wanted to circle back — happy to set up a deeper walkthrough or send over a sample import script for your existing data. What's most useful?" },
    ],
    emailReceived: [
      { subj: "Re: Welcome to Flowtora", body: "Thanks! When can we hop on a call this week? Mornings work best for us." },
      { subj: "Re: Quick demo recap + next steps", body: "Trying the trial now. Quick question — does the customer portal support file uploads >100MB?" },
      { subj: "Re: Pricing for your team size", body: "Pro plan looks reasonable. Need to compare against [competitor] but you're in the running." },
    ],
  };

  for (let pi = 0; pi < leadPlans.length; pi++) {
    const p = leadPlans[pi]!;
    const owner = owners[pi % owners.length]!;
    const createdAt = daysAgo(p.ageDays);
    const firstNamePart = p.name.split(" ")[0]!.toLowerCase();
    const email = `${firstNamePart}-${randInt(100, 999)}@seed.flowtora.example`;

    // Build score factors so the breakdown card has real data.
    const factors: Array<{ factor: string; points: number; source: string }> = [];
    if (p.company) factors.push({ factor: "Provided company name", points: 10, source: "profile" });
    if (p.phone)   factors.push({ factor: "Provided phone number", points: 8, source: "profile" });
    if (p.teamSize === "26-100" || p.teamSize === "100+") {
      factors.push({ factor: "Mid/large team size", points: 10, source: "profile" });
    } else if (p.teamSize === "6-25") {
      factors.push({ factor: "Growing team size", points: 6, source: "profile" });
    }
    if (p.message) factors.push({ factor: "Wrote a message", points: 5, source: "profile" });
    if (p.source === "DEMO") factors.push({ factor: "Demo request", points: 25, source: "intent" });
    else if (p.source === "INQUIRY") factors.push({ factor: "Contact inquiry", points: 12, source: "intent" });
    else if (p.source === "TRIAL_ABANDON") factors.push({ factor: "Started signup", points: 18, source: "intent" });
    else if (p.source === "NEWSLETTER") factors.push({ factor: "Newsletter signup", points: 3, source: "intent" });
    if (p.pageViews >= 5) factors.push({ factor: "5+ page views", points: 8, source: "engagement" });
    else if (p.pageViews >= 2) factors.push({ factor: "2+ page views", points: 4, source: "engagement" });
    if (p.formSubmits >= 2) factors.push({ factor: "Multiple form submits", points: 6, source: "engagement" });
    if (p.emailOpens >= 3) factors.push({ factor: "Engaged with emails (3+)", points: 6, source: "engagement" });
    if (p.emailClicks >= 1) factors.push({ factor: "Clicked link in email", points: 8, source: "engagement" });
    if (p.meetings >= 1) factors.push({ factor: "Booked a meeting", points: 15, source: "engagement" });
    if (p.callsLogged >= 1) factors.push({ factor: "Phone conversation", points: 10, source: "engagement" });

    // MQL/SQL gating from score + status.
    const mqlAt = p.score >= 40 ? daysAgo(Math.max(0, p.ageDays - 2)) : null;
    const sqlAt = (p.status === "QUALIFIED" || p.status === "CONVERTED") ? daysAgo(Math.max(0, p.ageDays - 4)) : null;
    const firstContactedAt = p.callsLogged > 0 || p.emailOpens > 0
      ? daysAgo(Math.max(0, p.ageDays - 1))
      : null;
    const lastContactedAt = p.callsLogged > 0 || p.emailOpens > 1
      ? daysAgo(randInt(0, Math.min(p.ageDays, 5)))
      : firstContactedAt;
    const convertedAt = p.status === "CONVERTED" ? daysAgo(randInt(0, 5)) : null;
    const convertedTenant = p.convertTenantIdx != null ? tenants[p.convertTenantIdx] : null;
    const disqualifiedReason = p.status === "DISQUALIFIED"
      ? "Pricing objection — left door open for a future check-in."
      : (p.status === "SPAM" ? "Spam pattern: gibberish message + irrelevant offer." : null);

    const lead = await db.marketingLead.create({
      data: {
        kind: p.source,
        email,
        name: p.name,
        company: p.company,
        role: p.role,
        phone: p.phone,
        teamSize: p.teamSize,
        message: p.message,
        timezone: p.region.startsWith("EU") ? "Europe/Berlin" :
                  p.region.startsWith("Asia-JP") ? "Asia/Tokyo" :
                  p.region.startsWith("Asia-IN") ? "Asia/Kolkata" : "America/Los_Angeles",
        region: p.region,
        industry: p.industry,
        tags: p.tags,
        score: p.score,
        scoreFactors: factors,
        source: p.sourcePath,
        referrer: p.utmSource ? `https://${p.utmSource}.com` : null,
        utmSource: p.utmSource,
        utmMedium: p.utmMedium,
        utmCampaign: p.utmCampaign,
        ipHash: Math.random().toString(36).slice(2, 18),
        userAgent: rand(["Mozilla/5.0 Chrome", "Mozilla/5.0 Safari", "Mozilla/5.0 Firefox"]),
        status: p.status,
        assignedToUserId: p.status === "SPAM" ? null : owner.id,
        firstContactedAt,
        lastContactedAt,
        convertedAt,
        convertedTenantId: convertedTenant?.id ?? null,
        disqualifiedReason,
        notes: p.status === "QUALIFIED" || p.status === "CONVERTED"
          ? `[${daysAgo(p.ageDays - 1).toLocaleDateString()} · sales rep]\nGood fit. Decision-maker engaged. Following up next week.`
          : null,
        mqlAt,
        sqlAt,
        lastActivityAt: lastContactedAt ?? createdAt,
        createdAt,
      },
      select: { id: true },
    });
    leadCount++;

    // ── Activities ──
    // FORM_SUBMIT events
    for (let i = 0; i < p.formSubmits; i++) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: "FORM_SUBMIT",
          detail: i === 0 ? `Submitted ${p.source.toLowerCase()} form` : "Resubmitted form",
          url: p.sourcePath,
          metadata: { campaign: p.utmCampaign },
          occurredAt: daysAgo(p.ageDays - i),
        },
      });
      activityCount++;
    }
    // PAGE_VIEW events
    for (let i = 0; i < p.pageViews; i++) {
      const pageUrl = rand(templates.pageViews);
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: "PAGE_VIEW",
          detail: `Viewed ${pageUrl}`,
          url: pageUrl,
          occurredAt: daysAgo(randInt(0, p.ageDays)),
        },
      });
      activityCount++;
    }
    // EMAIL_OPENED + EMAIL_CLICKED + EMAIL_SENT
    for (let i = 0; i < p.emailOpens; i++) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: "EMAIL_OPENED",
          detail: `Opened: ${rand(templates.emailSent).subj}`,
          occurredAt: daysAgo(randInt(0, p.ageDays - 1)),
        },
      });
      activityCount++;
    }
    for (let i = 0; i < p.emailClicks; i++) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: "EMAIL_CLICKED",
          detail: `Clicked link in: ${rand(templates.emailSent).subj}`,
          url: "/pricing",
          occurredAt: daysAgo(randInt(0, p.ageDays - 1)),
        },
      });
      activityCount++;
    }
    // Calls + meetings
    for (let i = 0; i < p.callsLogged; i++) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: rand(["CALL_MADE", "CALL_RECEIVED"] as const),
          detail: `${i === 0 ? "Discovery call" : "Follow-up call"} · ${randInt(15, 45)}min`,
          occurredAt: daysAgo(randInt(0, p.ageDays - 1)),
        },
      });
      activityCount++;
    }
    for (let i = 0; i < p.meetings; i++) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: i === 0 ? "MEETING_SCHEDULED" : "MEETING_COMPLETED",
          detail: `Demo · ${randInt(30, 60)}min`,
          occurredAt: daysAgo(randInt(0, p.ageDays - 1)),
        },
      });
      activityCount++;
    }
    if (p.status === "CONVERTED" && convertedTenant) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: "CONVERTED",
          detail: `Converted to tenant ${convertedTenant.name}`,
          url: `/platform/tenants/${convertedTenant.slug}`,
          occurredAt: convertedAt ?? new Date(),
        },
      });
      activityCount++;
    }
    // Status & score events
    await db.leadActivity.create({
      data: {
        leadId: lead.id,
        kind: "ASSIGNED",
        detail: p.status === "SPAM" ? "Auto-flagged spam (no owner assigned)" : `Assigned to lead owner`,
        occurredAt: daysAgo(p.ageDays),
      },
    });
    activityCount++;
    if (p.score > 0) {
      await db.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: "SCORE_UPDATED",
          detail: `Score → ${p.score}`,
          metadata: { score: p.score },
          occurredAt: daysAgo(Math.max(0, p.ageDays - 1)),
        },
      });
      activityCount++;
    }

    // ── Email thread ──
    const sentCount = Math.min(p.emailOpens, 3);
    for (let i = 0; i < sentCount; i++) {
      const t = templates.emailSent[i % templates.emailSent.length]!;
      await db.leadEmailMessage.create({
        data: {
          leadId: lead.id,
          direction: "OUT",
          subject: t.subj,
          body: t.body,
          fromEmail: "sales@flowtora.com",
          toEmail: email,
          authorId: owner.id,
          createdAt: daysAgo(Math.max(0, p.ageDays - 1 - i)),
        },
      });
      emailCount++;
    }
    if (p.emailClicks > 0 || (p.status === "QUALIFIED" || p.status === "CONVERTED")) {
      const r = rand(templates.emailReceived);
      await db.leadEmailMessage.create({
        data: {
          leadId: lead.id,
          direction: "IN",
          subject: r.subj,
          body: r.body,
          fromEmail: email,
          toEmail: "sales@flowtora.com",
          createdAt: daysAgo(Math.max(0, p.ageDays - 2)),
        },
      });
      emailCount++;
    }

    // ── Tasks ──
    if (p.status === "NEW") {
      await db.leadTask.create({
        data: {
          leadId: lead.id,
          title: "Send first-touch email + book intro call",
          notes: null,
          dueAt: daysAgo(-1),
          assignedToUserId: owner.id,
          createdById: owner.id,
        },
      });
      taskCount++;
    } else if (p.status === "CONTACTED") {
      await db.leadTask.create({
        data: {
          leadId: lead.id,
          title: "Follow up if no reply by Friday",
          dueAt: daysAgo(-3),
          assignedToUserId: owner.id,
          createdById: owner.id,
        },
      });
      taskCount++;
    } else if (p.status === "QUALIFIED") {
      await db.leadTask.create({
        data: {
          leadId: lead.id,
          title: "Send proposal + pricing breakdown",
          dueAt: daysAgo(-2),
          assignedToUserId: owner.id,
          createdById: owner.id,
        },
      });
      taskCount++;
      // Add a completed historical task too.
      await db.leadTask.create({
        data: {
          leadId: lead.id,
          title: "Discovery call",
          completedAt: daysAgo(Math.max(0, p.ageDays - 4)),
          assignedToUserId: owner.id,
          createdById: owner.id,
          createdAt: daysAgo(p.ageDays - 1),
        },
      });
      taskCount++;
    } else if (p.status === "CONVERTED") {
      await db.leadTask.create({
        data: {
          leadId: lead.id,
          title: "Welcome onboarding outreach",
          completedAt: daysAgo(0),
          assignedToUserId: owner.id,
          createdById: owner.id,
          createdAt: daysAgo(2),
        },
      });
      taskCount++;
    }

    // ── Routing history ──
    if (p.status !== "SPAM") {
      await db.leadRoutingEvent.create({
        data: {
          leadId: lead.id,
          ruleName: p.source === "DEMO" ? "Demo → senior sales" : "Inbound round-robin",
          action: "ROUTED_TO",
          detail: `Assigned to ${owner.id}`,
          occurredAt: daysAgo(p.ageDays),
        },
      });
      routingCount++;
    }
    if (mqlAt) {
      await db.leadRoutingEvent.create({
        data: {
          leadId: lead.id,
          ruleName: "MQL gate (score ≥ 40)",
          action: "QUALIFIED",
          detail: `Score reached ${p.score} — promoted to MQL.`,
          occurredAt: mqlAt,
        },
      });
      routingCount++;
    }
    if (sqlAt) {
      await db.leadRoutingEvent.create({
        data: {
          leadId: lead.id,
          ruleName: "SQL gate (manual qualification)",
          action: "SQL",
          detail: "Sales rep marked QUALIFIED after discovery call.",
          occurredAt: sqlAt,
        },
      });
      routingCount++;
    }
    if (p.status === "CONVERTED") {
      await db.leadRoutingEvent.create({
        data: {
          leadId: lead.id,
          ruleName: "Conversion",
          action: "CONVERTED",
          detail: `Linked to tenant ${convertedTenant?.slug ?? "?"}`,
          occurredAt: convertedAt ?? new Date(),
        },
      });
      routingCount++;
    }
    if (p.status === "DISQUALIFIED") {
      await db.leadRoutingEvent.create({
        data: {
          leadId: lead.id,
          ruleName: "Disqualified",
          action: "DISQUALIFIED",
          detail: disqualifiedReason ?? "No reason provided",
          occurredAt: daysAgo(0),
        },
      });
      routingCount++;
    }
  }

  console.log(
    `  ✓ ${leadCount} leads, ${activityCount} activity events, ${taskCount} tasks, ${emailCount} emails, ${routingCount} routing events`,
  );
}

/* ── Page 45 — Integrations Catalog ──────────────── */

async function seedIntegrationCatalog(tenants: { id: string; name: string; slug: string }[]) {
  console.log("── Seeding integrations catalog (Page 45)…");

  type Blueprint = {
    slug: string;
    name: string;
    category:
      | "ACCOUNTING" | "PAYMENTS" | "ECOMMERCE" | "MARKETPLACES" | "AUTOMATION" | "COMMUNICATION"
      | "EMAIL_MARKETING" | "CRM" | "TEAM_COLLAB" | "PRODUCTIVITY" | "SHIPPING" | "CARRIERS"
      | "DESIGN" | "FILE_TRANSFER" | "PRINT_INDUSTRY" | "EQUIPMENT" | "ANALYTICS" | "TELEPHONY"
      | "CALENDAR" | "REVIEWS" | "OTHER";
    status: "ACTIVE" | "BETA" | "COMING_SOON" | "DEPRECATED" | "INTERNAL_ONLY";
    authType: "OAUTH2" | "API_KEY" | "BASIC_AUTH" | "SAML" | "CUSTOM";
    short: string;
    description: string;
    vendorUrl: string;
    supportEmail: string;
    plans: string[];
    regions: ("US" | "CA" | "EU" | "UK" | "APAC" | "GLOBAL")[];
    capabilities: Array<{ entity: string; read: boolean; write: boolean; sync: boolean; webhook: boolean }>;
    scopes?: Array<{ scope: string; capability: string; justification: string }>;
    outboundWebhooks?: Array<{ event: string; description: string }>;
    inboundWebhooks?:  Array<{ event: string; description: string }>;
    fieldMappings?:    Array<{ flowtoraField: string; partnerField: string; direction: "OUT" | "IN" | "BOTH" }>;
    perCallCents?: number;
    requiresUpgrade?: boolean;
    deprecatedDays?: number;
    versions?: Array<{ version: string; changes: string; releasedDays: number; isDefault?: boolean; deprecatedDays?: number }>;
    docs?: string;
    faq?: string;
    code?: Record<string, string>;
  };

  const integrations: Blueprint[] = [
    {
      slug: "quickbooks-online",
      name: "[seed] QuickBooks Online",
      category: "ACCOUNTING", status: "ACTIVE", authType: "OAUTH2",
      short: "Sync invoices, customers, and payments to QuickBooks Online.",
      description: "Two-way sync between Flowtora and QuickBooks Online. Customers, invoices, and payments mirror automatically; line items map to QuickBooks income accounts you configure during setup.",
      vendorUrl: "https://quickbooks.intuit.com/online/",
      supportEmail: "support@intuit.com",
      plans: ["Pro", "Business", "Enterprise"],
      regions: ["US", "CA", "UK", "GLOBAL"],
      capabilities: [
        { entity: "Customer", read: true, write: true, sync: true, webhook: false },
        { entity: "Invoice",  read: true, write: true, sync: true, webhook: true  },
        { entity: "Payment",  read: true, write: true, sync: true, webhook: true  },
        { entity: "Item",     read: true, write: false, sync: true, webhook: false },
      ],
      scopes: [
        { scope: "com.intuit.quickbooks.accounting", capability: "READ/WRITE", justification: "Read + write customers, invoices, line items, and payments." },
      ],
      outboundWebhooks: [
        { event: "invoice.created", description: "Push new invoices to QuickBooks." },
        { event: "payment.received", description: "Mark invoices paid in QuickBooks." },
      ],
      inboundWebhooks: [
        { event: "invoice.payment_recorded", description: "QuickBooks marked a payment — reflect it in Flowtora." },
      ],
      fieldMappings: [
        { flowtoraField: "Invoice.total", partnerField: "Invoice.TotalAmt", direction: "OUT" },
        { flowtoraField: "Customer.email", partnerField: "Customer.PrimaryEmailAddr.Address", direction: "BOTH" },
        { flowtoraField: "LineItem.description", partnerField: "Line.Description", direction: "OUT" },
      ],
      versions: [
        { version: "1.0.0", changes: "Initial release.", releasedDays: 320, deprecatedDays: 60 },
        { version: "2.0.0", changes: "Adds payment webhooks; switches to OAuth 2 + Intuit API v3.", releasedDays: 60, isDefault: true },
        { version: "2.1.0", changes: "Adds line-item description sync + multi-currency support.", releasedDays: 12 },
      ],
      docs: "## QuickBooks Online setup\n\n1. Connect from **Settings → Integrations → QuickBooks Online**.\n2. Pick the QBO company on the OAuth screen.\n3. Map your default income account.\n\n## Troubleshooting\n\n* **Invoices stuck pending**: rotate the connection token from the integrations dashboard.\n",
      faq: "**Does it support sub-customers?** Yes — sync them as separate Flowtora customers and link via the parent_id field.\n\n**Does it support multi-currency?** Yes (since v2.1.0).",
      code: {
        node: "import { QuickBooksClient } from \"@flowtora/quickbooks\";\nconst qb = new QuickBooksClient({ tenantId });\nawait qb.invoices.create({ customerId, lines });\n",
      },
    },
    {
      slug: "stripe",
      name: "[seed] Stripe",
      category: "PAYMENTS", status: "ACTIVE", authType: "OAUTH2",
      short: "Accept payments + subscriptions via Stripe Connect.",
      description: "Stripe Connect powers tenant-side payments. Charges, subscriptions, refunds, and disputes sync in real time via webhooks.",
      vendorUrl: "https://stripe.com",
      supportEmail: "support@stripe.com",
      plans: ["Pro", "Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Charge",       read: true, write: true, sync: true, webhook: true },
        { entity: "Subscription", read: true, write: true, sync: true, webhook: true },
        { entity: "Refund",       read: true, write: true, sync: true, webhook: true },
        { entity: "Customer",     read: true, write: true, sync: true, webhook: true },
      ],
      scopes: [
        { scope: "read_write", capability: "READ/WRITE", justification: "Process payments + manage subscriptions on behalf of the tenant." },
      ],
      outboundWebhooks: [
        { event: "charge.refunded", description: "Issue a refund through Stripe." },
      ],
      inboundWebhooks: [
        { event: "charge.succeeded",   description: "Mark invoice paid." },
        { event: "charge.failed",      description: "Trigger dunning workflow." },
        { event: "customer.subscription.deleted", description: "Cancel tenant subscription." },
      ],
      fieldMappings: [
        { flowtoraField: "Payment.amount", partnerField: "Charge.amount", direction: "BOTH" },
        { flowtoraField: "Customer.stripeCustomerId", partnerField: "Customer.id", direction: "BOTH" },
      ],
      versions: [
        { version: "3.0.0", changes: "Stripe Connect (Standard) onboarding.", releasedDays: 540, deprecatedDays: 180 },
        { version: "4.0.0", changes: "Stripe Connect Express + radius authentication.", releasedDays: 90, isDefault: true },
      ],
      perCallCents: 5,
    },
    {
      slug: "shopify",
      name: "[seed] Shopify",
      category: "ECOMMERCE", status: "ACTIVE", authType: "OAUTH2",
      short: "Pull orders + products from Shopify storefronts.",
      description: "Imports Shopify orders into the Flowtora job queue. Customers, line items, and shipping addresses ride along; tracking numbers push back to Shopify on dispatch.",
      vendorUrl: "https://shopify.com",
      supportEmail: "partner@shopify.com",
      plans: ["Pro", "Business"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Order",    read: true, write: false, sync: true, webhook: true },
        { entity: "Customer", read: true, write: false, sync: true, webhook: false },
        { entity: "Product",  read: true, write: false, sync: true, webhook: false },
        { entity: "Fulfillment", read: false, write: true, sync: true, webhook: false },
      ],
      scopes: [
        { scope: "read_orders",       capability: "READ",  justification: "Pull orders into the Flowtora job queue." },
        { scope: "write_fulfillments",capability: "WRITE", justification: "Push tracking numbers back to Shopify." },
      ],
      inboundWebhooks: [
        { event: "orders/create", description: "Create job in Flowtora." },
      ],
    },
    {
      slug: "square",
      name: "[seed] Square",
      category: "PAYMENTS", status: "ACTIVE", authType: "OAUTH2",
      short: "Accept in-person + online payments via Square.",
      description: "Square integration for shops that take walk-in payments. Receipts sync to Flowtora invoices; refunds round-trip cleanly.",
      vendorUrl: "https://squareup.com",
      supportEmail: "developers@squareup.com",
      plans: ["Pro", "Business"],
      regions: ["US", "CA", "UK", "APAC"],
      capabilities: [
        { entity: "Payment", read: true, write: true, sync: true, webhook: true },
        { entity: "Customer", read: true, write: true, sync: true, webhook: false },
      ],
    },
    {
      slug: "xero",
      name: "[seed] Xero",
      category: "ACCOUNTING", status: "ACTIVE", authType: "OAUTH2",
      short: "Sync invoices and contacts to Xero.",
      description: "Xero accounting integration popular in EU/UK/AU.",
      vendorUrl: "https://xero.com",
      supportEmail: "support@xero.com",
      plans: ["Business", "Enterprise"],
      regions: ["US", "UK", "EU", "APAC"],
      capabilities: [
        { entity: "Contact", read: true, write: true, sync: true, webhook: false },
        { entity: "Invoice", read: true, write: true, sync: true, webhook: false },
      ],
    },
    {
      slug: "mailchimp",
      name: "[seed] Mailchimp",
      category: "EMAIL_MARKETING", status: "ACTIVE", authType: "OAUTH2",
      short: "Sync customers as Mailchimp audience members.",
      description: "Pushes Flowtora customers into a chosen Mailchimp audience, with tags for plan tier + last order date.",
      vendorUrl: "https://mailchimp.com",
      supportEmail: "support@mailchimp.com",
      plans: ["Business"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Audience", read: true, write: true, sync: true, webhook: false },
      ],
    },
    {
      slug: "klaviyo",
      name: "[seed] Klaviyo",
      category: "EMAIL_MARKETING", status: "BETA", authType: "API_KEY",
      short: "High-velocity transactional + lifecycle email via Klaviyo.",
      description: "Klaviyo profiles + events for shops that need richer segmentation than Mailchimp.",
      vendorUrl: "https://klaviyo.com",
      supportEmail: "success@klaviyo.com",
      plans: ["Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Profile", read: true, write: true, sync: true, webhook: false },
        { entity: "Event",   read: false, write: true, sync: false, webhook: false },
      ],
    },
    {
      slug: "hubspot",
      name: "[seed] HubSpot",
      category: "CRM", status: "ACTIVE", authType: "OAUTH2",
      short: "Two-way sync of contacts, companies, and deals with HubSpot.",
      description: "Mid-market CRM. Bidirectional sync — Flowtora customers as HubSpot contacts/companies; invoices as deals.",
      vendorUrl: "https://hubspot.com",
      supportEmail: "support@hubspot.com",
      plans: ["Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Contact", read: true, write: true, sync: true, webhook: true },
        { entity: "Company", read: true, write: true, sync: true, webhook: true },
        { entity: "Deal",    read: true, write: true, sync: true, webhook: true },
      ],
    },
    {
      slug: "salesforce",
      name: "[seed] Salesforce",
      category: "CRM", status: "BETA", authType: "OAUTH2",
      short: "Enterprise CRM sync — accounts, opportunities, contacts.",
      description: "Salesforce integration for the enterprise tier. Field mappings ship with sensible defaults; admins can customize per-tenant.",
      vendorUrl: "https://salesforce.com",
      supportEmail: "developer@salesforce.com",
      plans: ["Enterprise"],
      regions: ["GLOBAL"],
      requiresUpgrade: true,
      capabilities: [
        { entity: "Account",     read: true, write: true, sync: true, webhook: true },
        { entity: "Opportunity", read: true, write: true, sync: true, webhook: true },
        { entity: "Contact",     read: true, write: true, sync: true, webhook: true },
      ],
    },
    {
      slug: "slack",
      name: "[seed] Slack",
      category: "TEAM_COLLAB", status: "ACTIVE", authType: "OAUTH2",
      short: "Post job + invoice notifications into Slack channels.",
      description: "Real-time notifications. Tenants pick which events go to which channels.",
      vendorUrl: "https://slack.com",
      supportEmail: "feedback@slack.com",
      plans: ["Pro", "Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Channel", read: true, write: true, sync: false, webhook: false },
      ],
    },
    {
      slug: "twilio-sms",
      name: "[seed] Twilio SMS",
      category: "COMMUNICATION", status: "ACTIVE", authType: "API_KEY",
      short: "Send SMS notifications + 2FA via Twilio.",
      description: "SMS notifications for proof approvals, ready-for-pickup, and 2FA login codes.",
      vendorUrl: "https://twilio.com",
      supportEmail: "help@twilio.com",
      plans: ["Pro", "Business"],
      regions: ["GLOBAL"],
      perCallCents: 75,
      capabilities: [
        { entity: "Message", read: false, write: true, sync: false, webhook: true },
      ],
    },
    {
      slug: "shipstation",
      name: "[seed] ShipStation",
      category: "SHIPPING", status: "ACTIVE", authType: "API_KEY",
      short: "Print labels + track shipments via ShipStation.",
      description: "Pushes orders to ShipStation for label generation; tracking numbers come back via webhook.",
      vendorUrl: "https://shipstation.com",
      supportEmail: "support@shipstation.com",
      plans: ["Pro", "Business"],
      regions: ["US", "CA", "UK"],
      capabilities: [
        { entity: "Shipment", read: true, write: true, sync: true, webhook: true },
      ],
    },
    {
      slug: "fedex",
      name: "[seed] FedEx",
      category: "CARRIERS", status: "ACTIVE", authType: "API_KEY",
      short: "FedEx rates, labels, and tracking.",
      description: "Direct FedEx integration for shops that want to print labels at-source rather than via ShipStation.",
      vendorUrl: "https://developer.fedex.com",
      supportEmail: "developer@fedex.com",
      plans: ["Business"],
      regions: ["US", "CA"],
      capabilities: [
        { entity: "Shipment", read: true, write: true, sync: false, webhook: false },
      ],
    },
    {
      slug: "google-calendar",
      name: "[seed] Google Calendar",
      category: "CALENDAR", status: "ACTIVE", authType: "OAUTH2",
      short: "Create install-day calendar events for crews.",
      description: "Pushes install dates to crew Google Calendars; updates round-trip when crews accept/decline.",
      vendorUrl: "https://calendar.google.com",
      supportEmail: "calendar-api-support@google.com",
      plans: ["Pro", "Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Event", read: true, write: true, sync: true, webhook: true },
      ],
    },
    {
      slug: "calendly",
      name: "[seed] Calendly",
      category: "CALENDAR", status: "ACTIVE", authType: "OAUTH2",
      short: "Customer self-scheduled estimates via Calendly.",
      description: "Embed Calendly on Flowtora-hosted booking pages; capture booking metadata into the lead inbox.",
      vendorUrl: "https://calendly.com",
      supportEmail: "support@calendly.com",
      plans: ["Pro", "Business"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Booking", read: true, write: false, sync: false, webhook: true },
      ],
    },
    {
      slug: "google-analytics-4",
      name: "[seed] Google Analytics 4",
      category: "ANALYTICS", status: "ACTIVE", authType: "API_KEY",
      short: "Server-side GA4 events for marketing site conversions.",
      description: "Send purchase / signup / demo-request events to GA4 Measurement Protocol so they survive ad-blockers.",
      vendorUrl: "https://analytics.google.com",
      supportEmail: "analytics-help@google.com",
      plans: ["Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Event", read: false, write: true, sync: false, webhook: false },
      ],
    },
    {
      slug: "zapier",
      name: "[seed] Zapier",
      category: "AUTOMATION", status: "ACTIVE", authType: "API_KEY",
      short: "Trigger Zaps on Flowtora events; act on Zap actions.",
      description: "Public Zapier app — supports 30+ triggers and 25+ actions. Most popular Zap: 'New Lead → Slack channel'.",
      vendorUrl: "https://zapier.com",
      supportEmail: "partners@zapier.com",
      plans: ["Pro", "Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Trigger", read: true, write: true, sync: false, webhook: true },
        { entity: "Action",  read: false, write: true, sync: false, webhook: false },
      ],
    },
    {
      slug: "make",
      name: "[seed] Make (Integromat)",
      category: "AUTOMATION", status: "BETA", authType: "API_KEY",
      short: "Visual workflow automation with Make.",
      description: "Make integration for shops that prefer visual scenario building over Zapier's pricing tier model.",
      vendorUrl: "https://make.com",
      supportEmail: "support@make.com",
      plans: ["Pro", "Business"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Trigger", read: true, write: false, sync: false, webhook: true },
      ],
    },
    {
      slug: "google-business-profile",
      name: "[seed] Google Business Profile",
      category: "REVIEWS", status: "ACTIVE", authType: "OAUTH2",
      short: "Pull Google review counts + recent reviews.",
      description: "Display each shop's Google review average + latest reviews in the Flowtora-hosted public profile.",
      vendorUrl: "https://business.google.com",
      supportEmail: "support@business.google.com",
      plans: ["Pro", "Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Review",   read: true, write: false, sync: true, webhook: false },
        { entity: "Location", read: true, write: false, sync: true, webhook: false },
      ],
    },
    {
      slug: "onyx-hub",
      name: "[seed] Onyx Hub",
      category: "PRINT_INDUSTRY", status: "ACTIVE", authType: "API_KEY",
      short: "Push print jobs to Onyx Hub RIP.",
      description: "Native integration with Onyx Hub. Send job tickets + artwork files; receive RIP completion + ink usage telemetry.",
      vendorUrl: "https://onyxgfx.com",
      supportEmail: "support@onyxgfx.com",
      plans: ["Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "PrintJob", read: true, write: true, sync: true, webhook: true },
      ],
    },
    {
      slug: "caldera",
      name: "[seed] Caldera",
      category: "PRINT_INDUSTRY", status: "BETA", authType: "API_KEY",
      short: "Caldera RIP integration — print job dispatch + ink reports.",
      description: "For shops running Caldera RIP. Tickets ship as XML; ink coverage reports come back per-job.",
      vendorUrl: "https://caldera.com",
      supportEmail: "support@caldera.com",
      plans: ["Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "PrintJob", read: true, write: true, sync: true, webhook: false },
      ],
    },
    {
      slug: "hp-printos",
      name: "[seed] HP PrintOS",
      category: "EQUIPMENT", status: "BETA", authType: "OAUTH2",
      short: "HP wide-format equipment telemetry via PrintOS.",
      description: "Pull live press status, ink levels, and job throughput from HP PrintOS into the Production Health dashboard.",
      vendorUrl: "https://www.printos.com",
      supportEmail: "printos-support@hp.com",
      plans: ["Business", "Enterprise"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "Press",   read: true, write: false, sync: true, webhook: false },
        { entity: "InkLevel", read: true, write: false, sync: true, webhook: false },
      ],
    },
    {
      slug: "figma",
      name: "[seed] Figma",
      category: "DESIGN", status: "BETA", authType: "OAUTH2",
      short: "Pull design files into proof workflow.",
      description: "Designers can pull Figma frames directly into the proof approval workflow — no PNG export step.",
      vendorUrl: "https://figma.com",
      supportEmail: "support@figma.com",
      plans: ["Business"],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "File", read: true, write: false, sync: false, webhook: false },
      ],
    },
    {
      slug: "amazon-marketplace",
      name: "[seed] Amazon Marketplace",
      category: "MARKETPLACES", status: "COMING_SOON", authType: "OAUTH2",
      short: "Pull Amazon orders into Flowtora job queue.",
      description: "For sign + print shops also selling through Amazon Marketplace. Orders, shipping addresses, fulfillment status all sync.",
      vendorUrl: "https://sellercentral.amazon.com",
      supportEmail: "developer-support@amazon.com",
      plans: ["Business", "Enterprise"],
      regions: ["US", "EU", "UK"],
      capabilities: [
        { entity: "Order", read: true, write: false, sync: true, webhook: false },
      ],
    },
    {
      slug: "freshbooks",
      name: "[seed] FreshBooks",
      category: "ACCOUNTING", status: "DEPRECATED", authType: "OAUTH2",
      short: "Legacy FreshBooks integration.",
      description: "Deprecated in favor of QuickBooks Online and Xero. Sunset Q3 2026.",
      vendorUrl: "https://freshbooks.com",
      supportEmail: "support@freshbooks.com",
      plans: ["Pro"],
      regions: ["US", "CA"],
      deprecatedDays: 60,
      capabilities: [
        { entity: "Invoice", read: true, write: true, sync: true, webhook: false },
      ],
    },
    {
      slug: "internal-billing-hooks",
      name: "[seed] Internal billing hooks",
      category: "OTHER", status: "INTERNAL_ONLY", authType: "CUSTOM",
      short: "Internal-only Flowtora finance hooks.",
      description: "Used by Flowtora finance ops to reconcile platform-wide GL entries. Not exposed to tenants.",
      vendorUrl: "https://flowtora.com",
      supportEmail: "ops@flowtora.com",
      plans: [],
      regions: ["GLOBAL"],
      capabilities: [
        { entity: "GLEntry", read: true, write: true, sync: true, webhook: false },
      ],
    },
  ];

  let createdCount = 0;
  let versionCount = 0;
  let syncEventCount = 0;
  let incidentCount = 0;
  let auditCount = 0;
  let tenantConnectionCount = 0;

  // Tenants pool — pick a subset to attach as "connected" so adoption metrics render.
  const tenantPool = tenants;

  for (let bi = 0; bi < integrations.length; bi++) {
    const b = integrations[bi]!;

    const created = await db.integrationCatalog.create({
      data: {
        slug: b.slug,
        name: b.name,
        category: b.category,
        status: b.status,
        authType: b.authType,
        logoUrl: `https://cdn.flowtora.com/integrations/${b.slug}.svg`,
        vendorUrl: b.vendorUrl,
        supportEmail: b.supportEmail,
        shortDescription: b.short,
        description: b.description,
        screenshots: [
          `https://cdn.flowtora.com/integrations/${b.slug}/shot-01.png`,
          `https://cdn.flowtora.com/integrations/${b.slug}/shot-02.png`,
        ],
        regions: b.regions,
        availablePlans: b.plans,
        envVarsRequired: b.authType === "API_KEY"
          ? [`${b.slug.toUpperCase().replace(/-/g, "_")}_API_KEY`]
          : b.authType === "OAUTH2"
            ? [`${b.slug.toUpperCase().replace(/-/g, "_")}_CLIENT_ID`, `${b.slug.toUpperCase().replace(/-/g, "_")}_CLIENT_SECRET`]
            : [],
        redirectUri: b.authType === "OAUTH2" ? `https://flowtora.com/api/oauth/${b.slug}/callback` : null,
        webhookEndpoint: `https://api.flowtora.com/webhooks/${b.slug}`,
        configSchema: {
          type: "object",
          properties: {
            apiKey: b.authType === "API_KEY" ? { type: "string", title: "API Key" } : undefined,
            accountId: b.category === "ACCOUNTING" ? { type: "string", title: "Account ID" } : undefined,
            storeUrl: b.category === "ECOMMERCE" ? { type: "string", title: "Store URL" } : undefined,
          },
          required: b.authType === "API_KEY" ? ["apiKey"] : [],
        },
        capabilities: b.capabilities,
        oauthScopes: b.scopes ?? [],
        outboundWebhooks: b.outboundWebhooks ?? [],
        inboundWebhooks: b.inboundWebhooks ?? [],
        defaultFieldMappings: b.fieldMappings ?? [],
        documentation: b.docs ?? null,
        faq: b.faq ?? null,
        codeSamples: b.code ?? {},
        defaultVersion: b.versions?.find((v) => v.isDefault)?.version ?? "1.0.0",
        deprecatedAt: b.deprecatedDays != null ? daysAgo(b.deprecatedDays) : null,
        sunsetAt: b.deprecatedDays != null ? new Date(Date.now() + 90 * DAY) : null,
        internalOnly: b.status === "INTERNAL_ONLY",
        requiresUpgrade: b.requiresUpgrade ?? false,
        perCallCents: b.perCallCents ?? null,
        passThroughFees: b.perCallCents ? `$${(b.perCallCents / 100).toFixed(4)}/call passed through` : null,
      },
    });
    createdCount++;

    // Versions
    const versions = b.versions ?? [{ version: "1.0.0", changes: "Initial release.", releasedDays: 90, isDefault: true }];
    for (const v of versions) {
      await db.integrationVersion.create({
        data: {
          integrationId: created.id,
          version: v.version,
          changes: v.changes,
          isDefault: !!v.isDefault,
          deprecatedAt: v.deprecatedDays != null ? daysAgo(v.deprecatedDays) : null,
          releasedAt: daysAgo(v.releasedDays),
          tenantCount: v.isDefault ? Math.floor(tenantPool.length * 0.7) : Math.floor(tenantPool.length * 0.1),
        },
      });
      versionCount++;
    }

    // Tenant connections — randomly attach a subset so adoption renders.
    const adoptionRate = b.status === "ACTIVE" ? 0.7 :
                          b.status === "BETA" ? 0.25 :
                          b.status === "COMING_SOON" ? 0 :
                          b.status === "DEPRECATED" ? 0.15 :
                          b.status === "INTERNAL_ONLY" ? 0 : 0;
    const targetCount = Math.round(tenantPool.length * adoptionRate);
    const shuffled = [...tenantPool].sort(() => Math.random() - 0.5);
    const selectedTenants = shuffled.slice(0, targetCount);
    for (const t of selectedTenants) {
      try {
        await db.tenantIntegration.create({
          data: {
            tenantId: t.id,
            provider: b.slug,
            status: Math.random() < 0.85 ? "CONNECTED" : "ERRORED",
            scope: b.capabilities[0]?.entity ?? null,
            lastSyncAt: daysAgo(randInt(0, 14)),
            recordsSynced: randInt(50, 5000),
            errorCount: randInt(0, 5),
            connectedAt: daysAgo(randInt(7, 180)),
          },
        });
        tenantConnectionCount++;
      } catch {
        // unique-constraint conflict on (tenantId, provider) — skip
      }
    }
    await db.integrationCatalog.update({
      where: { id: created.id },
      data: { connectedTenantCount: selectedTenants.length },
    });

    // Sync events — 30 days of synthetic telemetry per active integration.
    // Use createMany with a sample-size cap so the seed runs in <2 min.
    if (b.status === "ACTIVE" || b.status === "BETA") {
      const baseSyncs = b.status === "ACTIVE" ? randInt(8, 18) : randInt(2, 6);
      const errorRate = b.status === "ACTIVE" ? 0.02 : 0.05;
      const events: Array<Record<string, unknown>> = [];
      let dailySuccessTotal = 0;
      let dailyErrorTotal = 0;
      for (let day = 29; day >= 0; day--) {
        const syncs = baseSyncs + Math.floor(Math.random() * 5);
        for (let i = 0; i < syncs; i++) {
          const success = Math.random() > errorRate;
          if (success) dailySuccessTotal++; else dailyErrorTotal++;
          const tenantId = Math.random() < 0.8 && selectedTenants.length > 0
            ? rand(selectedTenants).id
            : null;
          events.push({
            integrationId: created.id,
            durationMs: randInt(80, success ? 500 : 2500),
            success,
            statusCode: success ? 200 : rand([429, 500, 502, 503]),
            tenantId,
            kind: rand(["sync.invoices", "sync.customers", "sync.orders", "webhook.received"] as const),
            occurredAt: new Date(Date.now() - day * DAY - randInt(0, DAY)),
          });
        }
      }
      // Bulk insert in chunks of 200.
      const chunkSize = 200;
      for (let i = 0; i < events.length; i += chunkSize) {
        const chunk = events.slice(i, i + chunkSize) as never;
        await db.integrationSyncEvent.createMany({ data: chunk });
      }
      syncEventCount += events.length;
      const total = dailySuccessTotal + dailyErrorTotal;
      const uptime = total === 0 ? 99 : (dailySuccessTotal / total) * 100;
      await db.integrationCatalog.update({
        where: { id: created.id },
        data: {
          uptimePct90d: uptime,
          syncCount7d: total > 0 ? Math.round((total / 30) * 7) : 0,
          errorCount30d: dailyErrorTotal,
        },
      });
    }

    // Incidents — 1-3 per active integration so the recent-incidents card has data.
    if (b.status === "ACTIVE" || b.status === "BETA" || b.status === "DEPRECATED") {
      const incidentTitles = [
        "Vendor API rate-limit exceeded",
        "OAuth token refresh failures",
        "Webhook delivery delays",
        "Schema migration partial failure",
        "Vendor outage — third-party reported",
      ];
      const incidentCount2 = randInt(1, 3);
      for (let i = 0; i < incidentCount2; i++) {
        const startedDays = randInt(7, 80);
        const resolved = i < incidentCount2 - 1; // last one might still be open
        await db.integrationIncident.create({
          data: {
            integrationId: created.id,
            title: rand(incidentTitles),
            description: i === 0 ? "Vendor experienced a 4h degradation. Mitigated by retry-with-backoff." : null,
            severity: rand(["MINOR", "MAJOR", "CRITICAL"] as const),
            status: resolved ? "RESOLVED" : rand(["INVESTIGATING", "MONITORING"] as const),
            startedAt: daysAgo(startedDays),
            resolvedAt: resolved ? daysAgo(startedDays - randInt(1, 5)) : null,
          },
        });
        incidentCount++;
      }
    }

    // Audit log entries — initial create + a recent edit.
    await db.integrationCatalogAuditLog.create({
      data: {
        integrationId: created.id,
        action: "created",
        detail: "Catalog entry seeded.",
        occurredAt: daysAgo(randInt(60, 320)),
      },
    });
    auditCount++;
    if (Math.random() < 0.6) {
      await db.integrationCatalogAuditLog.create({
        data: {
          integrationId: created.id,
          action: "config_updated",
          detail: rand([
            "Updated short description.",
            "Bumped default version.",
            "Added EU + UK regions.",
            "Refined capability matrix.",
            "Added inbound webhook event.",
          ] as const),
          occurredAt: daysAgo(randInt(0, 30)),
        },
      });
      auditCount++;
    }
    if (b.deprecatedDays != null) {
      await db.integrationCatalogAuditLog.create({
        data: {
          integrationId: created.id,
          action: "deprecated",
          detail: "Sunset scheduled.",
          occurredAt: daysAgo(b.deprecatedDays),
        },
      });
      auditCount++;
    }
  }

  console.log(
    `  ✓ ${createdCount} integrations, ${versionCount} versions, ${tenantConnectionCount} tenant connections, ${syncEventCount} sync events, ${incidentCount} incidents, ${auditCount} audit entries`,
  );
}

/* ── Page 46 — API Keys & Webhooks ───────────────── */

async function seedApiAndWebhooks(
  staff: { id: string }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding API keys + webhooks (Page 46)…");
  const creator = staff[0];
  if (!creator) {
    console.log("  skipped — no platform staff found");
    return;
  }

  // 1. Settings (singleton).
  await db.webhookSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRetryPolicy: "EXPONENTIAL",
      defaultMaxAttempts: 5,
      defaultTimeoutSec: 15,
      deadLetterRetentionDays: 30,
      defaultAutoDisableThreshold: 50,
      egressIps: ["52.21.34.0/29", "54.148.6.0/29", "13.59.7.0/29"],
      encryptionAlgorithm: "AES-256-GCM",
      encryptionVerifiedAt: daysAgo(7),
    },
    update: { encryptionVerifiedAt: daysAgo(7) },
  });

  // 2. Event catalog — covers all 10 categories.
  type EventBlueprint = {
    name: string;
    category:
      | "TENANT_LIFECYCLE" | "SUBSCRIPTION" | "INVOICE" | "PAYMENT" | "USER"
      | "JOB" | "INTEGRATION" | "SYSTEM" | "SECURITY" | "MARKETING";
    stability: "STABLE" | "BETA" | "DEPRECATED";
    description: string;
    introduced: string;
    sample: Record<string, unknown>;
  };
  const events: EventBlueprint[] = [
    { name: "tenant.created", category: "TENANT_LIFECYCLE", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Fired when a new tenant is created. Includes initial owner + plan.",
      sample: { id: "tenant_abc", slug: "demo-shop", name: "Demo Shop", plan: "STARTER", createdAt: "2026-05-01T12:00:00Z" } },
    { name: "tenant.updated", category: "TENANT_LIFECYCLE", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Tenant profile changed (name, address, logo).",
      sample: { id: "tenant_abc", changes: { name: { from: "Old", to: "New" } } } },
    { name: "tenant.deleted", category: "TENANT_LIFECYCLE", stability: "STABLE", introduced: "2024.03",
      description: "[seed] Tenant was hard-deleted.",
      sample: { id: "tenant_abc", deletedAt: "2026-05-01T12:00:00Z", reason: "spam" } },
    { name: "subscription.created", category: "SUBSCRIPTION", stability: "STABLE", introduced: "2024.01",
      description: "[seed] New subscription started.",
      sample: { tenantId: "tenant_abc", plan: "PRO", trialEndsAt: "2026-05-15T00:00:00Z" } },
    { name: "subscription.canceled", category: "SUBSCRIPTION", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Subscription canceled (cancelAtPeriodEnd=true).",
      sample: { tenantId: "tenant_abc", reason: "switched_competitor", cancelAtPeriodEnd: true } },
    { name: "subscription.plan_changed", category: "SUBSCRIPTION", stability: "STABLE", introduced: "2024.04",
      description: "[seed] Tenant upgraded or downgraded plan.",
      sample: { tenantId: "tenant_abc", from: "STARTER", to: "PRO" } },
    { name: "invoice.created", category: "INVOICE", stability: "STABLE", introduced: "2024.01",
      description: "[seed] New platform invoice generated for a tenant.",
      sample: { id: "inv_abc", tenantId: "tenant_abc", amount: 12500, currency: "USD" } },
    { name: "invoice.paid", category: "INVOICE", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Invoice was paid (Stripe charge succeeded).",
      sample: { id: "inv_abc", paidAt: "2026-05-01T12:00:00Z", amount: 12500 } },
    { name: "invoice.payment_failed", category: "INVOICE", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Charge attempt failed — dunning kicks in.",
      sample: { id: "inv_abc", attempt: 2, failureCode: "card_declined" } },
    { name: "payment.refunded", category: "PAYMENT", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Refund issued against a payment.",
      sample: { paymentId: "pay_abc", amount: 5000, reason: "customer_request" } },
    { name: "payment.dispute.opened", category: "PAYMENT", stability: "STABLE", introduced: "2024.06",
      description: "[seed] Cardholder filed a chargeback.",
      sample: { paymentId: "pay_abc", disputeReason: "fraudulent", amount: 12500 } },
    { name: "user.invited", category: "USER", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Tenant member invited a new teammate.",
      sample: { tenantId: "tenant_abc", invitedEmail: "alex@example.com", role: "ADMIN" } },
    { name: "user.login", category: "USER", stability: "STABLE", introduced: "2024.01",
      description: "[seed] Successful user login (audit trail).",
      sample: { userId: "user_abc", tenantId: "tenant_abc", method: "PASSWORD" } },
    { name: "user.suspicious_activity", category: "SECURITY", stability: "STABLE", introduced: "2024.08",
      description: "[seed] Suspicious activity flagged — failed logins, impossible travel, etc.",
      sample: { userId: "user_abc", reason: "impossible_travel", details: { from: "US", to: "RU" } } },
    { name: "job.created", category: "JOB", stability: "STABLE", introduced: "2024.02",
      description: "[seed] New job/order created in a tenant workspace.",
      sample: { jobId: "job_abc", tenantId: "tenant_abc", customerId: "cust_abc", total: 24500 } },
    { name: "job.status_changed", category: "JOB", stability: "STABLE", introduced: "2024.02",
      description: "[seed] Job moved to a new pipeline status.",
      sample: { jobId: "job_abc", from: "DRAFT", to: "IN_PRODUCTION" } },
    { name: "integration.connected", category: "INTEGRATION", stability: "STABLE", introduced: "2024.05",
      description: "[seed] Tenant connected a third-party integration.",
      sample: { tenantId: "tenant_abc", provider: "stripe", connectedAt: "2026-05-01T12:00:00Z" } },
    { name: "integration.sync_failed", category: "INTEGRATION", stability: "BETA", introduced: "2025.02",
      description: "[seed] An integration sync attempt failed.",
      sample: { tenantId: "tenant_abc", provider: "quickbooks-online", error: "rate_limit_exceeded" } },
    { name: "system.maintenance.started", category: "SYSTEM", stability: "STABLE", introduced: "2024.03",
      description: "[seed] Platform-wide maintenance window started.",
      sample: { window: "2026-05-01T02:00:00Z/PT2H", reason: "neon_failover" } },
    { name: "system.feature_freeze", category: "SYSTEM", stability: "STABLE", introduced: "2024.03",
      description: "[seed] Feature freeze toggled.",
      sample: { active: true, reason: "holiday_freeze" } },
    { name: "security.api_key.rotated", category: "SECURITY", stability: "STABLE", introduced: "2024.04",
      description: "[seed] Platform API key rotated.",
      sample: { apiKeyId: "key_abc", actor: "admin@flowtora.com" } },
    { name: "marketing.lead.captured", category: "MARKETING", stability: "STABLE", introduced: "2024.07",
      description: "[seed] New lead captured from a marketing form.",
      sample: { leadId: "lead_abc", source: "/contact", email: "..." } },
    { name: "marketing.referral.converted", category: "MARKETING", stability: "BETA", introduced: "2025.04",
      description: "[seed] Referred tenant converted to paid plan.",
      sample: { referralId: "ref_abc", referrerTenantId: "tenant_abc", referredTenantId: "tenant_xyz" } },
    { name: "billing.coupon_redeemed", category: "INVOICE", stability: "DEPRECATED", introduced: "2023.09",
      description: "[seed] Coupon redeemed against an invoice. Use invoice.created with `coupon` field instead.",
      sample: { tenantId: "tenant_abc", couponCode: "SUMMER25", amount: 2500 } },
  ];
  let eventCount = 0;
  const createdEventNames: string[] = [];
  for (const e of events) {
    const created = await db.webhookEvent.create({
      data: {
        name: e.name,
        category: e.category,
        description: e.description,
        introducedVersion: e.introduced,
        stability: e.stability,
        samplePayload: e.sample as never,
        deprecationNotice: e.stability === "DEPRECATED"
          ? "Use invoice.created with `coupon` field instead. Sunset 2026-12-01."
          : null,
        codeSamples: {
          node: `import { Flowtora } from "@flowtora/sdk";\nconst ft = new Flowtora({ apiKey });\nft.webhooks.on("${e.name}", (payload) => {\n  // ...\n});`,
          curl: `curl -X POST https://your.app/webhook \\\n  -H "X-Flowtora-Event: ${e.name}" \\\n  -H "X-Flowtora-Signature: <hmac>" \\\n  -d '${JSON.stringify(e.sample)}'`,
        },
        subscriberCount: 0,
      },
    });
    eventCount++;
    createdEventNames.push(e.name);
    // Add 1-2 historical version entries for events that have been
    // around for a while.
    if (e.introduced.startsWith("2024")) {
      await db.webhookEventVersion.create({
        data: {
          eventId: created.id,
          version: e.introduced,
          changes: "Initial release.",
          breaking: false,
          samplePayload: e.sample as never,
          releasedAt: daysAgo(randInt(200, 600)),
        },
      });
      if (Math.random() < 0.5) {
        await db.webhookEventVersion.create({
          data: {
            eventId: created.id,
            version: "2025.06",
            changes: "Added optional metadata fields. Non-breaking.",
            breaking: false,
            samplePayload: e.sample as never,
            releasedAt: daysAgo(randInt(60, 200)),
          },
        });
      }
    }
  }

  // 3. API keys.
  type KeyBlueprint = {
    name: string;
    description: string;
    ownerTeam: string;
    scopes: string[];
    environment: "PRODUCTION" | "STAGING" | "SANDBOX";
    expiryDays: number | null;
    ipAllowlist?: string[];
    rateLimitPerMin?: number;
    status?: "ACTIVE" | "REVOKED" | "EXPIRED";
    revokedDays?: number;
    usagePerDay: number;
    errorRate: number;
  };
  const keyBlueprints: KeyBlueprint[] = [
    {
      name: "[seed] Datadog APM ingest",
      description: "Ingest platform telemetry into Datadog APM.",
      ownerTeam: "Engineering",
      scopes: ["audit:read", "system:read_settings", "tenant:read"],
      environment: "PRODUCTION", expiryDays: 180,
      ipAllowlist: ["13.0.0.0/8"], rateLimitPerMin: 1000,
      usagePerDay: 800, errorRate: 0.005,
    },
    {
      name: "[seed] Snowflake reverse-ETL",
      description: "Pull tenant + billing data into Snowflake nightly.",
      ownerTeam: "Data", scopes: ["tenants:read", "billing:read", "users:read", "audit:read"],
      environment: "PRODUCTION", expiryDays: 365,
      rateLimitPerMin: 500, usagePerDay: 60, errorRate: 0.01,
    },
    {
      name: "[seed] Stripe Connect callback",
      description: "Internal service auth for Stripe webhooks.",
      ownerTeam: "Engineering", scopes: ["billing:read", "billing:write"],
      environment: "PRODUCTION", expiryDays: null,
      rateLimitPerMin: 5000, usagePerDay: 1500, errorRate: 0.001,
    },
    {
      name: "[seed] Customer.io sync",
      description: "Sync engagement data into Customer.io for marketing.",
      ownerTeam: "Marketing", scopes: ["users:read", "tenants:read"],
      environment: "PRODUCTION", expiryDays: 90, rateLimitPerMin: 200,
      usagePerDay: 120, errorRate: 0.02,
    },
    {
      name: "[seed] PagerDuty incident bridge",
      description: "Forward platform alerts to PagerDuty.",
      ownerTeam: "SRE", scopes: ["audit:read"],
      environment: "PRODUCTION", expiryDays: null, rateLimitPerMin: 100,
      usagePerDay: 5, errorRate: 0,
    },
    {
      name: "[seed] Staging — load test",
      description: "Used by load-testing harness in staging.",
      ownerTeam: "QA", scopes: ["tenants:read", "tenants:write", "billing:read"],
      environment: "STAGING", expiryDays: 30, rateLimitPerMin: 10000,
      usagePerDay: 200, errorRate: 0.05,
    },
    {
      name: "[seed] Sandbox — partner integration testing",
      description: "Lent out to partners for integration QA.",
      ownerTeam: "DevRel", scopes: ["tenants:read", "billing:read", "users:read"],
      environment: "SANDBOX", expiryDays: 90, rateLimitPerMin: 60,
      usagePerDay: 30, errorRate: 0.08,
    },
    {
      name: "[seed] Legacy migration tool",
      description: "Internal CLI to backfill data from legacy DB. Single-use.",
      ownerTeam: "Engineering", scopes: ["tenants:write", "billing:write", "system:admin"],
      environment: "PRODUCTION", expiryDays: null, rateLimitPerMin: 50,
      usagePerDay: 0, errorRate: 0,
      status: "REVOKED", revokedDays: 12,
    },
    {
      name: "[seed] Marketing site form submitter",
      description: "Captures contact form submissions from flowtora.com.",
      ownerTeam: "Marketing", scopes: ["leads:write"],
      environment: "PRODUCTION", expiryDays: 365, rateLimitPerMin: 30,
      usagePerDay: 8, errorRate: 0.001,
    },
    {
      name: "[seed] Mobile app v2 build",
      description: "Mobile app talks to the platform via this key.",
      ownerTeam: "Engineering", scopes: ["tenants:read", "users:read", "users:write"],
      environment: "PRODUCTION", expiryDays: 12, rateLimitPerMin: 2000,
      usagePerDay: 950, errorRate: 0.008,
    },
  ];
  let keyCount = 0;
  const keysWithUsage: Array<{ id: string; usagePerDay: number; errorRate: number }> = [];
  for (const b of keyBlueprints) {
    const tail = randomBytes(20).toString("hex");
    const envCode = b.environment === "PRODUCTION" ? "live" : b.environment === "STAGING" ? "stg" : "sand";
    const fullKey = `ft_${envCode}_${tail}`;
    const created = await db.platformApiKey.create({
      data: {
        name: b.name,
        description: b.description,
        ownerTeam: b.ownerTeam,
        scopes: b.scopes,
        environment: b.environment,
        keyPrefix: fullKey.slice(0, 12),
        hashedKey: createHash("sha256").update(fullKey).digest("hex"),
        ipAllowlist: b.ipAllowlist ?? [],
        rateLimitPerMin: b.rateLimitPerMin ?? null,
        expiresAt: b.expiryDays != null ? new Date(Date.now() + b.expiryDays * DAY) : null,
        status: b.status ?? "ACTIVE",
        revokedAt: b.revokedDays != null ? daysAgo(b.revokedDays) : null,
        revokedById: b.revokedDays != null ? creator.id : null,
        createdById: creator.id,
        lastUsedAt: b.usagePerDay > 0 ? new Date(Date.now() - randInt(1, 60) * 60_000) : null,
        createdAt: daysAgo(randInt(30, 365)),
      },
    });
    keyCount++;
    if (b.status !== "REVOKED") {
      keysWithUsage.push({ id: created.id, usagePerDay: b.usagePerDay, errorRate: b.errorRate });
    }
  }

  // Bulk-insert per-key usage events for the last 7 days.
  let usageCount = 0;
  for (const k of keysWithUsage) {
    const events: Array<Record<string, unknown>> = [];
    for (let day = 6; day >= 0; day--) {
      const callsToday = Math.round(k.usagePerDay * (0.85 + Math.random() * 0.3));
      // Sample at most 30/day to keep volumes sane.
      const sampleCount = Math.min(30, callsToday);
      for (let i = 0; i < sampleCount; i++) {
        const isError = Math.random() < k.errorRate;
        const status = isError ? rand([429, 500, 502, 503] as const) : rand([200, 200, 200, 201, 204] as const);
        events.push({
          apiKeyId: k.id,
          statusCode: status,
          route: rand(["/api/v1/tenants", "/api/v1/billing/invoices", "/api/v1/users", "/api/v1/audit"] as const),
          durationMs: randInt(20, status >= 500 ? 2000 : 400),
          ipHash: Math.random().toString(36).slice(2, 18),
          occurredAt: new Date(Date.now() - day * DAY - randInt(0, DAY)),
        });
      }
    }
    for (let i = 0; i < events.length; i += 200) {
      await db.platformApiKeyUsage.createMany({ data: events.slice(i, i + 200) as never });
    }
    usageCount += events.length;
  }

  // 4. Webhook endpoints — 8 endpoints with realistic event mixes.
  type EndpointBlueprint = {
    url: string;
    description: string;
    status: "ACTIVE" | "PAUSED" | "FAILING" | "DISABLED";
    events: string[];
    successRate: number; // 0-1
    consecutiveFailures: number;
    lastErrorMessage?: string;
    customHeaders?: Array<{ key: string; value: string }>;
    filterExpression?: string;
  };
  const endpointBlueprints: EndpointBlueprint[] = [
    {
      url: "https://hooks.zapier.com/hooks/catch/123/abc-flowtora",
      description: "[seed] Zapier — push tenant lifecycle into Airtable.",
      status: "ACTIVE",
      events: ["tenant.created", "tenant.updated", "subscription.plan_changed"],
      successRate: 0.998, consecutiveFailures: 0,
    },
    {
      url: "https://api.customer.io/v1/integrations/flowtora-callback",
      description: "[seed] Customer.io — engagement triggers.",
      status: "ACTIVE",
      events: ["user.login", "user.invited", "marketing.lead.captured"],
      successRate: 0.995, consecutiveFailures: 0,
    },
    {
      url: "https://api.pagerduty.com/integration/abc/incidents",
      description: "[seed] PagerDuty — failed-payment alerts → on-call.",
      status: "ACTIVE",
      events: ["invoice.payment_failed", "payment.dispute.opened", "user.suspicious_activity"],
      successRate: 1.0, consecutiveFailures: 0,
      filterExpression: "payload.amount > 50000 || event == 'user.suspicious_activity'",
    },
    {
      url: "https://salesforce.example.com/services/apexrest/flowtora",
      description: "[seed] Salesforce — push subscription events into the CRM.",
      status: "FAILING",
      events: ["subscription.created", "subscription.canceled", "subscription.plan_changed"],
      successRate: 0.42, consecutiveFailures: 7,
      lastErrorMessage: "Salesforce returned 401 — OAuth token expired",
      customHeaders: [{ key: "X-SFDC-Source", value: "platform" }],
    },
    {
      url: "https://hooks.slack.com/services/T01/B02/abc-warroom",
      description: "[seed] Slack #warroom — feature-freeze + maintenance alerts.",
      status: "ACTIVE",
      events: ["system.maintenance.started", "system.feature_freeze"],
      successRate: 1.0, consecutiveFailures: 0,
    },
    {
      url: "https://internal-finance.flowtora.com/webhook/billing",
      description: "[seed] Internal finance — invoice/payment ingest into the GL.",
      status: "ACTIVE",
      events: ["invoice.created", "invoice.paid", "payment.refunded"],
      successRate: 0.96, consecutiveFailures: 1,
      lastErrorMessage: "Connection reset — retried successfully",
    },
    {
      url: "https://staging-mock.flowtora.com/webhook/test",
      description: "[seed] Staging mock — used for QA.",
      status: "PAUSED",
      events: ["tenant.created", "subscription.created", "invoice.created"],
      successRate: 0.99, consecutiveFailures: 0,
    },
    {
      url: "https://decommissioned.example.com/webhook",
      description: "[seed] Old vendor — endpoint decommissioned. Will be removed.",
      status: "DISABLED",
      events: ["tenant.created"],
      successRate: 0, consecutiveFailures: 50,
      lastErrorMessage: "DNS resolution failed",
    },
  ];
  let endpointCount = 0;
  const createdEndpoints: { id: string; url: string; events: string[]; status: string; successRate: number }[] = [];
  for (const b of endpointBlueprints) {
    const created = await db.webhookEndpoint.create({
      data: {
        url: b.url,
        description: b.description,
        status: b.status,
        subscribedEvents: b.events,
        signingSecret: `whsec_${randomBytes(24).toString("hex")}`,
        customHeaders: b.customHeaders ?? [],
        retryPolicy: "EXPONENTIAL",
        maxAttempts: 5,
        timeoutSec: 15,
        filterExpression: b.filterExpression ?? null,
        autoDisableThreshold: 50,
        consecutiveFailures: b.consecutiveFailures,
        successRate24h: b.successRate,
        lastDeliveryAt: b.status !== "DISABLED" ? daysAgo(randInt(0, 1)) : daysAgo(60),
        lastErrorAt: b.lastErrorMessage ? daysAgo(randInt(0, 5)) : null,
        lastError: b.lastErrorMessage ?? null,
        createdById: creator.id,
        createdAt: daysAgo(randInt(30, 200)),
      },
    });
    endpointCount++;
    createdEndpoints.push({ id: created.id, url: b.url, events: b.events, status: b.status, successRate: b.successRate });
  }

  // 5. Refresh subscriberCount on events.
  for (const eventName of createdEventNames) {
    const subscriberCount = createdEndpoints.filter((e) => e.events.includes(eventName)).length;
    if (subscriberCount > 0) {
      await db.webhookEvent.updateMany({
        where: { name: eventName },
        data: { subscriberCount },
      });
    }
  }

  // 6. Webhook deliveries — bulk insert ~30 per active endpoint over the last 24h.
  let deliveryCount = 0;
  for (const ep of createdEndpoints) {
    if (ep.status === "DISABLED" || ep.events.length === 0) continue;
    const deliveryEvents = ep.status === "PAUSED" ? 5 : 30;
    const events: Array<Record<string, unknown>> = [];
    for (let i = 0; i < deliveryEvents; i++) {
      const eventName = rand(ep.events);
      const success = Math.random() < ep.successRate;
      const tenantId = Math.random() < 0.7 && tenants.length > 0 ? rand(tenants).id : null;
      const httpCode = success ? 200 : rand([401, 422, 500, 502, 503] as const);
      const status = success ? "SUCCEEDED"
        : (i % 4 === 0 ? "DEAD_LETTER" : "FAILED");
      const attempts = success ? 1 : randInt(1, 5);
      const sampleEvent = events.length > 0 ? null : null; // payload comes from event sample
      void sampleEvent;
      const samplePayload = (await db.webhookEvent.findUnique({ where: { name: eventName }, select: { samplePayload: true } }))?.samplePayload ?? {};
      events.push({
        endpointId: ep.id,
        eventName,
        tenantId,
        status,
        httpCode,
        latencyMs: randInt(50, success ? 800 : 5000),
        attempts,
        nextRetryAt: status === "FAILED" && attempts < 5
          ? new Date(Date.now() + randInt(60, 600) * 1000)
          : null,
        payload: samplePayload as never,
        responseBody: success
          ? '{"ok":true}'
          : (httpCode === 401 ? '{"error":"unauthorized"}' : '{"error":"server_error"}'),
        requestHeaders: {
          "Content-Type": "application/json",
          "X-Flowtora-Event": eventName,
          "X-Flowtora-Signature": "v1=" + randomBytes(8).toString("hex"),
        },
        responseHeaders: { "Content-Type": "application/json" },
        errorMessage: success ? null : (httpCode === 401 ? "Auth failed (token expired)" : "Upstream timeout"),
        attemptedAt: new Date(Date.now() - randInt(0, 24 * 60 * 60 * 1000)),
      });
    }
    for (let i = 0; i < events.length; i += 100) {
      await db.webhookDelivery.createMany({ data: events.slice(i, i + 100) as never });
    }
    deliveryCount += events.length;
  }

  console.log(
    `  ✓ ${eventCount} events, ${keyCount} API keys, ${usageCount.toLocaleString()} usage events, ${endpointCount} endpoints, ${deliveryCount.toLocaleString()} deliveries`,
  );
}

/* ── Page 47 — Developer Documentation ─────────────── */

async function seedDeveloperDocs(staff: { id: string }[]) {
  console.log("── Seeding developer docs (Page 47)…");
  const author = staff[0];
  if (!author) {
    console.log("  skipped — no platform staff found");
    return;
  }

  type DocBlueprint = {
    slug: string;
    title: string;
    section:
      | "GETTING_STARTED" | "AUTHENTICATION" | "CONCEPTS" | "RESOURCES" | "WEBHOOKS"
      | "SDKS" | "RECIPES" | "MIGRATION_GUIDES" | "CHANGELOG" | "ERRORS_REFERENCE"
      | "RATE_LIMITS" | "GLOSSARY";
    parentSlug?: string;
    isFolder?: boolean;
    externalUrl?: string;
    deprecated?: boolean;
    status: "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";
    body: string;
    ownerTeam?: string;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
  };

  const docs: DocBlueprint[] = [
    // GETTING_STARTED
    { slug: "introduction", title: "[seed] Introduction", section: "GETTING_STARTED", status: "PUBLISHED",
      ownerTeam: "DevRel", tags: ["onboarding"],
      seoTitle: "Flowtora API — Introduction",
      seoDescription: "Get started with the Flowtora REST API in 5 minutes.",
      body: `# Introduction

Flowtora is the all-in-one shop OS for sign and print businesses. The API
exposes everything you can do in the dashboard — read tenant + customer +
job data, push invoices, dispatch jobs, subscribe to webhooks.

## Base URL

\`\`\`
https://api.flowtora.com
\`\`\`

## Authentication

All requests require a bearer token. See [Authentication](/docs/authentication).

<Callout>
Sandbox environment lives at \`https://sandbox.api.flowtora.com\` — use
sandbox-prefixed keys (\`ft_sand_…\`) for development.
</Callout>

## Quickstart

\`\`\`bash
curl https://api.flowtora.com/v1/tenants \\
  -H "Authorization: Bearer <API_KEY>"
\`\`\`
` },
    { slug: "quickstart", title: "[seed] 5-minute Quickstart", section: "GETTING_STARTED", status: "PUBLISHED",
      ownerTeam: "DevRel",
      body: `# 5-minute Quickstart

1. Mint an API key from the platform admin.
2. Make your first call.
3. Subscribe to a webhook.

\`\`\`bash
curl -X POST https://api.flowtora.com/v1/jobs \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{ "customerId": "cust_abc", "items": [{ "sku": "SIGN-12x18", "qty": 2 }] }'
\`\`\`
` },
    { slug: "environments", title: "[seed] Environments (Production / Staging / Sandbox)", section: "GETTING_STARTED", status: "DRAFT",
      ownerTeam: "DevRel", tags: ["environments"],
      body: `# Environments

| Environment | Base URL | Key prefix |
|---|---|---|
| Production  | \`https://api.flowtora.com\`         | \`ft_live_\` |
| Staging     | \`https://staging.api.flowtora.com\` | \`ft_stg_\`  |
| Sandbox     | \`https://sandbox.api.flowtora.com\` | \`ft_sand_\` |
` },

    // AUTHENTICATION
    { slug: "auth-overview", title: "[seed] Authentication", section: "AUTHENTICATION", status: "PUBLISHED",
      ownerTeam: "Engineering", tags: ["auth"],
      body: `# Authentication

Flowtora uses bearer tokens. Mint keys from **Platform → API Keys & Webhooks**.

## Headers

\`\`\`
Authorization: Bearer <API_KEY>
\`\`\`

<Callout>
Never commit keys to source control. Rotate keys every 90 days.
</Callout>
` },
    { slug: "auth-scopes", title: "[seed] Scopes", section: "AUTHENTICATION", parentSlug: "auth-overview",
      status: "PUBLISHED", ownerTeam: "Engineering",
      body: `# Scopes

API keys carry a scope list. Each scope follows a \`resource:action\` shape:

- \`tenants:read\` — read tenant rows
- \`tenants:write\` — create/update tenants
- \`billing:read\` / \`billing:write\` — invoicing + payments
- \`audit:read\` — read the audit log

Best practice: mint per-service keys with the smallest scope that gets
the job done.
` },
    { slug: "auth-ip-allowlist", title: "[seed] IP Allowlists", section: "AUTHENTICATION", parentSlug: "auth-overview",
      status: "PUBLISHED", ownerTeam: "Security",
      body: `# IP Allowlists

Restrict a key to specific CIDR ranges. Useful for keys held by
internal services with known egress IPs.

\`\`\`
ALLOW 10.0.0.0/8
ALLOW 203.0.113.0/24
\`\`\`
` },

    // CONCEPTS
    { slug: "concepts-tenants", title: "[seed] Tenants", section: "CONCEPTS", status: "PUBLISHED",
      ownerTeam: "Engineering", tags: ["data-model"],
      body: `# Tenants

A **tenant** is a workspace. Most resources are tenant-scoped.
Some resources (notifications, webhooks) live at the platform layer.
` },
    { slug: "concepts-jobs", title: "[seed] Jobs", section: "CONCEPTS", status: "PUBLISHED",
      ownerTeam: "Engineering",
      body: `# Jobs

A job is a unit of work flowing through the production pipeline:
quote → order → production → install → close. Each transition emits
a \`job.status_changed\` webhook.
` },
    { slug: "concepts-webhooks", title: "[seed] Webhooks (concept)", section: "CONCEPTS", status: "PUBLISHED",
      body: `# Webhooks

Subscribe to events to react to changes in real time. See
[Webhooks](/docs/webhooks) for the full catalog.
` },

    // RESOURCES
    { slug: "resources-folder", title: "[seed] Resources", section: "RESOURCES", isFolder: true, status: "PUBLISHED", body: "" },
    { slug: "resource-tenants", title: "[seed] Tenants Resource", section: "RESOURCES", parentSlug: "resources-folder",
      status: "PUBLISHED", ownerTeam: "Engineering", tags: ["resource"],
      body: `# Tenants

<Endpoint method="GET" path="/v1/tenants" />

Returns the list of tenants the API key has access to.

<Param name="page" type="integer" required={false}>1-indexed page number.</Param>
<Param name="pageSize" type="integer" required={false}>Default 50, max 200.</Param>

<Response status={200}>Returns a paginated list of tenants.</Response>
` },
    { slug: "resource-jobs", title: "[seed] Jobs Resource", section: "RESOURCES", parentSlug: "resources-folder",
      status: "PUBLISHED", ownerTeam: "Engineering", tags: ["resource"],
      body: `# Jobs

<Endpoint method="POST" path="/v1/jobs" />

Creates a new job in the tenant's workspace.

\`\`\`json
{
  "customerId": "cust_abc",
  "items": [{ "sku": "SIGN-12x18", "qty": 2 }],
  "notes": "Rush order — install Friday"
}
\`\`\`
` },
    { slug: "resource-invoices", title: "[seed] Invoices Resource", section: "RESOURCES", parentSlug: "resources-folder",
      status: "REVIEW", ownerTeam: "Engineering",
      body: `# Invoices

> 🚧 In review — final field shape pending design sync.

<Endpoint method="GET" path="/v1/invoices/{id}" />
` },
    { slug: "resource-customers", title: "[seed] Customers Resource", section: "RESOURCES", parentSlug: "resources-folder",
      status: "PUBLISHED", ownerTeam: "Engineering",
      body: `# Customers

<Endpoint method="GET" path="/v1/customers" />
<Endpoint method="POST" path="/v1/customers" />
<Endpoint method="GET" path="/v1/customers/{id}" />
<Endpoint method="PATCH" path="/v1/customers/{id}" />
` },

    // WEBHOOKS
    { slug: "webhooks-overview", title: "[seed] Webhooks Overview", section: "WEBHOOKS", status: "PUBLISHED",
      ownerTeam: "Engineering", tags: ["webhooks"],
      body: `# Webhooks

Webhooks notify your service of changes. Each delivery is signed with
HMAC-SHA256 using your endpoint's signing secret.

## Verifying signatures

Compute \`HMAC-SHA256(secret, body)\` and compare against the
\`X-Flowtora-Signature\` header.

\`\`\`node
import crypto from "node:crypto";
const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
const got = headers["x-flowtora-signature"].replace("v1=", "");
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
  return res.status(401).end();
}
\`\`\`
` },
    { slug: "webhooks-retry-policy", title: "[seed] Retry Policy", section: "WEBHOOKS", parentSlug: "webhooks-overview",
      status: "PUBLISHED",
      body: `# Retry Policy

We retry up to 5 times with exponential back-off (15s · 1m · 5m · 15m · 1h).
Endpoints that fail 50 consecutive deliveries auto-disable.
` },

    // SDKS
    { slug: "sdks-folder", title: "[seed] SDKs", section: "SDKS", isFolder: true, status: "PUBLISHED", body: "" },
    { slug: "sdks-node", title: "[seed] Node.js SDK", section: "SDKS", parentSlug: "sdks-folder",
      status: "PUBLISHED", ownerTeam: "DevRel",
      body: `# @flowtora/sdk (Node.js)

\`\`\`bash
npm install @flowtora/sdk
\`\`\`

\`\`\`node
import { Flowtora } from "@flowtora/sdk";
const ft = new Flowtora({ apiKey: process.env.FLOWTORA_API_KEY });
const tenants = await ft.tenants.list();
\`\`\`
` },
    { slug: "sdks-python", title: "[seed] Python SDK", section: "SDKS", parentSlug: "sdks-folder",
      status: "REVIEW", ownerTeam: "DevRel",
      body: `# flowtora (Python)

\`\`\`bash
pip install flowtora
\`\`\`

\`\`\`python
from flowtora import Flowtora
ft = Flowtora(api_key=os.environ["FLOWTORA_API_KEY"])
print(ft.tenants.list())
\`\`\`
` },
    { slug: "sdks-github", title: "[seed] All SDKs (GitHub)", section: "SDKS", parentSlug: "sdks-folder",
      externalUrl: "https://github.com/flowtora-app/sdks",
      status: "PUBLISHED", body: "" },

    // RECIPES
    { slug: "recipe-import-csv", title: "[seed] Bulk-import customers from CSV", section: "RECIPES",
      status: "PUBLISHED", ownerTeam: "DevRel",
      body: `# Bulk-import customers from CSV

Step-by-step: parse a CSV, idempotently upsert via \`POST /v1/customers\`,
roll up errors into a report.

\`\`\`node
import fs from "node:fs/promises";
import { parse } from "csv-parse/sync";
const rows = parse(await fs.readFile("customers.csv"), { columns: true });
for (const row of rows) {
  await ft.customers.upsert({ external_id: row.id, ...row });
}
\`\`\`
` },
    { slug: "recipe-stripe-billing", title: "[seed] Wire Stripe webhooks → Flowtora invoices", section: "RECIPES",
      status: "PUBLISHED", ownerTeam: "DevRel",
      body: `# Stripe webhooks → Flowtora invoices

When Stripe charges succeed, mark the matching Flowtora invoice paid.
` },

    // MIGRATION_GUIDES
    { slug: "migration-2025-q4", title: "[seed] Migrating from v2024.06 → v2025.10", section: "MIGRATION_GUIDES",
      status: "PUBLISHED", ownerTeam: "DevRel",
      body: `# Migrating from v2024.06 → v2025.10

## Breaking changes

- \`Customer.email\` is now case-insensitive on lookup.
- \`Job.status\` removed legacy values \`PROCESSING\` (use \`IN_PRODUCTION\`).

## Non-breaking additions

- New optional field \`Customer.preferredChannel\` (sms / email / phone).
- New webhook event \`subscription.plan_changed\`.
` },
    { slug: "migration-2026-q1", title: "[seed] Migrating from v2025.10 → v2026.05", section: "MIGRATION_GUIDES",
      status: "DRAFT", ownerTeam: "DevRel", deprecated: false,
      body: `# Migrating from v2025.10 → v2026.05

> 🚧 Draft — finalising before publication.

Pagination cursors replace integer page numbers. Endpoints accepting
\`?page=N\` will continue to work for 6 months.
` },

    // CHANGELOG
    { slug: "changelog-2026-05", title: "[seed] 2026.05 Changelog", section: "CHANGELOG",
      status: "PUBLISHED", ownerTeam: "DevRel",
      body: `# 2026.05

- **NEW**: \`marketing.referral.converted\` event (beta).
- **NEW**: SDK getters for landing pages.
- **DEPRECATED**: \`billing.coupon_redeemed\` event — use \`invoice.created\` with \`coupon\` field.
- **FIX**: pagination off-by-one on \`GET /v1/jobs\` when \`pageSize=1\`.
` },
    { slug: "changelog-2026-04", title: "[seed] 2026.04 Changelog", section: "CHANGELOG",
      status: "PUBLISHED", body: "# 2026.04\n\n- **NEW**: Affiliate Program v4 with Stripe Connect Express.\n" },
    { slug: "changelog-2026-03", title: "[seed] 2026.03 Changelog", section: "CHANGELOG",
      status: "PUBLISHED", body: "# 2026.03\n\n- **FIX**: Field-mapping editor crash on Salesforce Account.Name.\n" },

    // ERRORS_REFERENCE
    { slug: "errors-overview", title: "[seed] Error Reference", section: "ERRORS_REFERENCE",
      status: "PUBLISHED", ownerTeam: "Engineering",
      body: `# Error Reference

All errors return JSON with \`code\`, \`message\`, and (optional) \`details\`.

\`\`\`json
{ "code": "validation_failed", "message": "Field 'email' is required" }
\`\`\`

| Code | HTTP | Description |
|---|---|---|
| \`unauthorized\`        | 401 | Bad or missing API key. |
| \`forbidden\`           | 403 | Key lacks the required scope. |
| \`not_found\`           | 404 | Resource doesn't exist. |
| \`validation_failed\`   | 422 | Field-level validation failed. |
| \`rate_limited\`        | 429 | Too many requests — back off. |
| \`internal_error\`      | 500 | Something went wrong on our side. |
` },

    // RATE_LIMITS
    { slug: "rate-limits-overview", title: "[seed] Rate Limits", section: "RATE_LIMITS",
      status: "PUBLISHED", ownerTeam: "Engineering",
      body: `# Rate Limits

Default: **60 requests / minute** per API key.

## Headers

- \`X-RateLimit-Limit\` — your cap.
- \`X-RateLimit-Remaining\` — calls remaining in current window.
- \`X-RateLimit-Reset\` — unix timestamp when the window resets.

When you hit the cap we return **HTTP 429** with a \`Retry-After\` header.
` },

    // GLOSSARY
    { slug: "glossary", title: "[seed] Glossary", section: "GLOSSARY",
      status: "PUBLISHED", ownerTeam: "DevRel",
      body: `# Glossary

- **Tenant** — A workspace; a single sign or print shop.
- **Job** — A unit of production work (quote → order → install).
- **Endpoint** — A subscribable webhook URL on the customer side.
- **Scope** — A permission attached to an API key.
- **Sandbox** — Throw-away environment for integration testing.
` },
    { slug: "old-deprecated-page", title: "[seed] Legacy GraphQL endpoint", section: "RESOURCES",
      status: "ARCHIVED", deprecated: true, ownerTeam: "Engineering",
      body: `# Legacy GraphQL endpoint

> ⚠ Sunset 2026-06-01. Use the v1 REST endpoints instead.

\`\`\`
POST /graphql
\`\`\`
` },
  ];

  // Two-pass: create folders first so children can resolve parentId.
  const slugToId = new Map<string, string>();
  let pageCount = 0;
  let versionCount = 0;
  let commentCount = 0;

  // Helper to compute next position within a section/parent group.
  const positionTracker = new Map<string, number>();
  const nextPosition = (section: string, parentId: string | null) => {
    const key = `${section}:${parentId ?? "ROOT"}`;
    const cur = positionTracker.get(key) ?? 0;
    positionTracker.set(key, cur + 1);
    return cur;
  };

  // First pass: folders + roots.
  for (const d of docs) {
    if (d.parentSlug) continue; // skip nested for round 1
    const parentId = null;
    const created = await db.docPage.create({
      data: {
        slug: d.slug,
        title: d.title,
        section: d.section,
        parentId,
        position: nextPosition(d.section, parentId),
        status: d.status,
        isFolder: !!d.isFolder,
        externalUrl: d.externalUrl ?? null,
        deprecated: !!d.deprecated,
        body: d.status === "PUBLISHED" ? d.body : "",
        bodyDraft: d.status === "PUBLISHED" ? null : d.body,
        ownerTeam: d.ownerTeam ?? null,
        seoTitle: d.seoTitle ?? null,
        seoDescription: d.seoDescription ?? null,
        tags: d.tags ?? [],
        version: d.status === "PUBLISHED" ? 1 : 0,
        publishedVersion: d.status === "PUBLISHED" ? 1 : null,
        publishedAt: d.status === "PUBLISHED" ? daysAgo(randInt(7, 180)) : null,
        publishedById: d.status === "PUBLISHED" ? author.id : null,
        authorId: author.id,
        lastEditedById: author.id,
        createdAt: daysAgo(randInt(60, 365)),
        updatedAt: daysAgo(randInt(0, 60)),
      },
      select: { id: true },
    });
    slugToId.set(d.slug, created.id);
    pageCount++;
    if (d.status === "PUBLISHED") {
      await db.docPageVersion.create({
        data: {
          pageId: created.id,
          versionNumber: 1,
          body: d.body,
          status: "PUBLISHED",
          authorId: author.id,
          changeNote: "Initial publication.",
          publishedAt: daysAgo(randInt(7, 180)),
          createdAt: daysAgo(randInt(7, 180)),
        },
      });
      versionCount++;
    }
  }

  // Second pass: nested children.
  for (const d of docs) {
    if (!d.parentSlug) continue;
    const parentId = slugToId.get(d.parentSlug) ?? null;
    const created = await db.docPage.create({
      data: {
        slug: d.slug,
        title: d.title,
        section: d.section,
        parentId,
        position: nextPosition(d.section, parentId),
        status: d.status,
        isFolder: !!d.isFolder,
        externalUrl: d.externalUrl ?? null,
        deprecated: !!d.deprecated,
        body: d.status === "PUBLISHED" ? d.body : "",
        bodyDraft: d.status === "PUBLISHED" ? null : d.body,
        ownerTeam: d.ownerTeam ?? null,
        seoTitle: d.seoTitle ?? null,
        seoDescription: d.seoDescription ?? null,
        tags: d.tags ?? [],
        version: d.status === "PUBLISHED" ? 1 : 0,
        publishedVersion: d.status === "PUBLISHED" ? 1 : null,
        publishedAt: d.status === "PUBLISHED" ? daysAgo(randInt(7, 180)) : null,
        publishedById: d.status === "PUBLISHED" ? author.id : null,
        authorId: author.id,
        lastEditedById: author.id,
        createdAt: daysAgo(randInt(60, 365)),
        updatedAt: daysAgo(randInt(0, 60)),
      },
      select: { id: true },
    });
    slugToId.set(d.slug, created.id);
    pageCount++;
    if (d.status === "PUBLISHED") {
      await db.docPageVersion.create({
        data: {
          pageId: created.id,
          versionNumber: 1,
          body: d.body,
          status: "PUBLISHED",
          authorId: author.id,
          changeNote: "Initial publication.",
          publishedAt: daysAgo(randInt(7, 180)),
          createdAt: daysAgo(randInt(7, 180)),
        },
      });
      versionCount++;
    }
  }

  // Add a couple of comments on review pages.
  const reviewPages = await db.docPage.findMany({
    where: { status: "REVIEW", title: { startsWith: "[seed] " } },
    select: { id: true, slug: true },
  });
  for (const p of reviewPages) {
    await db.docPageComment.create({
      data: {
        pageId: p.id,
        body: "Field shape needs to match Stripe's `Invoice.lines` schema, not our internal `Order.items`.",
        authorId: author.id,
        createdAt: daysAgo(randInt(0, 5)),
      },
    });
    commentCount++;
    if (Math.random() < 0.5) {
      await db.docPageComment.create({
        data: {
          pageId: p.id,
          body: "+1 — let's also clarify what happens on partial refund.",
          authorId: author.id,
          createdAt: daysAgo(randInt(0, 3)),
        },
      });
      commentCount++;
    }
  }

  // Add second + third versions to a few popular pages so version
  // history isn't trivial.
  const versionTargets = ["introduction", "auth-overview", "webhooks-overview"];
  for (const slug of versionTargets) {
    const page = await db.docPage.findUnique({ where: { slug }, select: { id: true, version: true, body: true } });
    if (!page) continue;
    for (let i = 2; i <= 3; i++) {
      await db.docPageVersion.create({
        data: {
          pageId: page.id,
          versionNumber: i,
          body: page.body,
          status: "PUBLISHED",
          authorId: author.id,
          changeNote: i === 2 ? "Clarified sandbox environment naming." : "Added curl example to the quickstart.",
          publishedAt: daysAgo(randInt(7, 60)),
          createdAt: daysAgo(randInt(7, 60)),
        },
      });
      versionCount++;
    }
    await db.docPage.update({
      where: { id: page.id },
      data: { version: 3, publishedVersion: 3 },
    });
  }

  // OpenAPI spec.
  const openApiBody = `openapi: 3.1.0
info:
  title: Flowtora API
  version: 2026.05.0
  description: |
    REST API for the Flowtora platform. Authenticate with bearer
    tokens minted from Platform → API Keys.
servers:
  - url: https://api.flowtora.com
  - url: https://sandbox.api.flowtora.com
paths:
  /v1/tenants:
    get:
      summary: List tenants
      tags: [Tenants]
      responses:
        "200": { description: OK }
  /v1/jobs:
    post:
      summary: Create a job
      tags: [Jobs]
      responses:
        "201": { description: Created }
components:
  securitySchemes:
    bearer: { type: http, scheme: bearer }
security:
  - bearer: []
`;
  await db.openApiSpec.create({
    data: {
      version: "[seed]-2026.05.0",
      body: openApiBody,
      format: "yaml",
      validatedAt: daysAgo(2),
      validationErrors: [],
      autoPublish: true,
      publishedAt: daysAgo(2),
      uploadedById: author.id,
    },
  });
  await db.openApiSpec.create({
    data: {
      version: "[seed]-2026.04.0",
      body: openApiBody.replace("2026.05.0", "2026.04.0"),
      format: "yaml",
      validatedAt: daysAgo(35),
      validationErrors: [],
      autoPublish: false,
      publishedAt: daysAgo(35),
      uploadedById: author.id,
    },
  });
  await db.openApiSpec.create({
    data: {
      version: "[seed]-2026.06.0-rc1",
      body: "openapi: 3.1.0\ninfo:\n  title: Flowtora API\n  version: 2026.06.0-rc1\n# missing paths block\n",
      format: "yaml",
      validatedAt: new Date(),
      validationErrors: ["Missing `paths:` block."],
      autoPublish: false,
      publishedAt: null,
      uploadedById: author.id,
    },
  });

  // Code samples — 3 endpoints × 4-5 languages each.
  const sampleEndpoints = [
    { key: "[seed] GET /v1/tenants", samples: {
        curl: `curl https://api.flowtora.com/v1/tenants \\
  -H "Authorization: Bearer <API_KEY>"`,
        node: `import { Flowtora } from "@flowtora/sdk";
const ft = new Flowtora({ apiKey: process.env.FLOWTORA_API_KEY });
const tenants = await ft.tenants.list();
console.log(tenants);`,
        python: `import os, requests
r = requests.get(
    "https://api.flowtora.com/v1/tenants",
    headers={"Authorization": f"Bearer {os.environ['FLOWTORA_API_KEY']}"},
)
print(r.json())`,
        ruby: `require "net/http"
require "json"
uri = URI("https://api.flowtora.com/v1/tenants")
req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer #{ENV.fetch("FLOWTORA_API_KEY")}"
res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |h| h.request(req) }
puts JSON.parse(res.body)`,
      } },
    { key: "[seed] POST /v1/jobs", samples: {
        curl: `curl -X POST https://api.flowtora.com/v1/jobs \\
  -H "Authorization: Bearer <API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{ "customerId": "cust_abc", "items": [{ "sku": "SIGN-12x18", "qty": 2 }] }'`,
        node: `const job = await ft.jobs.create({
  customerId: "cust_abc",
  items: [{ sku: "SIGN-12x18", qty: 2 }],
});`,
        python: `job = ft.jobs.create(
    customer_id="cust_abc",
    items=[{"sku": "SIGN-12x18", "qty": 2}],
)`,
      } },
    { key: "[seed] GET /v1/customers/{id}", samples: {
        curl: `curl https://api.flowtora.com/v1/customers/cust_abc \\
  -H "Authorization: Bearer <API_KEY>"`,
        node: `const customer = await ft.customers.get("cust_abc");`,
        go: `client := flowtora.NewClient(os.Getenv("FLOWTORA_API_KEY"))
customer, err := client.Customers.Get(ctx, "cust_abc")`,
        php: `$ft = new Flowtora\\Client(getenv("FLOWTORA_API_KEY"));
$customer = $ft->customers->get("cust_abc");`,
        // Intentional placeholder for the linter to flag.
        java: `String key = "your-api-key"; // TODO replace
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://api.flowtora.com/v1/customers/cust_abc"))
    .header("Authorization", "Bearer " + key)
    .build();`,
      } },
  ];

  let codeSampleCount = 0;
  for (const e of sampleEndpoints) {
    for (const [lang, body] of Object.entries(e.samples)) {
      const lint = body.includes("your-api-key")
        ? { status: "errors", message: "Placeholder secret detected — replace with `<API_KEY>` notation." }
        : (lang === "curl" && !/Authorization|-H /.test(body))
          ? { status: "warnings", message: "No Authorization header — sandbox calls will 401." }
          : { status: "ok", message: null };
      await db.codeSample.create({
        data: {
          endpointKey: e.key,
          language: lang,
          body,
          lintedAt: daysAgo(randInt(0, 14)),
          lintStatus: lint.status,
          lintMessage: lint.message,
        },
      });
      codeSampleCount++;
    }
  }

  console.log(
    `  ✓ ${pageCount} doc pages, ${versionCount} version snapshots, ${commentCount} comments, 3 OpenAPI specs, ${codeSampleCount} code samples`,
  );
}

/* ── Page 48 — Marketplace ────────────────────── */

async function seedMarketplace(
  staff: { id: string }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding marketplace (Page 48)…");
  const reviewer = staff[0];
  if (!reviewer) {
    console.log("  skipped — no platform staff found");
    return;
  }

  // 1. Settings singleton.
  await db.marketplaceSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      acceptingSubmissions: true,
      defaultRevenueShareTier: "STANDARD",
      reviewSlaHours: 72,
      securityReviewSlaHours: 168,
      autoChecksEnabled: true,
      requireSoc2: false,
      requireScreenshots: true,
      minScreenshots: 2,
      requirePrivacyUrl: true,
      requireSupportUrl: true,
    },
    update: {},
  });

  // 2. Categories.
  type CatBlueprint = { slug: string; name: string; description: string; featuredOrder?: number };
  const catBlueprints: CatBlueprint[] = [
    { slug: "seed-productivity", name: "Productivity", description: "Tools that help shop owners get more done in a day.", featuredOrder: 0 },
    { slug: "seed-design", name: "Design & Creative", description: "Asset libraries, mockup generators, and design import tools.", featuredOrder: 1 },
    { slug: "seed-finance", name: "Finance & Accounting", description: "Tax tools, invoicing extensions, payment routers.", featuredOrder: 2 },
    { slug: "seed-shipping", name: "Shipping & Logistics", description: "Carrier integrations, tracking enrichment, fulfillment.", featuredOrder: 3 },
    { slug: "seed-analytics", name: "Analytics & BI", description: "Dashboards, attribution, and reporting layers.", featuredOrder: 4 },
    { slug: "seed-customer", name: "Customer Communications", description: "SMS, email, chat, review-requesters.", featuredOrder: 5 },
    { slug: "seed-equipment", name: "Equipment & Production", description: "RIP integrations, press telemetry, color management." },
    { slug: "seed-hr", name: "HR & People Ops", description: "Time tracking, payroll bridges, scheduling." },
  ];
  const catMap = new Map<string, string>();
  for (const c of catBlueprints) {
    const created = await db.marketplaceCategory.create({
      data: {
        slug: c.slug, name: c.name, description: c.description,
        featuredOrder: c.featuredOrder ?? null,
      },
    });
    catMap.set(c.slug, created.id);
  }

  // 3. Apps.
  type AppBlueprint = {
    slug: string; name: string; tagline: string; description: string; iconUrl: string;
    categorySlug: string;
    status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";
    featured?: boolean;
    pricingModel: "FREE" | "ONE_TIME" | "SUBSCRIPTION" | "USAGE";
    pricingDetails: Record<string, unknown>;
    developerName: string; developerEmail: string;
    repoUrl?: string; supportUrl?: string; privacyUrl?: string; termsUrl?: string;
    riskScore: number; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    riskReasons?: string[];
    revenueShareTier: "STANDARD" | "PREFERRED" | "PARTNER";
    soc2AttestationUrl?: string; subProcessors?: string; dataResidency?: string;
    payoutMethod?: string; taxStatus?: string;
    installs: number;
    ratingAvg: number | null; ratingCount: number;
    mrrCents: number;
    permissions: Array<{ scope: string; risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; justification: string }>;
    versions: Array<{ version: string; releasedDays: number; isCurrent?: boolean; changelog: string }>;
    submissionStage: "SUBMITTED" | "AUTOMATED_CHECKS" | "SECURITY_REVIEW" | "LISTING_REVIEW" | "APPROVED" | "REJECTED";
    submissionTimeline: Array<{ stage: "SUBMITTED" | "AUTOMATED_CHECKS" | "SECURITY_REVIEW" | "LISTING_REVIEW" | "APPROVED" | "REJECTED"; daysAgo: number; comments?: string }>;
    suspendedReason?: string;
    submittedDays?: number;
    approvedDays?: number;
  };

  const appBlueprints: AppBlueprint[] = [
    {
      slug: "seed-quickbase-bridge", name: "[seed] QuickBase Bridge",
      tagline: "Two-way sync of jobs to QuickBase tables.",
      description: "## QuickBase Bridge\n\nFor shops running QuickBase as their secondary OS, this app syncs every Flowtora job into a QuickBase table — bidirectionally.\n\n- Two-way sync\n- Custom field mappings\n- Webhook on save",
      iconUrl: "https://cdn.flowtora.com/marketplace/quickbase-bridge.svg",
      categorySlug: "seed-productivity", status: "APPROVED", featured: true,
      pricingModel: "SUBSCRIPTION", pricingDetails: { monthlyPriceCents: 2900, freeTrialDays: 14 },
      developerName: "QBdge Labs", developerEmail: "support@qbdge.dev",
      repoUrl: "https://github.com/qbdge/flowtora-app", supportUrl: "https://qbdge.dev/support", privacyUrl: "https://qbdge.dev/privacy", termsUrl: "https://qbdge.dev/terms",
      riskScore: 35, riskLevel: "MEDIUM",
      riskReasons: ["App holds tenants:write — bulk operations possible"],
      revenueShareTier: "PREFERRED",
      soc2AttestationUrl: "https://qbdge.dev/soc2.pdf",
      subProcessors: "AWS (us-east-1), QuickBase API, Datadog (logs)",
      dataResidency: "US",
      payoutMethod: "Stripe Connect Express",
      taxStatus: "1099 active",
      installs: 18, ratingAvg: 4.6, ratingCount: 14, mrrCents: 33700,
      permissions: [
        { scope: "tenants:read",  risk: "LOW",  justification: "Read tenant info to construct sync URL." },
        { scope: "tenants:write", risk: "HIGH", justification: "Apply changes from QuickBase back into Flowtora." },
        { scope: "audit:read",    risk: "LOW",  justification: "Surface change history in QuickBase." },
      ],
      versions: [
        { version: "1.0.0", releasedDays: 240, changelog: "Initial release." },
        { version: "1.2.0", releasedDays: 90,  changelog: "Multi-table sync." },
        { version: "1.3.1", releasedDays: 12,  isCurrent: true, changelog: "Fix: rate-limit handling under burst writes." },
      ],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED",        daysAgo: 250 },
        { stage: "AUTOMATED_CHECKS", daysAgo: 249 },
        { stage: "SECURITY_REVIEW",  daysAgo: 248, comments: "OK — scope justification looks solid." },
        { stage: "LISTING_REVIEW",   daysAgo: 246 },
        { stage: "APPROVED",         daysAgo: 245, comments: "Listed. Tier set to Preferred." },
      ],
      submittedDays: 250, approvedDays: 245,
    },
    {
      slug: "seed-mockup-magic", name: "[seed] Mockup Magic",
      tagline: "AI-rendered mockups from your job artwork.",
      description: "## Mockup Magic\n\nAuto-generates customer-ready mockups (storefront, vehicle, banner) from any uploaded artwork. Built by an ex-Adobe team.",
      iconUrl: "https://cdn.flowtora.com/marketplace/mockup-magic.svg",
      categorySlug: "seed-design", status: "APPROVED", featured: true,
      pricingModel: "USAGE", pricingDetails: { perRenderCents: 25, monthlyMinimumCents: 1500 },
      developerName: "Mockup Magic Inc.", developerEmail: "hello@mockupmagic.io",
      supportUrl: "https://mockupmagic.io/support", privacyUrl: "https://mockupmagic.io/privacy",
      riskScore: 22, riskLevel: "LOW",
      revenueShareTier: "PARTNER",
      soc2AttestationUrl: "https://mockupmagic.io/soc2.pdf",
      subProcessors: "AWS (us-east-1), Cloudflare Workers, OpenAI",
      dataResidency: "US",
      payoutMethod: "Wise · USD wire",
      taxStatus: "1099 active",
      installs: 47, ratingAvg: 4.8, ratingCount: 38, mrrCents: 89600,
      permissions: [
        { scope: "files:read",  risk: "LOW",    justification: "Read uploaded artwork for rendering." },
        { scope: "jobs:read",   risk: "LOW",    justification: "Pull job context for the rendered mockup." },
      ],
      versions: [
        { version: "2.0.0", releasedDays: 60, isCurrent: true, changelog: "v2 launch — supports vehicle mockups." },
      ],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED",        daysAgo: 80 },
        { stage: "AUTOMATED_CHECKS", daysAgo: 79 },
        { stage: "SECURITY_REVIEW",  daysAgo: 78 },
        { stage: "LISTING_REVIEW",   daysAgo: 75 },
        { stage: "APPROVED",         daysAgo: 73 },
      ],
      submittedDays: 80, approvedDays: 73,
    },
    {
      slug: "seed-quicktax-sales", name: "[seed] QuickTax Sales",
      tagline: "Auto-calc + file sales tax in 50 states.",
      description: "## QuickTax Sales\n\nNexus-aware sales tax calculation + monthly filing for US shops.",
      iconUrl: "https://cdn.flowtora.com/marketplace/quicktax.svg",
      categorySlug: "seed-finance", status: "APPROVED",
      pricingModel: "SUBSCRIPTION", pricingDetails: { monthlyPriceCents: 4900 },
      developerName: "QuickTax LLC", developerEmail: "team@quicktax.com",
      supportUrl: "https://quicktax.com/support", privacyUrl: "https://quicktax.com/privacy",
      riskScore: 60, riskLevel: "HIGH",
      riskReasons: ["Holds billing:write — can modify invoices in flight"],
      revenueShareTier: "STANDARD",
      soc2AttestationUrl: "https://quicktax.com/soc2.pdf",
      subProcessors: "AWS (us-east-2), Avalara API, Stripe",
      dataResidency: "US",
      payoutMethod: "ACH",
      taxStatus: "1099 active",
      installs: 31, ratingAvg: 4.2, ratingCount: 22, mrrCents: 24500,
      permissions: [
        { scope: "billing:read",  risk: "MEDIUM", justification: "Read invoices to compute tax base." },
        { scope: "billing:write", risk: "HIGH",   justification: "Apply tax line items to invoices." },
        { scope: "tenants:read",  risk: "LOW",    justification: "Resolve tenant nexus state." },
      ],
      versions: [
        { version: "3.4.0", releasedDays: 14, isCurrent: true, changelog: "Q1 nexus updates for AZ + CO." },
      ],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED",        daysAgo: 400 },
        { stage: "APPROVED",         daysAgo: 380 },
      ],
      submittedDays: 400, approvedDays: 380,
    },
    {
      slug: "seed-easyship-bridge", name: "[seed] EasyShip Bridge",
      tagline: "Carrier discounts via EasyShip's network.",
      description: "Cuts shipping costs ~40% by routing labels through EasyShip's bulk-rate carrier deals.",
      iconUrl: "https://cdn.flowtora.com/marketplace/easyship.svg",
      categorySlug: "seed-shipping", status: "APPROVED",
      pricingModel: "FREE", pricingDetails: {},
      developerName: "EasyShip Inc.", developerEmail: "partners@easyship.com",
      supportUrl: "https://easyship.com/support",
      riskScore: 18, riskLevel: "LOW",
      revenueShareTier: "STANDARD",
      installs: 22, ratingAvg: 4.4, ratingCount: 11, mrrCents: 0,
      permissions: [
        { scope: "shipments:read",  risk: "LOW", justification: "Read pending shipments to compute rates." },
        { scope: "shipments:write", risk: "MEDIUM", justification: "Apply carrier + tracking number to shipments." },
      ],
      versions: [
        { version: "1.0.0", releasedDays: 120, isCurrent: true, changelog: "Initial release." },
      ],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED",        daysAgo: 130 },
        { stage: "APPROVED",         daysAgo: 122 },
      ],
      submittedDays: 130, approvedDays: 122,
    },
    {
      slug: "seed-shopvision", name: "[seed] ShopVision",
      tagline: "Real-time shop analytics + cohort studies.",
      description: "Full-funnel analytics for sign + print shops. Tracks revenue per material, install time variance, and customer LTV.",
      iconUrl: "https://cdn.flowtora.com/marketplace/shopvision.svg",
      categorySlug: "seed-analytics", status: "APPROVED",
      pricingModel: "SUBSCRIPTION", pricingDetails: { monthlyPriceCents: 9900 },
      developerName: "ShopVision Analytics", developerEmail: "founders@shopvision.io",
      supportUrl: "https://shopvision.io/help", privacyUrl: "https://shopvision.io/privacy",
      riskScore: 25, riskLevel: "LOW",
      revenueShareTier: "PREFERRED",
      soc2AttestationUrl: "https://shopvision.io/soc2.pdf",
      subProcessors: "GCP (us-central1), Snowflake, Hex",
      dataResidency: "US",
      payoutMethod: "Stripe Connect",
      taxStatus: "1099 active",
      installs: 14, ratingAvg: 4.9, ratingCount: 9, mrrCents: 56700,
      permissions: [
        { scope: "tenants:read",  risk: "LOW", justification: "Pull tenant metadata." },
        { scope: "billing:read",  risk: "LOW", justification: "Aggregate revenue metrics." },
        { scope: "jobs:read",     risk: "LOW", justification: "Build job-level analytics." },
      ],
      versions: [
        { version: "1.5.0", releasedDays: 25, isCurrent: true, changelog: "Cohort retention chart." },
      ],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED",  daysAgo: 110 },
        { stage: "APPROVED",   daysAgo: 100 },
      ],
      submittedDays: 110, approvedDays: 100,
    },
    {
      slug: "seed-textback-pro", name: "[seed] Textback Pro",
      tagline: "Automated SMS + voicemail drops to win back customers.",
      description: "Scheduled SMS sequences for proof reminders, ready-for-pickup, and 30-day-after-install nudges. Built on Twilio.",
      iconUrl: "https://cdn.flowtora.com/marketplace/textback.svg",
      categorySlug: "seed-customer", status: "APPROVED",
      pricingModel: "SUBSCRIPTION", pricingDetails: { monthlyPriceCents: 3900 },
      developerName: "Textback Inc.", developerEmail: "hello@textback.app",
      supportUrl: "https://textback.app/support", privacyUrl: "https://textback.app/privacy",
      riskScore: 40, riskLevel: "MEDIUM",
      riskReasons: ["Sends outbound SMS — abuse risk if mis-configured"],
      revenueShareTier: "STANDARD",
      installs: 26, ratingAvg: 4.1, ratingCount: 17, mrrCents: 18800,
      permissions: [
        { scope: "customers:read", risk: "LOW",    justification: "Read phone numbers." },
        { scope: "messages:write", risk: "MEDIUM", justification: "Send SMS on tenant's behalf." },
      ],
      versions: [{ version: "1.4.2", releasedDays: 18, isCurrent: true, changelog: "Quiet-hours per timezone." }],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED",  daysAgo: 200 },
        { stage: "APPROVED",   daysAgo: 190 },
      ],
      submittedDays: 200, approvedDays: 190,
    },
    {
      slug: "seed-calendarsync-plus", name: "[seed] CalendarSync Plus",
      tagline: "Two-way Google Calendar sync for install crews.",
      description: "Pushes scheduled installs to crew Google Calendars, pulls availability back.",
      iconUrl: "https://cdn.flowtora.com/marketplace/calsync.svg",
      categorySlug: "seed-productivity", status: "APPROVED",
      pricingModel: "FREE", pricingDetails: {},
      developerName: "CalendarSync Plus", developerEmail: "support@calsync.app",
      supportUrl: "https://calsync.app/support",
      riskScore: 12, riskLevel: "LOW",
      revenueShareTier: "STANDARD",
      installs: 12, ratingAvg: 4.3, ratingCount: 7, mrrCents: 0,
      permissions: [
        { scope: "calendar:read",  risk: "LOW", justification: "Read crew availability." },
        { scope: "calendar:write", risk: "LOW", justification: "Create install events." },
      ],
      versions: [{ version: "1.0.0", releasedDays: 60, isCurrent: true, changelog: "Initial release." }],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED", daysAgo: 70 },
        { stage: "APPROVED",  daysAgo: 65 },
      ],
      submittedDays: 70, approvedDays: 65,
    },
    {
      slug: "seed-payroll-bridge", name: "[seed] Payroll Bridge",
      tagline: "Push job hours to Gusto / Rippling.",
      description: "Sends time-tracked install hours to your payroll provider. Currently in security review.",
      iconUrl: "https://cdn.flowtora.com/marketplace/payroll.svg",
      categorySlug: "seed-hr", status: "IN_REVIEW",
      pricingModel: "SUBSCRIPTION", pricingDetails: { monthlyPriceCents: 1900 },
      developerName: "Payroll Bridge LLC", developerEmail: "ops@payrollbridge.dev",
      supportUrl: "https://payrollbridge.dev/support", privacyUrl: "https://payrollbridge.dev/privacy",
      riskScore: 55, riskLevel: "HIGH",
      riskReasons: [
        "Holds users:read at HIGH risk (PII)",
        "Sends data to third-party payroll provider",
      ],
      revenueShareTier: "STANDARD",
      installs: 0, ratingAvg: null, ratingCount: 0, mrrCents: 0,
      permissions: [
        { scope: "users:read",      risk: "HIGH",   justification: "Map Flowtora users to payroll employees." },
        { scope: "jobs:read",       risk: "MEDIUM", justification: "Pull labor hours per job." },
      ],
      versions: [{ version: "0.9.0-beta.1", releasedDays: 5, isCurrent: true, changelog: "Initial submission." }],
      submissionStage: "SECURITY_REVIEW",
      submissionTimeline: [
        { stage: "SUBMITTED",        daysAgo: 7 },
        { stage: "AUTOMATED_CHECKS", daysAgo: 6 },
        { stage: "SECURITY_REVIEW",  daysAgo: 4, comments: "Awaiting SOC 2 type II from developer." },
      ],
      submittedDays: 7,
    },
    {
      slug: "seed-pantone-pro", name: "[seed] Pantone Pro",
      tagline: "Pantone library lookup + PDF auto-tagging.",
      description: "Match Pantone codes from uploaded artwork; tags PDF metadata so RIPs use correct ink mixes.",
      iconUrl: "https://cdn.flowtora.com/marketplace/pantone.svg",
      categorySlug: "seed-design", status: "DRAFT",
      pricingModel: "ONE_TIME", pricingDetails: { oneTimePriceCents: 19900 },
      developerName: "ColorOps Studio", developerEmail: "team@colorops.io",
      privacyUrl: "https://colorops.io/privacy",
      riskScore: 15, riskLevel: "LOW",
      revenueShareTier: "STANDARD",
      installs: 0, ratingAvg: null, ratingCount: 0, mrrCents: 0,
      permissions: [
        { scope: "files:read", risk: "LOW", justification: "Read uploaded artwork to detect colors." },
      ],
      versions: [{ version: "0.5.0-draft", releasedDays: 1, isCurrent: true, changelog: "First draft." }],
      submissionStage: "SUBMITTED",
      submissionTimeline: [
        { stage: "SUBMITTED", daysAgo: 1 },
      ],
      submittedDays: 1,
    },
    {
      slug: "seed-gauge-bridge", name: "[seed] Gauge Bridge",
      tagline: "Connect HP / Roland press telemetry to job records.",
      description: "Streams ink + media usage telemetry from HP/Roland presses into per-job records.",
      iconUrl: "https://cdn.flowtora.com/marketplace/gauge.svg",
      categorySlug: "seed-equipment", status: "APPROVED",
      pricingModel: "SUBSCRIPTION", pricingDetails: { monthlyPriceCents: 14900 },
      developerName: "Gauge Bridge GmbH", developerEmail: "support@gaugebridge.de",
      supportUrl: "https://gaugebridge.de/support", privacyUrl: "https://gaugebridge.de/privacy",
      riskScore: 30, riskLevel: "MEDIUM",
      revenueShareTier: "PREFERRED",
      soc2AttestationUrl: "https://gaugebridge.de/soc2.pdf",
      subProcessors: "Hetzner (DE), AWS (eu-west-1)",
      dataResidency: "EU",
      payoutMethod: "SEPA",
      taxStatus: "EU VAT registered",
      installs: 8, ratingAvg: 4.7, ratingCount: 5, mrrCents: 11900,
      permissions: [
        { scope: "jobs:write",      risk: "MEDIUM", justification: "Append press telemetry to job records." },
        { scope: "materials:read",  risk: "LOW",    justification: "Resolve material code → SKU." },
      ],
      versions: [{ version: "2.1.0", releasedDays: 9, isCurrent: true, changelog: "Roland VG3 support." }],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED", daysAgo: 60 },
        { stage: "APPROVED",  daysAgo: 50 },
      ],
      submittedDays: 60, approvedDays: 50,
    },
    {
      slug: "seed-rogue-app", name: "[seed] RogueApp",
      tagline: "(Suspended) High-risk integration removed for review.",
      description: "App was suspended after a security incident — see audit log.",
      iconUrl: "https://cdn.flowtora.com/marketplace/rogue.svg",
      categorySlug: "seed-productivity", status: "SUSPENDED",
      pricingModel: "FREE", pricingDetails: {},
      developerName: "Unverified Developer", developerEmail: "anon@example.com",
      riskScore: 88, riskLevel: "CRITICAL",
      riskReasons: [
        "Excessive scope requests (system:admin)",
        "Failed automated CSP scan twice",
        "Multiple HIGH-risk permission grants",
      ],
      revenueShareTier: "STANDARD",
      installs: 0, ratingAvg: 2.1, ratingCount: 4, mrrCents: 0,
      permissions: [
        { scope: "system:admin", risk: "CRITICAL", justification: "Failed justification audit." },
        { scope: "users:write",  risk: "HIGH",     justification: "Bulk modify users." },
      ],
      versions: [{ version: "1.0.0", releasedDays: 200, isCurrent: true, changelog: "Initial release." }],
      submissionStage: "APPROVED",
      submissionTimeline: [
        { stage: "SUBMITTED", daysAgo: 220 },
        { stage: "APPROVED",  daysAgo: 210 },
      ],
      submittedDays: 220, approvedDays: 210,
      suspendedReason: "Failed scope-justification audit; pending dev response.",
    },
    {
      slug: "seed-rejected-app", name: "[seed] RejectedTry",
      tagline: "(Rejected) Did not pass security review.",
      description: "App rejected — listed for audit purposes.",
      iconUrl: "https://cdn.flowtora.com/marketplace/rejected.svg",
      categorySlug: "seed-productivity", status: "REJECTED",
      pricingModel: "FREE", pricingDetails: {},
      developerName: "Try Hard Co.", developerEmail: "founder@tryhard.example",
      riskScore: 72, riskLevel: "HIGH",
      riskReasons: ["No SOC 2 attestation", "Could not demonstrate sandboxing"],
      revenueShareTier: "STANDARD",
      installs: 0, ratingAvg: null, ratingCount: 0, mrrCents: 0,
      permissions: [
        { scope: "tenants:write", risk: "HIGH", justification: "Bulk update across tenants." },
      ],
      versions: [{ version: "0.1.0", releasedDays: 90, isCurrent: true, changelog: "Initial submission." }],
      submissionStage: "REJECTED",
      submissionTimeline: [
        { stage: "SUBMITTED",        daysAgo: 95 },
        { stage: "AUTOMATED_CHECKS", daysAgo: 93 },
        { stage: "SECURITY_REVIEW",  daysAgo: 91, comments: "Sandboxing missing." },
        { stage: "REJECTED",         daysAgo: 88, comments: "Failed security review." },
      ],
      submittedDays: 95,
    },
  ];

  let appCount = 0;
  let permCount = 0;
  let versionCount = 0;
  let installCount = 0;
  let reviewCount = 0;
  let submissionCount = 0;
  let payoutCount = 0;
  let auditCount = 0;

  const reviewBlueprints = [
    "Saved us hours every week — easy to install.",
    "Works exactly as advertised. Took 5min to set up.",
    "Solid integration. Wish there was a higher-tier plan.",
    "Crashed once during a sync but support fixed it fast.",
    "Field mappings are confusing. Documentation needs work.",
    "Best app on the marketplace, hands down.",
    "Pricing is steep but worth it for our volume.",
    "Caused duplicate invoices for two days; uninstalled.",
    "Nice idea but missing key features for our shop.",
    "Five stars. Would buy again.",
  ];
  const reviewerNames = ["Alex T.", "Brenda M.", "Chen W.", "Dana K.", "Eva R.", "Frank L.", "Gita N.", "Hassan O.", "Ivy P.", "Jules Q."];

  for (const b of appBlueprints) {
    const created = await db.marketplaceApp.create({
      data: {
        slug: b.slug,
        name: b.name,
        tagline: b.tagline,
        description: b.description,
        iconUrl: b.iconUrl,
        screenshots: [
          `${b.iconUrl.replace(".svg", "-shot-1.png")}`,
          `${b.iconUrl.replace(".svg", "-shot-2.png")}`,
        ],
        categoryId: catMap.get(b.categorySlug)!,
        status: b.status,
        featured: b.featured ?? false,
        developerName: b.developerName,
        developerEmail: b.developerEmail,
        repoUrl: b.repoUrl ?? null,
        supportUrl: b.supportUrl ?? null,
        privacyUrl: b.privacyUrl ?? null,
        termsUrl: b.termsUrl ?? null,
        pricingModel: b.pricingModel,
        pricingDetails: b.pricingDetails as never,
        manifestJson: {
          name: b.name,
          version: b.versions.find((v) => v.isCurrent)?.version ?? b.versions[0]!.version,
          permissions: b.permissions.map((p) => p.scope),
          entry: "/api/main",
        } as never,
        securityChecklist: {
          csp: b.status !== "REJECTED" && b.status !== "SUSPENDED",
          sandboxed: b.status !== "REJECTED",
          scopesReviewed: b.status === "APPROVED" || b.status === "SUSPENDED",
          ratLimited: b.status === "APPROVED",
        } as never,
        riskScore: b.riskScore,
        riskLevel: b.riskLevel,
        riskReasons: b.riskReasons ?? [],
        soc2AttestationUrl: b.soc2AttestationUrl ?? null,
        subProcessors: b.subProcessors ?? null,
        dataResidency: b.dataResidency ?? null,
        revenueShareTier: b.revenueShareTier,
        payoutMethod: b.payoutMethod ?? null,
        taxStatus: b.taxStatus ?? null,
        installCount: b.installs,
        ratingAverage: b.ratingAvg,
        ratingCount: b.ratingCount,
        mrrContributionCents: b.mrrCents,
        currentVersion: b.versions.find((v) => v.isCurrent)?.version ?? b.versions[0]!.version,
        submittedAt: b.submittedDays != null ? daysAgo(b.submittedDays) : null,
        approvedAt: b.approvedDays != null ? daysAgo(b.approvedDays) : null,
        approvedById: b.approvedDays != null ? reviewer.id : null,
        publishedAt: b.status === "APPROVED" || b.status === "SUSPENDED" ? daysAgo(b.approvedDays ?? 30) : null,
        suspendedAt: b.status === "SUSPENDED" ? daysAgo(15) : null,
        suspendedById: b.status === "SUSPENDED" ? reviewer.id : null,
        suspendedReason: b.suspendedReason ?? null,
      },
      select: { id: true },
    });
    appCount++;

    // Permissions
    for (const p of b.permissions) {
      await db.marketplaceAppPermission.create({
        data: {
          appId: created.id,
          scope: p.scope,
          riskLevel: p.risk,
          justification: p.justification,
        },
      });
      permCount++;
    }

    // Versions
    for (const v of b.versions) {
      await db.marketplaceAppVersion.create({
        data: {
          appId: created.id,
          version: v.version,
          changelog: v.changelog,
          isCurrent: v.isCurrent ?? false,
          releasedAt: daysAgo(v.releasedDays),
          installCount: v.isCurrent ? b.installs : 0,
        },
      });
      versionCount++;
    }

    // Submissions
    for (const s of b.submissionTimeline) {
      const isLast = s === b.submissionTimeline[b.submissionTimeline.length - 1]!;
      await db.marketplaceSubmission.create({
        data: {
          appId: created.id,
          stage: s.stage,
          assigneeId: reviewer.id,
          comments: s.comments ?? null,
          checklist: [
            { label: "Manifest validates", checked: true },
            { label: "Scopes justified",   checked: s.stage !== "SUBMITTED" && s.stage !== "AUTOMATED_CHECKS" },
            { label: "SOC 2 reviewed",     checked: s.stage === "APPROVED" },
            { label: "Listing copy okay",  checked: s.stage === "APPROVED" || s.stage === "LISTING_REVIEW" },
          ] as never,
          enteredAt: daysAgo(s.daysAgo),
          exitedAt: isLast && (s.stage !== "APPROVED" && s.stage !== "REJECTED") ? null : daysAgo(s.daysAgo - 1),
          slaDeadlineAt: !isLast ? null
            : (s.stage === "APPROVED" || s.stage === "REJECTED" ? null : new Date(Date.now() + (s.stage === "SECURITY_REVIEW" ? 168 : 72) * 60 * 60 * 1000)),
        },
      });
      submissionCount++;
    }

    // Installations + per-tenant trial — pick a slice of tenants up to b.installs.
    const pool = [...tenants].sort(() => Math.random() - 0.5);
    const targetCount = Math.min(b.installs, pool.length);
    const targets = pool.slice(0, targetCount);
    for (const t of targets) {
      const installAge = randInt(1, b.submittedDays ?? 30);
      const uninstall = Math.random() < 0.1; // 10% uninstall rate for adoption realism
      await db.marketplaceInstallation.create({
        data: {
          appId: created.id,
          tenantId: t.id,
          versionInstalled: b.versions.find((v) => v.isCurrent)?.version ?? "1.0.0",
          installedAt: daysAgo(installAge),
          lastUsedAt: uninstall ? daysAgo(randInt(installAge - 5, installAge)) : daysAgo(randInt(0, 5)),
          uninstalledAt: uninstall ? daysAgo(randInt(0, installAge)) : null,
        },
      });
      installCount++;
    }

    // Reviews — number based on ratingCount (capped to make it fast).
    const reviewSamples = Math.min(b.ratingCount, 8);
    for (let i = 0; i < reviewSamples; i++) {
      const rating = b.ratingAvg == null ? 3 : Math.max(1, Math.min(5, Math.round(b.ratingAvg + (Math.random() - 0.5))));
      await db.marketplaceReview.create({
        data: {
          appId: created.id,
          tenantId: targets[i % Math.max(1, targets.length)]?.id ?? null,
          authorName: reviewerNames[i % reviewerNames.length]!,
          rating,
          title: i === 0 ? "Worth every penny" : null,
          body: reviewBlueprints[i % reviewBlueprints.length]!,
          status: i === 1 && b.status === "SUSPENDED" ? "FLAGGED" : "PUBLISHED",
          flaggedReason: i === 1 && b.status === "SUSPENDED" ? "Reviewed by moderation team" : null,
          reply: i === 0 ? "Thanks for the kind words!" : null,
          createdAt: daysAgo(randInt(0, 60)),
        },
      });
      reviewCount++;
    }

    // Payouts — generate ~3 monthly periods for paid apps.
    if (b.mrrCents > 0) {
      const now = new Date();
      for (let m = 0; m < 4; m++) {
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1 - m).padStart(2, "0")}`;
        const variance = 0.85 + Math.random() * 0.3;
        const gross = Math.round(b.mrrCents * variance);
        const developerPct = b.revenueShareTier === "PARTNER" ? 0.85 : b.revenueShareTier === "PREFERRED" ? 0.80 : 0.70;
        const developerCut = Math.round(gross * developerPct);
        const flowtoraCut = gross - developerCut;
        await db.marketplacePayoutStatement.create({
          data: {
            appId: created.id,
            period,
            installs: Math.max(1, Math.round(b.installs * variance)),
            grossCents: gross,
            flowtoraCutCents: flowtoraCut,
            developerCutCents: developerCut,
            paid: m > 0,
            paidAt: m > 0 ? daysAgo(m * 30) : null,
          },
        }).catch(() => {});
        payoutCount++;
      }
    }

    // Audit log entries
    await db.marketplaceAppAudit.create({
      data: { appId: created.id, action: "submitted", detail: "Initial submission.", authorId: reviewer.id, occurredAt: daysAgo(b.submittedDays ?? 30) },
    });
    auditCount++;
    if (b.status === "APPROVED") {
      await db.marketplaceAppAudit.create({
        data: { appId: created.id, action: "approved", detail: `Approved into ${b.revenueShareTier} tier.`, authorId: reviewer.id, occurredAt: daysAgo(b.approvedDays ?? 25) },
      });
      auditCount++;
    }
    if (b.status === "SUSPENDED") {
      await db.marketplaceAppAudit.create({
        data: { appId: created.id, action: "suspended", detail: b.suspendedReason ?? "Suspended.", authorId: reviewer.id, occurredAt: daysAgo(15) },
      });
      auditCount++;
    }
    if (b.status === "REJECTED") {
      await db.marketplaceAppAudit.create({
        data: { appId: created.id, action: "rejected", detail: "Failed security review.", authorId: reviewer.id, occurredAt: daysAgo(88) },
      });
      auditCount++;
    }
  }

  console.log(
    `  ✓ ${catBlueprints.length} categories, ${appCount} apps, ${permCount} permissions, ${versionCount} versions, ${installCount} installs, ${reviewCount} reviews, ${submissionCount} submissions, ${payoutCount} payouts, ${auditCount} audit entries`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
