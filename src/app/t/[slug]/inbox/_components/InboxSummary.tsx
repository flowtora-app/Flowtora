import Link from "next/link";

// "You're clear" summary — the single line under the page title that tells
// you at a glance whether anything needs you right now.
//
// Renders one of two forms:
//   Zero state:  "You're all caught up."  (subtle, no CTAs)
//   Work state:  "3 need attention · 2 waiting on you · 5 unread · 4 open tasks"
//                — each fragment is a link that switches the chip to the
//                relevant surface.
//
// Kept deliberately narrow (no icons, no badges) so the chip row below stays
// the primary focal point.

export function InboxSummary({
  slug,
  attention,
  messages,
  approvals,
  tasks,
}: {
  slug: string;
  attention: number;
  messages: number;
  approvals: number;
  tasks: number;
}) {
  const total = attention + messages + approvals + tasks;

  if (total === 0) {
    return (
      <p
        className="mt-2"
        style={{
          color: "var(--text-muted)",
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
      >
        Nothing needs your attention right now — check back when work moves through the pipeline.
      </p>
    );
  }

  const fragments: { count: number; label: string; chip: string }[] = [
    { count: attention, label: attention === 1 ? "needs attention" : "need attention", chip: "attention" },
    { count: approvals, label: "waiting on you",                                        chip: "approvals"  },
    { count: messages,  label: "unread",                                                chip: "messages"   },
    { count: tasks,     label: tasks === 1 ? "open task" : "open tasks",                chip: "tasks"      },
  ].filter((f) => f.count > 0);

  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1"
      style={{
        color: "var(--text-muted)",
        fontSize: 12.5,
        lineHeight: 1.4,
      }}
    >
      {fragments.map((f, i) => (
        <span key={f.chip} className="inline-flex items-center gap-1">
          <Link
            href={`/t/${slug}/inbox?chip=${f.chip}`}
            className="ts-focus inline-flex items-center gap-1.5 rounded-md transition-colors hover:bg-[var(--accent-surface)]"
            style={{
              padding: "2px 6px",
              margin: "-2px -6px",
              fontWeight: 500,
              color: "var(--text-default)",
              letterSpacing: "-0.005em",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: "var(--accent-primary)",
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {f.count}
            </span>
            <span>{f.label}</span>
          </Link>
          {i < fragments.length - 1 && (
            <span style={{ color: "var(--text-faint)" }}>·</span>
          )}
        </span>
      ))}
    </p>
  );
}
