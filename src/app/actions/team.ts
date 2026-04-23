"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { generateToken } from "@/lib/token";
import { sendNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { auth } from "@/auth";
import { planLimit } from "@/lib/entitlements";

const ROLES = [
  "ADMIN", "SALES_REP", "CSR", "DESIGNER",
  "PRODUCTION_MANAGER", "INSTALLER", "ACCOUNTING", "EMPLOYEE",
] as const;

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
});

const INVITE_TTL_DAYS = 7;

export async function inviteMember(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "staff:manage");
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("Enter a valid email and role.")}`);
  }
  const { email, role } = parsed.data;

  // Hard cap: plan's maxUsers covers active memberships + outstanding invites.
  // We count pending invites so a shop can't front-load invites to exceed
  // the cap once they all accept. Returns Infinity for unlimited plans.
  const cap = planLimit(ctx.tenant.plan, "maxUsers");
  if (Number.isFinite(cap)) {
    const [memberCount, pendingInviteCount] = await Promise.all([
      db.membership.count({ where: { tenantId: ctx.tenant.id, status: "ACTIVE" } }),
      db.invite.count({ where: { tenantId: ctx.tenant.id, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    if (memberCount + pendingInviteCount >= cap) {
      redirect(`/t/${slug}/settings/team?error=${encodeURIComponent(
        `Your ${ctx.tenant.plan} plan allows ${cap} users. Remove a seat or upgrade to invite more.`,
      )}`);
    }
  }

  // If they already have an active membership, no-op.
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    const existingMembership = await db.membership.findUnique({
      where: { userId_tenantId: { userId: existingUser.id, tenantId: ctx.tenant.id } },
    });
    if (existingMembership) {
      redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("That user is already a member.")}`);
    }
  }

  const token = generateToken();
  await db.invite.create({
    data: {
      tenantId: ctx.tenant.id,
      email,
      role,
      token,
      invitedBy: ctx.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const session = await auth();
  const inviterName = session?.user?.name ?? session?.user?.email ?? "A teammate";
  const acceptUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/accept-invite/${token}`;
  await sendNotification({
    kind: "team.invite_received",
    to: email,
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    tokens: {
      inviter_name: inviterName,
      workspace_name: ctx.tenant.name,
      accept_url: acceptUrl,
    },
  });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "team.invited", entityType: "Invite", metadata: { email, role } });

  revalidatePath(`/t/${slug}/settings/team`);
}

export async function revokeInvite(slug: string, inviteId: string) {
  const ctx = await requirePermission(slug, "staff:manage");
  await db.invite.deleteMany({ where: { id: inviteId, tenantId: ctx.tenant.id, acceptedAt: null } });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "team.invite_revoked", entityId: inviteId });
  revalidatePath(`/t/${slug}/settings/team`);
}

export async function resendInvite(slug: string, inviteId: string) {
  const ctx = await requirePermission(slug, "staff:manage");
  const invite = await db.invite.findFirst({
    where: { id: inviteId, tenantId: ctx.tenant.id, acceptedAt: null },
  });
  if (!invite) return;

  // Refresh expiry so the link stays valid for another window.
  await db.invite.update({
    where: { id: invite.id },
    data: { expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000) },
  });

  const session = await auth();
  const inviterName = session?.user?.name ?? session?.user?.email ?? "A teammate";
  const acceptUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/accept-invite/${invite.token}`;
  await sendNotification({
    kind: "team.invite_received",
    to: invite.email,
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    tokens: {
      inviter_name: inviterName,
      workspace_name: ctx.tenant.name,
      accept_url: acceptUrl,
    },
  });
}

const changeRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["OWNER", ...ROLES]),
});

export async function changeMemberRole(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "staff:manage");
  const parsed = changeRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const m = await db.membership.findFirst({
    where: { id: parsed.data.membershipId, tenantId: ctx.tenant.id },
  });
  if (!m) return;

  // Only an OWNER can grant or revoke OWNER, and the last OWNER cannot be demoted.
  if ((m.role === "OWNER" || parsed.data.role === "OWNER") && ctx.role !== "OWNER") return;
  if (m.role === "OWNER" && parsed.data.role !== "OWNER") {
    const ownerCount = await db.membership.count({
      where: { tenantId: ctx.tenant.id, role: "OWNER", status: "ACTIVE" },
    });
    if (ownerCount <= 1) return;
  }

  await db.membership.update({ where: { id: m.id }, data: { role: parsed.data.role } });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "team.role_changed", entityId: m.id, metadata: { role: parsed.data.role } });
  revalidatePath(`/t/${slug}/settings/team`);
}

