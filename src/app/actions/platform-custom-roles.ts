"use server";

// Phase 1 follow-up — admin-defined custom platform roles.
//
// Lifecycle:
//   1. createCustomRole — DRAFT by default, no enforcement, no users
//      attached. Admin tunes the permission grid.
//   2. updateCustomRole — edit name/description/permissions, optionally
//      flip status.
//   3. assignCustomPlatformRole — attach (or detach) a custom role on
//      a staff user. Bumps sessionVersion so the change takes effect
//      on the next request.
//   4. archiveCustomRole — detaches all members in the same transaction
//      so they fall back to the baseline role. Archived roles stay
//      around for audit history.
//
// Gating: all four use staff.assign_role. We deliberately do NOT add a
// "you can only grant perms you have" rule in this slice — the
// SUPER_ADMIN-tier custodianship of staff.assign_role is enough.
// Future hardening: restrict the picker to perms the actor possesses.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requirePlatformPermission,
  logPlatformAudit,
} from "@/lib/platform";
import { sanitizePlatformPermissions } from "@/lib/rbac";

const KEY_RX = /^[a-z0-9][a-z0-9_-]{2,40}$/;

const customRoleCreateSchema = z.object({
  name: z.string().trim().min(2, "Name 2+ chars").max(60),
  key: z.string().trim().toLowerCase().regex(KEY_RX, "Slug: lowercase, 3-41 chars, letters/numbers/dash/underscore"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
});

export async function createCustomRole(formData: FormData) {
  const ctx = await requirePlatformPermission("staff.assign_role");

  const raw = Object.fromEntries(formData.entries());
  const parsed = customRoleCreateSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/platform/staff/roles?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  // Permissions come through as repeated form fields named "permission".
  const permsRaw = formData.getAll("permission").map(String);
  const permissions = sanitizePlatformPermissions(permsRaw);

  const [nameClash, keyClash] = await Promise.all([
    db.customPlatformRole.findUnique({ where: { name: parsed.data.name }, select: { id: true } }),
    db.customPlatformRole.findUnique({ where: { key: parsed.data.key },   select: { id: true } }),
  ]);
  if (nameClash) redirect(`/platform/staff/roles?error=${encodeURIComponent("Name already taken")}`);
  if (keyClash)  redirect(`/platform/staff/roles?error=${encodeURIComponent("Slug already taken")}`);

  const created = await db.customPlatformRole.create({
    data: {
      name: parsed.data.name,
      key: parsed.data.key,
      description: parsed.data.description?.trim() || null,
      status: parsed.data.status,
      permissions,
      createdById: ctx.userId,
    },
    select: { id: true, name: true, key: true, status: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.custom_role_created",
    entityType: "CustomPlatformRole",
    entityId: created.id,
    metadata: {
      name: created.name,
      key: created.key,
      status: created.status,
      permissionCount: permissions.length,
    },
  });

  revalidatePath("/platform/staff/roles");
  redirect(`/platform/staff/roles?ok=created&id=${created.id}`);
}

const customRoleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE"]),
});

