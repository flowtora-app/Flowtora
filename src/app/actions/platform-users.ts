"use server";

// Platform user-admin server actions — Page 9 of the admin spec.
//
// Permissions:
//   • View: anyone with `users.read`.
//   • Force-reset password / reset MFA / sign-out-all-sessions /
//     deactivate-user / bulk-MFA-enforce: `users.ban` (Admin tier).
//   • Edit / pin / delete platform user notes: `users.read` to view,
//     `users.ban` to mutate someone else's note. Authors can always
//     edit their own.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";

const HOUR = 3_600_000;

/* ────────────────────────────────────────────────────────── */
/* Per-user actions                                            */
/* ────────────────────────────────────────────────────────── */

const userIdSchema = z.object({ userId: z.string().min(1) });

export async function forcePasswordReset(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't reset passwords" } as const;
  }
  const parsed = userIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "User not found" } as const;

  // Mint a single-use reset token + bump session version so the
  // current session is invalid. The user can pick up the link from
  // their email after the next /forgot-password flow.
  const tokenHash = randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: {
      userId: target.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * HOUR),
    },
  });
  await db.user.update({
    where: { id: target.id },
    data: { sessionVersion: { increment: 1 } },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_password_reset_forced",
    entityType: "User",
    entityId: target.id,
    metadata: { actor: ctx.email, target: target.email },
  });
  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${target.id}`);
  return { ok: true } as const;
}

export async function resetUserMfa(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't reset MFA" } as const;
  }
  const parsed = userIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "User not found" } as const;

  // Drop any existing TOTP factor + flip the cached flag off. The
  // user will re-enroll on next sign-in if a policy requires MFA.
  await db.userTwoFactor.deleteMany({ where: { userId: target.id } });
  await db.user.update({
    where: { id: target.id },
    data: { twoFactorEnabled: false, sessionVersion: { increment: 1 } },
  });
  await db.twoFactorPendingLogin.deleteMany({ where: { userId: target.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_mfa_reset",
    entityType: "User",
    entityId: target.id,
    metadata: { actor: ctx.email, target: target.email },
  });
  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${target.id}`);
  return { ok: true } as const;
}

