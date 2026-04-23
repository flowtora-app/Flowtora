// In-app notification helpers — the bell/inbox system.
//
// Separate from the transactional-email dispatcher in this same directory:
// in-app notifications are tenant-scoped DB rows shown in the header bell,
// whereas the dispatcher handles out-of-band delivery (email today,
// IN_APP/SMS/PUSH later). The two are conceptually distinct enough that
// they're kept in their own files but re-exported from one index so
// callers can import from "@/lib/notifications" regardless of which side
// they want.
//
// This file was previously `src/lib/notifications.ts`. Merged here when
// the transactional-email module graduated to its own directory (M1 of
// the notifications admin-management rollout).
import { db } from "@/lib/db";

// Notification types. Kept as a flat string union — easy to add new kinds
// without a migration. Convention: `<domain>.<event>`, mirroring audit actions.
export type NotificationType =
  | "portal.quote_approved"
  | "portal.quote_declined"
  // Phase 9 — public /q/[token] share-link approvals. Split from the portal
  // variants so staff can tell "signed-in portal customer" vs "anonymous
  // share-link click" apart in the inbox.
  | "share.quote_approved"
  | "share.quote_declined"
  | "portal.proof_approved"
  | "portal.proof_changes_requested"
  // Phase 15 — proof responses via /share/[token] (forwardable link,
  // not a portal-authenticated customer).
  | "share.proof_approved"
  | "share.proof_changes_requested"
  // Phase 15 Slice B — a customer attached a file from the portal.
  | "portal.file_uploaded"
  // Phase 16 — inbound message from a customer via the portal.
  | "portal.message_received"
  // Phase 11 — staff-side proof awareness. `proof.sent` fires for watchers
  // (PM, creator) whenever a proof is sent to the customer, so the team
  // sees the hand-off on their feed. `proof.locked` fires once the proof
  // is approved + locked so downstream production knows it's safe to cut.
  | "proof.sent"
  | "proof.locked"
  // Phase 12 — production workflow. Stage assignments mirror task
  // notifications but carry the order number + dept name in the title
  // so a technician can scan the inbox without opening each one.
  | "stage.assigned"
  | "stage.blocked"
  | "stage.ready"
  | "defect.reported"
  | "task.assigned"
  | "task.completed"
  | "install.assigned"
  | "install.updated"
  // Phase 13 — field-side escalation. `install.issue` fires on any reported
  // issue; `install.blocker` is a louder variant the inbox surfaces with
  // priority coloring. `install.issue_resolved` closes the loop for the
  // reporter.
  | "install.issue"
  | "install.blocker"
  | "install.issue_resolved"
  | "payment.recorded"
  // Phase 14 — financial operations events. Payment failures are surfaced
  // the same way payment.recorded is (invoice creator + customer owner);
  // refunds go to the invoice creator + order creator; write-offs go to
  // owners/admins; credit memos notify the customer owner.
  | "payment.failed"
  | "refund.issued"
  | "credit.issued"
  | "credit.applied"
  | "writeoff.recorded"
  | "expense.created"
  // Phase 13 — reminder kinds emitted by the /api/cron/reminders route.
  | "reminder.quote_overdue"
  | "reminder.quote_expiring"
  | "reminder.quote_stale"
  | "reminder.proof_stale"
  | "reminder.invoice_overdue"
  | "reminder.invoice_unsent"
  | "reminder.order_overdue"
  | "reminder.install_unconfirmed"
  | "reminder.task_overdue"
  // Phase 14 — communication center.
  | "comment.mention"
  // Phase 17 Slice D — support ticket replies.
  | "support.staff_replied"
  // Phase 22 — approval request workflow. `approval.requested` fans out to
  // every member holding quotes:approve_exceptions (owners/admins today);
  // the approved/rejected variants close the loop for the original requester.
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected";

