// Page 24 — seed demo payouts data so the new tabs render real numbers.
//
// Idempotent — checks marker rows before minting.
//   • 2 demo Affiliates (Marcus Chen — partner, Riverside Marketing — agency)
//   • Each gets a primary payout method (ACH + PayPal)
//   • Commission lines for the last 3 periods (mix of COMMISSION + BONUS + a HOLD)
//   • 1 PAID payout (last period) and 1 IN_TRANSIT payout (this period)

import { db } from "@/lib/db";

const DAY = 86_400_000;

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

async function seedAffiliates() {
  console.log("\n── Seeding affiliates ──");
  const existing = await db.affiliate.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} affiliates — skipping creation, returning existing.`);
    return await db.affiliate.findMany({ orderBy: { name: "asc" }, take: 2 });
  }
  await db.affiliate.create({
    data: {
      code: "MARCUS",
      name: "Marcus Chen",
      email: "marcus@example.com",
      commissionPct: "20.00",
      commissionDurationMonths: 12,
      status: "ACTIVE",
      notes: "Solo partner — Q1 2026 cohort",
    },
  });
  await db.affiliate.create({
    data: {
      code: "RIVERSIDE",
      name: "Riverside Marketing",
      email: "billing@riverside-mkt.example.com",
      commissionPct: "25.00",
      commissionDurationMonths: 24,
      status: "ACTIVE",
      notes: "Agency partner with 24-month attribution window",
    },
  });
  const affiliates = await db.affiliate.findMany({ orderBy: { name: "asc" }, take: 2 });
  affiliates.forEach((a) => console.log(`  ✓ ${a.name} (${a.code})`));
  return affiliates;
}

async function seedMethods(adminId: string, affiliates: { id: string; name: string }[]) {
  console.log("\n── Seeding payout methods ──");
  const existing = await db.partnerPayoutMethod.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} methods — skipping.`);
    return;
  }
  if (affiliates.length < 2) {
    console.log("  Not enough affiliates — skipping.");
    return;
  }
  await db.partnerPayoutMethod.create({
    data: {
      affiliateId: affiliates[0].id,
      type: "ACH",
      label: "Chase business checking",
      accountSnippet: "•••• 4242",
      externalAccountId: "acct_demo_marcus",
      status: "verified",
      isPrimary: true,
      notes: "Verified Q1 2026",
      createdById: adminId,
    },
  });
  await db.partnerPayoutMethod.create({
    data: {
      affiliateId: affiliates[1].id,
      type: "PAYPAL",
      label: "PayPal — billing@riverside-mkt",
      accountSnippet: "billing@riverside-mkt.example.com",
      externalAccountId: "PAYER-DEMO-RIVERSIDE",
      status: "configured",
      isPrimary: true,
      createdById: adminId,
    },
  });
  console.log(`  ✓ ACH method for ${affiliates[0].name}`);
  console.log(`  ✓ PayPal method for ${affiliates[1].name}`);
}

