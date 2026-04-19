import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney, formatDateTime } from "@/lib/format";
import { approveRequest, rejectRequest, cancelRequest } from "@/app/actions/approvals";
import { APPROVER_PERMISSION } from "@/lib/approval-requests";

// Phase 22 Slice A — approval inbox.
//
// Two lists: pending requests the viewer can decide on, and requests they
// themselves raised (so they can track or cancel their own). Approvers
// (quotes:approve_exceptions) see the decision forms; everyone else sees
// read-only rows.

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; notice?: string; filter?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);
  const canDecide = ctx.can(APPROVER_PERMISSION);
  const filter = sp.filter === "decided" ? "decided" : "pending";

  const [pending, decided, mine] = await Promise.all([
    db.approvalRequest.findMany({
      where:   { tenantId: ctx.tenant.id, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    }),
    filter === "decided"
      ? db.approvalRequest.findMany({
          where:   { tenantId: ctx.tenant.id, status: { in: ["APPROVED", "REJECTED", "CANCELED"] } },
          orderBy: { decidedAt: "desc" },
          take:    50,
        })
      : Promise.resolve([]),
    db.approvalRequest.findMany({
      where:   {
        tenantId:      ctx.tenant.id,
        requestedById: ctx.userId,
        status:        "PENDING",
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Hydrate quote numbers/totals for the rows we'll render. Cheap batch
  // lookup — keeps the UI data-dense without a per-row join.
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

  // Resolve requester names so the inbox reads "Jordan wants to send Q-1042"
  // instead of a raw userId.
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

  const renderRow = (req: (typeof pending)[number], opts: { showDecide: boolean; showCancel: boolean }) => {
    const quote = req.entityType === "Quote" ? quoteById.get(req.entityId) : null;
    return (
      <li key={req.id} className="px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
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
                <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                  {quote.customer.name} · {formatMoney(Number(quote.total), currency)}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text)" }}>
              {req.reason}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
              Requested by {labelFor(req.requestedById)} · {formatDateTime(req.createdAt)}
              {req.status !== "PENDING" && (
                <> · <span className="font-medium">{req.status}</span>
                  {req.decidedById && <> by {labelFor(req.decidedById)}</>}
                  {req.decidedAt && <> on {formatDateTime(req.decidedAt)}</>}
                </>
              )}
            </div>
            {req.decisionNote && (
              <div className="mt-1 rounded-md px-2 py-1 text-xs"
                style={{ background: "var(--surface-1)", color: "var(--text)" }}>
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
                      style={{ border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text)" }}
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
                      style={{ border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--text)" }}
                    />
                    <button
                      type="submit"
                      className="rounded-md px-3 py-1 text-xs font-medium"
                      style={{ border: "1px solid var(--border)", color: "#ef4444" }}
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
                    style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Requests for manager sign-off on discount or large-job quotes.
        </p>
      </div>

      {sp.notice && (
        <div className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }}>
          {sp.notice}
        </div>
      )}
      {sp.error && (
        <div className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#fef2f2", color: "#7f1d1d", border: "1px solid #fecaca" }}>
          {sp.error}
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
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {pending.map((r) =>
              renderRow(r, {
                showDecide: canDecide,
                showCancel: !canDecide && r.requestedById === ctx.userId,
              }),
            )}
          </ul>
        )}
      </Card>

      {!canDecide && mine.length > 0 && (
        <Card>
          <CardHeader title="Your requests" description="Requests you've raised that are still pending." />
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {mine.map((r) => renderRow(r, { showDecide: false, showCancel: true }))}
          </ul>
        </Card>
      )}

      <div className="text-xs">
        <Link
          href={`/t/${slug}/approvals?filter=${filter === "pending" ? "decided" : "pending"}`}
          className="underline"
          style={{ color: "var(--muted)" }}
        >
          {filter === "pending" ? "Show recent decisions" : "Back to pending"}
        </Link>
      </div>

      {filter === "decided" && (
        <Card>
          <CardHeader title="Recent decisions" description="Last 50 approval requests decided or canceled." />
          {decided.length === 0 ? (
            <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
              No decisions yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {decided.map((r) => renderRow(r, { showDecide: false, showCancel: false }))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
