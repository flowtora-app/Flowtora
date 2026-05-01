"use server";

// Platform-team server actions — Page 11 of the admin spec.
//
// Permissions:
//   • Create / edit / archive teams + member changes + role
//     assignments + on-call CRUD: staff.assign_role.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/* ── Team CRUD ───────────────────────────────────────────── */

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color: z.string().max(7).optional(),
});

export async function createTeam(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const baseKey = slugify(parsed.data.name);
  let key = baseKey;
  let n = 1;
  while (true) {
    const existing = await db.platformTeam.findUnique({ where: { key }, select: { id: true } });
    if (!existing) break;
    n += 1;
    key = `${baseKey}-${n}`;
    if (n > 50) return { ok: false, error: "Couldn't allocate a unique key" } as const;
  }
  const nameClash = await db.platformTeam.findUnique({ where: { name: parsed.data.name.trim() }, select: { id: true } });
  if (nameClash) return { ok: false, error: "Name already taken" } as const;

  const created = await db.platformTeam.create({
    data: {
      name: parsed.data.name.trim(),
      key,
      description: parsed.data.description?.trim() || null,
      color: parsed.data.color?.replace(/^#/, "") || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.team_created",
    entityType: "PlatformTeam",
    entityId: created.id,
    metadata: { actor: ctx.email, name: parsed.data.name },
  });
  revalidatePath("/platform/access/teams");
  return { ok: true as const, id: created.id };
}

const updateSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  color: z.string().max(7).optional(),
  slackChannel: z.string().max(120).optional(),
  emailDistro: z.string().max(200).optional(),
  notifySlack: z.union([z.literal("on"), z.literal("off")]).optional(),
  notifyPagerDuty: z.union([z.literal("on"), z.literal("off")]).optional(),
  notifySms: z.union([z.literal("on"), z.literal("off")]).optional(),
});

