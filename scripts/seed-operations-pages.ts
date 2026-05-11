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
  await seedSso(platformUsers, tenants);              // Page 49
  await seedSecurityCenter(platformUsers);            // Page 50
  await seedCompliance(tenants);                      // Page 51
  await seedPrivacyRequests(platformUsers, tenants);  // Page 52
  await seedBackups(platformUsers, tenants);          // Page 53
  await seedIncidents(platformUsers, tenants);        // Page 54
  await seedNetwork(platformUsers, tenants);          // Page 55
  await seedSystemStatus();                            // Page 56
  await seedQueues(tenants);                           // Page 57
  await seedEmailDeliverability(tenants);              // Page 58
  await seedStorageCdn(tenants);                       // Page 59

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
  // Page 49 — SSO. Tenant configs are tied to tenants/providers; we
  // delete configs by their displayName prefix tag, then templates,
  // then any seed providers (those keyed GENERIC_* are real catalog
  // entries — we keep them and just refresh their fields).
  await db.ssoTenantConfig.deleteMany({ where: { displayName: { startsWith: "[seed] " } } });
  await db.ssoIdpTemplate.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  // Page 50 — Security Center wipe. Findings/scans/pen-tests/bug-bounty
  // are tagged via title prefix or external-id prefix.
  await db.securityFinding.deleteMany({ where: { title: { startsWith: "[seed] " } } });
  await db.suspiciousActivity.deleteMany({ where: { summary: { startsWith: "[seed] " } } });
  await db.vulnerabilityScan.deleteMany({ where: { scope: { startsWith: "[seed] " } } });
  await db.penetrationTest.deleteMany({ where: { vendor: { startsWith: "[seed] " } } });
  await db.bugBountyReport.deleteMany({ where: { externalId: { startsWith: "SEED-" } } });
  // Page 51 — Compliance wipe. Frameworks/controls/etc. are tagged
  // by external-id prefix or a "[seed]" title marker. We delete
  // controls first (cascades evidence + mappings) then frameworks.
  await db.controlEvidence.deleteMany({ where: { title: { startsWith: "[seed] " } } });
  await db.complianceControl.deleteMany({ where: { externalId: { startsWith: "SEED-" } } });
  await db.complianceFramework.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  await db.compliancePolicy.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  await db.subProcessor.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  await db.riskRegisterItem.deleteMany({ where: { externalId: { startsWith: "SEED-RISK-" } } });
  await db.vendorReview.deleteMany({ where: { vendorName: { startsWith: "[seed] " } } });
  await db.complianceReport.deleteMany({ where: { title: { startsWith: "[seed] " } } });
  // Page 52 — Privacy Requests wipe (cascades verifications/scope/messages/audit).
  await db.privacyRequest.deleteMany({ where: { externalId: { startsWith: "DSR-SEED-" } } });
  // Page 53 — Backups wipe.
  await db.backupSchedule.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  await db.backupJob.deleteMany({ where: { manifestUrl: { contains: "backups.flowtora.example" } } });
  await db.restoreTest.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  await db.tenantRestore.deleteMany({ where: { reason: { startsWith: "[seed] " } } });
  await db.backupStorageBucket.deleteMany({ where: { bucketName: { startsWith: "seed-" } } });
  // Page 54 — Incidents wipe (cascades timeline, comms, mitigations, action items, affected).
  await db.incident.deleteMany({ where: { externalId: { startsWith: "INC-SEED-" } } });
  await db.statusPageComponent.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  await db.statusPageMaintenance.deleteMany({ where: { title: { startsWith: "[seed] " } } });
  await db.runbook.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  // Page 55 — Network wipe.
  await db.networkRule.deleteMany({ where: { description: { startsWith: "[seed] " } } });
  await db.geoRestriction.deleteMany({ where: { source: "MANUAL", notes: { startsWith: "[seed]" } } });
  await db.networkFeedToggle.deleteMany({ where: { sourceName: { startsWith: "[seed] " } } });
  await db.ddosEvent.deleteMany({ where: { summary: { startsWith: "[seed] " } } });
  await db.wafRule.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  // Page 56 — System status wipe (cascades samples / alerts / deploys / dependencies).
  await db.systemService.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  // Page 57 — Queues wipe.
  await db.cronSchedule.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  await db.queueWorker.deleteMany({ where: { workerId: { startsWith: "seed-" } } });
  await db.jobQueue.deleteMany({ where: { slug: { startsWith: "seed-" } } });
  // Page 58 — Email deliverability wipe.
  await db.emailVolumeSample.deleteMany({ where: { provider: { startsWith: "seed-" } } });
  await db.emailBounce.deleteMany({ where: { provider: { startsWith: "seed-" } } });
  await db.emailComplaint.deleteMany({ where: { provider: { startsWith: "seed-" } } });
  await db.emailSuppression.deleteMany({ where: { email: { contains: "seed.flowtora.example" } } });
  await db.emailSendingDomain.deleteMany({ where: { domain: { contains: "seed-" } } });
  await db.emailTemplateStats.deleteMany({ where: { templateKey: { startsWith: "seed-" } } });
  await db.emailProvider.deleteMany({ where: { key: { startsWith: "seed-" } } });
  // Page 59 — Storage & CDN wipe.
  await db.storageBucketEntry.deleteMany({ where: { name: { startsWith: "seed-" } } });
  await db.storageLifecyclePolicy.deleteMany({ where: { name: { startsWith: "[seed] " } } });
  await db.cdnPopStats.deleteMany({ where: { popCode: { startsWith: "seed-" } } });
  await db.cdnTopUrl.deleteMany({ where: { url: { contains: "seed-" } } });
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

/* ── Page 49 — SSO Providers ───────────────────── */

async function seedSso(
  staff: { id: string }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding SSO providers (Page 49)…");
  const reviewer = staff[0];
  if (!reviewer) {
    console.log("  skipped — no platform staff found");
    return;
  }

  // 1. Settings singleton.
  await db.ssoSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enforceMfaWithSso: true,
      idpInitiatedSsoAllowed: false,
      sessionLifetimeHours: 12,
      jitDeprovisionEnabled: false,
    },
    update: {},
  });

  // 2. Provider catalog — upsert all 11 entries.
  type ProvBlueprint = {
    key: "OKTA" | "AZURE_AD" | "GOOGLE" | "ONELOGIN" | "JUMPCLOUD" | "PING" |
         "AUTH0" | "DUO" | "ADFS" | "GENERIC_SAML" | "GENERIC_OIDC";
    name: string;
    description: string;
    defaultType: "SAML" | "OIDC";
    defaultScopes: string[];
    setupDocsUrl?: string;
    notes?: string;
  };
  const providers: ProvBlueprint[] = [
    { key: "OKTA",         name: "Okta",                 description: "SAML 2.0 + SCIM 2.0 supported. Most common for mid-market.",
      defaultType: "SAML", defaultScopes: ["openid", "email", "profile", "groups"],
      setupDocsUrl: "https://help.okta.com/saml-setup", notes: "Recommend default for new Enterprise tenants." },
    { key: "AZURE_AD",     name: "Azure AD / Entra ID",  description: "SAML + OIDC + SCIM (Microsoft Graph).",
      defaultType: "SAML", defaultScopes: ["openid", "email", "profile", "User.Read"],
      setupDocsUrl: "https://learn.microsoft.com/azure/active-directory/saas-apps/" },
    { key: "GOOGLE",       name: "Google Workspace",     description: "SAML 2.0 via Google Admin SSO.",
      defaultType: "SAML", defaultScopes: ["openid", "email", "profile"] },
    { key: "ONELOGIN",     name: "OneLogin",             description: "SAML + SCIM. Strong password-manager bundle.",
      defaultType: "SAML", defaultScopes: ["openid", "email", "groups"] },
    { key: "JUMPCLOUD",    name: "JumpCloud",            description: "Cloud directory + SAML/SCIM.",
      defaultType: "SAML", defaultScopes: ["email", "groups"] },
    { key: "PING",         name: "Ping Identity",        description: "Enterprise SAML/OIDC with strong audit story.",
      defaultType: "SAML", defaultScopes: ["openid", "profile"] },
    { key: "AUTH0",        name: "Auth0",                description: "OIDC-first, popular with B2C extensions.",
      defaultType: "OIDC", defaultScopes: ["openid", "email", "profile"] },
    { key: "DUO",          name: "Duo",                  description: "SSO + MFA. Common in healthcare + finance.",
      defaultType: "SAML", defaultScopes: ["openid", "email"] },
    { key: "ADFS",         name: "Microsoft AD FS",      description: "On-prem federation for legacy AD shops.",
      defaultType: "SAML", defaultScopes: ["upn", "email", "groups"] },
    { key: "GENERIC_SAML", name: "Generic SAML",         description: "Free-form SAML 2.0 for any IdP not in the catalog.",
      defaultType: "SAML", defaultScopes: [] },
    { key: "GENERIC_OIDC", name: "Generic OIDC",         description: "Free-form OIDC for any IdP not in the catalog.",
      defaultType: "OIDC", defaultScopes: ["openid", "email", "profile"] },
  ];
  const provIdMap = new Map<string, string>();
  for (const p of providers) {
    const upserted = await db.ssoProvider.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        name: p.name,
        description: p.description,
        defaultType: p.defaultType,
        defaultScopes: p.defaultScopes,
        setupDocsUrl: p.setupDocsUrl ?? null,
        notes: p.notes ?? null,
        active: true,
      },
      update: {
        name: p.name,
        description: p.description,
        defaultType: p.defaultType,
        defaultScopes: p.defaultScopes,
        setupDocsUrl: p.setupDocsUrl ?? null,
        notes: p.notes ?? null,
        active: true,
      },
      select: { id: true, key: true },
    });
    provIdMap.set(upserted.key, upserted.id);
  }

  // 3. Templates.
  type TmplBlueprint = {
    providerKey: ProvBlueprint["key"];
    name: string;
    type: "SAML" | "OIDC";
    description: string;
    snippet: string;
  };
  const templates: TmplBlueprint[] = [
    {
      providerKey: "OKTA",
      name: "[seed] Okta SAML — typical setup",
      type: "SAML",
      description: "Drop into your Okta SAML app's Advanced Settings → Single sign-on URL field.",
      snippet: `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="https://app.flowtora.com/saml/sp">
  <SPSSODescriptor AuthnRequestsSigned="false"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://app.flowtora.com/api/sso/saml/{providerId}/acs"
      index="0"
      isDefault="true" />
  </SPSSODescriptor>
</EntityDescriptor>`,
    },
    {
      providerKey: "AZURE_AD",
      name: "[seed] Azure AD — Enterprise app SAML",
      type: "SAML",
      description: "Identifier (Entity ID) + Reply URL config block for Azure Enterprise Applications.",
      snippet: `Identifier (Entity ID): https://app.flowtora.com/saml/sp
Reply URL (ACS): https://app.flowtora.com/api/sso/saml/{providerId}/acs
Sign on URL: https://app.flowtora.com/sign-in?idp=azure
User Attributes:
  email = user.mail
  given_name = user.givenname
  family_name = user.surname
  groups = user.groups`,
    },
    {
      providerKey: "AUTH0",
      name: "[seed] Auth0 — OIDC application",
      type: "OIDC",
      description: "JSON snippet for Auth0 Application Settings — paste-and-replace.",
      snippet: `{
  "client_id": "<your_client_id>",
  "client_secret": "<your_client_secret>",
  "discovery_url": "https://YOUR_TENANT.auth0.com/.well-known/openid-configuration",
  "redirect_uri": "https://app.flowtora.com/api/sso/oidc/callback",
  "scopes": ["openid", "email", "profile"],
  "pkce": true
}`,
    },
    {
      providerKey: "GOOGLE",
      name: "[seed] Google Workspace SAML",
      type: "SAML",
      description: "Step-by-step for the Google Admin SAML app.",
      snippet: `Application name: Flowtora
ACS URL: https://app.flowtora.com/api/sso/saml/{providerId}/acs
Entity ID: https://app.flowtora.com/saml/sp
Name ID format: EMAIL
Attribute mapping:
  basic_information.first_name → given_name
  basic_information.last_name  → family_name
  basic_information.primary_email → email`,
    },
  ];
  for (const t of templates) {
    await db.ssoIdpTemplate.create({
      data: {
        providerId: provIdMap.get(t.providerKey)!,
        name: t.name,
        type: t.type,
        description: t.description,
        snippet: t.snippet,
        screenshots: [],
      },
    });
  }

  // 4. Per-tenant configs.
  type ConfigBlueprint = {
    tenantIdx: number;
    providerKey: ProvBlueprint["key"];
    type: "SAML" | "OIDC";
    displayName: string;
    status: "PENDING" | "TEST" | "ACTIVE" | "FAILED" | "DISABLED";
    metadataUrl?: string;
    entityId?: string;
    sloUrl?: string;
    issuer?: string;
    clientId?: string;
    discoveryUrl?: string;
    scopes?: string[];
    pkce?: boolean;
    forceSso?: boolean;
    jit?: boolean;
    scimEnabled?: boolean;
    allowedDomains?: string[];
    attributes?: Record<string, string>;
    groupRules?: Array<{ group: string; roleId: string }>;
    lastError?: string;
    lastLoginDays?: number;
    lastSyncDays?: number;
    metadataRefreshedDays?: number;
    scimLogCount?: number;
    scimErrorCount?: number;
  };

  const configBlueprints: ConfigBlueprint[] = [
    {
      tenantIdx: 0,
      providerKey: "OKTA",
      type: "SAML",
      displayName: "[seed] Sign in with Okta",
      status: "ACTIVE",
      metadataUrl: "https://acme.okta.com/app/exk1abc/sso/saml/metadata",
      entityId: "https://acme.okta.com",
      sloUrl: "https://acme.okta.com/login/signout",
      forceSso: true,
      jit: true,
      scimEnabled: true,
      allowedDomains: ["acme.com", "acme.example"],
      attributes: { email: "$NAMEID", given_name: "user.firstName", family_name: "user.lastName", groups: "user.memberships" },
      groupRules: [
        { group: "Engineering", roleId: "ADMIN" },
        { group: "Support",     roleId: "MEMBER" },
      ],
      lastLoginDays: 0,
      lastSyncDays: 0,
      metadataRefreshedDays: 1,
      scimLogCount: 12,
      scimErrorCount: 1,
    },
    {
      tenantIdx: 1,
      providerKey: "AZURE_AD",
      type: "SAML",
      displayName: "[seed] Sign in with Microsoft",
      status: "ACTIVE",
      metadataUrl: "https://login.microsoftonline.com/aad-tenant-id/federationmetadata/2007-06/federationmetadata.xml",
      entityId: "https://sts.windows.net/aad-tenant-id/",
      forceSso: false,
      jit: true,
      scimEnabled: true,
      allowedDomains: ["bigshop.com"],
      attributes: { email: "user.mail", given_name: "user.givenname", family_name: "user.surname", groups: "user.groups" },
      lastLoginDays: 0,
      lastSyncDays: 1,
      metadataRefreshedDays: 7,
      scimLogCount: 8,
      scimErrorCount: 0,
    },
    {
      tenantIdx: 2,
      providerKey: "GOOGLE",
      type: "SAML",
      displayName: "[seed] Sign in with Google",
      status: "TEST",
      metadataUrl: "https://accounts.google.com/o/saml2?idpid=ABC123",
      entityId: "https://accounts.google.com/o/saml2?idpid=ABC123",
      forceSso: false,
      jit: true,
      scimEnabled: false,
      allowedDomains: ["pacificwest.example"],
      attributes: { email: "$NAMEID", given_name: "user.givenname", family_name: "user.familyname" },
      lastLoginDays: 3,
      metadataRefreshedDays: 2,
      scimLogCount: 0,
      scimErrorCount: 0,
    },
  ];

  // Add a couple of failed/pending entries against generic providers so the
  // status filters render meaningful data even with few seed tenants.
  if (tenants.length >= 1) {
    configBlueprints.push({
      tenantIdx: 0,
      providerKey: "GENERIC_OIDC",
      type: "OIDC",
      displayName: "[seed] Sign in with custom OIDC",
      status: "FAILED",
      issuer: "https://idp.example.com/",
      clientId: "fake-client-id",
      discoveryUrl: "https://idp.example.com/.well-known/openid-configuration",
      scopes: ["openid", "email", "profile"],
      pkce: true,
      forceSso: false,
      jit: false,
      scimEnabled: false,
      allowedDomains: ["acme.com"],
      lastError: "OIDC discovery returned 404 — verify the issuer URL",
      lastLoginDays: undefined,
      metadataRefreshedDays: undefined,
      scimLogCount: 0,
      scimErrorCount: 0,
    });
  }
  if (tenants.length >= 2) {
    configBlueprints.push({
      tenantIdx: 1,
      providerKey: "ONELOGIN",
      type: "SAML",
      displayName: "[seed] Sign in with OneLogin",
      status: "PENDING",
      metadataUrl: "https://bigshop.onelogin.com/saml/metadata/abc-123",
      entityId: "https://bigshop.onelogin.com",
      forceSso: false,
      jit: true,
      scimEnabled: false,
      allowedDomains: ["bigshop.com"],
      attributes: { email: "$NAMEID" },
      lastLoginDays: undefined,
      metadataRefreshedDays: undefined,
      scimLogCount: 0,
      scimErrorCount: 0,
    });
  }

  let configCount = 0;
  let scimLogCount = 0;
  for (const b of configBlueprints) {
    const tenant = tenants[b.tenantIdx];
    if (!tenant) continue;
    const providerId = provIdMap.get(b.providerKey);
    if (!providerId) continue;

    const acsUrl = b.type === "SAML"
      ? `https://app.flowtora.com/api/sso/saml/${providerId}/acs?cfg=${tenant.id}`
      : null;

    const config = await db.ssoTenantConfig.upsert({
      where: { tenantId_providerId: { tenantId: tenant.id, providerId } },
      create: {
        tenantId: tenant.id,
        providerId,
        type: b.type,
        displayName: b.displayName,
        status: b.status,
        metadataUrl: b.metadataUrl ?? null,
        entityId: b.entityId ?? null,
        acsUrl,
        sloUrl: b.sloUrl ?? null,
        signatureAlgorithm: "RSA_SHA256",
        attributeMappings: (b.attributes ?? {}) as never,
        groupRules: (b.groupRules ?? []) as never,
        issuer: b.issuer ?? null,
        clientId: b.clientId ?? null,
        clientSecret: b.clientId ? createHash("sha256").update("seed-secret").digest("hex") : null,
        discoveryUrl: b.discoveryUrl ?? null,
        scopes: b.scopes ?? [],
        pkceEnabled: b.pkce ?? true,
        jitProvisioningEnabled: b.jit ?? true,
        forceSso: b.forceSso ?? false,
        allowedEmailDomains: b.allowedDomains ?? [],
        scimEnabled: b.scimEnabled ?? false,
        scimBearerToken: b.scimEnabled ? `scim_${randomBytes(20).toString("hex")}` : null,
        lastLoginAt: b.lastLoginDays != null ? daysAgo(b.lastLoginDays) : null,
        lastSyncAt: b.lastSyncDays != null ? daysAgo(b.lastSyncDays) : null,
        metadataLastRefreshedAt: b.metadataRefreshedDays != null ? daysAgo(b.metadataRefreshedDays) : null,
        lastError: b.lastError ?? null,
        createdById: reviewer.id,
      },
      update: {
        type: b.type,
        displayName: b.displayName,
        status: b.status,
        metadataUrl: b.metadataUrl ?? null,
        entityId: b.entityId ?? null,
        acsUrl: acsUrl ?? undefined,
        sloUrl: b.sloUrl ?? null,
        signatureAlgorithm: "RSA_SHA256",
        attributeMappings: (b.attributes ?? {}) as never,
        groupRules: (b.groupRules ?? []) as never,
        issuer: b.issuer ?? null,
        clientId: b.clientId ?? null,
        discoveryUrl: b.discoveryUrl ?? null,
        scopes: b.scopes ?? [],
        pkceEnabled: b.pkce ?? true,
        jitProvisioningEnabled: b.jit ?? true,
        forceSso: b.forceSso ?? false,
        allowedEmailDomains: b.allowedDomains ?? [],
        scimEnabled: b.scimEnabled ?? false,
        lastLoginAt: b.lastLoginDays != null ? daysAgo(b.lastLoginDays) : null,
        lastSyncAt: b.lastSyncDays != null ? daysAgo(b.lastSyncDays) : null,
        metadataLastRefreshedAt: b.metadataRefreshedDays != null ? daysAgo(b.metadataRefreshedDays) : null,
        lastError: b.lastError ?? null,
      },
      select: { id: true },
    });
    configCount++;

    // SCIM logs for SCIM-enabled configs.
    const operations = ["USER_CREATE", "USER_UPDATE", "USER_PATCH", "USER_DELETE", "GROUP_CREATE", "GROUP_UPDATE"] as const;
    const targetCount = b.scimLogCount ?? 0;
    const errorCount = b.scimErrorCount ?? 0;
    const events: Array<Record<string, unknown>> = [];
    for (let i = 0; i < targetCount; i++) {
      const op = operations[i % operations.length]!;
      const isError = i < errorCount;
      const isResource = op.startsWith("USER") ? "User" : "Group";
      const httpCode = isError ? rand([400, 401, 409, 500] as const) : rand([200, 201, 204] as const);
      events.push({
        ssoConfigId: config.id,
        tenantId: tenant.id,
        operation: op,
        resourceType: isResource,
        resourceId: !isError ? `${isResource.toLowerCase()}_${randomBytes(4).toString("hex")}` : null,
        externalId: `idp_${randomBytes(4).toString("hex")}`,
        status: isError ? rand(["ERROR", "DEAD_LETTER"] as const) : "OK",
        httpCode,
        payload: {
          schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
          userName: `user-${i}@${b.allowedDomains?.[0] ?? "example.com"}`,
          active: true,
          name: { givenName: "Sample", familyName: `User${i}` },
          emails: [{ value: `user-${i}@${b.allowedDomains?.[0] ?? "example.com"}`, primary: true }],
        },
        responseBody: isError ? '{"error":"validation_failed"}' : '{"ok":true}',
        errorMessage: isError
          ? rand([
              "External ID already exists for this tenant",
              "Required attribute 'email' missing",
              "User mapping returned no matching role",
              "Upstream IdP returned malformed payload",
            ] as const)
          : null,
        attempts: isError ? rand([1, 2, 3] as const) : 1,
        occurredAt: daysAgo(randInt(0, 14)),
      });
    }
    if (events.length > 0) {
      // createMany for speed.
      const chunkSize = 200;
      for (let i = 0; i < events.length; i += chunkSize) {
        await db.scimLog.createMany({ data: events.slice(i, i + chunkSize) as never });
      }
      scimLogCount += events.length;
    }
  }

  console.log(
    `  ✓ ${providers.length} providers, ${templates.length} templates, ${configCount} tenant configs, ${scimLogCount} SCIM events`,
  );
}

/* ── Page 50 — Security Center seed ────────────────────── */

