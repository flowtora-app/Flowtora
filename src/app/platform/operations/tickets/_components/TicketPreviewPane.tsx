// Right rail — preview of the selected ticket. Shows the requester +
// tenant context cards, the first message, SLA panel, and a link to
// the full detail page where reply / status changes are wired up.

import Link from "next/link";
import type { TicketPreview } from "@/server/platform/support-tickets";
import {
  CATEGORY_LABEL,
  MODULE_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  formatDurationShort,
  relativeFromNow,
} from "./shared";

const DAY = 86_400_000;

export function TicketPreviewPane({ ticket }: { ticket: TicketPreview | null }) {
  if (!ticket) {
    return (
      <aside
        className="rounded-lg border p-4 text-[12px]"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <div className="mb-1 text-2xl" aria-hidden>🪟</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          No ticket selected
        </div>
        <p className="mt-1">
          Pick a ticket on the left to preview it here. Click through for the
          full conversation, reply composer, and status controls.
        </p>
      </aside>
    );
  }

  const status = STATUS_TONE[ticket.status];
  const prio = PRIORITY_TONE[ticket.priority];
  const slaMs = ticket.dueBy ? ticket.dueBy.getTime() - Date.now() : null;
  const slaTone =
    slaMs == null   ? "default" :
    slaMs < 0       ? "danger"  :
    slaMs < DAY     ? "warning" :
                      "good";

  return (
    <aside
      className="flex flex-col gap-3 rounded-lg border p-4"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
            #{ticket.id.slice(0, 12)}
          </div>
          <h3 className="mt-0.5 truncate text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            {ticket.subject}
          </h3>
        </div>
        <Link
          href={`/platform/support/${ticket.id}`}
          className="ts-focus shrink-0 rounded-md px-2 py-1 text-[11px] font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Open ticket →
        </Link>
      </div>

      {/* Status / priority chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: status.bg, color: status.fg }}
        >
          {STATUS_LABEL[ticket.status]}
        </span>
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: prio.text }}
        >
          {PRIORITY_LABEL[ticket.priority]}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
        >
          {CATEGORY_LABEL[ticket.category]}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
        >
          {MODULE_LABEL[ticket.module]}
        </span>
      </div>

      {/* SLA panel */}
      <SlaPanel
        dueBy={ticket.dueBy}
        firstStaffReplyAt={ticket.firstStaffReplyAt}
        slaTone={slaTone}
      />

      {/* Requester card */}
      <PreviewCard label="Requester">
        {ticket.openedBy ? (
          <>
            <div style={{ color: "var(--text-default)" }}>{ticket.openedBy.name ?? ticket.openedBy.email}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{ticket.openedBy.email}</div>
          </>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>(removed user)</span>
        )}
      </PreviewCard>

      {/* Tenant card */}
      <PreviewCard label="Tenant">
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--text-default)" }}>{ticket.tenant.name}</span>
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {ticket.tenant.plan}
          </span>
        </div>
        <Link
          href={`/platform/tenants/${ticket.tenant.id}`}
          className="mt-1 inline-block text-[11px] underline"
          style={{ color: "var(--text-muted)" }}
        >
          Open tenant
        </Link>
        <span className="mx-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>·</span>
        <Link
          href={`/platform/support?q=${encodeURIComponent(ticket.tenant.slug)}`}
          className="text-[11px] underline"
          style={{ color: "var(--text-muted)" }}
        >
          Past tickets
        </Link>
      </PreviewCard>

      {/* Assignee */}
      <PreviewCard label="Assignee">
        {ticket.assignee ? (
          <div style={{ color: "var(--text-default)" }}>{ticket.assignee.name ?? ticket.assignee.email}</div>
        ) : (
          <div style={{ color: "var(--warning-fg)" }}>Unassigned</div>
        )}
      </PreviewCard>

      {/* First message */}
      <PreviewCard label="First message">
        <div
          className="whitespace-pre-wrap break-words text-[12px]"
          style={{ color: "var(--text-default)" }}
        >
          {ticket.firstMessage}
        </div>
        {ticket.messageCount > 1 && (
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            +{ticket.messageCount - 1} more in thread
          </div>
        )}
      </PreviewCard>

      {/* CSAT */}
      {ticket.satisfactionRating != null && (
        <PreviewCard label="CSAT">
          <div
            style={{
              color:
                ticket.satisfactionRating >= 4 ? "var(--success-fg)" :
                ticket.satisfactionRating <= 2 ? "var(--danger-fg)"  :
                "var(--warning-fg)",
            }}
          >
            ★ {ticket.satisfactionRating}/5
          </div>
          {ticket.satisfactionComment && (
            <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              “{ticket.satisfactionComment}”
            </div>
          )}
        </PreviewCard>
      )}

      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
        Created {relativeFromNow(ticket.createdAt)} · updated {relativeFromNow(ticket.updatedAt)}
      </div>
    </aside>
  );
}

function PreviewCard({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px]"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-faint)" }}
      >
        {label}
      </div>
      <div style={{ color: "var(--text-muted)" }}>{children}</div>
    </div>
  );
}

function SlaPanel({
  dueBy, firstStaffReplyAt, slaTone,
}: {
  dueBy: Date | null;
  firstStaffReplyAt: Date | null;
  slaTone: "default" | "good" | "warning" | "danger";
}) {
  const ms = dueBy ? dueBy.getTime() - Date.now() : null;
  const colour =
    slaTone === "danger"  ? "var(--danger-fg)"  :
    slaTone === "warning" ? "var(--warning-fg)" :
    slaTone === "good"    ? "var(--success-fg)" :
                            "var(--text-muted)";
  const label =
    ms == null    ? "No SLA target set" :
    ms < 0        ? `Breached by ${formatDurationShort(-ms)}` :
                    `Due in ${formatDurationShort(ms)}`;
  return (
    <div
      className="rounded-md border px-3 py-2 text-[11px]"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-faint)" }}
      >
        SLA
      </div>
      <div className="flex items-baseline justify-between">
        <span style={{ color: colour, fontWeight: 600 }}>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>
          First reply: {firstStaffReplyAt ? relativeFromNow(firstStaffReplyAt) : "pending"}
        </span>
      </div>
    </div>
  );
}
