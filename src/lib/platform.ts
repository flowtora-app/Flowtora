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
  customRoleCan,
  type PlatformPermission,
} from "@/lib/rbac";

export type PlatformContext = {
  userId: string;
  /** Effective role — accounts for any active temporary elevation. */
  role: PlatformRole;
  /** Durable role on the User row. Differs from `role` while elevated. */
  baseRole: PlatformRole;
  email: string;
  /** True iff the resolved permissions include any mutation permission. */
  canWrite: boolean;
  /** True iff the resolved permissions include `tenant.impersonate`. */
  canImpersonate: boolean;
  /** Fine-grained permission check. Prefer this over `canWrite`. */
  can: (perm: PlatformPermission) => boolean;
  /** Active (non-revoked, non-expired) elevations for this user. */
  activeElevations: { id: string; elevatedTo: PlatformRole; expiresAt: Date; reason: string }[];
  /** Custom platform role attached to this staff member, if any. When
   *  set, its permissions take precedence over the baseline role. */
  customRole: { id: string; name: string; key: string; permissions: string[] } | null;
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
  customRole: PlatformContext["customRole"],
): PlatformContext {
  const role = effectivePlatformRole(baseRole, activeElevations) ?? baseRole;
  // Custom role (when ACTIVE) wins over baseline. Elevations still
  // apply on top of the baseline for super-promotion scenarios — but
  // a custom role plus elevation collapses to "whichever grants the
  // permission grants it". `can` short-circuits on first match.
  const can = (perm: PlatformPermission) => {
    if (customRole && customRoleCan(customRole.permissions, perm)) return true;
    return platformCan(role, perm);
  };
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
    customRole,
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
  const [elevations, userRow] = await Promise.all([
    loadActiveElevations(session.user.id),
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        customPlatformRole: {
          select: { id: true, name: true, key: true, permissions: true, status: true },
        },
      },
    }),
  ]);
  // Only ACTIVE custom roles take effect. DRAFT roles let admins
  // stage permission changes without affecting users; ARCHIVED roles
  // shouldn't matter (User.customPlatformRoleId is nulled on archive)
  // but the status filter is a belt-and-suspenders check.
  const cr = userRow?.customPlatformRole;
  const customRole =
    cr && cr.status === "ACTIVE"
      ? { id: cr.id, name: cr.name, key: cr.key, permissions: cr.permissions }
      : null;
  return buildContext(
    session.user.platformRole,
    session.user.id,
    session.user.email ?? "",
    elevations,
    customRole,
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
    // Page 8 — when an active impersonation cookie is present, tag
    // the audit row + bump the session's lastActivityAt so the
    // History tab can render a coherent timeline and the
    // idle-timeout cron sees fresh activity.
    let impersonationSessionId: string | null = null;
    try {
      const { getActiveImpersonation } = await import("@/lib/impersonation");
      const active = await getActiveImpersonation(params.userId);
      if (active) {
        impersonationSessionId = active.id;
        // Best-effort — don't let an audit-row write fail because the
        // session-touch update raced with a force-end.
        await db.impersonationSession
          .update({
            where: { id: active.id },
            data: { lastActivityAt: new Date(), actionsCount: { increment: 1 } },
          })
          .catch(() => undefined);
      }
    } catch {
      // ignore — impersonation tagging is best-effort.
    }

    await db.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as never,
        impersonationSessionId,
      },
    });
  } catch {
    // swallowed on purpose
  }
}
