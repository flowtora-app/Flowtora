"use client";

import * as React from "react";

// Tenant-side delivery surface for PlatformAnnouncements.
//
// The tenant layout fetches active announcements server-side (audience
// matched, status live, not expired) and passes the rendered list down
// to this client component. The component:
//
//   • Stacks them above the workspace, color-keyed by priority
//   • Lets the user dismiss each one (tracked in localStorage so it
//     stays dismissed across reloads — no server round-trip needed)
//   • Suppresses re-display until the announcement is updated server-
//     side (we key the dismissal by id+updatedAt)
//
// CRITICAL announcements are never auto-dismissable across reloads
// without an explicit click — that's by design.

export interface AnnouncementForBanner {
  id: string;
  title: string;
  body: string;
  type: "RELEASE" | "NEW_FEATURE" | "MAINTENANCE" | "INCIDENT" | "PRICING" | "GENERAL";
  priority: "INFO" | "IMPORTANT" | "CRITICAL";
  // Updated-at timestamp encoded as ISO so a re-publish busts the dismiss key.
  updatedAtISO: string;
}

const DISMISS_KEY = "flowtora.dismissedAnnouncements.v1";

interface DismissMap {
  [id: string]: string; // id → updatedAtISO at the moment it was dismissed
}

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

  // Read existing dismissals from localStorage on mount. We delay the
  // hydration flag so SSR and the first client render look the same
  // (the banner is hidden until we've checked storage); this prevents
  // a flash-then-hide.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const parsed: DismissMap = JSON.parse(raw);
        setDismissed(parsed);
      }
    } catch {
      // localStorage unavailable (private mode, quota, etc.) — proceed
      // with empty dismiss map; the banner will reappear next session
      // but that's acceptable for v1.
    }
    setHydrated(true);
  }, []);

  const dismiss = (a: AnnouncementForBanner) => {
    const next = { ...dismissed, [a.id]: a.updatedAtISO };
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {
      // Same as above — best effort.
    }
  };

  // Filter out:
  //   • Anything dismissed at the *current* updatedAt (republish bumps
  //     updatedAt, so a re-edit reappears even if previously dismissed).
  const visible = announcements.filter((a) => dismissed[a.id] !== a.updatedAtISO);

  if (!hydrated || visible.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-3" aria-label="Platform announcements">
      {visible.map((a) => {
        const palette = PRIORITY_PALETTE[a.priority];
        const icon = TYPE_ICON[a.type];
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
              {a.body && (
                <p
                  className="mt-1 whitespace-pre-wrap text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {a.body.length > 280 ? `${a.body.slice(0, 280)}…` : a.body}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(a)}
              aria-label="Dismiss announcement"
              className="ts-focus shrink-0 rounded-md px-2 py-1 text-xs"
              style={{ color: palette.fg, opacity: 0.8 }}
              title="Dismiss until updated"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
