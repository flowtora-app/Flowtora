// Page 36 §List — sortable table view of feature requests.

import Link from "next/link";
import type { FeatureRequestRow } from "@/server/platform/feature-requests";
import {
  EffortChip,
  IceChip,
  StatusPill,
  relativeFromNow,
} from "./shared";

export function RequestList({ rows }: { rows: FeatureRequestRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border p-10 text-center text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <div className="mb-1 text-2xl" aria-hidden>🗳</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          No requests match.
        </div>
      </div>
    );
  }
  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <div
        className="hidden grid-cols-[minmax(0,1fr)_120px_70px_60px_60px_120px_140px_90px] gap-3 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide md:grid"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--surface-2)",
          color: "var(--text-muted)",
        }}
      >
        <div>Title</div>
        <div>Status</div>
        <div className="text-right">Votes</div>
        <div className="text-right">ICE</div>
        <div className="text-right">Effort</div>
        <div>Release</div>
        <div>Tag / lane</div>
        <div className="text-right">Updated</div>
      </div>
      <ul>
        {rows.map((r, idx) => (
          <li
            key={r.id}
            style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/platform/operations/feature-requests/${r.id}`}
              className="grid items-start gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_120px_70px_60px_60px_120px_140px_90px]"
              style={{ color: "var(--text-default)" }}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.isPublic && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                    >
                      Public
                    </span>
                  )}
                  {r.linkedBugId && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}
                    >
                      Linked bug
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[13px] font-semibold">{r.title}</div>
                {r.description && (
                  <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {r.description.replace(/[#*`>]/g, "").slice(0, 140)}
                  </div>
                )}
                {r.submitterTenantName && (
                  <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    Submitter: {r.submitterTenantName}{r.submitterUserName && ` · ${r.submitterUserName}`}
                  </div>
                )}
              </div>
              <div><StatusPill status={r.status} /></div>
              <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                ▲ {r.upvoteCount}
                {r.downvoteCount > 0 && (
                  <span style={{ color: "var(--text-faint)" }}> · ▼ {r.downvoteCount}</span>
                )}
              </div>
              <div className="text-right">
                <IceChip score={r.iceScore} />
              </div>
              <div className="text-right">
                <EffortChip effort={r.effort} />
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {r.plannedRelease ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {r.swimlane && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)" }}
                  >
                    {r.swimlane}
                  </span>
                )}
                {r.tags.slice(0, 2).map((t) => (
                  <span
                    key={t}
                    className="rounded-full px-1.5 py-0.5 text-[10px]"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                {relativeFromNow(r.updatedAt)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
