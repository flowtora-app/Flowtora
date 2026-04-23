import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { changeQuoteStatus } from "@/app/actions/quotes";
import { statusColor, statusLabel } from "@/lib/quotes";
import { formatMoney, formatDate, formatDateTime, humanize } from "@/lib/format";
import { CommentThread } from "@/components/CommentThread";
import { QuotePanelTabs, type QuotePanelTab } from "@/components/quotes/QuotePanelTabs";
import type { QuoteStatus, DeclinedReason } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT:    ["SENT"],
  SENT:     ["VIEWED", "APPROVED", "DECLINED", "EXPIRED", "DRAFT"],
  VIEWED:   ["APPROVED", "DECLINED", "EXPIRED", "SENT", "DRAFT"],
  APPROVED: [],
  DECLINED: ["DRAFT"],
  EXPIRED:  ["DRAFT"],
};

const TRANSITION_LABELS: Partial<Record<QuoteStatus, string>> = {
  SENT:     "Mark as sent",
  VIEWED:   "Mark as viewed",
  APPROVED: "Approve",
  DECLINED: "Decline",
  EXPIRED:  "Mark expired",
  DRAFT:    "Back to draft",
};

function declinedReasonLabel(reason: DeclinedReason): string {
  switch (reason) {
    case "PRICE":        return "Price too high";
    case "COMPETITOR":   return "Went with competitor";
    case "TIMING":       return "Timing / not ready";
    case "NO_RESPONSE":  return "No response";
    case "SCOPE_CHANGE": return "Scope changed";
    case "OTHER":        return "Other";
    default:             return humanize(reason);
  }
}

export type QuotePanelQuote = {
  id: string;
  number: string;
  status: QuoteStatus;
  subtotal: unknown;
  discountAmount: unknown;
  taxAmount: unknown;
  total: unknown;
  depositAmount: unknown;
  optionalSubtotal: unknown;
  locationId: string | null;
  expiresAt: Date | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  declinedReason: DeclinedReason | null;
  declinedNote: string | null;
  notes: string | null;
  customerNote: string | null;
  supersededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; name: string; email: string | null; phone: string | null };
  order: { id: string; number: string; status: string } | null;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: unknown | null;
    unitPrice: unknown | null;
    subtotal: unknown;
    isOptional: boolean;
  }>;
  comments: Array<{
    id: string;
    authorId: string;
    body: string;
    mentionedUserIds: string[];
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
  }>;
};

export type QuotePanelActivity = {
  id: string;
  action: string;
  userId: string | null;
  createdAt: Date;
  metadata: unknown;
};

interface QuotePanelProps {
  slug: string;
  currency: string;
  quote: QuotePanelQuote;
  tab: QuotePanelTab;
  activity: QuotePanelActivity[];
  canManage: boolean;
  canComment: boolean;
  currentUserId: string;
  memberMap: Map<string, { name: string }>;
}

