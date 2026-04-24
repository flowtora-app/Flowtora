import * as React from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type {
  CommsEmailEvent,
  CommsPortalMessage,
  CommsInteraction,
} from "@/components/CustomerCommsTimeline";
import type { CommentRow } from "@/components/CommentThread";

// Phase 3 (transformation) — unified customer activity stream.
//
// The old customer detail page split activity across three tabs:
//   • Communication  — emails + portal messages + CRM interactions
//   • Activity       — internal comments + audit log
//   • Timeline route — a super-set of the above
//
// The single-scroll redesign collapses all of that into one chronological
// feed sitting at `#activity` on the detail page. A filter chip row lets
// the reader narrow to a single kind without reloading. Everything is
// server-rendered: the chip filtering is handled via URL fragment
// `?activity=<kind>` and the page re-renders the list. Keeping it out of
// JS state preserves deep-links and "open in new tab" behavior.
//
// The *composition* lives here; data is still loaded by the page (so the
// page can keep a single DB round-trip shape and hand sliced arrays in).

export type StreamItem =
  | { kind: "email";       at: Date; data: CommsEmailEvent }
  | { kind: "portal";      at: Date; data: CommsPortalMessage }
  | { kind: "interaction"; at: Date; data: CommsInteraction }
  | { kind: "comment";     at: Date; data: CommentRow };

export type StreamFilter = "all" | "email" | "portal" | "interaction" | "comment";

export function parseStreamFilter(raw: string | undefined): StreamFilter {
  switch (raw) {
    case "email":
    case "portal":
    case "interaction":
    case "comment":
      return raw;
    default:
      return "all";
  }
}

