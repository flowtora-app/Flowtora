// One-shot wipe: delete every tenant and every non-platform user.
// Tenant delete cascades all tenant-scoped data (memberships,
// customers, quotes, invoices, etc.). Users with a `platformRole`
// are preserved (platform staff accounts shouldn't be collateral
// damage if any exist in this DB).
//
// Runs inside a transaction — if anything fails the whole thing
// rolls back.
import { db } from "../src/lib/db";

async function main() {
  const beforeTenantCount = await db.tenant.count();
  const beforeUserCount = await db.user.count();
  const platformStaff = await db.user.count({ where: { platformRole: { not: null } } });

  console.log("=== BEFORE ===");
  console.log(`Tenants: ${beforeTenantCount}`);
  console.log(`Users:   ${beforeUserCount} (${platformStaff} platform staff will be kept)`);

  if (beforeTenantCount === 0 && beforeUserCount === platformStaff) {
    console.log("\nAlready clean. Exiting.");
    await db.$disconnect();
    return;
  }

  await db.$transaction(async (tx) => {
    const t = await tx.tenant.deleteMany({});
    console.log(`\n✓ Deleted ${t.count} tenants`);

    const u = await tx.user.deleteMany({ where: { platformRole: null } });
    console.log(`✓ Deleted ${u.count} non-platform users`);
  });

  const afterTenantCount = await db.tenant.count();
  const afterUserCount = await db.user.count();

  console.log("\n=== AFTER ===");
  console.log(`Tenants: ${afterTenantCount}`);
  console.log(`Users:   ${afterUserCount}`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED — transaction rolled back:");
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