export async function signOutAllSessions(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't sign users out" } as const;
  }
  const parsed = userIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "User not found" } as const;

  // Bumping sessionVersion is the canonical "invalidate every JWT"
  // lever for this codebase — the auth callback rejects any token
  // whose stamped version doesn't match. We also nuke Session rows
  // for the database-strategy paths.
  await db.user.update({
    where: { id: target.id },
    data: { sessionVersion: { increment: 1 } },
  });
  const removed = await db.session.deleteMany({ where: { userId: target.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_signed_out_all",
    entityType: "User",
    entityId: target.id,
    metadata: { actor: ctx.email, target: target.email, sessionsRemoved: removed.count },
  });
  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${target.id}`);
  return { ok: true, sessionsRemoved: removed.count } as const;
}

const deactivateSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(3).max(500).optional(),
  /** When "off", reactivates the user (clears flags). */
  toggle: z.union([z.literal("on"), z.literal("off")]).default("on"),
});

export async function deactivateUser(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't deactivate users" } as const;
  }
  const parsed = deactivateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "User not found" } as const;

  if (parsed.data.toggle === "on") {
    await db.user.update({
      where: { id: target.id },
      data: {
        deactivatedAt: new Date(),
        deactivatedBy: ctx.userId,
        deactivatedReason: parsed.data.reason ?? null,
        sessionVersion: { increment: 1 },
      },
    });
    await db.session.deleteMany({ where: { userId: target.id } });
  } else {
    await db.user.update({
      where: { id: target.id },
      data: {
        deactivatedAt: null,
        deactivatedBy: null,
        deactivatedReason: null,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.toggle === "on"
      ? "platform.user_deactivated"
      : "platform.user_reactivated",
    entityType: "User",
    entityId: target.id,
    metadata: { actor: ctx.email, target: target.email, reason: parsed.data.reason ?? null },
  });
  revalidatePath("/platform/users");
  revalidatePath(`/platform/users/${target.id}`);
  return { ok: true } as const;
}

const revokeSessionSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
});

export async function revokeUserSession(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't revoke sessions" } as const;
  }
  const parsed = revokeSessionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await db.session.deleteMany({
    where: { id: parsed.data.sessionId, userId: parsed.data.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_session_revoked",
    entityType: "Session",
    entityId: parsed.data.sessionId,
    metadata: { actor: ctx.email, target: parsed.data.userId },
  });
  revalidatePath(`/platform/users/${parsed.data.userId}`);
  return { ok: true } as const;
}

const removeMembershipSchema = z.object({
  userId: z.string().min(1),
  membershipId: z.string().min(1),
});

export async function removeUserFromTenant(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't remove memberships" } as const;
  }
  const parsed = removeMembershipSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const m = await db.membership.findUnique({
    where: { id: parsed.data.membershipId },
    select: { id: true, userId: true, tenantId: true, role: true },
  });
  if (!m || m.userId !== parsed.data.userId) return { ok: false, error: "Membership not found" } as const;
  if (m.role === "OWNER") {
    return { ok: false, error: "Cannot remove an OWNER membership — transfer ownership first" } as const;
  }
  await db.membership.delete({ where: { id: m.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: m.tenantId,
    action: "platform.user_membership_removed",
    entityType: "Membership",
    entityId: m.id,
    metadata: { actor: ctx.email, target: parsed.data.userId },
  });
  revalidatePath(`/platform/users/${parsed.data.userId}`);
  return { ok: true } as const;
}

const changeRoleSchema = z.object({
  userId: z.string().min(1),
  membershipId: z.string().min(1),
  role: z.enum([
    "OWNER", "ADMIN", "SALES_REP", "CSR", "DESIGNER",
    "PRODUCTION_MANAGER", "INSTALLER", "ACCOUNTING", "EMPLOYEE",
  ]),
});

export async function changeMembershipRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't change tenant roles" } as const;
  }
  const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const m = await db.membership.findUnique({
    where: { id: parsed.data.membershipId },
    select: { id: true, userId: true, tenantId: true },
  });
  if (!m || m.userId !== parsed.data.userId) return { ok: false, error: "Membership not found" } as const;
  await db.membership.update({
    where: { id: m.id },
    data: { role: parsed.data.role },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: m.tenantId,
    action: "platform.user_role_changed",
    entityType: "Membership",
    entityId: m.id,
    metadata: { actor: ctx.email, target: parsed.data.userId, role: parsed.data.role },
  });
  revalidatePath(`/platform/users/${parsed.data.userId}`);
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Bulk MFA enforce                                            */
/* ────────────────────────────────────────────────────────── */

const bulkMfaSchema = z.object({
  /** CSV of tenant ids to scope the enforce to. Empty = every tenant. */
  tenantIds: z.string().optional(),
});

export async function bulkEnforceMfa(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't enforce MFA" } as const;
  }
  const parsed = bulkMfaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const tenantIds = (parsed.data.tenantIds ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  // Bulk-flip Tenant.mfaEnforced — the existing setting forces every
  // member to complete the 2FA setup flow on next sign-in.
  const where = tenantIds.length > 0 ? { id: { in: tenantIds } } : undefined;
  const updated = await db.tenant.updateMany({
    where,
    data: { mfaEnforced: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.users_bulk_mfa_enforced",
    entityType: "Tenant",
    metadata: { actor: ctx.email, scope: tenantIds.length === 0 ? "all" : tenantIds, count: updated.count },
  });
  revalidatePath("/platform/users");
  return { ok: true, count: updated.count } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Platform user notes                                         */
/* ────────────────────────────────────────────────────────── */

const upsertNoteSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1),
  body: z.string().min(1).max(8_000),
  pinned: z.union([z.literal("on"), z.literal("off")]).optional(),
  isPrivate: z.union([z.literal("on"), z.literal("off")]).optional(),
});

export async function upsertUserNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.read")) {
    return { ok: false, error: "Forbidden" } as const;
  }
  const parsed = upsertNoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  if (parsed.data.id) {
    // Editing — only the author or an admin may modify.
    const existing = await db.platformUserNote.findUnique({
      where: { id: parsed.data.id },
      select: { authorId: true },
    });
    if (!existing) return { ok: false, error: "Note not found" } as const;
    if (existing.authorId !== ctx.userId && !ctx.can("users.ban")) {
      return { ok: false, error: "Forbidden" } as const;
    }
    await db.platformUserNote.update({
      where: { id: parsed.data.id },
      data: {
        body: parsed.data.body,
        pinned: parsed.data.pinned === "on",
        isPrivate: parsed.data.isPrivate === "on",
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.user_note_updated",
      entityType: "PlatformUserNote",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, target: parsed.data.userId },
    });
  } else {
    const created = await db.platformUserNote.create({
      data: {
        userId: parsed.data.userId,
        authorId: ctx.userId,
        body: parsed.data.body,
        pinned: parsed.data.pinned === "on",
        isPrivate: parsed.data.isPrivate === "on",
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.user_note_created",
      entityType: "PlatformUserNote",
      entityId: created.id,
      metadata: { actor: ctx.email, target: parsed.data.userId },
    });
  }
  revalidatePath(`/platform/users/${parsed.data.userId}`);
  return { ok: true } as const;
}

const deleteNoteSchema = z.object({
  noteId: z.string().min(1),
});

export async function deleteUserNote(formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = deleteNoteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const existing = await db.platformUserNote.findUnique({
    where: { id: parsed.data.noteId },
    select: { id: true, authorId: true, userId: true },
  });
  if (!existing) return { ok: false, error: "Note not found" } as const;
  if (existing.authorId !== ctx.userId && !ctx.can("users.ban")) {
    return { ok: false, error: "Forbidden" } as const;
  }
  await db.platformUserNote.delete({ where: { id: existing.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.user_note_deleted",
    entityType: "PlatformUserNote",
    entityId: existing.id,
    metadata: { actor: ctx.email, target: existing.userId },
  });
  revalidatePath(`/platform/users/${existing.userId}`);
  return { ok: true } as const;
}