async function seedSecurityCenter(staff: { id: string; email: string; name: string | null }[]) {
  console.log("── Seeding Security Center (Page 50)…");
  if (staff.length === 0) {
    console.log("  skipped — no platform staff");
    return;
  }

  // 1. Settings singleton.
  await db.securityCenterSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      cachedScore: 88,
      cachedGrade: "B",
      scoreComputedAt: minutesAgo(30),
      failedLoginThreshold: 5,
      failedLoginWindowMin: 15,
      bannerOnHighSeverity: true,
      realtimeFeedEnabled: true,
      mttrTargetDays: 14,
      passwordMinLength: 14,
      passwordRequireMixed: true,
      passwordMaxAgeDays: 180,
      passwordHistoryDepth: 8,
      passwordBreachCheck: true,
    },
    update: {
      cachedScore: 88,
      cachedGrade: "B",
      scoreComputedAt: minutesAgo(30),
    },
  });

  // 2. Encryption snapshot.
  await db.encryptionStatus.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      atRestAlgorithm:   "AES-256-GCM",
      atRestState:       "HEALTHY",
      inTransitProtocol: "TLS 1.3",
      inTransitState:    "HEALTHY",
      kmsProvider:       "AWS KMS · us-east-1",
      kmsState:          "HEALTHY",
      keyLastRotatedAt:  daysAgo(34),
      keyRotationDueIn:  56,
      encryptedSecrets:  428,
      pendingMigrations: 6,
      notes: "Auto-rotation cadence: 90 days. 6 legacy plaintext secrets queued for migration sweep this Friday.",
    },
    update: {
      keyLastRotatedAt:  daysAgo(34),
      keyRotationDueIn:  56,
      encryptedSecrets:  428,
      pendingMigrations: 6,
    },
  });

  // 3. Vulnerability scan history (one row per source × past few weeks).
  await db.vulnerabilityScan.createMany({
    data: [
      { source: "SNYK",                     status: "COMPLETE", startedAt: daysAgo(0.5), completedAt: daysAgo(0.4),
        totalFindings: 12, critical: 0, high: 2, medium: 6, low: 4,
        summary: "Scanned 14,892 deps; 2 new high-severity CVEs.", scope: "[seed] flowtora monorepo · main" },
      { source: "DEPENDABOT",               status: "COMPLETE", startedAt: daysAgo(1),   completedAt: daysAgo(1),
        totalFindings: 7,  critical: 0, high: 1, medium: 3, low: 3,
        summary: "Auto-PRs opened for 4 patches.", scope: "[seed] flowtora-api" },
      { source: "GITHUB_ADVANCED_SECURITY", status: "COMPLETE", startedAt: daysAgo(2),   completedAt: daysAgo(2),
        totalFindings: 4,  critical: 0, high: 0, medium: 2, low: 2,
        summary: "CodeQL pass — 2 medium logic flaws flagged.", scope: "[seed] flowtora-web" },
      { source: "TRUFFLEHOG",               status: "COMPLETE", startedAt: daysAgo(3),   completedAt: daysAgo(3),
        totalFindings: 1,  critical: 0, high: 1, medium: 0, low: 0,
        summary: "1 stale Stripe key detected in test fixtures.", scope: "[seed] all repos · history" },
      { source: "AWS_INSPECTOR",            status: "COMPLETE", startedAt: daysAgo(4),   completedAt: daysAgo(4),
        totalFindings: 3,  critical: 0, high: 0, medium: 2, low: 1,
        summary: "Misconfig drift: 2 SGs allow 0.0.0.0/0 on non-ALB ports.", scope: "[seed] aws/prod" },
      { source: "SEMGREP",                  status: "RUNNING",  startedAt: minutesAgo(8),  completedAt: null,
        totalFindings: 0,  critical: 0, high: 0, medium: 0, low: 0,
        summary: null, scope: "[seed] flowtora monorepo · feature/security-center" },
    ],
  });

  // 4. Penetration tests (annual + retest).
  await db.penetrationTest.createMany({
    data: [
      { vendor: "[seed] NCC Group",       scope: "Full external app + API audit",
        startedAt: daysAgo(120), completedAt: daysAgo(95),
        status: "RETEST_PASSED", executiveSummaryUrl: "https://docs.flowtora.com/seed-pentest-q4-2025.pdf",
        critical: 0, high: 1, medium: 4, low: 7, retestPassed: 1,
        notes: "Findings cleared on retest; SAML XSW vulnerability fix verified." },
      { vendor: "[seed] Bishop Fox",      scope: "Internal infrastructure + IAM",
        startedAt: daysAgo(220), completedAt: daysAgo(195),
        status: "COMPLETE", executiveSummaryUrl: "https://docs.flowtora.com/seed-pentest-internal.pdf",
        critical: 0, high: 0, medium: 2, low: 5, retestPassed: 0 },
      { vendor: "[seed] Cure53",          scope: "Browser extension hardening",
        startedAt: daysAgo(45),  completedAt: daysAgo(15),
        status: "RETEST_REQUIRED", executiveSummaryUrl: null,
        critical: 1, high: 2, medium: 3, low: 2, retestPassed: 0,
        notes: "Critical: postMessage origin check missing in chat panel iframe. Patch landed; retest scheduled." },
      { vendor: "[seed] Trail of Bits",   scope: "Cryptographic review of SCIM bearer tokens",
        startedAt: daysAgo(7),   completedAt: null,
        status: "IN_PROGRESS", executiveSummaryUrl: null,
        critical: 0, high: 0, medium: 0, low: 0, retestPassed: 0 },
    ],
  });

  // 5. Bug bounty reports.
  await db.bugBountyReport.createMany({
    data: [
      { platform: "HACKERONE", externalId: "SEED-1837421", reporter: "@h4ck3r-jane",
        title: "[seed] Stored XSS in proof comment markdown renderer",
        severity: "HIGH",     status: "RESOLVED",  payoutCents: 250000,
        submittedAt: daysAgo(38), resolvedAt: daysAgo(22),
        summary: "Sanitization bypass via SVG payload — fixed via DOMPurify upgrade." },
      { platform: "HACKERONE", externalId: "SEED-1842903", reporter: "@bobsec",
        title: "[seed] IDOR on tenant invoice export",
        severity: "CRITICAL", status: "RESOLVED",  payoutCents: 600000,
        submittedAt: daysAgo(60), resolvedAt: daysAgo(54),
        summary: "Tenant scoping check missing on legacy invoice download route." },
      { platform: "INTIGRITI", externalId: "SEED-9023",   reporter: "@rasvalt",
        title: "[seed] Open redirect via SSO callback",
        severity: "MEDIUM",   status: "CONFIRMED", payoutCents: 75000,
        submittedAt: daysAgo(10), resolvedAt: null,
        summary: "Insufficient allow-list on SAML RelayState parameter; fix in flight." },
      { platform: "INTIGRITI", externalId: "SEED-9112",   reporter: "@dorigold",
        title: "[seed] CSRF token reuse on session revocation endpoint",
        severity: "LOW",      status: "TRIAGE",    payoutCents: 0,
        submittedAt: daysAgo(2),  resolvedAt: null,
        summary: "Reporter claims partial CSRF — under triage." },
      { platform: "BUGCROWD", externalId: "SEED-bc-7733", reporter: "@nullbyte99",
        title: "[seed] Information disclosure in 500 error stack trace",
        severity: "LOW",      status: "INFORMATIVE", payoutCents: 0,
        submittedAt: daysAgo(15), resolvedAt: daysAgo(12),
        summary: "Stack trace leaked path to ENV file in non-prod cluster only — no production impact." },
      { platform: "HACKERONE", externalId: "SEED-1855112", reporter: "@dupbot",
        title: "[seed] CSRF on profile picture upload",
        severity: "LOW",      status: "DUPLICATE", payoutCents: 0,
        submittedAt: daysAgo(8),  resolvedAt: daysAgo(7),
        summary: "Dup of issue closed last quarter." },
    ],
  });

  // 6. Suspicious activity feed (~14 events).
  await db.suspiciousActivity.createMany({
    data: [
      { kind: "FAILED_LOGIN_BURST", severity: "HIGH",   status: "OPEN",
        userEmail: "owner@acme.example", userDisplayName: "Acme Owner",
        ipAddress: "203.0.113.42", geoLocation: "Sofia, BG",
        summary: "[seed] 12 failed logins in 4 minutes from a new IP",
        occurredAt: minutesAgo(8) },
      { kind: "UNUSUAL_GEO", severity: "MEDIUM", status: "INVESTIGATING",
        userEmail: "csr@bigshop.example", userDisplayName: "Bigshop CSR",
        ipAddress: "198.51.100.221", geoLocation: "Lagos, NG",
        summary: "[seed] Login from country never used before by this account",
        occurredAt: minutesAgo(45) },
      { kind: "CONCURRENT_SESSIONS", severity: "MEDIUM", status: "OPEN",
        userEmail: "admin@pacificwest.example", userDisplayName: "PW Admin",
        ipAddress: "192.0.2.10", geoLocation: "San Diego, US",
        summary: "[seed] 4 concurrent sessions across 3 distinct IPs",
        occurredAt: minutesAgo(180) },
      { kind: "BRUTE_FORCE", severity: "CRITICAL", status: "ACTION_TAKEN",
        userEmail: null, userDisplayName: null,
        ipAddress: "45.33.32.156", geoLocation: "Frankfurt, DE",
        summary: "[seed] 800+ login attempts blocked at WAF — IP banned",
        occurredAt: daysAgo(0.3),
        resolvedAt: daysAgo(0.2), resolvedById: staff[0]!.id },
      { kind: "LEAKED_CREDENTIAL", severity: "HIGH",   status: "OPEN",
        userEmail: "designer@acme.example", userDisplayName: "Acme Designer",
        ipAddress: null, geoLocation: null,
        summary: "[seed] HaveIBeenPwned match — Adobe 2013 breach",
        occurredAt: daysAgo(1) },
      { kind: "IMPOSSIBLE_TRAVEL", severity: "HIGH",   status: "INVESTIGATING",
        userEmail: "production@bigshop.example", userDisplayName: "Bigshop Production",
        ipAddress: "104.16.18.19", geoLocation: "Tokyo, JP / Toronto, CA in 22 min",
        summary: "[seed] Two logins 9,000 km apart inside 22 min window",
        occurredAt: daysAgo(1.5) },
      { kind: "TOR_EXIT_NODE", severity: "MEDIUM", status: "DISMISSED",
        userEmail: "owner@pacificwest.example", userDisplayName: "PW Owner",
        ipAddress: "185.220.101.4", geoLocation: "Tor exit (DE)",
        summary: "[seed] Login via known Tor exit node (admin acknowledged)",
        occurredAt: daysAgo(2),
        resolvedAt: daysAgo(2), resolvedById: staff[0]!.id },
      { kind: "NEW_DEVICE", severity: "LOW", status: "OPEN",
        userEmail: "csr@acme.example", userDisplayName: "Acme CSR",
        ipAddress: "203.0.113.119", geoLocation: "Austin, US",
        summary: "[seed] First-time device fingerprint for this user",
        occurredAt: daysAgo(2.5) },
      { kind: "FAILED_LOGIN_BURST", severity: "MEDIUM", status: "DISMISSED",
        userEmail: "accounting@bigshop.example", userDisplayName: "Bigshop Accounting",
        ipAddress: "172.16.4.20", geoLocation: "Chicago, US",
        summary: "[seed] 5 failed logins in 30s — typo recovery (user confirmed)",
        occurredAt: daysAgo(3),
        resolvedAt: daysAgo(2.9), resolvedById: staff[0]!.id },
      { kind: "UNUSUAL_GEO", severity: "MEDIUM", status: "OPEN",
        userEmail: "owner@bigshop.example", userDisplayName: "Bigshop Owner",
        ipAddress: "8.8.8.8", geoLocation: "Mountain View, US",
        summary: "[seed] Login from corporate VPN endpoint 1,400 km from usual",
        occurredAt: daysAgo(4) },
      { kind: "CONCURRENT_SESSIONS", severity: "LOW", status: "DISMISSED",
        userEmail: "designer@bigshop.example", userDisplayName: "Bigshop Designer",
        ipAddress: "10.0.0.1", geoLocation: "Seattle, US",
        summary: "[seed] 2 sessions on laptop + tablet (expected)",
        occurredAt: daysAgo(5),
        resolvedAt: daysAgo(5), resolvedById: staff[0]!.id },
      { kind: "BRUTE_FORCE", severity: "HIGH", status: "ACTION_TAKEN",
        userEmail: null, userDisplayName: null,
        ipAddress: "5.188.10.45", geoLocation: "Moscow, RU",
        summary: "[seed] Credential stuffing burst — 300 IPs banned",
        occurredAt: daysAgo(7),
        resolvedAt: daysAgo(7), resolvedById: staff[0]!.id },
      { kind: "LEAKED_CREDENTIAL", severity: "MEDIUM", status: "OPEN",
        userEmail: "installer@pacificwest.example", userDisplayName: "PW Installer",
        ipAddress: null, geoLocation: null,
        summary: "[seed] HaveIBeenPwned match — LinkedIn 2012 breach",
        occurredAt: daysAgo(8) },
      { kind: "NEW_DEVICE", severity: "INFO", status: "DISMISSED",
        userEmail: "production@acme.example", userDisplayName: "Acme Production",
        ipAddress: "203.0.113.55", geoLocation: "Phoenix, US",
        summary: "[seed] New iOS device, MDM-enrolled (auto-trusted)",
        occurredAt: daysAgo(10),
        resolvedAt: daysAgo(10), resolvedById: staff[0]!.id },
    ],
  });

  // 7. Security findings (mix of sources).
  type FBP = {
    source: "VULNERABILITY_SCAN" | "SECRET_SCAN" | "DEPENDENCY_SCAN" | "CLOUD_POSTURE" | "PENETRATION_TEST" | "BUG_BOUNTY" | "MANUAL";
    title: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
    status: "OPEN" | "IN_PROGRESS" | "REMEDIATED" | "ACCEPTED_RISK" | "FALSE_POSITIVE" | "WONT_FIX";
    externalRef?: string; component?: string; version?: string; fixVersion?: string; score?: number;
    daysAgoDetected: number; remediatedDaysAgo?: number; description?: string; assignedTo?: number;
  };
  const findings: FBP[] = [
    // Dependency / vulnerability scan
    { source: "DEPENDENCY_SCAN", title: "[seed] CVE-2024-37890 ws DoS via crafted upgrade headers",
      severity: "HIGH", status: "OPEN",
      externalRef: "CVE-2024-37890", component: "ws", version: "8.13.0", fixVersion: "8.17.1", score: 7.5,
      daysAgoDetected: 1, description: "Upstream WebSocket lib accepts unbounded headers leading to OOM." },
    { source: "DEPENDENCY_SCAN", title: "[seed] CVE-2024-21534 jsonpath-plus RCE via expression injection",
      severity: "CRITICAL", status: "IN_PROGRESS",
      externalRef: "CVE-2024-21534", component: "jsonpath-plus", version: "9.0.0", fixVersion: "10.0.7", score: 9.8,
      daysAgoDetected: 3, assignedTo: 0,
      description: "Untrusted input flows into JSONPath compiler — drop-in upgrade available." },
    { source: "DEPENDENCY_SCAN", title: "[seed] CVE-2024-29415 ip package SSRF on private addresses",
      severity: "MEDIUM", status: "OPEN",
      externalRef: "CVE-2024-29415", component: "ip", version: "2.0.0", fixVersion: "2.0.1", score: 5.4,
      daysAgoDetected: 5 },
    { source: "DEPENDENCY_SCAN", title: "[seed] CVE-2024-46982 next.js cache poisoning",
      severity: "HIGH", status: "REMEDIATED",
      externalRef: "CVE-2024-46982", component: "next", version: "15.5.10", fixVersion: "15.5.15", score: 7.5,
      daysAgoDetected: 14, remediatedDaysAgo: 9 },
    { source: "VULNERABILITY_SCAN", title: "[seed] Prototype pollution in lodash.merge usage",
      severity: "MEDIUM", status: "OPEN",
      externalRef: "GHSA-jf85-cpcp-j695", component: "lodash", version: "4.17.20", fixVersion: "4.17.21", score: 6.5,
      daysAgoDetected: 7 },
    { source: "VULNERABILITY_SCAN", title: "[seed] Outdated jQuery 3.5.0 — XSS in HTML rewriting",
      severity: "LOW", status: "WONT_FIX",
      externalRef: "GHSA-mhpp-875w-9cpv", component: "jquery", version: "3.5.0", fixVersion: "3.5.1", score: 3.4,
      daysAgoDetected: 90, description: "Only used by legacy admin tool flagged for retirement Q3." },

    // Secret scanning
    { source: "SECRET_SCAN", title: "[seed] Stripe live secret in test fixture",
      severity: "HIGH", status: "REMEDIATED",
      externalRef: "GH-SEC-44", component: "tests/billing/__fixtures__/stripe.ts", score: 7.0,
      daysAgoDetected: 6, remediatedDaysAgo: 4,
      description: "TruffleHog flagged sk_live_… in committed fixture; rotated and revoked." },
    { source: "SECRET_SCAN", title: "[seed] AWS access key (IAM seeded for review env)",
      severity: "MEDIUM", status: "OPEN",
      externalRef: "GH-SEC-51", component: ".env.review", score: 5.0,
      daysAgoDetected: 2 },
    { source: "SECRET_SCAN", title: "[seed] Slack webhook URL leaked in CI log",
      severity: "LOW", status: "REMEDIATED",
      externalRef: "GH-SEC-47", component: ".github/workflows/deploy.yml", score: 3.5,
      daysAgoDetected: 12, remediatedDaysAgo: 11 },

    // Cloud posture
    { source: "CLOUD_POSTURE", title: "[seed] S3 bucket policy allows unauthenticated GET",
      severity: "HIGH", status: "IN_PROGRESS",
      externalRef: "AWS-S3-1", component: "s3://flowtora-assets-staging", score: 7.2,
      daysAgoDetected: 2, assignedTo: 0,
      description: "Bucket policy missing PrincipalCondition; staging only — restricting now." },
    { source: "CLOUD_POSTURE", title: "[seed] Security group allows 0.0.0.0/0 on port 5432",
      severity: "CRITICAL", status: "REMEDIATED",
      externalRef: "AWS-EC2-9", component: "sg-0a4b...c2", score: 9.1,
      daysAgoDetected: 11, remediatedDaysAgo: 10,
      description: "Postgres SG drift detected by AWS Config; rule retracted within 1h." },
    { source: "CLOUD_POSTURE", title: "[seed] CloudFront distribution missing WAF",
      severity: "MEDIUM", status: "OPEN",
      externalRef: "AWS-CF-3", component: "d1abc23456.cloudfront.net", score: 6.0,
      daysAgoDetected: 18 },
    { source: "CLOUD_POSTURE", title: "[seed] RDS snapshot publicly shareable (manual snap)",
      severity: "LOW", status: "ACCEPTED_RISK",
      externalRef: "AWS-RDS-2", component: "rds:flowtora-prod", score: 2.5,
      daysAgoDetected: 30,
      description: "Manual snap created for forensic review; will revoke after retention window." },

    // Pen test findings carried over
    { source: "PENETRATION_TEST", title: "[seed] postMessage origin check missing in chat-panel iframe",
      severity: "CRITICAL", status: "IN_PROGRESS",
      externalRef: "Cure53-2026Q2-#1", component: "src/components/chat/ChatPanel.tsx", score: 9.0,
      daysAgoDetected: 12, assignedTo: 0 },
    { source: "PENETRATION_TEST", title: "[seed] CSRF protection bypass via SameSite=None",
      severity: "MEDIUM", status: "REMEDIATED",
      externalRef: "NCC-2025Q4-#3", component: "session cookie", score: 5.5,
      daysAgoDetected: 100, remediatedDaysAgo: 92 },

    // Bug bounty findings (mirror)
    { source: "BUG_BOUNTY", title: "[seed] IDOR on tenant invoice export (H1 #1842903)",
      severity: "CRITICAL", status: "REMEDIATED",
      externalRef: "H1-1842903", component: "GET /api/invoices/[id]/export", score: 9.5,
      daysAgoDetected: 60, remediatedDaysAgo: 54 },
    { source: "BUG_BOUNTY", title: "[seed] Open redirect via SSO callback (Intigriti #9023)",
      severity: "MEDIUM", status: "IN_PROGRESS",
      externalRef: "INT-9023", component: "/api/sso/callback", score: 5.0,
      daysAgoDetected: 10, assignedTo: 0 },
  ];
  await db.securityFinding.createMany({
    data: findings.map((f) => {
      const detectedAt = daysAgo(f.daysAgoDetected);
      const remediatedAt = f.remediatedDaysAgo != null ? daysAgo(f.remediatedDaysAgo) : null;
      const days = remediatedAt ? Math.max(0, f.daysAgoDetected - (f.remediatedDaysAgo ?? f.daysAgoDetected)) : null;
      return {
        source: f.source,
        title: f.title,
        description: f.description ?? null,
        severity: f.severity,
        status: f.status,
        externalRef: f.externalRef ?? null,
        component: f.component ?? null,
        version: f.version ?? null,
        fixVersion: f.fixVersion ?? null,
        score: f.score ?? null,
        detectedAt,
        remediatedAt,
        daysToRemediate: days,
        assignedToId: f.assignedTo != null ? staff[f.assignedTo % staff.length]!.id : null,
        resolvedById:  remediatedAt ? staff[0]!.id : null,
      };
    }),
  });

  // 8. Password-policy audit row per platform user.
  for (const u of staff) {
    const fail = Math.random();
    await db.passwordPolicyAudit.upsert({
      where: { userId: u.id },
      create: {
        userId: u.id,
        meetsLength:       fail > 0.05,
        meetsComplexity:   fail > 0.10,
        meetsAge:          fail > 0.20,
        meetsHistory:      fail > 0.05,
        passesBreachCheck: fail > 0.08,
        mfaEnabled:        fail > 0.15,
        passwordAgeDays:   randInt(7, 240),
        checkedAt: minutesAgo(randInt(5, 720)),
      },
      update: {
        meetsLength:       fail > 0.05,
        meetsComplexity:   fail > 0.10,
        meetsAge:          fail > 0.20,
        meetsHistory:      fail > 0.05,
        passesBreachCheck: fail > 0.08,
        mfaEnabled:        fail > 0.15,
        passwordAgeDays:   randInt(7, 240),
        checkedAt: minutesAgo(randInt(5, 720)),
      },
    });
  }

  console.log(
    `  ✓ ${findings.length} findings, ~14 suspicious events, 6 scans, 4 pen tests, 6 bug-bounty reports, ${staff.length} pwd-audit rows`,
  );
}

/* ── Page 51 — Compliance program seed ─────────────────── */