export async function updateTeam(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  await db.platformTeam.update({
    where: { id: parsed.data.teamId },
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      color: parsed.data.color?.replace(/^#/, "") || null,
      slackChannel: parsed.data.slackChannel?.trim() || null,
      emailDistro: parsed.data.emailDistro?.trim() || null,
      notifySlack: parsed.data.notifySlack === "on",
      notifyPagerDuty: parsed.data.notifyPagerDuty === "on",
      notifySms: parsed.data.notifySms === "on",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.team_updated",
    entityType: "PlatformTeam",
    entityId: parsed.data.teamId,
    metadata: { actor: ctx.email, name: parsed.data.name },
  });
  revalidatePath("/platform/access/teams");
  revalidatePath(`/platform/access/teams/${parsed.data.teamId}`);
  return { ok: true } as const;
}

const archiveSchema = z.object({
  teamId: z.string().min(1),
  archive: z.union([z.literal("on"), z.literal("off")]),
});

export async function setTeamArchived(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.platformTeam.update({
    where: { id: parsed.data.teamId },
    data: { archivedAt: parsed.data.archive === "on" ? new Date() : null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.archive === "on" ? "platform.team_archived" : "platform.team_restored",
    entityType: "PlatformTeam",
    entityId: parsed.data.teamId,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/access/teams");
  revalidatePath(`/platform/access/teams/${parsed.data.teamId}`);
  return { ok: true } as const;
}

/* ── Members ─────────────────────────────────────────────── */

const addMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: z.union([z.literal("LEAD"), z.literal("MEMBER")]).default("MEMBER"),
});

export async function addTeamMember(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  // Idempotent — upsert on (teamId, userId).
  const existing = await db.platformTeamMember.findUnique({
    where: { teamId_userId: { teamId: parsed.data.teamId, userId: parsed.data.userId } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Already a member" } as const;
  }
  const created = await db.platformTeamMember.create({
    data: {
      teamId: parsed.data.teamId,
      userId: parsed.data.userId,
      role: parsed.data.role,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.team_member_added",
    entityType: "PlatformTeamMember",
    entityId: created.id,
    metadata: { actor: ctx.email, teamId: parsed.data.teamId, target: parsed.data.userId, role: parsed.data.role },
  });
  revalidatePath(`/platform/access/teams/${parsed.data.teamId}`);
  return { ok: true } as const;
}

const removeMemberSchema = z.object({
  membershipId: z.string().min(1),
});

export async function removeTeamMember(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const m = await db.platformTeamMember.findUnique({
    where: { id: parsed.data.membershipId },
    select: { id: true, teamId: true, userId: true },
  });
  if (!m) return { ok: false, error: "Membership not found" } as const;
  await db.platformTeamMember.delete({ where: { id: m.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.team_member_removed",
    entityType: "PlatformTeamMember",
    entityId: m.id,
    metadata: { actor: ctx.email, teamId: m.teamId, target: m.userId },
  });
  revalidatePath(`/platform/access/teams/${m.teamId}`);
  return { ok: true } as const;
}

const setRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.union([z.literal("LEAD"), z.literal("MEMBER")]),
});

export async function setTeamMemberRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = setRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const m = await db.platformTeamMember.update({
    where: { id: parsed.data.membershipId },
    data: { role: parsed.data.role },
    select: { id: true, teamId: true, userId: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.team_member_role_changed",
    entityType: "PlatformTeamMember",
    entityId: m.id,
    metadata: { actor: ctx.email, teamId: m.teamId, target: m.userId, role: parsed.data.role },
  });
  revalidatePath(`/platform/access/teams/${m.teamId}`);
  return { ok: true } as const;
}

/* ── Inherited roles ─────────────────────────────────────── */

const setRolesSchema = z.object({
  teamId: z.string().min(1),
  /** CSV of CustomPlatformRole.key values. */
  roleKeys: z.string(),
});

export async function setTeamInheritedRoles(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage teams" } as const;
  }
  const parsed = setRolesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const keys = parsed.data.roleKeys.split(",").map((s) => s.trim()).filter(Boolean);

  await db.platformTeam.update({
    where: { id: parsed.data.teamId },
    data: { inheritedRoleKeys: keys },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.team_inherited_roles_set",
    entityType: "PlatformTeam",
    entityId: parsed.data.teamId,
    metadata: { actor: ctx.email, keys },
  });
  revalidatePath(`/platform/access/teams/${parsed.data.teamId}`);
  return { ok: true } as const;
}

/* ── On-call shifts ──────────────────────────────────────── */

const upsertShiftSchema = z.object({
  id: z.string().optional(),
  teamId: z.string().min(1),
  userId: z.string().min(1),
  level: z.union([z.literal("PRIMARY"), z.literal("SECONDARY"), z.literal("TERTIARY")]),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  isOverride: z.union([z.literal("on"), z.literal("off")]).optional(),
  notes: z.string().max(500).optional(),
});

export async function upsertOnCallShift(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage on-call" } as const;
  }
  const parsed = upsertShiftSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Invalid dates" } as const;
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false, error: "End must be after start" } as const;
  }
  const data = {
    teamId: parsed.data.teamId,
    userId: parsed.data.userId,
    level: parsed.data.level,
    startsAt,
    endsAt,
    isOverride: parsed.data.isOverride === "on",
    notes: parsed.data.notes?.trim() || null,
  };
  let id: string;
  if (parsed.data.id) {
    const updated = await db.onCallShift.update({ where: { id: parsed.data.id }, data });
    id = updated.id;
  } else {
    const created = await db.onCallShift.create({
      data: { ...data, createdBy: ctx.userId },
    });
    id = created.id;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.id ? "platform.oncall_shift_updated" : "platform.oncall_shift_created",
    entityType: "OnCallShift",
    entityId: id,
    metadata: {
      actor: ctx.email, teamId: parsed.data.teamId,
      level: parsed.data.level, target: parsed.data.userId,
    },
  });
  revalidatePath(`/platform/access/teams/${parsed.data.teamId}`);
  return { ok: true as const, id };
}

const deleteShiftSchema = z.object({
  shiftId: z.string().min(1),
});

export async function deleteOnCallShift(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't manage on-call" } as const;
  }
  const parsed = deleteShiftSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const row = await db.onCallShift.findUnique({
    where: { id: parsed.data.shiftId },
    select: { id: true, teamId: true },
  });
  if (!row) return { ok: false, error: "Shift not found" } as const;
  await db.onCallShift.delete({ where: { id: row.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.oncall_shift_deleted",
    entityType: "OnCallShift",
    entityId: row.id,
    metadata: { actor: ctx.email, teamId: row.teamId },
  });
  revalidatePath(`/platform/access/teams/${row.teamId}`);
  return { ok: true } as const;
}
