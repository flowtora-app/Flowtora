// Center pane — ticket list. Each row links to the existing detail
// page at /platform/support/[id]. Multi-select with bulk actions is
// wired through SelectionContext (BulkActionsBar.tsx).

import Link from "next/link";
import type { TicketListRow } from "@/server/platform/support-tickets";
import {
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  STATUS_TONE,
  STATUS_LABEL,
  PRIORITY_TONE,
  PRIORITY_LABEL,
  relativeFromNow,
} from "./shared";
import { TicketCheckbox } from "./BulkActionsBar";

export function TicketsTable({
  rows,
  selectedId,
  buildHref,
}: {
  rows: TicketListRow[];
  selectedId: string | null;
  /** Build a same-search href with `selected` overridden. */
  buildHref: (overrides: Record<string, string | undefined>) => string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border p-10 text-center text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <div className="mb-1 text-2xl" aria-hidden>🎫</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          No tickets match the current view.
        </div>
        <p className="mt-1">Pick a different saved view or clear filters.</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <ul>
        {rows.map((r, idx) => {
          const status = STATUS_TONE[r.status];
          const prio = PRIORITY_TONE[r.priority];
          const isSelected = r.id === selectedId;
          return (
            <li
              key={r.id}
              style={{
                borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
                background: isSelected ? "var(--surface-2)" : "transparent",
              }}
            >
              <div className="flex items-stretch">
                <label className="flex shrink-0 items-start pl-3 pt-3.5">
                  <TicketCheckbox id={r.id} />
                </label>
                <Link
                  href={buildHref({ selected: r.id })}
                  className="flex-1 px-3 py-3 transition-colors"
                  style={{ color: "var(--text-default)" }}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <div className="flex items-start gap-2">
                    {/* Priority dot */}
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: prio.dot }}
                      title={`Priority: ${PRIORITY_LABEL[r.priority]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: status.bg, color: status.fg }}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        >
                          {CATEGORY_LABEL[r.category]}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                          title={`Channel: ${CHANNEL_LABEL[r.channel]}`}
                        >
                          {CHANNEL_LABEL[r.channel]}
                        </span>
                        {r.isLate && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{
                              background: "var(--rose-50, var(--surface-2))",
                              color: "var(--danger-fg)",
                              border: "1px solid var(--rose-200, var(--border-default))",
                            }}
                          >
                            SLA breached
                          </span>
                        )}
                        {r.isUnread && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: "var(--accent-primary)" }}
                            title="Awaiting first staff reply"
                          >
                            unread
                          </span>
                        )}
                        {(r.priority === "URGENT" || r.priority === "HIGH") && (
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: prio.text }}
                          >
                            {PRIORITY_LABEL[r.priority]}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[13px] font-semibold">{r.subject}</div>
                      {r.excerpt && (
                        <div
                          className="mt-0.5 truncate text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {r.excerpt}
                        </div>
                      )}
                      <div className="mt-1 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span style={{ color: "var(--text-default)" }}>{r.tenantName}</span>
                        <span> ({r.tenantPlan})</span>
                        {" · "}
                        <span className="font-mono">#{r.id.slice(0, 8)}</span>
                        {" · "}
                        {r.messageCount} msg{r.messageCount === 1 ? "" : "s"}
                        {r.satisfactionRating != null && (
                          <>
                            {" · "}
                            <span
                              style={{
                                color:
                                  r.satisfactionRating >= 4 ? "var(--success-fg)" :
                                  r.satisfactionRating <= 2 ? "var(--danger-fg)"  :
                                  "var(--warning-fg)",
                              }}
                            >
                              ★ {r.satisfactionRating}/5
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <div className="tabular-nums">{relativeFromNow(r.updatedAt)}</div>
                      <div className="mt-0.5">
                        {r.assigneeName ? (
                          <span style={{ color: "var(--text-muted)" }}>→ {r.assigneeName}</span>
                        ) : (
                          <span style={{ color: "var(--warning-fg)" }}>unassigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
