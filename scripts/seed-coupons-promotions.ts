// Page 20 — seed demo coupons + promotions + redemptions so the
// admin pages render real numbers instead of empty states.
//
// Idempotent — checks for [seed] markers in description before
// minting, skips if already present.

import { db } from "@/lib/db";

const SEED_TAG = "[seed]";

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

async function seedCoupons(adminId: string) {
  console.log("\n── Seeding demo coupons ─────────────────────────");
  const existing = await db.coupon.count({
    where: { description: { contains: SEED_TAG } },
  });
  if (existing > 0) {
    console.log(`  Already have ${existing} seeded coupons — skipping.`);
    return;
  }

  const day = 86_400_000;
  const data = [
    {
      code: "LAUNCH26",
      name: "Q2 launch promo",
      description: `${SEED_TAG} 20% off Essentials/Professional for new sign-ups`,
      discountType: "PERCENT" as const,
      amount: 20,
      currency: null,
      appliesToPlans: ["essentials", "professional"],
      maxRedemptions: 100,
      maxRedemptionsPerCustomer: 1,
      duration: "REPEATING" as const,
      durationMonths: 3,
      newTenantsOnlyDays: 30,
      stackable: false,
      showOnPricingPage: true,
      validFrom: new Date(Date.now() - 14 * day),
      validUntil: new Date(Date.now() + 60 * day),
      status: "ACTIVE" as const,
      createdById: adminId,
    },
    {
      code: "WELCOME10",
      name: "Welcome credit",
      description: `${SEED_TAG} $10 off the first invoice for any plan`,
      discountType: "FIXED" as const,
      amount: 1000,
      currency: "USD",
      appliesToPlans: [],
      maxRedemptions: null,
      maxRedemptionsPerCustomer: 1,
      duration: "ONCE" as const,
      firstTimeOnly: true,
      validFrom: new Date(Date.now() - 30 * day),
      validUntil: null,
      status: "ACTIVE" as const,
      createdById: adminId,
    },
    {
      code: "ENTERPRISE50",
      name: "Enterprise launch deal",
      description: `${SEED_TAG} $500 off Enterprise annual for the first year`,
      discountType: "FIXED" as const,
      amount: 50000,
      currency: "USD",
      appliesToPlans: ["enterprise"],
      maxRedemptions: 25,
      maxRedemptionsPerCustomer: 1,
      duration: "ONCE" as const,
      minSubscriptionAmount: 100000,
      validFrom: new Date(Date.now() - 60 * day),
      validUntil: new Date(Date.now() + 30 * day),
      status: "ACTIVE" as const,
      createdById: adminId,
    },
    {
      code: "EXPIRED2025",
      name: "Last year's holiday promo",
      description: `${SEED_TAG} expired holiday code kept for audit history`,
      discountType: "PERCENT" as const,
      amount: 30,
      currency: null,
      appliesToPlans: [],
      maxRedemptions: 200,
      duration: "ONCE" as const,
      validFrom: new Date(Date.now() - 180 * day),
      validUntil: new Date(Date.now() - 90 * day),
      status: "ACTIVE" as const, // (page renders as expired due to validUntil)
      createdById: adminId,
    },
  ];

  let created = 0;
  for (const c of data) {
    await db.coupon.create({ data: c });
    console.log(`  ✓ ${c.code.padEnd(15)} ${c.name}`);
    created += 1;
  }
  console.log(`  Done: ${created} coupons created.`);
}

