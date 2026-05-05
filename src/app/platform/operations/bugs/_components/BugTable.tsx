// Bug list table — Page 37 §Table.

import Link from "next/link";
import type { BugRow } from "@/server/platform/bugs";
import {
  EnvBadge,
  MODULE_LABEL,
  SeverityPill,
  StatusPill,
  relativeFromNow,
} from "./shared";

export function BugTable({ rows }: { rows: BugRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border p-10 text-center text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <div className="mb-1 text-2xl" aria-hidden>🐞</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          No bugs match.
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
        className="hidden grid-cols-[60px_minmax(0,1fr)_70px_120px_100px_140px_140px_120px_90px] gap-3 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide md:grid"
        style={{
          borderColor: "var(--border-subtle)",
          background: "var(--surface-2)",
          color: "var(--text-muted)",
        }}
      >
        <div>#</div>
        <div>Title</div>
        <div>Severity</div>
        <div>Status</div>
        <div>Module</div>
        <div>Reporter</div>
        <div>Tenant impacted</div>
        <div>Assignee</div>
        <div className="text-right">Updated</div>
      </div>
      <ul>
        {rows.map((r, idx) => (
          <li
            key={r.id}
            style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/platform/operations/bugs/${r.id}`}
              className="grid items-start gap-3 px-3 py-3 md:grid-cols-[60px_minmax(0,1fr)_70px_120px_100px_140px_140px_120px_90px]"
              style={{ color: "var(--text-default)" }}
            >
              <div className="text-[12px] font-mono" style={{ color: "var(--text-muted)" }}>
                #{r.number}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <EnvBadge env={r.environment} />
                  {r.linkedSentryIssueId && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                      }}
                      title={`Sentry · ${r.linkedSentryIssueId}`}
                    >
                      📡 Sentry
                    </span>
                  )}
                  {r.linkedLinearIssueId && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                    >
                      ↗ Linear
                    </span>
                  )}
                  {r.linkedJiraIssueId && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                    >
                      ↗ Jira
                    </span>
                  )}
                  {r.duplicateOfId && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
                    >
                      Duplicate
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
                <div className="mt-0.5 truncate text-[13px] font-semibold">{r.title}</div>
                {r.impactedTenantCount > 0 && (
                  <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Impacts {r.impactedTenantCount} tenant{r.impactedTenantCount === 1 ? "" : "s"}
                  </div>
                )}
              </div>
              <div><SeverityPill severity={r.severity} /></div>
              <div><StatusPill status={r.status} /></div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {MODULE_LABEL[r.module]}
              </div>
              <div className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                {r.reporterUserName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                {r.reporterTenantName && (
                  <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    via {r.reporterTenantName}
                  </div>
                )}
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {r.reporterTenantName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
              </div>
              <div className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                {r.assigneeUserName ?? <span style={{ color: "var(--warning-fg)" }}>unassigned</span>}
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