export function QuotePanel({
  slug,
  currency,
  quote,
  tab,
  activity,
  canManage,
  canComment,
  currentUserId,
  memberMap,
}: QuotePanelProps) {
  const transitions = ALLOWED_TRANSITIONS[quote.status] ?? [];
  const total = Number(quote.total);
  const deposit = Number(quote.depositAmount);
  const optional = Number(quote.optionalSubtotal);
  const now = new Date();
  const expiringSoon =
    quote.expiresAt &&
    (quote.status === "SENT" || quote.status === "VIEWED") &&
    quote.expiresAt.getTime() > now.getTime() &&
    quote.expiresAt.getTime() - now.getTime() <= 3 * 86_400_000;
  const expired =
    quote.expiresAt &&
    (quote.status === "SENT" || quote.status === "VIEWED") &&
    quote.expiresAt.getTime() <= now.getTime();

  let nextAction = "";
  if (quote.status === "DRAFT") {
    nextAction = "Send to customer to move the pipeline.";
  } else if (quote.status === "SENT") {
    nextAction = quote.sentAt
      ? `Sent ${formatDate(quote.sentAt)} — awaiting response.`
      : "Awaiting customer response.";
  } else if (quote.status === "VIEWED") {
    nextAction = "Customer has seen it — nudge for a decision.";
  } else if (quote.status === "APPROVED") {
    nextAction = quote.order
      ? `Approved — order ${quote.order.number} created.`
      : "Approved.";
  } else if (quote.status === "DECLINED") {
    nextAction = "Declined. Revert to draft to revise and re-send.";
  } else if (quote.status === "EXPIRED") {
    nextAction = "Expired. Revert to draft to reissue.";
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* STICKY HEADER */}
      <div
        className="sticky top-0 z-20 px-6 py-4"
        style={{
          background: "var(--surface-0)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
                {quote.number}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: statusColor(quote.status), color: "white" }}
              >
                {statusLabel(quote.status)}
              </span>
              {quote.supersededAt && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                  title="Replaced by a newer revision"
                >
                  Superseded
                </span>
              )}
              {expired && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: "var(--danger-fg)", color: "white" }}
                >
                  Expired
                </span>
              )}
              {expiringSoon && !expired && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: "#f59e0b", color: "white" }}
                >
                  Expiring soon
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              <Link href={`/t/${slug}/customers/${quote.customer.id}`} className="underline">
                {quote.customer.name}
              </Link>
              {quote.order && (
                <>
                  {" · converted to "}
                  <Link href={`/t/${slug}/orders/${quote.order.id}`} className="underline">
                    {quote.order.number}
                  </Link>
                </>
              )}
              {quote.expiresAt && <>{" · expires "}{formatDate(quote.expiresAt)}</>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage &&
              transitions.slice(0, 2).map((to) => {
                const action = changeQuoteStatus.bind(null, slug, quote.id);
                const isDecline = to === "DECLINED";
                const isApprove = to === "APPROVED";
                return (
                  <form key={to} action={action}>
                    <input type="hidden" name="status" value={to} />
                    <Button
                      type="submit"
                      variant={isDecline ? "danger" : isApprove ? "primary" : "secondary"}
                    >
                      {TRANSITION_LABELS[to] ?? statusLabel(to)}
                    </Button>
                  </form>
                );
              })}
            <Link
              href={`/t/${slug}/quotes/${quote.id}`}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              Open full view ↗
            </Link>
          </div>
        </div>

        <div className="mt-3">
          <QuotePanelTabs active={tab} />
        </div>
      </div>

      {/* TAB BODY */}
      <div className="flex-1 space-y-5 px-6 py-5">
        {tab === "overview" && (
          <OverviewTab slug={slug} currency={currency} quote={quote} />
        )}
        {tab === "comments" && (
          <CommentThread
            slug={slug}
            parentKind="quote"
            parentId={quote.id}
            comments={quote.comments}
            currentUserId={currentUserId}
            memberMap={memberMap}
            canModerate={canComment}
          />
        )}
        {tab === "activity" && (
          <ActivityTab activity={activity} memberMap={memberMap} />
        )}
      </div>

      {/* STICKY MONEY FOOTER */}
      <div
        className="sticky bottom-0 z-10 grid gap-3 px-6 py-3 md:grid-cols-[1fr_1fr_1fr_2fr] md:items-center"
        style={{
          background: "var(--surface-0)",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <Stat label="Total" value={formatMoney(total, currency)} />
        <Stat
          label="Deposit"
          value={deposit > 0.005 ? formatMoney(deposit, currency) : "—"}
        />
        <Stat
          label="Add-ons"
          value={optional > 0.005 ? formatMoney(optional, currency) : "—"}
        />
        {nextAction && (
          <div className="text-xs md:text-right" style={{ color: "var(--text-muted)" }}>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              Next ·{" "}
            </span>
            <span style={{ color: "var(--text-default)" }}>{nextAction}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-base font-semibold tabular-nums"
        style={{ color: valueColor ?? "var(--text-default)" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ---------- Overview tab ---------- */

function OverviewTab({
  slug,
  currency,
  quote,
}: {
  slug: string;
  currency: string;
  quote: QuotePanelQuote;
}) {
  const requiredItems = quote.items.filter((i) => !i.isOptional);
  const optionalItems = quote.items.filter((i) => i.isOptional);

  return (
    <>
      {/* Declined banner */}
      {quote.status === "DECLINED" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-medium">
            Declined
            {quote.declinedReason && (
              <> — {declinedReasonLabel(quote.declinedReason)}</>
            )}
          </div>
          {quote.declinedNote && (
            <div className="mt-1 text-xs opacity-90">{quote.declinedNote}</div>
          )}
          {quote.declinedAt && (
            <div className="mt-1 text-[11px] opacity-80">
              {formatDate(quote.declinedAt)}
            </div>
          )}
        </div>
      )}

      {/* Approved / converted banner */}
      {quote.status === "APPROVED" && quote.order && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-primary)",
          }}
        >
          <div className="font-medium">Approved</div>
          <div className="mt-1 text-xs">
            Order{" "}
            <Link
              href={`/t/${slug}/orders/${quote.order.id}`}
              className="underline"
              style={{ color: "var(--accent-primary)" }}
            >
              {quote.order.number}
            </Link>{" "}
            was created from this quote.
          </div>
        </div>
      )}

      {/* Line items */}
      <Card>
        <CardHeader
          title="Line items"
          description={`${requiredItems.length} item${requiredItems.length === 1 ? "" : "s"}${
            optionalItems.length > 0 ? ` · ${optionalItems.length} optional` : ""
          }`}
        />
        <ul>
          {quote.items.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No line items yet.
            </li>
          )}
          {quote.items.map((it) => (
            <li
              key={it.id}
              className="flex items-start justify-between gap-4 px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                    {it.name}
                  </div>
                  {it.isOptional && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                      title="Optional add-on — not included in subtotal"
                    >
                      optional
                    </span>
                  )}
                </div>
                {it.description && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {it.description.length > 160 ? it.description.slice(0, 160) + "…" : it.description}
                  </div>
                )}
                {it.quantity != null && it.unitPrice != null && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    Qty {Number(it.quantity)} · {formatMoney(it.unitPrice as never, currency)} ea
                  </div>
                )}
              </div>
              <div
                className="shrink-0 text-right text-sm font-medium tabular-nums"
                style={{ color: "var(--text-default)" }}
              >
                {formatMoney(it.subtotal as never, currency)}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* Customer + notes grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Customer" />
          <div className="space-y-1 px-5 py-4 text-sm">
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              <Link href={`/t/${slug}/customers/${quote.customer.id}`} className="underline">
                {quote.customer.name}
              </Link>
            </div>
            {quote.customer.email && (
              <div style={{ color: "var(--text-muted)" }}>{quote.customer.email}</div>
            )}
            {quote.customer.phone && (
              <div style={{ color: "var(--text-muted)" }}>{quote.customer.phone}</div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Notes" />
          <div
            className="whitespace-pre-wrap px-5 py-4 text-sm"
            style={{ color: quote.notes ? "var(--text-default)" : "var(--text-muted)" }}
          >
            {quote.notes ?? "No internal notes."}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------- Activity tab ---------- */

function ActivityTab({
  activity,
  memberMap,
}: {
  activity: QuotePanelActivity[];
  memberMap: Map<string, { name: string }>;
}) {
  return (
    <Card>
      <CardHeader
        title="Activity"
        description={`${activity.length} recent event${activity.length === 1 ? "" : "s"}`}
      />
      <ul>
        {activity.length === 0 && (
          <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No activity recorded.
          </li>
        )}
        {activity.map((a) => {
          const who = a.userId ? memberMap.get(a.userId)?.name ?? "Unknown" : "System";
          return (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 px-5 py-2.5 text-xs"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex-1">
                <span className="font-medium" style={{ color: "var(--text-default)" }}>
                  {humanize(a.action)}
                </span>
                <span style={{ color: "var(--text-muted)" }}> · {who}</span>
              </div>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                {formatDateTime(a.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Loader ---------- */

export async function loadQuoteForPanel(tenantId: string, quoteId: string) {
  const [quote, activity] = await Promise.all([
    db.quote.findFirst({
      where: { id: quoteId, tenantId },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        order:    { select: { id: true, number: true, status: true } },
        items:    { orderBy: { sortOrder: "asc" } },
        comments: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    }),
    db.auditLog.findMany({
      where: { tenantId, entityType: "Quote", entityId: quoteId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, action: true, userId: true, createdAt: true, metadata: true },
    }),
  ]);
  return { quote, activity };
}
