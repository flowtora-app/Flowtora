"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Drawer } from "./Drawer";

// NotificationCenter — Spec Page 0 §0.5.46.
//
// Slide-over right, 400px wide. Header: "Notifications" + tabs (All,
// Unread, Mentions) + "Mark all read" + settings icon. Body grouped
// by date (Today, Yesterday, Earlier this week, Older). Empty:
// "You're all caught up" with check illustration. Footer: "View all
// notifications" link.

export interface NotificationItem {
  id: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** When unread, the item gets a brand-50 bg + dot indicator. */
  unread?: boolean;
  /** Group flag for the Mentions tab. */
  mention?: boolean;
  createdAt: Date;
  /** Optional avatar / icon slot. */
  icon?: React.ReactNode;
  /** Per-item callbacks. */
  onMarkRead?: () => void;
  onSnooze?: () => void;
  onDismiss?: () => void;
  /** Click handler for the row. */
  onClick?: () => void;
}

export interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  items: NotificationItem[];
  onMarkAllRead?: () => void;
  onOpenSettings?: () => void;
  /** "View all notifications" link in the footer. */
  viewAllHref?: string;
  className?: string;
}

type Tab = "all" | "unread" | "mentions";

export function NotificationCenter({
  open,
  onOpenChange,
  items,
  onMarkAllRead,
  onOpenSettings,
  viewAllHref,
  className,
}: NotificationCenterProps) {
  const [tab, setTab] = React.useState<Tab>("all");

  const filtered = items.filter((it) => {
    if (tab === "unread") return it.unread;
    if (tab === "mentions") return it.mention;
    return true;
  });

  const grouped = groupByDate(filtered);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      size="sm"
      title="Notifications"
      showHeader={false}
      className={className}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-default)" }}>Notifications</h2>
            <div className="flex items-center gap-1">
              {onMarkAllRead && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Mark all read
                </button>
              )}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  aria-label="Notification settings"
                  className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  ⚙
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                ×
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1">
            {(["all", "unread", "mentions"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="ts-focus rounded-md px-2.5 py-1 text-[12px] font-medium"
                style={{
                  background: tab === t ? "var(--surface-2)" : "transparent",
                  color: tab === t ? "var(--text-default)" : "var(--text-muted)",
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <EmptyAllCaughtUp />
          ) : (
            grouped.map(([group, list]) => (
              <div key={group}>
                <div className="px-4 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {group}
                </div>
                <ul>
                  {list.map((item) => (
                    <NotifRow key={item.id} item={item} />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {viewAllHref && (
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: "var(--border-subtle)" }}>
            <a
              href={viewAllHref}
              className="ts-focus text-[12px] font-medium"
              style={{ color: "var(--accent-primary)" }}
            >
              View all notifications →
            </a>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function NotifRow({ item }: { item: NotificationItem }) {
  return (
    <li
      className="border-b px-4 py-3"
      style={{
        borderColor: "var(--border-subtle)",
        background: item.unread ? "var(--brand-50, var(--accent-surface))" : "transparent",
      }}
    >
      <div className="flex items-start gap-3">
        {item.icon && <span className="inline-flex shrink-0">{item.icon}</span>}
        <button
          type="button"
          onClick={item.onClick}
          className="ts-focus flex-1 text-left text-[13px]"
          style={{ color: "var(--text-default)" }}
        >
          <div className="flex items-center gap-2">
            {item.unread && (
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: "var(--brand-600, var(--accent-primary))", display: "inline-block" }} />
            )}
            <span className="font-medium">{item.title}</span>
          </div>
          {item.body && (
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{item.body}</div>
          )}
          <div className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
            {formatRelative(item.createdAt)}
          </div>
        </button>
        <div className="flex items-center gap-1">
          {item.unread && item.onMarkRead && (
            <button type="button" onClick={item.onMarkRead} aria-label="Mark read" className="ts-focus rounded p-1 text-[11px]" style={{ color: "var(--text-muted)" }}>✓</button>
          )}
          {item.onDismiss && (
            <button type="button" onClick={item.onDismiss} aria-label="Dismiss" className="ts-focus rounded p-1 text-[11px]" style={{ color: "var(--text-muted)" }}>×</button>
          )}
        </div>
      </div>
    </li>
  );
}

function EmptyAllCaughtUp() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center" style={{ color: "var(--text-muted)" }}>
      <span aria-hidden style={{ fontSize: 32 }}>✓</span>
      <div className="mt-2 text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>You&rsquo;re all caught up</div>
      <div className="mt-1 text-[12px]">Nothing new to look at.</div>
    </div>
  );
}

function groupByDate(items: NotificationItem[]): [string, NotificationItem[]][] {
  const today = new Date();
  const todayKey = startOfDay(today).getTime();
  const yKey = todayKey - 86_400_000;
  const weekKey = todayKey - 7 * 86_400_000;

  const groups = new Map<string, NotificationItem[]>();
  for (const it of items) {
    const k = startOfDay(it.createdAt).getTime();
    let label: string;
    if (k === todayKey) label = "Today";
    else if (k === yKey) label = "Yesterday";
    else if (k > weekKey) label = "Earlier this week";
    else label = "Older";
    const arr = groups.get(label) ?? [];
    arr.push(it);
    groups.set(label, arr);
  }
  return [...groups.entries()];
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m ago`;
  if (ms < day) return `${Math.floor(ms / hour)}h ago`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
  return d.toLocaleDateString();
}
