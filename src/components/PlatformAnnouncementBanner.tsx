"use client";

import * as React from "react";
import {
  recordAnnouncementView,
  recordAnnouncementDismissal,
} from "@/app/actions/announcements";
import { renderMarkdownLite } from "@/lib/notifications/markdown";

// Tenant-side delivery surface for PlatformAnnouncements.
//
// The tenant layout fetches active announcements server-side (audience
// matched, status live, not expired) and passes the rendered list to
// this client component. The component:
//
//   • Stacks them above the workspace, color-keyed by priority
//   • Pings recordAnnouncementView on mount per id (idempotent upsert)
//   • Lets the user dismiss each one — server-side via
//     recordAnnouncementDismissal, with optimistic local hide so the
//     UI feels instant
//   • Renders bodies through the same markdown-lite renderer used by
//     transactional emails — bold, italic, code, links, line breaks
//
// We also keep a per-update localStorage "already dismissed" map so
// repeat sessions don't re-render a banner the user already cleared
// before the server records it.

export interface AnnouncementForBanner {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  type: "RELEASE" | "NEW_FEATURE" | "MAINTENANCE" | "INCIDENT" | "PRICING" | "GENERAL";
  priority: "INFO" | "IMPORTANT" | "CRITICAL";
  // Updated-at as ISO string; a re-edit re-shows even if previously dismissed.
  updatedAtISO: string;
}

const DISMISS_KEY = "flowtora.dismissedAnnouncements.v1";
interface DismissMap { [id: string]: string }

const TYPE_ICON: Record<AnnouncementForBanner["type"], string> = {
  RELEASE:     "🚀",
  NEW_FEATURE: "✨",
  MAINTENANCE: "🔧",
  INCIDENT:    "⚠",
  PRICING:     "💲",
  GENERAL:     "📢",
};

const PRIORITY_PALETTE: Record<AnnouncementForBanner["priority"], { bg: string; fg: string; border: string }> = {
  INFO:      { bg: "var(--surface-2)",       fg: "var(--text-default)",   border: "var(--border-default)" },
  IMPORTANT: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", border: "var(--accent-primary)" },
  CRITICAL:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      border: "var(--danger-fg)"      },
};

export function PlatformAnnouncementBanner({
  announcements,
}: {
  announcements: AnnouncementForBanner[];
}) {
  const [dismissed, setDismissed] = React.useState<DismissMap>({});
  const [hydrated, setHydrated] = React.useState(false);
  // Local-only "just dismissed in this session" set. Server-side
  // dismissal lands eventually but we want the X to feel instant.
  const [optimisticHidden, setOptimisticHidden] = React.useState<Set<string>>(new Set());

  // Read existing dismissals from localStorage on mount, then ping
  // the server to record a view for each visible announcement (the
  // server upsert is idempotent so refreshes don't double-count).
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) setDismissed(JSON.parse(raw) as DismissMap);
    } catch {
      // private mode / quota — proceed empty.
    }
    setHydrated(true);
  }, []);

  // Fire view records once we know which announcements survived the
  // localStorage filter. This is fire-and-forget — we never block UI
  // on the response. Each id is recorded only once per mount.
  const recordedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!hydrated) return;
    for (const a of announcements) {
      if (dismissed[a.id] === a.updatedAtISO) continue;
      if (recordedRef.current.has(a.id)) continue;
      recordedRef.current.add(a.id);
      void recordAnnouncementView(a.id, a.tenantId);
    }
  }, [hydrated, announcements, dismissed]);

  const dismiss = (a: AnnouncementForBanner) => {
    // Local optimistic hide.
    setOptimisticHidden((prev) => {
      const next = new Set(prev);
      next.add(a.id);
      return next;
    });
    // Persist dismissal map for the next page load (catches the case
    // where the server write hasn't been committed yet).
    const nextMap = { ...dismissed, [a.id]: a.updatedAtISO };
    setDismissed(nextMap);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(nextMap));
    } catch {
      // best effort
    }
    // Server-side dismissal — fire-and-forget.
    void recordAnnouncementDismissal(a.id, a.tenantId);
  };

  const visible = announcements.filter(
    (a) => dismissed[a.id] !== a.updatedAtISO && !optimisticHidden.has(a.id),
  );

  if (!hydrated || visible.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-3" aria-label="Platform announcements">
      {visible.map((a) => {
        const palette = PRIORITY_PALETTE[a.priority];
        const icon = TYPE_ICON[a.type];
        const bodyHtml = a.body.trim() ? renderMarkdownLite(a.body) : "";
        return (
          <div
            key={a.id}
            role="status"
            className="flex items-start gap-3 rounded-md px-4 py-3 text-sm"
            style={{
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              color: palette.fg,
            }}
          >
            <span aria-hidden className="text-base leading-none">{icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold" style={{ color: "var(--text-default)" }}>
                  {a.title}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
                >
                  {a.priority.toLowerCase()}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                >
                  {a.type.replace("_", " ").toLowerCase()}
                </span>
              </div>
              {bodyHtml && (
                <div
                  className="mt-1 text-xs"
                  style={{ color: "var(--text-muted)" }}
                  // Body is already escaped + whitelist-filtered by
                  // renderMarkdownLite — safe to use here.
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(a)}
              aria-label="Dismiss announcement"
              className="ts-focus shrink-0 rounded-md px-2 py-1 text-xs"
              style={{ color: palette.fg, opacity: 0.8 }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