// Icon + color hints for the inbox UI.
export const NOTIFICATION_META: Record<NotificationType, { label: string; color: string }> = {
  "portal.quote_approved":         { label: "Quote approved",    color: "#10b981" },
  "portal.quote_declined":         { label: "Quote declined",    color: "#ef4444" },
  "share.quote_approved":          { label: "Quote approved",    color: "#10b981" },
  "share.quote_declined":          { label: "Quote declined",    color: "#ef4444" },
  "portal.proof_approved":         { label: "Proof approved",    color: "#10b981" },
  "portal.proof_changes_requested":{ label: "Changes requested", color: "#f59e0b" },
  "share.proof_approved":          { label: "Proof approved",    color: "#10b981" },
  "share.proof_changes_requested": { label: "Changes requested", color: "#f59e0b" },
  "portal.file_uploaded":          { label: "File uploaded",     color: "#3b82f6" },
  "portal.message_received":       { label: "Customer message",  color: "#8b5cf6" },
  "proof.sent":                    { label: "Proof sent",        color: "#3b82f6" },
  "proof.locked":                  { label: "Proof locked",      color: "#10b981" },
  "stage.assigned":                { label: "Stage assigned",    color: "#3b82f6" },
  "stage.blocked":                 { label: "Stage blocked",     color: "#f59e0b" },
  "stage.ready":                   { label: "Stage ready",       color: "#10b981" },
  "defect.reported":               { label: "Defect reported",   color: "#ef4444" },
  "task.assigned":                 { label: "Task assigned",     color: "#3b82f6" },
  "task.completed":                { label: "Task completed",    color: "#10b981" },
  "install.assigned":              { label: "Install assigned",  color: "#8b5cf6" },
  "install.updated":               { label: "Install updated",   color: "#6b7280" },
  "install.issue":                 { label: "Install issue",     color: "#f59e0b" },
  "install.blocker":               { label: "Install blocker",   color: "#b91c1c" },
  "install.issue_resolved":        { label: "Install issue resolved", color: "#10b981" },
  "payment.recorded":              { label: "Payment received",  color: "#10b981" },
  "payment.failed":                { label: "Payment failed",    color: "#b91c1c" },
  "refund.issued":                 { label: "Refund issued",     color: "#f59e0b" },
  "credit.issued":                 { label: "Credit issued",     color: "#3b82f6" },
  "credit.applied":                { label: "Credit applied",    color: "#10b981" },
  "writeoff.recorded":             { label: "Invoice written off", color: "#7c3aed" },
  "expense.created":               { label: "Expense recorded",  color: "#6b7280" },
  "reminder.quote_overdue":        { label: "Quote overdue",       color: "#ef4444" },
  "reminder.quote_expiring":       { label: "Quote expiring",      color: "#f59e0b" },
  "reminder.quote_stale":          { label: "Quote unread",        color: "#f59e0b" },
  "reminder.proof_stale":          { label: "Proof awaiting",      color: "#f59e0b" },
  "reminder.invoice_overdue":      { label: "Invoice overdue",     color: "#ef4444" },
  "reminder.invoice_unsent":       { label: "Invoice unsent",      color: "#f59e0b" },
  "reminder.order_overdue":        { label: "Order past due",      color: "#ef4444" },
  "reminder.install_unconfirmed":  { label: "Install unconfirmed", color: "#f59e0b" },
  "reminder.task_overdue":         { label: "Task overdue",        color: "#ef4444" },
  "comment.mention":               { label: "You were mentioned",  color: "#3b82f6" },
  "support.staff_replied":         { label: "Support replied",     color: "#3b82f6" },
  "approval.requested":            { label: "Approval requested",  color: "#f59e0b" },
  "approval.approved":             { label: "Approval granted",    color: "#10b981" },
  "approval.rejected":             { label: "Approval rejected",   color: "#ef4444" },
};

export function notificationLabel(t: string): string {
  return (NOTIFICATION_META[t as NotificationType]?.label) ?? t;
}

export function notificationColor(t: string): string {
  return (NOTIFICATION_META[t as NotificationType]?.color) ?? "#6b7280";
}

type NotifyArgs = {
  tenantId:   string;
  userId:     string;
  type:       NotificationType;
  title:      string;
  body?:      string | null;
  entityType?: string;
  entityId?:   string;
  link?:       string;
};

/**
 * Create a single notification. Swallows errors — a failure to notify should
 * never break the request path (same philosophy as `logAudit`).
 *
 * Callers are expected to have already filtered out self-notifications and
 * inactive members; this function doesn't re-check.
 */
export async function notify(args: NotifyArgs): Promise<void> {
  try {
    await db.notification.create({
      data: {
        tenantId:   args.tenantId,
        userId:     args.userId,
        type:       args.type,
        title:      args.title,
        body:       args.body ?? null,
        entityType: args.entityType,
        entityId:   args.entityId,
        link:       args.link,
      },
    });
  } catch {
    // Intentionally swallow.
  }
}

/**
 * Bulk-notify. Dedupes recipient ids, drops falsy ids, and drops the
 * `excludeUserId` (typically the actor, so you don't notify yourself).
 */
export async function notifyMany(
  recipients: (string | null | undefined)[],
  base: Omit<NotifyArgs, "userId">,
  opts: { excludeUserId?: string } = {},
): Promise<void> {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of recipients) {
    if (!r) continue;
    if (opts.excludeUserId && r === opts.excludeUserId) continue;
    if (seen.has(r)) continue;
    seen.add(r);
    ids.push(r);
  }
  if (ids.length === 0) return;

  try {
    await db.notification.createMany({
      data: ids.map((userId) => ({
        tenantId:   base.tenantId,
        userId,
        type:       base.type,
        title:      base.title,
        body:       base.body ?? null,
        entityType: base.entityType,
        entityId:   base.entityId,
        link:       base.link,
      })),
    });
  } catch {
    // Intentionally swallow.
  }
}

/** Quick unread count for a given user. Safe on failure (returns 0). */
export async function unreadCount(tenantId: string, userId: string): Promise<number> {
  try {
    return await db.notification.count({
      where: { tenantId, userId, readAt: null },
    });
  } catch {
    return 0;
  }
}

/**
 * Phase 13 — reminder dedup.
 *
 * Notify a user, but only if we haven't already sent them the same
 * (type, entityId) notification within `suppressHours`. Used by the
 * reminder cron so we don't pile up a fresh "quote overdue" notification
 * every single day for the same stale quote.
 *
 * Returns true if a notification was created, false if suppressed.
 */
export async function notifyOnce(
  args: NotifyArgs,
  suppressHours: number,
): Promise<boolean> {
  try {
    if (!args.entityId) {
      // Without an entityId there's nothing to dedup on — fall back to notify.
      await notify(args);
      return true;
    }
    const cutoff = new Date(Date.now() - suppressHours * 3_600_000);
    const existing = await db.notification.findFirst({
      where: {
        tenantId: args.tenantId,
        userId:   args.userId,
        type:     args.type,
        entityId: args.entityId,
        createdAt: { gte: cutoff },
      },
      select: { id: true },
    });
    if (existing) return false;

    await notify(args);
    return true;
  } catch {
    return false;
  }
}
