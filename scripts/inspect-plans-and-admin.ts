import { db } from "@/lib/db";

async function main() {
  console.log("PricingPlan rows:");
  const plans = await db.pricingPlan.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, slug: true, name: true, status: true,
      priceMonthly: true, priceAnnual: true, currency: true,
      sortOrder: true, isContactSales: true,
    },
  });
  plans.forEach((p) =>
    console.log(`  ${p.slug.padEnd(15)} | ${String(p.priceMonthly ?? "—").padStart(8)} m / ${String(p.priceAnnual ?? "—").padStart(8)} a | sort=${p.sortOrder} | ${p.status}`),
  );

  console.log("\nPlatform admin candidates:");
  const admins = await db.user.findMany({
    where: { platformRole: { in: ["SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "BILLING_MANAGER"] } },
    select: { id: true, email: true, name: true, platformRole: true },
    take: 10,
  });
  admins.forEach((u) => console.log(`  ${u.email} | ${u.platformRole} | id=${u.id}`));

  console.log("\nTenants with their stripeCustomerId:");
  const tenants = await db.tenant.findMany({
    select: {
      id: true, slug: true, name: true, status: true,
      plan: true, pricingPlanId: true, stripeCustomerId: true,
    },
  });
  tenants.forEach((t) =>
    console.log(`  ${t.name.padEnd(20)} | status=${t.status} | plan=${t.plan} | hasStripe=${!!t.stripeCustomerId}`),
  );

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