async function seedRedemptions() {
  console.log("\n── Seeding demo redemptions ─────────────────────");
  const existing = await db.couponRedemption.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} redemptions — skipping.`);
    return;
  }

  const tenants = await db.tenant.findMany({
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const launch26 = await db.coupon.findUnique({ where: { code: "LAUNCH26" } });
  const welcome10 = await db.coupon.findUnique({ where: { code: "WELCOME10" } });

  if (!launch26 || !welcome10 || tenants.length === 0) {
    console.log("  Missing pre-reqs (coupons or tenants) — skipping.");
    return;
  }

  // Wire LAUNCH26 to 2 tenants, WELCOME10 to 1 tenant.
  const day = 86_400_000;
  await db.couponRedemption.createMany({
    data: [
      { couponId: launch26.id,  tenantId: tenants[0].id, appliedAmount: 1200, createdAt: new Date(Date.now() - 7 * day) },
      { couponId: launch26.id,  tenantId: tenants[1].id, appliedAmount: 1200, createdAt: new Date(Date.now() - 3 * day) },
      { couponId: welcome10.id, tenantId: tenants[2].id, appliedAmount: 1000, createdAt: new Date(Date.now() - 1 * day) },
    ],
  });
  await db.coupon.update({ where: { id: launch26.id },  data: { redeemedCount: 2 } });
  await db.coupon.update({ where: { id: welcome10.id }, data: { redeemedCount: 1 } });
  console.log("  ✓ 3 redemptions tied to LAUNCH26 (×2) and WELCOME10 (×1)");
}

async function seedPromotions(adminId: string) {
  console.log("\n── Seeding demo promotions ──────────────────────");
  const existing = await db.promotion.count({
    where: { description: { contains: SEED_TAG } },
  });
  if (existing > 0) {
    console.log(`  Already have ${existing} promotions — skipping.`);
    return;
  }

  const launch26 = await db.coupon.findUnique({ where: { code: "LAUNCH26" } });
  const enterprise50 = await db.coupon.findUnique({ where: { code: "ENTERPRISE50" } });
  if (!launch26 || !enterprise50) {
    console.log("  Coupons missing — skipping promotions seed.");
    return;
  }

  const day = 86_400_000;
  const now = Date.now();

  await db.promotion.create({
    data: {
      name: "Q2 launch — NSP outreach",
      description: `${SEED_TAG} email + landing-page push to NSP attendees who haven't signed up`,
      couponId: launch26.id,
      landingUrl: "https://flowtora.com/q2-launch",
      emailTemplateKind: "marketing.q2_launch",
      audience: "NSP 2026 attendees who haven't yet signed up",
      goal: "100 redemptions, 12% click-through, 4% paid conversion",
      startsAt: new Date(now - 14 * day),
      endsAt: new Date(now + 30 * day),
      status: "ACTIVE",
      createdById: adminId,
    },
  });
  await db.promotion.create({
    data: {
      name: "Enterprise spring blitz",
      description: `${SEED_TAG} sales-led outbound to multi-location print shops`,
      couponId: enterprise50.id,
      landingUrl: "https://flowtora.com/enterprise",
      emailTemplateKind: "sales.enterprise_blitz",
      audience: "Print shops with 3+ locations, manually qualified",
      goal: "10 closed-won deals, $500k ACV",
      startsAt: new Date(now - 7 * day),
      endsAt: new Date(now + 60 * day),
      status: "ACTIVE",
      createdById: adminId,
    },
  });
  await db.promotion.create({
    data: {
      name: "Winter referral push",
      description: `${SEED_TAG} ended last quarter — kept for performance review`,
      couponId: launch26.id,
      landingUrl: null,
      audience: "Existing referral partners",
      goal: "50 partner referrals",
      startsAt: new Date(now - 120 * day),
      endsAt: new Date(now - 30 * day),
      status: "ENDED",
      createdById: adminId,
    },
  });
  console.log("  ✓ 3 promotions created (2 active, 1 ended)");
}

async function main() {
  const adminId = await pickAdminId();
  await seedCoupons(adminId);
  await seedRedemptions();
  await seedPromotions(adminId);

  // Summary
  const [cc, rc, pc] = await Promise.all([
    db.coupon.count(),
    db.couponRedemption.count(),
    db.promotion.count(),
  ]);
  console.log("\n── Summary ──────────────────────────────────────");
  console.log(`  Coupons: ${cc}, Redemptions: ${rc}, Promotions: ${pc}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
