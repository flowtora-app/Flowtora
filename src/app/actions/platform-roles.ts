"use server";

// Roles & Permissions server actions — Page 10.
//
// Most "edit a custom role" wires through the existing
// platform-custom-roles.ts helpers. This file adds the Page-10-only
// niceties: Clone (built-in or custom → new draft custom),
// Import-JSON (paste a previously-exported role JSON to recreate),
// and Audit-role-assignments (returns the per-staff role assignments
// snapshot for download).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformPermission,
} from "@/lib/rbac";
import type { PlatformRole } from "@prisma/client";
import { loadRoleDetail } from "@/server/platform/roles-page";

const VALID_PERMS = new Set(Object.values(PLATFORM_ROLE_PERMISSIONS).flat());

/* ── Create empty draft (for the /platform/access/roles "+ New role" flow) ── */

const createDraftSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  key: z.string().max(60).optional(),
});

export async function createDraftRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't author roles" } as const;
  }
  const parsed = createDraftSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }

  const baseKey = parsed.data.key?.trim() || slugify(parsed.data.name);
  let key = baseKey;
  let n = 1;
  while (true) {
    const existing = await db.customPlatformRole.findUnique({ where: { key }, select: { id: true } });
    if (!existing) break;
    n += 1;
    key = `${baseKey}-${n}`;
    if (n > 50) return { ok: false, error: "Couldn't allocate a unique key" } as const;
  }

  const nameClash = await db.customPlatformRole.findUnique({ where: { name: parsed.data.name.trim() }, select: { id: true } });
  if (nameClash) return { ok: false, error: "Name already taken" } as const;

  const created = await db.customPlatformRole.create({
    data: {
      name: parsed.data.name.trim(),
      key,
      description: parsed.data.description?.trim() || null,
      permissions: [],
      status: "DRAFT",
      createdById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_created",
    entityType: "CustomPlatformRole",
    entityId: created.id,
    metadata: { actor: ctx.email, name: parsed.data.name },
  });
  revalidatePath("/platform/access/roles");
  return { ok: true as const, id: created.id };
}

/* ── Clone a role ───────────────────────────────────────── */

const cloneSchema = z.object({
  /** Source — either a PlatformRole enum value or a CustomPlatformRole id. */
  sourceId: z.string().min(1),
  /** Display name for the new draft. */
  name: z.string().min(1).max(120),
  /** Slug-style key; generated if blank. */
  key: z.string().max(60).optional(),
});

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function cloneRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't author roles" } as const;
  }
  const parsed = cloneSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const detail = await loadRoleDetail(parsed.data.sourceId);
  if (!detail) return { ok: false, error: "Source role not found" } as const;

  const baseKey = parsed.data.key?.trim() || slugify(parsed.data.name);
  let key = baseKey;
  let n = 1;
  // De-duplicate the key if it collides — slap a numeric suffix.
  while (true) {
    const existing = await db.customPlatformRole.findUnique({ where: { key }, select: { id: true } });
    if (!existing) break;
    n += 1;
    key = `${baseKey}-${n}`;
    if (n > 50) return { ok: false, error: "Couldn't allocate a unique key" } as const;
  }

  const created = await db.customPlatformRole.create({
    data: {
      name: parsed.data.name.trim(),
      key,
      description: detail.description ?? null,
      permissions: detail.permissions,
      status: "DRAFT",
      createdById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_cloned",
    entityType: "CustomPlatformRole",
    entityId: created.id,
    metadata: { actor: ctx.email, source: parsed.data.sourceId, name: parsed.data.name },
  });
  revalidatePath("/platform/access/roles");
  return { ok: true, id: created.id } as const;
}

/* ── Import a role from JSON ────────────────────────────── */

const importSchema = z.object({
  /** JSON blob shape: { name, key?, description?, permissions: string[] } */
  json: z.string().min(2),
});

export async function importRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't author roles" } as const;
  }
  const parsed = importSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  let payload: { name?: unknown; key?: unknown; description?: unknown; permissions?: unknown };
  try {
    payload = JSON.parse(parsed.data.json) as typeof payload;
  } catch {
    return { ok: false, error: "Invalid JSON" } as const;
  }
  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    return { ok: false, error: "JSON must include a `name`" } as const;
  }
  if (!Array.isArray(payload.permissions)) {
    return { ok: false, error: "JSON must include a `permissions` array" } as const;
  }
  const filtered: PlatformPermission[] = [];
  for (const p of payload.permissions) {
    if (typeof p === "string" && VALID_PERMS.has(p as PlatformPermission)) {
      filtered.push(p as PlatformPermission);
    }
  }
  const baseKey = (typeof payload.key === "string" && payload.key.trim())
    ? slugify(payload.key) : slugify(payload.name as string);
  let key = baseKey;
  let n = 1;
  while (true) {
    const existing = await db.customPlatformRole.findUnique({ where: { key }, select: { id: true } });
    if (!existing) break;
    n += 1;
    key = `${baseKey}-${n}`;
    if (n > 50) return { ok: false, error: "Couldn't allocate a unique key" } as const;
  }

  const description = typeof payload.description === "string" ? payload.description : null;
  const created = await db.customPlatformRole.create({
    data: {
      name: (payload.name as string).trim(),
      key,
      description,
      permissions: filtered,
      status: "DRAFT",
      createdById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_imported",
    entityType: "CustomPlatformRole",
    entityId: created.id,
    metadata: { actor: ctx.email, name: payload.name, permsCount: filtered.length, droppedCount: (payload.permissions as unknown[]).length - filtered.length },
  });
  revalidatePath("/platform/access/roles");
  return { ok: true, id: created.id } as const;
}

