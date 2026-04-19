// Phase 17 — Platform Operations
//
// Guards and helpers used by /platform/** pages and actions. The tenant app
// uses `requireTenant` / `requirePermission` from lib/tenant; this file is
// the equivalent for SaaS-platform-staff routes (Flowtora employees, not
// shop employees).
//
// Platform role hierarchy (see PlatformRole enum):
//   SUPER_ADMIN  — full control, incl. destructive billing & feature flags
//   SITE_MANAGER — day-to-day operational admin, can suspend / reactivate
//   SUPPORT_AGENT — read-first; can read and leave notes, cannot mutate state
//
// Write-intent actions call `requirePlatformAdmin` (SUPER_ADMIN or
// SITE_MANAGER). Read-only pages call `requirePlatformStaff`.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { PlatformRole } from "@prisma/client";

export type PlatformContext = {
  userId: string;
  role: PlatformRole;
  email: string;
  canWrite: boolean;   // SUPER_ADMIN or SITE_MANAGER
  canImpersonate: boolean; // SUPER_ADMIN or SITE_MANAGER (Slice B enforces stricter)
};

function staffContext(role: PlatformRole, userId: string, email: string): PlatformContext {
  const canWrite = role === "SUPER_ADMIN" || role === "SITE_MANAGER";
  return {
    userId,
    role,
    email,
    canWrite,
    canImpersonate: canWrite,
  };
}

/**
 * Gate any /platform read route. Redirects non-staff away. Returns the
 * platform context including a convenience `canWrite` flag so the caller
 * can render action affordances conditionally.
 */
export async function requirePlatformStaff(): Promise<PlatformContext> {
  const session = await auth();
  if (!session?.user?.id || !session.user.platformRole) {
    redirect("/login");
  }
  return staffContext(
    session.user.platformRole,
    session.user.id,
    session.user.email ?? "",
  );
}

/**
 * Gate any /platform mutation. Rejects SUPPORT_AGENT. Use this in the
 * action file, not in the page — support staff should still see the page,
 * they just get a disabled button.
 */
export async function requirePlatformAdmin(): Promise<PlatformContext> {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
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