async function seedCompliance(tenants: { id: string; name: string; slug: string }[]) {
  console.log("── Seeding Compliance program (Page 51)…");

  // 1. Frameworks — six tracked, three certified.
  type FwBp = {
    key: "SOC2_TYPE_II" | "ISO_27001" | "GDPR" | "CCPA" | "HIPAA" | "PCI_DSS" | "FERPA" | "FEDRAMP";
    name: string;
    status: "IN_SCOPE" | "AUDIT_READY" | "CERTIFIED" | "NOT_IN_SCOPE" | "PLANNED";
    auditor?: string;
    lastAuditDays?: number;
    nextAuditDays?: number;
    notes?: string;
  };
  const frameworks: FwBp[] = [
    { key: "SOC2_TYPE_II", name: "[seed] SOC 2 Type II",
      status: "CERTIFIED",
      auditor: "Prescient Assurance", lastAuditDays: 95, nextAuditDays: 270,
      notes: "Annual Type II observation period — 12 months." },
    { key: "ISO_27001",   name: "[seed] ISO 27001:2022",
      status: "CERTIFIED",
      auditor: "Schellman", lastAuditDays: 180, nextAuditDays: 185,
      notes: "Surveillance audit due in ~6 months." },
    { key: "GDPR",        name: "[seed] GDPR (EU 2016/679)",
      status: "AUDIT_READY",
      auditor: "DataGuard", lastAuditDays: 130, nextAuditDays: 235,
      notes: "Article 30 ROPA maintained quarterly." },
    { key: "CCPA",        name: "[seed] CCPA / CPRA",
      status: "AUDIT_READY",
      lastAuditDays: 200, nextAuditDays: 165,
      notes: "Self-attested — no third-party audit required." },
    { key: "HIPAA",       name: "[seed] HIPAA (in-progress)",
      status: "IN_SCOPE",
      lastAuditDays: undefined, nextAuditDays: 90,
      notes: "Healthcare tenants pending — BAA template ready." },
    { key: "PCI_DSS",     name: "[seed] PCI DSS v4.0",
      status: "PLANNED",
      lastAuditDays: undefined, nextAuditDays: 365,
      notes: "Out-of-scope until a card-present integration ships." },
    { key: "FERPA",       name: "[seed] FERPA",
      status: "NOT_IN_SCOPE",
      notes: "Education-sector only — none currently in customer base." },
    { key: "FEDRAMP",     name: "[seed] FedRAMP Moderate",
      status: "PLANNED", nextAuditDays: 540,
      notes: "GovCloud rollout in late 2026." },
  ];
  const fwIdByKey = new Map<string, string>();
  for (const f of frameworks) {
    const saved = await db.complianceFramework.upsert({
      where: { key: f.key },
      create: {
        key: f.key,
        name: f.name,
        status: f.status,
        auditor: f.auditor ?? null,
        lastAuditAt: f.lastAuditDays != null ? daysAgo(f.lastAuditDays) : null,
        nextAuditAt: f.nextAuditDays != null ? daysAgo(-f.nextAuditDays) : null,
        notes: f.notes ?? null,
      },
      update: {
        name: f.name,
        status: f.status,
        auditor: f.auditor ?? null,
        lastAuditAt: f.lastAuditDays != null ? daysAgo(f.lastAuditDays) : null,
        nextAuditAt: f.nextAuditDays != null ? daysAgo(-f.nextAuditDays) : null,
        notes: f.notes ?? null,
      },
      select: { id: true, key: true },
    });
    fwIdByKey.set(saved.key, saved.id);
  }

  // 2. Controls (~20) with mappings.
  type CtrlBp = {
    externalId: string;
    title: string;
    description: string;
    domain: "ACCESS_CONTROL" | "CHANGE_MANAGEMENT" | "INCIDENT_RESPONSE"
          | "BUSINESS_CONTINUITY" | "VENDOR_MANAGEMENT" | "DATA_PROTECTION"
          | "CRYPTOGRAPHY" | "RISK_MANAGEMENT" | "SECURE_SDLC"
          | "PHYSICAL_SECURITY" | "HR_SECURITY" | "MONITORING";
    status: "PASSING" | "FAILING" | "NOT_APPLICABLE" | "IN_REVIEW" | "PENDING_EVIDENCE";
    primaryFw: FwBp["key"];
    mappings: Array<{ fw: FwBp["key"]; ref: string }>;
    owner: string;
    testFrequency: string;
    lastTestedDays?: number;
    nextTestDays?: number;
    auto: boolean;
    autoResult?: string;
  };
  const controls: CtrlBp[] = [
    { externalId: "SEED-CC6.1", title: "MFA enforced on all platform admin accounts",
      description: "All Flowtora staff must complete TOTP/WebAuthn challenge to authenticate.",
      domain: "ACCESS_CONTROL", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.9.4.2" }, { fw: "HIPAA", ref: "§164.312(d)" }],
      owner: "ciso@flowtora.com", testFrequency: "monthly",
      lastTestedDays: 8, nextTestDays: 22, auto: true, autoResult: "OK" },
    { externalId: "SEED-CC6.2", title: "Least-privilege RBAC enforced for staff actions",
      description: "Role assignments reviewed quarterly; elevation requires audited justification.",
      domain: "ACCESS_CONTROL", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.9.2.3" }],
      owner: "ciso@flowtora.com", testFrequency: "quarterly",
      lastTestedDays: 14, nextTestDays: 76, auto: false },
    { externalId: "SEED-CC7.2", title: "Continuous logging of privileged actions",
      description: "All auditable platform actions persisted with hash-chain tamper detection.",
      domain: "MONITORING", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.12.4.1" }, { fw: "HIPAA", ref: "§164.308(a)(1)(ii)(D)" }],
      owner: "engineering-lead@flowtora.com", testFrequency: "continuous",
      lastTestedDays: 1, auto: true, autoResult: "OK" },
    { externalId: "SEED-CC7.4", title: "Vulnerability scans at least weekly",
      description: "Snyk + Dependabot run on every PR; weekly summary triaged by security team.",
      domain: "SECURE_SDLC", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.12.6.1" }],
      owner: "security-eng@flowtora.com", testFrequency: "weekly",
      lastTestedDays: 1, auto: true, autoResult: "OK" },
    { externalId: "SEED-CC8.1", title: "Change management — code review + CI green",
      description: "All deploys gated on review, automated tests, and successful build.",
      domain: "CHANGE_MANAGEMENT", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.14.2.2" }],
      owner: "engineering-lead@flowtora.com", testFrequency: "continuous",
      lastTestedDays: 0, auto: true, autoResult: "OK" },
    { externalId: "SEED-CC9.1", title: "Encryption at rest + in transit",
      description: "AES-256-GCM for stored data; TLS 1.3 for all transport.",
      domain: "CRYPTOGRAPHY", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.10.1.1" }, { fw: "HIPAA", ref: "§164.312(a)(2)(iv)" }, { fw: "PCI_DSS", ref: "Req. 4.1" }],
      owner: "security-eng@flowtora.com", testFrequency: "monthly",
      lastTestedDays: 5, nextTestDays: 25, auto: true, autoResult: "OK" },
    { externalId: "SEED-A.16.1", title: "Incident response plan tested annually",
      description: "Tabletop exercises run twice yearly; postmortems published.",
      domain: "INCIDENT_RESPONSE", status: "IN_REVIEW",
      primaryFw: "ISO_27001",
      mappings: [{ fw: "SOC2_TYPE_II", ref: "CC7.4" }],
      owner: "ciso@flowtora.com", testFrequency: "biannually",
      lastTestedDays: 95, nextTestDays: 85, auto: false },
    { externalId: "SEED-A.17.1", title: "Business continuity plan + recovery time objectives",
      description: "Documented BCP with RTO 4h, RPO 1h. Annual restore test.",
      domain: "BUSINESS_CONTINUITY", status: "PASSING",
      primaryFw: "ISO_27001",
      mappings: [],
      owner: "operations@flowtora.com", testFrequency: "annually",
      lastTestedDays: 220, nextTestDays: 145, auto: false },
    { externalId: "SEED-A.7.2", title: "Background checks on staff with prod access",
      description: "Pre-employment screening on all engineers + customer-data roles.",
      domain: "HR_SECURITY", status: "PASSING",
      primaryFw: "ISO_27001",
      mappings: [],
      owner: "people@flowtora.com", testFrequency: "as needed",
      lastTestedDays: 60, auto: false },
    { externalId: "SEED-GDPR-30", title: "Article 30 record of processing activities",
      description: "Maintained ROPA with categories, retention, transfer, security.",
      domain: "DATA_PROTECTION", status: "PASSING",
      primaryFw: "GDPR",
      mappings: [{ fw: "CCPA", ref: "§1798.130(a)(5)" }],
      owner: "dpo@flowtora.com", testFrequency: "quarterly",
      lastTestedDays: 30, nextTestDays: 60, auto: false },
    { externalId: "SEED-GDPR-32", title: "Technical & organizational measures (TOMs)",
      description: "Documented TOMs aligned with Article 32; reviewed when integrations change.",
      domain: "DATA_PROTECTION", status: "PASSING",
      primaryFw: "GDPR",
      mappings: [{ fw: "ISO_27001", ref: "A.18.1.4" }],
      owner: "dpo@flowtora.com", testFrequency: "annually",
      lastTestedDays: 70, nextTestDays: 295, auto: false },
    { externalId: "SEED-GDPR-33", title: "72-hour breach notification readiness",
      description: "Runbook + DPA-defined notification template; on-call rotation.",
      domain: "INCIDENT_RESPONSE", status: "PASSING",
      primaryFw: "GDPR",
      mappings: [],
      owner: "dpo@flowtora.com", testFrequency: "biannually",
      lastTestedDays: 110, auto: false },
    { externalId: "SEED-VEN-1", title: "Vendor security review before onboarding",
      description: "All vendors processing PII complete a CAIQ-Lite + SOC 2 review.",
      domain: "VENDOR_MANAGEMENT", status: "PASSING",
      primaryFw: "ISO_27001",
      mappings: [{ fw: "SOC2_TYPE_II", ref: "CC9.2" }],
      owner: "procurement@flowtora.com", testFrequency: "as needed",
      lastTestedDays: 12, auto: false },
    { externalId: "SEED-RISK-1", title: "Risk assessment refreshed annually",
      description: "Risk committee meets quarterly; full register reviewed annually.",
      domain: "RISK_MANAGEMENT", status: "PASSING",
      primaryFw: "ISO_27001",
      mappings: [],
      owner: "ciso@flowtora.com", testFrequency: "annually",
      lastTestedDays: 320, nextTestDays: 45, auto: false },
    { externalId: "SEED-SDL-1", title: "Secret scanning on every commit",
      description: "GitHub Advanced Security + TruffleHog on push; auto-block of leaks.",
      domain: "SECURE_SDLC", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [],
      owner: "security-eng@flowtora.com", testFrequency: "continuous",
      lastTestedDays: 0, auto: true, autoResult: "OK" },
    { externalId: "SEED-CC6.6", title: "Session timeout + session invalidation on password change",
      description: "All sessions revoked on credential changes; max lifetime 12h.",
      domain: "ACCESS_CONTROL", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.9.4.2" }],
      owner: "security-eng@flowtora.com", testFrequency: "monthly",
      lastTestedDays: 6, auto: true, autoResult: "OK" },
    { externalId: "SEED-MON-1", title: "24×7 alerting on production health metrics",
      description: "PagerDuty rotation; SLO-based alerts; runbook per alert.",
      domain: "MONITORING", status: "PENDING_EVIDENCE",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.12.4.1" }],
      owner: "operations@flowtora.com", testFrequency: "monthly",
      auto: false },
    { externalId: "SEED-PHY-1", title: "Physical security — cloud-only, no on-prem hosting",
      description: "All compute in AWS regions with SOC 2 Type II + ISO 27001 hosts.",
      domain: "PHYSICAL_SECURITY", status: "NOT_APPLICABLE",
      primaryFw: "ISO_27001",
      mappings: [{ fw: "SOC2_TYPE_II", ref: "CC6.4" }],
      owner: "operations@flowtora.com", testFrequency: "annually",
      auto: false },
    { externalId: "SEED-BCP-2", title: "Quarterly DR restore drill",
      description: "Restore latest snapshot to staging; verify integrity + RPO.",
      domain: "BUSINESS_CONTINUITY", status: "FAILING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.17.1.2" }],
      owner: "operations@flowtora.com", testFrequency: "quarterly",
      lastTestedDays: 95, nextTestDays: -5, auto: false,
      autoResult: undefined },
    { externalId: "SEED-IR-2", title: "Forensic logging retained for 1 year",
      description: "Audit log immutable; tamper-evident hash chain verified weekly.",
      domain: "INCIDENT_RESPONSE", status: "PASSING",
      primaryFw: "SOC2_TYPE_II",
      mappings: [{ fw: "ISO_27001", ref: "A.12.4.1" }],
      owner: "security-eng@flowtora.com", testFrequency: "weekly",
      lastTestedDays: 4, auto: true, autoResult: "OK" },
  ];
  const ctrlIdByExtId = new Map<string, string>();
  for (const c of controls) {
    const saved = await db.complianceControl.upsert({
      where: { externalId: c.externalId },
      create: {
        externalId: c.externalId, title: c.title, description: c.description,
        domain: c.domain, status: c.status, ownerEmail: c.owner,
        testFrequency: c.testFrequency,
        lastTestedAt: c.lastTestedDays != null ? daysAgo(c.lastTestedDays) : null,
        nextTestAt:   c.nextTestDays   != null ? daysAgo(-c.nextTestDays)  : null,
        autoCheckEnabled: c.auto, autoCheckResult: c.autoResult ?? null,
        primaryFrameworkId: fwIdByKey.get(c.primaryFw)!,
      },
      update: {
        title: c.title, description: c.description,
        domain: c.domain, status: c.status, ownerEmail: c.owner,
        testFrequency: c.testFrequency,
        lastTestedAt: c.lastTestedDays != null ? daysAgo(c.lastTestedDays) : null,
        nextTestAt:   c.nextTestDays   != null ? daysAgo(-c.nextTestDays)  : null,
        autoCheckEnabled: c.auto, autoCheckResult: c.autoResult ?? null,
        primaryFrameworkId: fwIdByKey.get(c.primaryFw)!,
      },
      select: { id: true, externalId: true },
    });
    ctrlIdByExtId.set(saved.externalId, saved.id);
    // Mappings.
    for (const m of c.mappings) {
      await db.complianceControlMapping.upsert({
        where: {
          controlId_frameworkKey_externalRef: {
            controlId: saved.id, frameworkKey: m.fw, externalRef: m.ref,
          },
        },
        create: { controlId: saved.id, frameworkKey: m.fw, externalRef: m.ref },
        update: {},
      });
    }
  }

  // Recompute framework cached counts.
  for (const [key, id] of fwIdByKey) {
    const [total, passing] = await Promise.all([
      db.complianceControl.count({ where: { primaryFrameworkId: id } }),
      db.complianceControl.count({ where: { primaryFrameworkId: id, status: "PASSING" } }),
    ]);
    await db.complianceFramework.update({
      where: { id },
      data: {
        totalControls: total,
        passingCount: passing,
        passingPct: total === 0 ? 0 : Math.round((passing / total) * 100),
      },
    });
  }

  // 3. Evidence (~30 entries, mix of auto and manual).
  type EvBp = {
    ctrlExtId: string; title: string; description: string;
    source: "AUTO" | "MANUAL";
    collector: string;
    kind: "SCREENSHOT" | "EXPORT" | "LOG" | "ATTESTATION" | "CONFIG" | "REPORT" | "OTHER";
    daysAgoCollected: number;
  };
  const ev: EvBp[] = [
    { ctrlExtId: "SEED-CC6.1", title: "[seed] MFA enrollment report — Okta export",
      description: "100% of platform admins enrolled with WebAuthn or TOTP",
      source: "AUTO", collector: "Okta", kind: "EXPORT", daysAgoCollected: 8 },
    { ctrlExtId: "SEED-CC6.1", title: "[seed] MFA challenge screenshot",
      description: "Login flow showing TOTP prompt", source: "MANUAL",
      collector: "Manual upload", kind: "SCREENSHOT", daysAgoCollected: 30 },
    { ctrlExtId: "SEED-CC6.2", title: "[seed] RBAC role review attestation Q1",
      description: "All staff roles reviewed by CISO; 4 over-privileged accounts demoted",
      source: "MANUAL", collector: "Manual upload", kind: "ATTESTATION", daysAgoCollected: 14 },
    { ctrlExtId: "SEED-CC7.2", title: "[seed] AuditLog hash-chain verifier output",
      description: "Weekly cron run — chain intact for last 365 days",
      source: "AUTO", collector: "Internal cron", kind: "LOG", daysAgoCollected: 1 },
    { ctrlExtId: "SEED-CC7.4", title: "[seed] Snyk weekly summary",
      description: "Last week: 0 critical, 2 high, 6 medium",
      source: "AUTO", collector: "Snyk", kind: "REPORT", daysAgoCollected: 1 },
    { ctrlExtId: "SEED-CC8.1", title: "[seed] GitHub branch-protection screenshot",
      description: "main branch — required reviewers ≥1, status checks required",
      source: "AUTO", collector: "GitHub", kind: "SCREENSHOT", daysAgoCollected: 4 },
    { ctrlExtId: "SEED-CC8.1", title: "[seed] CI pipeline config",
      description: "GitHub Actions workflow gating deploys",
      source: "AUTO", collector: "GitHub", kind: "CONFIG", daysAgoCollected: 4 },
    { ctrlExtId: "SEED-CC9.1", title: "[seed] AWS KMS key policy + rotation history",
      description: "AES-256-GCM with 90-day rotation; last rotated 34d ago",
      source: "AUTO", collector: "AWS CloudTrail", kind: "EXPORT", daysAgoCollected: 5 },
    { ctrlExtId: "SEED-CC9.1", title: "[seed] TLS Labs A+ rating",
      description: "Current grade: A+; HSTS enforced", source: "MANUAL",
      collector: "Manual upload", kind: "SCREENSHOT", daysAgoCollected: 22 },
    { ctrlExtId: "SEED-A.16.1", title: "[seed] Q4 tabletop exercise minutes",
      description: "Simulated ransomware scenario; 14 action items closed",
      source: "MANUAL", collector: "Manual upload", kind: "REPORT", daysAgoCollected: 95 },
    { ctrlExtId: "SEED-A.17.1", title: "[seed] DR restore test — 2026-Q1",
      description: "Restored prod snapshot to staging in 2h 47m (RTO target 4h)",
      source: "MANUAL", collector: "Manual upload", kind: "REPORT", daysAgoCollected: 220 },
    { ctrlExtId: "SEED-A.7.2", title: "[seed] Background-check provider attestation",
      description: "Q1 batch — 3 new hires cleared", source: "MANUAL",
      collector: "Checkr", kind: "ATTESTATION", daysAgoCollected: 60 },
    { ctrlExtId: "SEED-GDPR-30", title: "[seed] ROPA — Q1 export",
      description: "Article 30 record exported as CSV", source: "MANUAL",
      collector: "Manual upload", kind: "EXPORT", daysAgoCollected: 30 },
    { ctrlExtId: "SEED-GDPR-32", title: "[seed] TOMs document v3.2",
      description: "Updated to reflect new pen-test findings", source: "MANUAL",
      collector: "Manual upload", kind: "REPORT", daysAgoCollected: 70 },
    { ctrlExtId: "SEED-VEN-1", title: "[seed] Vendor onboarding checklist — current",
      description: "12-step checklist exported from internal CRM", source: "AUTO",
      collector: "Manual upload", kind: "EXPORT", daysAgoCollected: 12 },
    { ctrlExtId: "SEED-RISK-1", title: "[seed] Risk register — annual review minutes",
      description: "All 32 risks reviewed; 4 status changes", source: "MANUAL",
      collector: "Manual upload", kind: "REPORT", daysAgoCollected: 320 },
    { ctrlExtId: "SEED-SDL-1", title: "[seed] TruffleHog config + recent run log",
      description: "Pre-commit + push hooks; 1 detection auto-blocked last week",
      source: "AUTO", collector: "GitHub Adv. Security", kind: "LOG", daysAgoCollected: 6 },
    { ctrlExtId: "SEED-CC6.6", title: "[seed] Session lifetime config screenshot",
      description: "NextAuth session configured for 12h max", source: "AUTO",
      collector: "Manual upload", kind: "CONFIG", daysAgoCollected: 6 },
    { ctrlExtId: "SEED-IR-2", title: "[seed] AuditLog retention dashboard",
      description: "365-day retention shown in admin dashboard", source: "AUTO",
      collector: "Datadog", kind: "SCREENSHOT", daysAgoCollected: 4 },
    { ctrlExtId: "SEED-CC9.1", title: "[seed] Datadog TLS metric panel",
      description: "TLS 1.3 negotiation rate >99.99% for last 30d", source: "AUTO",
      collector: "Datadog", kind: "SCREENSHOT", daysAgoCollected: 9 },
    { ctrlExtId: "SEED-GDPR-33", title: "[seed] Breach notification runbook v2.0",
      description: "Includes DPA-defined notification template + on-call paths",
      source: "MANUAL", collector: "Manual upload", kind: "OTHER", daysAgoCollected: 110 },
  ];
  await db.controlEvidence.createMany({
    data: ev.map((e) => ({
      controlId: ctrlIdByExtId.get(e.ctrlExtId)!,
      title: e.title,
      description: e.description,
      source: e.source,
      collector: e.collector,
      kind: e.kind,
      fileBytes: Math.floor(Math.random() * 800_000) + 50_000,
      collectedAt: daysAgo(e.daysAgoCollected),
    })),
  });
  // Update cached evidenceCount per control.
  for (const [extId, id] of ctrlIdByExtId) {
    const c = ev.filter((x) => x.ctrlExtId === extId).length;
    await db.complianceControl.update({ where: { id }, data: { evidenceCount: c } });
  }

  // 4. Policies (~10) with sample acknowledgments.
  type PolBp = {
    slug: string; title: string; description: string; body: string;
    version: string;
    status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "RETIRED";
    owner: string;
    distribution: string;
    lastApprovedDays?: number;
    lastReviewedDays?: number;
    nextReviewDays?: number;
    ackPct: number;
  };
  const policies: PolBp[] = [
    { slug: "seed-information-security",
      title: "Information Security Policy", version: "3.4", status: "APPROVED",
      description: "Foundational policy describing the security program.",
      body: "## Purpose\n\nDescribes the Flowtora security program — scope, roles, lifecycle.\n\n## Scope\nAll staff, contractors, and systems.\n\n## Roles\n- **CISO** — accountable.\n- **Security Engineering** — implements.\n\n## Review\nReviewed annually.",
      owner: "ciso@flowtora.com", distribution: "All staff",
      lastApprovedDays: 90, lastReviewedDays: 30, nextReviewDays: 275, ackPct: 0.95 },
    { slug: "seed-access-control",
      title: "Access Control Policy", version: "2.7", status: "APPROVED",
      description: "RBAC, MFA, and joiner-mover-leaver process.",
      body: "## RBAC\n- Least privilege.\n- Quarterly access reviews.\n\n## MFA\nWebAuthn/TOTP required for all admin accounts.\n\n## JML\n- Joiner: provisioned with role from HR.\n- Mover: re-evaluated within 7 days.\n- Leaver: revoked within 24h.",
      owner: "ciso@flowtora.com", distribution: "All staff",
      lastApprovedDays: 110, nextReviewDays: 255, ackPct: 0.90 },
    { slug: "seed-acceptable-use",
      title: "Acceptable Use Policy", version: "1.9", status: "APPROVED",
      description: "Rules for use of company devices and accounts.",
      body: "## Devices\n- Company laptops MDM-enrolled.\n- Disk encryption required.\n\n## Accounts\n- No password reuse.\n- Report phishing immediately.",
      owner: "people@flowtora.com", distribution: "All staff",
      lastApprovedDays: 200, nextReviewDays: 165, ackPct: 0.85 },
    { slug: "seed-incident-response",
      title: "Incident Response Plan", version: "2.1", status: "APPROVED",
      description: "Triage, containment, eradication, recovery, lessons-learned.",
      body: "## Triage\nOn-call assesses severity.\n\n## Roles\n- IC, scribe, comms.\n\n## Postmortem\nBlameless. Published within 7d.",
      owner: "ciso@flowtora.com", distribution: "Engineering + Support",
      lastApprovedDays: 60, nextReviewDays: 305, ackPct: 0.80 },
    { slug: "seed-bcp-dr",
      title: "Business Continuity & Disaster Recovery", version: "1.5", status: "APPROVED",
      description: "RTO 4h, RPO 1h. Annual restore drill.",
      body: "## Objectives\n- RTO: 4h\n- RPO: 1h\n\n## Test cadence\n- Quarterly tabletop\n- Annual full restore",
      owner: "operations@flowtora.com", distribution: "Engineering + Operations",
      lastApprovedDays: 220, nextReviewDays: 145, ackPct: 0.65 },
    { slug: "seed-data-retention",
      title: "Data Retention & Deletion", version: "1.2", status: "IN_REVIEW",
      description: "Retention windows and deletion procedures.",
      body: "## Tenant data\n- 90 days after cancellation, then deleted.\n\n## Audit logs\n- 365 days minimum.\n\n## Backups\n- 30-day rolling window.",
      owner: "dpo@flowtora.com", distribution: "All staff",
      lastReviewedDays: 14, nextReviewDays: 351, ackPct: 0.45 },
    { slug: "seed-encryption",
      title: "Encryption Policy", version: "2.0", status: "APPROVED",
      description: "Approved algorithms + key management.",
      body: "## At rest\nAES-256-GCM via AWS KMS.\n\n## In transit\nTLS 1.3.\n\n## Rotation\n90 days for data-encryption keys.",
      owner: "security-eng@flowtora.com", distribution: "Engineering",
      lastApprovedDays: 75, nextReviewDays: 290, ackPct: 0.95 },
    { slug: "seed-vendor-management",
      title: "Vendor Management Policy", version: "1.3", status: "APPROVED",
      description: "Onboarding + ongoing review of third parties.",
      body: "## Onboarding\nCAIQ-Lite + SOC 2 review required for any vendor processing PII.\n\n## Ongoing\nAnnual review.",
      owner: "procurement@flowtora.com", distribution: "Procurement + Engineering",
      lastApprovedDays: 130, nextReviewDays: 235, ackPct: 0.70 },
    { slug: "seed-secure-sdlc",
      title: "Secure SDLC Policy", version: "2.4", status: "APPROVED",
      description: "Security checkpoints across the dev lifecycle.",
      body: "## Phases\n- Design: threat model.\n- Code: review + secret scanning.\n- Deploy: sign-off + canary.",
      owner: "engineering-lead@flowtora.com", distribution: "Engineering",
      lastApprovedDays: 45, nextReviewDays: 320, ackPct: 0.85 },
    { slug: "seed-vulnerability-management",
      title: "Vulnerability Management Policy", version: "1.6", status: "DRAFT",
      description: "Scan cadence, severity SLAs, exception process.",
      body: "## SLA\n- Critical: 7d\n- High: 30d\n- Medium: 60d\n- Low: 90d",
      owner: "security-eng@flowtora.com", distribution: "Engineering + Operations",
      ackPct: 0 },
  ];
  for (const p of policies) {
    const saved = await db.compliancePolicy.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug, title: p.title, description: p.description, body: p.body,
        version: p.version, status: p.status,
        ownerEmail: p.owner, distribution: p.distribution,
        lastApprovedAt: p.lastApprovedDays != null ? daysAgo(p.lastApprovedDays) : null,
        lastReviewedAt: p.lastReviewedDays != null ? daysAgo(p.lastReviewedDays) : null,
        nextReviewAt:   p.nextReviewDays   != null ? daysAgo(-p.nextReviewDays)  : null,
      },
      update: {
        title: p.title, description: p.description, body: p.body,
        version: p.version, status: p.status,
        ownerEmail: p.owner, distribution: p.distribution,
        lastApprovedAt: p.lastApprovedDays != null ? daysAgo(p.lastApprovedDays) : null,
        lastReviewedAt: p.lastReviewedDays != null ? daysAgo(p.lastReviewedDays) : null,
        nextReviewAt:   p.nextReviewDays   != null ? daysAgo(-p.nextReviewDays)  : null,
      },
      select: { id: true, version: true },
    });
    // Synthesize acknowledgments from a fixed pool of seed-staff emails.
    const pool = [
      "owner@flowtora.com", "ciso@flowtora.com", "dpo@flowtora.com",
      "security-eng@flowtora.com", "engineering-lead@flowtora.com",
      "operations@flowtora.com", "people@flowtora.com",
      "procurement@flowtora.com", "support-lead@flowtora.com", "billing@flowtora.com",
    ];
    const targetCount = Math.round(pool.length * p.ackPct);
    const picked = sample(pool, targetCount);
    if (picked.length > 0) {
      await db.policyAcknowledgment.createMany({
        data: picked.map((email) => ({
          policyId: saved.id,
          userEmail: email,
          userName: email.split("@")[0]!,
          policyVersion: saved.version,
          acknowledgedAt: daysAgo(randInt(1, 60)),
        })),
        skipDuplicates: true,
      });
    }
  }

  // 5. Sub-processors (~9 — mostly real names).
  type SpBp = {
    name: string; purpose: string; dataLocation: string;
    riskTier: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    websiteUrl?: string; privacyUrl?: string;
    dpaOnFile: boolean;
    certs: Array<"SOC2_TYPE_II" | "ISO_27001" | "GDPR_DPA" | "PCI_DSS" | "HIPAA_BAA" | "FEDRAMP_MODERATE" | "TRUSTED_CLOUD" | "HITRUST">;
    publiclyListed?: boolean;
    lastReviewedDays?: number;
    nextReviewDays?: number;
    notes?: string;
  };
  const subProcessors: SpBp[] = [
    { name: "[seed] Amazon Web Services", purpose: "Cloud infrastructure (compute, storage, KMS)",
      dataLocation: "us-east-1 / eu-west-1", riskTier: "CRITICAL",
      websiteUrl: "https://aws.amazon.com",
      privacyUrl: "https://aws.amazon.com/privacy",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "ISO_27001", "PCI_DSS", "HIPAA_BAA", "FEDRAMP_MODERATE"],
      publiclyListed: true, lastReviewedDays: 60, nextReviewDays: 305 },
    { name: "[seed] Neon Database",
      purpose: "Managed Postgres database hosting",
      dataLocation: "us-east-1 (AWS)", riskTier: "CRITICAL",
      websiteUrl: "https://neon.tech",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "GDPR_DPA"],
      publiclyListed: true, lastReviewedDays: 70, nextReviewDays: 295 },
    { name: "[seed] Vercel",
      purpose: "Application hosting + edge network",
      dataLocation: "Global edge (US/EU)", riskTier: "HIGH",
      websiteUrl: "https://vercel.com",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "ISO_27001", "GDPR_DPA"],
      publiclyListed: true, lastReviewedDays: 80, nextReviewDays: 285 },
    { name: "[seed] Stripe",
      purpose: "Subscription billing + payment processing",
      dataLocation: "Global", riskTier: "CRITICAL",
      websiteUrl: "https://stripe.com",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "ISO_27001", "PCI_DSS"],
      publiclyListed: true, lastReviewedDays: 100, nextReviewDays: 265 },
    { name: "[seed] Resend",
      purpose: "Transactional email delivery",
      dataLocation: "us-east-1 (AWS)", riskTier: "MEDIUM",
      websiteUrl: "https://resend.com",
      dpaOnFile: true, certs: ["SOC2_TYPE_II"],
      publiclyListed: true, lastReviewedDays: 90, nextReviewDays: 275 },
    { name: "[seed] Sentry",
      purpose: "Error tracking + performance monitoring",
      dataLocation: "us-east-1 (AWS)", riskTier: "MEDIUM",
      websiteUrl: "https://sentry.io",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "ISO_27001"],
      publiclyListed: true, lastReviewedDays: 110, nextReviewDays: 255 },
    { name: "[seed] PagerDuty",
      purpose: "On-call paging + incident management",
      dataLocation: "us-east-1 (AWS)", riskTier: "MEDIUM",
      websiteUrl: "https://pagerduty.com",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "ISO_27001"],
      publiclyListed: false, lastReviewedDays: 130, nextReviewDays: 235 },
    { name: "[seed] Cloudflare",
      purpose: "DNS + edge security (WAF, DDoS)",
      dataLocation: "Global", riskTier: "HIGH",
      websiteUrl: "https://cloudflare.com",
      dpaOnFile: true, certs: ["SOC2_TYPE_II", "ISO_27001", "PCI_DSS"],
      publiclyListed: true, lastReviewedDays: 50, nextReviewDays: 315 },
    { name: "[seed] HelpScout",
      purpose: "Customer support inbox + KB",
      dataLocation: "us-east-1 (AWS)", riskTier: "LOW",
      websiteUrl: "https://helpscout.com",
      dpaOnFile: false, certs: ["SOC2_TYPE_II"],
      publiclyListed: true, lastReviewedDays: 200, nextReviewDays: 165,
      notes: "DPA pending counter-signature from vendor side." },
  ];
  await db.subProcessor.createMany({
    data: subProcessors.map((s) => ({
      name: s.name, purpose: s.purpose, dataLocation: s.dataLocation,
      riskTier: s.riskTier,
      websiteUrl: s.websiteUrl ?? null,
      privacyUrl: s.privacyUrl ?? null,
      dpaOnFile: s.dpaOnFile,
      certifications: s.certs,
      publiclyListed: s.publiclyListed ?? true,
      lastReviewedAt: s.lastReviewedDays != null ? daysAgo(s.lastReviewedDays) : null,
      nextReviewAt:   s.nextReviewDays   != null ? daysAgo(-s.nextReviewDays)  : null,
      notes: s.notes ?? null,
    })),
  });

  // 6. Tenant DPAs — one per tenant with mixed status.
  const dpaStatuses = ["SIGNED", "PENDING_TENANT_SIGNATURE", "REQUESTED"] as const;
  for (let i = 0; i < tenants.length; i++) {
    const t = tenants[i]!;
    const status = dpaStatuses[i % dpaStatuses.length]!;
    const isSigned = status === "SIGNED";
    await db.tenantDpa.upsert({
      where: { tenantId: t.id },
      create: {
        tenantId: t.id,
        status,
        templateVersion: "2026-Q1",
        requestedAt: daysAgo(60),
        signedAt: isSigned ? daysAgo(45) : null,
        countersignedAt: isSigned ? daysAgo(43) : null,
        expiresAt: isSigned ? daysAgo(-685) : null,
        pdfUrl: isSigned ? `https://docs.flowtora.com/dpas/${t.slug}-2026.pdf` : null,
        tenantSignerName: isSigned ? `${t.name} Counsel` : null,
        tenantSignerEmail: isSigned ? `legal@${t.slug}.example` : null,
        tenantSignerTitle: isSigned ? "General Counsel" : null,
      },
      update: {
        status,
        templateVersion: "2026-Q1",
      },
    });
  }

  // 7. Risk register (~10 risks with mitigations).
  type RiskBp = {
    extId: string; title: string; owner: string;
    likelihood: "RARE" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "ALMOST_CERTAIN";
    impact:     "NEGLIGIBLE" | "MINOR" | "MODERATE" | "MAJOR" | "SEVERE";
    residualLikelihood: "RARE" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "ALMOST_CERTAIN";
    residualImpact:     "NEGLIGIBLE" | "MINOR" | "MODERATE" | "MAJOR" | "SEVERE";
    status: "IDENTIFIED" | "PLANNED" | "IN_PROGRESS" | "MITIGATED" | "ACCEPTED";
    mitigation: string;
    description?: string;
    controlExternalId?: string;
    nextReviewDays: number;
  };
  const RANK = { RARE: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, ALMOST_CERTAIN: 5 } as const;
  const IRANK = { NEGLIGIBLE: 1, MINOR: 2, MODERATE: 3, MAJOR: 4, SEVERE: 5 } as const;
  const risks: RiskBp[] = [
    { extId: "SEED-RISK-001", title: "[seed] Compromise of platform admin credentials",
      owner: "ciso@flowtora.com",
      likelihood: "POSSIBLE", impact: "SEVERE",
      residualLikelihood: "RARE", residualImpact: "MAJOR",
      status: "IN_PROGRESS",
      mitigation: "Mandatory WebAuthn/TOTP MFA, conditional access from corporate IPs, leaked-cred monitoring.",
      controlExternalId: "SEED-CC6.1", nextReviewDays: 30 },
    { extId: "SEED-RISK-002", title: "[seed] Database backup corruption",
      owner: "operations@flowtora.com",
      likelihood: "UNLIKELY", impact: "SEVERE",
      residualLikelihood: "RARE", residualImpact: "MAJOR",
      status: "MITIGATED",
      mitigation: "Daily integrity verification, quarterly restore test, off-region backups.",
      controlExternalId: "SEED-A.17.1", nextReviewDays: 90 },
    { extId: "SEED-RISK-003", title: "[seed] Sub-processor data breach (Stripe / Neon / Resend)",
      owner: "ciso@flowtora.com",
      likelihood: "POSSIBLE", impact: "MAJOR",
      residualLikelihood: "UNLIKELY", residualImpact: "MODERATE",
      status: "ACCEPTED",
      mitigation: "Vendor reviews, contractual audit rights, data-minimization. Residual accepted.",
      nextReviewDays: 180 },
    { extId: "SEED-RISK-004", title: "[seed] Insider threat — disgruntled engineer with prod access",
      owner: "people@flowtora.com",
      likelihood: "RARE", impact: "MAJOR",
      residualLikelihood: "RARE", residualImpact: "MODERATE",
      status: "IN_PROGRESS",
      mitigation: "Background checks, audit-log monitoring, separation of duties, exit revocation SLA <24h.",
      controlExternalId: "SEED-A.7.2", nextReviewDays: 60 },
    { extId: "SEED-RISK-005", title: "[seed] DDoS-induced multi-day outage",
      owner: "operations@flowtora.com",
      likelihood: "UNLIKELY", impact: "MAJOR",
      residualLikelihood: "RARE", residualImpact: "MINOR",
      status: "MITIGATED",
      mitigation: "Cloudflare WAF + rate-limiting; Vercel autoscaling; tested runbook.",
      nextReviewDays: 120 },
    { extId: "SEED-RISK-006", title: "[seed] Critical CVE in core dependency (next.js / prisma)",
      owner: "engineering-lead@flowtora.com",
      likelihood: "LIKELY", impact: "MAJOR",
      residualLikelihood: "UNLIKELY", residualImpact: "MODERATE",
      status: "IN_PROGRESS",
      mitigation: "Snyk / Dependabot weekly + patch SLA: critical 7d, high 30d.",
      controlExternalId: "SEED-CC7.4", nextReviewDays: 14 },
    { extId: "SEED-RISK-007", title: "[seed] GDPR enforcement action over data transfer",
      owner: "dpo@flowtora.com",
      likelihood: "UNLIKELY", impact: "MAJOR",
      residualLikelihood: "RARE", residualImpact: "MODERATE",
      status: "MITIGATED",
      mitigation: "EU data-residency option, SCCs in DPAs, no transfers outside adequacy zones.",
      controlExternalId: "SEED-GDPR-32", nextReviewDays: 90 },
    { extId: "SEED-RISK-008", title: "[seed] Misconfigured S3 bucket exposing tenant proofs",
      owner: "security-eng@flowtora.com",
      likelihood: "POSSIBLE", impact: "MAJOR",
      residualLikelihood: "UNLIKELY", residualImpact: "MINOR",
      status: "MITIGATED",
      mitigation: "Bucket-policy linter in CI, AWS Config rules, automated remediation.",
      nextReviewDays: 60 },
    { extId: "SEED-RISK-009", title: "[seed] Phishing of finance team to wire funds",
      owner: "people@flowtora.com",
      likelihood: "POSSIBLE", impact: "MODERATE",
      residualLikelihood: "RARE", residualImpact: "MODERATE",
      status: "PLANNED",
      mitigation: "Quarterly phishing simulations + dual-control approvals on wires >$5k.",
      nextReviewDays: 30 },
    { extId: "SEED-RISK-010", title: "[seed] Loss of CISO without succession plan",
      owner: "ceo@flowtora.com",
      likelihood: "UNLIKELY", impact: "MODERATE",
      residualLikelihood: "RARE", residualImpact: "MINOR",
      status: "IDENTIFIED",
      mitigation: "Documented playbook + cross-training. Recruit deputy CISO.",
      nextReviewDays: 180 },
  ];
  await db.riskRegisterItem.createMany({
    data: risks.map((r) => ({
      externalId: r.extId,
      title: r.title,
      description: r.description ?? null,
      ownerEmail: r.owner,
      likelihood: r.likelihood,
      impact: r.impact,
      score: RANK[r.likelihood] * IRANK[r.impact],
      residualScore: RANK[r.residualLikelihood] * IRANK[r.residualImpact],
      status: r.status,
      mitigation: r.mitigation,
      controlExternalId: r.controlExternalId ?? null,
      reviewedAt: daysAgo(randInt(7, 60)),
      nextReviewAt: daysAgo(-r.nextReviewDays),
    })),
  });

  // 8. Vendor reviews (~6).
  type VrBp = {
    name: string; url?: string; owner: string;
    status: "PENDING_QUESTIONNAIRE" | "IN_REVIEW" | "APPROVED" | "CONDITIONALLY_APPROVED" | "REJECTED" | "ARCHIVED";
    region: string; data: string[];
    certs: Array<"SOC2_TYPE_II" | "ISO_27001" | "GDPR_DPA" | "PCI_DSS" | "HIPAA_BAA" | "FEDRAMP_MODERATE" | "TRUSTED_CLOUD" | "HITRUST">;
    score?: number;
    soc2?: string;
    nextReviewDays?: number;
  };
  const vendors: VrBp[] = [
    { name: "[seed] Snyk",
      url: "https://snyk.io", owner: "security-eng@flowtora.com",
      status: "APPROVED", region: "us-east-1",
      data: ["dependency metadata"], certs: ["SOC2_TYPE_II", "ISO_27001"],
      score: 92,
      soc2: "https://docs.flowtora.com/vendor-soc2/snyk.pdf",
      nextReviewDays: 305 },
    { name: "[seed] Linear",
      url: "https://linear.app", owner: "engineering-lead@flowtora.com",
      status: "APPROVED", region: "us-east-1",
      data: ["issue metadata"], certs: ["SOC2_TYPE_II"],
      score: 86, nextReviewDays: 275 },
    { name: "[seed] Notion",
      url: "https://notion.so", owner: "people@flowtora.com",
      status: "CONDITIONALLY_APPROVED", region: "Global",
      data: ["internal docs"], certs: ["SOC2_TYPE_II", "ISO_27001"],
      score: 74, nextReviewDays: 60,
      soc2: "https://docs.flowtora.com/vendor-soc2/notion.pdf" },
    { name: "[seed] Loom",
      url: "https://loom.com", owner: "support-lead@flowtora.com",
      status: "IN_REVIEW", region: "us-east-1",
      data: ["screen recordings"], certs: ["SOC2_TYPE_II"],
      score: 68 },
    { name: "[seed] Calendly",
      url: "https://calendly.com", owner: "sales-ops@flowtora.com",
      status: "PENDING_QUESTIONNAIRE", region: "us-east-1",
      data: ["scheduling metadata"], certs: ["SOC2_TYPE_II"] },
    { name: "[seed] Figma",
      url: "https://figma.com", owner: "design-lead@flowtora.com",
      status: "APPROVED", region: "us-east-1",
      data: ["design assets"], certs: ["SOC2_TYPE_II", "ISO_27001"],
      score: 90, nextReviewDays: 295 },
    { name: "[seed] LegacyTool Inc.",
      url: "https://legacy.example", owner: "operations@flowtora.com",
      status: "REJECTED", region: "us-west-2",
      data: ["customer PII"], certs: [],
      score: 32 },
  ];
  await db.vendorReview.createMany({
    data: vendors.map((v) => ({
      vendorName: v.name, vendorUrl: v.url ?? null, ownerEmail: v.owner,
      status: v.status, region: v.region,
      dataCategories: v.data, certifications: v.certs,
      questionnaireBody: null,
      questionnaireScore: v.score ?? null,
      soc2Url: v.soc2 ?? null,
      contractUrl: null,
      approvedAt: v.status === "APPROVED" || v.status === "CONDITIONALLY_APPROVED" ? daysAgo(randInt(20, 200)) : null,
      rejectedReason: v.status === "REJECTED"
        ? "No SOC 2; insufficient encryption-at-rest controls. Recommended alternative."
        : null,
      nextReviewAt: v.nextReviewDays != null ? daysAgo(-v.nextReviewDays) : null,
    })),
  });

  // 9. Compliance reports — 3 sample audit packages.
  await db.complianceReport.createMany({
    data: [
      { kind: "SOC2_TYPE_II_PACKAGE",
        title: "[seed] SOC 2 Type II 2025 audit package",
        frameworkId: fwIdByKey.get("SOC2_TYPE_II")!,
        status: "READY",
        periodStart: daysAgo(460),
        periodEnd:   daysAgo(95),
        pdfUrl: "https://docs.flowtora.com/audits/soc2-type-ii-2025.pdf",
        zipUrl: "https://docs.flowtora.com/audits/soc2-type-ii-2025.zip",
        bytes: 4_200_000,
        deliveredTo: "auditor@prescient-assurance.example",
        deliveredAt: daysAgo(94),
        notes: "Final report — no qualified opinions." },
      { kind: "ISO_27001_STATEMENT_OF_APPLICABILITY",
        title: "[seed] ISO 27001 Statement of Applicability — 2026",
        frameworkId: fwIdByKey.get("ISO_27001")!,
        status: "READY",
        periodStart: daysAgo(180), periodEnd: daysAgo(0),
        pdfUrl: "https://docs.flowtora.com/audits/iso27001-soa-2026.pdf",
        bytes: 2_800_000,
        notes: "All Annex A controls evaluated; 4 marked NOT_APPLICABLE with justification." },
      { kind: "GDPR_ARTICLE_30_RECORD",
        title: "[seed] GDPR Article 30 Record — Q1 2026",
        frameworkId: fwIdByKey.get("GDPR")!,
        status: "READY",
        periodStart: daysAgo(90), periodEnd: daysAgo(0),
        pdfUrl: "https://docs.flowtora.com/audits/ropa-2026-q1.pdf",
        bytes: 1_900_000 },
      { kind: "CUSTOM",
        title: "[seed] Penetration Test Executive Summary 2026-Q1",
        frameworkId: null,
        status: "DELIVERED",
        periodStart: daysAgo(120), periodEnd: daysAgo(95),
        pdfUrl: "https://docs.flowtora.com/audits/pentest-2026-q1-summary.pdf",
        bytes: 1_100_000,
        deliveredTo: "compliance@flowtora.com",
        deliveredAt: daysAgo(90) },
    ],
  });

  console.log(
    `  ✓ ${frameworks.length} frameworks, ${controls.length} controls, ${ev.length} evidence rows, ${policies.length} policies, ${subProcessors.length} sub-processors, ${tenants.length} tenant DPAs, ${risks.length} risks, ${vendors.length} vendor reviews, 4 reports`,
  );
}

/* ── Page 52 — Data Privacy Requests seed ─────────────── */

