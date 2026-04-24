"use client";

import * as React from "react";
import Link from "next/link";
import { changeStage } from "@/app/actions/customers";
import { HealthBadge } from "@/components/crm/HealthBadge";
import type { HealthTier } from "@/lib/opportunity-health";

// Phase 3 (transformation) — pipeline kanban view.
//
// The customers list can toggle between a table (default) and this
// kanban-style board via `?view=pipeline` on the list page. Cards
// render under their current stage column; drag a card to another
// column to submit a `changeStage` server action.
//
// Implementation notes:
//   • Native HTML5 drag-and-drop — no library. Good enough for ~200
//     cards; anything larger already paginates.
//   • Optimistic move: the card jumps to the target column immediately
//     so the drop feels responsive. On success, revalidatePath in the
//     action refreshes the server-rendered tree with the authoritative
//     order. On failure (e.g. WON guard rails), the UI snaps back on
//     revalidate because we're echoing props → state on each render.
//   • LOST drops are intentionally left to the server: the detail
//     page's StageChangeCard forces the rep to pick a lost reason,
//     and the changeStage action rejects LOST submissions without one.
//     A LOST drop here will simply bounce back.

export type PipelineColumn = {
  value: string; // PipelineStage enum value
  label: string;
  color: string;
};

export type PipelineCard = {
  id:       string;
  name:     string;
  stage:    string;
  value:    string;        // already-formatted money string
  ownerName: string | null;
  health:   { tier: HealthTier; score: number; atRisk: boolean } | null;
  tags:     string[];
};

export function PipelineBoard({
  slug,
  stages,
  cards,
}: {
  slug:   string;
  stages: PipelineColumn[];
  cards:  PipelineCard[];
}) {
  // Echo server props into local state for optimistic moves. Resetting
  // via useEffect on prop change keeps revalidated data authoritative.
  const [localCards, setLocalCards] = React.useState(cards);
  React.useEffect(() => setLocalCards(cards), [cards]);

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);

  const byStage: Record<string, PipelineCard[]> = {};
  for (const s of stages) byStage[s.value] = [];
  for (const c of localCards) {
    if (byStage[c.stage]) byStage[c.stage].push(c);
  }

  async function handleDrop(stage: string, cardId: string) {
    setDraggingId(null);
    setOverStage(null);
    const card = localCards.find((c) => c.id === cardId);
    if (!card || card.stage === stage) return;

    // Optimistic: move the card locally.
    setLocalCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage } : c)));

    // Fire the server action. changeStage accepts FormData.
    const fd = new FormData();
    fd.set("customerId", cardId);
    fd.set("stage", stage);
    try {
      await changeStage(slug, fd);
    } catch {
      // Action may throw a Next.js redirect on invalid moves (e.g.
      // WON without a quote). That's fine — the revalidate will sync
      // us back to truth on the next render.
    }
  }

  return (
    <div
      className="overflow-x-auto pb-2"
      aria-label="Pipeline kanban"
    >
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${stages.length}, minmax(240px, 1fr))`,
          minWidth: `${stages.length * 260}px`,
        }}
      >
        {stages.map((col) => {
          const list = byStage[col.value] ?? [];
          const isOver = overStage === col.value;
          return (
            <div
              key={col.value}
              onDragOver={(e) => {
                e.preventDefault();
                if (overStage !== col.value) setOverStage(col.value);
              }}
              onDragLeave={() => {
                if (overStage === col.value) setOverStage(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) handleDrop(col.value, id);
              }}
              className="flex flex-col rounded-md"
              style={{
                background: isOver ? "var(--surface-2)" : "var(--panel)",
                border: "1px solid var(--border)",
                minHeight: 200,
              }}
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: col.color }}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {col.label}
                  </span>
                </div>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
                  {list.length}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {list.length === 0 ? (
                  <div
                    className="rounded-md border border-dashed py-4 text-center text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
                  >
                    Drop cards here
                  </div>
                ) : (
                  list.map((card) => (
                    <PipelineCardTile
                      key={card.id}
                      slug={slug}
                      card={card}
                      dragging={draggingId === card.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", card.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(card.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCardTile({
  slug,
  card,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  slug:        string;
  card:        PipelineCard;
  dragging:    boolean;
  onDragStart: React.DragEventHandler<HTMLDivElement>;
  onDragEnd:   React.DragEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="rounded-md p-2.5"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border)",
        opacity: dragging ? 0.5 : 1,
        cursor: "grab",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/t/${slug}/customers/${card.id}`}
          className="text-sm font-medium hover:underline"
          onMouseDown={(e) => {
            // Prevent the link click from interfering with drag start.
            // The click still works because we only stop mousedown on
            // the bubbling-up, not the link navigation itself.
            e.stopPropagation();
          }}
        >
          {card.name}
        </Link>
        {card.health && (
          <HealthBadge
            tier={card.health.tier}
            score={card.health.score}
            atRisk={card.health.atRisk}
          />
        )}
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {card.ownerName ?? "Unassigned"}
        {card.value && <> · <span className="tabular-nums">{card.value}</span></>}
      </div>
      {card.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full px-1.5 py-0.5 text-[10px]"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
