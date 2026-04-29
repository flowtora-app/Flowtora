// Phase 17 — Platform Operations  (extended in Phase 1 with fine-grained RBAC)
//
// Guards and helpers used by /platform/** pages and actions. The tenant app
// uses `requireTenant` / `requirePermission` from lib/tenant; this file is
// the equivalent for SaaS-platform-staff routes (Flowtora employees, not
// shop employees).
//
// Phase 1 expanded the role enum from 3 to 12 values and introduced a
// permission map (see `PLATFORM_ROLE_PERMISSIONS` in lib/rbac). Existing
// call sites still work — `canWrite` is preserved as "has at least one
// mutation permission" — and new code should use `ctx.can("tenant.suspend")`
// or `requirePlatformPermission("tenant.suspend")` for fine-grained gates.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { PlatformRole } from "@prisma/client";
import {
  effectivePlatformRole,
  platformCan,
  type PlatformPermission,
} from "@/lib/rbac";

export type PlatformContext = {
  userId: string;
  /** Effective role — accounts for any active temporary elevation. */
  role: PlatformRole;
  /** Durable role on the User row. Differs from `role` while elevated. */
  baseRole: PlatformRole;
  email: string;
  /** True iff `role` has any mutation permission. Coarse-grained legacy flag. */
  canWrite: boolean;
  /** True iff `role` has the `tenant.impersonate` permission. */
  canImpersonate: boolean;
  /** Fine-grained permission check. Prefer this over `canWrite`. */
  can: (perm: PlatformPermission) => boolean;
  /** Active (non-revoked, non-expired) elevations for this user. */
  activeElevations: { id: string; elevatedTo: PlatformRole; expiresAt: Date; reason: string }[];
};

// Permissions whose presence implies "this role can mutate at least
// something on the platform." Used to derive the legacy `canWrite` flag.
const MUTATION_PERMS: PlatformPermission[] = [
  "tenant.suspend", "tenant.archive", "tenant.tag",
  "billing.invoice", "billing.refund", "billing.plan_change",
  "staff.assign_role", "staff.elevate",
  "support.respond", "feature_flag.write",
  "announcement.write", "leads.manage",
  "system.write_settings", "notifications.manage",
];

async function loadActiveElevations(userId: string) {
  return db.platformRoleElevation.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, elevatedTo: true, expiresAt: true, reason: true },
    orderBy: { expiresAt: "asc" },
  });
}

function buildContext(
  baseRole: PlatformRole,
  userId: string,
  email: string,
  activeElevations: { id: string; elevatedTo: PlatformRole; expiresAt: Date; reason: string }[],
): PlatformContext {
  const role = effectivePlatformRole(baseRole, activeElevations) ?? baseRole;
  const can = (perm: PlatformPermission) => platformCan(role, perm);
  const canWrite = MUTATION_PERMS.some(can);
  return {
    userId,
    role,
    baseRole,
    email,
    canWrite,
    canImpersonate: can("tenant.impersonate"),
    can,
    activeElevations,
  };
}

/**
 * Gate any /platform read route. Redirects non-staff away. Returns the
 * platform context including a `can(perm)` helper so the caller can
 * render action affordances conditionally.
 */
export async function requirePlatformStaff(): Promise<PlatformContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.platformRole) {
    redirect("/login");
  }
  const elevations = await loadActiveElevations(session.user.id);
  return buildContext(
    session.user.platformRole,
    session.user.id,
    session.user.email ?? "",
    elevations,
  );
}

/**
 * Gate any /platform mutation. Backward-compatible — still rejects
 * roles with no mutation permissions. New code that needs a finer
 * check should use `requirePlatformPermission(perm)` instead.
 */
export async function requirePlatformAdmin(): Promise<PlatformContext> {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect("/platform?error=forbidden");
  }
  return ctx;
}

/**
 * Gate a /platform action behind a specific permission. Use this for
 * surgical checks — e.g. only `staff.assign_role` can rotate roles,
 * not "anyone with canWrite=true".
 */
export async function requirePlatformPermission(
  perm: PlatformPermission,
): Promise<PlatformContext> {
  const ctx = await requirePlatformStaff();
  if (!ctx.can(perm)) {
    redirect("/platform?error=forbidden");
  }
  return ctx;
}

/**
 * Write a platform-level audit entry. `tenantId` is optional — cross-tenant
 * actions (tenant search, impersonation, feature flag flips) write with
 * tenantId=null, which is why AuditLog.tenantId is nullable.
 *
 * Never throws — audit failures cannot kill a user request path, same
 * contract as logAudit in lib/audit.ts.
 */
export async function logPlatformAudit(params: {
  userId: string;
  action: string;        // e.g. "platform.tenant_suspended"
  tenantId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as never,
      },
    });
  } catch {
    // swallowed on purpose
  }
}