async function seedPrivacyRequests(
  staff: { id: string; email: string; name: string | null }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding Privacy Requests (Page 52)…");

  type ReqBp = {
    extId: string;
    type: "ACCESS_EXPORT" | "DELETION" | "RECTIFICATION" | "RESTRICTION" | "OBJECTION" | "PORTABILITY" | "OPT_OUT_OF_SALE";
    jurisdiction: "GDPR" | "UK_GDPR" | "CCPA" | "CPRA" | "LGPD" | "PIPEDA" | "OTHER";
    source: "TENANT_PORTAL" | "EMAIL" | "WEB_FORM" | "PHONE" | "API";
    status: "RECEIVED" | "AWAITING_VERIFICATION" | "VERIFIED" | "IN_PROGRESS" | "AWAITING_LEGAL_HOLD_REVIEW" | "AWAITING_SUBJECT_INFO" | "COMPLETED" | "REJECTED" | "WITHDRAWN";
    verification: "PENDING" | "VERIFIED" | "FAILED" | "WAIVED";
    subjectName: string;
    subjectEmail: string;
    subjectIdentifier?: string;
    tenantIdx?: number;
    receivedDaysAgo: number;
    verifiedDaysAgo?: number;
    completedDaysAgo?: number;
    rejectedDaysAgo?: number;
    rejectedReason?: string;
    legalHold?: boolean;
    legalHoldReason?: string;
    intakeNotes?: string;
    internalNotes?: string;
    exportGenerated?: boolean;
    finalReportGenerated?: boolean;
    assignedToIdx?: number;
    scopes?: Array<{
      system: "POSTGRES" | "S3" | "STRIPE" | "RESEND" | "SENTRY" | "AUDIT_LOG" | "TENANT_CACHE" | "SUPPORT_INBOX" | "ANALYTICS" | "WEBHOOKS" | "OTHER";
      status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | "SKIPPED";
      records: number;
      bytes: number;
      daysAgoLastRun?: number;
    }>;
    messages?: Array<{
      direction: "INBOUND" | "OUTBOUND";
      channel: "EMAIL" | "PORTAL" | "PHONE" | "IN_APP";
      subject?: string;
      body: string;
      daysAgo: number;
    }>;
    verifications?: Array<{
      method: "ID_UPLOAD" | "EMAIL_LINK" | "MFA_CHALLENGE" | "SECURITY_QUESTIONS" | "VIDEO_CALL" | "KNOWN_AUTH_SESSION";
      status: "PENDING" | "VERIFIED" | "FAILED" | "WAIVED";
      notes?: string;
      daysAgo: number;
    }>;
    audit?: Array<{
      action: string;
      details: string;
      daysAgo: number;
    }>;
  };

  const now = new Date();
  const reviewer = staff[0]!;
  const dpoEmail = "dpo@flowtora.com";

  const reqs: ReqBp[] = [
    {
      extId: "DSR-SEED-2026-0001",
      type: "ACCESS_EXPORT", jurisdiction: "GDPR", source: "EMAIL",
      status: "COMPLETED", verification: "VERIFIED",
      subjectName: "Anja Berger", subjectEmail: "anja.berger@example.de",
      subjectIdentifier: "tenant-customer:abc-1234",
      tenantIdx: 0,
      receivedDaysAgo: 22, verifiedDaysAgo: 21, completedDaysAgo: 14,
      assignedToIdx: 0,
      intakeNotes: "Hello, I would like a copy of all personal data you hold about me. — Anja",
      internalNotes: "Tenant confirmed Anja is an active end-customer. Standard export.",
      exportGenerated: true, finalReportGenerated: true,
      scopes: [
        { system: "POSTGRES",     status: "COMPLETE", records: 187, bytes: 412_000, daysAgoLastRun: 18 },
        { system: "S3",           status: "COMPLETE", records: 14,  bytes: 6_400_000, daysAgoLastRun: 18 },
        { system: "STRIPE",       status: "COMPLETE", records: 9,   bytes: 38_000, daysAgoLastRun: 18 },
        { system: "RESEND",       status: "COMPLETE", records: 23,  bytes: 14_000, daysAgoLastRun: 18 },
        { system: "AUDIT_LOG",    status: "COMPLETE", records: 412, bytes: 220_000, daysAgoLastRun: 18 },
      ],
      messages: [
        { direction: "INBOUND",  channel: "EMAIL", subject: "Subject Access Request",
          body: "Hello, I am writing to request a copy of all my personal data under Article 15 GDPR. Please respond within the legal timeframe.",
          daysAgo: 22 },
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0001 — verification needed",
          body: "Thank you for your request. To verify your identity we have sent a one-time link to anja.berger@example.de. Please click it within 7 days.",
          daysAgo: 22 },
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0001 — your data export is ready",
          body: "Your export is ready. The download link is valid for 7 days and is encrypted with a password we will send separately.",
          daysAgo: 14 },
      ],
      verifications: [
        { method: "EMAIL_LINK", status: "VERIFIED", notes: "Subject clicked one-time link from corporate email.", daysAgo: 21 },
      ],
      audit: [
        { action: "request.received",            details: "Intake from email",                                daysAgo: 22 },
        { action: "verification.email_sent",     details: "Verification email link sent",                     daysAgo: 22 },
        { action: "verification.verified",       details: "Subject clicked verification link from same email", daysAgo: 21 },
        { action: "scope.completed",             details: "5 systems queried · 645 records · 7.1 MB",          daysAgo: 18 },
        { action: "export.generated",            details: "Encrypted ZIP bundle generated; 7-day delivery link issued", daysAgo: 14 },
        { action: "report.generated",            details: "Final report PDF generated; request marked completed",        daysAgo: 14 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0002",
      type: "DELETION", jurisdiction: "CCPA", source: "WEB_FORM",
      status: "AWAITING_LEGAL_HOLD_REVIEW", verification: "VERIFIED",
      subjectName: "Marcus Chen", subjectEmail: "mchen@example.com",
      tenantIdx: 1,
      receivedDaysAgo: 9, verifiedDaysAgo: 8,
      legalHold: true, legalHoldReason: "Subject has an active dispute (Case 2026-DSP-014). Hold deletion until resolved.",
      assignedToIdx: 0,
      intakeNotes: "Please delete all my account data immediately.",
      internalNotes: "Active billing dispute — held by Compliance counsel.",
      scopes: [
        { system: "POSTGRES",     status: "COMPLETE", records: 312, bytes: 540_000, daysAgoLastRun: 7 },
        { system: "STRIPE",       status: "COMPLETE", records: 18,  bytes: 70_000,  daysAgoLastRun: 7 },
        { system: "AUDIT_LOG",    status: "SKIPPED",  records: 0,   bytes: 0 },
      ],
      messages: [
        { direction: "INBOUND",  channel: "PORTAL",
          body: "Hi - please delete my account and all related data per CCPA §1798.105. Thanks.",
          daysAgo: 9 },
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0002 — verification + legal hold notice",
          body: "Thank you for your request. We have verified your identity. Please note an active billing dispute is on file; deletion is paused until that is resolved per CCPA §1798.105(d)(1).",
          daysAgo: 7 },
      ],
      verifications: [
        { method: "MFA_CHALLENGE", status: "VERIFIED", notes: "MFA challenge passed via active session.", daysAgo: 8 },
      ],
      audit: [
        { action: "request.received",  details: "Intake from web form",                            daysAgo: 9 },
        { action: "verification.verified", details: "MFA challenge succeeded",                      daysAgo: 8 },
        { action: "scope.completed",   details: "Postgres + Stripe queried",                       daysAgo: 7 },
        { action: "legalHold.set",     details: "Hold applied — Case 2026-DSP-014",                daysAgo: 6 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0003",
      type: "RECTIFICATION", jurisdiction: "GDPR", source: "TENANT_PORTAL",
      status: "IN_PROGRESS", verification: "VERIFIED",
      subjectName: "Sara Karimi", subjectEmail: "sara.karimi@example.fr",
      tenantIdx: 0,
      receivedDaysAgo: 4, verifiedDaysAgo: 3,
      assignedToIdx: 0,
      intakeNotes: "My phone number is wrong (+33 0612345678 should be +33 0698765432). Also surname spelling fixed.",
      scopes: [
        { system: "POSTGRES",     status: "COMPLETE", records: 4, bytes: 1_200, daysAgoLastRun: 2 },
        { system: "TENANT_CACHE", status: "COMPLETE", records: 1, bytes: 200,   daysAgoLastRun: 2 },
      ],
      verifications: [
        { method: "EMAIL_LINK", status: "VERIFIED", daysAgo: 3 },
      ],
      messages: [
        { direction: "INBOUND",  channel: "PORTAL",
          body: "Please correct my phone number and surname.",
          daysAgo: 4 },
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0003 — corrections in flight",
          body: "Thank you. We have logged your corrections and will confirm once propagated.",
          daysAgo: 2 },
      ],
      audit: [
        { action: "request.received", details: "Tenant portal submission",   daysAgo: 4 },
        { action: "verification.verified", details: "Email-link verified",   daysAgo: 3 },
        { action: "scope.completed",  details: "Found 4 records to update", daysAgo: 2 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0004",
      type: "OPT_OUT_OF_SALE", jurisdiction: "CPRA", source: "WEB_FORM",
      status: "COMPLETED", verification: "WAIVED",
      subjectName: "Olivia Perez", subjectEmail: "olivia.p@example.com",
      tenantIdx: 1,
      receivedDaysAgo: 30, completedDaysAgo: 30,
      assignedToIdx: 0,
      intakeNotes: "Opt me out of sale of personal info per CPRA.",
      internalNotes: "We do not sell personal info — confirmed already opted out.",
      scopes: [
        { system: "POSTGRES", status: "COMPLETE", records: 1, bytes: 400, daysAgoLastRun: 30 },
      ],
      verifications: [
        { method: "KNOWN_AUTH_SESSION", status: "WAIVED", notes: "No verification needed — opt-out is a one-step request.", daysAgo: 30 },
      ],
      audit: [
        { action: "request.received", details: "Web form intake",          daysAgo: 30 },
        { action: "verification.waived", details: "Verification waived",   daysAgo: 30 },
        { action: "report.generated",    details: "Confirmation issued",   daysAgo: 30 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0005",
      type: "ACCESS_EXPORT", jurisdiction: "UK_GDPR", source: "EMAIL",
      status: "AWAITING_VERIFICATION", verification: "PENDING",
      subjectName: "James Whitfield", subjectEmail: "j.whitfield@example.co.uk",
      tenantIdx: 0,
      receivedDaysAgo: 2,
      assignedToIdx: 0,
      intakeNotes: "Please send me everything you have.",
      verifications: [
        { method: "EMAIL_LINK", status: "PENDING", notes: "Verification link sent; awaiting click.", daysAgo: 2 },
      ],
      audit: [
        { action: "request.received",       details: "Intake from email",                       daysAgo: 2 },
        { action: "verification.email_sent", details: "Verification email link dispatched",     daysAgo: 2 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0006",
      type: "OBJECTION", jurisdiction: "GDPR", source: "EMAIL",
      status: "RECEIVED", verification: "PENDING",
      subjectName: "Henrik Larsson", subjectEmail: "henrik.l@example.se",
      tenantIdx: 2,
      receivedDaysAgo: 0,
      intakeNotes: "I object to your further processing of my personal data based on legitimate interest. Cite Article 21 GDPR.",
      audit: [
        { action: "request.received", details: "Intake from email", daysAgo: 0 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0007",
      type: "PORTABILITY", jurisdiction: "GDPR", source: "TENANT_PORTAL",
      status: "VERIFIED", verification: "VERIFIED",
      subjectName: "Mikaela Niemi", subjectEmail: "mikaela.n@example.fi",
      tenantIdx: 0,
      receivedDaysAgo: 5, verifiedDaysAgo: 4,
      assignedToIdx: 0,
      intakeNotes: "Please send me my data in a machine-readable format (Article 20).",
      verifications: [
        { method: "MFA_CHALLENGE", status: "VERIFIED", daysAgo: 4 },
      ],
      audit: [
        { action: "request.received",  details: "Tenant portal submission",     daysAgo: 5 },
        { action: "verification.verified", details: "MFA challenge succeeded",  daysAgo: 4 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0008",
      type: "DELETION", jurisdiction: "GDPR", source: "EMAIL",
      status: "REJECTED", verification: "FAILED",
      subjectName: "Unknown Person", subjectEmail: "anon@protonmail.example",
      tenantIdx: 1,
      receivedDaysAgo: 12, rejectedDaysAgo: 10,
      rejectedReason: "Unable to verify identity after 3 failed challenges. Subject not located in any tenant.",
      assignedToIdx: 0,
      intakeNotes: "delete all my data now or I will report you",
      internalNotes: "No account match found — likely test request or impersonation. Multiple verification failures.",
      verifications: [
        { method: "EMAIL_LINK", status: "FAILED", notes: "Verification email bounced.", daysAgo: 11 },
        { method: "ID_UPLOAD",  status: "FAILED", notes: "Subject did not respond.",   daysAgo: 10 },
      ],
      messages: [
        { direction: "INBOUND",  channel: "EMAIL", body: "delete all my data now or I will report you", daysAgo: 12 },
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0008 — verification needed",
          body: "Thank you for contacting Flowtora. We need to verify your identity before processing this request. Please reply with the email associated with your account, or upload a valid ID.",
          daysAgo: 12 },
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0008 — request closed",
          body: "We were unable to verify your identity. The request has been closed. You may submit a new request at any time with verifying information.",
          daysAgo: 10 },
      ],
      audit: [
        { action: "request.received",       details: "Intake from email",        daysAgo: 12 },
        { action: "verification.failed",    details: "Email link bounced",       daysAgo: 11 },
        { action: "verification.failed",    details: "ID upload not received",   daysAgo: 10 },
        { action: "request.status_set.rejected", details: "Closed: verification failed", daysAgo: 10 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0009",
      type: "RESTRICTION", jurisdiction: "LGPD", source: "EMAIL",
      status: "AWAITING_SUBJECT_INFO", verification: "VERIFIED",
      subjectName: "Beatriz Almeida", subjectEmail: "b.almeida@example.br",
      tenantIdx: 1,
      receivedDaysAgo: 6, verifiedDaysAgo: 5,
      assignedToIdx: 0,
      intakeNotes: "I want to restrict processing of my data while my objection is reviewed.",
      internalNotes: "Need clarification on which categories of processing the subject wants restricted.",
      verifications: [
        { method: "EMAIL_LINK", status: "VERIFIED", daysAgo: 5 },
      ],
      messages: [
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0009 — clarification needed",
          body: "Hi Beatriz — to apply restriction correctly, could you tell us which categories of processing you'd like restricted (marketing, analytics, all)?",
          daysAgo: 4 },
      ],
      audit: [
        { action: "request.received",  details: "Intake from email",                  daysAgo: 6 },
        { action: "verification.verified", details: "Email-link verified",            daysAgo: 5 },
        { action: "message.sent",      details: "EMAIL: clarification needed",        daysAgo: 4 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0010",
      type: "ACCESS_EXPORT", jurisdiction: "GDPR", source: "TENANT_PORTAL",
      status: "RECEIVED", verification: "PENDING",
      subjectName: "Ravi Patel", subjectEmail: "ravi.patel@example.in",
      tenantIdx: 2,
      receivedDaysAgo: 1,
      intakeNotes: "Article 15 access — copy in PDF preferred.",
      audit: [
        { action: "request.received", details: "Tenant portal submission", daysAgo: 1 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0011",
      type: "DELETION", jurisdiction: "PIPEDA", source: "PHONE",
      status: "WITHDRAWN", verification: "VERIFIED",
      subjectName: "Émile Tremblay", subjectEmail: "emile.t@example.ca",
      tenantIdx: 0,
      receivedDaysAgo: 35, completedDaysAgo: 33,
      assignedToIdx: 0,
      intakeNotes: "Phone request to delete account — recorded with consent.",
      internalNotes: "Subject called back 2 days later to withdraw the request — wants to keep account.",
      verifications: [
        { method: "SECURITY_QUESTIONS", status: "VERIFIED", notes: "3 of 3 security questions answered correctly over phone.", daysAgo: 35 },
      ],
      messages: [
        { direction: "INBOUND", channel: "PHONE", body: "Phone log: subject requested deletion", daysAgo: 35 },
        { direction: "INBOUND", channel: "PHONE", body: "Phone log: subject withdrew request", daysAgo: 33 },
      ],
      audit: [
        { action: "request.received",      details: "Phone intake",                     daysAgo: 35 },
        { action: "verification.verified", details: "Security questions answered",      daysAgo: 35 },
        { action: "request.status_set.withdrawn", details: "Subject withdrew request",  daysAgo: 33 },
      ],
    },
    {
      extId: "DSR-SEED-2026-0012",
      type: "ACCESS_EXPORT", jurisdiction: "GDPR", source: "EMAIL",
      status: "IN_PROGRESS", verification: "VERIFIED",
      subjectName: "Lina Hofmann", subjectEmail: "lina.hofmann@example.de",
      tenantIdx: 0,
      receivedDaysAgo: 32, verifiedDaysAgo: 31,        // Past SLA — overdue
      assignedToIdx: 0,
      intakeNotes: "Article 15 access request — please send before deadline.",
      internalNotes: "OVERDUE — escalating. Scope discovery for S3 has been hung up on a stale credential. Fixing.",
      scopes: [
        { system: "POSTGRES", status: "COMPLETE", records: 142, bytes: 320_000, daysAgoLastRun: 30 },
        { system: "S3",       status: "FAILED",   records: 0,   bytes: 0,       daysAgoLastRun: 28 },
        { system: "STRIPE",   status: "COMPLETE", records: 6,   bytes: 18_000,  daysAgoLastRun: 30 },
        { system: "RESEND",   status: "COMPLETE", records: 41,  bytes: 22_000,  daysAgoLastRun: 30 },
      ],
      verifications: [
        { method: "EMAIL_LINK", status: "VERIFIED", daysAgo: 31 },
      ],
      messages: [
        { direction: "OUTBOUND", channel: "EMAIL", subject: "DSR-SEED-2026-0012 — extension request",
          body: "We are working on your request and would like to invoke a 60-day extension under Article 12(3) due to complexity. Please confirm you accept.",
          daysAgo: 3 },
      ],
      audit: [
        { action: "request.received",    details: "Email intake",        daysAgo: 32 },
        { action: "verification.verified", details: "Email-link verified", daysAgo: 31 },
        { action: "scope.completed",    details: "Postgres + Stripe + Resend done", daysAgo: 30 },
        { action: "scope.failed",       details: "S3 returned 403 — token expired", daysAgo: 28 },
        { action: "extension.requested", details: "60-day extension requested",      daysAgo: 3 },
      ],
    },
  ];

  // Adjust SLA & set extId externalId values + the actual writes.
  for (const b of reqs) {
    const tenant = b.tenantIdx != null ? tenants[b.tenantIdx] : null;
    const assignee = b.assignedToIdx != null ? staff[b.assignedToIdx % staff.length] : null;
    const slaDays = b.jurisdiction === "CCPA" || b.jurisdiction === "CPRA" ? 45 : 30;
    const receivedAt = daysAgo(b.receivedDaysAgo);
    const slaDeadline = new Date(receivedAt.getTime() + slaDays * 86_400_000);
    const created = await db.privacyRequest.upsert({
      where: { externalId: b.extId },
      create: {
        externalId: b.extId,
        type: b.type,
        jurisdiction: b.jurisdiction,
        source: b.source,
        status: b.status,
        subjectName: b.subjectName,
        subjectEmail: b.subjectEmail,
        subjectIdentifier: b.subjectIdentifier ?? null,
        tenantId: tenant?.id ?? null,
        verificationStatus: b.verification,
        slaDays,
        slaDeadline,
        legalHold: b.legalHold ?? false,
        legalHoldReason: b.legalHoldReason ?? null,
        intakeNotes: b.intakeNotes ?? null,
        internalNotes: b.internalNotes ?? null,
        finalReportUrl: b.finalReportGenerated ? `https://docs.flowtora.com/dsr/${b.extId}/final-report.pdf` : null,
        exportBundleUrl: b.exportGenerated ? `https://docs.flowtora.com/dsr/${b.extId}/export.zip` : null,
        exportBundleExpiresAt: b.exportGenerated ? daysAgo(-7) : null,
        exportGenerated: b.exportGenerated ?? false,
        rejectedReason: b.rejectedReason ?? null,
        assignedToId: assignee?.id ?? null,
        receivedAt,
        verifiedAt:  b.verifiedDaysAgo  != null ? daysAgo(b.verifiedDaysAgo)  : null,
        completedAt: b.completedDaysAgo != null ? daysAgo(b.completedDaysAgo) : null,
        rejectedAt:  b.rejectedDaysAgo  != null ? daysAgo(b.rejectedDaysAgo)  : null,
      },
      update: {
        status: b.status, verificationStatus: b.verification,
        legalHold: b.legalHold ?? false, legalHoldReason: b.legalHoldReason ?? null,
      },
      select: { id: true },
    });
    // Verifications.
    for (const v of b.verifications ?? []) {
      await db.privacyVerificationDoc.create({
        data: {
          requestId: created.id,
          method: v.method,
          status: v.status,
          notes: v.notes ?? null,
          verifiedById: v.status === "VERIFIED" || v.status === "FAILED" || v.status === "WAIVED" ? reviewer.id : null,
          verifiedAt:   v.status === "PENDING" ? null : daysAgo(v.daysAgo),
          createdAt:    daysAgo(v.daysAgo),
        },
      });
    }
    // Scope discovery.
    for (const s of b.scopes ?? []) {
      await db.privacyScopeDiscovery.upsert({
        where: { requestId_system: { requestId: created.id, system: s.system } },
        create: {
          requestId: created.id,
          system: s.system, status: s.status,
          resultCount: s.records, resultBytes: s.bytes,
          lastRunAt: s.daysAgoLastRun != null ? daysAgo(s.daysAgoLastRun) : null,
        },
        update: {},
      });
    }
    // Messages.
    if (b.messages && b.messages.length > 0) {
      await db.privacyRequestMessage.createMany({
        data: b.messages.map((m) => ({
          requestId: created.id,
          direction: m.direction,
          channel: m.channel,
          senderName: m.direction === "OUTBOUND" ? "Flowtora DPO" : b.subjectName,
          senderEmail: m.direction === "OUTBOUND" ? dpoEmail : b.subjectEmail,
          subject: m.subject ?? null,
          body: m.body,
          occurredAt: daysAgo(m.daysAgo),
        })),
      });
    }
    // Audit entries.
    if (b.audit && b.audit.length > 0) {
      await db.privacyRequestAuditEntry.createMany({
        data: b.audit.map((a) => ({
          requestId: created.id,
          action: a.action,
          actorEmail: dpoEmail,
          details: a.details,
          occurredAt: daysAgo(a.daysAgo),
        })),
      });
    }
  }

  console.log(
    `  ✓ ${reqs.length} privacy requests with verifications + scope discovery + messages + audit trails`,
  );
}

/* ── Page 53 — Backups & Restore seed ──────────────────── */

async function seedBackups(
  staff: { id: string; email: string; name: string | null }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding Backups & Restore (Page 53)…");
  const reviewer = staff[0];
  if (!reviewer) {
    console.log("  skipped — no platform staff");
    return;
  }

  // 1. Settings singleton.
  await db.backupSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      kmsProvider: "AWS KMS",
      kmsKeyId: "alias/flowtora-backups",
      keyLastRotatedAt: daysAgo(34),
      keyRotationDueIn: 56,
      crossAccountReplication: true,
      vendor: "AWS Backup + Velero (k8s)",
      rpoMinutes: 60,
      rtoMinutes: 240,
      successTarget: 99,
      notes: "Cross-account replication into security-archive AWS account. Velero snapshots cluster state daily.",
    },
    update: {
      keyLastRotatedAt: daysAgo(34),
      keyRotationDueIn: 56,
    },
  });

  // 2. Schedules.
  type SchedBp = {
    name: string;
    source: "POSTGRES" | "S3_PROOFS" | "S3_EXPORTS" | "REDIS" | "ELASTICSEARCH" | "CONFIG" | "KMS_KEYS";
    kind:   "CONTINUOUS_WAL" | "SNAPSHOT" | "FULL" | "INCREMENTAL" | "ARCHIVE";
    cadence: "CONTINUOUS" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND";
    cron?: string;
    retentionDays: number;
    encryption: "AES_256_GCM" | "AES_256_CBC" | "RSA_4096";
    region: "US_EAST_1" | "US_WEST_2" | "EU_WEST_1" | "AP_SOUTHEAST_1" | "GLOBAL";
    lastRunHoursAgo?: number;
    nextRunHoursAhead?: number;
    notes?: string;
  };
  const scheds: SchedBp[] = [
    { name: "[seed] Postgres continuous WAL stream",
      source: "POSTGRES", kind: "CONTINUOUS_WAL", cadence: "CONTINUOUS",
      retentionDays: 30,
      encryption: "AES_256_GCM", region: "US_EAST_1",
      lastRunHoursAgo: 0, nextRunHoursAhead: 0,
      notes: "WAL streamed continuously to S3; last-mile lag <60s." },
    { name: "[seed] Postgres daily snapshot",
      source: "POSTGRES", kind: "SNAPSHOT", cadence: "DAILY",
      cron: "0 3 * * *",
      retentionDays: 30,
      encryption: "AES_256_GCM", region: "US_EAST_1",
      lastRunHoursAgo: 9, nextRunHoursAhead: 15,
      notes: "Encrypted snapshot to S3; verified by hash on completion." },
    { name: "[seed] Postgres weekly full",
      source: "POSTGRES", kind: "FULL", cadence: "WEEKLY",
      cron: "0 4 * * 0",
      retentionDays: 90,
      encryption: "AES_256_GCM", region: "EU_WEST_1",
      lastRunHoursAgo: 36, nextRunHoursAhead: 132,
      notes: "Cross-region full to EU for compliance." },
    { name: "[seed] Postgres monthly archive",
      source: "POSTGRES", kind: "ARCHIVE", cadence: "MONTHLY",
      cron: "0 5 1 * *",
      retentionDays: 99999,
      encryption: "AES_256_GCM", region: "US_WEST_2",
      lastRunHoursAgo: 480, nextRunHoursAhead: 240,
      notes: "Glacier Deep Archive — held forever for SOC 2 / GDPR." },
    { name: "[seed] S3 proofs cross-region replication",
      source: "S3_PROOFS", kind: "CONTINUOUS_WAL", cadence: "CONTINUOUS",
      retentionDays: 365,
      encryption: "AES_256_GCM", region: "EU_WEST_1",
      lastRunHoursAgo: 0,
      notes: "S3 versioning + CRR to eu-west-1 + Object Lock 7-year." },
    { name: "[seed] S3 exports daily snapshot",
      source: "S3_EXPORTS", kind: "SNAPSHOT", cadence: "DAILY",
      cron: "0 4 * * *",
      retentionDays: 90,
      encryption: "AES_256_GCM", region: "US_EAST_1",
      lastRunHoursAgo: 8, nextRunHoursAhead: 16 },
    { name: "[seed] Redis snapshot (cluster RDB)",
      source: "REDIS", kind: "SNAPSHOT", cadence: "HOURLY",
      cron: "0 * * * *",
      retentionDays: 7,
      encryption: "AES_256_GCM", region: "US_EAST_1",
      lastRunHoursAgo: 1, nextRunHoursAhead: 0,
      notes: "RDB snapshot every hour; replicas already synchronous." },
    { name: "[seed] Elasticsearch hourly snapshot",
      source: "ELASTICSEARCH", kind: "SNAPSHOT", cadence: "HOURLY",
      cron: "30 * * * *",
      retentionDays: 30,
      encryption: "AES_256_GCM", region: "US_EAST_1",
      lastRunHoursAgo: 1, nextRunHoursAhead: 0 },
    { name: "[seed] Config + secrets daily",
      source: "CONFIG", kind: "FULL", cadence: "DAILY",
      cron: "0 5 * * *",
      retentionDays: 365,
      encryption: "AES_256_GCM", region: "US_EAST_1",
      lastRunHoursAgo: 7, nextRunHoursAhead: 17,
      notes: "Includes Vault snapshots + IaC repo state." },
    { name: "[seed] KMS key rotation snapshot",
      source: "KMS_KEYS", kind: "ARCHIVE", cadence: "MONTHLY",
      cron: "0 5 15 * *",
      retentionDays: 99999,
      encryption: "RSA_4096", region: "GLOBAL",
      lastRunHoursAgo: 720, nextRunHoursAhead: 0 },
  ];
  type SchedSaved = { id: string; source: SchedBp["source"]; kind: SchedBp["kind"]; region: SchedBp["region"]; encryption: SchedBp["encryption"]; cadence: SchedBp["cadence"] };
  const schedSaved: SchedSaved[] = [];
  for (const s of scheds) {
    const saved = await db.backupSchedule.create({
      data: {
        name: s.name,
        source: s.source, kind: s.kind, cadence: s.cadence,
        cronExpr: s.cron ?? null,
        retentionDays: s.retentionDays,
        encryption: s.encryption, region: s.region,
        active: true,
        lastRunAt: s.lastRunHoursAgo != null ? new Date(Date.now() - s.lastRunHoursAgo * 3_600_000) : null,
        nextRunAt: s.nextRunHoursAhead != null ? new Date(Date.now() + s.nextRunHoursAhead * 3_600_000) : null,
        notes: s.notes ?? null,
      },
      select: { id: true, source: true, kind: true, region: true, encryption: true, cadence: true },
    });
    schedSaved.push(saved as SchedSaved);
  }

  // 3. Backup jobs (recent history per schedule).
  const STATUSES = ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "FAILED", "PARTIAL"] as const;
  const jobsToCreate: Array<{
    scheduleId: string;
    source: SchedBp["source"];
    kind: SchedBp["kind"];
    status: "SUCCESS" | "FAILED" | "PARTIAL";
    region: SchedBp["region"];
    encryption: SchedBp["encryption"];
    startedAt: Date;
    completedAt: Date;
    durationSec: number;
    sizeBytes: bigint;
    manifestHash: string;
    manifestUrl: string;
    logsUrl: string;
    errorMessage: string | null;
    verified: boolean;
    verifiedAt: Date | null;
  }> = [];

  for (const s of schedSaved) {
    const targetCount = s.cadence === "CONTINUOUS" || s.cadence === "HOURLY" ? 24
                      : s.cadence === "DAILY" ? 14
                      : s.cadence === "WEEKLY" ? 8
                      : s.cadence === "MONTHLY" ? 4
                      : 2;
    for (let i = 0; i < targetCount; i++) {
      const status = STATUSES[Math.floor(Math.random() * STATUSES.length)]!;
      const hoursBack = (i + 1) * (s.cadence === "CONTINUOUS" || s.cadence === "HOURLY" ? 1
                                  : s.cadence === "DAILY" ? 24
                                  : s.cadence === "WEEKLY" ? 168
                                  : s.cadence === "MONTHLY" ? 720
                                  : 24);
      const durationSec = Math.floor(Math.random() * 600) + 30;
      const startedAt = new Date(Date.now() - hoursBack * 3_600_000);
      const completedAt = new Date(startedAt.getTime() + durationSec * 1000);
      const sizeBytes = BigInt(
        s.kind === "CONTINUOUS_WAL" ? Math.floor(Math.random() * 200_000_000) + 50_000_000
        : s.kind === "ARCHIVE"      ? Math.floor(Math.random() * 50_000_000_000) + 20_000_000_000
        : s.kind === "FULL"         ? Math.floor(Math.random() * 30_000_000_000) + 10_000_000_000
        :                             Math.floor(Math.random() * 5_000_000_000)  + 500_000_000,
      );
      const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
      jobsToCreate.push({
        scheduleId: s.id,
        source: s.source, kind: s.kind, status,
        region: s.region, encryption: s.encryption,
        startedAt, completedAt, durationSec,
        sizeBytes,
        manifestHash: hash,
        manifestUrl: `https://backups.flowtora.example/manifests/${hash}.json`,
        logsUrl:     `https://backups.flowtora.example/logs/${hash}.txt`,
        errorMessage: status === "FAILED"   ? "Snapshot upload timed out after 600s"
                    : status === "PARTIAL" ? "WAL gap detected — re-running incremental"
                    : null,
        verified: status === "SUCCESS",
        verifiedAt: status === "SUCCESS" ? completedAt : null,
      });
    }
  }
  // Bulk insert in chunks.
  for (let i = 0; i < jobsToCreate.length; i += 200) {
    await db.backupJob.createMany({ data: jobsToCreate.slice(i, i + 200) });
  }

  // 4. Restore tests (~6 monthly drills).
  await db.restoreTest.createMany({
    data: [
      { name: "[seed] 2026-04 Postgres monthly drill", source: "POSTGRES", region: "US_EAST_1",
        startedAt: daysAgo(7), completedAt: daysAgo(6.95), durationSec: 4_320,
        result: "PASS", sampleQueriesPassed: 12, sampleQueriesTotal: 12,
        reportUrl: "https://docs.flowtora.com/drills/2026-04-postgres.pdf",
        summary: "RTO target 4h met (1h 12m). All 12 sample queries passed." },
      { name: "[seed] 2026-03 Postgres monthly drill", source: "POSTGRES", region: "US_EAST_1",
        startedAt: daysAgo(38), completedAt: daysAgo(37.94), durationSec: 5_300,
        result: "PASS", sampleQueriesPassed: 12, sampleQueriesTotal: 12,
        reportUrl: "https://docs.flowtora.com/drills/2026-03-postgres.pdf",
        summary: "Clean restore — 1h 28m." },
      { name: "[seed] 2026-02 Postgres monthly drill", source: "POSTGRES", region: "US_EAST_1",
        startedAt: daysAgo(68), completedAt: daysAgo(67.93), durationSec: 6_120,
        result: "PARTIAL", sampleQueriesPassed: 11, sampleQueriesTotal: 12,
        reportUrl: "https://docs.flowtora.com/drills/2026-02-postgres.pdf",
        summary: "1 sample query failed — fixture mismatch since-fixed." },
      { name: "[seed] 2026-04 S3 cross-region restore", source: "S3_PROOFS", region: "EU_WEST_1",
        startedAt: daysAgo(10), completedAt: daysAgo(9.96), durationSec: 3_540,
        result: "PASS", sampleQueriesPassed: 8, sampleQueriesTotal: 8,
        reportUrl: "https://docs.flowtora.com/drills/2026-04-s3-eu.pdf" },
      { name: "[seed] 2026-04 Redis snapshot drill", source: "REDIS", region: "US_EAST_1",
        startedAt: daysAgo(3), completedAt: daysAgo(2.99), durationSec: 240,
        result: "PASS", sampleQueriesPassed: 4, sampleQueriesTotal: 4 },
      { name: "[seed] 2026-04 Config restore drill", source: "CONFIG", region: "US_EAST_1",
        startedAt: daysAgo(15), completedAt: daysAgo(14.98), durationSec: 1_440,
        result: "PASS", sampleQueriesPassed: 6, sampleQueriesTotal: 6 },
    ],
  });

  // 5. Tenant restores (~5 across statuses).
  if (tenants.length > 0) {
    await db.tenantRestore.create({
      data: {
        tenantId: tenants[0]!.id,
        targetAt: daysAgo(14),
        status: "APPLIED",
        rowsAffected: 1842, rowsAdded: 38, rowsChanged: 1742, rowsRemoved: 62,
        tablesAffected: [
          { table: "Customer",        added: 12, changed: 220, removed: 4 },
          { table: "Order",           added: 18, changed: 980, removed: 24 },
          { table: "Invoice",         added: 4,  changed: 380, removed: 18 },
          { table: "ProductionStage", added: 4,  changed: 162, removed: 16 },
        ] as never,
        initiatedById: reviewer.id,
        approvedById: reviewer.id,
        approvedAt: daysAgo(13.9),
        appliedAt:  daysAgo(13.85),
        reason: "[seed] Tenant accidentally bulk-deleted 38 customers; rolled back.",
        reviewNotes: "Reviewed diff with tenant owner; approved over Zoom call.",
      },
    });
  }
  if (tenants.length > 1) {
    await db.tenantRestore.create({
      data: {
        tenantId: tenants[1]!.id,
        targetAt: daysAgo(2),
        status: "REVIEWING",
        rowsAffected: 312, rowsAdded: 6, rowsChanged: 290, rowsRemoved: 16,
        tablesAffected: [
          { table: "Order",   added: 4, changed: 200, removed: 12 },
          { table: "Invoice", added: 2, changed: 90,  removed: 4  },
        ] as never,
        initiatedById: reviewer.id,
        reason: "[seed] Tenant requested rollback after pricing import error.",
      },
    });
  }
  if (tenants.length > 0) {
    await db.tenantRestore.create({
      data: {
        tenantId: tenants[0]!.id,
        targetAt: daysAgo(60),
        status: "DISCARDED",
        rowsAffected: 0, rowsAdded: 0, rowsChanged: 0, rowsRemoved: 0,
        initiatedById: reviewer.id,
        reason: "[seed] Tenant requested 60-day rollback then changed mind after diff review.",
        reviewNotes: "Discarded — tenant happy with current state.",
        discardedAt: daysAgo(59.5),
      },
    });
  }
  if (tenants.length > 2) {
    await db.tenantRestore.create({
      data: {
        tenantId: tenants[2]!.id,
        targetAt: daysAgo(7),
        status: "FAILED",
        rowsAffected: 0, rowsAdded: 0, rowsChanged: 0, rowsRemoved: 0,
        initiatedById: reviewer.id,
        reason: "[seed] Investigation of suspected unauthorized deletion.",
        reviewNotes: "Shadow restore failed — Postgres WAL gap during requested timestamp. Escalated.",
        failedAt: daysAgo(6.9),
      },
    });
  }

  // 6. Storage buckets.
  await db.backupStorageBucket.createMany({
    data: [
      { provider: "AWS S3", bucketName: "seed-flowtora-backups-prod", region: "US_EAST_1",
        hotBytes: BigInt(820_000_000_000), archiveBytes: BigInt(2_400_000_000_000),
        crrEnabled: true, crrHealth: "HEALTHY", bucketHealth: "HEALTHY",
        monthlyCostCents: 84_000, lastRefreshedAt: minutesAgo(15),
        notes: "Primary backup bucket — versioning + CRR + Object Lock." },
      { provider: "AWS S3", bucketName: "seed-flowtora-backups-eu", region: "EU_WEST_1",
        hotBytes: BigInt(420_000_000_000), archiveBytes: BigInt(1_100_000_000_000),
        crrEnabled: true, crrHealth: "HEALTHY", bucketHealth: "HEALTHY",
        monthlyCostCents: 51_000, lastRefreshedAt: minutesAgo(15),
        notes: "Cross-region replica for EU compliance." },
      { provider: "AWS S3", bucketName: "seed-flowtora-archives-glacier", region: "US_WEST_2",
        hotBytes: BigInt(0), archiveBytes: BigInt(38_000_000_000_000),
        crrEnabled: false, crrHealth: "HEALTHY", bucketHealth: "HEALTHY",
        monthlyCostCents: 9_500, lastRefreshedAt: minutesAgo(45),
        notes: "Glacier Deep Archive — monthly archives kept forever." },
      { provider: "Cloudflare R2", bucketName: "seed-flowtora-proofs-cold", region: "GLOBAL",
        hotBytes: BigInt(180_000_000_000), archiveBytes: BigInt(0),
        crrEnabled: false, crrHealth: "DEGRADED", bucketHealth: "HEALTHY",
        monthlyCostCents: 27_000, lastRefreshedAt: minutesAgo(120),
        notes: "Egress-free secondary for proofs; CRR not yet wired." },
    ],
  });

  console.log(
    `  ✓ ${scheds.length} schedules, ${jobsToCreate.length} jobs, 6 restore tests, 4 tenant restores, 4 buckets`,
  );
}

/* ── Page 54 — Incident Log seed ───────────────────────── */

async function seedIncidents(
  staff: { id: string; email: string; name: string | null }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding Incident Log (Page 54)…");
  if (staff.length === 0) {
    console.log("  skipped — no platform staff");
    return;
  }
  const ic = staff[0]!;
  const scribe = staff[1] ?? staff[0]!;
  const commsLead = staff[2] ?? staff[0]!;

  // 1. Status page components.
  const components = [
    { slug: "seed-api",         name: "Public API",            description: "REST API gateway", position: 1, status: "OPERATIONAL"   as const, region: "global" },
    { slug: "seed-app",         name: "Web app",               description: "app.flowtora.com Next.js + Vercel", position: 2, status: "OPERATIONAL" as const, region: "global" },
    { slug: "seed-portal",      name: "Tenant portal",         description: "Customer-facing portal", position: 3, status: "DEGRADED" as const, region: "global" },
    { slug: "seed-billing",     name: "Billing service",       description: "Stripe + invoicing", position: 4, status: "OPERATIONAL" as const, region: "global" },
    { slug: "seed-files",       name: "File storage",          description: "S3-backed proofs + exports", position: 5, status: "OPERATIONAL" as const, region: "us-east-1" },
    { slug: "seed-search",      name: "Search",                description: "Elasticsearch", position: 6, status: "OPERATIONAL" as const, region: "us-east-1" },
    { slug: "seed-email",       name: "Email delivery",        description: "Resend transactional email", position: 7, status: "OPERATIONAL" as const, region: "global" },
    { slug: "seed-webhooks",    name: "Webhook deliveries",    description: "Outbound webhook fanout", position: 8, status: "OPERATIONAL" as const, region: "global" },
    { slug: "seed-status-page", name: "Status page",           description: "status.flowtora.com", position: 9, status: "OPERATIONAL" as const, region: "global" },
  ];
  for (const c of components) {
    await db.statusPageComponent.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug, name: c.name, description: c.description, position: c.position,
        status: c.status, publiclyListed: c.slug !== "seed-status-page",
        region: c.region, subscribers: Math.floor(Math.random() * 1500) + 100,
      },
      update: { status: c.status },
    });
  }

  // 2. Maintenance windows.
  await db.statusPageMaintenance.createMany({
    data: [
      { title: "[seed] Database failover drill", body: "We will exercise our Postgres primary→replica failover. Brief read-only blip expected.",
        startsAt: daysAgo(-7), endsAt: daysAgo(-7 - 1/24),
        state: "SCHEDULED", componentSlugs: ["seed-api", "seed-app"], notifiedCount: 1842 },
      { title: "[seed] Scheduled cache eviction", body: "Targeted purge of stale tenant cache to reclaim memory. Subject to slight latency uptick for ~5min.",
        startsAt: daysAgo(2), endsAt: daysAgo(2 - 0.05),
        state: "COMPLETED", componentSlugs: ["seed-api"], notifiedCount: 412 },
      { title: "[seed] Search reindex", body: "Full reindex of search corpus. May see incomplete results during the window.",
        startsAt: daysAgo(0.04), endsAt: daysAgo(-0.04),
        state: "IN_PROGRESS", componentSlugs: ["seed-search"], notifiedCount: 220 },
    ],
  });

  // 3. Runbooks.
  await db.runbook.createMany({
    data: [
      { slug: "seed-postgres-replica-lag", title: "Postgres replica lag",
        description: "Steps to triage when read replicas fall behind primary by more than 60s.",
        body: "## Symptoms\n- Replica lag alert >60s.\n\n## Triage\n1. Check primary load.\n2. Check replication slot status.\n3. Identify long-running transactions.\n\n## Mitigations\n- Kill long-running transactions.\n- Promote standby if needed.",
        status: "ACTIVE", service: "postgres", tags: ["postgres", "replication", "data-store"],
        ownerEmail: "sre@flowtora.com",
        lastReviewedAt: daysAgo(45), nextReviewAt: daysAgo(-135), openedCount: 12 },
      { slug: "seed-stripe-webhook-failures", title: "Stripe webhook failures",
        description: "What to do when Stripe webhooks start failing or the queue backs up.",
        body: "## Symptoms\n- Stripe dashboard shows 5xx errors on our webhook endpoint.\n\n## Triage\n1. Check our webhook receiver health.\n2. Check our DB write-availability.\n3. Pause webhook delivery in Stripe if needed.",
        status: "ACTIVE", service: "billing", tags: ["billing", "stripe", "webhooks"],
        ownerEmail: "billing@flowtora.com",
        lastReviewedAt: daysAgo(30), nextReviewAt: daysAgo(-150), openedCount: 7 },
      { slug: "seed-s3-cross-region-replication", title: "S3 cross-region replication failure",
        description: "When replication to eu-west-1 stalls.",
        body: "## Symptoms\n- CRR metrics show replication backlog growing.\n\n## Triage\n1. Verify destination bucket health.\n2. Check IAM policies.\n3. Review object-lock conflicts.",
        status: "ACTIVE", service: "files", tags: ["aws", "s3", "replication"],
        ownerEmail: "sre@flowtora.com",
        lastReviewedAt: daysAgo(60), nextReviewAt: daysAgo(-120), openedCount: 4 },
      { slug: "seed-saml-callback-failure", title: "SAML SSO callback failure",
        description: "What to do when tenants report repeated SAML auth failures.",
        body: "## Symptoms\n- Tenant SCIM bearer accepting but SAML asserts rejecting.\n\n## Triage\n1. Validate tenant metadata XML.\n2. Compare entity IDs.\n3. Test tenant config from /platform/integrations/sso.",
        status: "ACTIVE", service: "auth", tags: ["sso", "saml"],
        ownerEmail: "auth@flowtora.com",
        lastReviewedAt: daysAgo(20), nextReviewAt: daysAgo(-160), openedCount: 9 },
      { slug: "seed-deploy-rollback", title: "Deploy rollback",
        description: "Standard procedure for rolling back a bad Vercel deploy.",
        body: "## When\n- Error rate climbing post-deploy.\n\n## How\n1. Identify last known good deploy in Vercel dashboard.\n2. Promote to production.\n3. Notify Engineering channel.\n4. File a postmortem if customer-impacting.",
        status: "ACTIVE", service: "platform", tags: ["deploy", "vercel", "rollback"],
        ownerEmail: "engineering@flowtora.com",
        lastReviewedAt: daysAgo(10), nextReviewAt: daysAgo(-170), openedCount: 14 },
      { slug: "seed-redis-failover", title: "Redis cluster failover",
        description: "When Redis primary fails over to replica.",
        body: "## Symptoms\n- App seeing increased Redis timeouts.\n\n## Triage\n1. Check ElastiCache health dashboard.\n2. Verify failover completed.\n3. If session loss > tolerance, force re-auth.",
        status: "DRAFT", service: "redis", tags: ["redis", "cache"],
        ownerEmail: "sre@flowtora.com",
        nextReviewAt: daysAgo(-90) },
    ],
  });
  const runbooks = await db.runbook.findMany({
    where: { slug: { startsWith: "seed-" } },
    select: { id: true, slug: true },
  });
  const runbookBySlug = new Map(runbooks.map((r) => [r.slug, r.id]));

  // 4. Incidents.
  type IncidentBp = {
    extId: string;
    title: string;
    summary: string;
    severity: "SEV1" | "SEV2" | "SEV3" | "SEV4";
    status:   "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";
    detectedBy: "ALERT" | "CUSTOMER_REPORT" | "INTERNAL" | "SYNTHETIC_CHECK" | "MANUAL" | "PARTNER" | "SECURITY_FEED";
    services: string[];
    tags: string[];
    startedHoursAgo: number;
    detectedHoursAgo?: number;
    identifiedHoursAgo?: number;
    monitoringHoursAgo?: number;
    resolvedHoursAgo?: number;
    pagesFired?: number;
    runbookSlug?: string;
    affectedSvcs?: Array<{ name: string; status: "OPERATIONAL" | "DEGRADED" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "MAINTENANCE"; region?: string }>;
    affectedTenIdx?: number[];
    timeline?: Array<{ kind: "STATUS_CHANGE" | "COMMS_SENT" | "MITIGATION" | "ROLE_ASSIGNED" | "NOTE" | "DEPLOY" | "FLAG_TOGGLE" | "PAGE_FIRED" | "ALERT" | "HANDOFF" | "RESOLUTION"; body: string; source?: string; relativeMin: number }>;
    comms?: Array<{ channel: "STATUS_PAGE" | "EMAIL" | "TWITTER_X" | "IN_APP" | "SLACK"; status: "DRAFT" | "PUBLISHED" | "RETRACTED"; subject?: string; body: string; audience?: number; ageMin: number }>;
    mitigations?: Array<{ title: string; desc?: string; kind?: string; reference?: string; effective?: boolean; relMin: number }>;
    actionItems?: Array<{ title: string; desc?: string; owner: string; ref?: string; status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "BLOCKED"; dueDays?: number }>;
    postmortemBody?: string;
    customerSummary?: string;
    postmortemPublished?: boolean;
  };
  const incs: IncidentBp[] = [
    {
      extId: "INC-SEED-2026-0042",
      title: "Tenant portal outage in eu-west-1",
      summary: "Tenant portal returning 5xx errors for users routed through eu-west-1 due to a stale ElastiCache primary endpoint after AZ failover.",
      severity: "SEV1", status: "RESOLVED",
      detectedBy: "SYNTHETIC_CHECK",
      services: ["seed-portal", "seed-api"],
      tags: ["redis", "cache", "eu-west-1"],
      startedHoursAgo: 96, detectedHoursAgo: 96 - 4 / 60, identifiedHoursAgo: 96 - 18 / 60,
      monitoringHoursAgo: 96 - 32 / 60, resolvedHoursAgo: 96 - 41 / 60,
      pagesFired: 4, runbookSlug: "seed-redis-failover",
      affectedSvcs: [
        { name: "Tenant portal", status: "MAJOR_OUTAGE", region: "eu-west-1" },
        { name: "Public API",    status: "DEGRADED",     region: "eu-west-1" },
      ],
      affectedTenIdx: [0, 1, 2],
      timeline: [
        { kind: "ALERT",         body: "Synthetic uptime check failing for portal.eu.flowtora.com", source: "Datadog", relativeMin: 0 },
        { kind: "PAGE_FIRED",    body: "PagerDuty escalation triggered for SRE primary",            source: "PagerDuty", relativeMin: 1 },
        { kind: "STATUS_CHANGE", body: "Status set to INVESTIGATING",                              source: "Manual",   relativeMin: 4 },
        { kind: "ROLE_ASSIGNED", body: "Roles assigned: IC=" + ic.email + ", scribe=" + scribe.email + ", comms=" + commsLead.email, relativeMin: 6 },
        { kind: "COMMS_SENT",    body: "Initial public update posted to status page",              source: "Manual",   relativeMin: 8 },
        { kind: "NOTE",          body: "Hypothesis: ElastiCache primary endpoint stale after AZ failover at 04:12.", relativeMin: 14 },
        { kind: "STATUS_CHANGE", body: "Status set to IDENTIFIED",                                  source: "Manual",   relativeMin: 18 },
        { kind: "MITIGATION",    body: "Updated AWS_REDIS_PRIMARY env var to current writer endpoint", source: "Manual", relativeMin: 22 },
        { kind: "DEPLOY",        body: "Restart of API + Portal services to pick up new env",       source: "Vercel",   relativeMin: 26 },
        { kind: "STATUS_CHANGE", body: "Status set to MONITORING",                                  source: "Manual",   relativeMin: 32 },
        { kind: "COMMS_SENT",    body: "Followup public update — error rate normalising",           source: "Manual",   relativeMin: 36 },
        { kind: "RESOLUTION",    body: "Error rate <0.1% for 9 min — closing incident",             source: "Manual",   relativeMin: 41 },
      ],
      comms: [
        { channel: "STATUS_PAGE", status: "PUBLISHED",
          subject: "Investigating elevated error rates in eu-west-1",
          body: "We're investigating elevated error rates affecting the tenant portal and API in our eu-west-1 region. We'll post updates here every 15 minutes.",
          audience: 1840, ageMin: 8 },
        { channel: "STATUS_PAGE", status: "PUBLISHED",
          subject: "Identified — applying mitigation",
          body: "We've identified the cause as a stale Redis endpoint after an AZ failover. Applying the mitigation now.",
          audience: 1840, ageMin: 18 },
        { channel: "STATUS_PAGE", status: "PUBLISHED",
          subject: "Monitoring",
          body: "Error rate is back to normal. We're monitoring before declaring resolved.",
          audience: 1840, ageMin: 32 },
        { channel: "STATUS_PAGE", status: "PUBLISHED",
          subject: "Resolved",
          body: "Incident resolved. Total customer-facing impact: ~32 minutes.",
          audience: 1840, ageMin: 41 },
        { channel: "EMAIL", status: "PUBLISHED",
          subject: "[Resolved] eu-west-1 outage — Apr 23",
          body: "Hi — earlier today we experienced a 32-minute outage in our eu-west-1 region affecting the tenant portal. A full postmortem is being prepared. We're sorry for the disruption.",
          audience: 412, ageMin: 90 },
      ],
      mitigations: [
        { title: "Update AWS_REDIS_PRIMARY env var", desc: "Pointed app at new ElastiCache writer endpoint.", kind: "config", reference: "PR #1842", effective: true, relMin: 22 },
        { title: "Restart API + portal services",     desc: "Forced re-resolve of cached endpoint.", kind: "deploy", reference: "deploy 8a4f2e", effective: true, relMin: 26 },
      ],
      actionItems: [
        { title: "Auto-detect ElastiCache writer endpoint changes", owner: "sre@flowtora.com",
          ref: "INF-441", status: "IN_PROGRESS", dueDays: 14, desc: "Add a poller that updates the cached endpoint without requiring restart." },
        { title: "Add synthetic check for cache-write availability per AZ", owner: "sre@flowtora.com",
          ref: "INF-442", status: "TODO", dueDays: 21 },
        { title: "Document ElastiCache failover runbook", owner: "sre@flowtora.com",
          ref: "DOCS-1042", status: "DONE" },
      ],
      postmortemBody:
`## What happened
An AZ-level event caused our Redis primary in eu-west-1 to failover to a replica. Our application held the cached writer endpoint for ~22 minutes after the failover, causing all writes to fail and surfacing as 5xx errors on the tenant portal and parts of the API.

## Impact
- **Customers affected:** ~412 tenants in eu-west-1
- **Services affected:** Tenant portal, Public API
- **Duration:** 32 minutes (04:18 → 04:50 UTC)

## Root cause
The application caches the writer endpoint URL in an environment variable resolved at boot. When ElastiCache failed over to a different node, the writer endpoint changed, but our application kept using the stale value until restart.

## 5 Whys
1. Why did the portal return 5xx? Redis writes were failing.
2. Why? The app was hitting a no-longer-writer endpoint.
3. Why? The app cached the endpoint at boot.
4. Why? We didn't have a poller to refresh it.
5. Why? The endpoint was assumed stable in the original design.

## Action items
See the Action items tab. Highlights: auto-detect writer-endpoint changes, add per-AZ synthetic check, document runbook.

## Lessons learned
We treat AZ failover as routine in design but our app has a class of state that doesn't survive it. Audit other "boot-time" config for similar issues.

## Customer-facing summary
On April 23 from 04:18-04:50 UTC, customers in our European region experienced errors using the tenant portal and parts of the API. The cause was a delayed reconnection to our Redis cache after an AZ failover. Our team resolved it within 32 minutes. We're sorry for the disruption — we have follow-up actions to prevent recurrence.`,
      customerSummary: "On April 23, 04:18-04:50 UTC, customers in eu-west-1 experienced errors with the tenant portal. Cause: delayed Redis reconnection after AZ failover. Resolved in 32 min. Follow-ups in progress to prevent recurrence.",
      postmortemPublished: true,
    },
    {
      extId: "INC-SEED-2026-0043",
      title: "Stripe webhook deliveries backed up",
      summary: "Stripe webhook deliveries are queueing up due to a slow handler. Investigating root cause.",
      severity: "SEV2", status: "INVESTIGATING",
      detectedBy: "ALERT",
      services: ["seed-billing"],
      tags: ["billing", "stripe", "webhooks"],
      startedHoursAgo: 2, detectedHoursAgo: 1.95,
      pagesFired: 2, runbookSlug: "seed-stripe-webhook-failures",
      affectedSvcs: [{ name: "Billing service", status: "DEGRADED", region: "global" }],
      timeline: [
        { kind: "ALERT",         body: "Stripe webhook latency p95 > 5s for 5 min", source: "Datadog", relativeMin: 0 },
        { kind: "PAGE_FIRED",    body: "PagerDuty escalation — Billing primary", source: "PagerDuty", relativeMin: 1 },
        { kind: "STATUS_CHANGE", body: "Status set to INVESTIGATING", source: "Manual", relativeMin: 3 },
        { kind: "NOTE",          body: "Stripe dashboard shows ~3,200 events queued", source: "Manual", relativeMin: 8 },
      ],
      comms: [
        { channel: "STATUS_PAGE", status: "DRAFT",
          subject: "Investigating delayed Stripe webhook processing",
          body: "We're investigating delayed processing of Stripe webhooks. New invoices and payment events may be slow to reflect.",
          ageMin: 5 },
      ],
    },
    {
      extId: "INC-SEED-2026-0044",
      title: "Search returning incomplete results during reindex",
      summary: "Scheduled search reindex is in progress; users may see incomplete results until ~12:30 UTC.",
      severity: "SEV3", status: "MONITORING",
      detectedBy: "INTERNAL",
      services: ["seed-search"],
      tags: ["search", "elasticsearch", "scheduled"],
      startedHoursAgo: 1.2, detectedHoursAgo: 1.2, identifiedHoursAgo: 1.2,
      monitoringHoursAgo: 0.4,
      pagesFired: 0,
      affectedSvcs: [{ name: "Search", status: "DEGRADED", region: "us-east-1" }],
      timeline: [
        { kind: "NOTE",          body: "Scheduled reindex started", source: "Manual", relativeMin: 0 },
        { kind: "COMMS_SENT",    body: "Maintenance window posted", source: "Manual", relativeMin: 2 },
        { kind: "STATUS_CHANGE", body: "Status set to MONITORING", source: "Manual", relativeMin: 48 },
      ],
      comms: [
        { channel: "STATUS_PAGE", status: "PUBLISHED",
          subject: "Search reindex in progress",
          body: "We're reindexing our search corpus. Results may be incomplete until ~12:30 UTC.",
          audience: 220, ageMin: 70 },
      ],
    },
    {
      extId: "INC-SEED-2026-0045",
      title: "Email delivery delays via Resend",
      summary: "Resend reporting elevated queue depth; transactional emails delayed by ~10-15 min.",
      severity: "SEV3", status: "RESOLVED",
      detectedBy: "PARTNER",
      services: ["seed-email"],
      tags: ["email", "resend", "third-party"],
      startedHoursAgo: 60, detectedHoursAgo: 59.9, identifiedHoursAgo: 59.5, monitoringHoursAgo: 59,
      resolvedHoursAgo: 58,
      pagesFired: 1,
      affectedSvcs: [{ name: "Email delivery", status: "DEGRADED", region: "global" }],
      timeline: [
        { kind: "ALERT",         body: "Resend status feed reports degraded delivery", source: "RSS", relativeMin: 0 },
        { kind: "STATUS_CHANGE", body: "Status set to INVESTIGATING", source: "Manual", relativeMin: 6 },
        { kind: "NOTE",          body: "Confirmed root cause is on Resend side; backlog draining", source: "Manual", relativeMin: 30 },
        { kind: "RESOLUTION",    body: "Backlog cleared, queue depth normal", source: "Manual", relativeMin: 120 },
      ],
      mitigations: [
        { title: "Subscribed to Resend status feed", desc: "Auto-correlate Resend incidents with our incidents.", kind: "infra", reference: "RES-44", relMin: 60 },
      ],
      actionItems: [
        { title: "Add fallback transactional email provider", owner: "billing@flowtora.com",
          ref: "INF-450", status: "TODO", dueDays: 30 },
      ],
      postmortemBody:
`## What happened
Resend's transactional delivery queue spiked, causing our outbound emails (welcome, password reset, invoice notifications) to be delayed 10-15 minutes for ~2 hours.

## Impact
- **Customers affected:** Most tenants — anyone receiving an automated email during the window.
- **Services affected:** Email delivery
- **Duration:** ~2h

## Root cause
Issue on Resend's side — confirmed in their status post.

## Lessons learned
We have a single point of failure for transactional email. Plan to add a fallback provider.

## Customer-facing summary
Some automated emails were delayed by 10-15 minutes due to an issue at our email provider. Email is now flowing normally.`,
      customerSummary: "Some automated emails were delayed 10-15 min due to an upstream provider issue. Now flowing normally.",
      postmortemPublished: true,
    },
    {
      extId: "INC-SEED-2026-0046",
      title: "Failed deploy — webhook signature mismatch",
      summary: "Deploy 1.42.7 introduced a regression in webhook signature verification. Rolled back.",
      severity: "SEV2", status: "RESOLVED",
      detectedBy: "ALERT",
      services: ["seed-webhooks"],
      tags: ["deploy", "regression", "webhooks"],
      startedHoursAgo: 240, detectedHoursAgo: 239.8, identifiedHoursAgo: 239.5,
      monitoringHoursAgo: 239.4, resolvedHoursAgo: 239.3,
      pagesFired: 2, runbookSlug: "seed-deploy-rollback",
      affectedSvcs: [{ name: "Webhook deliveries", status: "PARTIAL_OUTAGE", region: "global" }],
      timeline: [
        { kind: "DEPLOY",        body: "Deploy 1.42.7 to production",                source: "Vercel",   relativeMin: 0 },
        { kind: "ALERT",         body: "Webhook delivery error rate jumped to 18%", source: "Datadog",  relativeMin: 8 },
        { kind: "PAGE_FIRED",    body: "PagerDuty escalation — Engineering primary", source: "PagerDuty", relativeMin: 9 },
        { kind: "STATUS_CHANGE", body: "Status set to IDENTIFIED",                   source: "Manual",   relativeMin: 14 },
        { kind: "MITIGATION",    body: "Rolled back to deploy 1.42.6",                source: "Manual",   relativeMin: 18 },
        { kind: "RESOLUTION",    body: "Error rate back to baseline",                 source: "Manual",   relativeMin: 22 },
      ],
      mitigations: [
        { title: "Rollback deploy 1.42.7 → 1.42.6", desc: "Promoted last-known-good in Vercel.", kind: "rollback", reference: "deploy 7e1c9", relMin: 18, effective: true },
      ],
      actionItems: [
        { title: "Add canary release to deploy pipeline", owner: "engineering@flowtora.com",
          ref: "ENG-1100", status: "DONE" },
        { title: "Add HMAC signature integration test", owner: "engineering@flowtora.com",
          ref: "ENG-1101", status: "DONE" },
      ],
      postmortemBody:
`## What happened
A refactor of the webhook signing module mistakenly used the previous secret instead of the active one for non-default tenants. Deploy was reverted within 22 minutes.

## Impact
- **Customers affected:** ~6% of tenants relying on webhook deliveries.
- **Services affected:** Webhook deliveries
- **Duration:** 22 minutes

## Root cause
Variable shadow in the signature builder — the active secret was resolved correctly but a re-assignment downstream overwrote it with a stale reference.

## 5 Whys
1. Why did sigs not match? Wrong secret used.
2. Why? Variable shadowed.
3. Why didn't tests catch it? No HMAC test for non-default tenants.
4. Why? Tests focused on the default path.
5. Why? Multi-tenant signing was an afterthought in the original test plan.

## Action items
See Action items tab.

## Customer-facing summary
On April 13 a deploy briefly broke webhook signatures for some tenants. Resolved in 22 min via rollback. Sorry for the disruption.`,
      postmortemPublished: true,
    },
    {
      extId: "INC-SEED-2026-0047",
      title: "Minor latency increase on file uploads",
      summary: "Slightly elevated p95 upload latency due to a hot S3 partition.",
      severity: "SEV4", status: "RESOLVED",
      detectedBy: "INTERNAL",
      services: ["seed-files"],
      tags: ["s3", "files", "latency"],
      startedHoursAgo: 360, detectedHoursAgo: 360, identifiedHoursAgo: 359.5, resolvedHoursAgo: 358,
      pagesFired: 0,
      affectedSvcs: [{ name: "File storage", status: "OPERATIONAL", region: "us-east-1" }],
      timeline: [
        { kind: "NOTE",          body: "Internal dashboard noticed +200ms p95 increase", relativeMin: 0 },
        { kind: "MITIGATION",    body: "Spread upload prefix across more partitions",    relativeMin: 60 },
        { kind: "RESOLUTION",    body: "Latency back to normal",                          relativeMin: 120 },
      ],
      mitigations: [
        { title: "Spread upload prefix across more partitions", desc: "Tweaked key-prefix scheme to avoid hot partition.", kind: "infra", reference: "PR #1822", relMin: 60 },
      ],
    },
  ];

  for (const b of incs) {
    const startedAt = new Date(Date.now() - b.startedHoursAgo * 3_600_000);
    const detectedAt   = b.detectedHoursAgo   != null ? new Date(Date.now() - b.detectedHoursAgo   * 3_600_000) : null;
    const identifiedAt = b.identifiedHoursAgo != null ? new Date(Date.now() - b.identifiedHoursAgo * 3_600_000) : null;
    const monitoringAt = b.monitoringHoursAgo != null ? new Date(Date.now() - b.monitoringHoursAgo * 3_600_000) : null;
    const resolvedAt   = b.resolvedHoursAgo   != null ? new Date(Date.now() - b.resolvedHoursAgo   * 3_600_000) : null;
    const durationMin = resolvedAt
      ? Math.max(0, Math.round((resolvedAt.getTime() - startedAt.getTime()) / 60_000))
      : null;
    const created = await db.incident.create({
      data: {
        externalId: b.extId,
        title: b.title, summary: b.summary,
        severity: b.severity, status: b.status, detectedBy: b.detectedBy,
        services: b.services, tags: b.tags,
        startedAt, detectedAt, identifiedAt, monitoringAt, resolvedAt,
        durationMin,
        commanderId: ic.id, scribeId: scribe.id, commsLeadId: commsLead.id,
        postmortemRequired: b.severity === "SEV1" || b.severity === "SEV2",
        postmortemDueAt: b.severity === "SEV1" ? new Date(startedAt.getTime() + 7 * 86_400_000) : null,
        postmortemBody: b.postmortemBody ?? null,
        customerSummary: b.customerSummary ?? null,
        postmortemPublishedAt: b.postmortemPublished ? new Date(startedAt.getTime() + 3 * 86_400_000) : null,
        postmortemUrl: b.postmortemPublished ? `https://docs.flowtora.com/incidents/${b.extId}/postmortem.pdf` : null,
        runbookId: b.runbookSlug ? runbookBySlug.get(b.runbookSlug) ?? null : null,
        pagesFired: b.pagesFired ?? 0,
      },
      select: { id: true },
    });
    if (b.timeline) {
      await db.incidentTimelineEvent.createMany({
        data: b.timeline.map((ev) => ({
          incidentId: created.id,
          kind: ev.kind,
          body: ev.body,
          source: ev.source ?? null,
          actor: ic.email.split("@")[0]!,
          actorEmail: ic.email,
          occurredAt: new Date(startedAt.getTime() + ev.relativeMin * 60_000),
        })),
      });
    }
    if (b.affectedSvcs) {
      for (const s of b.affectedSvcs) {
        await db.incidentAffectedService.create({
          data: {
            incidentId: created.id,
            serviceName: s.name,
            componentStatus: s.status,
            region: s.region ?? null,
          },
        });
      }
    }
    if (b.affectedTenIdx) {
      for (const idx of b.affectedTenIdx) {
        const t = tenants[idx];
        if (!t) continue;
        await db.incidentAffectedTenant.create({
          data: {
            incidentId: created.id,
            tenantId: t.id,
            tenantName: t.name,
            notificationStatus: idx === 0 ? "NOTIFIED" : idx === 1 ? "NOTIFIED" : "PENDING",
            notifiedAt: idx <= 1 ? new Date(startedAt.getTime() + 25 * 60_000) : null,
          },
        });
      }
    }
    if (b.comms) {
      for (const c of b.comms) {
        await db.incidentComm.create({
          data: {
            incidentId: created.id,
            channel: c.channel,
            status: c.status,
            subject: c.subject ?? null,
            body: c.body,
            audienceSize: c.audience ?? null,
            authorName: commsLead.email.split("@")[0]!,
            authorId: commsLead.id,
            publishedAt: c.status === "PUBLISHED" ? new Date(Date.now() - c.ageMin * 60_000) : null,
            createdAt:   new Date(Date.now() - c.ageMin * 60_000 - 60_000),
          },
        });
      }
    }
    if (b.mitigations) {
      for (const m of b.mitigations) {
        await db.incidentMitigation.create({
          data: {
            incidentId: created.id,
            title: m.title,
            description: m.desc ?? null,
            kind: m.kind ?? null,
            reference: m.reference ?? null,
            effective: m.effective ?? true,
            appliedById: ic.id,
            appliedAt: new Date(startedAt.getTime() + m.relMin * 60_000),
          },
        });
      }
    }
    if (b.actionItems) {
      for (const a of b.actionItems) {
        await db.incidentActionItem.create({
          data: {
            incidentId: created.id,
            title: a.title,
            description: a.desc ?? null,
            ownerEmail: a.owner,
            externalRef: a.ref ?? null,
            status: a.status,
            dueAt: a.dueDays != null ? new Date(Date.now() + a.dueDays * 86_400_000) : null,
            completedAt: a.status === "DONE" ? new Date(Date.now() - 86_400_000) : null,
          },
        });
      }
    }
  }

  console.log(
    `  ✓ ${components.length} status components, 3 maintenance windows, 6 runbooks, ${incs.length} incidents with timeline + comms + mitigations + action items`,
  );
}

/* ── Page 55 — Network restrictions seed ───────────────── */

async function seedNetwork(
  staff: { id: string; email: string; name: string | null }[],
  tenants: { id: string; name: string; slug: string }[],
) {
  console.log("── Seeding Network restrictions (Page 55)…");
  const reviewer = staff[0];
  if (!reviewer) {
    console.log("  skipped — no platform staff");
    return;
  }

  // 1. Bot mitigation singleton.
  await db.botMitigationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: true,
      botScoreThreshold: 60,
      actionAboveThreshold: "CHALLENGE",
      challengeProvider: "TURNSTILE",
      defaultRpmPerIp: 120,
      managedBotAllowlist: true,
      notes: "Cloudflare Turnstile fronts all auth + checkout. Googlebot/Bingbot allowlisted via verified-bot list.",
      updatedById: reviewer.id,
    },
    update: {},
  });

  // 2. Network feeds.
  type FeedBp = {
    kind: "TOR" | "VPN_COMMERCIAL" | "OPEN_PROXY" | "DATACENTER" | "KNOWN_SCANNER" | "CRYPTO_MINER";
    enabled: boolean;
    sourceName: string;
    feedUrl?: string;
    entryCount: number;
    hits24h: number;
    overrideCidrs?: string[];
    notes?: string;
    syncedHoursAgo: number;
  };
  const feeds: FeedBp[] = [
    { kind: "TOR", enabled: true, sourceName: "[seed] Tor Project exit list",
      feedUrl: "https://check.torproject.org/torbulkexitlist",
      entryCount: 1942, hits24h: 184,
      overrideCidrs: ["198.51.100.0/24"],
      notes: "Override allows research staff working from Tor.",
      syncedHoursAgo: 1 },
    { kind: "VPN_COMMERCIAL", enabled: true, sourceName: "[seed] Spur.us — commercial VPN feed",
      entryCount: 38_412, hits24h: 612,
      notes: "Score >0.85 → challenge; >0.95 → block.",
      syncedHoursAgo: 6 },
    { kind: "OPEN_PROXY", enabled: true, sourceName: "[seed] IPHub open-proxy feed",
      entryCount: 14_220, hits24h: 318,
      syncedHoursAgo: 4 },
    { kind: "DATACENTER", enabled: false, sourceName: "[seed] AWS / GCP / Azure published ranges",
      entryCount: 86_412, hits24h: 0,
      notes: "Disabled — too aggressive (legitimate webhooks come from datacenters).",
      syncedHoursAgo: 24 },
    { kind: "KNOWN_SCANNER", enabled: true, sourceName: "[seed] Talos known-scanner feed",
      entryCount: 4_120, hits24h: 142,
      syncedHoursAgo: 2 },
    { kind: "CRYPTO_MINER", enabled: true, sourceName: "[seed] CryptoJacking pool list",
      entryCount: 612, hits24h: 38,
      syncedHoursAgo: 12 },
  ];
  for (const f of feeds) {
    await db.networkFeedToggle.upsert({
      where: { kind: f.kind },
      create: {
        kind: f.kind,
        enabled: f.enabled,
        sourceName: f.sourceName,
        feedUrl: f.feedUrl ?? null,
        entryCount: f.entryCount,
        hits24h: f.hits24h,
        overrideCidrs: f.overrideCidrs ?? [],
        notes: f.notes ?? null,
        lastSyncedAt: new Date(Date.now() - f.syncedHoursAgo * 3_600_000),
      },
      update: {
        enabled: f.enabled,
        sourceName: f.sourceName,
        entryCount: f.entryCount,
        hits24h: f.hits24h,
        overrideCidrs: f.overrideCidrs ?? [],
        notes: f.notes ?? null,
        lastSyncedAt: new Date(Date.now() - f.syncedHoursAgo * 3_600_000),
      },
    });
  }

  // 3. Network rules.
  type RuleBp = {
    scope: "GLOBAL_ALLOW" | "GLOBAL_BLOCK" | "TENANT_ALLOW" | "TENANT_BLOCK";
    cidr: string;
    description: string;
    tag?: string;
    tenantIdx?: number;
    active?: boolean;
    expiresDaysAhead?: number;
    hits24h: number;
    hitsTotal: number;
    lastHitHoursAgo?: number;
  };
  const rules: RuleBp[] = [
    { scope: "GLOBAL_ALLOW", cidr: "203.0.113.0/24",
      description: "[seed] Flowtora corporate office — Austin", tag: "office",
      hits24h: 412, hitsTotal: 142_812, lastHitHoursAgo: 0 },
    { scope: "GLOBAL_ALLOW", cidr: "198.51.100.0/24",
      description: "[seed] Flowtora corporate office — Berlin", tag: "office",
      hits24h: 220, hitsTotal: 89_212, lastHitHoursAgo: 0 },
    { scope: "GLOBAL_ALLOW", cidr: "192.0.2.50/32",
      description: "[seed] Vendor jump host — NCC Group", tag: "vendor",
      hits24h: 14, hitsTotal: 1_120, lastHitHoursAgo: 6,
      expiresDaysAhead: 90 },
    { scope: "GLOBAL_ALLOW", cidr: "2001:db8::/32",
      description: "[seed] Flowtora corporate IPv6 prefix", tag: "office",
      hits24h: 38, hitsTotal: 4_412, lastHitHoursAgo: 1 },
    { scope: "GLOBAL_BLOCK", cidr: "45.33.32.0/24",
      description: "[seed] Confirmed credential-stuffing source — banned 2026-04-22",
      tag: "abuse", hits24h: 4_812, hitsTotal: 24_120, lastHitHoursAgo: 0 },
    { scope: "GLOBAL_BLOCK", cidr: "5.188.10.0/22",
      description: "[seed] Russia-based scanning ASN", tag: "abuse",
      hits24h: 1_220, hitsTotal: 12_412, lastHitHoursAgo: 0 },
    { scope: "GLOBAL_BLOCK", cidr: "185.220.101.0/24",
      description: "[seed] Tor exit cluster — auto-promoted from Tor feed", tag: "tor-promoted",
      hits24h: 612, hitsTotal: 8_412, lastHitHoursAgo: 0 },
    { scope: "GLOBAL_BLOCK", cidr: "104.16.0.0/12",
      description: "[seed] Misclassified Cloudflare range — paused for review",
      tag: "review", active: false, hits24h: 0, hitsTotal: 0 },
  ];
  if (tenants.length >= 1) {
    rules.push({ scope: "TENANT_ALLOW", cidr: "172.16.0.0/12",
      description: "[seed] Tenant Acme — internal corporate range",
      tag: "tenant-office", tenantIdx: 0, hits24h: 220, hitsTotal: 24_412, lastHitHoursAgo: 0 });
    rules.push({ scope: "TENANT_BLOCK", cidr: "10.0.0.0/8",
      description: "[seed] Tenant Acme — block private RFC1918 from public flows",
      tag: "rfc1918", tenantIdx: 0, hits24h: 4, hitsTotal: 142, lastHitHoursAgo: 12 });
  }
  if (tenants.length >= 2) {
    rules.push({ scope: "TENANT_ALLOW", cidr: "192.168.42.0/24",
      description: "[seed] Tenant Bigshop — warehouse VLAN",
      tag: "warehouse", tenantIdx: 1, hits24h: 142, hitsTotal: 12_412, lastHitHoursAgo: 1 });
  }
  for (const r of rules) {
    const tenantId = r.tenantIdx != null ? tenants[r.tenantIdx]?.id ?? null : null;
    try {
      await db.networkRule.create({
        data: {
          scope: r.scope,
          cidr: r.cidr,
          description: r.description,
          tag: r.tag ?? null,
          tenantId,
          active: r.active ?? true,
          expiresAt: r.expiresDaysAhead != null ? new Date(Date.now() + r.expiresDaysAhead * 86_400_000) : null,
          hits24h: r.hits24h,
          hitsTotal: r.hitsTotal,
          lastHitAt: r.lastHitHoursAgo != null ? new Date(Date.now() - r.lastHitHoursAgo * 3_600_000) : null,
          createdById: reviewer.id,
          createdByEmail: reviewer.email,
        },
      });
    } catch {
      // Duplicate — skip.
    }
  }

  // 4. Tenant network configs.
  if (tenants.length >= 1) {
    await db.tenantNetworkConfig.upsert({
      where: { tenantId: tenants[0]!.id },
      create: {
        tenantId: tenants[0]!.id,
        mode: "ALLOWLIST_ONLY",
        supportBypass: true,
        notes: "Strict: only allow from Acme corporate ranges. Flowtora support gets a bypass via SLA agreement.",
        updatedById: reviewer.id,
      },
      update: {
        mode: "ALLOWLIST_ONLY",
        supportBypass: true,
      },
    });
  }
  if (tenants.length >= 2) {
    await db.tenantNetworkConfig.upsert({
      where: { tenantId: tenants[1]!.id },
      create: {
        tenantId: tenants[1]!.id,
        mode: "BLOCKLIST",
        supportBypass: true,
        notes: "Default-allow but blocks problematic ranges flagged by Bigshop's IT team.",
        updatedById: reviewer.id,
      },
      update: { mode: "BLOCKLIST" },
    });
  }
  if (tenants.length >= 3) {
    await db.tenantNetworkConfig.upsert({
      where: { tenantId: tenants[2]!.id },
      create: {
        tenantId: tenants[2]!.id,
        mode: "DISABLED",
        supportBypass: true,
        notes: "Pacific West has no IP restrictions enabled (small team).",
        updatedById: reviewer.id,
      },
      update: { mode: "DISABLED" },
    });
  }

  // 5. Geo restrictions — small set covering common sanctions + a manual rule.
  const geoEntries = [
    { code: "RU", name: "Russia",      iso3: "RUS", mode: "BLOCK"     as const, source: "OFAC"        as const, hits24h: 412, notes: "[seed] OFAC sanctions" },
    { code: "BY", name: "Belarus",     iso3: "BLR", mode: "BLOCK"     as const, source: "OFAC"        as const, hits24h: 38,  notes: "[seed] OFAC sanctions" },
    { code: "IR", name: "Iran",        iso3: "IRN", mode: "BLOCK"     as const, source: "OFAC"        as const, hits24h: 12,  notes: "[seed] OFAC sanctions" },
    { code: "KP", name: "North Korea", iso3: "PRK", mode: "BLOCK"     as const, source: "OFAC"        as const, hits24h: 0,   notes: "[seed] OFAC sanctions" },
    { code: "SY", name: "Syria",       iso3: "SYR", mode: "BLOCK"     as const, source: "OFAC"        as const, hits24h: 0,   notes: "[seed] OFAC sanctions" },
    { code: "CU", name: "Cuba",        iso3: "CUB", mode: "BLOCK"     as const, source: "OFAC"        as const, hits24h: 0,   notes: "[seed] OFAC sanctions" },
    { code: "VE", name: "Venezuela",   iso3: "VEN", mode: "CHALLENGE" as const, source: "OFAC"        as const, hits24h: 28,  notes: "[seed] Targeted sanctions — challenge unverified" },
    { code: "CN", name: "China",       iso3: "CHN", mode: "CHALLENGE" as const, source: "MANUAL"      as const, hits24h: 612, notes: "[seed] Manual: high scanner traffic; challenge non-tenant IPs" },
    { code: "MM", name: "Myanmar",     iso3: "MMR", mode: "BLOCK"     as const, source: "EU_SANCTIONS" as const, hits24h: 0, notes: "[seed] EU sanctions" },
    { code: "US", name: "United States", iso3: "USA", mode: "ALLOW"   as const, source: "MANUAL"      as const, hits24h: 184_120, notes: "[seed] Allowlist" },
    { code: "GB", name: "United Kingdom", iso3: "GBR", mode: "ALLOW" as const, source: "MANUAL"      as const, hits24h: 38_412, notes: "[seed] Allowlist" },
    { code: "DE", name: "Germany",     iso3: "DEU", mode: "ALLOW"     as const, source: "MANUAL"      as const, hits24h: 22_812, notes: "[seed] Allowlist" },
  ];
  for (const g of geoEntries) {
    await db.geoRestriction.upsert({
      where: { countryCode: g.code },
      create: {
        countryCode: g.code, countryName: g.name, iso3: g.iso3,
        mode: g.mode, source: g.source,
        hits24h: g.hits24h, hitsTotal: g.hits24h * 30,
        lastHitAt: g.hits24h > 0 ? new Date(Date.now() - 60_000) : null,
        notes: g.notes,
        lastSyncedAt: new Date(Date.now() - 86_400_000),
      },
      update: {
        mode: g.mode, source: g.source,
        hits24h: g.hits24h, hitsTotal: g.hits24h * 30,
        notes: g.notes,
      },
    });
  }

  // 6. DDoS events.
  await db.ddosEvent.createMany({
    data: [
      { startedAt: daysAgo(2),   endedAt: daysAgo(2 - 0.05), durationSec: 4_320,
        status: "MITIGATED", vector: "HTTP_FLOOD",
        peakMbps: 240, peakMpps: 1, sourceIpCount: 14_812,
        attribution: "Mirai-variant botnet", summary: "[seed] Mass HTTP/2 RST flood — auto-blocked by Cloudflare.",
        mitigationLayer: "Cloudflare Magic Transit + WAF" },
      { startedAt: daysAgo(8),   endedAt: daysAgo(8 - 0.02), durationSec: 1_800,
        status: "MITIGATED", vector: "SYN_FLOOD",
        peakMbps: 880, peakMpps: 5, sourceIpCount: 24_412,
        attribution: "ASN-X spoofed",
        summary: "[seed] SYN flood at L4 — absorbed by AWS Shield Advanced.",
        mitigationLayer: "AWS Shield Advanced" },
      { startedAt: daysAgo(20),  endedAt: daysAgo(20 - 0.04), durationSec: 3_600,
        status: "MITIGATED", vector: "DNS_AMPLIFICATION",
        peakMbps: 12_400, peakMpps: 42, sourceIpCount: 142_812,
        attribution: "Open resolvers — global", summary: "[seed] Large DNS amp — fully mitigated upstream.",
        mitigationLayer: "Cloudflare Magic Transit" },
      { startedAt: daysAgo(35),  endedAt: daysAgo(35 - 0.06), durationSec: 5_400,
        status: "MITIGATED", vector: "APPLICATION_LAYER",
        peakMbps: 80, peakMpps: 0, sourceIpCount: 4_212,
        attribution: "Bot operator targeting /api/login",
        summary: "[seed] Layer 7 — credential stuffing fan-out. Rate-limited + IPs blocked.",
        mitigationLayer: "Cloudflare WAF + custom rate limit" },
      { startedAt: daysAgo(60),  endedAt: daysAgo(60 - 0.01), durationSec: 600,
        status: "ARCHIVED", vector: "SLOWLORIS",
        peakMbps: 2, peakMpps: 0, sourceIpCount: 412,
        attribution: "Researcher",
        summary: "[seed] Trivial Slowloris attempt — no impact.",
        mitigationLayer: "Built-in keepalive timeout" },
    ],
  });

  // 7. WAF rules.
  await db.wafRule.createMany({
    data: [
      { name: "[seed] OWASP CRS 942100 — SQL injection (boolean-based)",
        description: "OWASP Core Rule Set — boolean-based SQL injection",
        type: "OWASP_CRS",
        matchExpr: "(?i)(\\bor\\b|\\band\\b)\\s+\\d+=\\d+",
        action: "BLOCK", enabled: true, priority: 10,
        externalId: "942100", tag: "sql-injection",
        hits24h: 12, hitsTotal: 4_412, lastHitAt: new Date(Date.now() - 12 * 60_000) },
      { name: "[seed] OWASP CRS 941100 — XSS reflected",
        description: "Reflected XSS detection",
        type: "OWASP_CRS",
        matchExpr: "(?i)<script[^>]*>",
        action: "BLOCK", enabled: true, priority: 11,
        externalId: "941100", tag: "xss",
        hits24h: 38, hitsTotal: 12_412, lastHitAt: new Date(Date.now() - 4 * 60_000) },
      { name: "[seed] Login rate-limit — 30/min/IP",
        description: "Limit POST /api/auth/login to 30 attempts per minute per IP",
        type: "RATE_LIMIT",
        matchExpr: "POST /api/auth/login",
        action: "CHALLENGE", enabled: true, priority: 20,
        tag: "auth",
        hits24h: 220, hitsTotal: 89_412, lastHitAt: new Date(Date.now() - 60_000) },
      { name: "[seed] Block scanners by UA",
        description: "Block common scanner User-Agents (sqlmap, nikto, nuclei, etc.)",
        type: "CUSTOM_REGEX",
        matchExpr: "(?i)(sqlmap|nikto|nuclei|wpscan|acunetix|burpcollaborator|nmap)",
        action: "BLOCK", enabled: true, priority: 30,
        tag: "scanners",
        hits24h: 412, hitsTotal: 24_412, lastHitAt: new Date(Date.now() - 30_000) },
      { name: "[seed] Block requests from low-reputation IPs",
        description: "Cloudflare IP reputation score >= high",
        type: "IP_REPUTATION",
        matchExpr: "ip.threat_score > 50",
        action: "CHALLENGE", enabled: true, priority: 40,
        tag: "reputation",
        hits24h: 612, hitsTotal: 142_812, lastHitAt: new Date(Date.now() - 60_000) },
      { name: "[seed] Geofence — block sanctioned countries",
        description: "Block-list countries (RU, BY, IR, KP, SY, CU)",
        type: "GEOFENCE",
        matchExpr: "geo.country in {RU BY IR KP SY CU}",
        action: "BLOCK", enabled: true, priority: 50,
        tag: "geo",
        hits24h: 462, hitsTotal: 28_412, lastHitAt: new Date(Date.now() - 90_000) },
      { name: "[seed] Managed bot mode — challenge non-verified bots",
        description: "Cloudflare managed bot mode",
        type: "MANAGED_BOT",
        matchExpr: "bot_score < 30",
        action: "CHALLENGE", enabled: true, priority: 60,
        tag: "bots",
        hits24h: 1_812, hitsTotal: 412_812, lastHitAt: new Date(Date.now() - 60_000) },
      { name: "[seed] Custom — block /api/admin from non-allowlisted IPs",
        description: "Defence-in-depth for /api/admin endpoints",
        type: "CUSTOM_REGEX",
        matchExpr: "^/api/admin/.+ AND !ip in {office-allowlist}",
        action: "BLOCK", enabled: true, priority: 5,
        tag: "admin",
        hits24h: 0, hitsTotal: 0 },
      { name: "[seed] Log only — anomalous JSON depth",
        description: "Log requests with very deep JSON nesting (potential RDoS)",
        type: "CUSTOM_REGEX",
        matchExpr: "json.depth > 50",
        action: "LOG", enabled: true, priority: 80,
        tag: "rdos",
        hits24h: 4, hitsTotal: 142 },
      { name: "[seed] Disabled — legacy SQLi rule (fp-prone)",
        description: "Older SQLi rule with high false-positive rate. Kept for archive.",
        type: "OWASP_CRS",
        matchExpr: "(?i)\\b(union|select)\\b",
        action: "LOG", enabled: false, priority: 90,
        externalId: "942110", tag: "sql-injection",
        hits24h: 0, hitsTotal: 0 },
    ],
  });

  console.log(
    `  ✓ ${rules.length} network rules, ${geoEntries.length} geo, ${feeds.length} feeds, 5 DDoS events, 10 WAF rules, ${tenants.length} tenant configs`,
  );
}

/* ── Page 56 — System Status seed ──────────────────────── */

async function seedSystemStatus() {
  console.log("── Seeding System Status (Page 56)…");

  type SvcBp = {
    slug: string;
    name: string;
    kind: "API" | "WEB_APP" | "AUTH" | "DB_PRIMARY" | "DB_REPLICA" | "REDIS"
        | "QUEUE_WORKER" | "OBJECT_STORAGE" | "SEARCH" | "EMAIL" | "WEBHOOKS"
        | "CDN" | "WEBSOCKET" | "AI" | "CRON" | "OTHER";
    description: string;
    status: "OPERATIONAL" | "DEGRADED" | "PARTIAL_OUTAGE" | "MAJOR_OUTAGE" | "MAINTENANCE";
    region: string;
    uptime30dPct: number;
    uptime90dPct: number;
    runbookSlug?: string;
    /** Baseline metric ranges. */
    baseRps:    [number, number];
    baseErr:    [number, number]; // 0..100
    baseP50:    [number, number];
    baseP95:    [number, number];
    baseP99:    [number, number];
    baseCpu:    [number, number];
    baseMem:    [number, number];
    /** Whether to inject a degradation in the last 12h for the spark. */
    degradedTail?: boolean;
    displayOrder: number;
  };
  const services: SvcBp[] = [
    { slug: "seed-api", name: "Public API", kind: "API",
      description: "REST API gateway", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.98, uptime90dPct: 99.95,
      runbookSlug: "seed-deploy-rollback",
      baseRps: [380, 460], baseErr: [0.05, 0.4], baseP50: [40, 80], baseP95: [120, 220], baseP99: [220, 380],
      baseCpu: [25, 45], baseMem: [40, 60],
      displayOrder: 10 },
    { slug: "seed-web", name: "Web app", kind: "WEB_APP",
      description: "app.flowtora.com — Next.js + Vercel", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.99, uptime90dPct: 99.97,
      baseRps: [220, 300], baseErr: [0.02, 0.3], baseP50: [60, 110], baseP95: [180, 280], baseP99: [320, 480],
      baseCpu: [15, 30], baseMem: [30, 50],
      displayOrder: 20 },
    { slug: "seed-auth", name: "Auth", kind: "AUTH",
      description: "NextAuth + 2FA + SAML", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.99, uptime90dPct: 99.96,
      runbookSlug: "seed-saml-callback-failure",
      baseRps: [60, 100], baseErr: [0.01, 0.2], baseP50: [30, 70], baseP95: [80, 160], baseP99: [140, 260],
      baseCpu: [10, 25], baseMem: [25, 45],
      displayOrder: 30 },
    { slug: "seed-db-primary", name: "DB primary", kind: "DB_PRIMARY",
      description: "Neon Postgres — primary", status: "OPERATIONAL",
      region: "us-east-1", uptime30dPct: 99.99, uptime90dPct: 99.99,
      runbookSlug: "seed-postgres-replica-lag",
      baseRps: [880, 1200], baseErr: [0.01, 0.05], baseP50: [2, 8], baseP95: [10, 28], baseP99: [25, 60],
      baseCpu: [40, 65], baseMem: [60, 80],
      displayOrder: 40 },
    { slug: "seed-db-replica", name: "DB replica (eu-west-1)", kind: "DB_REPLICA",
      description: "Neon read replica — Europe", status: "DEGRADED",
      region: "eu-west-1", uptime30dPct: 99.92, uptime90dPct: 99.88,
      runbookSlug: "seed-postgres-replica-lag",
      baseRps: [380, 520], baseErr: [0.05, 0.3], baseP50: [4, 18], baseP95: [22, 80], baseP99: [60, 180],
      baseCpu: [55, 78], baseMem: [70, 88],
      degradedTail: true,
      displayOrder: 41 },
    { slug: "seed-redis", name: "Redis", kind: "REDIS",
      description: "ElastiCache — sessions + queues", status: "OPERATIONAL",
      region: "us-east-1", uptime30dPct: 99.97, uptime90dPct: 99.93,
      runbookSlug: "seed-redis-failover",
      baseRps: [1800, 2400], baseErr: [0, 0.05], baseP50: [1, 3], baseP95: [4, 9], baseP99: [9, 22],
      baseCpu: [35, 55], baseMem: [50, 70],
      displayOrder: 50 },
    { slug: "seed-queue", name: "Queue workers", kind: "QUEUE_WORKER",
      description: "Background job runners", status: "OPERATIONAL",
      region: "us-east-1", uptime30dPct: 99.96, uptime90dPct: 99.93,
      baseRps: [40, 80], baseErr: [0.5, 1.5], baseP50: [200, 400], baseP95: [800, 1600], baseP99: [1600, 3200],
      baseCpu: [40, 70], baseMem: [50, 75],
      displayOrder: 60 },
    { slug: "seed-storage", name: "Object storage", kind: "OBJECT_STORAGE",
      description: "S3 + Cloudflare R2 mirror", status: "OPERATIONAL",
      region: "us-east-1", uptime30dPct: 99.99, uptime90dPct: 99.98,
      baseRps: [180, 280], baseErr: [0.01, 0.1], baseP50: [10, 30], baseP95: [40, 100], baseP99: [80, 220],
      baseCpu: [20, 40], baseMem: [30, 50],
      displayOrder: 70 },
    { slug: "seed-search", name: "Search", kind: "SEARCH",
      description: "Elasticsearch", status: "MAINTENANCE",
      region: "us-east-1", uptime30dPct: 99.85, uptime90dPct: 99.80,
      baseRps: [80, 140], baseErr: [0.1, 0.5], baseP50: [40, 90], baseP95: [120, 280], baseP99: [220, 480],
      baseCpu: [60, 85], baseMem: [70, 90],
      degradedTail: true,
      displayOrder: 80 },
    { slug: "seed-email", name: "Email delivery", kind: "EMAIL",
      description: "Resend transactional email", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.95, uptime90dPct: 99.90,
      baseRps: [10, 30], baseErr: [0.05, 0.4], baseP50: [60, 140], baseP95: [180, 380], baseP99: [320, 720],
      baseCpu: [10, 25], baseMem: [20, 40],
      displayOrder: 90 },
    { slug: "seed-webhooks", name: "Webhooks", kind: "WEBHOOKS",
      description: "Outbound webhook fanout", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.96, uptime90dPct: 99.93,
      baseRps: [60, 120], baseErr: [0.5, 2.0], baseP50: [80, 180], baseP95: [220, 480], baseP99: [380, 880],
      baseCpu: [25, 45], baseMem: [35, 55],
      displayOrder: 100 },
    { slug: "seed-cdn", name: "CDN", kind: "CDN",
      description: "Cloudflare + Vercel edge", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.99, uptime90dPct: 99.99,
      baseRps: [4800, 6800], baseErr: [0.01, 0.1], baseP50: [10, 25], baseP95: [40, 90], baseP99: [80, 180],
      baseCpu: [10, 20], baseMem: [15, 30],
      displayOrder: 110 },
    { slug: "seed-ws", name: "WebSocket", kind: "WEBSOCKET",
      description: "Realtime channel", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.94, uptime90dPct: 99.90,
      baseRps: [180, 280], baseErr: [0.05, 0.3], baseP50: [10, 25], baseP95: [40, 80], baseP99: [80, 180],
      baseCpu: [20, 40], baseMem: [25, 50],
      displayOrder: 120 },
    { slug: "seed-ai", name: "AI services", kind: "AI",
      description: "Anthropic-backed AI helpers", status: "OPERATIONAL",
      region: "global", uptime30dPct: 99.92, uptime90dPct: 99.85,
      baseRps: [4, 18], baseErr: [0.5, 2.0], baseP50: [800, 1800], baseP95: [2400, 4400], baseP99: [4000, 7200],
      baseCpu: [5, 15], baseMem: [10, 20],
      displayOrder: 130 },
    { slug: "seed-cron", name: "Cron / scheduler", kind: "CRON",
      description: "Scheduled jobs runner", status: "OPERATIONAL",
      region: "us-east-1", uptime30dPct: 99.98, uptime90dPct: 99.95,
      baseRps: [1, 4], baseErr: [0.5, 1.5], baseP50: [120, 300], baseP95: [400, 1200], baseP99: [800, 2400],
      baseCpu: [10, 25], baseMem: [15, 30],
      displayOrder: 140 },
  ];

  const idBySlug = new Map<string, string>();
  for (const s of services) {
    const saved = await db.systemService.upsert({
      where: { slug: s.slug },
      create: {
        slug: s.slug, name: s.name, kind: s.kind, description: s.description,
        status: s.status, region: s.region,
        uptime30dPct: s.uptime30dPct, uptime90dPct: s.uptime90dPct,
        runbookSlug: s.runbookSlug ?? null,
        displayOrder: s.displayOrder,
      },
      update: {
        name: s.name, kind: s.kind, description: s.description,
        status: s.status, region: s.region,
        uptime30dPct: s.uptime30dPct, uptime90dPct: s.uptime90dPct,
        runbookSlug: s.runbookSlug ?? null,
        displayOrder: s.displayOrder,
      },
      select: { id: true },
    });
    idBySlug.set(s.slug, saved.id);
  }

  // Dependencies (directional).
  const depEdges: Array<{ from: string; to: string; kind: string; critical: boolean }> = [
    { from: "seed-web",      to: "seed-api",          kind: "calls",      critical: true  },
    { from: "seed-web",      to: "seed-cdn",          kind: "fronted-by", critical: false },
    { from: "seed-web",      to: "seed-ws",           kind: "calls",      critical: false },
    { from: "seed-api",      to: "seed-auth",         kind: "calls",      critical: true  },
    { from: "seed-api",      to: "seed-db-primary",   kind: "writes",     critical: true  },
    { from: "seed-api",      to: "seed-redis",        kind: "calls",      critical: true  },
    { from: "seed-api",      to: "seed-search",       kind: "calls",      critical: false },
    { from: "seed-api",      to: "seed-storage",      kind: "calls",      critical: false },
    { from: "seed-api",      to: "seed-queue",        kind: "publishes",  critical: false },
    { from: "seed-api",      to: "seed-ai",           kind: "calls",      critical: false },
    { from: "seed-auth",     to: "seed-db-primary",   kind: "reads",      critical: true  },
    { from: "seed-auth",     to: "seed-redis",        kind: "calls",      critical: true  },
    { from: "seed-queue",    to: "seed-db-primary",   kind: "writes",     critical: true  },
    { from: "seed-queue",    to: "seed-redis",        kind: "calls",      critical: true  },
    { from: "seed-queue",    to: "seed-email",        kind: "calls",      critical: false },
    { from: "seed-queue",    to: "seed-webhooks",     kind: "publishes",  critical: false },
    { from: "seed-cron",     to: "seed-queue",        kind: "publishes",  critical: false },
    { from: "seed-cron",     to: "seed-db-primary",   kind: "writes",     critical: false },
    { from: "seed-db-replica", to: "seed-db-primary", kind: "replicates", critical: true  },
    { from: "seed-webhooks", to: "seed-redis",        kind: "calls",      critical: false },
    { from: "seed-storage",  to: "seed-cdn",          kind: "fronted-by", critical: false },
    { from: "seed-ws",       to: "seed-redis",        kind: "calls",      critical: false },
  ];
  for (const e of depEdges) {
    const fromId = idBySlug.get(e.from);
    const toId = idBySlug.get(e.to);
    if (!fromId || !toId) continue;
    await db.serviceDependency.upsert({
      where: { fromId_toId: { fromId, toId } },
      create: { fromId, toId, kind: e.kind, critical: e.critical },
      update: { kind: e.kind, critical: e.critical },
    });
  }

  // Time-series samples — last 24h, 30-min granularity (48 samples per service).
  // Heavy-ish but capped at 15 services × 48 = 720 rows.
  const now = Date.now();
  const stepMs = 30 * 60_000;
  const totalSamples = 48;
  const sampleRows: Array<{
    serviceId: string;
    occurredAt: Date;
    rps: number; errorPct: number; p50Ms: number; p95Ms: number; p99Ms: number;
    cpuPct: number; memPct: number;
  }> = [];
  for (const s of services) {
    const id = idBySlug.get(s.slug);
    if (!id) continue;
    let lastRps = randInt(s.baseRps[0], s.baseRps[1]);
    let lastErr = Math.random() * (s.baseErr[1] - s.baseErr[0]) + s.baseErr[0];
    let lastP50 = randInt(s.baseP50[0], s.baseP50[1]);
    let lastP95 = randInt(s.baseP95[0], s.baseP95[1]);
    let lastP99 = randInt(s.baseP99[0], s.baseP99[1]);
    let lastCpu = Math.random() * (s.baseCpu[1] - s.baseCpu[0]) + s.baseCpu[0];
    let lastMem = Math.random() * (s.baseMem[1] - s.baseMem[0]) + s.baseMem[0];
    for (let i = 0; i < totalSamples; i++) {
      const t = new Date(now - (totalSamples - 1 - i) * stepMs);
      // Drift gently within the band.
      lastRps = Math.max(0, Math.round(lastRps * (0.95 + Math.random() * 0.1)));
      lastErr = Math.min(20, Math.max(0, lastErr + (Math.random() - 0.5) * 0.2));
      lastP50 = Math.max(1, Math.round(lastP50 * (0.95 + Math.random() * 0.1)));
      lastP95 = Math.max(2, Math.round(lastP95 * (0.95 + Math.random() * 0.1)));
      lastP99 = Math.max(3, Math.round(lastP99 * (0.95 + Math.random() * 0.1)));
      lastCpu = Math.min(100, Math.max(0, lastCpu + (Math.random() - 0.5) * 5));
      lastMem = Math.min(100, Math.max(0, lastMem + (Math.random() - 0.5) * 3));
      // For services flagged degradedTail, push the last 12h higher.
      if (s.degradedTail && i > totalSamples - 24) {
        lastErr = Math.min(20, lastErr * 1.6 + 0.5);
        lastP95 = Math.round(lastP95 * 1.4);
        lastP99 = Math.round(lastP99 * 1.6);
        lastCpu = Math.min(100, lastCpu * 1.15);
      }
      sampleRows.push({
        serviceId: id, occurredAt: t,
        rps: lastRps, errorPct: Math.round(lastErr * 100) / 100,
        p50Ms: lastP50, p95Ms: lastP95, p99Ms: lastP99,
        cpuPct: Math.round(lastCpu * 10) / 10, memPct: Math.round(lastMem * 10) / 10,
      });
    }
    // Update latest-* on the service row.
    const last = sampleRows[sampleRows.length - 1]!;
    await db.systemService.update({
      where: { id },
      data: {
        latestRps: last.rps, latestErrorPct: last.errorPct,
        latestP50Ms: last.p50Ms, latestP95Ms: last.p95Ms, latestP99Ms: last.p99Ms,
        latestCpuPct: last.cpuPct, latestMemPct: last.memPct,
      },
    });
  }
  // Bulk insert in chunks.
  for (let i = 0; i < sampleRows.length; i += 200) {
    await db.serviceMetricSample.createMany({
      data: sampleRows.slice(i, i + 200),
      skipDuplicates: true,
    });
  }

  // Alerts — a few firing on degraded services.
  if (idBySlug.has("seed-db-replica")) {
    await db.serviceAlert.create({
      data: {
        serviceId: idBySlug.get("seed-db-replica")!,
        severity: "WARNING", status: "FIRING",
        title: "[seed] Replica lag >60s for 5min",
        description: "Replica is behind primary; check replication slot status.",
        source: "Datadog", fireCount: 4,
        firedAt: new Date(Date.now() - 12 * 60_000),
      },
    });
  }
  if (idBySlug.has("seed-search")) {
    await db.serviceAlert.create({
      data: {
        serviceId: idBySlug.get("seed-search")!,
        severity: "INFO", status: "ACKNOWLEDGED",
        title: "[seed] Search reindex in progress",
        description: "Maintenance window auto-acknowledged.",
        source: "Manual", fireCount: 1,
        firedAt: new Date(Date.now() - 70 * 60_000),
        acknowledgedAt: new Date(Date.now() - 60 * 60_000),
      },
    });
  }
  if (idBySlug.has("seed-queue")) {
    await db.serviceAlert.create({
      data: {
        serviceId: idBySlug.get("seed-queue")!,
        severity: "WARNING", status: "RESOLVED",
        title: "[seed] Queue depth elevated",
        description: "Resolved after autoscaler kicked in.",
        source: "Datadog", fireCount: 1,
        firedAt: new Date(Date.now() - 240 * 60_000),
        resolvedAt: new Date(Date.now() - 180 * 60_000),
      },
    });
  }

  // Recent deploys overlaid on the chart.
  const deployRows: Array<{
    serviceId: string; ref: string; title?: string; source?: string;
    status: "SUCCEEDED" | "FAILED" | "ROLLED_BACK";
    deployedHoursAgo: number;
  }> = [];
  if (idBySlug.has("seed-api")) {
    deployRows.push({ serviceId: idBySlug.get("seed-api")!, ref: "v1.42.8", title: "API: invoice export hardening",
      source: "Vercel", status: "SUCCEEDED", deployedHoursAgo: 4 });
    deployRows.push({ serviceId: idBySlug.get("seed-api")!, ref: "v1.42.7", title: "API: webhook signing refactor",
      source: "Vercel", status: "ROLLED_BACK", deployedHoursAgo: 22 });
  }
  if (idBySlug.has("seed-web")) {
    deployRows.push({ serviceId: idBySlug.get("seed-web")!, ref: "v1.42.8", title: "Web: a11y improvements",
      source: "Vercel", status: "SUCCEEDED", deployedHoursAgo: 4 });
  }
  if (idBySlug.has("seed-queue")) {
    deployRows.push({ serviceId: idBySlug.get("seed-queue")!, ref: "v1.42.8", title: "Queue: backoff tweaks",
      source: "GitHub Actions", status: "SUCCEEDED", deployedHoursAgo: 4 });
  }
  if (idBySlug.has("seed-search")) {
    deployRows.push({ serviceId: idBySlug.get("seed-search")!, ref: "es-7.18 → 8.13", title: "Search: ES upgrade",
      source: "Manual", status: "IN_PROGRESS" as never, deployedHoursAgo: 1 });
  }
  if (idBySlug.has("seed-ai")) {
    deployRows.push({ serviceId: idBySlug.get("seed-ai")!, ref: "model-2026-04", title: "AI: model update",
      source: "Anthropic", status: "SUCCEEDED", deployedHoursAgo: 12 });
  }
  for (const d of deployRows) {
    await db.serviceDeployMarker.create({
      data: {
        serviceId: d.serviceId, ref: d.ref, title: d.title ?? null, source: d.source ?? null,
        status: d.status as "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "ROLLED_BACK",
        deployedAt: new Date(Date.now() - d.deployedHoursAgo * 3_600_000),
      },
    });
  }

  console.log(
    `  ✓ ${services.length} services, ${depEdges.length} dependencies, ${sampleRows.length} metric samples, 3 alerts, ${deployRows.length} deploys`,
  );
}

/* ── Page 57 — Queues seed ─────────────────────────────── */

async function seedQueues(tenants: { id: string; name: string; slug: string }[]) {
  console.log("── Seeding Queues & Jobs (Page 57)…");

  type QBp = {
    slug: string;
    name: string;
    description: string;
    backend: "BULLMQ" | "SQS" | "CLOUD_TASKS" | "REDIS_QUEUE" | "KAFKA" | "OTHER";
    status: "ACTIVE" | "PAUSED" | "DRAINING" | "STOPPED";
    concurrency: number;
    active: number;
    waiting: number;
    delayed: number;
    completed24h: number;
    failed24h: number;
    throughputJpm: number;
    avgDurationMs: number;
    p95Ms: number;
    deadLetters: number;
  };
  const queueBps: QBp[] = [
    { slug: "seed-email-send", name: "Email send", description: "Transactional + marketing email outbound",
      backend: "BULLMQ", status: "ACTIVE", concurrency: 50,
      active: 6, waiting: 184, delayed: 12, completed24h: 12_842, failed24h: 38, throughputJpm: 220,
      avgDurationMs: 280, p95Ms: 820, deadLetters: 4 },
    { slug: "seed-webhooks-deliver", name: "Webhook delivery", description: "Outbound webhook fanout per tenant",
      backend: "BULLMQ", status: "ACTIVE", concurrency: 80,
      active: 18, waiting: 412, delayed: 220, completed24h: 38_412, failed24h: 612, throughputJpm: 880,
      avgDurationMs: 380, p95Ms: 1_200, deadLetters: 14 },
    { slug: "seed-billing-dunning", name: "Billing dunning", description: "Late-payment reminder emails + retries",
      backend: "BULLMQ", status: "ACTIVE", concurrency: 10,
      active: 2, waiting: 38, delayed: 0, completed24h: 412, failed24h: 4, throughputJpm: 12,
      avgDurationMs: 540, p95Ms: 1_400, deadLetters: 0 },
    { slug: "seed-ai-summarize", name: "AI summarize", description: "Anthropic summarize calls",
      backend: "CLOUD_TASKS", status: "ACTIVE", concurrency: 20,
      active: 8, waiting: 220, delayed: 12, completed24h: 6_412, failed24h: 18, throughputJpm: 142,
      avgDurationMs: 2_200, p95Ms: 4_800, deadLetters: 2 },
    { slug: "seed-search-index", name: "Search reindex", description: "Elasticsearch indexer",
      backend: "BULLMQ", status: "DRAINING", concurrency: 5,
      active: 4, waiting: 1_812, delayed: 0, completed24h: 24_412, failed24h: 12, throughputJpm: 380,
      avgDurationMs: 120, p95Ms: 380, deadLetters: 0 },
    { slug: "seed-image-thumb", name: "Image thumbnails", description: "Thumbnail generation for proofs",
      backend: "BULLMQ", status: "ACTIVE", concurrency: 30,
      active: 12, waiting: 38, delayed: 0, completed24h: 18_412, failed24h: 142, throughputJpm: 412,
      avgDurationMs: 880, p95Ms: 2_400, deadLetters: 8 },
    { slug: "seed-tenant-export", name: "Tenant export", description: "Per-tenant data export ZIPs",
      backend: "SQS", status: "ACTIVE", concurrency: 4,
      active: 1, waiting: 6, delayed: 0, completed24h: 24, failed24h: 1, throughputJpm: 1,
      avgDurationMs: 18_400, p95Ms: 42_000, deadLetters: 0 },
    { slug: "seed-stripe-webhook", name: "Stripe webhook handler", description: "Inbound Stripe events fan-out",
      backend: "BULLMQ", status: "ACTIVE", concurrency: 12,
      active: 2, waiting: 412, delayed: 0, completed24h: 4_412, failed24h: 24, throughputJpm: 78,
      avgDurationMs: 320, p95Ms: 980, deadLetters: 1 },
    { slug: "seed-audit-archive", name: "Audit log archive", description: "Daily rollup → S3",
      backend: "REDIS_QUEUE", status: "PAUSED", concurrency: 1,
      active: 0, waiting: 0, delayed: 0, completed24h: 24, failed24h: 0, throughputJpm: 0,
      avgDurationMs: 12_000, p95Ms: 28_400, deadLetters: 0 },
    { slug: "seed-pdf-render", name: "PDF render", description: "Invoice + report PDF generation",
      backend: "BULLMQ", status: "ACTIVE", concurrency: 8,
      active: 3, waiting: 12, delayed: 0, completed24h: 1_412, failed24h: 18, throughputJpm: 22,
      avgDurationMs: 1_400, p95Ms: 3_800, deadLetters: 2 },
  ];
  const idBySlug = new Map<string, string>();
  for (const q of queueBps) {
    const saved = await db.jobQueue.upsert({
      where: { slug: q.slug },
      create: {
        slug: q.slug, name: q.name, description: q.description,
        backend: q.backend, status: q.status, concurrency: q.concurrency,
        active: q.active, waiting: q.waiting, delayed: q.delayed,
        completed24h: q.completed24h, failed24h: q.failed24h,
        throughputJpm: q.throughputJpm,
        avgDurationMs: q.avgDurationMs, p95Ms: q.p95Ms,
        deadLetters: q.deadLetters,
      },
      update: {
        name: q.name, status: q.status, concurrency: q.concurrency,
        active: q.active, waiting: q.waiting, delayed: q.delayed,
        completed24h: q.completed24h, failed24h: q.failed24h,
        throughputJpm: q.throughputJpm,
        avgDurationMs: q.avgDurationMs, p95Ms: q.p95Ms,
        deadLetters: q.deadLetters,
      },
      select: { id: true },
    });
    idBySlug.set(q.slug, saved.id);
  }

  // Workers — 12 processes across pools.
  type WBp = {
    workerId: string;
    pool: string;
    queues: string[];
    status: "RUNNING" | "IDLE" | "STARTING" | "STOPPED" | "CRASHED" | "UPGRADING";
    activeJobs: number;
    memMb: number;
    cpuPct: number;
    version: string;
    hostname: string;
    pid: number;
    heartbeatMinAgo: number;
  };
  const workerBps: WBp[] = [
    { workerId: "seed-w-general-1",  pool: "general",  queues: ["seed-email-send", "seed-webhooks-deliver", "seed-pdf-render"], status: "RUNNING",  activeJobs: 18, memMb: 312, cpuPct: 42.5, version: "1.42.8", hostname: "worker-01.flowtora.internal", pid: 18412, heartbeatMinAgo: 0 },
    { workerId: "seed-w-general-2",  pool: "general",  queues: ["seed-email-send", "seed-webhooks-deliver", "seed-pdf-render"], status: "RUNNING",  activeJobs: 22, memMb: 380, cpuPct: 58.0, version: "1.42.8", hostname: "worker-02.flowtora.internal", pid: 18413, heartbeatMinAgo: 0 },
    { workerId: "seed-w-general-3",  pool: "general",  queues: ["seed-email-send", "seed-webhooks-deliver", "seed-pdf-render"], status: "RUNNING",  activeJobs: 14, memMb: 295, cpuPct: 38.2, version: "1.42.8", hostname: "worker-03.flowtora.internal", pid: 18414, heartbeatMinAgo: 0 },
    { workerId: "seed-w-cpu-1",      pool: "high-cpu", queues: ["seed-image-thumb", "seed-pdf-render"],                          status: "RUNNING",  activeJobs: 8,  memMb: 1_840, cpuPct: 78.4, version: "1.42.8", hostname: "worker-cpu-01.flowtora.internal", pid: 4812, heartbeatMinAgo: 0 },
    { workerId: "seed-w-cpu-2",      pool: "high-cpu", queues: ["seed-image-thumb", "seed-pdf-render"],                          status: "RUNNING",  activeJobs: 6,  memMb: 1_720, cpuPct: 71.2, version: "1.42.8", hostname: "worker-cpu-02.flowtora.internal", pid: 4813, heartbeatMinAgo: 0 },
    { workerId: "seed-w-ai-1",       pool: "ai",       queues: ["seed-ai-summarize"],                                            status: "RUNNING",  activeJobs: 4,  memMb: 220, cpuPct: 12.4, version: "1.42.8", hostname: "worker-ai-01.flowtora.internal", pid: 9412, heartbeatMinAgo: 0 },
    { workerId: "seed-w-ai-2",       pool: "ai",       queues: ["seed-ai-summarize"],                                            status: "RUNNING",  activeJobs: 4,  memMb: 220, cpuPct: 14.8, version: "1.42.8", hostname: "worker-ai-02.flowtora.internal", pid: 9413, heartbeatMinAgo: 0 },
    { workerId: "seed-w-search-1",   pool: "search",   queues: ["seed-search-index"],                                            status: "RUNNING",  activeJobs: 4,  memMb: 540, cpuPct: 32.1, version: "1.42.8", hostname: "worker-search-01.flowtora.internal", pid: 6612, heartbeatMinAgo: 0 },
    { workerId: "seed-w-billing-1",  pool: "billing",  queues: ["seed-billing-dunning", "seed-stripe-webhook"],                  status: "RUNNING",  activeJobs: 2,  memMb: 180, cpuPct: 18.4, version: "1.42.8", hostname: "worker-bill-01.flowtora.internal", pid: 7712, heartbeatMinAgo: 0 },
    { workerId: "seed-w-export-1",   pool: "export",   queues: ["seed-tenant-export"],                                           status: "RUNNING",  activeJobs: 1,  memMb: 1_200, cpuPct: 24.8, version: "1.42.8", hostname: "worker-export-01.flowtora.internal", pid: 8812, heartbeatMinAgo: 0 },
    { workerId: "seed-w-archive-1",  pool: "archive",  queues: ["seed-audit-archive"],                                           status: "IDLE",     activeJobs: 0,  memMb: 80,  cpuPct: 0.4, version: "1.42.8", hostname: "worker-arc-01.flowtora.internal", pid: 9912, heartbeatMinAgo: 1 },
    { workerId: "seed-w-canary-1",   pool: "canary",   queues: ["seed-email-send", "seed-webhooks-deliver"],                     status: "UPGRADING", activeJobs: 0,  memMb: 0,   cpuPct: 0.0, version: "1.42.9-rc.1", hostname: "worker-canary-01.flowtora.internal", pid: 4242, heartbeatMinAgo: 2 },
    { workerId: "seed-w-crashed-1",  pool: "general",  queues: ["seed-email-send"],                                              status: "CRASHED",  activeJobs: 0,  memMb: 0,   cpuPct: 0.0, version: "1.42.7",   hostname: "worker-04.flowtora.internal", pid: 5512, heartbeatMinAgo: 12 },
  ];
  for (const w of workerBps) {
    const primaryQueueId = w.queues.length > 0 ? idBySlug.get(w.queues[0]!) ?? null : null;
    await db.queueWorker.upsert({
      where: { workerId: w.workerId },
      create: {
        workerId: w.workerId, pool: w.pool, queues: w.queues,
        primaryQueueId,
        status: w.status, activeJobs: w.activeJobs,
        memMb: w.memMb, cpuPct: w.cpuPct, version: w.version,
        hostname: w.hostname, pid: w.pid,
        lastHeartbeatAt: new Date(Date.now() - w.heartbeatMinAgo * 60_000),
      },
      update: {
        status: w.status, activeJobs: w.activeJobs,
        memMb: w.memMb, cpuPct: w.cpuPct, version: w.version,
        lastHeartbeatAt: new Date(Date.now() - w.heartbeatMinAgo * 60_000),
      },
    });
  }

  // Cron schedules.
  type CBp = {
    slug: string; name: string; expression: string; description?: string;
    timezone?: string; ownerEmail?: string;
    queueSlug?: string;
    enabled: boolean;
    status: "ACTIVE" | "DISABLED" | "ERRORED" | "RUNNING_NOW";
    lastRunHoursAgo?: number;
    nextRunHoursAhead?: number;
    lastDurationMs?: number;
    lastResult?: string;
  };
  const cronBps: CBp[] = [
    { slug: "seed-cron-billing-dunning", name: "Billing dunning sweep", expression: "0 */6 * * *",
      description: "Run every 6h to send dunning emails for overdue invoices.",
      ownerEmail: "billing@flowtora.com", queueSlug: "seed-billing-dunning", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 1.5, nextRunHoursAhead: 4.5, lastDurationMs: 14_200, lastResult: "412 invoices processed; 38 reminders sent." },
    { slug: "seed-cron-search-index", name: "Search reindex (incremental)", expression: "*/15 * * * *",
      description: "Incremental search reindex every 15 min.",
      ownerEmail: "engineering@flowtora.com", queueSlug: "seed-search-index", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 0.2, nextRunHoursAhead: 0.05, lastDurationMs: 1_840, lastResult: "Indexed 412 rows." },
    { slug: "seed-cron-audit-archive", name: "Audit log nightly archive", expression: "0 3 * * *",
      description: "Daily roll-up of audit log → S3 Glacier.",
      ownerEmail: "compliance@flowtora.com", queueSlug: "seed-audit-archive", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 8, nextRunHoursAhead: 16, lastDurationMs: 12_400, lastResult: "Archived 184,212 rows." },
    { slug: "seed-cron-tenant-snapshots", name: "Tenant snapshots", expression: "0 4 * * *",
      description: "Per-tenant DB snapshots for restore drills.",
      ownerEmail: "sre@flowtora.com", queueSlug: "seed-tenant-export", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 7, nextRunHoursAhead: 17, lastDurationMs: 245_000, lastResult: "All snapshots verified." },
    { slug: "seed-cron-feature-flag-cleanup", name: "Feature flag cleanup", expression: "0 5 * * 1",
      description: "Weekly cleanup of stale feature flags.",
      ownerEmail: "engineering@flowtora.com", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 96, nextRunHoursAhead: 72, lastDurationMs: 4_800, lastResult: "Archived 4 flags older than 6 months." },
    { slug: "seed-cron-newsletter-digest", name: "Newsletter weekly digest", expression: "0 13 * * 4",
      description: "Thursday-noon digest send.",
      ownerEmail: "marketing@flowtora.com", queueSlug: "seed-email-send", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 168, nextRunHoursAhead: 0, lastDurationMs: 142_000, lastResult: "Sent to 38,412 subscribers." },
    { slug: "seed-cron-trial-expiry", name: "Trial expiry reminder", expression: "0 9 * * *",
      description: "Send trial-expiry reminders 3/1 days before end.",
      ownerEmail: "growth@flowtora.com", queueSlug: "seed-email-send", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 16, nextRunHoursAhead: 8, lastDurationMs: 8_400, lastResult: "84 reminders sent." },
    { slug: "seed-cron-stripe-reconcile", name: "Stripe reconcile", expression: "*/30 * * * *",
      description: "Reconcile Stripe events with internal ledger.",
      ownerEmail: "billing@flowtora.com", queueSlug: "seed-stripe-webhook", enabled: true, status: "RUNNING_NOW",
      lastRunHoursAgo: 0.01, nextRunHoursAhead: 0.49, lastDurationMs: 1_200, lastResult: "Currently running." },
    { slug: "seed-cron-old-export-cleanup", name: "Old export cleanup", expression: "0 2 * * *",
      description: "Delete tenant exports older than 7 days.",
      ownerEmail: "compliance@flowtora.com", enabled: true, status: "ACTIVE",
      lastRunHoursAgo: 9, nextRunHoursAhead: 15, lastDurationMs: 3_400, lastResult: "Deleted 24 files." },
    { slug: "seed-cron-broken-feature", name: "(disabled) AI training feedback", expression: "0 0 * * *",
      description: "Disabled — last run errored on 2026-04-18.",
      ownerEmail: "ai@flowtora.com", enabled: false, status: "DISABLED",
      lastRunHoursAgo: 240, nextRunHoursAhead: 0, lastDurationMs: 4, lastResult: "Errored: missing model checkpoint." },
  ];
  for (const c of cronBps) {
    await db.cronSchedule.upsert({
      where: { slug: c.slug },
      create: {
        slug: c.slug, name: c.name, description: c.description ?? null,
        expression: c.expression, ownerEmail: c.ownerEmail ?? null,
        timezone: c.timezone ?? "UTC",
        enabled: c.enabled, status: c.status,
        lastRunAt: c.lastRunHoursAgo != null ? new Date(Date.now() - c.lastRunHoursAgo * 3_600_000) : null,
        nextRunAt: c.nextRunHoursAhead != null ? new Date(Date.now() + c.nextRunHoursAhead * 3_600_000) : null,
        lastDurationMs: c.lastDurationMs ?? null,
        lastResult: c.lastResult ?? null,
        queueId: c.queueSlug ? idBySlug.get(c.queueSlug) ?? null : null,
      },
      update: {
        name: c.name, expression: c.expression,
        enabled: c.enabled, status: c.status,
        lastRunAt: c.lastRunHoursAgo != null ? new Date(Date.now() - c.lastRunHoursAgo * 3_600_000) : null,
        nextRunAt: c.nextRunHoursAhead != null ? new Date(Date.now() + c.nextRunHoursAhead * 3_600_000) : null,
        lastDurationMs: c.lastDurationMs ?? null,
        lastResult: c.lastResult ?? null,
      },
    });
  }

  // Jobs — failed + DLQ + completed (slowest).
  type JBp = {
    queueSlug: string;
    externalId: string;
    jobName: string;
    status: "FAILED" | "DEAD_LETTER" | "COMPLETED";
    attempts: number;
    durationMs?: number;
    errorClass?: string;
    errorMessage?: string;
    payload: string;
    tenantIdx?: number;
    relativeMin: number;
  };
  const jobsToCreate: JBp[] = [
    // Failed jobs (mix across queues)
    { queueSlug: "seed-email-send", externalId: "EM-2026-04-23-0001", jobName: "email.send.invoice",
      status: "FAILED", attempts: 3,
      errorClass: "ResendError", errorMessage: "5xx from Resend — retry queue exhausted",
      payload: '{"to":"redacted","template":"invoice.send","tenantId":"redacted","invoiceId":"INV-***"}',
      tenantIdx: 0, relativeMin: 4 },
    { queueSlug: "seed-email-send", externalId: "EM-2026-04-23-0002", jobName: "email.send.dunning",
      status: "FAILED", attempts: 2,
      errorClass: "BounceError", errorMessage: "Hard bounce: invalid recipient",
      payload: '{"to":"redacted","template":"dunning.day3","tenantId":"redacted"}',
      tenantIdx: 1, relativeMin: 9 },
    { queueSlug: "seed-webhooks-deliver", externalId: "WH-2026-04-23-1042", jobName: "webhook.deliver",
      status: "FAILED", attempts: 5,
      errorClass: "TimeoutError", errorMessage: "Tenant endpoint timed out after 5000ms",
      payload: '{"event":"order.created","subscriberId":"redacted","attempts":5}',
      tenantIdx: 2, relativeMin: 14 },
    { queueSlug: "seed-webhooks-deliver", externalId: "WH-2026-04-23-1043", jobName: "webhook.deliver",
      status: "FAILED", attempts: 5,
      errorClass: "SignatureMismatch", errorMessage: "HMAC verification failed on receiver side",
      payload: '{"event":"invoice.sent","subscriberId":"redacted"}',
      tenantIdx: 0, relativeMin: 22 },
    { queueSlug: "seed-image-thumb", externalId: "IM-2026-04-23-3041", jobName: "image.thumbnail",
      status: "FAILED", attempts: 2,
      errorClass: "ImageMagickError", errorMessage: "Failed to read source image (corrupt PNG header)",
      payload: '{"sourceKey":"redacted/proofs/abc.png","sizes":[200,400,800]}',
      tenantIdx: 1, relativeMin: 28 },
    { queueSlug: "seed-stripe-webhook", externalId: "ST-2026-04-23-1822", jobName: "stripe.webhook.invoice_paid",
      status: "FAILED", attempts: 1,
      errorClass: "DBError", errorMessage: "Replica lag exceeded — write rejected",
      payload: '{"event":"invoice.paid","invoiceId":"in_***"}',
      relativeMin: 35 },
    { queueSlug: "seed-pdf-render", externalId: "PD-2026-04-23-0412", jobName: "pdf.render.invoice",
      status: "FAILED", attempts: 3,
      errorClass: "ChromiumCrash", errorMessage: "Headless Chromium crashed with code -11",
      payload: '{"templateId":"invoice","invoiceId":"INV-***"}',
      tenantIdx: 0, relativeMin: 42 },
    { queueSlug: "seed-ai-summarize", externalId: "AI-2026-04-23-2042", jobName: "ai.summarize.proof",
      status: "FAILED", attempts: 2,
      errorClass: "AnthropicError", errorMessage: "Rate-limited (429); will retry with backoff",
      payload: '{"proofId":"redacted","model":"claude-sonnet-4.7"}',
      tenantIdx: 2, relativeMin: 48 },
    // Dead-letter
    { queueSlug: "seed-email-send", externalId: "EM-2026-04-22-0044", jobName: "email.send.welcome",
      status: "DEAD_LETTER", attempts: 5,
      errorClass: "BounceError", errorMessage: "Permanent bounce after 5 attempts",
      payload: '{"to":"redacted","template":"welcome"}',
      tenantIdx: 1, relativeMin: 1_400 },
    { queueSlug: "seed-webhooks-deliver", externalId: "WH-2026-04-21-9912", jobName: "webhook.deliver",
      status: "DEAD_LETTER", attempts: 7,
      errorClass: "EndpointGone", errorMessage: "Subscriber endpoint returned 410 Gone",
      payload: '{"event":"order.shipped","subscriberId":"redacted"}',
      tenantIdx: 0, relativeMin: 2_840 },
    { queueSlug: "seed-image-thumb", externalId: "IM-2026-04-22-1124", jobName: "image.thumbnail",
      status: "DEAD_LETTER", attempts: 3,
      errorClass: "ImageMagickError", errorMessage: "Repeated decode failure",
      payload: '{"sourceKey":"redacted/proofs/xyz.heic"}',
      tenantIdx: 2, relativeMin: 1_840 },
    { queueSlug: "seed-pdf-render", externalId: "PD-2026-04-22-0844", jobName: "pdf.render.report",
      status: "DEAD_LETTER", attempts: 4,
      errorClass: "TimeoutError", errorMessage: "Render >120s",
      payload: '{"templateId":"report-monthly","reportId":"redacted"}',
      tenantIdx: 0, relativeMin: 1_220 },
    // Completed — slowest examples
    { queueSlug: "seed-tenant-export", externalId: "TX-2026-04-23-0014", jobName: "tenant.export.bundle",
      status: "COMPLETED", attempts: 1, durationMs: 84_200,
      payload: '{"tenantId":"redacted","scope":"full","format":"zip"}',
      tenantIdx: 0, relativeMin: 220 },
    { queueSlug: "seed-tenant-export", externalId: "TX-2026-04-23-0015", jobName: "tenant.export.bundle",
      status: "COMPLETED", attempts: 1, durationMs: 62_400,
      payload: '{"tenantId":"redacted","scope":"customers,orders,invoices"}',
      tenantIdx: 1, relativeMin: 320 },
    { queueSlug: "seed-pdf-render", externalId: "PD-2026-04-23-0014", jobName: "pdf.render.report",
      status: "COMPLETED", attempts: 1, durationMs: 18_400,
      payload: '{"templateId":"report-monthly","reportId":"redacted"}',
      tenantIdx: 0, relativeMin: 96 },
    { queueSlug: "seed-ai-summarize", externalId: "AI-2026-04-23-1841", jobName: "ai.summarize.proof",
      status: "COMPLETED", attempts: 1, durationMs: 6_400,
      payload: '{"proofId":"redacted","model":"claude-sonnet-4.7"}',
      tenantIdx: 2, relativeMin: 72 },
    { queueSlug: "seed-ai-summarize", externalId: "AI-2026-04-23-1842", jobName: "ai.summarize.audit",
      status: "COMPLETED", attempts: 1, durationMs: 4_800,
      payload: '{"auditId":"redacted","model":"claude-sonnet-4.7"}',
      relativeMin: 81 },
    { queueSlug: "seed-image-thumb", externalId: "IM-2026-04-23-2412", jobName: "image.thumbnail",
      status: "COMPLETED", attempts: 1, durationMs: 3_200,
      payload: '{"sourceKey":"redacted/proofs/big.heic","sizes":[200,400,800]}',
      tenantIdx: 1, relativeMin: 12 },
    { queueSlug: "seed-search-index", externalId: "SR-2026-04-23-2014", jobName: "search.reindex.batch",
      status: "COMPLETED", attempts: 1, durationMs: 1_842,
      payload: '{"batchId":"redacted","size":412}',
      relativeMin: 6 },
  ];
  for (const j of jobsToCreate) {
    const queueId = idBySlug.get(j.queueSlug);
    if (!queueId) continue;
    const enq = new Date(Date.now() - j.relativeMin * 60_000);
    await db.queueJob.upsert({
      where: { queueId_externalId: { queueId, externalId: j.externalId } },
      create: {
        queueId, externalId: j.externalId, jobName: j.jobName,
        status: j.status, attempts: j.attempts,
        durationMs: j.durationMs ?? null,
        errorClass: j.errorClass ?? null,
        errorMessage: j.errorMessage ?? null,
        payloadSummary: j.payload,
        tenantId: j.tenantIdx != null ? tenants[j.tenantIdx]?.id ?? null : null,
        enqueuedAt: enq,
        startedAt: enq,
        completedAt: j.status === "COMPLETED" ? new Date(enq.getTime() + (j.durationMs ?? 0)) : null,
        failedAt: j.status === "FAILED" ? new Date(enq.getTime() + 60_000) : null,
        deadLetteredAt: j.status === "DEAD_LETTER" ? new Date(enq.getTime() + 5 * 60_000) : null,
      },
      update: {
        status: j.status, attempts: j.attempts,
        durationMs: j.durationMs ?? null,
      },
    });
  }

  console.log(
    `  ✓ ${queueBps.length} queues, ${workerBps.length} workers, ${cronBps.length} cron schedules, ${jobsToCreate.length} jobs (failed + DLQ + completed)`,
  );
}

/* ── Page 58 — Email Deliverability seed ───────────────── */

async function seedEmailDeliverability(tenants: { id: string; name: string; slug: string }[]) {
  console.log("── Seeding Email Deliverability (Page 58)…");

  // 1. Settings singleton.
  await db.emailDeliverabilitySettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      bounceTargetPct: 2.0,
      complaintTargetPct: 0.1,
      autoSuppressOnComplaint: true,
      autoSuppressOnHardBounce: true,
      softBounceBackoffH: 72,
      failoverOrder: ["seed-resend", "seed-sendgrid", "seed-ses-bulk"],
      notes: "Resend primary for transactional; SES bulk for marketing >10k.",
    },
    update: {},
  });

  // 2. Providers.
  type PBp = {
    key: string;
    name: string;
    role: "PRIMARY" | "BACKUP" | "BULK" | "TRANSACTIONAL" | "DISABLED";
    health: "HEALTHY" | "DEGRADED" | "WARNING" | "OFFLINE";
    costPer1000Cents: number;
    autoFailover: boolean;
    dailyCap: number;
    sent24h: number;
    bounceRate24h: number;
    complaintRate24h: number;
    errorRate24h: number;
    domains: string[];
    notes?: string;
  };
  const providers: PBp[] = [
    { key: "seed-resend",   name: "Resend",   role: "PRIMARY", health: "HEALTHY",
      costPer1000Cents: 80, autoFailover: true, dailyCap: 100_000,
      sent24h: 14_812, bounceRate24h: 0.42, complaintRate24h: 0.04, errorRate24h: 0.05,
      domains: ["flowtora.com", "go.flowtora.com"],
      notes: "Primary route for transactional + low-volume marketing." },
    { key: "seed-sendgrid", name: "SendGrid", role: "BACKUP", health: "HEALTHY",
      costPer1000Cents: 95, autoFailover: true, dailyCap: 200_000,
      sent24h: 1_204, bounceRate24h: 0.6, complaintRate24h: 0.08, errorRate24h: 0.1,
      domains: ["flowtora.com"],
      notes: "Backup — takes over when Resend bounce rate spikes." },
    { key: "seed-ses-bulk", name: "AWS SES (bulk)", role: "BULK", health: "DEGRADED",
      costPer1000Cents: 10, autoFailover: false, dailyCap: 1_000_000,
      sent24h: 38_412, bounceRate24h: 1.4, complaintRate24h: 0.12, errorRate24h: 0.3,
      domains: ["mail.flowtora.com"],
      notes: "Bulk send (newsletters, digests). Currently degraded — investigating." },
    { key: "seed-postmark", name: "Postmark (transactional fallback)", role: "TRANSACTIONAL", health: "HEALTHY",
      costPer1000Cents: 100, autoFailover: true, dailyCap: 50_000,
      sent24h: 220, bounceRate24h: 0.2, complaintRate24h: 0.02, errorRate24h: 0.0,
      domains: ["flowtora.com"],
      notes: "Secondary transactional path for password resets if Resend down." },
    { key: "seed-mailgun-disabled", name: "Mailgun (decommissioned)", role: "DISABLED", health: "OFFLINE",
      costPer1000Cents: 80, autoFailover: false, dailyCap: 0,
      sent24h: 0, bounceRate24h: 0, complaintRate24h: 0, errorRate24h: 0,
      domains: [],
      notes: "Decommissioned 2026-02. Kept for audit." },
  ];
  for (const p of providers) {
    await db.emailProvider.upsert({
      where: { key: p.key },
      create: {
        key: p.key, name: p.name, role: p.role, health: p.health,
        costPer1000Cents: p.costPer1000Cents, autoFailover: p.autoFailover,
        dailyCap: p.dailyCap, sent24h: p.sent24h,
        bounceRate24h: p.bounceRate24h, complaintRate24h: p.complaintRate24h,
        errorRate24h: p.errorRate24h, domains: p.domains,
        notes: p.notes ?? null,
        lastDeliveredAt: p.sent24h > 0 ? new Date(Date.now() - 60_000) : null,
      },
      update: {
        role: p.role, health: p.health, sent24h: p.sent24h,
        bounceRate24h: p.bounceRate24h, complaintRate24h: p.complaintRate24h,
        errorRate24h: p.errorRate24h,
      },
    });
  }

  // 3. Sending domains.
  type DBp = {
    domain: string;
    hostname?: string;
    mxRecord?: string;
    spfRecord?: string;
    spfStatus: "PASS" | "FAIL" | "WARN" | "UNCONFIGURED";
    dkimStatus: "PASS" | "FAIL" | "WARN" | "UNCONFIGURED";
    dkimSelectors?: string[];
    dmarcRecord?: string;
    dmarcStatus: "PASS" | "FAIL" | "WARN" | "UNCONFIGURED";
    dmarcPolicy?: string;
    dmarcReportingUri?: string;
    bimiStatus: "PASS" | "FAIL" | "WARN" | "UNCONFIGURED";
    bimiVmcUrl?: string;
    bimiRecord?: string;
    verifiedDaysAgo: number;
    notes?: string;
  };
  const domains: DBp[] = [
    { domain: "seed-flowtora.com",
      hostname: "mail.flowtora.com", mxRecord: "10 mx.aspmx.l.google.com",
      spfRecord: "v=spf1 include:_spf.resend.com include:amazonses.com -all", spfStatus: "PASS",
      dkimSelectors: ["resend._domainkey", "sgkey._domainkey"], dkimStatus: "PASS",
      dmarcRecord: "v=DMARC1; p=quarantine; rua=mailto:dmarc@flowtora.com; pct=100",
      dmarcStatus: "PASS", dmarcPolicy: "quarantine",
      dmarcReportingUri: "mailto:dmarc@flowtora.com",
      bimiStatus: "PASS", bimiVmcUrl: "https://docs.flowtora.com/bimi/flowtora.pem",
      bimiRecord: "v=BIMI1; l=https://flowtora.com/bimi-logo.svg; a=https://docs.flowtora.com/bimi/flowtora.pem",
      verifiedDaysAgo: 1, notes: "Primary marketing + transactional domain." },
    { domain: "seed-go.flowtora.com",
      hostname: "go.flowtora.com",
      spfRecord: "v=spf1 include:_spf.resend.com -all", spfStatus: "PASS",
      dkimSelectors: ["resend._domainkey"], dkimStatus: "PASS",
      dmarcRecord: "v=DMARC1; p=reject; rua=mailto:dmarc@flowtora.com",
      dmarcStatus: "PASS", dmarcPolicy: "reject",
      dmarcReportingUri: "mailto:dmarc@flowtora.com",
      bimiStatus: "UNCONFIGURED",
      verifiedDaysAgo: 1, notes: "Click-tracking subdomain." },
    { domain: "seed-mail.flowtora.com",
      hostname: "mail.flowtora.com",
      spfRecord: "v=spf1 include:amazonses.com -all", spfStatus: "PASS",
      dkimSelectors: ["amazonses._domainkey"], dkimStatus: "WARN",
      dmarcRecord: "v=DMARC1; p=quarantine; rua=mailto:dmarc@flowtora.com",
      dmarcStatus: "PASS", dmarcPolicy: "quarantine",
      bimiStatus: "UNCONFIGURED",
      verifiedDaysAgo: 4, notes: "Bulk-send subdomain — DKIM key rotation pending." },
    { domain: "seed-staging.flowtora.app",
      spfRecord: "v=spf1 include:_spf.resend.com -all", spfStatus: "PASS",
      dkimSelectors: ["resend._domainkey"], dkimStatus: "PASS",
      dmarcRecord: "v=DMARC1; p=none; rua=mailto:dmarc@flowtora.com",
      dmarcStatus: "WARN", dmarcPolicy: "none",
      bimiStatus: "UNCONFIGURED",
      verifiedDaysAgo: 18, notes: "Staging — DMARC still at p=none." },
    { domain: "seed-old-mail.flowtora.com",
      spfStatus: "UNCONFIGURED", dkimStatus: "UNCONFIGURED",
      dmarcStatus: "UNCONFIGURED",
      bimiStatus: "UNCONFIGURED",
      verifiedDaysAgo: 90, notes: "Decommissioned — kept for audit." },
  ];
  const domainIdByDomain = new Map<string, string>();
  for (const d of domains) {
    const saved = await db.emailSendingDomain.upsert({
      where: { domain: d.domain },
      create: {
        domain: d.domain,
        hostname: d.hostname ?? null,
        mxRecord: d.mxRecord ?? null,
        spfRecord: d.spfRecord ?? null,
        spfStatus: d.spfStatus,
        dkimSelectors: (d.dkimSelectors ?? []) as never,
        dkimStatus: d.dkimStatus,
        dmarcRecord: d.dmarcRecord ?? null,
        dmarcStatus: d.dmarcStatus,
        dmarcPolicy: d.dmarcPolicy ?? null,
        dmarcReportingUri: d.dmarcReportingUri ?? null,
        bimiRecord: d.bimiRecord ?? null,
        bimiStatus: d.bimiStatus,
        bimiVmcUrl: d.bimiVmcUrl ?? null,
        lastVerifiedAt: daysAgo(d.verifiedDaysAgo),
        lastDmarcReportAt: d.dmarcStatus === "PASS" ? daysAgo(2) : null,
        notes: d.notes ?? null,
      },
      update: {
        spfStatus: d.spfStatus, dkimStatus: d.dkimStatus,
        dmarcStatus: d.dmarcStatus, bimiStatus: d.bimiStatus,
        lastVerifiedAt: daysAgo(d.verifiedDaysAgo),
      },
      select: { id: true, domain: true },
    });
    domainIdByDomain.set(saved.domain, saved.id);
  }

  // DMARC reports for primary domain.
  const primaryDomainId = domainIdByDomain.get("seed-flowtora.com");
  if (primaryDomainId) {
    await db.dmarcReport.createMany({
      data: [
        { domainId: primaryDomainId, reporter: "google.com",
          periodStart: daysAgo(2), periodEnd: daysAgo(1),
          totalMessages: 14_812, passCount: 14_780, failCount: 32,
          sources: [
            { ip: "199.255.192.105", count: 12_412, spf: "pass", dkim: "pass", disposition: "none" },
            { ip: "35.190.247.45", count: 2_400, spf: "pass", dkim: "pass", disposition: "none" },
          ] as never,
          receivedAt: daysAgo(1) },
        { domainId: primaryDomainId, reporter: "yahoo.com",
          periodStart: daysAgo(2), periodEnd: daysAgo(1),
          totalMessages: 1_842, passCount: 1_840, failCount: 2,
          sources: [
            { ip: "199.255.192.105", count: 1_820, spf: "pass", dkim: "pass", disposition: "none" },
          ] as never,
          receivedAt: daysAgo(1) },
        { domainId: primaryDomainId, reporter: "microsoft.com",
          periodStart: daysAgo(2), periodEnd: daysAgo(1),
          totalMessages: 612, passCount: 600, failCount: 12,
          sources: [
            { ip: "199.255.192.105", count: 600, spf: "pass", dkim: "pass", disposition: "none" },
          ] as never,
          receivedAt: daysAgo(1) },
      ],
    });
  }

  // 4. Template stats.
  type TBp = {
    templateKey: string;
    name: string;
    category: string;
    sent24h: number;
    delivered24h: number;
    opens24h: number;
    clicks24h: number;
    bounces24h: number;
    complaints24h: number;
    hasAbVariant?: boolean;
    suspended?: boolean;
    suspendedReason?: string;
  };
  const templates: TBp[] = [
    { templateKey: "seed-invoice-send", name: "Invoice — sent", category: "transactional",
      sent24h: 4_812, delivered24h: 4_801, opens24h: 2_402, clicks24h: 412, bounces24h: 11, complaints24h: 0 },
    { templateKey: "seed-invoice-paid", name: "Invoice — paid receipt", category: "transactional",
      sent24h: 3_412, delivered24h: 3_410, opens24h: 1_220, clicks24h: 184, bounces24h: 2, complaints24h: 0 },
    { templateKey: "seed-dunning-day3", name: "Dunning — day 3", category: "transactional",
      sent24h: 412, delivered24h: 410, opens24h: 220, clicks24h: 38, bounces24h: 2, complaints24h: 1, hasAbVariant: true },
    { templateKey: "seed-welcome", name: "Welcome — onboarding", category: "transactional",
      sent24h: 184, delivered24h: 184, opens24h: 142, clicks24h: 88, bounces24h: 0, complaints24h: 0, hasAbVariant: true },
    { templateKey: "seed-password-reset", name: "Password reset", category: "transactional",
      sent24h: 412, delivered24h: 412, opens24h: 380, clicks24h: 360, bounces24h: 0, complaints24h: 0 },
    { templateKey: "seed-newsletter-weekly", name: "Weekly digest", category: "marketing",
      sent24h: 38_412, delivered24h: 38_212, opens24h: 9_812, clicks24h: 1_812, bounces24h: 200, complaints24h: 24, hasAbVariant: true },
    { templateKey: "seed-feature-launch", name: "Feature launch — flow-3", category: "marketing",
      sent24h: 8_412, delivered24h: 8_400, opens24h: 2_812, clicks24h: 412, bounces24h: 12, complaints24h: 2 },
    { templateKey: "seed-trial-expiry", name: "Trial expiry reminder", category: "marketing",
      sent24h: 84, delivered24h: 84, opens24h: 60, clicks24h: 38, bounces24h: 0, complaints24h: 0 },
    { templateKey: "seed-proof-shared", name: "Proof shared — notification", category: "transactional",
      sent24h: 1_812, delivered24h: 1_810, opens24h: 1_412, clicks24h: 612, bounces24h: 2, complaints24h: 0 },
    { templateKey: "seed-bad-content", name: "Old promo — high bounce", category: "marketing",
      sent24h: 0, delivered24h: 0, opens24h: 0, clicks24h: 0, bounces24h: 0, complaints24h: 0,
      suspended: true, suspendedReason: "Bounce rate >5% — content needs review." },
  ];
  for (const t of templates) {
    const openRate   = t.sent24h === 0 ? 0 : (t.opens24h / t.sent24h) * 100;
    const clickRate  = t.sent24h === 0 ? 0 : (t.clicks24h / t.sent24h) * 100;
    const bounceRate = t.sent24h === 0 ? 0 : (t.bounces24h / t.sent24h) * 100;
    await db.emailTemplateStats.upsert({
      where: { templateKey: t.templateKey },
      create: {
        templateKey: t.templateKey, name: t.name, category: t.category,
        sent24h: t.sent24h, delivered24h: t.delivered24h,
        opens24h: t.opens24h, clicks24h: t.clicks24h,
        bounces24h: t.bounces24h, complaints24h: t.complaints24h,
        openRate, clickRate, bounceRate,
        hasAbVariant: t.hasAbVariant ?? false,
        suspended: t.suspended ?? false,
        suspendedReason: t.suspendedReason ?? null,
      },
      update: {
        sent24h: t.sent24h, delivered24h: t.delivered24h,
        opens24h: t.opens24h, clicks24h: t.clicks24h,
        bounces24h: t.bounces24h, complaints24h: t.complaints24h,
        openRate, clickRate, bounceRate,
        suspended: t.suspended ?? false,
        suspendedReason: t.suspendedReason ?? null,
      },
    });
  }

  // 5. Daily volume samples for last 30 days.
  const samples: Array<{
    day: Date;
    kind: "SENT" | "DELIVERED" | "OPEN" | "CLICK" | "BOUNCE" | "COMPLAINT" | "UNSUBSCRIBE";
    count: number;
    provider: string;
    tenantId?: string | null;
    templateKey?: string | null;
  }> = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000);
    day.setUTCHours(0, 0, 0, 0);
    const sentBase = 50_000 + Math.floor(Math.random() * 12_000);
    const sent = sentBase;
    const delivered = sent - Math.floor(sent * 0.012);
    const opens = Math.floor(delivered * (0.22 + Math.random() * 0.06));
    const clicks = Math.floor(opens * (0.12 + Math.random() * 0.05));
    const bounces = sent - delivered;
    const complaints = Math.floor(sent * (0.0003 + Math.random() * 0.0002));
    const unsubs = Math.floor(sent * (0.001 + Math.random() * 0.0005));
    samples.push({ day, kind: "SENT",        count: sent,       provider: "seed-resend" });
    samples.push({ day, kind: "DELIVERED",   count: delivered,  provider: "seed-resend" });
    samples.push({ day, kind: "OPEN",        count: opens,      provider: "seed-resend" });
    samples.push({ day, kind: "CLICK",       count: clicks,     provider: "seed-resend" });
    samples.push({ day, kind: "BOUNCE",      count: bounces,    provider: "seed-resend" });
    samples.push({ day, kind: "COMPLAINT",   count: complaints, provider: "seed-resend" });
    samples.push({ day, kind: "UNSUBSCRIBE", count: unsubs,     provider: "seed-resend" });
  }
  for (let i = 0; i < samples.length; i += 200) {
    await db.emailVolumeSample.createMany({ data: samples.slice(i, i + 200), skipDuplicates: true });
  }

  // 6. Bounces.
  type BBp = {
    recipient: string;
    type: "HARD" | "SOFT" | "BLOCK" | "CONTENT" | "UNKNOWN";
    reason: string;
    smtpCode: string;
    provider: string;
    templateKey: string;
    tenantIdx?: number;
    sentHoursAgo: number;
    bouncedHoursAgo: number;
    status: "OPEN" | "SUPPRESSED" | "INVESTIGATING" | "RESOLVED";
  };
  const bounces: BBp[] = [
    { recipient: "anja.berger-seed@example.de", type: "HARD",
      reason: "550 No such user", smtpCode: "550-5.1.1", provider: "seed-resend",
      templateKey: "seed-newsletter-weekly", tenantIdx: 0,
      sentHoursAgo: 1, bouncedHoursAgo: 1, status: "SUPPRESSED" },
    { recipient: "marcus.chen-seed@example.com", type: "HARD",
      reason: "Mailbox full", smtpCode: "552", provider: "seed-resend",
      templateKey: "seed-invoice-send", tenantIdx: 1,
      sentHoursAgo: 2, bouncedHoursAgo: 2, status: "SUPPRESSED" },
    { recipient: "lina.hofmann-seed@example.de", type: "SOFT",
      reason: "Mailbox temporarily unavailable", smtpCode: "451", provider: "seed-resend",
      templateKey: "seed-dunning-day3", tenantIdx: 0,
      sentHoursAgo: 3, bouncedHoursAgo: 2, status: "OPEN" },
    { recipient: "olivia.perez-seed@example.com", type: "BLOCK",
      reason: "Receiver blocked sender domain", smtpCode: "554-5.7.1", provider: "seed-ses-bulk",
      templateKey: "seed-newsletter-weekly", tenantIdx: 1,
      sentHoursAgo: 4, bouncedHoursAgo: 4, status: "INVESTIGATING" },
    { recipient: "henrik.larsson-seed@example.se", type: "SOFT",
      reason: "Greylisted", smtpCode: "450", provider: "seed-resend",
      templateKey: "seed-welcome", tenantIdx: 2,
      sentHoursAgo: 5, bouncedHoursAgo: 4, status: "OPEN" },
    { recipient: "sara.karimi-seed@example.fr", type: "HARD",
      reason: "Recipient domain returns NXDOMAIN", smtpCode: "550", provider: "seed-resend",
      templateKey: "seed-invoice-paid", tenantIdx: 0,
      sentHoursAgo: 6, bouncedHoursAgo: 6, status: "SUPPRESSED" },
    { recipient: "ravi.patel-seed@example.in", type: "CONTENT",
      reason: "Message rejected by content filter (spam-like subject)", smtpCode: "554",
      provider: "seed-ses-bulk", templateKey: "seed-feature-launch", tenantIdx: 2,
      sentHoursAgo: 7, bouncedHoursAgo: 7, status: "INVESTIGATING" },
    { recipient: "james.whitfield-seed@example.co.uk", type: "SOFT",
      reason: "Connection timeout", smtpCode: "421", provider: "seed-resend",
      templateKey: "seed-password-reset", tenantIdx: 0,
      sentHoursAgo: 8, bouncedHoursAgo: 7, status: "RESOLVED" },
    { recipient: "beatriz.almeida-seed@example.br", type: "HARD",
      reason: "550 5.1.1 The email account does not exist", smtpCode: "550-5.1.1",
      provider: "seed-resend", templateKey: "seed-trial-expiry", tenantIdx: 1,
      sentHoursAgo: 12, bouncedHoursAgo: 12, status: "SUPPRESSED" },
    { recipient: "emile.tremblay-seed@example.ca", type: "BLOCK",
      reason: "Blocked by SpamAssassin policy", smtpCode: "554",
      provider: "seed-ses-bulk", templateKey: "seed-newsletter-weekly", tenantIdx: 0,
      sentHoursAgo: 18, bouncedHoursAgo: 18, status: "OPEN" },
    { recipient: "mikaela.niemi-seed@example.fi", type: "HARD",
      reason: "User unknown", smtpCode: "550", provider: "seed-postmark",
      templateKey: "seed-password-reset", tenantIdx: 2,
      sentHoursAgo: 30, bouncedHoursAgo: 30, status: "SUPPRESSED" },
    { recipient: "unknown-bounce-seed@protonmail.example", type: "UNKNOWN",
      reason: "Generic delivery failure", smtpCode: "550", provider: "seed-resend",
      templateKey: "seed-newsletter-weekly",
      sentHoursAgo: 36, bouncedHoursAgo: 36, status: "OPEN" },
  ];
  await db.emailBounce.createMany({
    data: bounces.map((b) => ({
      recipient: b.recipient, type: b.type, reason: b.reason, smtpCode: b.smtpCode,
      provider: b.provider, templateKey: b.templateKey,
      tenantId: b.tenantIdx != null ? tenants[b.tenantIdx]?.id ?? null : null,
      status: b.status,
      sentAt: new Date(Date.now() - b.sentHoursAgo * 3_600_000),
      bouncedAt: new Date(Date.now() - b.bouncedHoursAgo * 3_600_000),
    })),
  });

  // 7. Complaints.
  await db.emailComplaint.createMany({
    data: [
      { recipient: "spam-complainer-seed@example.com", provider: "seed-resend",
        templateKey: "seed-newsletter-weekly", reason: "User marked as spam",
        sentAt: daysAgo(0.3), reportedAt: daysAgo(0.2), autoSuppressed: true,
        tenantId: tenants[0]?.id ?? null },
      { recipient: "unsubscribe-fast-seed@example.com", provider: "seed-ses-bulk",
        templateKey: "seed-feature-launch", reason: "User reported as junk",
        sentAt: daysAgo(0.5), reportedAt: daysAgo(0.4), autoSuppressed: true,
        tenantId: tenants[1]?.id ?? null },
      { recipient: "annoyed-seed@example.com", provider: "seed-ses-bulk",
        templateKey: "seed-newsletter-weekly", reason: "Marked as spam (FBL: Yahoo)",
        sentAt: daysAgo(1), reportedAt: daysAgo(0.9), autoSuppressed: true,
        tenantId: tenants[2]?.id ?? null },
      { recipient: "another-complaint-seed@example.com", provider: "seed-ses-bulk",
        templateKey: "seed-newsletter-weekly", reason: "User reported as spam",
        sentAt: daysAgo(2), reportedAt: daysAgo(1.9), autoSuppressed: true,
        tenantId: tenants[0]?.id ?? null },
    ],
  });

  // 8. Suppressions (from bounce/complaint + manual).
  const suppressions = [
    { email: "anja.berger-seed@example.de", source: "BOUNCE" as const, reason: "Hard bounce — 550", addedBy: "system" },
    { email: "marcus.chen-seed@example.com", source: "BOUNCE" as const, reason: "Mailbox full repeatedly", addedBy: "system" },
    { email: "sara.karimi-seed@example.fr", source: "BOUNCE" as const, reason: "NXDOMAIN", addedBy: "system" },
    { email: "beatriz.almeida-seed@example.br", source: "BOUNCE" as const, reason: "Account does not exist", addedBy: "system" },
    { email: "mikaela.niemi-seed@example.fi", source: "BOUNCE" as const, reason: "User unknown", addedBy: "system" },
    { email: "spam-complainer-seed@example.com", source: "COMPLAINT" as const, reason: "Marked as spam", addedBy: "system" },
    { email: "unsubscribe-fast-seed@example.com", source: "COMPLAINT" as const, reason: "Marked as spam", addedBy: "system" },
    { email: "annoyed-seed@example.com", source: "COMPLAINT" as const, reason: "Marked as spam (Yahoo FBL)", addedBy: "system" },
    { email: "another-complaint-seed@example.com", source: "COMPLAINT" as const, reason: "Marked as spam", addedBy: "system" },
    { email: "test1-seed.flowtora.example", source: "MANUAL" as const, reason: "Test inbox — never deliver", addedBy: "ciso@flowtora.com" },
    { email: "test2-seed.flowtora.example", source: "MANUAL" as const, reason: "Internal QA address", addedBy: "ciso@flowtora.com" },
    { email: "gdpr-request-seed@example.com", source: "GDPR_REQUEST" as const, reason: "DSR-2026-0042 — opt-out of marketing", addedBy: "dpo@flowtora.com" },
    { email: "csv-import-1-seed@example.com", source: "CSV_IMPORT" as const, reason: "Bulk import — known abuse", addedBy: "marketing@flowtora.com" },
    { email: "csv-import-2-seed@example.com", source: "CSV_IMPORT" as const, reason: "Bulk import — known abuse", addedBy: "marketing@flowtora.com" },
  ];
  for (const s of suppressions) {
    await db.emailSuppression.upsert({
      where: { email: s.email },
      create: {
        email: s.email, source: s.source, reason: s.reason,
        addedByEmail: s.addedBy,
      },
      update: { source: s.source, reason: s.reason },
    });
  }

  console.log(
    `  ✓ ${providers.length} providers, ${domains.length} domains, ${templates.length} template stats, ${samples.length} volume samples, ${bounces.length} bounces, 4 complaints, ${suppressions.length} suppressions`,
  );
}

