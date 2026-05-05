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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