// Phase 15 — assign a member to a subset of branches. An empty selection means
// "all branches" (the legacy default), which keeps single-location shops a
// no-op. Validates every supplied id against the tenant so a malicious form
// can't grant access to another tenant's location.
export async function updateMemberBranches(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "staff:manage");
  const membershipId = String(formData.get("membershipId") ?? "");
  if (!membershipId) return;

  const m = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
  });
  if (!m) return;

  // Multi-select: each selected branch comes through as its own entry.
  const raw = formData.getAll("locationIds")
    .map((v) => String(v))
    .filter(Boolean);
  const valid = raw.length === 0
    ? []
    : (await db.location.findMany({
        where: { tenantId: ctx.tenant.id, id: { in: raw } },
        select: { id: true },
      })).map((l) => l.id);

  await db.membership.update({
    where: { id: m.id },
    data: { locationIds: valid },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "team.branches_changed",
    entityId: m.id,
    metadata: { locationIds: valid },
  });
  revalidatePath(`/t/${slug}/settings/team`);
}

export async function removeMember(slug: string, membershipId: string) {
  const ctx = await requirePermission(slug, "staff:manage");
  const m = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
  });
  if (!m) return;
  if (m.userId === ctx.userId) return; // can't remove yourself
  if (m.role === "OWNER") {
    const ownerCount = await db.membership.count({
      where: { tenantId: ctx.tenant.id, role: "OWNER", status: "ACTIVE" },
    });
    if (ownerCount <= 1) return;
  }
  await db.membership.delete({ where: { id: m.id } });
  await logAudit({ tenantId: ctx.tenant.id, userId: ctx.userId, action: "team.removed", entityId: m.id });
  revalidatePath(`/t/${slug}/settings/team`);
}

// Phase 2 — suspend a membership without deleting it.
//
// Unlike `remove`, suspend preserves the row so we can reinstate later
// (e.g. a rep on parental leave) and keeps their audit/history intact.
// A suspended member fails lookups in requireTenant() so they're locked
// out of the workspace even if they still have an auth cookie.
export async function suspendMembership(slug: string, membershipId: string) {
  const ctx = await requirePermission(slug, "staff:manage");
  const m = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
  });
  if (!m) return;
  if (m.userId === ctx.userId) return; // can't suspend yourself
  if (m.status === "SUSPENDED") return;
  if (m.role === "OWNER") {
    const activeOwners = await db.membership.count({
      where: { tenantId: ctx.tenant.id, role: "OWNER", status: "ACTIVE" },
    });
    if (activeOwners <= 1) return; // refuse to leave the shop ownerless
  }
  await db.membership.update({ where: { id: m.id }, data: { status: "SUSPENDED" } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "team.suspended",
    entityId: m.id,
  });
  revalidatePath(`/t/${slug}/settings/team`);
}

export async function reinstateMembership(slug: string, membershipId: string) {
  const ctx = await requirePermission(slug, "staff:manage");
  const m = await db.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
  });
  if (!m || m.status === "ACTIVE") return;
  await db.membership.update({ where: { id: m.id }, data: { status: "ACTIVE" } });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "team.reinstated",
    entityId: m.id,
  });
  revalidatePath(`/t/${slug}/settings/team`);
}

// Phase 2 — transfer sole ownership to another member.
//
// Ownership transfer is deliberately a one-click primitive separate from
// `changeMemberRole`. The current owner stays on the team but gets
// demoted to ADMIN; the target is promoted to OWNER. Requires typing
// the target's email as a confirmation (prevents pocket-clicks).
const transferOwnershipSchema = z.object({
  membershipId: z.string().min(1),
  confirmEmail: z.string().email(),
});

export async function transferOwnership(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "staff:manage");
  if (ctx.role !== "OWNER") {
    redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("Only an owner can transfer ownership.")}`);
  }
  const parsed = transferOwnershipSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("Select a member and confirm their email to transfer ownership.")}`);
  }
  const target = await db.membership.findFirst({
    where: { id: parsed.data.membershipId, tenantId: ctx.tenant.id, status: "ACTIVE" },
    include: { user: true },
  });
  if (!target) {
    redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("That member isn't active.")}`);
  }
  if (target!.user.email.toLowerCase() !== parsed.data.confirmEmail.toLowerCase()) {
    redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("Email confirmation didn't match.")}`);
  }
  if (target!.userId === ctx.userId) {
    redirect(`/t/${slug}/settings/team?error=${encodeURIComponent("You are already the owner.")}`);
  }

  await db.$transaction([
    db.membership.update({
      where: { id: target!.id },
      data: { role: "OWNER" },
    }),
    db.membership.updateMany({
      where: { tenantId: ctx.tenant.id, userId: ctx.userId, role: "OWNER" },
      data: { role: "ADMIN" },
    }),
  ]);
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "team.ownership_transferred",
    entityId: target!.id,
    metadata: { toUserId: target!.userId },
  });
  redirect(`/t/${slug}/settings/team?ok=${encodeURIComponent(`Ownership transferred to ${target!.user.email}.`)}`);
}
