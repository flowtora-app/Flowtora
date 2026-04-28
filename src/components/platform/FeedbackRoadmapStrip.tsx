import * as React from "react";
import Link from "next/link";

// Three-column roadmap snapshot at the top of /platform/feedback.
//
//   ┌── Planned (5) ──┬── In progress (3) ──┬── Recently shipped (4) ──┐
//   │  Bulk update    │  PDF export rework  │  ✓ Mobile field mode      │
//   │  ↑ 28           │  ↑ 18               │  shipped 2024-04-12       │
//   │                 │                     │                            │
//   │  Multi-loc      │  Faster proofs      │  ✓ Vendor expenses        │
//   │  ↑ 22           │  ↑ 14               │  shipped 2024-04-08       │
//   └─────────────────┴─────────────────────┴────────────────────────────┘
//
// Read-only summary of what's on deck, what's being built, and what
// just shipped. Each card links straight to the feedback detail page.
// Caps at 5 items per column to keep the strip scannable.

export interface RoadmapItem {
  id: string;
  summary: string;
  voteCount: number;
  shippedAt?: Date | null;
}

export function FeedbackRoadmapStrip({
  planned,
  inProgress,
  shipped,
}: {
  planned: RoadmapItem[];
  inProgress: RoadmapItem[];
  shipped: RoadmapItem[];
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex items-baseline justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Roadmap snapshot
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            What's on deck, what's being built, and what just shipped — in vote order.
          </p>
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Top 5 each
        </span>
      </header>

      <div className="grid gap-px md:grid-cols-3" style={{ background: "var(--border-subtle)" }}>
        <Column
          title="Planned"
          tone="accent"
          icon="📋"
          items={planned}
          emptyHint="No planned items yet."
        />
        <Column
          title="In progress"
          tone="warning"
          icon="🔧"
          items={inProgress}
          emptyHint="Nothing in flight."
        />
        <Column
          title="Recently shipped"
          tone="success"
          icon="✓"
          items={shipped}
          emptyHint="Nothing shipped yet."
          showShippedDate
        />
      </div>
    </section>
  );
}

function Column({
  title,
  tone,
  icon,
  items,
  emptyHint,
  showShippedDate,
}: {
  title: string;
  tone: "accent" | "warning" | "success";
  icon: string;
  items: RoadmapItem[];
  emptyHint: string;
  showShippedDate?: boolean;
}) {
  const palette =
    tone === "accent"  ? { fg: "var(--accent-primary)", bg: "var(--accent-surface)" } :
    tone === "warning" ? { fg: "var(--warning-fg)",     bg: "var(--warning-surface)" } :
                          { fg: "var(--success-fg)",     bg: "var(--success-surface)" };
  return (
    <div className="p-4" style={{ background: "var(--surface-1)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
          style={{ background: palette.bg, color: palette.fg }}
        >
          {icon}
        </span>
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: palette.fg }}
        >
          {title}
        </span>
        <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((it) => (
            <li key={it.id}>
              <Link
                href={`/platform/feedback/${it.id}`}
                className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={{ background: palette.bg, color: palette.fg }}
                  title={`${it.voteCount} vote${it.voteCount === 1 ? "" : "s"}`}
                >
                  ↑ {it.voteCount}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-xs"
                    style={{ color: "var(--text-default)" }}
                  >
                    {it.summary}
                  </span>
                  {showShippedDate && it.shippedAt && (
                    <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
                      shipped {it.shippedAt.toISOString().slice(0, 10)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