/* ── Save a custom role's permissions (matrix UI) ───────── */

const updatePermsSchema = z.object({
  roleId: z.string().min(1),
  /** CSV of permission keys. */
  permissions: z.string(),
  description: z.string().max(500).optional(),
});

export async function updateRolePermissions(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't edit roles" } as const;
  }
  const parsed = updatePermsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const perms = parsed.data.permissions.split(",")
    .map((s) => s.trim())
    .filter((p): p is PlatformPermission => VALID_PERMS.has(p as PlatformPermission));

  const role = await db.customPlatformRole.findUnique({
    where: { id: parsed.data.roleId },
    select: { id: true, status: true, permissions: true },
  });
  if (!role) return { ok: false, error: "Role not found" } as const;

  await db.customPlatformRole.update({
    where: { id: role.id },
    data: {
      permissions: perms,
      description: parsed.data.description?.trim() || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_permissions_updated",
    entityType: "CustomPlatformRole",
    entityId: role.id,
    metadata: {
      actor: ctx.email,
      added: perms.filter((p) => !(role.permissions as string[]).includes(p)),
      removed: (role.permissions as string[]).filter((p) => !perms.includes(p as PlatformPermission)),
    },
  });
  revalidatePath("/platform/access/roles");
  revalidatePath(`/platform/access/roles/${role.id}`);
  return { ok: true } as const;
}

/* ── Promote DRAFT → ACTIVE (or back) ───────────────────── */

const setStatusSchema = z.object({
  roleId: z.string().min(1),
  status: z.union([z.literal("ACTIVE"), z.literal("DRAFT"), z.literal("ARCHIVED")]),
});

export async function setRoleStatus(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't edit roles" } as const;
  }
  const parsed = setStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  if (parsed.data.status === "ARCHIVED") {
    // Detach members on archive.
    await db.user.updateMany({
      where: { customPlatformRoleId: parsed.data.roleId },
      data: { customPlatformRoleId: null },
    });
  }
  await db.customPlatformRole.update({
    where: { id: parsed.data.roleId },
    data: { status: parsed.data.status },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.status === "ARCHIVED"
      ? "platform.role_archived"
      : parsed.data.status === "ACTIVE"
        ? "platform.role_activated"
        : "platform.role_drafted",
    entityType: "CustomPlatformRole",
    entityId: parsed.data.roleId,
    metadata: { actor: ctx.email, status: parsed.data.status },
  });
  revalidatePath("/platform/access/roles");
  revalidatePath(`/platform/access/roles/${parsed.data.roleId}`);
  return { ok: true } as const;
}

/* ── Delete custom role (only when unassigned + DRAFT/ARCHIVED) ── */

const deleteSchema = z.object({ roleId: z.string().min(1) });

export async function deleteCustomRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't delete roles" } as const;
  }
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const row = await db.customPlatformRole.findUnique({
    where: { id: parsed.data.roleId },
    select: { id: true, status: true, _count: { select: { members: true } } },
  });
  if (!row) return { ok: false, error: "Role not found" } as const;
  if (row.status === "ACTIVE" && row._count.members > 0) {
    return { ok: false, error: "Detach members or archive first" } as const;
  }
  await db.customPlatformRole.delete({ where: { id: row.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_deleted",
    entityType: "CustomPlatformRole",
    entityId: row.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/access/roles");
  return { ok: true } as const;
}

/* ── Update display name + description ──────────────────── */

const renameSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export async function renameRole(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't edit roles" } as const;
  }
  const parsed = renameSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.customPlatformRole.update({
    where: { id: parsed.data.roleId },
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_renamed",
    entityType: "CustomPlatformRole",
    entityId: parsed.data.roleId,
    metadata: { actor: ctx.email, name: parsed.data.name },
  });
  revalidatePath("/platform/access/roles");
  revalidatePath(`/platform/access/roles/${parsed.data.roleId}`);
  return { ok: true } as const;
}

/* ── Detach a single member from a custom role ──────────── */

const detachSchema = z.object({
  roleId: z.string().min(1),
  userId: z.string().min(1),
});

export async function detachRoleMember(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.assign_role")) {
    return { ok: false, error: "Your role can't detach members" } as const;
  }
  const parsed = detachSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  await db.user.update({
    where: { id: parsed.data.userId },
    data: { customPlatformRoleId: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_member_detached",
    entityType: "CustomPlatformRole",
    entityId: parsed.data.roleId,
    metadata: { actor: ctx.email, target: parsed.data.userId },
  });
  revalidatePath(`/platform/access/roles/${parsed.data.roleId}`);
  return { ok: true } as const;
}

/* ── Audit role assignments — produce a snapshot ────────── */

export async function snapshotRoleAssignments() {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("audit.read")) {
    return { ok: false, error: "Forbidden" } as const;
  }
  const users = await db.user.findMany({
    where: {
      OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }],
    },
    select: {
      id: true, email: true, name: true,
      platformRole: true,
      customPlatformRole: { select: { id: true, name: true, key: true } },
    },
    orderBy: { email: "asc" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.role_assignments_audited",
    entityType: "User",
    metadata: { actor: ctx.email, count: users.length },
  });
  return {
    ok: true as const,
    snapshotAt: new Date().toISOString(),
    rows: users.map((u) => ({
      userId: u.id,
      email: u.email,
      name: u.name,
      builtinRole: u.platformRole as PlatformRole | null,
      customRoleId: u.customPlatformRole?.id ?? null,
      customRoleName: u.customPlatformRole?.name ?? null,
      customRoleKey: u.customPlatformRole?.key ?? null,
    })),
  };
}