function periodFromMonthsAgo(monthsAgo: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function seedCommissionLinesAndPayouts(adminId: string, affiliates: { id: string; name: string }[]) {
  console.log("\n── Seeding commission lines + payouts ──");
  if (affiliates.length < 2) return;
  const existingLines = await db.partnerCommissionLine.count();
  if (existingLines > 0) {
    console.log(`  Already have ${existingLines} commission lines — skipping.`);
    return;
  }

  const period2 = periodFromMonthsAgo(2);
  const period1 = periodFromMonthsAgo(1);
  const period0 = periodFromMonthsAgo(0);

  // Marcus — affiliates[0]
  // 2 months ago: paid out
  // 1 month ago: in-transit
  // this month: still accruing (unpaid)
  const marcus = affiliates[0];
  const riverside = affiliates[1];

  // Marcus: 2 months ago commissions (now paid)
  const marcusMethod = await db.partnerPayoutMethod.findFirst({
    where: { affiliateId: marcus.id, isPrimary: true }, select: { id: true },
  });
  const paidPayout = await db.partnerPayout.create({
    data: {
      affiliateId: marcus.id,
      methodId: marcusMethod?.id ?? null,
      period: period2,
      amount: 35000, // $350
      currency: "USD",
      status: "PAID",
      scheduledAt: new Date(Date.now() - 50 * DAY),
      dispatchedAt: new Date(Date.now() - 49 * DAY),
      settledAt: new Date(Date.now() - 47 * DAY),
      externalRef: "ACH-DEMO-2026-A1",
      createdById: adminId,
    },
  });
  await db.partnerCommissionLine.createMany({
    data: [
      {
        affiliateId: marcus.id,
        payoutId: paidPayout.id,
        kind: "COMMISSION",
        description: "Demo Sign Shop · Essentials monthly",
        period: period2,
        amount: 12000,
        earnedAt: new Date(Date.now() - 60 * DAY),
      },
      {
        affiliateId: marcus.id,
        payoutId: paidPayout.id,
        kind: "COMMISSION",
        description: "Fresh Sign Shop · Professional monthly",
        period: period2,
        amount: 24000,
        earnedAt: new Date(Date.now() - 55 * DAY),
      },
      {
        affiliateId: marcus.id,
        payoutId: paidPayout.id,
        kind: "DEDUCTION",
        description: "Refund clawback · Demo Sign Shop partial refund",
        period: period2,
        amount: 1000,
        earnedAt: new Date(Date.now() - 52 * DAY),
      },
    ],
  });
  console.log(`  ✓ Marcus: PAID ${period2} ($350 net)`);

  // Marcus: 1 month ago in-transit
  const inTransitPayout = await db.partnerPayout.create({
    data: {
      affiliateId: marcus.id,
      methodId: marcusMethod?.id ?? null,
      period: period1,
      amount: 24000,
      currency: "USD",
      status: "IN_TRANSIT",
      scheduledAt: new Date(Date.now() - 8 * DAY),
      dispatchedAt: new Date(Date.now() - 6 * DAY),
      externalRef: "ACH-DEMO-2026-A2",
      createdById: adminId,
    },
  });
  await db.partnerCommissionLine.createMany({
    data: [
      {
        affiliateId: marcus.id,
        payoutId: inTransitPayout.id,
        kind: "COMMISSION",
        description: "Demo Sign Shop · Essentials monthly",
        period: period1,
        amount: 12000,
        earnedAt: new Date(Date.now() - 30 * DAY),
      },
      {
        affiliateId: marcus.id,
        payoutId: inTransitPayout.id,
        kind: "COMMISSION",
        description: "Fresh Sign Shop · Professional monthly",
        period: period1,
        amount: 12000,
        earnedAt: new Date(Date.now() - 25 * DAY),
      },
    ],
  });
  console.log(`  ✓ Marcus: IN_TRANSIT ${period1} ($240)`);

  // Marcus: this month, accruing (unpaid)
  await db.partnerCommissionLine.createMany({
    data: [
      {
        affiliateId: marcus.id,
        payoutId: null,
        kind: "COMMISSION",
        description: "Demo Sign Shop · Essentials monthly",
        period: period0,
        amount: 12000,
        earnedAt: new Date(Date.now() - 5 * DAY),
      },
      {
        affiliateId: marcus.id,
        payoutId: null,
        kind: "BONUS",
        description: "Q1 referral spiff",
        period: period0,
        amount: 5000,
        earnedAt: new Date(Date.now() - 3 * DAY),
      },
    ],
  });
  console.log(`  ✓ Marcus: ${period0} accruing ($170 unpaid)`);

  // Riverside Marketing: this period, with a HOLD
  await db.partnerCommissionLine.createMany({
    data: [
      {
        affiliateId: riverside.id,
        payoutId: null,
        kind: "COMMISSION",
        description: "3 enterprise referrals · Riverside campaign",
        period: period0,
        amount: 75000,
        earnedAt: new Date(Date.now() - 7 * DAY),
      },
      {
        affiliateId: riverside.id,
        payoutId: null,
        kind: "HOLD",
        description: "30-day fraud-risk hold (auto-clears next period)",
        period: period0,
        amount: 15000,
        earnedAt: new Date(Date.now() - 7 * DAY),
      },
    ],
  });
  console.log(`  ✓ Riverside: ${period0} accruing ($600 net = $750 - $150 hold)`);
}

async function summary() {
  const [aff, methods, payouts, lines] = await Promise.all([
    db.affiliate.count(),
    db.partnerPayoutMethod.count(),
    db.partnerPayout.count(),
    db.partnerCommissionLine.count(),
  ]);
  console.log("\n── Summary ──");
  console.log(`  affiliates: ${aff}, methods: ${methods}, payouts: ${payouts}, commission lines: ${lines}`);
}

async function main() {
  const adminId = await pickAdminId();
  const affiliates = await seedAffiliates();
  await seedMethods(adminId, affiliates);
  await seedCommissionLinesAndPayouts(adminId, affiliates);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
