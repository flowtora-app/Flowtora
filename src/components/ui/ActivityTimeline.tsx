import * as React from "react";
import { db } from "@/lib/db";

// ActivityTimeline — a reusable feed of AuditLog entries scoped to a
// single entity (by entityType + entityId). Drops into any detail page
// so an operator can see *what happened to this thing* without digging
// through the global audit log.
//
//   <ActivityTimeline tenantId={tenant.id} entityType="Customer" entityId={c.id} />
//
// Server component — it queries AuditLog + User directly and renders
// static HTML. No client JS. We cap at `limit` (default 40) to keep
// page render snappy; the full history lives at /platform/audit or a
// future /t/[slug]/activity route.

export interface ActivityTimelineProps {
  tenantId: string;
  entityType: string;
  entityId: string;
  limit?: number;
  /** Render without the outer card shell (for embedding inside tabs). */
  bare?: boolean;
}

type AuditRow = {
  id: string;
  action: string;
  createdAt: Date;
  metadata: unknown;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
};

export async function ActivityTimeline({
  tenantId,
  entityType,
  entityId,
  limit = 40,
  bare = false,
}: ActivityTimelineProps) {
  const logs = await db.auditLog.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
      userId: true,
    },
  });

  // AuditLog has no relation to User (so logs survive user deletion);
  // fetch actor names in a second query keyed by the userIds we saw.
  const userIds = Array.from(
    new Set(logs.map((l) => l.userId).filter((u): u is string => !!u)),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u] as const));

  const rows: AuditRow[] = logs.map((l) => {
    const u = l.userId ? userMap.get(l.userId) : null;
    return {
      id: l.id,
      action: l.action,
      createdAt: l.createdAt,
      metadata: l.metadata,
      userId: l.userId,
      userName: u?.name ?? null,
      userEmail: u?.email ?? null,
    };
  });

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    bare ? (
      <div>{children}</div>
    ) : (
      <div
        className="overflow-hidden rounded-lg"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {children}
      </div>
    );

  return (
    <Shell>
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Activity
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          {rows.length === 0
            ? "Nothing yet"
            : rows.length >= limit
            ? `Last ${limit}`
            : `${rows.length} ${rows.length === 1 ? "event" : "events"}`}
        </div>
      </div>
      {rows.length === 0 ? (
        <div
          className="px-4 py-6 text-center text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          Activity will appear here as the record changes.
        </div>
      ) : (
        <ol className="relative px-4 py-3">
          {rows.map((row, i) => (
            <TimelineRow
              key={row.id}
              row={row}
              isLast={i === rows.length - 1}
            />
          ))}
        </ol>
      )}
    </Shell>
  );
}

function TimelineRow({ row, isLast }: { row: AuditRow; isLast: boolean }) {
  const tone = actionTone(row.action);
  const label = actionLabel(row.action);
  const actor = row.userName ?? row.userEmail ?? "System";
  const metaSummary = summarizeMetadata(row.metadata);
  const color =
    tone === "danger"
      ? "var(--danger-fg)"
      : tone === "success"
      ? "var(--success-fg)"
      : tone === "warning"
      ? "var(--warning-fg)"
      : "var(--accent-primary)";
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* Spine line */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[5px] top-[14px] bottom-0"
          style={{ width: 1, background: "var(--border-subtle)" }}
        />
      )}
      {/* Dot */}
      <span
        aria-hidden
        className="mt-1 h-[11px] w-[11px] shrink-0 rounded-full"
        style={{
          background: "var(--surface-1)",
          border: `2px solid ${color}`,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-xs">
          <span className="font-medium" style={{ color: "var(--text-default)" }}>
            {actor}
          </span>
          <span style={{ color: "var(--text-muted)" }}>{label}</span>
          {metaSummary && (
            <span
              className="truncate"
              style={{ color: "var(--text-faint)" }}
              title={metaSummary}
            >
              — {metaSummary}
            </span>
          )}
        </div>
        <div
          className="mt-0.5 text-[11px]"
          style={{ color: "var(--text-faint)" }}
          title={row.createdAt.toISOString()}
        >
          {formatRelative(row.createdAt)}
        </div>
      </div>
    </li>
  );
}

// ── Labels ────────────────────────────────────────────────────────

// Map common action codes → human phrasing. Falls back to a generic
// "<verb> this" derived from the action string so new entities work
// without editing this map.
const ACTION_LABELS: Record<string, string> = {
  "customer.created":        "created this customer",
  "customer.updated":        "updated details",
  "customer.deleted":        "deleted this customer",
  "customer.stage_changed":  "changed the stage",
  "customer.tagged":         "added a tag",
  "customer.untagged":       "removed a tag",
  "quote.created":           "created a quote",
  "quote.updated":           "updated the quote",
  "quote.sent":              "sent the quote",
  "quote.accepted":          "accepted the quote",
  "quote.rejected":          "rejected the quote",
  "quote.superseded":        "superseded the quote",
  "order.created_from_quote":"created an order from a quote",
  "order.status_changed":    "changed order status",
  "order.priority_changed":  "changed priority",
  "order.blocker_added":     "flagged a blocker",
  "order.blocker_resolved":  "resolved the blocker",
  "order.deleted":           "deleted the order",
  "invoice.created":         "issued an invoice",
  "invoice.status_changed":  "updated the invoice",
  "invoice.partial_created": "created a partial invoice",
  "invoice.reminder_sent":   "sent a payment reminder",
  "invoice.deleted":         "deleted the invoice",
  "install.created":         "scheduled an install",
  "install.updated":         "updated the install",
  "install.status_changed":  "changed install status",
  "install.completed_with_evidence": "completed the install",
  "install.deleted":         "deleted the install",
  "approval.approved":       "approved",
  "approval.rejected":       "rejected",
  "approval.canceled":       "canceled the approval",
  "comment.created":         "left a comment",
  "comment.updated":         "edited a comment",
  "comment.deleted":         "deleted a comment",
  "file.created":            "uploaded a file",
  "file.archived":           "archived a file",
  "file.restored":           "restored a file",
  "file.deleted":            "deleted a file",
};

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const [, verb = ""] = action.split(".");
  const pretty = verb.replace(/_/g, " ");
  return pretty ? `performed ${pretty}` : action;
}

function actionTone(
  action: string,
): "neutral" | "success" | "warning" | "danger" {
  if (action.endsWith(".deleted") || action.endsWith(".rejected")) return "danger";
  if (
    action.endsWith(".created") ||
    action.endsWith(".approved") ||
    action === "customer.stage_changed" ||
    action === "install.completed_with_evidence"
  )
    return "success";
  if (action.endsWith(".blocker_added") || action.endsWith(".archived")) return "warning";
  return "neutral";
}

// ── Metadata renderer ─────────────────────────────────────────────

function summarizeMetadata(m: unknown): string | null {
  if (!m || typeof m !== "object") return null;
  const obj = m as Record<string, unknown>;
  // Stage change: "new lead → contacted"
  if (typeof obj.from === "string" && typeof obj.to === "string") {
    return `${pretty(obj.from)} → ${pretty(obj.to)}`;
  }
  if (typeof obj.tag === "string") return `"${obj.tag}"`;
  if (typeof obj.reason === "string") return obj.reason;
  if (typeof obj.status === "string") return pretty(obj.status);
  return null;
}

function pretty(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}

// ── Time ──────────────────────────────────────────────────────────

function formatRelative(d: Date): string {
  const now = Date.now();
  const diff = now - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: days > 365 ? "numeric" : undefined,
  });
}
