import { db } from "@/lib/db";

export async function logAudit(params: {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata as never,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
    // Phase 17 Slice A — denormalize "this tenant did something" onto
    // Tenant.lastActivityAt so platform dashboards can render health-at-a-
    // glance ("dead 40d") without aggregating AuditLog per row. Best-effort,
    // same swallow-errors contract as the audit write itself. Skip for
    // platform-level events (tenantId is null) and for purely platform-
    // scoped actions (e.g. platform.tenant_suspended — those touch the
    // tenant but shouldn't count as the *tenant* being "active").
    if (params.tenantId && !params.action.startsWith("platform.")) {
      // Phase 1 — skip the lastActivityAt bump for archived tenants so a
      // restore cron or platform-staff impersonation doesn't make a
      // dormant archived tenant look "active" in the platform dashboard.
      await db.tenant.updateMany({
        where: { id: params.tenantId, status: { not: "ARCHIVED" } },
        data: { lastActivityAt: new Date() },
      });
    }
  } catch {
    // Audit failures must never break the request path.
  }
}
