// Phase 15 Slice D — franchise / parent-tenant grouping.
//
// Tracksign already has two layers (Tenant ⊃ Location). Slice D adds an
// optional third layer: a "group root" tenant that shares pricing /
// checklist / message templates with N child tenants. The grouping is one
// level deep on purpose — flat queries, no recursive walks, predictable
// permission boundaries.
//
// Visibility rules
// ────────────────
// - A tenant always sees its own templates.
// - If the tenant has a `parentTenantId` AND that parent has `isGroupRoot`,
//   the tenant additionally sees the parent's templates that have
//   `shared = true`. Those rows are returned with `inherited: true` so the
//   UI can render a badge and disable Edit/Delete.
// - The parent itself sees all of its own templates (shared or not) without
//   the inherited flag — the parent IS the source of truth.
// - Children cannot mutate inherited rows (server actions reject).
//
// We intentionally do NOT clone shared templates into each child tenant.
// Sharing-by-reference means a parent edit is instantly live for every
// child, which is the whole point of centralized templates.

import { db } from "@/lib/db";

export type GroupContext = {
  /** This tenant's id. */
  tenantId: string;
  /** True iff this tenant is itself the franchisor / group root. */
  isGroupRoot: boolean;
  /**
   * The id of the group root this tenant inherits from. Always null on a
   * group root (a root cannot have a parent — single-level by design).
   * Null on a standalone tenant with no parent set.
   */
  parentTenantId: string | null;
  /** Display name of the parent — handy for "Inherited from {Name}" badges. */
  parentName: string | null;
  /**
   * Children of this tenant when it's a group root. Empty otherwise. Useful
   * for the franchisor's "Shared with N branches" copy.
   */
  childTenantIds: string[];
};

export async function getGroupContext(tenantId: string): Promise<GroupContext> {
  const me = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, isGroupRoot: true, parentTenantId: true },
  });
  if (!me) {
    // Defensive — caller already authenticated against this tenant, but if
    // somehow gone, return an empty context rather than throwing.
    return { tenantId, isGroupRoot: false, parentTenantId: null, parentName: null, childTenantIds: [] };
  }

  // Group roots intentionally don't inherit from their own parentTenantId
  // (it would create circular semantics). Only non-roots inherit.
  let parentName: string | null = null;
  let parentTenantId: string | null = null;
  if (!me.isGroupRoot && me.parentTenantId) {
    const parent = await db.tenant.findUnique({
      where: { id: me.parentTenantId },
      select: { id: true, name: true, isGroupRoot: true },
    });
    // The parent must explicitly be flagged as a group root for inheritance
    // to kick in. A stale parentTenantId pointing at a non-root acts as if
    // unset — fail closed rather than silently leaking templates.
    if (parent?.isGroupRoot) {
      parentTenantId = parent.id;
      parentName = parent.name;
    }
  }

  let childTenantIds: string[] = [];
  if (me.isGroupRoot) {
    const children = await db.tenant.findMany({
      where: { parentTenantId: me.id },
      select: { id: true },
    });
    childTenantIds = children.map((c) => c.id);
  }

  return {
    tenantId: me.id,
    isGroupRoot: me.isGroupRoot,
    parentTenantId,
    parentName,
    childTenantIds,
  };
}

// ────────────────────────────────────────────────────────────
// Merged-list helpers — return (own + inherited) rows, with `inherited`
// flagged so the UI can render badges and lock down editing.
// ────────────────────────────────────────────────────────────

type Inherited<T> = T & { inherited: boolean };

/**
 * Build the parent-side filter for a given group context. Returns null
 * when there's nothing to inherit, so the caller can short-circuit the
 * extra query.
 */
function inheritedFilter(group: GroupContext): { tenantId: string } | null {
  if (!group.parentTenantId) return null;
  return { tenantId: group.parentTenantId };
}

import type { Product, ChecklistTemplate, MessageTemplate, Prisma } from "@prisma/client";

export async function listMergedProducts(
  tenantId: string,
  ownWhere?: Prisma.ProductWhereInput,
): Promise<Inherited<Product>[]> {
  const group = await getGroupContext(tenantId);

  const own = await db.product.findMany({
    where: { ...(ownWhere ?? {}), tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const parent = inheritedFilter(group);
  if (!parent) return own.map((p) => ({ ...p, inherited: false }));

  const shared = await db.product.findMany({
    where: { ...parent, shared: true, active: true },
    orderBy: [{ name: "asc" }],
  });
  return [
    ...own.map((p) => ({ ...p, inherited: false })),
    ...shared.map((p) => ({ ...p, inherited: true })),
  ];
}

export async function listMergedChecklistTemplates(
  tenantId: string,
  ownWhere?: Prisma.ChecklistTemplateWhereInput,
): Promise<Inherited<ChecklistTemplate>[]> {
  const group = await getGroupContext(tenantId);

  const own = await db.checklistTemplate.findMany({
    where: { ...(ownWhere ?? {}), tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const parent = inheritedFilter(group);
  if (!parent) return own.map((t) => ({ ...t, inherited: false }));

  const shared = await db.checklistTemplate.findMany({
    where: { ...parent, shared: true, active: true },
    orderBy: [{ name: "asc" }],
  });
  return [
    ...own.map((t) => ({ ...t, inherited: false })),
    ...shared.map((t) => ({ ...t, inherited: true })),
  ];
}

export async function listMergedMessageTemplates(
  tenantId: string,
  ownWhere?: Prisma.MessageTemplateWhereInput,
): Promise<Inherited<MessageTemplate>[]> {
  const group = await getGroupContext(tenantId);

  const own = await db.messageTemplate.findMany({
    where: { ...(ownWhere ?? {}), tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const parent = inheritedFilter(group);
  if (!parent) return own.map((t) => ({ ...t, inherited: false }));

  const shared = await db.messageTemplate.findMany({
    where: { ...parent, shared: true, active: true },
    orderBy: [{ name: "asc" }],
  });
  return [
    ...own.map((t) => ({ ...t, inherited: false })),
    ...shared.map((t) => ({ ...t, inherited: true })),
  ];
}

// ────────────────────────────────────────────────────────────
// Mutation guard — call from any action that edits/deletes a template
// row to make sure a child tenant isn't trying to mutate a parent's row.
// ────────────────────────────────────────────────────────────

/**
 * Throws if the row doesn't belong to the current tenant. Use BEFORE the
 * mutation: even if our where clauses already include tenantId, calling
 * this gives us a uniform 404 instead of a silent zero-row update.
 *
 * Pass the row's `tenantId` (read it back first) and the current
 * ctx.tenant.id. Safe to call on rows that have no shared concept — it's
 * just a tenancy guard.
 */
export function assertOwnedByTenant(
  rowTenantId: string,
  currentTenantId: string,
): void {
  if (rowTenantId !== currentTenantId) {
    // Caller will translate to notFound() via Next's helper. Throwing keeps
    // the call site one-liner and doesn't import next/navigation here.
    throw new Error("INHERITED_TEMPLATE_READ_ONLY");
  }
}
