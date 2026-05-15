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
          className="ts-focus relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
          style={{
            border: open ? "1px solid var(--border-default)" : "1px solid transparent",
            color: "var(--text-muted)",
            background: open ? "var(--surface-2)" : "transparent",
          }}
        >
          <Icon.Bell size={15} />
          {unread > 0 && (
            <span
              className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--rose-500) 96%, white 4%) 0%, var(--rose-500) 100%)",
                color: "white",
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "-0.005em",
                border: "1.5px solid var(--surface-0)",
                boxShadow:
                  "0 0 0 1px color-mix(in oklab, var(--rose-500) 50%, transparent), " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      }
    >
      <div
        className="flex items-center justify-between px-3.5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            style={{
              width: 3,
              height: 3,
              borderRadius: 1,
              background: "var(--accent-primary)",
            }}
          />
          <span
            style={{
              color: "var(--text-default)",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              lineHeight: 1.2,
            }}
          >
            Notifications
          </span>
        </div>
        {unread > 0 ? (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: "var(--rose-500)",
              background:
                "color-mix(in oklab, var(--rose-500) 14%, transparent)",
              border:
                "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
              padding: "2px 7px",
              borderRadius: 999,
              letterSpacing: "0.04em",
              fontFeatureSettings: "'tnum' 1",
              lineHeight: 1,
            }}
          >
            {unread} unread
          </span>
        ) : (
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-faint)",
              letterSpacing: "0.04em",
            }}
          >
            All caught up
          </span>
        )}
      </div>

      {recent.length === 0 ? (
        <div
          className="px-4 py-8 text-center"
          style={{ color: "var(--text-muted)", fontSize: 12.5 }}
        >
          <div
            aria-hidden
            className="mx-auto mb-2 flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
            }}
          >
            <Icon.Bell size={16} />
          </div>
          <div style={{ fontWeight: 600, color: "var(--text-default)" }}>
            You&rsquo;re all caught up
          </div>
          <div className="mt-0.5" style={{ fontSize: 11.5 }}>
            New activity will appear here.
          </div>
        </div>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {recent.map((n) => (
            <NotificationRow key={n.id} n={n} slug={slug} onClose={() => onOpenChange(false)} />
          ))}
        </ul>
      )}

      <PopoverSection>
        <div
          className="flex items-center justify-between gap-2 px-3.5 py-2.5"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--surface-0) 35%, transparent) 100%)",
          }}
        >
          {unread > 0 ? (
            <form action={markAll}>
              <button
                type="submit"
                className="ts-focus transition-colors hover:text-[color:var(--text-default)]"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                }}
              >
                Mark all read
              </button>
            </form>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>&nbsp;</span>
          )}
          <Link
            href={`/t/${slug}/inbox?chip=notifications`}
            className="ts-focus inline-flex items-center gap-1 transition-colors hover:underline"
            style={{
              color: "var(--accent-primary)",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
            onClick={() => onOpenChange(false)}
          >
            See all
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
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

  const nType = notificationColor(n.type);
  const inner = (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-1.5 shrink-0"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: unread ? nType : "transparent",
          boxShadow: unread
            ? `0 0 0 1.5px color-mix(in oklab, ${nType} 25%, transparent)`
            : "none",
        }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 999,
              color: nType,
              background: `color-mix(in oklab, ${nType} 16%, transparent)`,
              border: `1px solid color-mix(in oklab, ${nType} 32%, transparent)`,
              lineHeight: 1,
            }}
          >
            {notificationLabel(n.type)}
          </span>
          <span
            style={{
              color: "var(--text-faint)",
              fontSize: 10.5,
              fontFeatureSettings: "'tnum' 1",
            }}
          >
            {when}
          </span>
        </div>
        <div
          className="mt-1 line-clamp-2"
          style={{
            color: unread ? "var(--text-default)" : "var(--text-muted)",
            fontWeight: unread ? 600 : 500,
            fontSize: 12.5,
            lineHeight: 1.4,
            letterSpacing: "-0.005em",
          }}
        >
          {n.title}
        </div>
      </div>
    </div>
  );

  return (
    <li
      className="relative transition-colors hover:bg-[color-mix(in_oklab,var(--surface-3)_50%,transparent)]"
      style={{
        padding: "10px 14px 10px 14px",
        borderBottom: "1px solid var(--border-subtle)",
        background: unread
          ? "linear-gradient(90deg, var(--accent-surface) 0%, color-mix(in oklab, var(--accent-surface) 30%, transparent) 75%, transparent 100%)"
          : "transparent",
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
