import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { loadAttention, totalAttentionCount } from "@/lib/attention";
import { InboxChips, parseChip, type InboxChip } from "./_components/InboxChips";
import { InboxSummary } from "./_components/InboxSummary";
import { InboxAllView } from "./_components/InboxAllView";
import { InboxAttentionView } from "./_components/InboxAttentionView";
import { InboxMessagesView } from "./_components/InboxMessagesView";
import { InboxApprovalsView } from "./_components/InboxApprovalsView";
import { InboxNotificationsView } from "./_components/InboxNotificationsView";
import { InboxTasksView } from "./_components/InboxTasksView";
import { buildAllSections } from "./_lib/buildAllSections";

// Unified Inbox (Sprint 1 — Inbox consolidation).
//
// One page replaces five: /attention, /approvals, /messages, /notifications,
// /tasks. The old pages still exist during PR-1 so links don't break; PR-2
// will 301 them to /inbox?chip=<x> and collapse the sidebar to a single
// Inbox entry.
//
// Architecture notes:
//   • Each chip has a co-located server component under _components/ that
//     fetches its own data. The page itself only fetches summary counts.
//   • URL schema: ?chip=<x> with chip-owned sub-params (see InboxChips.tsx).
//   • Access: requireTenant at the page level (everyone can see the shell);
//     individual chips gate their own permissions inside the view.

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);
  const chip: InboxChip = parseChip(sp.chip);

  // ── Summary counts (always loaded — power both chip badges and the
  //    "You're clear" header). These are cheap indexed aggregates; we'd
  //    rather eat one extra query than show stale counts.
  const canSeeAllAttention =
    ctx.role === "OWNER" || ctx.role === "ADMIN" || ctx.role === "PRODUCTION_MANAGER";
  const canApprove = ctx.can("quotes:approve_exceptions");

  const [
    attentionGroups,
    messagesUnread,
    approvalsPending,
    notificationsUnread,
    tasksMineOpen,
  ] = await Promise.all([
    loadAttention(ctx.tenant.id, {
      userId: canSeeAllAttention ? undefined : ctx.userId,
      branchScope: ctx.branchScope,
    }).catch(() => null),
    db.portalMessage.count({
      where: {
        tenantId:   ctx.tenant.id,
        direction:  "INBOUND",
        readAt:     null,
        archivedAt: null,
      },
    }).catch(() => 0),
    // Approvers see everything pending tenant-wide; non-approvers only see
    // the requests they themselves raised — the number they can action.
    canApprove
      ? db.approvalRequest.count({
          where: { tenantId: ctx.tenant.id, status: "PENDING" },
        }).catch(() => 0)
      : db.approvalRequest.count({
          where: {
            tenantId:      ctx.tenant.id,
            status:        "PENDING",
            requestedById: ctx.userId,
          },
        }).catch(() => 0),
    db.notification.count({
      where: { tenantId: ctx.tenant.id, userId: ctx.userId, readAt: null },
    }).catch(() => 0),
    db.task.count({
      where: { tenantId: ctx.tenant.id, assignedTo: ctx.userId, completedAt: null },
    }).catch(() => 0),
  ]);

  const attentionCount = attentionGroups ? totalAttentionCount(attentionGroups) : 0;

  const counts: Partial<Record<InboxChip, number>> = {
    attention:     attentionCount,
    messages:      messagesUnread,
    approvals:     approvalsPending,
    notifications: notificationsUnread,
    tasks:         tasksMineOpen,
  };

  const grandTotal = attentionCount + messagesUnread + approvalsPending + tasksMineOpen;

  // ── Header + chip row ───────────────────────────────────────────────────
  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <h1
            className="font-semibold"
            style={{
              color: "var(--text-default)",
              fontSize: 24,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            Inbox
          </h1>
          {grandTotal > 0 ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: "var(--danger-fg, var(--rose-500))",
                background:
                  "color-mix(in oklab, var(--rose-500) 14%, transparent)",
                border:
                  "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                padding: "3px 8px",
                borderRadius: 999,
                fontFeatureSettings: "'tnum' 1",
                lineHeight: 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: "var(--danger-fg, var(--rose-500))",
                  boxShadow:
                    "0 0 0 2px color-mix(in oklab, var(--rose-500) 25%, transparent)",
                }}
              />
              {grandTotal} need you
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: "var(--emerald-500)",
                background:
                  "color-mix(in oklab, var(--emerald-500) 14%, transparent)",
                border:
                  "1px solid color-mix(in oklab, var(--emerald-500) 30%, transparent)",
                padding: "3px 8px",
                borderRadius: 999,
                lineHeight: 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: "var(--emerald-500)",
                  boxShadow:
                    "0 0 0 2px color-mix(in oklab, var(--emerald-500) 25%, transparent)",
                }}
              />
              All caught up
            </span>
          )}
        </div>
        <InboxSummary
          slug={slug}
          attention={attentionCount}
          messages={messagesUnread}
          approvals={approvalsPending}
          tasks={tasksMineOpen}
        />
      </div>

      <div className="mt-5">
        <InboxChips slug={slug} active={chip} counts={counts} />
      </div>

      <div className="mt-5">
        {chip === "all" && (
          <InboxAllView
            slug={slug}
            sections={await buildAllSections({ slug, ctx, attentionGroups })}
          />
        )}
        {chip === "attention" && (
          <InboxAttentionView slug={slug} searchParams={sp} />
        )}
        {chip === "messages" && (
          <InboxMessagesView slug={slug} searchParams={sp} />
        )}
        {chip === "approvals" && (
          <InboxApprovalsView slug={slug} searchParams={sp} />
        )}
        {chip === "notifications" && (
          <InboxNotificationsView slug={slug} searchParams={sp} />
        )}
        {chip === "tasks" && (
          <InboxTasksView slug={slug} searchParams={sp} />
        )}
      </div>
    </div>
  );
}
