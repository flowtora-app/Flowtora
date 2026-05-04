// Page 36 §Roadmap timeline — Gantt-style swim-lane view by team.
//
// Quarters across the top (current + next 5), swim lanes down the
// side. Each item slots into its plannedRelease quarter, sized by
// engineering effort (XS=1col, S=1, M=1, L=2, XL=3). Clicking a
// chip opens the detail page.

import Link from "next/link";
import type { RoadmapLane } from "@/server/platform/feature-requests";
import { nextNQuarters } from "@/server/platform/feature-requests";
import { STATUS_TONE, STATUS_LABEL } from "./shared";
import type { EngineeringEffort } from "@prisma/client";

const EFFORT_COLS: Record<EngineeringEffort, number> = {
  XS: 1, S: 1, M: 1, L: 2, XL: 3,
};

export function RoadmapTimeline({ lanes }: { lanes: RoadmapLane[] }) {
  const quarters = nextNQuarters(6);
  if (lanes.length === 0) {
    return (
      <div
        className="rounded-lg border p-10 text-center text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <div className="mb-1 text-2xl" aria-hidden>📅</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          Nothing scheduled yet.
        </div>
        <p className="mt-1">
          Set <code>plannedRelease</code> + <code>swimlane</code> on requests to populate the roadmap.
        </p>
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-lg border"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div style={{ minWidth: 920 }}>
        {/* Header row: lane label + quarter columns */}
        <div
          className="grid border-b text-[10px] font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: `160px repeat(${quarters.length}, minmax(0, 1fr))`,
            borderColor: "var(--border-subtle)",
            background: "var(--surface-2)",
            color: "var(--text-muted)",
          }}
        >
          <div className="px-3 py-2">Swimlane</div>
          {quarters.map((q) => (
            <div
              key={q}
              className="border-l px-2 py-2 text-center"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {q}
            </div>
          ))}
        </div>

        {/* Lane rows */}
        {lanes.map((lane, idx) => (
          <div
            key={lane.swimlane}
            className="grid"
            style={{
              gridTemplateColumns: `160px repeat(${quarters.length}, minmax(0, 1fr))`,
              borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
              minHeight: 60,
            }}
          >
            <div
              className="px-3 py-2 text-[12px] font-semibold"
              style={{ color: "var(--text-default)", background: "var(--surface-1)" }}
            >
              {lane.swimlane}
              <div className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
                {lane.items.length} item{lane.items.length === 1 ? "" : "s"}
              </div>
            </div>
            {quarters.map((q, qIdx) => {
              const inQuarter = lane.items.filter(
                (i) => (i.plannedRelease ?? quarters[0] ?? "") === q,
              );
              return (
                <div
                  key={q}
                  className="flex flex-col gap-1.5 border-l px-1.5 py-2"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {inQuarter.map((item) => {
                    const tone = STATUS_TONE[item.status];
                    const span = item.effort ? EFFORT_COLS[item.effort] : 1;
                    return (
                      <Link
                        key={item.id}
                        href={`/platform/operations/feature-requests/${item.id}`}
                        className="ts-focus block rounded-md border p-1.5 text-[11px]"
                        style={{
                          background: tone.bg,
                          borderColor: tone.fg,
                          color: tone.fg,
                          // Visual width hint when an item spans multiple
                          // quarters — we add a faint connector dot to the
                          // right edge so the Gantt feel reads.
                          gridColumn: span > 1 ? `span ${Math.min(span, quarters.length - qIdx)}` : undefined,
                        }}
                      >
                        <div className="line-clamp-2 font-semibold" style={{ color: tone.fg }}>
                          {item.title}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-1 text-[9px]" style={{ color: tone.fg }}>
                          <span>{STATUS_LABEL[item.status]}</span>
                          <span>{item.effort ?? "—"} · ▲ {item.voteCount}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {inQuarter.length === 0 && (
                    <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>·</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
