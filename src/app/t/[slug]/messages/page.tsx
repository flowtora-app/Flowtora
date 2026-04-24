import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import {
  archiveConversation,
  markAllPortalMessagesRead,
  markPortalMessagesRead,
  replyToPortalMessage,
  unarchiveConversation,
} from "@/app/actions/portal-messages";
import { InboxShortcuts } from "@/components/messages/InboxShortcuts";
import { InboxReplyForm } from "@/components/messages/InboxReplyForm";
import { AutoMarkRead } from "@/components/messages/AutoMarkRead";

// Centralized portal-messages inbox — Gmail-style split pane.
//
// Left: conversation list (one row per customer, latest inbound first).
// Right: full thread with reply form, archive button, and context header.
// URL:   ?view=unread|all|archived · ?entity=proof|invoice|order|quote
//        · ?q=<search> · ?c=<customerId>  (selected conversation)
//
// Client-side affordances:
//   • Keyboard shortcuts (j/k navigate, r reply, e archive, / search, esc deselect)
//   • Auto-mark-read when a conversation is opened
//   • Optimistic reply-form reset after send (no full page reload)

type View = "unread" | "all" | "archived";
type Entity = "all" | "proof" | "order" | "invoice" | "quote" | "general";

const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "unread",   label: "Unread",   hint: "Conversations with messages you haven't read." },
  { value: "all",      label: "All",      hint: "Every inbound conversation from the portal." },
  { value: "archived", label: "Archived", hint: "Conversations you've archived out of the active inbox." },
];

const ENTITIES: { value: Entity; label: string; dbValue: string | null }[] = [
  { value: "all",     label: "All types", dbValue: null       },
  { value: "general", label: "General",   dbValue: "__NULL__" }, // sentinel — null relatedEntityType
  { value: "proof",   label: "Proofs",    dbValue: "Proof"    },
  { value: "order",   label: "Orders",    dbValue: "Order"    },
  { value: "invoice", label: "Invoices",  dbValue: "Invoice"  },
  { value: "quote",   label: "Quotes",    dbValue: "Quote"    },
];

