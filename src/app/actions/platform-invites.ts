"use server";

// Platform-admin invite actions — Page 12.
//
// All gated on staff.invite. The accept-invite flow itself lives at
// /accept-platform-invite/[token] (public route) and isn't a server
// action — it's a regular page that reads the invite landing data and
// walks the user through completing their account. (The legacy
// /accept-invite/[token] flow is the tenant-side invitation accept
// surface, kept untouched.)

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import { appOrigin } from "@/lib/share";
import type { PlatformRole } from "@prisma/client";

const PLATFORM_ROLES: PlatformRole[] = [
  "SUPER_ADMIN", "SITE_MANAGER", "SUPPORT_AGENT", "ADMIN", "MANAGER",
  "SUPPORT_LEAD", "BILLING_MANAGER", "DEVELOPER", "MARKETING_MANAGER",
  "CONTENT_MANAGER", "ANALYST", "READ_ONLY_VIEWER",
];

/* ────────────────────────────────────────────────────────── */
/* Create invite — supports multi-email comma list             */
/* ────────────────────────────────────────────────────────── */

const createSchema = z.object({
  /** Comma- or newline-separated emails. */
  emails: z.string().min(3),
  platformRole: z.enum(PLATFORM_ROLES as [PlatformRole, ...PlatformRole[]]),
  customRoleId: z.string().optional(),
  /** CSV of PlatformTeam ids. */
  teamIds: z.string().optional(),
  customMessage: z.string().max(2_000).optional(),
  expiryDays: z.coerce.number().int().min(1).max(60).default(7),
  mfaRequired: z.union([z.literal("on"), z.literal("off")]).optional(),
});

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createPlatformInvites(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false, error: "Your role can't invite admins" } as const;
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const emails = Array.from(new Set(
    parsed.data.emails.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean),
  ));
  const valid = emails.filter((e) => EMAIL_RX.test(e));
  if (valid.length === 0) return { ok: false, error: "No valid emails" } as const;

  const teamIds = (parsed.data.teamIds ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  // Validate custom role exists when provided.
  if (parsed.data.customRoleId) {
    const cr = await db.customPlatformRole.findUnique({
      where: { id: parsed.data.customRoleId },
      select: { id: true, status: true },
    });
    if (!cr) return { ok: false, error: "Custom role not found" } as const;
    if (cr.status === "ARCHIVED") return { ok: false, error: "Custom role is archived" } as const;
  }
  // Validate teams.
  if (teamIds.length > 0) {
    const known = await db.platformTeam.findMany({
      where: { id: { in: teamIds }, archivedAt: null },
      select: { id: true },
    });
    if (known.length !== teamIds.length) {
      return { ok: false, error: "One or more teams are unknown or archived" } as const;
    }
  }

  const expiresAt = new Date(Date.now() + parsed.data.expiryDays * 86_400_000);

  let created = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const email of valid) {
    // Skip if there's already a SENT/OPENED invite for the same email.
    const existing = await db.platformInvite.findFirst({
      where: { email, status: { in: ["SENT", "OPENED"] } },
      select: { id: true },
    });
    if (existing) { skipped += 1; continue; }

    const token = randomBytes(32).toString("base64url");
    try {
      const invite = await db.platformInvite.create({
        data: {
          email,
          platformRole: parsed.data.platformRole,
          customRoleId: parsed.data.customRoleId || null,
          teamIds,
          customMessage: parsed.data.customMessage?.trim() || null,
          mfaRequired: parsed.data.mfaRequired !== "off",
          token,
          expiresAt,
          invitedById: ctx.userId,
        },
      });
      await sendInviteEmail({
        email, token, ctxEmail: ctx.email,
        customMessage: parsed.data.customMessage?.trim() || null,
        expiresAt,
      });
      await logPlatformAudit({
        userId: ctx.userId,
        action: "platform.admin_invited",
        entityType: "PlatformInvite",
        entityId: invite.id,
        metadata: { actor: ctx.email, email, platformRole: parsed.data.platformRole, teamCount: teamIds.length },
      });
      created += 1;
    } catch (err) {
      failures.push(email);
      void err;
    }
  }

  revalidatePath("/platform/access/invitations");
  return { ok: true as const, created, skipped, failed: failures.length };
}

