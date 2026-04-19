import { db } from "@/lib/db";
import { hasPermission, type Permission } from "@/lib/rbac";
import { notifyMany } from "@/lib/notifications";

// Phase 22 — shared helpers for the approval request workflow.
//
// Approval gates today fire on quote sending, but the infra is entity-agnostic:
// `entityType` is a free string so future rules (refund over $N, write-off,
// deposit waiver) can reuse the same model + inbox without a migration.

export const APPROVER_PERMISSION: Permission = "quotes:approve_exceptions";

// Returns the userIds that can decide on approval requests for this tenant.
// Scoped to ACTIVE members with the approver permission, and always excludes
// the user who raised the request (you can't approve your own discount).
export async function listApprovers(
  tenantId: string,
  opts: { excludeUserId?: string } = {},
): Promise<string[]> {
  const members = await db.membership.findMany({
    where:  { tenantId, status: "ACTIVE" },
    select: { userId: true, role: true },
  });
  return members
    .filter((m) => hasPermission(m.role, APPROVER_PERMISSION))
    .map((m) => m.userId)
    .filter((id) => id !== opts.excludeUserId);
}

// Fan out an `approval.requested` notification to every approver. Caller
// provides the title/body/link — this file is entity-agnostic so the quote-
// specific copy lives in the quotes action.
export async function notifyApprovers(args: {
  tenantId:    string;
  requesterId: string;
  title:       string;
  body:        string;
  link:        string;
  entityType:  string;
  entityId:    string;
}): Promise<void> {
  const approvers = await listApprovers(args.tenantId, { excludeUserId: args.requesterId });
  if (approvers.length === 0) return;
  await notifyMany(approvers, {
    tenantId:   args.tenantId,
    type:       "approval.requested",
    title:      args.title,
    body:       args.body,
    link:       args.link,
    entityType: args.entityType,
    entityId:   args.entityId,
  });
}
