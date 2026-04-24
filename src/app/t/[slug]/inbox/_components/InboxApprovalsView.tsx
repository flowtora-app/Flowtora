import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDateTime } from "@/lib/format";
import { approveRequest, rejectRequest, cancelRequest } from "@/app/actions/approvals";
import { APPROVER_PERMISSION } from "@/lib/approval-requests";

// Approvals chip — inbox for quote-exception approval requests.
//
// Ported from /t/[slug]/approvals with two UX improvements from the
// product-strategy doc §2.1 item 4:
//   • "Your requests" is shown to EVERYONE (including approvers), so a
//     manager who raised their own request can see and cancel it.
//   • Pending + Decided + Your requests render in one vertical stack
//     instead of a mid-page "Show recent decisions" toggle.

export async function InboxApprovalsView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Record<string, string | undefined>;
}) {
  const ctx = await requireTenant(slug);
  const canDecide = ctx.can(APPROVER_PERMISSION);
  const showDecided = searchParams.view === "decided";

  const [pending, decided, mine] = await Promise.all([
    db.approvalRequest.findMany({
      where:   { tenantId: ctx.tenant.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    }),
    showDecided
      ? db.approvalRequest.findMany({
          where:   { tenantId: ctx.tenant.id, status: { in: ["APPROVED", "REJECTED", "CANCELED"] } },
          orderBy: { decidedAt: "desc" },
          take:    50,
        })
      : Promise.resolve([]),
    db.approvalRequest.findMany({
      where: {
        tenantId:      ctx.tenant.id,
        requestedById: ctx.userId,
        status:        "PENDING",
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const quoteIds = Array.from(new Set(
    [...pending, ...decided, ...mine]
      .filter((r) => r.entityType === "Quote")
      .map((r) => r.entityId),
  ));
  const quotes = quoteIds.length > 0
    ? await db.quote.findMany({
        where:  { tenantId: ctx.tenant.id, id: { in: quoteIds } },
        select: { id: true, number: true, total: true, status: true, customer: { select: { name: true } } },
      })
    : [];
  const quoteById = new Map(quotes.map((q) => [q.id, q] as const));

  const userIds = Array.from(new Set(
    [...pending, ...decided, ...mine].flatMap((r) => [r.requestedById, r.decidedById ?? ""]).filter(Boolean),
  ));
  const users = userIds.length > 0
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));

  const labelFor = (id: string | null | undefined): string => {
    if (!id) return "—";
    const u = userById.get(id);
    return u?.name ?? u?.email ?? id.slice(0, 6);
  };

  const currency = ctx.tenant.currency;

  type Row = (typeof pending)[number];
  const renderRow = (req: Row, opts: { showDecide: boolean; showCancel: boolean }) => {
    const quote = req.entityType === "Quote" ? quoteById.get(req.entityId) : null;
    return (
      <li
        key={req.id}
        className="px-5 py-4"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {quote ? (
                <Link href={`/t/${slug}/quotes/${quote.id}`} className="underline">
                  Quote {quote.number}
                </Link>
              ) : (
                <span>{req.entityType} · {req.entityId.slice(0, 8)}</span>
              )}
              {quote && (
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {quote.customer.name} · {formatMoney(Number(quote.total), currency)}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-default)" }}>
              {req.reason}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Requested by {labelFor(req.requestedById)} · {formatDateTime(req.createdAt)}
              {req.status !== "PENDING" && (
                <> · <span className="font-medium">{req.status}</span>
                  {req.decidedById && <> by {labelFor(req.decidedById)}</>}
                  {req.decidedAt && <> on {formatDateTime(req.decidedAt)}</>}
                </>
              )}
            </div>
            {req.decisionNote && (
              <div
                className="mt-1 rounded-md px-2 py-1 text-xs"
                style={{ background: "var(--surface-1)", color: "var(--text-default)" }}
              >
                “{req.decisionNote}”
              </div>
            )}
          </div>
          {req.status === "PENDING" && (opts.showDecide || opts.showCancel) && (
            <div className="flex shrink-0 flex-col gap-2">
              {opts.showDecide && (
                <>
                  <form action={approveRequest.bind(null, slug, req.id)} className="flex items-center gap-2">
                    <input
                      type="text"
                      name="note"
                      placeholder="Optional note"
                      maxLength={500}
                      className="rounded-md px-2 py-1 text-xs"
                      style={{
                        border: "1px solid var(--border-default)",
                        background: "var(--surface-0)",
                        color: "var(--text-default)",
                      }}
                    />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-1 text-xs font-medium text-white"
                      style={{ background: "#10b981" }}
                    >
                      Approve
                    </button>
                  </form>
                  <form action={rejectRequest.bind(null, slug, req.id)} className="flex items-center gap-2">
                    <input
                      type="text"
                      name="note"
                      placeholder="Reason (optional)"
                      maxLength={500}
                      className="rounded-md px-2 py-1 text-xs"
                      style={{
                        border: "1px solid var(--border-default)",
                        background: "var(--surface-0)",
                        color: "var(--text-default)",
                      }}
                    />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-1 text-xs font-medium"
                      style={{ border: "1px solid var(--border-default)", color: "#ef4444" }}
                    >
                      Reject
                    </button>
                  </form>
                </>
              )}
              {opts.showCancel && (
                <form action={cancelRequest.bind(null, slug, req.id)}>
                  <button
                    type="submit"
                    className="rounded-md px-3 py-1 text-xs font-medium"
                    style={{ border: "1px solid var(--border-default)", color: "var(--text-muted)" }}
                  >
                    Cancel request
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Requests for manager sign-off on discount or large-job quotes.
      </p>

      {searchParams.notice && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}
        >
          {searchParams.notice}
        </div>
      )}
      {searchParams.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#fef2f2", color: "#7f1d1d", border: "1px solid #fecaca" }}
        >
          {searchParams.error}
        </div>
      )}

      <Card>
        <CardHeader
          title={canDecide ? "Pending decisions" : "Pending approvals"}
          description={
            canDecide
              ? "Approve to stamp the quote for sending, or reject with a reason."
              : "Awaiting a manager. You'll be notified when there's a decision."
          }
        />
        {pending.length === 0 ? (
          <EmptyState
            title={canDecide ? "Nothing awaiting your decision" : "No pending requests"}
            description={
              canDecide
                ? "When a rep tries to send a quote that exceeds an approval threshold, it'll queue up here for you."
                : "You're all clear. Raise a request from a quote by trying to send it when a gate is in the way."
            }
          />
        ) : (
          <ul>
            {pending.map((r) =>
              renderRow(r, {
                showDecide: canDecide,
                // Strategy §2.1 item 4: show cancel even to approvers when it's
                // their own request. Old page hid this.
                showCancel: r.requestedById === ctx.userId,
              }),
            )}
          </ul>
        )}
      </Card>

      {mine.length > 0 && !canDecide && (
        <Card>
          <CardHeader title="Your requests" description="Requests you've raised that are still pending." />
          <ul>{mine.map((r) => renderRow(r, { showDecide: false, showCancel: true }))}</ul>
        </Card>
      )}

      <div className="text-xs">
        <Link
          href={`/t/${slug}/inbox?chip=approvals${showDecided ? "" : "&view=decided"}`}
          className="underline"
          style={{ color: "var(--text-muted)" }}
        >
          {showDecided ? "Hide recent decisions" : "Show recent decisions"}
        </Link>
      </div>

      {showDecided && (
        <Card>
          <CardHeader title="Recent decisions" description="Last 50 approval requests decided or canceled." />
          {decided.length === 0 ? (
            <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No decisions yet.
            </p>
          ) : (
            <ul>
              {decided.map((r) => renderRow(r, { showDecide: false, showCancel: false }))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
