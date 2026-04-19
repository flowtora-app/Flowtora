"use client";

import Link from "next/link";
import { Icon } from "./icons";
import { Popover, PopoverSection } from "./Popover";
import { notificationColor, notificationLabel } from "@/lib/notifications";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

// Phase 16 — header bell becomes a quick-preview popover.
//
// Shows up to 8 most recent notifications (unread first), each row
// links to the underlying entity and dismisses the unread badge.
// Footer: "Mark all read" + "See all" deep link to the notifications
// page with any active filter cleared.
//
// Server-rendered state (unread count + preview rows) is computed in
// the tenant layout and passed in; the menu itself is dumb and does
// not refetch on open.

export type NotificationPreview = {
  id:        string;
  type:      string;
  title:     string;
  link:      string | null;
  readAt:    Date | null;
  createdAt: Date;
};

export function NotificationsMenu({
  slug,
  unread,
  recent,
  open,
  onOpenChange,
}: {
  slug: string;
  unread: number;
  recent: NotificationPreview[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const markAll = markAllNotificationsRead.bind(null, slug);

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="end"
      width={360}
      trigger={
        <button
          type="button"
          aria-label="Notifications"
          title={unread > 0 ? `${unread} unread` : "Notifications"}
          onClick={() => onOpenChange(!open)}
          className="ts-focus relative inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:brightness-110"
          style={{
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
            background: "var(--surface-1)",
          }}
        >
          <Icon.Bell size={15} />
          {unread > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold"
              style={{ background: "var(--danger)", color: "white" }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      }
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
          Notifications
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {unread} unread
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          You&rsquo;re all caught up.
        </div>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {recent.map((n) => (
            <NotificationRow key={n.id} n={n} slug={slug} onClose={() => onOpenChange(false)} />
          ))}
        </ul>
      )}

      <PopoverSection>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          {unread > 0 ? (
            <form action={markAll}>
              <button
                type="submit"
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Mark all read
              </button>
            </form>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>&nbsp;</span>
          )}
          <Link
            href={`/t/${slug}/notifications`}
            className="text-xs font-medium underline"
            style={{ color: "var(--accent-primary)" }}
            onClick={() => onOpenChange(false)}
          >
            See all →
          </Link>
        </div>
      </PopoverSection>
    </Popover>
  );
}

function NotificationRow({
  n,
  slug,
  onClose,
}: {
  n: NotificationPreview;
  slug: string;
  onClose: () => void;
}) {
  const unread = !n.readAt;
  const markRead = markNotificationRead.bind(null, slug, n.id);
  const when = shortRelativeTime(n.createdAt);

  const inner = (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: unread ? notificationColor(n.type) : "transparent" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: notificationColor(n.type), color: "white" }}
          >
            {notificationLabel(n.type)}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
            {when}
          </span>
        </div>
        <div
          className="mt-0.5 line-clamp-2 text-sm"
          style={{
            color: unread ? "var(--text-default)" : "var(--text-muted)",
            fontWeight: unread ? 500 : 400,
          }}
        >
          {n.title}
        </div>
      </div>
    </div>
  );

  return (
    <li
      className="px-3 py-2 transition-colors hover:bg-[color:var(--surface-3)]"
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        background: unread ? "var(--accent-surface)" : "transparent",
      }}
    >
      {/* Wrap in link if available; otherwise just render the content */}
      {n.link ? (
        <Link
          href={n.link}
          className="block"
          onClick={() => {
            // Fire-and-forget mark-as-read on navigation. Server action
            // revalidates the layout so the bell count updates by the
            // time the destination page mounts.
            onClose();
            if (unread) void markRead();
          }}
        >
          {inner}
        </Link>
      ) : (
        <div>
          {inner}
          {unread && (
            <form action={markRead} className="mt-1">
              <button
                type="submit"
                className="text-[10px] underline"
                style={{ color: "var(--text-faint)" }}
              >
                Mark read
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

function shortRelativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return d.toISOString().slice(0, 10);
}
