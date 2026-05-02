// One-shot cleanup: delete non-demo tenants and the users whose
// memberships only existed on those tenants. Keeps the first 3
// demo tenants: francesabo, agabo, acm1.
//
// Tenant cascades handle all tenant-scoped data (memberships,
// customers, quotes, invoices, etc.). User cascades handle
// sessions/accounts/2FA rows.
//
// Runs inside a transaction — if anything fails the whole thing
// rolls back.
import { db } from "../src/lib/db";

const KEEP_TENANT_SLUGS = new Set(["francesabo", "agabo", "acm1"]);

async function main() {
  // Snapshot BEFORE
  const beforeTenants = await db.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true, createdAt: true },
  });
  const beforeUserCount = await db.user.count();

  console.log("\n=== BEFORE ===");
  console.log(`Tenants: ${beforeTenants.length}`);
  beforeTenants.forEach((t, i) =>
    console.log(`  ${i + 1}. ${t.slug} (${t.name}) — ${t.createdAt.toISOString().slice(0, 10)}`),
  );
  console.log(`Users: ${beforeUserCount}`);

  const tenantsToDelete = beforeTenants
    .filter((t) => !KEEP_TENANT_SLUGS.has(t.slug))
    .map((t) => t.slug);

  console.log(`\n→ Will delete tenants: ${tenantsToDelete.join(", ") || "(none)"}`);
  console.log(`→ Will keep tenants: ${[...KEEP_TENANT_SLUGS].join(", ")}`);

  if (tenantsToDelete.length === 0) {
    console.log("\nNothing to delete. Exiting.");
    await db.$disconnect();
    return;
  }

  await db.$transaction(async (tx) => {
    // 1. Delete non-demo tenants (cascades all tenant-scoped data
    //    including memberships).
    const deletedTenants = await tx.tenant.deleteMany({
      where: { slug: { in: tenantsToDelete } },
    });
    console.log(`\n✓ Deleted ${deletedTenants.count} tenants`);

    // 2. Delete orphan users — users with zero remaining memberships
    //    AND no platformRole (platform staff users should never be
    //    culled even if they have no tenant memberships).
    const orphanUsers = await tx.user.findMany({
      where: {
        memberships: { none: {} },
        platformRole: null,
      },
      select: { id: true, email: true },
    });
    console.log(`\nOrphan users to delete: ${orphanUsers.length}`);
    orphanUsers.forEach((u) => console.log(`  - ${u.email}`));

    if (orphanUsers.length > 0) {
      const deletedUsers = await tx.user.deleteMany({
        where: { id: { in: orphanUsers.map((u) => u.id) } },
      });
      console.log(`✓ Deleted ${deletedUsers.count} orphan users`);
    }
  });

  // Snapshot AFTER
  const afterTenants = await db.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true },
  });
  const afterUserCount = await db.user.count();

  console.log("\n=== AFTER ===");
  console.log(`Tenants: ${afterTenants.length}`);
  afterTenants.forEach((t, i) => console.log(`  ${i + 1}. ${t.slug} (${t.name})`));
  console.log(`Users: ${afterUserCount}`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED — transaction rolled back:");
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
