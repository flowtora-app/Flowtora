"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ChecklistKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { getGroupContext } from "@/lib/franchise";

const optionalLong = z.string().max(2000).optional().or(z.literal(""));
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// ────────────────────────────────────────────────────────────
// Templates — CRUD (tenant-settings level, gated by templates:manage)
// ────────────────────────────────────────────────────────────

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["ORDER", "INSTALL"]),
});

export async function createTemplate(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "templates:manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/templates?error=${encodeURIComponent("Invalid input")}`);
  }
  const t = await db.checklistTemplate.create({
    data: {
      tenantId: ctx.tenant.id,
      name: parsed.data.name,
      kind: parsed.data.kind,
    },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "template.created",
    entityType: "ChecklistTemplate",
    entityId: t.id,
  });
  revalidatePath(`/t/${slug}/settings/templates`);
  redirect(`/t/${slug}/settings/templates/${t.id}`);
}

const templateUpdateSchema = z.object({
  name: z.string().min(1).max(120),
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function updateTemplate(slug: string, templateId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "templates:manage");
  const existing = await db.checklistTemplate.findFirst({
    where: { id: templateId, tenantId: ctx.tenant.id },
  });
  if (!existing) redirect(`/t/${slug}/settings/templates`);

  const parsed = templateUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/templates/${templateId}?error=${encodeURIComponent("Invalid input")}`);
  }

  // Phase 15 Slice D — only group roots can flip `shared`. If the tenant
  // isn't a root we omit the field entirely (rather than zeroing it) so
  // a tenant that lost root status doesn't silently break inheritance.
  const sharedField = ctx.tenant.isGroupRoot
    ? { shared: formData.get("shared") === "on" || formData.get("shared") === "true" }
    : {};

  await db.checklistTemplate.update({
    where: { id: templateId },
    data: {
      name: parsed.data.name,
      active: parsed.data.active ?? false,
      ...sharedField,
    },
  });
  revalidatePath(`/t/${slug}/settings/templates`);
  revalidatePath(`/t/${slug}/settings/templates/${templateId}`);
}

export async function deleteTemplate(slug: string, templateId: string) {
  const ctx = await requirePermission(slug, "templates:manage");
  await db.checklistTemplate.deleteMany({
    where: { id: templateId, tenantId: ctx.tenant.id },
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "template.deleted",
    entityType: "ChecklistTemplate",
    entityId: templateId,
  });
  redirect(`/t/${slug}/settings/templates`);
}

// Template items

const templateItemSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: optionalLong,
});

export async function addTemplateItem(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "templates:manage");
  const parsed = templateItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;

  const t = await db.checklistTemplate.findFirst({
    where: { id: parsed.data.templateId, tenantId: ctx.tenant.id },
  });
  if (!t) return;

  const last = await db.checklistTemplateItem.findFirst({
    where: { templateId: t.id },
    orderBy: { sortOrder: "desc" },
  });

  await db.checklistTemplateItem.create({
    data: {
      templateId: t.id,
      title: parsed.data.title,
      description: empty(parsed.data.description),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath(`/t/${slug}/settings/templates/${t.id}`);
}

export async function deleteTemplateItem(slug: string, itemId: string) {
  const ctx = await requirePermission(slug, "templates:manage");
  const i = await db.checklistTemplateItem.findFirst({
    where: { id: itemId, template: { tenantId: ctx.tenant.id } },
  });
  if (!i) return;
  await db.checklistTemplateItem.delete({ where: { id: i.id } });
  revalidatePath(`/t/${slug}/settings/templates/${i.templateId}`);
}

// ────────────────────────────────────────────────────────────
// Apply template / manage checklist instance on Order or InstallEvent
// ────────────────────────────────────────────────────────────
//
// Items are SNAPSHOTTED — we copy the title/description onto ChecklistItem so
// later template edits don't retroactively change in-flight jobs.

// Resolves a template the caller is allowed to apply: either one this tenant
// owns directly, or one shared down from its parent group root. Items get
// snapshotted onto the job, so inherited application is safe — later parent
// edits don't reach back into in-flight checklists.
async function assertTemplateInTenant(tenantId: string, templateId: string, kind: ChecklistKind) {
  const groupCtx = await getGroupContext(tenantId);
  return db.checklistTemplate.findFirst({
    where: {
      id: templateId,
      kind,
      active: true,
      OR: [
        { tenantId },
        ...(groupCtx.parentTenantId
          ? [{ tenantId: groupCtx.parentTenantId, shared: true } as const]
          : []),
      ],
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function applyTemplateToOrder(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;

  const order = await db.order.findFirst({
    where: { id: orderId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!order) return;

  const tpl = await assertTemplateInTenant(ctx.tenant.id, templateId, "ORDER");
  if (!tpl) return;

  const last = await db.checklistItem.findFirst({
    where: { orderId: order.id },
    orderBy: { sortOrder: "desc" },
  });
  const startSort = (last?.sortOrder ?? 0) + 1;

  const rows: Prisma.ChecklistItemCreateManyInput[] = tpl.items.map((it, idx) => ({
    tenantId: ctx.tenant.id,
    orderId: order.id,
    installEventId: null,
    templateId: tpl.id,
    title: it.title,
    description: it.description,
    sortOrder: startSort + idx,
  }));

  if (rows.length > 0) {
    await db.checklistItem.createMany({ data: rows });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "checklist.applied",
    entityType: "Order",
    entityId: order.id,
    metadata: { templateId: tpl.id, items: rows.length },
  });

  revalidatePath(`/t/${slug}/orders/${order.id}`);
}

export async function applyTemplateToInstall(slug: string, installId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) return;

  const install = await db.installEvent.findFirst({
    where: { id: installId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!install) return;

  const tpl = await assertTemplateInTenant(ctx.tenant.id, templateId, "INSTALL");
  if (!tpl) return;

  const last = await db.checklistItem.findFirst({
    where: { installEventId: install.id },
    orderBy: { sortOrder: "desc" },
  });
  const startSort = (last?.sortOrder ?? 0) + 1;

  const rows: Prisma.ChecklistItemCreateManyInput[] = tpl.items.map((it, idx) => ({
    tenantId: ctx.tenant.id,
    orderId: null,
    installEventId: install.id,
    templateId: tpl.id,
    title: it.title,
    description: it.description,
    sortOrder: startSort + idx,
  }));

  if (rows.length > 0) {
    await db.checklistItem.createMany({ data: rows });
  }

  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "checklist.applied",
    entityType: "InstallEvent",
    entityId: install.id,
    metadata: { templateId: tpl.id, items: rows.length },
  });

  revalidatePath(`/t/${slug}/installs/${install.id}`);
}

// Ad-hoc item — no template, just a free-form line item added directly.
const adhocSchema = z.object({
  title: z.string().min(1).max(200),
  description: optionalLong,
});

export async function addAdhocOrderChecklistItem(slug: string, orderId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "orders:manage");
  const order = await db.order.findFirst({
    where: { id: orderId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!order) return;
  const parsed = adhocSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const last = await db.checklistItem.findFirst({
    where: { orderId: order.id },
    orderBy: { sortOrder: "desc" },
  });
  await db.checklistItem.create({
    data: {
      tenantId: ctx.tenant.id,
      orderId: order.id,
      title: parsed.data.title,
      description: empty(parsed.data.description),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath(`/t/${slug}/orders/${order.id}`);
}

export async function addAdhocInstallChecklistItem(slug: string, installId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "installs:manage");
  const install = await db.installEvent.findFirst({
    where: { id: installId, tenantId: ctx.tenant.id },
    select: { id: true },
  });
  if (!install) return;
  const parsed = adhocSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const last = await db.checklistItem.findFirst({
    where: { installEventId: install.id },
    orderBy: { sortOrder: "desc" },
  });
  await db.checklistItem.create({
    data: {
      tenantId: ctx.tenant.id,
      installEventId: install.id,
      title: parsed.data.title,
      description: empty(parsed.data.description),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath(`/t/${slug}/installs/${install.id}`);
}

// Toggle + delete instance items — permission check follows the parent.
export async function toggleChecklistItem(slug: string, itemId: string) {
  // We don't yet know which permission applies — look up the item first.
  const { ctx, item, redirectPath } = await resolveChecklistItemContext(slug, itemId);
  if (!ctx || !item) return;

  await db.checklistItem.update({
    where: { id: item.id },
    data: {
      completedAt: item.completedAt ? null : new Date(),
      completedBy: item.completedAt ? null : ctx.userId,
    },
  });

  revalidatePath(redirectPath);
}

export async function deleteChecklistItem(slug: string, itemId: string) {
  const { ctx, item, redirectPath } = await resolveChecklistItemContext(slug, itemId);
  if (!ctx || !item) return;
  await db.checklistItem.delete({ where: { id: item.id } });
  revalidatePath(redirectPath);
}

// Look up the item, confirm tenant ownership, and gate on the right permission
// based on which parent owns it. Returns enough info for the caller to finish.
async function resolveChecklistItemContext(slug: string, itemId: string) {
  // We fetch without a permission check first to discover the parent — the
  // permission depends on whether it's an order or install item. This is
  // acceptable because the tenant scope is enforced on the update itself.
  const bare = await db.checklistItem.findFirst({
    where: { id: itemId },
    select: { id: true, tenantId: true, orderId: true, installEventId: true, completedAt: true },
  });
  if (!bare) return { ctx: null, item: null, redirectPath: `/t/${slug}` };

  const perm = bare.orderId ? "orders:manage" as const : "installs:manage" as const;
  const ctx = await requirePermission(slug, perm);

  if (bare.tenantId !== ctx.tenant.id) {
    return { ctx: null, item: null, redirectPath: `/t/${slug}` };
  }

  const redirectPath = bare.orderId
    ? `/t/${slug}/orders/${bare.orderId}`
    : `/t/${slug}/installs/${bare.installEventId}`;

  return { ctx, item: bare, redirectPath };
}
