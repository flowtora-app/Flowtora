import { db } from "@/lib/db";

// Phase 15 Slice A — multi-location helpers.
//
// A tenant has one or more `Location` rows (branches). Every customer-facing
// entity (customer, quote, order, invoice, install) optionally carries a
// `locationId`. We auto-create a "Main" location for every tenant so code
// written before Phase 15 keeps working without caring about branches.

const DEFAULT_NAME = "Main";

export type LocationRow = {
  id: string;
  name: string;
  code: string | null;
  isDefault: boolean;
  active: boolean;
};

// Cache-free lookup — called from server components / actions, always fresh.
export async function listActiveLocations(tenantId: string): Promise<LocationRow[]> {
  return db.location.findMany({
    where: { tenantId, active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, isDefault: true, active: true },
  });
}

// Used by the settings page — includes inactive rows so admins can revive them.
export async function listAllLocations(tenantId: string): Promise<LocationRow[]> {
  return db.location.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, isDefault: true, active: true },
  });
}

// Find (or create) the tenant's default location. This is the seed for new
// tenants plus a safety net for any code path that needs a home location for
// a just-created row. Idempotent: concurrent callers all settle on the same
// "isDefault = true" row via the unique (tenantId, name) constraint on "Main".
export async function ensureDefaultLocation(tenantId: string): Promise<LocationRow> {
  // Fast path — the common case after the first request.
  const existing = await db.location.findFirst({
    where: { tenantId, isDefault: true },
    select: { id: true, name: true, code: true, isDefault: true, active: true },
  });
  if (existing) return existing;

  try {
    const created = await db.location.create({
      data: { tenantId, name: DEFAULT_NAME, isDefault: true },
      select: { id: true, name: true, code: true, isDefault: true, active: true },
    });
    return created;
  } catch {
    // Someone raced us; re-read and return whatever landed first.
    const after = await db.location.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true, name: true, code: true, isDefault: true, active: true },
    });
    if (after) return after;
    // Final fallback — grab any location so the caller gets an id.
    const any = await db.location.findFirst({
      where: { tenantId },
      select: { id: true, name: true, code: true, isDefault: true, active: true },
    });
    if (any) return any;
    throw new Error("Could not ensure a default location for tenant");
  }
}

// Build a quick id → name map for header chips on detail pages.
export async function locationLookup(tenantId: string): Promise<Map<string, LocationRow>> {
  const rows = await listAllLocations(tenantId);
  return new Map(rows.map((r) => [r.id, r] as const));
}

// Validate that a given locationId belongs to the tenant — used by every
// action that accepts a locationId from form input. Returns null if the id
// is empty / unknown; the caller decides whether to reject or just treat it
// as "unassigned".
export async function resolveTenantLocationId(
  tenantId: string,
  rawId: string | null | undefined,
): Promise<string | null> {
  if (!rawId) return null;
  const loc = await db.location.findFirst({
    where: { id: rawId, tenantId },
    select: { id: true },
  });
  return loc?.id ?? null;
}

export function locationLabel(row: LocationRow | null | undefined): string {
  if (!row) return "—";
  return row.code ? `${row.name} (${row.code})` : row.name;
}

// ────────────────────────────────────────────────────────────
// Branch-scope helpers (Phase 15 Slice B)
// ────────────────────────────────────────────────────────────

// Match any row whose locationId is in the allowed scope OR is null.
// Legacy rows (created before Phase 15) have no locationId yet, so we keep
// them visible — the default-location backfill assigns them lazily.
function branchFragment(scope: string[]): Record<string, unknown> {
  return { OR: [{ locationId: { in: scope } }, { locationId: null }] };
}

type WhereWithAnd = { AND?: unknown };

/**
 * Compose a member's branch scope into an existing Prisma `where` clause.
 *
 * - `scope` `null` or `[]` → no restriction, where returned unchanged.
 * - Otherwise the constraint is added under AND, so it stacks safely with any
 *   pre-existing `OR` (eg search filters) without clobbering.
 *
 * Works for any model that exposes `locationId` directly. Use the relation
 * variant {@link applyBranchScopeOn} when the location lives behind a
 * relation (e.g. orderItem.order.locationId).
 */
export function applyBranchScope<T extends WhereWithAnd>(
  where: T,
  scope: string[] | null | undefined,
): T {
  if (!scope || scope.length === 0) return where;
  const fragment = branchFragment(scope);
  const existing = where.AND
    ? Array.isArray(where.AND) ? where.AND : [where.AND]
    : [];
  return { ...where, AND: [...existing, fragment] } as T;
}

/**
 * Same as {@link applyBranchScope} but for queries that reach `locationId`
 * through a single relation hop (e.g. `OrderItem` → `order`).
 *   applyBranchScopeOn(where, "order", scope)
 */
export function applyBranchScopeOn<T extends WhereWithAnd>(
  where: T,
  relation: string,
  scope: string[] | null | undefined,
): T {
  if (!scope || scope.length === 0) return where;
  const fragment = {
    OR: [
      { [relation]: { locationId: { in: scope } } },
      { [relation]: { locationId: null } },
    ],
  };
  const existing = where.AND
    ? Array.isArray(where.AND) ? where.AND : [where.AND]
    : [];
  return { ...where, AND: [...existing, fragment] } as T;
}

/** True when the caller is allowed to operate on a specific row. */
export function branchAllows(
  scope: string[] | null | undefined,
  rowLocationId: string | null | undefined,
): boolean {
  if (!scope || scope.length === 0) return true;
  if (!rowLocationId) return true; // legacy unassigned rows visible to all
  return scope.includes(rowLocationId);
}