type Props = {
  customerId:     string;
  customerName:   string;
  slug:           string;
  filter:         StreamFilter;
  emailEvents:    CommsEmailEvent[];
  portalMessages: CommsPortalMessage[];
  interactions:   CommsInteraction[];
  comments:       CommentRow[];
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

const INTERACTION_LABELS: Record<string, string> = {
  NOTE:    "Note",
  CALL:    "Call",
  EMAIL:   "Email logged",
  MEETING: "Meeting",
  TEXT:    "SMS",
};

export function TimelineStream({
  customerId,
  customerName,
  slug,
  filter,
  emailEvents,
  portalMessages,
  interactions,
  comments,
  memberNameById,
  limit = 100,
}: Props) {
  // Merge streams, honoring the current filter. We keep all four lists
  // around so the chip counts always reflect the full picture even when
  // the viewer has narrowed the view.
  const all: StreamItem[] = [
    ...emailEvents.map<StreamItem>((e)  => ({ kind: "email",       at: e.sentAt,     data: e })),
    ...portalMessages.map<StreamItem>((m) => ({ kind: "portal",      at: m.createdAt,  data: m })),
    ...interactions.map<StreamItem>((i)  => ({ kind: "interaction", at: i.occurredAt, data: i })),
    ...comments
      .filter((c) => !c.deletedAt) // tombstones stay hidden in this unified view
      .map<StreamItem>((c) => ({ kind: "comment", at: c.createdAt, data: c })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const visible = filter === "all" ? all : all.filter((i) => i.kind === filter);
  const items = visible.slice(0, limit);

  const counts = {
    all:         all.length,
    email:       all.filter((i) => i.kind === "email").length,
    portal:      all.filter((i) => i.kind === "portal").length,
    interaction: all.filter((i) => i.kind === "interaction").length,
    comment:     all.filter((i) => i.kind === "comment").length,
  };

  const baseHref = `/t/${slug}/customers/${customerId}#activity`;

  return (
    <div
      className="overflow-hidden rounded-md"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex flex-wrap items-center gap-2 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <FilterChip slug={slug} customerId={customerId} label="All"          value="all"         active={filter === "all"}         count={counts.all} />
        <FilterChip slug={slug} customerId={customerId} label="Emails"       value="email"       active={filter === "email"}       count={counts.email} />
        <FilterChip slug={slug} customerId={customerId} label="Portal"       value="portal"      active={filter === "portal"}      count={counts.portal} />
        <FilterChip slug={slug} customerId={customerId} label="Interactions" value="interaction" active={filter === "interaction"} count={counts.interaction} />
        <FilterChip slug={slug} customerId={customerId} label="Comments"     value="comment"     active={filter === "comment"}     count={counts.comment} />
        <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>
          {items.length === 0
            ? "Nothing to show"
            : items.length < visible.length
            ? `Showing ${items.length} of ${visible.length}`
            : `${items.length} ${items.length === 1 ? "entry" : "entries"}`}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
          {filter === "all"
            ? "No activity recorded yet."
            : `No ${filter} entries.`}
        </p>
      ) : (
        <ol>
          {items.map((item, i) => (
            <li
              key={`${item.kind}-${
                item.kind === "comment"    ? item.data.id
              : item.kind === "email"      ? item.data.id
              : item.kind === "portal"     ? item.data.id
              : item.data.id
              }`}
              className="grid grid-cols-[16px_1fr] gap-3 px-5 py-3"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <StreamDot kind={item.kind} data={item.data} />
              <StreamBody
                item={item}
                customerName={customerName}
                memberNameById={memberNameById}
                baseHref={baseHref}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────

function FilterChip({
  slug,
  customerId,
  label,
  value,
  active,
  count,
}: {
  slug:       string;
  customerId: string;
  label:      string;
  value:      StreamFilter;
  active:     boolean;
  count:      number;
}) {
  const href =
    value === "all"
      ? `/t/${slug}/customers/${customerId}#activity`
      : `/t/${slug}/customers/${customerId}?activity=${value}#activity`;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
      style={
        active
          ? { background: "var(--accent-primary)", color: "white" }
          : { background: "var(--surface-2)", color: "var(--text-muted)" }
      }
    >
      {label}
      <span className="tabular-nums" style={{ opacity: active ? 0.85 : 0.6 }}>{count}</span>
    </Link>
  );
}

// ── Dot + body renderers ──────────────────────────────────────────

function StreamDot({
  kind,
  data,
}: {
  kind: StreamItem["kind"];
  data: StreamItem["data"];
}) {
  let color = "#6b7280";
  if (kind === "email") {
    const e = data as CommsEmailEvent;
    if (e.failedAt) color = "#ef4444";
    else if (e.clickedAt) color = "#8b5cf6";
    else if (e.openedAt) color = "#10b981";
    else color = "#3b82f6";
  } else if (kind === "portal") {
    const m = data as CommsPortalMessage;
    color = m.direction === "INBOUND" ? "#f59e0b" : "#6366f1";
  } else if (kind === "comment") {
    color = "#8b5cf6";
  } else {
    color = "#14b8a6";
  }
  return (
    <div className="flex flex-col items-center pt-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: "0 0 0 2px var(--panel)" }}
      />
    </div>
  );
}

function StreamBody({
  item,
  customerName,
  memberNameById,
}: {
  item:           StreamItem;
  customerName:   string;
  memberNameById: Map<string, string>;
  baseHref:       string;
}) {
  if (item.kind === "email") {
    const e = item.data;
    const from = e.sender?.name ?? e.sender?.email ?? "System";
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Chip background="var(--surface-2)">{KIND_LABELS[e.kind] ?? e.kind}</Chip>
          <span>{from} → {e.toAddress}</span>
          <span>·</span>
          <span>{formatDateTime(e.sentAt)}</span>
          <DeliveryChip event={e} />
        </div>
        {e.subject && <div className="mt-0.5 text-sm font-medium">{e.subject}</div>}
        {e.bodyPreview && (
          <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--muted)" }}>
            {e.bodyPreview}
          </p>
        )}
      </div>
    );
  }

  if (item.kind === "portal") {
    const m = item.data;
    const inbound = m.direction === "INBOUND";
    const who = inbound ? customerName : m.sender?.name ?? "Staff";
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Chip
            background={inbound ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.15)"}
            color={inbound ? "#f59e0b" : "#6366f1"}
          >
            {inbound ? "Portal · in" : "Portal · out"}
          </Chip>
          <span>{who}</span>
          <span>·</span>
          <span>{formatDateTime(m.createdAt)}</span>
          {inbound && !m.readAt && (
            <span
              className="rounded px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "var(--danger)", color: "white" }}
            >
              New
            </span>
          )}
        </div>
        {m.subject && <div className="mt-0.5 text-sm font-medium">{m.subject}</div>}
        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>
          {m.body}
        </p>
      </div>
    );
  }

  if (item.kind === "interaction") {
    const it = item.data;
    const who = memberNameById.get(it.userId) ?? "Staff";
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Chip background="var(--surface-2)">{INTERACTION_LABELS[it.type] ?? it.type}</Chip>
          <span>{who}</span>
          <span>·</span>
          <span>{formatDateTime(it.occurredAt)}</span>
        </div>
        {it.subject && <div className="mt-0.5 text-sm font-medium">{it.subject}</div>}
        {it.body && (
          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs">{it.body}</p>
        )}
      </div>
    );
  }

  // Comment
  const c = item.data;
  const author = memberNameById.get(c.authorId) ?? "Teammate";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <Chip background="rgba(139, 92, 246, 0.15)" color="#8b5cf6">Comment</Chip>
        <span>{author}</span>
        <span>·</span>
        <span>{formatDateTime(c.createdAt)}</span>
        {c.editedAt && <span>· edited</span>}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
      {c.mentionedUserIds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 text-xs" style={{ color: "var(--muted)" }}>
          <span>Mentioned:</span>
          {c.mentionedUserIds.map((uid) => (
            <span
              key={uid}
              className="rounded-full px-2 py-0.5"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {memberNameById.get(uid) ?? "Unknown"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  background,
  color,
}: {
  children:   React.ReactNode;
  background: string;
  color?:     string;
}) {
  return (
    <span
      className="rounded px-1.5 py-0.5 font-medium"
      style={{ background, color: color ?? "var(--text-default)" }}
    >
      {children}
    </span>
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
    return <span className="ml-auto text-[10px]" style={{ color: "#8b5cf6" }}>Clicked</span>;
  }
  if (event.openedAt) {
    return <span className="ml-auto text-[10px]" style={{ color: "#10b981" }}>Opened</span>;
  }
  return <span className="ml-auto text-[10px]" style={{ color: "var(--text-faint)" }}>Sent</span>;
}
