"use server";

// Phase 4 — Trust & Safety server actions.
//
// Three concerns:
//   1. Bans on users / IPs / email domains (`users.ban` permission).
//   2. Cross-tenant user merge (`users.merge` permission).
//
// Side-effects to be aware of:
//   - banUser bumps the user's sessionVersion so any open session is
//     immediately revoked on next request (we can't kill the JWT in the
//     cookie itself, but the server-side check refuses it).
//   - mergeUsers reassigns Memberships and auth Accounts from source →
//     target, soft-deletes the source via `mergedIntoId`, and writes a
//     UserMergeRecord. Membership conflicts (same tenant on both sides)
//     drop the source's row in favor of the target's, with the count
//     reported back to the operator.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requirePlatformPermission,
  logPlatformAudit,
} from "@/lib/platform";
import {
  validateIp,
  validateDomain,
} from "@/lib/trust-safety";

const reasonSchema = z.string().trim().min(4, "Give a reason (4+ chars)").max(500);
const liftReasonSchema = z.string().trim().max(500).optional().or(z.literal(""));

// ─────────────────────────────────────────────────────────────────────
// User bans
// ─────────────────────────────────────────────────────────────────────

const banUserSchema = z.object({
  reason: reasonSchema,
  expiresAt: z.string().optional().or(z.literal("")),
});

