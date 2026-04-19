import { formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/Card";

// Phase 16 — unified communication history per customer.
//
// Merges three streams into a single reverse-chronological timeline:
//   • EmailEvent       — automated outbound emails (quote/proof/invoice/portal
//     invite/update/reminder) with delivery state (opened/clicked/failed).
//   • PortalMessage    — two-way customer portal conversations.
//   • Interaction      — manually-logged touchpoints (call, meeting, text, note).
//
// Internal Comment threads are intentionally excluded — they're staff-only and
// belong in the CommentThread component below the timeline, not mixed with
// customer-facing activity.

export type CommsEmailEvent = {
  id:              string;
  kind:            string;
  direction:       "INBOUND" | "OUTBOUND";
  subject:         string | null;
  bodyPreview:     string | null;
  toAddress:       string;
  sentAt:          Date;
  openedAt:        Date | null;
  clickedAt:       Date | null;
  failedAt:        Date | null;
  failReason:      string | null;
  sender:          { name: string | null; email: string } | null;
};

export type CommsPortalMessage = {
  id:        string;
  direction: "INBOUND" | "OUTBOUND";
  subject:   string | null;
  body:      string;
  createdAt: Date;
  readAt:    Date | null;
  sender:    { name: string | null } | null;
};

export type CommsInteraction = {
  id:         string;
  type:       string;
  subject:    string | null;
  body:       string | null;
  occurredAt: Date;
  userId:     string;
};

type TimelineItem =
  | { source: "email";       at: Date; data: CommsEmailEvent }
  | { source: "portal";      at: Date; data: CommsPortalMessage }
  | { source: "interaction"; at: Date; data: CommsInteraction };

type Props = {
  customerName:   string;
  emailEvents:    CommsEmailEvent[];
  portalMessages: CommsPortalMessage[];
  interactions:   CommsInteraction[];
  memberNameById: Map<string, string>;
  limit?:         number;
};

const KIND_LABELS: Record<string, string> = {
  QUOTE_SENT:      "Quote sent",
  PROOF_SENT:      "Proof sent",
  INVOICE_SENT:    "Invoice sent",
  PAYMENT_RECEIPT: "Payment receipt",
  PORTAL_INVITE:   "Portal invite",
  UPDATE_MESSAGE:  "Update sent",
  REMINDER:        "Reminder",
  GENERIC:         "Email",
};

const TYPE_LABELS: Record<string, string> = {
  NOTE:    "Note",
  CALL:    "Call",
  EMAIL:   "Email logged",
  MEETING: "Meeting",
  TEXT:    "SMS",
};

export function CustomerCommsTimeline({
  customerName,
  emailEvents,
  portalMessages,
  interactions,
  memberNameById,
  limit = 30,
}: Props) {
  const items: TimelineItem[] = [
    ...emailEvents.map<TimelineItem>((e)  => ({ source: "email",       at: e.sentAt,      data: e })),
    ...portalMessages.map<TimelineItem>((m) => ({ source: "portal",      at: m.createdAt,   data: m })),
    ...interactions.map<TimelineItem>((i)  => ({ source: "interaction", at: i.occurredAt,  data: i })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);

  const totalAvailable = emailEvents.length + portalMessages.length + interactions.length;
  const showingTruncated = totalAvailable > items.length;

  return (
    <Card>
      <CardHeader
        title="Communication history"
        description="Emails sent, portal messages, and logged touchpoints — newest first."
      />
      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
          No communications logged yet.
        </p>
      ) : (
        <ol className="px-5 py-3">
          {items.map((item, i) => (
            <li
              key={`${item.source}-${
                item.source === "email"       ? item.data.id
                : item.source === "portal"    ? item.data.id
                : item.data.id
              }`}
              className="grid grid-cols-[16px_1fr] gap-3 py-2"
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
              }}
            >
              <TimelineDot item={item} />
              <TimelineBody
                item={item}
                customerName={customerName}
                memberNameById={memberNameById}
              />
            </li>
          ))}
        </ol>
      )}
      {showingTruncated && (
        <div
          className="px-5 py-2 text-xs"
          style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}
        >
          Showing {items.length} of {totalAvailable} entries.
        </div>
      )}
    </Card>
  );
}

