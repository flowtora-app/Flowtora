// One-shot: create (or promote) a user to SUPER_ADMIN platform staff.
//
// Platform staff are users with a non-null `platformRole` — they can
// access /platform/* and impersonate any tenant for support. This is
// distinct from tenant-level OWNER/ADMIN memberships.
//
// Usage:
//
//   Create a brand-new platform admin (full args):
//     npx tsx scripts/make-platform-admin.ts \
//       --email=you@example.com \
//       --password='somethingStrong!' \
//       --name='Flowtora Admin'
//
//   Or via env vars:
//     ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' ADMIN_NAME='…' \
//       npx tsx scripts/make-platform-admin.ts
//
//   Promote an existing user (password not needed — kept as-is):
//     npx tsx scripts/make-platform-admin.ts --email=existing@example.com
//
// Behavior:
//   - New user:      create with password hash, emailVerified=now,
//                    platformRole=SUPER_ADMIN
//   - Existing user: set platformRole=SUPER_ADMIN; if --password is
//                    passed, re-hash and overwrite. Otherwise password
//                    untouched (safe to re-run for role-only promotion).
//
// Runs outside a transaction because it's a single upsert and there's
// nothing atomic to coordinate.

import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = arg("password") ?? process.env.ADMIN_PASSWORD ?? null;
  const name = arg("name") ?? process.env.ADMIN_NAME ?? null;

  if (!email) {
    console.error(
      "❌ Missing email.\n\n" +
        "Usage: npx tsx scripts/make-platform-admin.ts \\\n" +
        "  --email=you@example.com \\\n" +
        "  --password='somethingStrong!' \\\n" +
        "  --name='Flowtora Admin'",
    );
    process.exit(1);
  }

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, platformRole: true, passwordHash: true, name: true },
  });

  if (existing) {
    console.log(`Found existing user ${email} (id=${existing.id}).`);
    const data: {
      platformRole: "SUPER_ADMIN";
      passwordHash?: string;
      name?: string;
    } = { platformRole: "SUPER_ADMIN" };

    if (password) {
      if (password.length < 8) {
        console.error("❌ Password must be at least 8 characters.");
        process.exit(1);
      }
      data.passwordHash = await bcrypt.hash(password, 12);
      console.log("  → Password will be reset.");
    } else {
      console.log("  → Password unchanged (no --password passed).");
    }
    if (name && name !== existing.name) {
      data.name = name;
      console.log(`  → Name updated to "${name}".`);
    }

    await db.user.update({ where: { id: existing.id }, data });

    if (existing.platformRole === "SUPER_ADMIN") {
      console.log("✓ Already SUPER_ADMIN — no role change needed.");
    } else {
      console.log(
        `✓ Promoted ${existing.platformRole ?? "tenant-only"} → SUPER_ADMIN.`,
      );
    }
  } else {
    if (!password) {
      console.error(
        "❌ Creating a new user requires --password (or $ADMIN_PASSWORD).",
      );
      process.exit(1);
    }
    if (password.length < 8) {
      console.error("❌ Password must be at least 8 characters.");
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await db.user.create({
      data: {
        email,
        name: name ?? null,
        passwordHash,
        // Platform admins don't need to click a verification email —
        // the account is being created intentionally by whoever runs
        // this script. Mark verified so /login works on first try.
        emailVerified: new Date(),
        platformRole: "SUPER_ADMIN",
      },
      select: { id: true, email: true },
    });
    console.log(`✓ Created platform admin ${created.email} (id=${created.id}).`);
  }

  console.log("\nDone. Sign in at /login, then visit /platform.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("\n❌ FAILED:");
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
