"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Phase E Slice 2 — saved views.
//
// A saved view is a user- or tenant-scoped named snapshot of the
// filter/sort querystring on a list page. The picker shows the
// current user's private views and the tenant's shared views for the
// same `entityKind`, rewritten as `/t/<slug>/<entity>?<filters>`.
//
// We persist only the raw querystring (capped) rather than a parsed
// schema — filter surfaces differ per page and evolve, and the picker
// is meant to round-trip "take me back to how the list looked" rather
// than enforce structure.

const ENTITY_KINDS = [
  "customers",
  "quotes",
  "orders",
  "invoices",
  "leads",
  "tasks",
  "products",
  "vendors",
  "expenses",
] as const;
export type SavedViewKind = (typeof ENTITY_KINDS)[number];

const MAX_NAME_LEN = 80;
const MAX_FILTERS_LEN = 800;
const MAX_VIEWS_PER_USER_KIND = 24;

const createSchema = z.object({
  entityKind: z.enum(ENTITY_KINDS),
  name: z.string().min(1).max(MAX_NAME_LEN),
  filters: z.string().max(MAX_FILTERS_LEN),
  isShared: z
    .union([z.literal("on"), z.literal("true"), z.literal("1")])
    .optional()
    .transform((v) => Boolean(v)),
});

export type SavedViewRow = {
  id: string;
  name: string;
  filters: string;
  isShared: boolean;
  ownedByMe: boolean;
};

export async function listSavedViews(
  slug: string,
  entityKind: SavedViewKind,
): Promise<SavedViewRow[]> {
  const ctx = await requireTenant(slug);
  const rows = await db.savedView.findMany({
    where: {
      tenantId: ctx.tenant.id,
      entityKind,
      OR: [{ userId: ctx.userId }, { isShared: true }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      filters: true,
      isShared: true,
      userId: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    filters: r.filters,
    isShared: r.isShared,
    ownedByMe: r.userId === ctx.userId,
  }));
}

export async function createSavedView(slug: string, formData: FormData) {
  const ctx = await requireTenant(slug);
  const parsed = createSchema.safeParse({
    entityKind: formData.get("entityKind"),
    name: formData.get("name"),
    filters: formData.get("filters") ?? "",
    isShared: formData.get("isShared") ?? undefined,
  });
  if (!parsed.success) return;

  // Strip a leading "?" if the client passed location.search verbatim.
  const filters = parsed.data.filters.replace(/^\?/, "");

  // Shared views require manage-level privilege on the entity kind.
  // We don't have a single permission for "edit shared views", so we
  // gate on a safe superset: only tenant OWNER/ADMIN roles can create
  // shared views. Everyone can create private views.
  const isShared =
    parsed.data.isShared && (ctx.role === "OWNER" || ctx.role === "ADMIN");

  const count = await db.savedView.count({
    where: {
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      entityKind: parsed.data.entityKind,
    },
  });
  if (count >= MAX_VIEWS_PER_USER_KIND) return;

  await db.savedView.create({
    data: {
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      entityKind: parsed.data.entityKind,
      name: parsed.data.name.trim(),
      filters,
      isShared,
    },
  });

  revalidatePath(`/t/${slug}/${parsed.data.entityKind}`);
}

export async function deleteSavedView(
  slug: string,
  id: string,
) {
  const ctx = await requireTenant(slug);
  const view = await db.savedView.findUnique({
    where: { id },
    select: {
      tenantId: true,
      userId: true,
      entityKind: true,
      isShared: true,
    },
  });
  if (!view || view.tenantId !== ctx.tenant.id) return;

  // You can delete your own views, and owners/admins can delete shared
  // views created by others in their tenant.
  const canDelete =
    view.userId === ctx.userId ||
    (view.isShared && (ctx.role === "OWNER" || ctx.role === "ADMIN"));
  if (!canDelete) return;

  await db.savedView.delete({ where: { id } });
  revalidatePath(`/t/${slug}/${view.entityKind}`);
}