function TimelineDot({ item }: { item: TimelineItem }) {
  const color = dotColor(item);
  return (
    <div className="flex flex-col items-center pt-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 0 2px var(--surface-0)` }}
        aria-hidden
      />
    </div>
  );
}

function dotColor(item: TimelineItem): string {
  if (item.source === "email") {
    if (item.data.failedAt) return "#ef4444";
    if (item.data.clickedAt) return "#8b5cf6";
    if (item.data.openedAt) return "#10b981";
    return "#3b82f6";
  }
  if (item.source === "portal") {
    return item.data.direction === "INBOUND" ? "#f59e0b" : "#6366f1";
  }
  return "#6b7280";
}

function TimelineBody({
  item,
  customerName,
  memberNameById,
}: {
  item: TimelineItem;
  customerName: string;
  memberNameById: Map<string, string>;
}) {
  if (item.source === "email") {
    const e = item.data;
    const from = e.sender?.name ?? e.sender?.email ?? "System";
    return (
      <div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="rounded px-1.5 py-0.5 font-medium" style={{ background: "var(--surface-2)" }}>
            {KIND_LABELS[e.kind] ?? e.kind}
          </span>
          <span>{from} → {e.toAddress}</span>
          <span>·</span>
          <span>{formatDateTime(e.sentAt)}</span>
          <DeliveryChip event={e} />
        </div>
        {e.subject && (
          <div className="mt-0.5 text-sm font-medium" style={{ color: "var(--text-default)" }}>
            {e.subject}
          </div>
        )}
        {e.bodyPreview && (
          <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {e.bodyPreview}
          </p>
        )}
      </div>
    );
  }

  if (item.source === "portal") {
    const m = item.data;
    const isInbound = m.direction === "INBOUND";
    const fromLabel = isInbound ? customerName : (m.sender?.name ?? "Staff");
    return (
      <div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span
            className="rounded px-1.5 py-0.5 font-medium"
            style={{
              background: isInbound ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)",
              color:      isInbound ? "#f59e0b" : "#6366f1",
            }}
          >
            {isInbound ? "Portal message · in" : "Portal reply · out"}
          </span>
          <span>{fromLabel}</span>
          <span>·</span>
          <span>{formatDateTime(m.createdAt)}</span>
          {isInbound && !m.readAt && (
            <span className="rounded px-1 py-0.5 text-[10px] font-bold" style={{ background: "var(--danger)", color: "white" }}>
              NEW
            </span>
          )}
        </div>
        {m.subject && (
          <div className="mt-0.5 text-sm font-medium" style={{ color: "var(--text-default)" }}>
            {m.subject}
          </div>
        )}
        <p className="mt-0.5 line-clamp-2 text-xs whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
          {m.body}
        </p>
      </div>
    );
  }

  const it = item.data;
  const who = memberNameById.get(it.userId) ?? "Staff";
  return (
    <div>
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="rounded px-1.5 py-0.5 font-medium" style={{ background: "var(--surface-2)" }}>
          {TYPE_LABELS[it.type] ?? it.type}
        </span>
        <span>{who}</span>
        <span>·</span>
        <span>{formatDateTime(it.occurredAt)}</span>
      </div>
      {it.subject && (
        <div className="mt-0.5 text-sm font-medium" style={{ color: "var(--text-default)" }}>
          {it.subject}
        </div>
      )}
      {it.body && (
        <p className="mt-0.5 line-clamp-3 text-xs whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
          {it.body}
        </p>
      )}
    </div>
  );
}

function DeliveryChip({ event }: { event: CommsEmailEvent }) {
  if (event.failedAt) {
    return (
      <span
        className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium"
        style={{ background: "#3a1517", color: "#ff8b8b" }}
        title={event.failReason ?? "Delivery failed"}
      >
        Failed
      </span>
    );
  }
  if (event.clickedAt) {
    return (
      <span className="ml-auto text-[10px]" style={{ color: "#8b5cf6" }}>
        Clicked
      </span>
    );
  }
  if (event.openedAt) {
    return (
      <span className="ml-auto text-[10px]" style={{ color: "#10b981" }}>
        Opened
      </span>
    );
  }
  return <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>Sent</span>;
}

