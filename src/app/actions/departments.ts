"use server";

// Phase 12 — departments and work stations.
//
// Departments are the big axis of the production board: every stage is
// typed by department, every technician has a "home department", and
// the board's swimlanes are per-department. Work stations are the
// machines within a department ("Roland VG-640", "Mimaki UJF-6042").
// A small shop might have one bench per department and skip the work
// station concept entirely; a bigger shop with three CNC routers
// NEEDS to distinguish them on the schedule. Both are tenant-scoped.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import {
  DEPARTMENT_COLOR_PALETTE,
  seedDepartmentsFor,
} from "@/lib/production";

const optionalString = z.string().max(200).optional().or(z.literal(""));
const optionalLong   = z.string().max(4000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

function revalidateSettingsSurfaces(slug: string) {
  revalidatePath(`/t/${slug}/settings/production`);
  revalidatePath(`/t/${slug}/production`);
}

// Ensure the slug we derive from the name doesn't collide. Appends
// -2, -3, … until free. Runs a lightweight "name in list" check —
// acceptable because the dept count per tenant is small (< 50 in
// anyone's worst case).
async function uniqueDeptSlug(tenantId: string, base: string, excludeId?: string): Promise<string> {
  const existing = await db.department.findMany({
    where:  { tenantId },
    select: { id: true, slug: true },
  });
  const taken = new Set(existing.filter((d) => d.id !== excludeId).map((d) => d.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

async function uniqueStationSlug(tenantId: string, base: string, excludeId?: string): Promise<string> {
  const existing = await db.workStation.findMany({
    where:  { tenantId },
    select: { id: true, slug: true },
  });
  const taken = new Set(existing.filter((w) => w.id !== excludeId).map((w) => w.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

// ────────────────────────────────────────────────────────────
// Departments
// ────────────────────────────────────────────────────────────

const createDeptSchema = z.object({
  name:  z.string().min(1).max(100),
  color: optionalString,
  icon:  optionalString,
});

export async function createDepartment(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const parsed = createDeptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/production?error=${encodeURIComponent("Department name is required.")}`);
  }
  const d = parsed.data;

  const base = slugify(d.name) || "dept";
  const deptSlug = await uniqueDeptSlug(ctx.tenant.id, base);

  // How many exist already — used to auto-pick a color and to set sort
  // order so new depts land at the end.
  const count = await db.department.count({ where: { tenantId: ctx.tenant.id } });
  const color = empty(d.color) ?? DEPARTMENT_COLOR_PALETTE[count % DEPARTMENT_COLOR_PALETTE.length];

  const dept = await db.department.create({
    data: {
      tenantId:  ctx.tenant.id,
      name:      d.name,
      slug:      deptSlug,
      color,
      icon:      empty(d.icon),
      sortOrder: (count + 1) * 10,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "department.created",
    entityType: "Department",
    entityId:   dept.id,
    metadata:   { name: dept.name },
  });

  revalidateSettingsSurfaces(slug);
}

const updateDeptSchema = z.object({
  name:      z.string().min(1).max(100),
  color:     optionalString,
  icon:      optionalString,
  active:    z.string().optional(), // checkbox
  sortOrder: z.string().optional(),
});

export async function updateDepartment(slug: string, deptId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const existing = await db.department.findFirst({
    where:  { id: deptId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) return;

  const parsed = updateDeptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  // Only re-slug when the name changed — preserves URL stability.
  const nextSlug =
    d.name !== existing.name
      ? await uniqueDeptSlug(ctx.tenant.id, slugify(d.name) || "dept", existing.id)
      : existing.slug;

  const sortOrder = (() => {
    if (!d.sortOrder) return undefined;
    const n = Number(d.sortOrder);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  })();

  await db.department.update({
    where: { id: existing.id },
    data: {
      name:  d.name,
      slug:  nextSlug,
      color: empty(d.color) ?? "#6b7280",
      icon:  empty(d.icon),
      active: d.active === "on",
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "department.updated",
    entityType: "Department",
    entityId:   existing.id,
  });

  revalidateSettingsSurfaces(slug);
}

export async function deleteDepartment(slug: string, deptId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const dept = await db.department.findFirst({
    where:  { id: deptId, tenantId: ctx.tenant.id },
    select: {
      id: true, name: true,
      _count: { select: { stages: true, workStations: true } },
    },
  });
  if (!dept) return;

  // Deleting a department with stages would strand history. We soft-block
  // with a redirect in that case — the owner can archive instead.
  if (dept._count.stages > 0 || dept._count.workStations > 0) {
    redirect(`/t/${slug}/settings/production?error=${encodeURIComponent("Department is in use — deactivate it instead.")}`);
  }

  await db.department.delete({ where: { id: dept.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "department.deleted",
    entityType: "Department",
    entityId:   dept.id,
    metadata:   { name: dept.name },
  });

  revalidateSettingsSurfaces(slug);
}

// Idempotent seed. Only runs when the tenant has zero departments — we
// never silently re-apply defaults on top of an existing configuration.
// Surfaced as a one-click button on the settings page when the list is
// empty.
export async function seedDefaultDepartments(slug: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const tenant = await db.tenant.findFirst({
    where:  { id: ctx.tenant.id },
    select: { id: true, businessType: true },
  });
  if (!tenant) return;

  const count = await db.department.count({ where: { tenantId: ctx.tenant.id } });
  if (count > 0) return;

  const seeds = seedDepartmentsFor(tenant.businessType);
  await db.$transaction(
    seeds.map((s, i) => {
      const base = slugify(s.name) || `dept-${i + 1}`;
      return db.department.create({
        data: {
          tenantId:  ctx.tenant.id,
          name:      s.name,
          slug:      base,
          color:     s.color,
          icon:      s.icon,
          sortOrder: (i + 1) * 10,
        },
      });
    }),
  );

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "departments.seeded",
    entityType: "Tenant",
    entityId:   ctx.tenant.id,
    metadata:   { count: seeds.length, businessType: tenant.businessType },
  });

  revalidateSettingsSurfaces(slug);
}

// ────────────────────────────────────────────────────────────
// Work stations
// ────────────────────────────────────────────────────────────

const createStationSchema = z.object({
  departmentId: z.string().min(1),
  name:         z.string().min(1).max(100),
  notes:        optionalLong,
});

export async function createWorkStation(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const parsed = createStationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/production?error=${encodeURIComponent("Work station name and department are required.")}`);
  }
  const d = parsed.data;

  // Check dept belongs to tenant.
  const dept = await db.department.findFirst({
    where:  { id: d.departmentId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!dept) {
    redirect(`/t/${slug}/settings/production?error=${encodeURIComponent("Department not found.")}`);
  }

  const base = slugify(d.name) || "station";
  const stationSlug = await uniqueStationSlug(ctx.tenant.id, base);

  const station = await db.workStation.create({
    data: {
      tenantId:     ctx.tenant.id,
      departmentId: dept.id,
      name:         d.name,
      slug:         stationSlug,
      notes:        empty(d.notes),
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "workstation.created",
    entityType: "WorkStation",
    entityId:   station.id,
    metadata:   { name: station.name, departmentId: dept.id },
  });

  revalidateSettingsSurfaces(slug);
}

const updateStationSchema = z.object({
  departmentId: z.string().min(1),
  name:         z.string().min(1).max(100),
  notes:        optionalLong,
  active:       z.string().optional(),
});

export async function updateWorkStation(slug: string, stationId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "production:manage");
  const existing = await db.workStation.findFirst({
    where:  { id: stationId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, slug: true },
  });
  if (!existing) return;

  const parsed = updateStationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const d = parsed.data;

  // Dept is optional to change; if provided must belong to tenant.
  const dept = await db.department.findFirst({
    where:  { id: d.departmentId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!dept) return;

  const nextSlug =
    d.name !== existing.name
      ? await uniqueStationSlug(ctx.tenant.id, slugify(d.name) || "station", existing.id)
      : existing.slug;

  await db.workStation.update({
    where: { id: existing.id },
    data: {
      departmentId: dept.id,
      name:         d.name,
      slug:         nextSlug,
      notes:        empty(d.notes),
      active:       d.active === "on",
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "workstation.updated",
    entityType: "WorkStation",
    entityId:   existing.id,
  });

  revalidateSettingsSurfaces(slug);
}

export async function deleteWorkStation(slug: string, stationId: string) {
  const ctx = await requirePermission(slug, "production:manage");
  const station = await db.workStation.findFirst({
    where:  { id: stationId, tenantId: ctx.tenant.id },
    select: {
      id: true, name: true,
      _count: { select: { stages: true } },
    },
  });
  if (!station) return;

  if (station._count.stages > 0) {
    redirect(`/t/${slug}/settings/production?error=${encodeURIComponent("Work station is in use — deactivate it instead.")}`);
  }

  await db.workStation.delete({ where: { id: station.id } });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "workstation.deleted",
    entityType: "WorkStation",
    entityId:   station.id,
    metadata:   { name: station.name },
  });

  revalidateSettingsSurfaces(slug);
}