export async function banUser(userId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("users.ban");
  const parsed = banUserSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/users/${userId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true, bannedAt: true },
  });
  if (!target) redirect(`/platform/users?error=${encodeURIComponent("User not found")}`);
  if (target.id === ctx.userId) {
    redirect(`/platform/users/${userId}?error=${encodeURIComponent("Cannot ban yourself")}`);
  }
  if (target.platformRole === "SUPER_ADMIN") {
    redirect(`/platform/users/${userId}?error=${encodeURIComponent("Cannot ban a Super Admin — demote first")}`);
  }
  if (target.bannedAt) {
    redirect(`/platform/users/${userId}?ok=already_banned`);
  }

  const expiresAt = parsed.data.expiresAt && parsed.data.expiresAt.trim() !== ""
    ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    redirect(`/platform/users/${userId}?error=${encodeURIComponent("Invalid expiry date")}`);
  }

  await db.$transaction([
    db.banRecord.create({
      data: {
        kind: "USER",
        userId: target.id,
        reason: parsed.data.reason,
        issuedById: ctx.userId,
        expiresAt,
      },
    }),
    db.user.update({
      where: { id: target.id },
      data: {
        bannedAt: new Date(),
        bannedReason: parsed.data.reason,
        sessionVersion: { increment: 1 },
      },
    }),
    // Kill active sessions immediately so the next request can't slip
    // through before sessionVersion mismatch is noticed.
    db.session.deleteMany({ where: { userId: target.id } }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_banned",
    entityType: "User",
    entityId: target.id,
    metadata: { targetEmail: target.email, reason: parsed.data.reason, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${userId}`);
  revalidatePath("/platform/abuse");
  redirect(`/platform/users/${userId}?ok=banned`);
}

const unbanSchema = z.object({
  liftReason: liftReasonSchema,
});

export async function unbanUser(userId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("users.ban");
  const parsed = unbanSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/users/${userId}?error=${encodeURIComponent("Invalid lift reason")}`);
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, bannedAt: true },
  });
  if (!target) redirect(`/platform/users?error=${encodeURIComponent("User not found")}`);
  if (!target.bannedAt) redirect(`/platform/users/${userId}?ok=not_banned`);

  await db.$transaction([
    db.banRecord.updateMany({
      where: { kind: "USER", userId: target.id, liftedAt: null },
      data: {
        liftedAt: new Date(),
        liftedById: ctx.userId,
        liftReason: parsed.data.liftReason || null,
      },
    }),
    db.user.update({
      where: { id: target.id },
      data: { bannedAt: null, bannedReason: null, sessionVersion: { increment: 1 } },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_unbanned",
    entityType: "User",
    entityId: target.id,
    metadata: { targetEmail: target.email, liftReason: parsed.data.liftReason || null },
  });

  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${userId}`);
  revalidatePath("/platform/abuse");
  redirect(`/platform/users/${userId}?ok=unbanned`);
}

// ─────────────────────────────────────────────────────────────────────
// IP bans
// ─────────────────────────────────────────────────────────────────────

const banIpSchema = z.object({
  ipAddress: z.string().trim().min(1),
  reason: reasonSchema,
  expiresAt: z.string().optional().or(z.literal("")),
});

export async function banIp(formData: FormData) {
  const ctx = await requirePlatformPermission("users.ban");
  const parsed = banIpSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/abuse?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const ip = validateIp(parsed.data.ipAddress);
  if (!ip) {
    redirect(`/platform/abuse?error=${encodeURIComponent("Not a valid IPv4/IPv6 address")}`);
  }

  const existing = await db.banRecord.findFirst({
    where: { kind: "IP", ipAddress: ip, liftedAt: null },
    select: { id: true },
  });
  if (existing) redirect(`/platform/abuse?ok=ip_already_banned`);

  const expiresAt = parsed.data.expiresAt && parsed.data.expiresAt.trim() !== ""
    ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    redirect(`/platform/abuse?error=${encodeURIComponent("Invalid expiry date")}`);
  }

  const created = await db.banRecord.create({
    data: {
      kind: "IP",
      ipAddress: ip,
      reason: parsed.data.reason,
      issuedById: ctx.userId,
      expiresAt,
    },
    select: { id: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.ip_banned",
    entityType: "BanRecord",
    entityId: created.id,
    metadata: { ip, reason: parsed.data.reason, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath("/platform/abuse");
  redirect(`/platform/abuse?ok=ip_banned`);
}

// ─────────────────────────────────────────────────────────────────────
// Email-domain bans
// ─────────────────────────────────────────────────────────────────────

const banDomainSchema = z.object({
  domain: z.string().trim().min(1),
  reason: reasonSchema,
  expiresAt: z.string().optional().or(z.literal("")),
});

export async function banEmailDomain(formData: FormData) {
  const ctx = await requirePlatformPermission("users.ban");
  const parsed = banDomainSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/abuse?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const dom = validateDomain(parsed.data.domain);
  if (!dom) {
    redirect(`/platform/abuse?error=${encodeURIComponent("Not a valid domain")}`);
  }

  const existing = await db.banRecord.findFirst({
    where: { kind: "EMAIL_DOMAIN", emailDomain: dom, liftedAt: null },
    select: { id: true },
  });
  if (existing) redirect(`/platform/abuse?ok=domain_already_banned`);

  const expiresAt = parsed.data.expiresAt && parsed.data.expiresAt.trim() !== ""
    ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    redirect(`/platform/abuse?error=${encodeURIComponent("Invalid expiry date")}`);
  }

  const created = await db.banRecord.create({
    data: {
      kind: "EMAIL_DOMAIN",
      emailDomain: dom,
      reason: parsed.data.reason,
      issuedById: ctx.userId,
      expiresAt,
    },
    select: { id: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.domain_banned",
    entityType: "BanRecord",
    entityId: created.id,
    metadata: { domain: dom, reason: parsed.data.reason, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath("/platform/abuse");
  redirect(`/platform/abuse?ok=domain_banned`);
}

// ─────────────────────────────────────────────────────────────────────
// Generic ban-record lift (for IP / domain rows; user-row lifts go
// through unbanUser so we can also clear `bannedAt`).
// ─────────────────────────────────────────────────────────────────────

export async function liftBanRecord(banId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("users.ban");
  const parsed = unbanSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/abuse?error=${encodeURIComponent("Invalid lift reason")}`);
  }

  const row = await db.banRecord.findUnique({
    where: { id: banId },
    select: { id: true, kind: true, ipAddress: true, emailDomain: true, userId: true, liftedAt: true },
  });
  if (!row) redirect(`/platform/abuse?error=${encodeURIComponent("Ban not found")}`);
  if (row.liftedAt) redirect(`/platform/abuse?ok=already_lifted`);

  // User-kind bans should go through unbanUser so the User row's
  // denormalized `bannedAt` gets cleared too. Reject here to force
  // the right path.
  if (row.kind === "USER") {
    redirect(`/platform/abuse?error=${encodeURIComponent("Use the user detail page to lift user bans")}`);
  }

  await db.banRecord.update({
    where: { id: row.id },
    data: {
      liftedAt: new Date(),
      liftedById: ctx.userId,
      liftReason: parsed.data.liftReason || null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: row.kind === "IP" ? "platform.ip_unbanned" : "platform.domain_unbanned",
    entityType: "BanRecord",
    entityId: row.id,
    metadata: {
      ip: row.ipAddress,
      domain: row.emailDomain,
      liftReason: parsed.data.liftReason || null,
    },
  });

  revalidatePath("/platform/abuse");
  redirect(`/platform/abuse?ok=lifted`);
}

// ─────────────────────────────────────────────────────────────────────
// Cross-tenant user merge.
// ─────────────────────────────────────────────────────────────────────
//
// Strategy:
//   1. Resolve target + source. Refuse self-merge, merging into a
//      banned/merged target, or merging a SUPER_ADMIN as source.
//   2. Move every Membership from source → target. If the target
//      already has a row for that tenant (conflict), we drop the
//      source's row (target wins) and count it.
//   3. Move auth Accounts (Google/GitHub/etc) from source → target,
//      same conflict logic on (provider, providerAccountId).
//   4. Soft-delete source: clear passwordHash + tokens, point
//      `mergedIntoId` at target, stamp `mergedAt`, bump sessionVersion.
//   5. Write a UserMergeRecord with the counts.
//
// We deliberately DO NOT rewrite historical authorship (audit logs,
// comments, portal messages, etc.). Forensic value of "user X did Y at
// time Z" outweighs the cosmetic value of consolidating display names.