export async function updateCustomRole(roleId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("staff.assign_role");

  const raw = Object.fromEntries(formData.entries());
  const parsed = customRoleUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/platform/staff/roles?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }

  const row = await db.customPlatformRole.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, key: true, status: true, permissions: true },
  });
  if (!row) redirect(`/platform/staff/roles?error=${encodeURIComponent("Role not found")}`);
  if (row.status === "ARCHIVED") {
    redirect(`/platform/staff/roles?error=${encodeURIComponent("Archived roles cant be edited")}`);
  }

  const nameClash = await db.customPlatformRole.findUnique({
    where: { name: parsed.data.name },
    select: { id: true },
  });
  if (nameClash && nameClash.id !== row.id) {
    redirect(`/platform/staff/roles?error=${encodeURIComponent("Name already taken")}`);
  }

  const permsRaw = formData.getAll("permission").map(String);
  const permissions = sanitizePlatformPermissions(permsRaw);

  await db.customPlatformRole.update({
    where: { id: row.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      status: parsed.data.status,
      permissions,
    },
  });

  // Bump sessionVersion for every member of the role so the new
  // permission set takes effect on the next request — there is no point
  // shipping a custom-role edit that takes 24h to propagate.
  await db.user.updateMany({
    where: { customPlatformRoleId: row.id },
    data: { sessionVersion: { increment: 1 } },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.custom_role_updated",
    entityType: "CustomPlatformRole",
    entityId: row.id,
    metadata: {
      name: parsed.data.name,
      status: parsed.data.status,
      permissionCount: permissions.length,
      previousPermissionCount: row.permissions.length,
    },
  });

  revalidatePath("/platform/staff/roles");
  redirect(`/platform/staff/roles?ok=updated`);
}

export async function archiveCustomRole(roleId: string) {
  const ctx = await requirePlatformPermission("staff.assign_role");

  const row = await db.customPlatformRole.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, status: true, _count: { select: { members: true } } },
  });
  if (!row) redirect(`/platform/staff/roles?error=${encodeURIComponent("Role not found")}`);
  if (row.status === "ARCHIVED") redirect(`/platform/staff/roles?ok=already_archived`);

  await db.$transaction([
    db.user.updateMany({
      where: { customPlatformRoleId: row.id },
      data: { customPlatformRoleId: null, sessionVersion: { increment: 1 } },
    }),
    db.customPlatformRole.update({
      where: { id: row.id },
      data: { status: "ARCHIVED" },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.custom_role_archived",
    entityType: "CustomPlatformRole",
    entityId: row.id,
    metadata: { name: row.name, detachedMembers: row._count.members },
  });

  revalidatePath("/platform/staff/roles");
  revalidatePath("/platform/staff");
  redirect(`/platform/staff/roles?ok=archived`);
}

const assignCustomRoleSchema = z.object({
  customRoleId: z.string().optional().or(z.literal("")),
});

export async function assignCustomPlatformRole(userId: string, formData: FormData) {
  const ctx = await requirePlatformPermission("staff.assign_role");
  const parsed = assignCustomRoleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/staff?error=${encodeURIComponent("Invalid")}`);
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true, customPlatformRoleId: true },
  });
  if (!target) redirect(`/platform/staff?error=${encodeURIComponent("User not found")}`);
  if (!target.platformRole) {
    redirect(`/platform/staff?error=${encodeURIComponent("Assign a baseline role before attaching a custom role")}`);
  }

  const nextId = parsed.data.customRoleId && parsed.data.customRoleId.trim() !== ""
    ? parsed.data.customRoleId.trim() : null;

  if (nextId) {
    const role = await db.customPlatformRole.findUnique({
      where: { id: nextId },
      select: { id: true, status: true, name: true },
    });
    if (!role) redirect(`/platform/staff?error=${encodeURIComponent("Custom role not found")}`);
    if (role.status !== "ACTIVE") {
      redirect(`/platform/staff?error=${encodeURIComponent("Role is not active — promote it on /platform/staff/roles first")}`);
    }
  }

  if (target.customPlatformRoleId === nextId) {
    redirect(`/platform/staff?ok=custom_role_unchanged`);
  }

  await db.user.update({
    where: { id: target.id },
    data: { customPlatformRoleId: nextId, sessionVersion: { increment: 1 } },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: nextId ? "platform.custom_role_assigned" : "platform.custom_role_detached",
    entityType: "User",
    entityId: target.id,
    metadata: {
      targetEmail: target.email,
      from: target.customPlatformRoleId,
      to: nextId,
    },
  });

  revalidatePath("/platform/staff");
  redirect(`/platform/staff?ok=${nextId ? "custom_role_assigned" : "custom_role_detached"}`);
}
