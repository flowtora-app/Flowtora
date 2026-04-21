import * as React from "react";

// ShopSnapshot — a representative case-study card used on the industry
// pages between the workflow walkthrough and the feature grid.
//
// This is deliberately lighter-weight than the Testimonial component.
// Testimonial is a centered pull-quote; ShopSnapshot is a profile card
// with shop-shape metadata (size, focus, stack before/after) and a
// short narrative. It reads as "here's what a shop like mine did"
// rather than "here's a glowing quote".
//
// We mark shops as "representative" while Flowtora is pre-launch so
// the page is honest. Once real customers are named, swap `author`
// and drop the `placeholder` badge.
//
// Design notes:
//   • Two-column desktop layout: stats + narrative on the left, a
//     stack-before/stack-after comparison on the right. The visual
//     punch of the stack comparison is the whole point — it turns
//     "messy → clean" into a glanceable diagram.
//   • On mobile, stack vertical with stats on top.

export interface ShopSnapshotStat {
  value: React.ReactNode;
  label: React.ReactNode;
}

export interface ShopSnapshotProps {
  /** Short name displayed in the card header (e.g. "Harbor Signs"). */
  shop: string;
  /** Single-line meta (e.g. "8-person shop · Portland, OR"). */
  meta: string;
  /** Main narrative — two short paragraphs work well. */
  narrative: React.ReactNode;
  /** 2–3 outcome stats. */
  stats: ShopSnapshotStat[];
  /** Before/after stack comparison — what they were running vs. Flowtora. */
  before: string[];
  /** Whether this is a representative / placeholder shop (shows a badge). */
  placeholder?: boolean;
}

export function ShopSnapshot({
  shop,
  meta,
  narrative,
  stats,
  before,
  placeholder = false,
}: ShopSnapshotProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        boxShadow:
          "0 0 0 1px var(--border-subtle), var(--shadow-lg), inset 0 1px 0 0 color-mix(in oklab, var(--text-default) 6%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full"
        style={{
          background: "var(--accent-surface-strong)",
          filter: "blur(70px)",
          opacity: 0.5,
        }}
      />

      <div className="relative grid grid-cols-1 gap-10 p-8 md:p-10 lg:grid-cols-[1.2fr_1fr]">
        {/* Narrative column */}
        <div>
          <div className="flex items-center gap-3">
            <div
              className="text-xs font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--accent-primary)" }}
            >
              Shop snapshot
            </div>
            {placeholder && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: "var(--warning-surface)",
                  color: "var(--warning-fg)",
                }}
              >
                Representative
              </span>
            )}
          </div>
          <h3
            className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl"
            style={{
              color: "var(--text-default)",
              letterSpacing: "-0.015em",
            }}
          >
            {shop}
          </h3>
          <div
            className="mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {meta}
          </div>

          <div
            className="mt-6 text-base leading-relaxed"
            style={{ color: "var(--text-default)" }}
          >
            {narrative}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4">
            {stats.map((s, i) => (
              <div
                key={i}
                className="rounded-lg px-3 py-3"
                style={{ background: "var(--surface-2)" }}
              >
                <div
                  className="text-xl font-semibold tracking-tight md:text-2xl"
                  style={{ color: "var(--text-default)" }}
                >
                  {s.value}
                </div>
                <div
                  className="mt-1 text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stack comparison column */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-muted)" }}
          >
            Before Flowtora
          </div>
          <ul className="mt-2 space-y-1.5">
            {before.map((b, i) => (
              <li
                key={i}
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                <span
                  aria-hidden
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-faint)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  —
                </span>
                {b}
              </li>
            ))}
          </ul>

          <div
            className="my-5 border-t"
            style={{ borderColor: "var(--border-subtle)" }}
          />

          <div
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--accent-primary)" }}
          >
            With Flowtora
          </div>
          <ul className="mt-2 space-y-1.5 text-sm" style={{ color: "var(--text-default)" }}>
            <li className="flex items-center gap-2">
              <CheckDot />
              One customer record from lead to last dollar
            </li>
            <li className="flex items-center gap-2">
              <CheckDot />
              Deposits + balance on the same order
            </li>
            <li className="flex items-center gap-2">
              <CheckDot />
              Production + install in one record
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function CheckDot() {
  return (
    <span
      aria-hidden
      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
      style={{
        background: "var(--success-surface)",
        color: "var(--success-fg)",
      }}
    >
      ✓
    </span>
  );
}
