import * as React from "react";

// Vertical-timeline rendering of the tenant audit log.
//
//   ●  10 mins ago   billing       quote.created    by Jane (platform)
//   │                              · 8 fresh lines of metadata
//   │
//   ●  3 hours ago   tenant        invoice.paid     by tenant staff
//   │                              · invoice 2031 · $1,240
//   │
//   ●  Yesterday     system        cron.bill.run    system
//
// Action prefixes are categorized into rails (billing / user / system /
// platform) for one-glance filtering. Each entry shows actor and
// optional metadata extracted from the JSON column.

export interface ActivityEvent {
  id: string;
  action: string;
  createdAt: Date;
  /** Display name + role, resolved upstream from userId. */
  actorLabel: string;
  isPlatform: boolean;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
}

type Lane = "billing" | "user" | "platform" | "system";

const LANE_TONE: Record<Lane, { bg: string; fg: string; label: string }> = {
  billing:  { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "billing"  },
  user:     { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "user"     },
  platform: { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "platform" },
  system:   { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "system"   },
};

// Bucket actions into lanes by prefix. Best-effort; unknown prefixes
// fall through to "system".
function laneOf(action: string, isPlatform: boolean): Lane {
  if (isPlatform || action.startsWith("platform.")) return "platform";
  if (
    action.startsWith("invoice.") ||
    action.startsWith("payment.") ||
    action.startsWith("billing.") ||
    action.startsWith("subscription.")
  ) return "billing";
  if (
    action.startsWith("user.") ||
    action.startsWith("membership.") ||
    action.startsWith("quote.") ||
    action.startsWith("order.") ||
    action.startsWith("customer.") ||
    action.startsWith("product.")
  ) return "user";
  return "system";
}

export function TenantActivityTimeline({
  events,
  emptyText = "Nothing logged yet.",
}: {
  events: ActivityEvent[];
  emptyText?: string;
}) {
  if (events.length === 0) {
    return (
      <div
        className="rounded-xl px-5 py-8 text-center text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        {emptyText}
      </div>
    );
  }
  return (
    <ol
      className="relative space-y-0.5 rounded-xl px-5 py-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {events.map((e, idx) => (
        <TimelineRow
          key={e.id}
          event={e}
          isLast={idx === events.length - 1}
        />
      ))}
    </ol>
  );
}

function TimelineRow({ event, isLast }: { event: ActivityEvent; isLast: boolean }) {
  const lane = laneOf(event.action, event.isPlatform);
  const tone = LANE_TONE[lane];
  const ts = formatRelative(event.createdAt);
  const meta = describeMetadata(event.metadata);
  return (
    <li className="relative grid grid-cols-[24px_1fr] gap-3 py-2">
      {/* Rail dot + line */}
      <div className="relative flex flex-col items-center">
        <span
          aria-hidden
          className="z-[1] mt-1.5 inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: tone.fg, boxShadow: `0 0 0 3px ${tone.bg}` }}
        />
        {!isLast && (
          <span
            aria-hidden
            className="absolute top-3 h-full w-px"
            style={{ background: "var(--border-subtle)" }}
          />
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {tone.label}
          </span>
          <span
            className="font-mono text-xs font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            {event.action}
          </span>
          {event.entityType && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              · {event.entityType}
              {event.entityId && (
                <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                  {" "}
                  {event.entityId.slice(0, 8)}
                </span>
              )}
            </span>
          )}
          <span className="ml-auto whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
            {ts}
          </span>
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {event.actorLabel}
          {meta && <> · {meta}</>}
        </div>
      </div>
    </li>
  );
}

function formatRelative(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}

// Best-effort one-line summary of common JSON metadata shapes from the
// audit log. We don't trust the shape, so guards everywhere.
function describeMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const fragments: string[] = [];
  if (typeof m.actor === "string") fragments.push(`actor ${m.actor}`);
  if (typeof m.from === "string" && typeof m.to === "string") fragments.push(`${m.from} → ${m.to}`);
  if (typeof m.amount === "number") fragments.push(`$${m.amount.toLocaleString()}`);
  if (typeof m.reason === "string" && m.reason.length < 80) fragments.push(m.reason);
  return fragments.length > 0 ? fragments.join(" · ") : null;
}
