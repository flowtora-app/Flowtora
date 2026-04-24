import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { formatDateTime, relativeDays } from "@/lib/format";
import { notificationColor, notificationLabel } from "@/lib/notifications";
import {
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  clearReadNotifications,
} from "@/app/actions/notifications";
import type { Prisma } from "@prisma/client";

// Notifications chip — per-user in-app event feed. 9 domain chips +
// unread/all views. Ported from /t/[slug]/notifications with URL params
// rewrapped under chip=notifications.

const DOMAIN_GROUPS = [
  { value: "all",        label: "All",          prefixes: [] as string[] },
  { value: "customer",   label: "Customer",     prefixes: ["portal.", "share."] },
  { value: "proofs",     label: "Proofs",       prefixes: ["proof."] },
  { value: "production", label: "Production",   prefixes: ["stage.", "task.", "defect."] },
  { value: "installs",   label: "Installs",     prefixes: ["install."] },
  { value: "financial",  label: "Financial",    prefixes: ["payment.", "refund.", "credit.", "writeoff.", "expense."] },
  { value: "reminders",  label: "Reminders",    prefixes: ["reminder."] },
  { value: "mentions",   label: "Mentions",     prefixes: ["comment."] },
  { value: "support",    label: "Support",      prefixes: ["support."] },
] as const;

type DomainValue = (typeof DOMAIN_GROUPS)[number]["value"];

function buildLink(slug: string, view: string, domain: DomainValue): string {
  const params = new URLSearchParams();
  params.set("chip", "notifications");
  if (view !== "unread") params.set("view", view);
  if (domain !== "all")  params.set("domain", domain);
  return `/t/${slug}/inbox?${params.toString()}`;
}

export async function InboxNotificationsView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Record<string, string | undefined>;
}) {
  const ctx = await requireTenant(slug);
  const view = searchParams.view === "all" ? "all" : "unread";
  const domain: DomainValue = (DOMAIN_GROUPS.map((d) => d.value) as string[]).includes(searchParams.domain ?? "")
    ? (searchParams.domain as DomainValue)
    : "all";

  const domainDef = DOMAIN_GROUPS.find((d) => d.value === domain)!;
  const domainWhere: Prisma.NotificationWhereInput = domainDef.prefixes.length
    ? { OR: domainDef.prefixes.map((p) => ({ type: { startsWith: p } })) }
    : {};

  const baseWhere: Prisma.NotificationWhereInput = {
    tenantId: ctx.tenant.id,
    userId:   ctx.userId,
    ...domainWhere,
  };

  const [items, unreadTotal, allTotal, domainCounts] = await Promise.all([
    db.notification.findMany({
      where: {
        ...baseWhere,
        ...(view === "unread" ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take:    100,
    }),
    db.notification.count({ where: { ...baseWhere, readAt: null } }),
    db.notification.count({ where: baseWhere }),
    db.notification.groupBy({
      by:     ["type"],
      where:  { tenantId: ctx.tenant.id, userId: ctx.userId, readAt: null },
      _count: { _all: true },
    }),
  ]);

  const unreadByDomain = new Map<DomainValue, number>();
  for (const group of DOMAIN_GROUPS) unreadByDomain.set(group.value, 0);
  let totalUnread = 0;
  for (const row of domainCounts) {
    totalUnread += row._count._all;
    for (const group of DOMAIN_GROUPS) {
      if (group.value === "all") continue;
      if (group.prefixes.some((p) => row.type.startsWith(p))) {
        unreadByDomain.set(group.value, (unreadByDomain.get(group.value) ?? 0) + row._count._all);
        break;
      }
    }
  }
  unreadByDomain.set("all", totalUnread);

  const markAll   = markAllNotificationsRead.bind(null, slug);
  const clearRead = clearReadNotifications.bind(null, slug);

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {unreadTotal} unread · {allTotal} total
        {domain !== "all" ? ` · ${domainDef.label.toLowerCase()} only` : ""}
      </p>

      {/* Domain filter chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {DOMAIN_GROUPS.map((g) => {
          const active = domain === g.value;
          const count = unreadByDomain.get(g.value) ?? 0;
          return (
            <Link
              key={g.value}
              href={buildLink(slug, view, g.value)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                background: active ? "var(--accent-primary)" : "transparent",
                color:      active ? "white" : "var(--text-muted)",
                border:     `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
              }}
            >
              <span>{g.label}</span>
              {count > 0 && (
                <span
                  className="rounded-full px-1.5 text-[10px] font-semibold"
                  style={{
                    background: active ? "rgba(255,255,255,0.2)" : "var(--surface-1)",
                    color:      active ? "white" : "var(--text-default)",
                  }}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-sm">
          <Link
            href={buildLink(slug, "unread", domain)}
            className="rounded-md px-3 py-1.5"
            style={{
              background: view === "unread" ? "var(--accent-primary)" : "transparent",
              color:      view === "unread" ? "white" : "var(--text-muted)",
              border:     "1px solid var(--border-default)",
            }}
          >
            Unread ({unreadTotal})
          </Link>
          <Link
            href={buildLink(slug, "all", domain)}
            className="rounded-md px-3 py-1.5"
            style={{
              background: view === "all" ? "var(--accent-primary)" : "transparent",
              color:      view === "all" ? "white" : "var(--text-muted)",
              border:     "1px solid var(--border-default)",
            }}
          >
            All ({allTotal})
          </Link>
        </div>
        <div className="flex gap-2">
          {unreadTotal > 0 && (
            <form action={markAll}>
              <Button type="submit" variant="secondary">Mark all as read</Button>
            </form>
          )}
          {allTotal - unreadTotal > 0 && (
            <form action={clearRead}>
              <Button type="submit" variant="secondary">Clear read</Button>
            </form>
          )}
        </div>
      </div>

      <Card>
        <CardHeader title={view === "unread" ? "Unread" : "All notifications"} />
        <ul>
          {items.length === 0 && (
            <li className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              {view === "unread" ? "You're all caught up." : "No notifications yet."}
            </li>
          )}
          {items.map((n) => {
            const markRead = markNotificationRead.bind(null, slug, n.id);
            const dismiss  = dismissNotification.bind(null, slug, n.id);
            const unread   = !n.readAt;
            return (
              <li
                key={n.id}
                className="px-5 py-3"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  background: unread ? "rgba(79, 140, 255, 0.05)" : "transparent",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: notificationColor(n.type), color: "white" }}
                      >
                        {notificationLabel(n.type)}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {relativeDays(n.createdAt) ?? formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1">
                      {n.link ? (
                        <Link href={n.link} className="text-sm font-medium underline">
                          {n.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium">{n.title}</span>
                      )}
                    </div>
                    {n.body && (
                      <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                        {n.body}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unread && (
                      <form action={markRead}>
                        <button
                          type="submit"
                          className="text-xs underline"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Mark read
                        </button>
                      </form>
                    )}
                    <form action={dismiss}>
                      <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
