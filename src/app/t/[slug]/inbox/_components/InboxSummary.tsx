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
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        You're all caught up.{" "}
        <span style={{ color: "var(--text-faint)" }}>Nothing needs your attention right now.</span>
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
    <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
      {fragments.map((f, i) => (
        <span key={f.chip}>
          <Link
            href={`/t/${slug}/inbox?chip=${f.chip}`}
            className="underline"
            style={{ color: "var(--text-default)", textDecorationColor: "var(--border-default)" }}
          >
            <span className="font-semibold">{f.count}</span>{" "}
            <span>{f.label}</span>
          </Link>
          {i < fragments.length - 1 && <span style={{ color: "var(--text-faint)" }}>{"  ·  "}</span>}
        </span>
      ))}
    </p>
  );
}
