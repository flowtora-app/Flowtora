import { formatDateTime } from "@/lib/format";

// Phase 15 Slice C — unified portal activity timeline.
//
// Sources we merge into a single chronological stream:
//   • EmailEvent — outbound + (future) inbound comms
//   • ProofDecision — customer-approval decisions
//   • Payment — receipts, for "money changed hands" audit
//   • InstallEvent — major schedule events
//
// The goal is to let a customer see "what's happened with my account"
// without the staff having to curate anything. Every bullet links to
// the underlying entity page inside the portal so they can drill in.

export type TimelineEvent = {
  id: string;
  at: Date;
  kind:
    | "email.sent"
    | "email.failed"
    | "proof.approved"
    | "proof.changes_requested"
    | "proof.sent"
    | "payment.received"
    | "invoice.sent"
    | "quote.sent"
    | "install.scheduled";
  title: string;
  detail?: string | null;
  href?: string | null;
};

const KIND_META: Record<TimelineEvent["kind"], { dot: string; label: string }> = {
  "email.sent":              { dot: "#3b82f6", label: "Email sent"       },
  "email.failed":            { dot: "#ef4444", label: "Email failed"     },
  "proof.approved":          { dot: "#10b981", label: "Proof approved"   },
  "proof.changes_requested": { dot: "#f59e0b", label: "Changes requested"},
  "proof.sent":              { dot: "#3b82f6", label: "Proof sent"       },
  "payment.received":        { dot: "#10b981", label: "Payment received" },
  "invoice.sent":            { dot: "#3b82f6", label: "Invoice sent"     },
  "quote.sent":              { dot: "#3b82f6", label: "Quote sent"       },
  "install.scheduled":       { dot: "#8b5cf6", label: "Visit scheduled"  },
};

export function PortalActivityTimeline({
  events,
  emptyLabel = "No activity yet.",
  showKindLabel = true,
}: {
  events: TimelineEvent[];
  emptyLabel?: string;
  showKindLabel?: boolean;
}) {
  if (events.length === 0) {
    return (
      <div
        className="px-5 py-4 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <ol className="px-5 py-4">
      {events.map((e, i) => {
        const meta = KIND_META[e.kind];
        const content = (
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: meta.dot }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                {showKindLabel && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: meta.dot }}
                  >
                    {meta.label}
                  </span>
                )}
                <span className="font-medium">{e.title}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {formatDateTime(e.at)}
                </span>
              </div>
              {e.detail && (
                <div
                  className="mt-0.5 whitespace-pre-wrap text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {e.detail}
                </div>
              )}
            </div>
          </div>
        );
        return (
          <li
            key={e.id}
            className={i > 0 ? "pt-3" : undefined}
            style={{
              borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
              paddingBottom: i < events.length - 1 ? "0.75rem" : 0,
            }}
          >
            {e.href ? (
              <a
                href={e.href}
                className="block rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-[var(--surface-1)]"
                style={{ color: "var(--text-default)", textDecoration: "none" }}
              >
                {content}
              </a>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
