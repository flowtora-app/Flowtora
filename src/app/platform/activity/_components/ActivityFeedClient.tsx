"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Badge, Button, JsonViewer, EmptyState, StatusPill } from "@/components/ui";
import type { ActivityRow, ActivitySeverity, ActivitySource } from "@/server/platform/activity-feed";

// ActivityFeedClient — the live, infinite-scrolling feed body.
//
// Owns:
//   • Live polling — fetches `?after=<lastSeen>` and prepends new
//     rows. Pauses when the user has scrolled past the top, when
//     manual pause is set, or when the tab is hidden. Polling
//     interval scales up on consecutive errors to protect the
//     server.
//   • Infinite scroll — IntersectionObserver on a sentinel triggers
//     `?before=<oldestSeen>` for the next page. Capped at MAX_ROWS
//     so the in-memory list never grows unbounded.
//   • Expand-to-detail — each row clicks open the metadata JSON,
//     IP/user-agent, and entity link inline.
//   • Grouping — flat / hour / tenant / event-type pivots.
//   • Date dividers — sticky "Today / Yesterday / Tuesday Apr 28"
//     headings that appear at the right boundary in flat view.
//
// Memory hygiene matters here — early versions of this file polled
// every 5s with take=200 and had no upper bound on the rows array,
// which OOM'd long-lived tabs. The constants below cap both axes.

/** Default poll interval. 30s feels live but doesn't hammer the
 *  server — admins are using this to catch new events, not as a
 *  millisecond-precision dashboard. */
const POLL_MS_BASE = 30_000;
/** Max poll interval after consecutive errors. */
const POLL_MS_MAX  = 120_000;
/** Max events to fetch in a single live-poll round trip. */
const POLL_TAKE    = 50;
/** Max events to fetch in a single infinite-scroll page. */
const PAGE_SIZE    = 50;
/** Hard cap on rows kept in client memory at any time. We trim the
 *  oldest beyond this — infinite scroll stops loading when we're at
 *  the cap. Default sized so a long-lived tab stays under ~50MB. */
const MAX_ROWS     = 300;
/** Hard cap on the pendingBuffer so a user who scrolled away an
 *  hour ago doesn't accumulate 10k events in memory. */
const MAX_PENDING  = 200;

type Group = "flat" | "hour" | "tenant" | "type";

export interface ActivityFeedClientProps {
  /** Initial page rendered server-side. */
  initialRows: ActivityRow[];
  /** The serialized filter querystring — used as the cache key for
   *  the live + infinite fetches. */
  filterQs: string;
  /** Cursor for the next infinite-scroll page (oldest createdAt). */
  initialCursor: string | null;
}