export default async function MessagesInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; view?: View; entity?: Entity; c?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "unread";
  const entity: Entity = ENTITIES.some((e) => e.value === sp.entity) ? (sp.entity as Entity) : "all";
  const q = sp.q?.trim() ?? "";
  const selectedCustomerId = sp.c ?? null;

  // Entity filter is applied to the inbound message rows. "general" means
  // relatedEntityType is null; specific values map to the Prisma string.
  const entityMeta = ENTITIES.find((e) => e.value === entity)!;
  const entityWhere =
    entityMeta.dbValue === null
      ? {}
      : entityMeta.dbValue === "__NULL__"
      ? { relatedEntityType: null }
      : { relatedEntityType: entityMeta.dbValue };

  // Latest inbound message per customer (conversation root).
  const listFilter = {
    tenantId:   ctx.tenant.id,
    direction:  "INBOUND" as const,
    archivedAt: view === "archived" ? { not: null } : null,
    ...entityWhere,
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" as const } },
            { body:    { contains: q, mode: "insensitive" as const } },
            { customer: { name:  { contains: q, mode: "insensitive" as const } } },
            { customer: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const latestPerCustomer = await db.portalMessage.findMany({
    where: listFilter,
    distinct: ["customerId"],
    orderBy:  { createdAt: "desc" },
    take:     200,
    select: {
      id:         true,
      customerId: true,
      subject:    true,
      body:       true,
      readAt:     true,
      createdAt:  true,
      relatedEntityType: true,
      customer: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Unread counts per customer (inbox-level, independent of entity filter).
  const customerIds = latestPerCustomer.map((m) => m.customerId);
  const unreadGroups = customerIds.length
    ? await db.portalMessage.groupBy({
        by: ["customerId"],
        where: {
          tenantId:   ctx.tenant.id,
          customerId: { in: customerIds },
          direction:  "INBOUND",
          readAt:     null,
          archivedAt: null,
        },
        _count: { _all: true },
      })
    : [];
  const unreadByCustomer = new Map<string, number>(
    unreadGroups.map((g) => [g.customerId, g._count._all]),
  );

  // "Unread" view filters to conversations with unread inbounds.
  const rows = latestPerCustomer.filter((m) => {
    if (view === "unread") return (unreadByCustomer.get(m.customerId) ?? 0) > 0;
    return true;
  });

  const orderedCustomerIds = rows.map((r) => r.customerId);

  // ── View-tab totals (ignore the entity filter so tabs stay stable) ────
  const [totalUnreadConvos, totalAllConvos, totalArchivedConvos] = await Promise.all([
    db.portalMessage
      .findMany({
        where: {
          tenantId: ctx.tenant.id, direction: "INBOUND",
          readAt: null, archivedAt: null,
        },
        distinct: ["customerId"],
        select:   { customerId: true },
      })
      .then((r) => r.length),
    db.portalMessage
      .findMany({
        where: { tenantId: ctx.tenant.id, direction: "INBOUND", archivedAt: null },
        distinct: ["customerId"],
        select:   { customerId: true },
      })
      .then((r) => r.length),
    db.portalMessage
      .findMany({
        where: { tenantId: ctx.tenant.id, direction: "INBOUND", archivedAt: { not: null } },
        distinct: ["customerId"],
        select:   { customerId: true },
      })
      .then((r) => r.length),
  ]);

  const viewCounts: Record<View, number> = {
    unread:   totalUnreadConvos,
    all:      totalAllConvos,
    archived: totalArchivedConvos,
  };

  // ── Selected conversation (right pane) ─────────────────────────────────
  let selected:
    | {
        customer: { id: string; name: string; email: string | null };
        messages: Array<{
          id: string;
          direction: "INBOUND" | "OUTBOUND";
          subject: string | null;
          body: string;
          readAt: Date | null;
          archivedAt: Date | null;
          createdAt: Date;
          sender: { name: string | null } | null;
          relatedEntityType: string | null;
          relatedEntityId: string | null;
        }>;
        unreadCount: number;
        isArchived: boolean;
      }
    | null = null;

  if (selectedCustomerId) {
    const customer = await db.customer.findFirst({
      where:  { id: selectedCustomerId, tenantId: ctx.tenant.id },
      select: { id: true, name: true, email: true },
    });
    if (customer) {
      const messages = await db.portalMessage.findMany({
        where: {
          tenantId:   ctx.tenant.id,
          customerId: customer.id,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, direction: true, subject: true, body: true,
          readAt: true, archivedAt: true, createdAt: true,
          relatedEntityType: true, relatedEntityId: true,
          sender: { select: { name: true } },
        },
      });
      const unreadCount = messages.filter((m) => m.direction === "INBOUND" && !m.readAt).length;
      const activeInbound = messages.filter((m) => m.direction === "INBOUND" && !m.archivedAt);
      // Conversation considered archived when every inbound is archived.
      const isArchived =
        messages.some((m) => m.direction === "INBOUND") && activeInbound.length === 0;
      selected = {
        customer,
        messages: messages.map((m) => ({
          ...m,
          direction: m.direction as "INBOUND" | "OUTBOUND",
        })),
        unreadCount,
        isArchived,
      };
    }
  }

  // ── URL helpers ────────────────────────────────────────────────────────
  const currentParams = new URLSearchParams();
  if (q)                   currentParams.set("q", q);
  if (view !== "unread")   currentParams.set("view", view);
  if (entity !== "all")    currentParams.set("entity", entity);
  const preservedParams = currentParams.toString() ? `?${currentParams.toString()}` : "";

  const viewHref = (v: View) => {
    const p = new URLSearchParams();
    if (q)                   p.set("q", q);
    if (entity !== "all")    p.set("entity", entity);
    if (v !== "unread")      p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/messages${qs ? `?${qs}` : ""}`;
  };

  const entityHref = (e: Entity) => {
    const p = new URLSearchParams();
    if (q)                   p.set("q", q);
    if (view !== "unread")   p.set("view", view);
    if (e !== "all")         p.set("entity", e);
    const qs = p.toString();
    return `/t/${slug}/messages${qs ? `?${qs}` : ""}`;
  };

  const rowHref = (customerId: string) => {
    const p = new URLSearchParams(currentParams);
    p.set("c", customerId);
    return `/t/${slug}/messages?${p.toString()}`;
  };

  const markAllAction = markAllPortalMessagesRead.bind(null, slug);
  const replyAction   = replyToPortalMessage.bind(null, slug);

  return (
    <div>
      <InboxShortcuts
        orderedCustomerIds={orderedCustomerIds}
        currentCustomerId={selectedCustomerId}
        basePath={`/t/${slug}/messages`}
        preservedParams={preservedParams}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {totalUnreadConvos > 0
              ? `${totalUnreadConvos} unread ${totalUnreadConvos === 1 ? "conversation" : "conversations"}`
              : "You're all caught up."}
            {" · "}
            <span style={{ color: "var(--text-faint)" }}>
              <kbd className="rounded border px-1 text-[10px]">j</kbd>/<kbd className="rounded border px-1 text-[10px]">k</kbd> navigate
              {" · "}<kbd className="rounded border px-1 text-[10px]">r</kbd> reply
              {" · "}<kbd className="rounded border px-1 text-[10px]">e</kbd> archive
              {" · "}<kbd className="rounded border px-1 text-[10px]">/</kbd> search
            </span>
          </p>
        </div>
        {totalUnreadConvos > 0 && (
          <form action={markAllAction}>
            <button type="submit" className="ts-btn-secondary rounded-md px-3 py-2 text-sm">
              Mark all as read
            </button>
          </form>
        )}
      </div>

      <nav className="mt-4 flex flex-wrap gap-1 text-sm" aria-label="View">
        {VIEWS.map((v) => {
          const active = view === v.value;
          const count = viewCounts[v.value];
          return (
            <Link
              key={v.value}
              href={viewHref(v.value)}
              title={v.hint}
              className="ts-focus rounded-md px-3 py-1.5 transition-colors"
              style={{
                background: active ? "var(--surface-2)" : "transparent",
                border: `1px solid ${active ? "var(--border-default)" : "var(--border-subtle)"}`,
                color: active ? "var(--text-default)" : "var(--text-muted)",
                fontWeight: active ? 600 : 500,
              }}
            >
              {v.label}
              {count > 0 && (
                <span
                  className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                  style={{
                    background: active ? "var(--surface-0)" : "var(--surface-1)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-1 text-xs" style={{ color: "var(--text-faint)" }}>Filter:</span>
        {ENTITIES.map((e) => {
          const active = entity === e.value;
          return (
            <Link
              key={e.value}
              href={entityHref(e.value)}
              className="ts-focus rounded-md px-2.5 py-1 text-xs transition-colors"
              style={{
                background: active ? "var(--accent-surface)" : "transparent",
                border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                color: active ? "var(--accent-primary)" : "var(--text-muted)",
                fontWeight: active ? 600 : 500,
              }}
            >
              {e.label}
            </Link>
          );
        })}
      </div>

      <form className="mt-3 flex flex-wrap items-center gap-2 text-sm" method="get">
        <input
          id="inbox-search"
          name="q"
          defaultValue={q}
          placeholder="Search customer or message…  (press /)"
          className="flex-1 min-w-[240px] rounded-md px-3 py-2 outline-none"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        {view !== "unread"  && <input type="hidden" name="view" value={view} />}
        {entity !== "all"   && <input type="hidden" name="entity" value={entity} />}
        {selectedCustomerId && <input type="hidden" name="c" value={selectedCustomerId} />}
        <button type="submit" className="ts-btn-secondary rounded-md px-3 py-2">
          Search
        </button>
        {(q || view !== "unread" || entity !== "all") && (
          <Link
            href={`/t/${slug}/messages${selectedCustomerId ? `?c=${selectedCustomerId}` : ""}`}
            className="rounded-md px-3 py-2 text-sm underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear filters
          </Link>
        )}
      </form>

      {/* ── Split pane ────────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* ── List (left) ─────────────────────────────────────────────── */}
        <div className={selectedCustomerId ? "hidden lg:block" : ""}>
          {rows.length === 0 ? (
            <Card>
              {q ? (
                <EmptyState
                  title="No messages match your search"
                  description="Try a different keyword or clear the filters."
                  actionHref={`/t/${slug}/messages`}
                  actionLabel="Clear filters"
                />
              ) : view === "unread" ? (
                <EmptyState
                  title="Inbox zero 🎉"
                  description="No unread portal messages. Switch to All to browse history."
                  actionHref={viewHref("all")}
                  actionLabel="Browse all"
                />
              ) : view === "archived" ? (
                <EmptyState
                  title="Nothing archived"
                  description="Archived conversations appear here. Archive from the right pane or with the e shortcut."
                />
              ) : (
                <EmptyState
                  title="No portal messages yet"
                  description="When a customer writes to you from their portal, the conversation lands here."
                />
              )}
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="max-h-[calc(100vh-280px)] overflow-y-auto">
                {rows.map((msg, idx) => {
                  const unread = unreadByCustomer.get(msg.customerId) ?? 0;
                  const isUnread = unread > 0;
                  const isSelected = msg.customerId === selectedCustomerId;
                  const preview = truncate(msg.subject || msg.body, 100);
                  return (
                    <li
                      key={msg.customerId}
                      style={{
                        borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
                        background: isSelected
                          ? "var(--accent-surface)"
                          : isUnread
                          ? "var(--surface-0)"
                          : "transparent",
                        borderLeft: isSelected
                          ? "3px solid var(--accent-primary)"
                          : "3px solid transparent",
                      }}
                    >
                      <Link
                        href={rowHref(msg.customerId)}
                        className="block px-4 py-3 transition-colors hover:bg-[var(--surface-1)]"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={{
                              background: isUnread ? "var(--accent-surface)" : "var(--surface-2)",
                              color: isUnread ? "var(--accent-primary)" : "var(--text-muted)",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            {initials(msg.customer.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className="truncate text-sm"
                                style={{
                                  color: "var(--text-default)",
                                  fontWeight: isUnread ? 700 : 500,
                                }}
                              >
                                {msg.customer.name}
                              </span>
                              <span className="flex-shrink-0 text-[11px]" style={{ color: "var(--text-muted)" }}>
                                {formatShortDate(msg.createdAt)}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              {msg.relatedEntityType && (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                                  style={{
                                    background: "var(--surface-2)",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {msg.relatedEntityType}
                                </span>
                              )}
                              <p
                                className="truncate text-xs"
                                style={{
                                  color: isUnread ? "var(--text-default)" : "var(--text-muted)",
                                  fontWeight: isUnread ? 500 : 400,
                                }}
                              >
                                {preview}
                              </p>
                              {isUnread && (
                                <span
                                  className="ml-auto inline-flex h-4 min-w-[16px] flex-shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                                  style={{ background: "var(--danger-fg)" }}
                                >
                                  {unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        {/* ── Detail (right) ──────────────────────────────────────────── */}
        <div className={selectedCustomerId ? "" : "hidden lg:block"}>
          {!selected ? (
            <Card>
              <div className="flex h-[400px] flex-col items-center justify-center text-center">
                <div className="text-5xl" style={{ color: "var(--text-faint)" }}>💬</div>
                <p className="mt-3 text-sm font-medium" style={{ color: "var(--text-default)" }}>
                  Select a conversation
                </p>
                <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--text-muted)" }}>
                  Pick a message from the list, or press <kbd className="rounded border px-1">j</kbd> to jump to the first one.
                </p>
              </div>
            </Card>
          ) : (
            <ConversationDetail
              slug={slug}
              customer={selected.customer}
              messages={selected.messages}
              unreadCount={selected.unreadCount}
              isArchived={selected.isArchived}
              replyAction={replyAction}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail pane (server component — client bits nested inside) ─────────────
function ConversationDetail({
  slug,
  customer,
  messages,
  unreadCount,
  isArchived,
  replyAction,
}: {
  slug: string;
  customer: { id: string; name: string; email: string | null };
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    subject: string | null;
    body: string;
    createdAt: Date;
    archivedAt: Date | null;
    sender: { name: string | null } | null;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
  }>;
  unreadCount: number;
  isArchived: boolean;
  replyAction: (formData: FormData) => Promise<void>;
}) {
  const markReadAction  = markPortalMessagesRead.bind(null, slug, customer.id);
  const archiveAction   = archiveConversation.bind(null, slug, customer.id);
  const unarchiveAction = unarchiveConversation.bind(null, slug, customer.id);

  const lastInboundSubject =
    [...messages].reverse().find((m) => m.direction === "INBOUND")?.subject ?? null;
  const defaultSubject = lastInboundSubject ? `Re: ${lastInboundSubject}` : undefined;

  return (
    <Card className="overflow-hidden">
      <AutoMarkRead
        key={customer.id}
        action={markReadAction}
        unreadCount={unreadCount}
      />

      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold" style={{ color: "var(--text-default)" }}>
              {customer.name}
            </span>
            {isArchived && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              >
                Archived
              </span>
            )}
          </div>
          {customer.email && (
            <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {customer.email}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Link
            href={`/t/${slug}/customers/${customer.id}?tab=communication`}
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Open customer
          </Link>
          {isArchived ? (
            <form action={unarchiveAction}>
              <button
                id="inbox-archive-btn"
                type="submit"
                className="ts-btn-secondary rounded-md px-3 py-1.5 text-xs"
                title="Unarchive (e)"
              >
                Unarchive
              </button>
            </form>
          ) : (
            <form action={archiveAction}>
              <button
                id="inbox-archive-btn"
                type="submit"
                className="ts-btn-secondary rounded-md px-3 py-1.5 text-xs"
                title="Archive (e)"
              >
                Archive
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="max-h-[calc(100vh-480px)] space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No messages yet.
          </p>
        ) : (
          messages.map((msg) => {
            const isInbound = msg.direction === "INBOUND";
            return (
              <div
                key={msg.id}
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  background: isInbound ? "var(--surface-0)" : "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  marginLeft: isInbound ? 0 : "auto",
                  maxWidth: isInbound ? "100%" : "85%",
                }}
              >
                <div
                  className="mb-1 flex items-center justify-between gap-2 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--text-default)" }}>
                    {isInbound ? customer.name : (msg.sender?.name ?? "You")}
                    {msg.relatedEntityType && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                      >
                        Re: {msg.relatedEntityType}
                      </span>
                    )}
                  </span>
                  <span>{formatDateTime(msg.createdAt)}</span>
                </div>
                {msg.subject && (
                  <div className="mb-0.5 font-medium" style={{ color: "var(--text-default)" }}>
                    {msg.subject}
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-default)" }}>
                  {msg.body}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Reply */}
      {customer.email ? (
        <div
          className="space-y-3 px-5 py-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <InboxReplyForm
            action={replyAction}
            customerId={customer.id}
            toAddress={customer.email}
            defaultSubject={defaultSubject}
          />
        </div>
      ) : (
        <div
          className="px-5 py-3 text-xs italic"
          style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}
        >
          Add an email address to this customer to enable replies.
        </div>
      )}
    </Card>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Compact date for the list ("Today 4:32 PM", "Yesterday", "Mar 12").
function formatShortDate(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const oneDay = 86_400_000;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (diffMs < oneDay * 2) return "Yesterday";
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}
