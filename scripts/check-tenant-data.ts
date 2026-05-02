import { db } from "@/lib/db";

async function main() {
  const total = await db.tenant.count();
  const byStatus = await db.tenant.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byPlanLink = await db.tenant.groupBy({
    by: ["pricingPlanId"],
    _count: { _all: true },
  });
  const byOldPlan = await db.tenant.groupBy({
    by: ["plan"],
    _count: { _all: true },
  });
  console.log("Total tenants:", total);
  console.log("\nBy status:");
  byStatus.forEach((r) => console.log(`  ${r.status}: ${r._count._all}`));
  console.log("\nBy pricingPlanId (PricingPlan FK):");
  byPlanLink.forEach((r) => console.log(`  ${r.pricingPlanId ?? "<NULL>"}: ${r._count._all}`));
  console.log("\nBy plan (legacy Plan enum):");
  byOldPlan.forEach((r) => console.log(`  ${r.plan}: ${r._count._all}`));

  console.log("\nPricingPlan rows:");
  const plans = await db.pricingPlan.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      _count: { select: { tenants: true } },
    },
  });
  plans.forEach((p) =>
    console.log(`  [${p.status}] ${p.slug} (${p.name}) — ${p._count.tenants} tenants`),
  );

  console.log("\nSample tenants (first 10):");
  const sample = await db.tenant.findMany({
    take: 10,
    select: {
      id: true, name: true, status: true,
      plan: true, pricingPlanId: true,
      pricingPlan: { select: { slug: true } },
    },
  });
  sample.forEach((t) => {
    console.log(
      `  ${t.name} | status=${t.status} | plan=${t.plan} | pricingPlanId=${t.pricingPlanId ?? "NULL"} | linkedSlug=${t.pricingPlan?.slug ?? "—"}`,
    );
  });

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
