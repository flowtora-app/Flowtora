// Read-only inventory of tenants + users in the DB. Used to pick
// which ones to keep before running a cleanup. Does not mutate
// anything.
import { db } from "../src/lib/db";

async function main() {
  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      plan: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
  });

  console.log(`\n=== Tenants (${tenants.length}) — oldest first ===\n`);
  tenants.forEach((t, i) => {
    console.log(
      `${String(i + 1).padStart(2)}. [${t.createdAt.toISOString().slice(0, 10)}] ${t.slug}  —  "${t.name}"  (${t.status}/${t.plan}, ${t._count.memberships} members)  id=${t.id}`,
    );
  });

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      platformRole: true,
      _count: { select: { memberships: true } },
    },
  });

  console.log(`\n=== Users (${users.length}) — oldest first ===\n`);
  users.forEach((u, i) => {
    console.log(
      `${String(i + 1).padStart(2)}. [${u.createdAt.toISOString().slice(0, 10)}] ${u.email}  —  "${u.name ?? ""}"  (${u._count.memberships} memberships${u.platformRole ? `, ${u.platformRole}` : ""})`,
    );
  });

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