export function ActivityFeedClient({
  initialRows,
  filterQs,
  initialCursor,
}: ActivityFeedClientProps) {
  const [rows, setRows] = React.useState<ActivityRow[]>(initialRows);
  const [cursor, setCursor] = React.useState<string | null>(initialCursor);
  const [loading, setLoading] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [pendingNew, setPendingNew] = React.useState(0);
  const [group, setGroup] = React.useState<Group>("flat");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const newestRef = React.useRef<string | null>(initialRows[0]?.createdAtIso ?? null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  const scrollAtTopRef = React.useRef(true);

  // Reset when filters change — server gives us fresh initialRows
  // but the in-component state (cursor, expansions, pendingNew)
  // needs to follow.
  React.useEffect(() => {
    setRows(initialRows);
    setCursor(initialCursor);
    setExpanded(new Set());
    setPendingNew(0);
    newestRef.current = initialRows[0]?.createdAtIso ?? null;
  }, [filterQs, initialRows, initialCursor]);

  /* Live polling */
  React.useEffect(() => {
    if (paused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    const nextDelay = (): number => {
      // Exponential backoff up to POLL_MS_MAX. Resets to base on a
      // successful tick.
      if (consecutiveErrors === 0) return POLL_MS_BASE;
      const factor = Math.min(8, 2 ** consecutiveErrors);
      return Math.min(POLL_MS_MAX, POLL_MS_BASE * factor);
    };

    const tick = async () => {
      if (cancelled) return;
      // Skip the round-trip when the tab is hidden — comes back on
      // visibilitychange handler below.
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, nextDelay());
        return;
      }
      try {
        const after = newestRef.current;
        if (!after) {
          timer = setTimeout(tick, nextDelay());
          return;
        }
        const url = `/api/platform/activity?${filterQs}&after=${encodeURIComponent(after)}&take=${POLL_TAKE}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("poll failed");
        const data = (await res.json()) as { rows: ActivityRow[] };
        consecutiveErrors = 0;
        if (cancelled) return;
        if (data.rows.length === 0) {
          timer = setTimeout(tick, nextDelay());
          return;
        }
        // The API gives newest-first.
        // If the user is at the top of the page, splice them in
        // immediately. Otherwise hold them in `pendingNew` so the
        // user can opt-in via the live pill.
        if (scrollAtTopRef.current) {
          setRows((prev) => trimRows(mergeNewer(data.rows, prev)));
          newestRef.current = data.rows[0]!.createdAtIso;
        } else {
          // Cap the pending count so the live pill doesn't claim
          // "999+ new events" when really we discarded most of them.
          setPendingNew((n) => Math.min(MAX_PENDING, n + data.rows.length));
          // Stash newest-first; cap the buffer at MAX_PENDING.
          pendingBufferRef.current = mergeNewer(data.rows, pendingBufferRef.current ?? []).slice(0, MAX_PENDING);
          newestRef.current = data.rows[0]!.createdAtIso;
        }
      } catch {
        // Bump the error counter so the next delay is longer. Don't
        // toast — a flaky network on a passive live feed isn't
        // worth interrupting the user.
        consecutiveErrors += 1;
      } finally {
        if (!cancelled) timer = setTimeout(tick, nextDelay());
      }
    };

    timer = setTimeout(tick, POLL_MS_BASE);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [filterQs, paused]);

  const pendingBufferRef = React.useRef<ActivityRow[] | null>(null);

  /* Track scroll position so we know whether to splice or stash */
  React.useEffect(() => {
    const onScroll = () => {
      scrollAtTopRef.current = window.scrollY < 240;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Resume polling once the tab becomes visible */
  React.useEffect(() => {
    const onVisibility = () => {
      // The polling loop already short-circuits when document.hidden
      // — we just need it to wake on the next tick. No-op here.
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* Infinite scroll — load more when the sentinel scrolls into view */
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || cursor == null) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loading && cursor != null) {
            void loadMore();
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loading, filterQs]);

  const loadMore = React.useCallback(async () => {
    if (cursor == null || loading) return;
    setLoading(true);
    try {
      const url = `/api/platform/activity?${filterQs}&before=${encodeURIComponent(cursor)}&take=${PAGE_SIZE}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { rows: ActivityRow[]; cursor: string | null };
      setRows((prev) => {
        const merged = prev.concat(data.rows);
        // Hit the cap → stop offering more pages so the user
        // doesn't accidentally OOM the tab. They can apply a
        // narrower filter or use Export CSV for the full set.
        if (merged.length >= MAX_ROWS) {
          setCursor(null);
          return merged.slice(0, MAX_ROWS);
        }
        return merged;
      });
      // If we didn't hit the cap above, advance the cursor.
      setCursor((prevCursor) => (prevCursor == null ? null : data.cursor));
    } catch {
      // Silent — IntersectionObserver will retry if the user keeps
      // scrolling. Showing a toast per blip would be noisy.
    } finally {
      setLoading(false);
    }
  }, [cursor, filterQs, loading]);

  const showPending = React.useCallback(() => {
    const buf = pendingBufferRef.current ?? [];
    if (buf.length > 0) {
      setRows((prev) => trimRows(mergeNewer(buf, prev)));
      pendingBufferRef.current = null;
    }
    setPendingNew(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ── Render ────────────────────────────────────────────── */

  const groups = useGroupedRows(rows, group);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
        <LiveDot paused={paused} />
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="ts-focus inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium"
          style={{
            background: paused ? "var(--rose-50)" : "var(--surface-2)",
            color: paused ? "var(--rose-700)" : "var(--text-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          {paused ? "▶ Resume live" : "⏸ Pause live"}
        </button>
        <div className="mx-2 h-5 w-px" style={{ background: "var(--border-subtle)" }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Group</span>
        <GroupTab id="flat"   active={group} onSelect={setGroup} label="Flat" />
        <GroupTab id="hour"   active={group} onSelect={setGroup} label="By hour" />
        <GroupTab id="tenant" active={group} onSelect={setGroup} label="By tenant" />
        <GroupTab id="type"   active={group} onSelect={setGroup} label="By type" />
        {pendingNew > 0 && (
          <button
            type="button"
            onClick={showPending}
            className="ts-focus ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold animate-pulse"
            style={{ background: "var(--brand-600)", color: "white" }}
          >
            ↑ {pendingNew} new {pendingNew === 1 ? "event" : "events"}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title="No events match these filters"
            description="Try clearing filters or expanding the date range. The live indicator will start streaming new events as soon as they happen."
          />
        </div>
      ) : (
        <ul>
          {groups.map((g) => (
            <li key={g.key}>
              {g.label && (
                <div
                  className="sticky top-0 z-10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur"
                  style={{
                    color: "var(--text-muted)",
                    background: "color-mix(in srgb, var(--surface-1) 88%, transparent)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  {g.label}
                  <span className="ml-2 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {g.rows.length}
                  </span>
                </div>
              )}
              <ul>
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <ActivityItem row={r} isExpanded={expanded.has(r.id)} onToggle={() => toggle(r.id)} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {cursor && rows.length < MAX_ROWS && (
        <div ref={sentinelRef} className="flex h-12 items-center justify-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          {loading ? "Loading…" : "Scroll for more"}
        </div>
      )}
      {rows.length >= MAX_ROWS && (
        <div className="flex h-12 items-center justify-center text-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          Showing {MAX_ROWS} most recent · narrow filters or use Export CSV for older events.
        </div>
      )}
      {!cursor && rows.length > 0 && rows.length < MAX_ROWS && (
        <div className="flex h-12 items-center justify-center text-[11px]" style={{ color: "var(--text-faint)" }}>
          End of feed.
        </div>
      )}
    </div>
  );
}

/* ── Item ───────────────────────────────────────────────── */

const SEVERITY_DOT: Record<ActivitySeverity, string> = {
  info:     "var(--slate-400)",
  notice:   "var(--brand-500)",
  warning:  "var(--amber-500)",
  critical: "var(--rose-500)",
};

const SOURCE_LABEL: Record<ActivitySource, string> = {
  web:        "Web",
  api:        "API",
  webhook:    "Webhook",
  system:     "System",
  background: "Background",
};

function ActivityItem({ row, isExpanded, onToggle }: { row: ActivityRow; isExpanded: boolean; onToggle: () => void }) {
  return (
    <article
      className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <Avatar size="xs" name={row.actor?.name ?? row.actor?.email ?? "System"} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onToggle}
          className="ts-focus block w-full cursor-pointer text-left"
          aria-expanded={isExpanded}
        >
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[13px]">
            <span aria-hidden style={{
              display: "inline-block", width: 6, height: 6, marginRight: 2, borderRadius: 3,
              background: SEVERITY_DOT[row.severity],
            }} />
            <span className="font-medium" style={{ color: "var(--text-default)" }}>
              {row.actor?.name ?? row.actor?.email ?? "System"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>{verbFor(row)}</span>
            {row.tenant && (
              <Link
                href={`/platform/tenants/${row.tenant.id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium hover:underline"
                style={{ color: "var(--text-default)" }}
              >
                {row.tenant.name}
              </Link>
            )}
            {row.entityType && row.entityId && (
              <span className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                · {row.entityType}:{row.entityId.slice(0, 8)}
              </span>
            )}
            <span className="ml-auto pl-2 text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>
              {formatRelative(new Date(row.createdAtIso))}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono" title={row.action}>{row.action}</span>
            <SourcePill source={row.source} />
            <SeverityPill severity={row.severity} />
            {row.ipAddress && (
              <span className="font-mono" title="IP">{row.ipAddress}</span>
            )}
            {row.userAgent && (
              <span className="truncate" style={{ maxWidth: 220 }} title={row.userAgent}>{abbreviateUa(row.userAgent)}</span>
            )}
          </div>
        </button>
        {isExpanded && (
          <div className="mt-2 space-y-2 rounded-md border p-3"
               style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
            <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="font-mono">id: {row.id}</span>
              <span className="font-mono">{row.createdAtIso}</span>
              {row.actor && (
                <span>actor: {row.actor.email}{row.actor.platformRole ? ` · ${row.actor.platformRole}` : ""}</span>
              )}
              {row.tenant && <span>tenant: {row.tenant.slug}</span>}
            </div>
            {row.metadata && Object.keys(row.metadata as Record<string, unknown>).length > 0 ? (
              <JsonViewer data={row.metadata as never} initialExpandedDepth={2} lineNumbers />
            ) : (
              <div className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                No metadata captured for this event.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {row.tenant && (
                <Link href={`/platform/tenants/${row.tenant.id}`}>
                  <Button size="xs" variant="secondary">Open tenant</Button>
                </Link>
              )}
              <Link href={`/platform/audit?action=${encodeURIComponent(row.action.split(".")[0] ?? row.action)}`}>
                <Button size="xs" variant="ghost">Open in audit log</Button>
              </Link>
              <CopyButton text={row.id} label="Copy event id" />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function verbFor(row: ActivityRow): string {
  // Strip the subject (already shown via tenant.name) and lower-case
  // the verb for an inline-readable summary.
  const parts = row.action.split(".");
  const verb = parts.slice(1).join(" ").replace(/_/g, " ");
  return verb ? verb : row.action;
}

function SourcePill({ source }: { source: ActivitySource }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 text-[10px] uppercase tracking-wide"
      style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

function SeverityPill({ severity }: { severity: ActivitySeverity }) {
  if (severity === "info") return null;
  const palette =
    severity === "critical" ? { bg: "var(--rose-50)",   fg: "var(--rose-700)" }   :
    severity === "warning"  ? { bg: "var(--amber-50)",  fg: "var(--amber-700)" }  :
                              { bg: "var(--brand-50)",  fg: "var(--brand-700)" };
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {severity}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

function LiveDot({ paused }: { paused: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: paused ? "var(--text-muted)" : "var(--emerald-700)" }}>
      <span
        aria-hidden
        className={paused ? undefined : "ts-activity-live-pulse"}
        style={{
          width: 8, height: 8, borderRadius: 4,
          background: paused ? "var(--slate-400)" : "var(--emerald-500)",
        }}
      />
      <span>{paused ? "Paused" : "Live"}</span>
    </span>
  );
}

function GroupTab({ id, active, onSelect, label }: { id: Group; active: Group; onSelect: (g: Group) => void; label: string }) {
  const isActive = id === active;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="ts-focus inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium"
      style={{
        background: isActive ? "var(--surface-2)" : "transparent",
        color: isActive ? "var(--text-default)" : "var(--text-muted)",
        border: `1px solid ${isActive ? "var(--border-default)" : "transparent"}`,
      }}
    >
      {label}
    </button>
  );
}

/* ── Grouping ───────────────────────────────────────────── */

function useGroupedRows(rows: ActivityRow[], group: Group): { key: string; label: string | null; rows: ActivityRow[] }[] {
  return React.useMemo(() => {
    if (rows.length === 0) return [];
    if (group === "flat") {
      // Date-divider grouping: Today / Yesterday / weekday short.
      const out: { key: string; label: string; rows: ActivityRow[] }[] = [];
      let current: { key: string; label: string; rows: ActivityRow[] } | null = null;
      for (const r of rows) {
        const label = dayLabel(new Date(r.createdAtIso));
        if (!current || current.label !== label) {
          current = { key: label, label, rows: [] };
          out.push(current);
        }
        current.rows.push(r);
      }
      return out;
    }
    if (group === "hour") {
      const out: { key: string; label: string; rows: ActivityRow[] }[] = [];
      let current: { key: string; label: string; rows: ActivityRow[] } | null = null;
      for (const r of rows) {
        const d = new Date(r.createdAtIso);
        const label = `${dayLabel(d)} · ${d.getHours().toString().padStart(2, "0")}:00`;
        if (!current || current.label !== label) {
          current = { key: label, label, rows: [] };
          out.push(current);
        }
        current.rows.push(r);
      }
      return out;
    }
    if (group === "tenant") {
      const buckets = new Map<string, { key: string; label: string; rows: ActivityRow[] }>();
      for (const r of rows) {
        const k = r.tenant?.id ?? "__platform";
        const label = r.tenant?.name ?? "— Platform-only —";
        if (!buckets.has(k)) buckets.set(k, { key: k, label, rows: [] });
        buckets.get(k)!.rows.push(r);
      }
      return Array.from(buckets.values()).sort((a, b) => b.rows.length - a.rows.length);
    }
    // group === "type"
    const buckets = new Map<string, { key: string; label: string; rows: ActivityRow[] }>();
    for (const r of rows) {
      const prefix = r.action.split(".")[0] ?? r.action;
      const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      if (!buckets.has(prefix)) buckets.set(prefix, { key: prefix, label, rows: [] });
      buckets.get(prefix)!.rows.push(r);
    }
    return Array.from(buckets.values()).sort((a, b) => b.rows.length - a.rows.length);
  }, [rows, group]);
}

/* ── Helpers ───────────────────────────────────────────── */

function mergeNewer(newer: ActivityRow[], existing: ActivityRow[]): ActivityRow[] {
  // Cheap dedupe by id — both arrays come from the same source so
  // collisions are rare but we'd rather pay one Set lookup per row
  // than render duplicate keys.
  const seen = new Set(existing.map((r) => r.id));
  const merged = [...newer.filter((r) => !seen.has(r.id)), ...existing];
  return merged.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

/** Cap an array of rows at MAX_ROWS, keeping the newest. Older rows
 *  fall off the bottom — the user can re-apply a narrower filter or
 *  use Export CSV to access them. */
function trimRows(rows: ActivityRow[]): ActivityRow[] {
  if (rows.length <= MAX_ROWS) return rows;
  return rows.slice(0, MAX_ROWS);
}

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 0 && diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)  return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m ago`;
  if (ms < day)  return `${Math.floor(ms / hour)}h ago`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
  return d.toLocaleDateString();
}

function abbreviateUa(ua: string): string {
  // We don't ship a UA parser; pull out the first chunk that looks
  // like a browser name + version.
  const m = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|Gecko|curl|node)[\/\s]([\d.]+)/i);
  if (m) return `${m[1]} ${m[2]}`;
  // Fall back to the first 36 chars.
  return ua.slice(0, 36);
}

// Tiny type re-export so the page doesn't need a separate import path.
export { type ActivityRow, type ActivitySeverity, type ActivitySource } from "@/server/platform/activity-feed";
// Re-exported StatusPill so future consumers can pick them up from
// this module without a second import. Suppress unused-var: types
// in the JSX above don't reference StatusPill directly.
void StatusPill;
void Badge;
