// One-shot: create/promote a single user to SUPER_ADMIN and demote
// every other existing SUPER_ADMIN to a non-platform user (platformRole
// = null). SITE_MANAGER and SUPPORT_AGENT users are left alone — only
// the SUPER_ADMIN role is collapsed to a single account.
//
// Usage:
//   npx tsx scripts/set-sole-super-admin.ts \
//     --email=you@example.com \
//     --password='somethingStrong!' \
//     --name='Your Name'
//
// Runs in a single Prisma transaction so the demote-others + promote-target
// pair is atomic — if anything fails the DB is left untouched.

import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const password = arg("password");
  const name = arg("name");

  if (!email || !password) {
    console.error("Usage: --email=… --password=… [--name=…]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be ≥ 8 characters.");
    process.exit(1);
  }

  // ── Audit: list current SUPER_ADMINs before making changes ────────
  const before = await db.user.findMany({
    where: { platformRole: "SUPER_ADMIN" },
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
  });
  console.log(`\nCurrent SUPER_ADMIN users (${before.length}):`);
  for (const u of before) {
    console.log(`  • ${u.email}${u.name ? ` (${u.name})` : ""}  [${u.id}]`);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // ── Atomic update ─────────────────────────────────────────────────
  await db.$transaction(async (tx) => {
    // Upsert the target user with SUPER_ADMIN.
    const target = await tx.user.upsert({
      where: { email },
      update: {
        platformRole: "SUPER_ADMIN",
        passwordHash,
        name: name ?? undefined,
      },
      create: {
        email,
        name: name ?? null,
        passwordHash,
        emailVerified: new Date(),
        platformRole: "SUPER_ADMIN",
      },
      select: { id: true, email: true },
    });

    // Demote every OTHER existing SUPER_ADMIN.
    const demoted = await tx.user.updateMany({
      where: {
        platformRole: "SUPER_ADMIN",
        id: { not: target.id },
      },
      data: { platformRole: null },
    });

    console.log(
      `\n✓ ${target.email} is now SUPER_ADMIN (id=${target.id}).`,
    );
    console.log(`✓ Demoted ${demoted.count} other SUPER_ADMIN account(s) to non-platform.`);
  });

  // ── Verify ────────────────────────────────────────────────────────
  const after = await db.user.findMany({
    where: { platformRole: "SUPER_ADMIN" },
    select: { email: true, name: true },
    orderBy: { email: "asc" },
  });
  console.log(`\nSUPER_ADMIN users after change (${after.length}):`);
  for (const u of after) {
    console.log(`  • ${u.email}${u.name ? ` (${u.name})` : ""}`);
  }

  console.log("\nDone. Sign in at /login.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED:", e);
  await db.$disconnect();
  process.exit(1);
});