const mergeSchema = z.object({
  sourceUserId: z.string().min(1),
  reason: reasonSchema,
});

export async function mergeUsers(targetUserId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("users.merge");

  const parsed = mergeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  if (parsed.data.sourceUserId === targetUserId) {
    redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent("Cannot merge a user into themselves")}`);
  }

  const [target, source] = await Promise.all([
    db.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, bannedAt: true, mergedIntoId: true, platformRole: true },
    }),
    db.user.findUnique({
      where: { id: parsed.data.sourceUserId },
      select: { id: true, email: true, bannedAt: true, mergedIntoId: true, platformRole: true },
    }),
  ]);
  if (!target) redirect(`/platform/users?error=${encodeURIComponent("Target user not found")}`);
  if (!source) redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent("Source user not found")}`);
  if (target.bannedAt || target.mergedIntoId) {
    redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent("Target is banned or already merged")}`);
  }
  if (source.mergedIntoId) {
    redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent("Source is already merged elsewhere")}`);
  }
  if (source.platformRole === "SUPER_ADMIN") {
    redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent("Refuse to merge a Super Admin — demote first")}`);
  }
  if (source.id === ctx.userId) {
    redirect(`/platform/users/${targetUserId}?error=${encodeURIComponent("Cannot merge yourself out")}`);
  }

  // Pull what we'll move + the existing target rows (for conflict detection).
  const [sourceMemberships, targetTenantIds, sourceAccounts, targetAccountKeys] = await Promise.all([
    db.membership.findMany({
      where: { userId: source.id },
      select: { id: true, tenantId: true, role: true, status: true },
    }),
    db.membership.findMany({
      where: { userId: target.id },
      select: { tenantId: true },
    }),
    db.account.findMany({
      where: { userId: source.id },
      select: { id: true, provider: true, providerAccountId: true },
    }),
    db.account.findMany({
      where: { userId: target.id },
      select: { provider: true, providerAccountId: true },
    }),
  ]);

  const targetTenants = new Set(targetTenantIds.map((m) => m.tenantId));
  const targetAccountKeySet = new Set(
    targetAccountKeys.map((a) => `${a.provider}:${a.providerAccountId}`),
  );

  const membershipsToMove = sourceMemberships.filter((m) => !targetTenants.has(m.tenantId));
  const membershipConflicts = sourceMemberships.length - membershipsToMove.length;
  const accountsToMove = sourceAccounts.filter(
    (a) => !targetAccountKeySet.has(`${a.provider}:${a.providerAccountId}`),
  );

  await db.$transaction(async (tx) => {
    // Move memberships (those without conflicts).
    if (membershipsToMove.length > 0) {
      await tx.membership.updateMany({
        where: { id: { in: membershipsToMove.map((m) => m.id) } },
        data: { userId: target.id },
      });
    }
    // Drop conflicting memberships from source so the unique index stays
    // happy and source's "former" memberships are cleaned up.
    await tx.membership.deleteMany({
      where: { userId: source.id },
    });

    // Move accounts (no conflicts).
    if (accountsToMove.length > 0) {
      await tx.account.updateMany({
        where: { id: { in: accountsToMove.map((a) => a.id) } },
        data: { userId: target.id },
      });
    }
    // Drop conflicting accounts from source.
    await tx.account.deleteMany({ where: { userId: source.id } });

    // Soft-delete source: kill passwords + tokens, point mergedInto.
    await tx.user.update({
      where: { id: source.id },
      data: {
        mergedIntoId: target.id,
        mergedAt: new Date(),
        passwordHash: null,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.session.deleteMany({ where: { userId: source.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: source.id } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: source.id } });

    // Bump target's session version too — they may want to re-establish
    // a session that now reflects the consolidated memberships.
    await tx.user.update({
      where: { id: target.id },
      data: { sessionVersion: { increment: 1 } },
    });

    // Audit row.
    await tx.userMergeRecord.create({
      data: {
        targetUserId: target.id,
        sourceUserId: source.id,
        targetEmail: target.email,
        sourceEmail: source.email,
        membershipsMoved: membershipsToMove.length,
        accountsMoved: accountsToMove.length,
        conflicts: membershipConflicts,
        reason: parsed.data.reason,
        executedById: ctx.userId,
      },
    });
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.users_merged",
    entityType: "User",
    entityId: target.id,
    metadata: {
      targetEmail: target.email,
      sourceEmail: source.email,
      membershipsMoved: membershipsToMove.length,
      accountsMoved: accountsToMove.length,
      conflicts: membershipConflicts,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${target.id}`);
  redirect(`/platform/users/${target.id}?ok=merged`);
}