async function sendInviteEmail({
  email, token, ctxEmail, customMessage, expiresAt,
}: {
  email: string; token: string; ctxEmail: string;
  customMessage: string | null; expiresAt: Date;
}) {
  const url = `${appOrigin()}/accept-platform-invite/${token}`;
  const lines = [
    `${ctxEmail} invited you to join Flowtora as a platform admin.`,
    "",
    customMessage ? customMessage : "",
    customMessage ? "" : null,
    `Accept here (expires ${expiresAt.toLocaleString()}):`,
    url,
    "",
    "If you didn't expect this invite, ignore the email — your address won't be added.",
    "",
    "— The Flowtora team",
  ].filter((l) => l != null) as string[];
  await sendEmail({
    to: email,
    subject: "You're invited to Flowtora as a platform admin",
    text: lines.join("\n"),
    html: `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;">${escapeHtml(lines.join("\n"))}</pre>`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

/* ────────────────────────────────────────────────────────── */
/* Resend                                                     */
/* ────────────────────────────────────────────────────────── */

const inviteIdSchema = z.object({ inviteId: z.string().min(1) });

export async function resendPlatformInvite(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false, error: "Your role can't resend invites" } as const;
  }
  const parsed = inviteIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const invite = await db.platformInvite.findUnique({
    where: { id: parsed.data.inviteId },
    select: { id: true, email: true, token: true, status: true, expiresAt: true, customMessage: true },
  });
  if (!invite) return { ok: false, error: "Invite not found" } as const;
  if (invite.status === "ACCEPTED") return { ok: false, error: "Already accepted" } as const;
  if (invite.status === "REVOKED")  return { ok: false, error: "Revoked — create a fresh invite" } as const;

  // Bump expiry forward 7 days from now if the existing one is past.
  const newExpiry = invite.expiresAt < new Date()
    ? new Date(Date.now() + 7 * 86_400_000)
    : invite.expiresAt;

  await sendInviteEmail({
    email: invite.email, token: invite.token, ctxEmail: ctx.email,
    customMessage: invite.customMessage, expiresAt: newExpiry,
  });
  await db.platformInvite.update({
    where: { id: invite.id },
    data: {
      lastResentAt: new Date(),
      resendCount: { increment: 1 },
      expiresAt: newExpiry,
      status: invite.status === "EXPIRED" ? "SENT" : invite.status,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.admin_invite_resent",
    entityType: "PlatformInvite",
    entityId: invite.id,
    metadata: { actor: ctx.email, email: invite.email },
  });
  revalidatePath("/platform/access/invitations");
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Change role / Revoke                                        */
/* ────────────────────────────────────────────────────────── */

const changeRoleSchema = z.object({
  inviteId: z.string().min(1),
  platformRole: z.enum(PLATFORM_ROLES as [PlatformRole, ...PlatformRole[]]),
  customRoleId: z.string().optional(),
});

export async function changeInviteRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false, error: "Your role can't change invite roles" } as const;
  }
  const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await db.platformInvite.update({
    where: { id: parsed.data.inviteId },
    data: {
      platformRole: parsed.data.platformRole,
      customRoleId: parsed.data.customRoleId?.trim() || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.admin_invite_role_changed",
    entityType: "PlatformInvite",
    entityId: parsed.data.inviteId,
    metadata: { actor: ctx.email, role: parsed.data.platformRole },
  });
  revalidatePath("/platform/access/invitations");
  return { ok: true } as const;
}

export async function revokePlatformInvite(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false, error: "Your role can't revoke invites" } as const;
  }
  const parsed = inviteIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const invite = await db.platformInvite.findUnique({
    where: { id: parsed.data.inviteId },
    select: { id: true, status: true },
  });
  if (!invite) return { ok: false, error: "Invite not found" } as const;
  if (invite.status === "ACCEPTED") return { ok: false, error: "Cannot revoke an accepted invite" } as const;

  await db.platformInvite.update({
    where: { id: invite.id },
    data: { status: "REVOKED", revokedAt: new Date(), revokedById: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.admin_invite_revoked",
    entityType: "PlatformInvite",
    entityId: invite.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/access/invitations");
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Stamp openedAt — called from the public landing page       */
/* ────────────────────────────────────────────────────────── */

export async function stampInviteOpened(token: string) {
  // No auth — the public landing page calls this on load. The
  // token itself is the bearer credential.
  const invite = await db.platformInvite.findUnique({
    where: { token },
    select: { id: true, status: true, openedAt: true },
  });
  if (!invite) return { ok: false } as const;
  if (invite.openedAt) return { ok: true } as const; // idempotent
  await db.platformInvite.update({
    where: { id: invite.id },
    data: {
      openedAt: new Date(),
      status: invite.status === "SENT" ? "OPENED" : invite.status,
    },
  });
  return { ok: true } as const;
}

/* ────────────────────────────────────────────────────────── */
/* Accept invite — runs from the public landing page action   */
/* ────────────────────────────────────────────────────────── */

const acceptSchema = z.object({
  token: z.string().min(1),
  /** Display name supplied by the recipient. Optional — defaults to
   *  the part before @ on the invited email. */
  name: z.string().max(120).optional(),
});

export async function acceptPlatformInvite(formData: FormData) {
  // Public — no requirePlatformStaff. The token gates access.
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const invite = await db.platformInvite.findUnique({
    where: { token: parsed.data.token },
  });
  if (!invite) return { ok: false, error: "Invite not found" } as const;
  if (invite.status === "ACCEPTED") return { ok: false, error: "Already accepted" } as const;
  if (invite.status === "REVOKED")  return { ok: false, error: "Invite was revoked" } as const;
  if (invite.expiresAt < new Date()) {
    await db.platformInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    return { ok: false, error: "Invite has expired" } as const;
  }

  // Find or create the User row with the invited email.
  let user = await db.user.findUnique({
    where: { email: invite.email },
    select: { id: true, platformRole: true },
  });
  const namePart = invite.email.split("@")[0]?.replace(/[._-]+/g, " ") ?? "";
  const displayName = parsed.data.name?.trim() || namePart;
  if (!user) {
    const created = await db.user.create({
      data: {
        email: invite.email,
        name: displayName,
        platformRole: invite.platformRole,
        customPlatformRoleId: invite.customRoleId,
      },
      select: { id: true, platformRole: true },
    });
    user = created;
  } else {
    await db.user.update({
      where: { id: user.id },
      data: {
        platformRole: invite.platformRole,
        customPlatformRoleId: invite.customRoleId,
        sessionVersion: { increment: 1 },
      },
    });
  }
  // Add team memberships, idempotently.
  for (const teamId of invite.teamIds) {
    await db.platformTeamMember.upsert({
      where: { teamId_userId: { teamId, userId: user.id } },
      update: {},
      create: { teamId, userId: user.id, role: "MEMBER" },
    });
  }
  await db.platformInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedById: user.id },
  });
  await logPlatformAudit({
    userId: user.id,
    action: "platform.admin_invite_accepted",
    entityType: "PlatformInvite",
    entityId: invite.id,
    metadata: { email: invite.email, role: invite.platformRole },
  });
  return { ok: true as const, userId: user.id };
}
