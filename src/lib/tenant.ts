import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { hasPermission, type Permission } from "@/lib/rbac";
import type { Tenant, Membership, TenantRole } from "@prisma/client";

export type TenantContext = {
  tenant: Tenant;
  membership: Membership;
  role: TenantRole;
  userId: string;
  can: (perm: Permission) => boolean;
  /**
   * Phase 15 — branch scope.
   *
   * `null` means "no restriction" (member can see every branch). Returned when:
   *   • the membership has an empty locationIds array (single-location shops
   *     and owners/admins), or
   *   • the caller has the `locations:cross_view` permission (regional
   *     managers, accounting, etc.).
   *
   * Otherwise: the explicit list of location ids the member is scoped to.
   * Use {@link branchWhere} to fold this into a Prisma where clause.
   */
  branchScope: string[] | null;
  /**
   * Hard guard for detail pages — call after loading a row that has a
   * `locationId`. Throws notFound() if the row is in a branch the caller
   * isn't allowed to see. Treats null/undefined locationId as "legacy" and
   * lets it through (matches the relaxed list-page filter).
   */
  assertBranchAccess: (rowLocationId: string | null | undefined) => void;
};

/**
 * Resolves the tenant for the current request from the URL slug,
 * verifies the signed-in user has an active membership, and returns
 * a context object every server component / action should use.
 *
 * Throws via redirect/notFound — never returns null. This is intentional:
 * forgetting a tenant check should fail loud, not silent.
 */
export async function requireTenant(slug: string): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=/t/${slug}`);

  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) notFound();

  // Phase 1 — ARCHIVED acts like SUSPENDED for regular sign-in. Platform
  // staff can still reach the workspace (synthetic membership path below)
  // to verify data before permanent deletion.
  const blockedStatus =
    tenant.status === "SUSPENDED" ||
    tenant.status === "CANCELED" ||
    tenant.status === "ARCHIVED";
  if (blockedStatus && !session.user.platformRole) {
    redirect("/account-suspended");
  }

  const membership = await db.membership.findUnique({
    where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
  });

  // Platform staff can view any tenant; mint a synthetic ADMIN-equivalent membership.
  if (!membership) {
    if (session.user.platformRole) {
      const synthetic: Membership = {
        id: `platform:${session.user.id}`,
        userId: session.user.id,
        tenantId: tenant.id,
        role: "ADMIN",
        status: "ACTIVE",
        locationIds: [],
        welcomeSeenAt: new Date(), // platform staff bypass the first-run welcome
        notifPrefs:   null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return {
        tenant,
        membership: synthetic,
        role: synthetic.role,
        userId: session.user.id,
        can: (perm) => hasPermission(synthetic.role, perm),
        branchScope: null, // platform staff see every branch
        assertBranchAccess: () => {},
      };
    }
    notFound();
  }

  if (membership.status === "SUSPENDED") redirect("/account-suspended");

  const can = (perm: Permission) => hasPermission(membership.role, perm);
  // Empty locationIds = "all branches" (owners, admins, single-location shops).
  // cross_view permission bypasses any explicit restriction (e.g. regional
  // manager assigned a home branch but allowed to peek elsewhere).
  const branchScope =
    membership.locationIds.length === 0 || can("locations:cross_view")
      ? null
      : membership.locationIds;

  return {
    tenant,
    membership,
    role: membership.role,
    userId: session.user.id,
    can,
    branchScope,
    assertBranchAccess: (rowLocationId) => {
      if (!branchScope) return;
      // Legacy rows without a locationId are visible to everyone — same
      // softening as branchWhere/applyBranchScope.
      if (!rowLocationId) return;
      if (!branchScope.includes(rowLocationId)) notFound();
    },
  };
}

export async function requirePermission(slug: string, perm: Permission) {
  const ctx = await requireTenant(slug);
  if (!ctx.can(perm)) redirect(`/t/${slug}/dashboard?error=forbidden`);
  return ctx;
}