/* ── Page 59 — Storage & CDN seed ──────────────────────── */

async function seedStorageCdn(tenants: { id: string; name: string; slug: string }[]) {
  console.log("── Seeding Storage & CDN (Page 59)…");

  // 1. Settings singleton.
  await db.storageSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      monthlyBudgetCents: 1_200_000, // $12,000/mo
      hitRateTargetPct: 95,
      notes: "Budget covers S3 + R2 + CDN + egress. Alerts at 75/90/100%.",
    },
    update: {},
  });

  // 2. Lifecycle policies.
  type LBp = {
    name: string;
    description: string;
    scope: string;
    action: "ARCHIVE" | "DELETE" | "TRANSITION_IA" | "TRANSITION_GLACIER" | "TRANSITION_DEEP_ARCHIVE" | "EXPIRE_VERSIONS";
    thresholdDays: number;
    secondaryThresholdDays?: number;
    active: boolean;
  };
  const policies: LBp[] = [
    { name: "[seed] Proofs hot→IA 90d", description: "Move proof originals to Infrequent Access after 90 days",
      scope: "proofs", action: "TRANSITION_IA", thresholdDays: 90, active: true },
    { name: "[seed] Exports delete 30d", description: "Delete tenant exports after 30 days",
      scope: "exports", action: "DELETE", thresholdDays: 30, active: true },
    { name: "[seed] Logs → Glacier 30d", description: "Move CloudTrail/audit logs to Glacier after 30 days",
      scope: "logs", action: "TRANSITION_GLACIER", thresholdDays: 30, secondaryThresholdDays: 365, active: true },
    { name: "[seed] Versions expire 90d", description: "Expire previous object versions after 90 days",
      scope: "all", action: "EXPIRE_VERSIONS", thresholdDays: 90, active: true },
    { name: "[seed] Trash delete 7d", description: "Hard-delete trashed objects after 7 days",
      scope: "trash", action: "DELETE", thresholdDays: 7, active: true },
    { name: "[seed] (paused) Migrate to R2", description: "Old plan — paused while we negotiate egress pricing.",
      scope: "all", action: "TRANSITION_IA", thresholdDays: 60, active: false },
  ];
  const policyIdByName = new Map<string, string>();
  for (const p of policies) {
    const saved = await db.storageLifecyclePolicy.upsert({
      where: { name: p.name },
      create: {
        name: p.name, description: p.description, scope: p.scope,
        action: p.action, thresholdDays: p.thresholdDays,
        secondaryThresholdDays: p.secondaryThresholdDays ?? null, active: p.active,
      },
      update: { active: p.active },
      select: { id: true, name: true },
    });
    policyIdByName.set(saved.name, saved.id);
  }

  // 3. Buckets.
  type BBp = {
    name: string;
    provider: "AWS_S3" | "CLOUDFLARE_R2" | "GCS" | "AZURE_BLOB" | "BACKBLAZE_B2" | "OTHER";
    region: string;
    encryption: "NONE" | "SSE_S3" | "SSE_KMS" | "SSE_CMK" | "CSE";
    versioning: boolean;
    publicAccess: "PRIVATE" | "TENANT_GATED" | "PUBLIC_READ" | "PUBLIC_READ_WRITE";
    objectCount: number;
    hotBytes: number;
    archiveBytes: number;
    monthlyCostCents: number;
    lifecyclePolicy?: string;
    tag?: string;
  };
  const buckets: BBp[] = [
    { name: "seed-flowtora-proofs", provider: "AWS_S3", region: "us-east-1",
      encryption: "SSE_KMS", versioning: true, publicAccess: "TENANT_GATED",
      objectCount: 1_842_122, hotBytes: 4_200_000_000_000, archiveBytes: 12_400_000_000_000,
      monthlyCostCents: 280_000, lifecyclePolicy: "[seed] Proofs hot→IA 90d", tag: "proofs" },
    { name: "seed-flowtora-exports", provider: "AWS_S3", region: "us-east-1",
      encryption: "SSE_KMS", versioning: false, publicAccess: "TENANT_GATED",
      objectCount: 12_412, hotBytes: 240_000_000_000, archiveBytes: 0,
      monthlyCostCents: 24_000, lifecyclePolicy: "[seed] Exports delete 30d", tag: "exports" },
    { name: "seed-flowtora-assets-prod", provider: "CLOUDFLARE_R2", region: "GLOBAL",
      encryption: "SSE_S3", versioning: true, publicAccess: "PUBLIC_READ",
      objectCount: 18_412, hotBytes: 84_000_000_000, archiveBytes: 0,
      monthlyCostCents: 6_400, lifecyclePolicy: "[seed] Versions expire 90d", tag: "assets" },
    { name: "seed-flowtora-thumbs", provider: "CLOUDFLARE_R2", region: "GLOBAL",
      encryption: "SSE_S3", versioning: false, publicAccess: "PUBLIC_READ",
      objectCount: 38_412_112, hotBytes: 120_000_000_000, archiveBytes: 0,
      monthlyCostCents: 9_200, lifecyclePolicy: "[seed] Versions expire 90d", tag: "thumbnails" },
    { name: "seed-flowtora-logs", provider: "AWS_S3", region: "us-east-1",
      encryption: "SSE_KMS", versioning: false, publicAccess: "PRIVATE",
      objectCount: 412_412, hotBytes: 320_000_000_000, archiveBytes: 8_400_000_000_000,
      monthlyCostCents: 18_000, lifecyclePolicy: "[seed] Logs → Glacier 30d", tag: "logs" },
    { name: "seed-flowtora-staging-proofs", provider: "AWS_S3", region: "us-east-1",
      encryption: "SSE_S3", versioning: false, publicAccess: "PRIVATE",
      objectCount: 84_412, hotBytes: 180_000_000_000, archiveBytes: 0,
      monthlyCostCents: 14_000, lifecyclePolicy: "[seed] Trash delete 7d", tag: "staging" },
    { name: "seed-flowtora-eu-proofs", provider: "AWS_S3", region: "eu-west-1",
      encryption: "SSE_KMS", versioning: true, publicAccess: "TENANT_GATED",
      objectCount: 612_412, hotBytes: 1_800_000_000_000, archiveBytes: 4_200_000_000_000,
      monthlyCostCents: 124_000, lifecyclePolicy: "[seed] Proofs hot→IA 90d", tag: "proofs-eu" },
    { name: "seed-flowtora-public-images", provider: "AWS_S3", region: "us-east-1",
      encryption: "SSE_S3", versioning: false, publicAccess: "PUBLIC_READ",
      objectCount: 412, hotBytes: 8_400_000_000, archiveBytes: 0,
      monthlyCostCents: 1_200, tag: "marketing" },
    { name: "seed-flowtora-backbone-azure", provider: "AZURE_BLOB", region: "eastus2",
      encryption: "SSE_KMS", versioning: false, publicAccess: "PRIVATE",
      objectCount: 412, hotBytes: 2_400_000_000, archiveBytes: 0,
      monthlyCostCents: 800, tag: "internal" },
  ];
  for (const b of buckets) {
    await db.storageBucketEntry.upsert({
      where: { name: b.name },
      create: {
        name: b.name, provider: b.provider, region: b.region,
        encryption: b.encryption, versioning: b.versioning, publicAccess: b.publicAccess,
        objectCount: BigInt(b.objectCount),
        sizeBytes: BigInt(b.hotBytes + b.archiveBytes),
        hotBytes: BigInt(b.hotBytes), archiveBytes: BigInt(b.archiveBytes),
        monthlyCostCents: b.monthlyCostCents,
        lifecyclePolicyId: b.lifecyclePolicy ? policyIdByName.get(b.lifecyclePolicy) ?? null : null,
        tag: b.tag ?? null,
        lastRefreshedAt: minutesAgo(randInt(5, 120)),
      },
      update: {
        objectCount: BigInt(b.objectCount),
        sizeBytes: BigInt(b.hotBytes + b.archiveBytes),
        hotBytes: BigInt(b.hotBytes), archiveBytes: BigInt(b.archiveBytes),
        monthlyCostCents: b.monthlyCostCents,
      },
    });
  }

  // 4. Per-tenant usage.
  for (let i = 0; i < tenants.length; i++) {
    const t = tenants[i]!;
    const limitBytes = (i === 0 ? 500 : i === 1 ? 200 : 50) * 1_000_000_000; // GB
    const usedBytes = Math.floor(limitBytes * (0.3 + Math.random() * 0.6));
    const anomaly = i === 0 && Math.random() > 0.5;
    await db.tenantStorageUsage.upsert({
      where: { tenantId: t.id },
      create: {
        tenantId: t.id,
        storageBytes: BigInt(usedBytes),
        limitBytes: BigInt(limitBytes),
        bandwidth30dBytes: BigInt(usedBytes * 4),
        fileCount: Math.floor(usedBytes / 1_500_000),
        largestFolder: ["/proofs/2026/04", "/exports/2026", "/customer-uploads"][i % 3]!,
        anomalyFlag: anomaly,
        anomalyReason: anomaly ? "Storage grew 220% in last 7 days" : null,
        refreshedAt: minutesAgo(randInt(10, 60)),
      },
      update: {
        storageBytes: BigInt(usedBytes),
        bandwidth30dBytes: BigInt(usedBytes * 4),
        anomalyFlag: anomaly,
        anomalyReason: anomaly ? "Storage grew 220% in last 7 days" : null,
      },
    });
  }

  // 5. CDN POPs.
  type PBp = {
    popCode: string; region: string; city: string;
    lat: number; lon: number;
    health: "HEALTHY" | "DEGRADED" | "WARNING" | "OFFLINE";
    hitRate: number; bandwidthBytes: number; requests24h: number; avgLatencyMs: number;
  };
  const pops: PBp[] = [
    { popCode: "seed-iad1",  region: "us-east",      city: "Ashburn, VA",    lat: 38.9472, lon: -77.6307, health: "HEALTHY",  hitRate: 96.4, bandwidthBytes: 8_400_000_000_000, requests24h: 41_812_122, avgLatencyMs: 38 },
    { popCode: "seed-pdx1",  region: "us-west",      city: "Portland, OR",   lat: 45.5231, lon: -122.6765, health: "HEALTHY",  hitRate: 95.8, bandwidthBytes: 4_200_000_000_000, requests24h: 18_412_842, avgLatencyMs: 42 },
    { popCode: "seed-ord1",  region: "us-central",   city: "Chicago, IL",    lat: 41.8781, lon: -87.6298, health: "HEALTHY",  hitRate: 96.1, bandwidthBytes: 3_800_000_000_000, requests24h: 16_412_412, avgLatencyMs: 36 },
    { popCode: "seed-lhr1",  region: "eu-west",      city: "London, UK",     lat: 51.5074, lon: -0.1278,  health: "HEALTHY",  hitRate: 95.2, bandwidthBytes: 3_400_000_000_000, requests24h: 14_812_412, avgLatencyMs: 28 },
    { popCode: "seed-fra1",  region: "eu-central",   city: "Frankfurt, DE",  lat: 50.1109, lon: 8.6821,   health: "DEGRADED", hitRate: 88.4, bandwidthBytes: 2_400_000_000_000, requests24h: 9_412_412, avgLatencyMs: 64 },
    { popCode: "seed-cdg1",  region: "eu-west",      city: "Paris, FR",      lat: 48.8566, lon: 2.3522,   health: "HEALTHY",  hitRate: 95.7, bandwidthBytes: 1_800_000_000_000, requests24h: 7_812_412, avgLatencyMs: 32 },
    { popCode: "seed-syd1",  region: "ap-southeast", city: "Sydney, AU",     lat: -33.8688, lon: 151.2093, health: "HEALTHY",  hitRate: 94.1, bandwidthBytes: 1_400_000_000_000, requests24h: 5_412_412, avgLatencyMs: 88 },
    { popCode: "seed-hnd1",  region: "ap-northeast", city: "Tokyo, JP",      lat: 35.6762, lon: 139.6503, health: "HEALTHY",  hitRate: 94.8, bandwidthBytes: 1_200_000_000_000, requests24h: 4_812_412, avgLatencyMs: 78 },
    { popCode: "seed-gru1",  region: "sa-east",      city: "São Paulo, BR",  lat: -23.5505, lon: -46.6333, health: "WARNING",  hitRate: 84.2, bandwidthBytes: 820_000_000_000,   requests24h: 3_412_412, avgLatencyMs: 142 },
    { popCode: "seed-bom1",  region: "ap-south",     city: "Mumbai, IN",     lat: 19.0760, lon: 72.8777,  health: "HEALTHY",  hitRate: 93.1, bandwidthBytes: 920_000_000_000,   requests24h: 4_212_412, avgLatencyMs: 96 },
    { popCode: "seed-yto1",  region: "ca-east",      city: "Toronto, CA",    lat: 43.6532, lon: -79.3832, health: "HEALTHY",  hitRate: 95.9, bandwidthBytes: 1_120_000_000_000, requests24h: 5_012_412, avgLatencyMs: 34 },
    { popCode: "seed-dxb1",  region: "me-south",     city: "Dubai, AE",      lat: 25.2048, lon: 55.2708,  health: "DEGRADED", hitRate: 86.4, bandwidthBytes: 412_000_000_000,   requests24h: 1_812_412, avgLatencyMs: 110 },
  ];
  for (const p of pops) {
    await db.cdnPopStats.upsert({
      where: { popCode: p.popCode },
      create: {
        popCode: p.popCode, region: p.region, city: p.city, lat: p.lat, lon: p.lon,
        health: p.health, hitRate: p.hitRate,
        bandwidthBytes: BigInt(p.bandwidthBytes),
        requests24h: p.requests24h, avgLatencyMs: p.avgLatencyMs,
        refreshedAt: minutesAgo(randInt(2, 30)),
      },
      update: {
        health: p.health, hitRate: p.hitRate,
        bandwidthBytes: BigInt(p.bandwidthBytes),
        requests24h: p.requests24h, avgLatencyMs: p.avgLatencyMs,
        refreshedAt: minutesAgo(randInt(2, 30)),
      },
    });
  }

  // 6. Top URLs.
  type UBp = { url: string; bandwidthBytes: number; requests24h: number; hitRate: number; contentType: string; suspectedHotlink?: boolean };
  const topUrls: UBp[] = [
    { url: "https://cdn.flowtora.com/seed-/assets/marketing/hero-v2.webp",  bandwidthBytes: 1_800_000_000_000, requests24h: 4_212_412, hitRate: 98.4, contentType: "image/webp" },
    { url: "https://cdn.flowtora.com/seed-/assets/js/app-2026.04.js",         bandwidthBytes: 1_200_000_000_000, requests24h: 8_412_412, hitRate: 99.1, contentType: "application/javascript" },
    { url: "https://cdn.flowtora.com/seed-/assets/marketing/demo.mp4",        bandwidthBytes: 840_000_000_000,   requests24h: 412_412,   hitRate: 96.2, contentType: "video/mp4", suspectedHotlink: true },
    { url: "https://cdn.flowtora.com/seed-/assets/css/app-2026.04.css",       bandwidthBytes: 412_000_000_000,   requests24h: 8_412_412, hitRate: 99.4, contentType: "text/css" },
    { url: "https://cdn.flowtora.com/seed-/proofs/preview/abc-thumb.webp",   bandwidthBytes: 380_000_000_000,   requests24h: 1_812_412, hitRate: 92.8, contentType: "image/webp" },
    { url: "https://cdn.flowtora.com/seed-/assets/fonts/inter-var.woff2",     bandwidthBytes: 220_000_000_000,   requests24h: 8_212_412, hitRate: 99.6, contentType: "font/woff2" },
    { url: "https://cdn.flowtora.com/seed-/assets/marketing/feature.gif",     bandwidthBytes: 184_000_000_000,   requests24h: 142_412,   hitRate: 88.4, contentType: "image/gif", suspectedHotlink: true },
    { url: "https://cdn.flowtora.com/seed-/assets/icons/sprite.svg",          bandwidthBytes: 142_000_000_000,   requests24h: 7_412_412, hitRate: 99.4, contentType: "image/svg+xml" },
    { url: "https://cdn.flowtora.com/seed-/assets/marketing/og-image.jpg",    bandwidthBytes: 142_000_000_000,   requests24h: 1_412_412, hitRate: 97.2, contentType: "image/jpeg" },
    { url: "https://cdn.flowtora.com/seed-/proofs/preview/xyz-thumb.webp",   bandwidthBytes: 120_000_000_000,   requests24h: 612_412,   hitRate: 92.1, contentType: "image/webp" },
  ];
  for (const u of topUrls) {
    await db.cdnTopUrl.create({
      data: {
        url: u.url,
        bandwidthBytes: BigInt(u.bandwidthBytes),
        requests24h: u.requests24h,
        hitRate: u.hitRate,
        contentType: u.contentType,
        suspectedHotlink: u.suspectedHotlink ?? false,
      },
    });
  }

  // 7. Image optimization stats.
  await db.imageOptimizationStats.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      transforms24h: 4_812_412,
      bytesSaved24h: BigInt(840_000_000_000),
      webpCount24h: 2_812_412, avifCount24h: 1_212_412,
      jpegCount24h: 612_412, pngCount24h: 184_412,
      avgRatio: 3.4,
      topTransforms: [
        { name: "resize:400x400", count: 1_812_412 },
        { name: "resize:200x200", count: 1_412_412 },
        { name: "format:webp",    count: 1_212_412 },
        { name: "format:avif",    count: 612_412 },
        { name: "crop:focal",     count: 412_412 },
        { name: "quality:80",     count: 312_412 },
        { name: "resize:1200x", count: 220_412 },
        { name: "format:jpeg-progressive", count: 118_412 },
      ] as never,
      refreshedAt: minutesAgo(10),
    },
    update: {
      transforms24h: 4_812_412,
      bytesSaved24h: BigInt(840_000_000_000),
      refreshedAt: minutesAgo(10),
    },
  });

  // 8. Egress daily samples (30 days).
  let egressCount = 0;
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000);
    day.setUTCHours(0, 0, 0, 0);
    const bytes = (1.4 + Math.random() * 0.4) * 1_000_000_000_000; // 1.4-1.8 TB
    const cost = Math.floor(bytes / 1_000_000_000_000 * 90 * 100); // ~$90/TB in cents
    const byProvider = {
      "AWS_S3": Math.floor(bytes * 0.7),
      "CLOUDFLARE_R2": Math.floor(bytes * 0.25),
      "AZURE_BLOB": Math.floor(bytes * 0.05),
    };
    await db.egressDailySample.upsert({
      where: { day },
      create: {
        day,
        bytes: BigInt(Math.floor(bytes)),
        costCents: cost,
        byProvider: byProvider as never,
      },
      update: {
        bytes: BigInt(Math.floor(bytes)),
        costCents: cost,
        byProvider: byProvider as never,
      },
    });
    egressCount++;
  }

  // 9. Per-tenant egress.
  for (let i = 0; i < tenants.length; i++) {
    const t = tenants[i]!;
    const bytes = (i === 0 ? 8 : i === 1 ? 12 : 4) * 1_000_000_000_000; // 4-12 TB
    const cost = Math.floor(bytes / 1_000_000_000_000 * 90 * 100);
    const hotlink = i === 1;
    await db.egressTenantUsage.upsert({
      where: { tenantId: t.id },
      create: {
        tenantId: t.id,
        bytes30d: BigInt(bytes),
        cost30dCents: cost,
        suspectedHotlink: hotlink,
        hotlinkSourceDomain: hotlink ? "competitor-site.example" : null,
        notes: hotlink ? "Spike from referer competitor-site.example — investigating" : null,
        refreshedAt: minutesAgo(randInt(5, 60)),
      },
      update: {
        bytes30d: BigInt(bytes),
        cost30dCents: cost,
        suspectedHotlink: hotlink,
        hotlinkSourceDomain: hotlink ? "competitor-site.example" : null,
        notes: hotlink ? "Spike from referer competitor-site.example — investigating" : null,
      },
    });
  }

  console.log(
    `  ✓ ${buckets.length} buckets, ${policies.length} lifecycle policies, ${pops.length} CDN POPs, ${topUrls.length} top URLs, ${egressCount} egress samples, ${tenants.length} tenant usage + egress rows`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
