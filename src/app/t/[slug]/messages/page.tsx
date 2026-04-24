import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/format";
import { markAllPortalMessagesRead } from "@/app/actions/portal-messages";

// Centralized messages inbox — one row per customer conversation, ordered
// by latest inbound activity. Click-through lands on the customer's
// Communication tab which already owns the full thread + reply form.
//
// Scope: all INBOUND portal messages that haven't been archived. Each
// conversation row aggregates the latest message + unread count for that
// customer. Staff get a single place to triage "who wrote in, and what
// have I not answered yet".

type View = "unread" | "all" | "archived";

const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "unread",   label: "Unread",   hint: "Conversations with messages you haven't read yet." },
  { value: "all",      label: "All",      hint: "Every inbound conversation from the portal." },
  { value: "archived", label: "Archived", hint: "Messages you've archived out of the active inbox." },
];

export default async function MessagesInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; view?: View }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "unread";
  const q = sp.q?.trim() ?? "";

  // Latest inbound message per customer (conversation root). Prisma's
  // `distinct` on customerId with createdAt-desc ordering gives us exactly
  // that with a single query.
  const latestPerCustomer = await db.portalMessage.findMany({
    where: {
      tenantId:   ctx.tenant.id,
      direction:  "INBOUND",
      archivedAt: view === "archived" ? { not: null } : null,
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { body:    { contains: q, mode: "insensitive" } },
              { customer: { name:  { contains: q, mode: "insensitive" } } },
              { customer: { email: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    distinct: ["customerId"],
    orderBy:  { createdAt: "desc" },
    take:     100,
    select: {
      id:         true,
      customerId: true,
      subject:    true,
      body:       true,
      readAt:     true,
      createdAt:  true,
      customer: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Unread-per-customer counts for the rows we care about.
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

  // View-filter the rows after we've fetched. "unread" shows only
  // conversations with at least one unread inbound; "archived" already
  // filtered at the DB level.
  const rows = latestPerCustomer.filter((m) => {
    if (view === "unread") return (unreadByCustomer.get(m.customerId) ?? 0) > 0;
    return true;
  });

  // Totals for the view tabs (before the current filter is applied).
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

  const viewHref = (v: View) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (v !== "unread") p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/messages${qs ? `?${qs}` : ""}`;
  };

  const markAllAction = markAllPortalMessagesRead.bind(null, slug);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Messages</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {totalUnreadConvos > 0
              ? `${totalUnreadConvos} unread ${totalUnreadConvos === 1 ? "conversation" : "conversations"}`
              : "You're all caught up."}
            {" · Portal messages from all customers in one place."}
          </p>
        </div>
        {totalUnreadConvos > 0 && (
          <form action={markAllAction}>
            <button
              type="submit"
              className="ts-btn-secondary rounded-md px-3 py-2 text-sm"
            >
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

      <form className="mt-4 flex flex-wrap items-center gap-2 text-sm" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search customer name, email, or message…"
          className="flex-1 min-w-[240px] rounded-md px-3 py-2 outline-none"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        {view !== "unread" && <input type="hidden" name="view" value={view} />}
        <button type="submit" className="ts-btn-secondary rounded-md px-3 py-2">
          Search
        </button>
        {(q || view !== "unread") && (
          <Link
            href={`/t/${slug}/messages`}
            className="rounded-md px-3 py-2 text-sm underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card className="mt-6">
          {q ? (
            <EmptyState
              title="No messages match your search"
              description="Try a different keyword or clear the search."
              actionHref={`/t/${slug}/messages`}
              actionLabel="Clear search"
            />
          ) : view === "unread" ? (
            <EmptyState
              title="Inbox zero 🎉"
              description="No unread portal messages. Switch to All to browse the full history."
              actionHref={viewHref("all")}
              actionLabel="Browse all conversations"
            />
          ) : view === "archived" ? (
            <EmptyState
              title="Nothing archived"
              description="Archived conversations will appear here. Archive is a per-customer action on their Communication tab."
            />
          ) : (
            <EmptyState
              title="No portal messages yet"
              description="When a customer writes to you from their portal, the conversation lands here."
            />
          )}
        </Card>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <ul>
            {rows.map((msg, idx) => {
              const unread = unreadByCustomer.get(msg.customerId) ?? 0;
              const isUnread = unread > 0;
              const preview = truncate(msg.subject || msg.body, 140);
              const href = `/t/${slug}/customers/${msg.customerId}?tab=communication`;
              return (
                <li
                  key={msg.customerId}
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
                    background: isUnread ? "var(--surface-0)" : "transparent",
                  }}
                >
                  <Link
                    href={href}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-1)]"
                  >
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                      style={{
                        background: isUnread ? "var(--accent-surface)" : "var(--surface-2)",
                        color: isUnread ? "var(--accent-primary)" : "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {initials(msg.customer.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <div
                          className="truncate text-sm"
                          style={{
                            color: "var(--text-default)",
                            fontWeight: isUnread ? 700 : 500,
                          }}
                        >
                          {msg.customer.name}
                          {msg.customer.email && (
                            <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                              {msg.customer.email}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {isUnread && (
                            <span
                              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                              style={{ background: "var(--danger-fg)" }}
                              aria-label={`${unread} unread`}
                            >
                              {unread}
                            </span>
                          )}
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatDateTime(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                      <p
                        className="mt-1 truncate text-sm"
                        style={{
                          color: isUnread ? "var(--text-default)" : "var(--text-muted)",
                          fontWeight: isUnread ? 500 : 400,
                        }}
                      >
                        {preview}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
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
