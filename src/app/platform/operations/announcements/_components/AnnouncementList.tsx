// Center pane — announcement list. Each row links to the editor at
// /platform/operations/announcements/[id].

import Link from "next/link";
import type { AnnouncementListRow } from "@/server/platform/announcements";
import {
  AUDIENCE_LABEL,
  ChannelChip,
  CHANGELOG_CATEGORY_LABEL,
  CHANGELOG_CATEGORY_TONE,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  TYPE_TONE,
  formatDateTime,
  relativeFromNow,
} from "./shared";

export function AnnouncementList({ rows }: { rows: AnnouncementListRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border p-10 text-center text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <div className="mb-1 text-2xl" aria-hidden>📢</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          Nothing to show in this tab.
        </div>
        <p className="mt-1">Try a different tab or clear filters.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <ul>
        {rows.map((r, idx) => {
          const status = STATUS_TONE[r.status];
          const tone = TYPE_TONE[r.type];
          const ctr = r.views === 0 ? null : r.clicks / r.views;
          const dismissalRate = r.views === 0 ? null : r.dismissals / r.views;
          const isLiveOrScheduled = r.status === "PUBLISHED" || r.status === "SCHEDULED";
          return (
            <li
              key={r.id}
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
            >
              <Link
                href={`/platform/operations/announcements/${r.id}`}
                className="block px-4 py-3 transition-colors hover:opacity-95"
                style={{ color: "var(--text-default)" }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: status.bg, color: status.fg }}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.isLive && (
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--success-fg)" }}
                      title="Currently live"
                    />
                  )}
                  {r.isExpired && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
                    >
                      Expired
                    </span>
                  )}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {TYPE_LABEL[r.type]}
                  </span>
                  {r.priority !== "INFO" && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: r.priority === "CRITICAL"
                          ? "var(--danger-surface, var(--surface-2))"
                          : "var(--accent-surface)",
                        color: r.priority === "CRITICAL" ? "var(--danger-fg)" : "var(--accent-primary)",
                      }}
                    >
                      {PRIORITY_LABEL[r.priority]}
                    </span>
                  )}
                  {r.changelogCategory && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: CHANGELOG_CATEGORY_TONE[r.changelogCategory].bg,
                        color: CHANGELOG_CATEGORY_TONE[r.changelogCategory].fg,
                      }}
                    >
                      {CHANGELOG_CATEGORY_LABEL[r.changelogCategory]}
                    </span>
                  )}
                </div>

                <div className="mt-1 truncate text-[13px] font-semibold">
                  {r.title || (
                    <span style={{ color: "var(--text-faint)" }}>Untitled announcement</span>
                  )}
                </div>

                {r.channels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.channels.map((c) => <ChannelChip key={c} channel={c} />)}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <span>
                    Audience:{" "}
                    <span style={{ color: "var(--text-default)" }}>
                      {AUDIENCE_LABEL[r.audience]}
                    </span>
                  </span>
                  <span>
                    {isLiveOrScheduled
                      ? <>Goes live: <span style={{ color: "var(--text-default)" }}>{formatDateTime(r.publishAt ?? r.publishedAt)}</span></>
                      : <>Updated: <span style={{ color: "var(--text-default)" }}>{relativeFromNow(r.updatedAt)}</span></>}
                  </span>
                  {r.expireAt && (
                    <span>
                      Expires: <span style={{ color: "var(--text-default)" }}>{formatDateTime(r.expireAt)}</span>
                    </span>
                  )}
                  {r.authorName && (
                    <span>
                      By: <span style={{ color: "var(--text-default)" }}>{r.authorName}</span>
                    </span>
                  )}
                  {r.emailedAt && (
                    <span>
                      Emailed {r.emailedRecipientCount.toLocaleString()} ·{" "}
                      <span style={{ color: "var(--text-default)" }}>{relativeFromNow(r.emailedAt)}</span>
                    </span>
                  )}
                </div>

                {(r.views > 0 || r.clicks > 0 || r.dismissals > 0) && (
                  <div
                    className="mt-2 grid gap-3 rounded-md border px-3 py-1.5 text-[11px] md:grid-cols-3"
                    style={{
                      background: "var(--surface-1)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>
                      Views: <span className="tabular-nums" style={{ color: "var(--text-default)" }}>{r.views.toLocaleString()}</span>
                    </span>
                    <span>
                      CTR: <span className="tabular-nums" style={{ color: ctr != null && ctr >= 0.05 ? "var(--success-fg)" : "var(--text-default)" }}>
                        {ctr == null ? "—" : `${(ctr * 100).toFixed(1)}%`}
                      </span>
                      {" "}({r.clicks.toLocaleString()})
                    </span>
                    <span>
                      Dismissed: <span className="tabular-nums" style={{ color: dismissalRate != null && dismissalRate >= 0.5 ? "var(--warning-fg)" : "var(--text-default)" }}>
                        {dismissalRate == null ? "—" : `${(dismissalRate * 100).toFixed(0)}%`}
                      </span>
                      {" "}({r.dismissals.toLocaleString()})
                    </span>
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
