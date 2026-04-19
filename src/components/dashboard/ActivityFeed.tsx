import * as React from "react";
import Link from "next/link";
import type { ActivityItem } from "@/lib/activity";

// Phase 6 — recent activity panel.
//
// Renders the output of `loadRecentActivity()` as a vertical list of
// "Who did what, when" — actor name, verb, relative timestamp, link
// target. Dashboard puts this next to the AttentionPanel so members get
// both "what needs me" and "what's happened".
//
// Kept as a server component; formatting uses a simple relative-time
// helper that's deterministic at render time (server renders in the
// tenant's server timezone; clients see the result of that render).

const TONE_COLOR: Record<ActivityItem["tone"], string> = {
  neutral: "var(--text-muted)",
  success: "var(--success-fg)",
  warning: "var(--warning-fg, var(--accent-primary))",
  danger:  "var(--danger-fg)",
};

export function ActivityFeed({
  slug,
  items,
  title = "Recent activity",
  emptyLabel = "No activity yet. Create a customer or send a quote to get started.",
}: {
  slug: string;
  items: ActivityItem[];
  title?: string;
  emptyLabel?: string;
}) {
  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          {title}
        </h2>
      </header>
      {items.length === 0 ? (
        <p
          className="px-5 py-6 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {emptyLabel}
        </p>
      ) : (
        <ol className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {items.map((item) => (
            <ActivityRow key={item.id} slug={slug} item={item} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ActivityRow({ slug, item }: { slug: string; item: ActivityItem }) {
  const when = formatRelative(item.occurredAt);
  const actor = item.actorName ?? "Someone";
  const body = (
    <div className="flex items-start gap-3 px-5 py-3">
      <span
        aria-hidden
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: TONE_COLOR[item.tone] }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm" style={{ color: "var(--text-default)" }}>
          <span className="font-medium">{actor}</span>{" "}
          <span style={{ color: "var(--text-muted)" }}>{item.verb}</span>
        </p>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-faint)" }}>
          {when}
        </p>
      </div>
    </div>
  );
  return (
    <li>
      {item.href ? (
        <Link
          href={`/t/${slug}/${item.href}`}
          className="block transition-colors hover:brightness-110"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    return `${m}m ago`;
  }
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    return `${h}h ago`;
  }
  const days = Math.floor(ms / 86_400_000);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
