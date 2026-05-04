"use client";

// Page 36 §Board — kanban with HTML5 drag-and-drop status transitions.
//
// Optimistic UI: dropping a card moves it locally first, then posts to
// transitionFeatureRequest. On error the route hop redirects with
// ?error= and we re-mount with fresh data. WIP-limit warnings show
// inline on the column header.

import * as React from "react";
import Link from "next/link";
import { transitionFeatureRequest } from "@/app/actions/platform-feature-requests";
import type {
  FeatureRequestStatus,
  EngineeringEffort,
} from "@prisma/client";
import {
  STATUS_LABEL,
  STATUS_TONE,
  EffortChip,
  IceChip,
} from "./shared";

interface BoardCard {
  id: string;
  title: string;
  status: FeatureRequestStatus;
  upvoteCount: number;
  voteCount: number;
  iceScore: number | null;
  effort: EngineeringEffort | null;
  plannedRelease: string | null;
  tags: string[];
  swimlane: string | null;
  submitterTenantName: string | null;
  linkedSupportTicketIds: string[];
  isPublic: boolean;
}

const COLUMNS: FeatureRequestStatus[] = [
  "BACKLOG", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "BETA", "SHIPPED", "WONT_DO",
];
const WIP: Partial<Record<FeatureRequestStatus, number>> = {
  PLANNED: 12,
  IN_PROGRESS: 5,
  BETA: 4,
};

export function KanbanBoard({
  initialCards,
  returnTo,
  canWrite,
}: {
  initialCards: BoardCard[];
  returnTo: string;
  canWrite: boolean;
}) {
  const [cards, setCards] = React.useState<BoardCard[]>(initialCards);
  const [pending, setPending] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);

  // Sync from props on revalidate.
  React.useEffect(() => { setCards(initialCards); }, [initialCards]);

  const byColumn = React.useMemo(() => {
    const map = new Map<FeatureRequestStatus, BoardCard[]>();
    for (const c of COLUMNS) map.set(c, []);
    for (const card of cards) {
      const list = map.get(card.status) ?? [];
      list.push(card);
      map.set(card.status, list);
    }
    return map;
  }, [cards]);

  const moveTo = async (id: string, to: FeatureRequestStatus) => {
    if (!canWrite) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === to) return;
    // Optimistic update.
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: to } : c)));
    setPending(id);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("to", to);
    fd.set("returnTo", returnTo);
    try {
      // The server action redirects so this `await` rarely returns; either
      // way we can rely on the next render to reconcile.
      await transitionFeatureRequest(fd);
    } finally {
      setPending(null);
    }
  };

  const onDragStart = (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite) return;
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch { /* noop */ }
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (col: FeatureRequestStatus) => async (e: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite || !dragId) return;
    e.preventDefault();
    const id = dragId;
    setDragId(null);
    await moveTo(id, col);
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 pb-2" style={{ minWidth: 1100 }}>
        {COLUMNS.map((col) => {
          const items = byColumn.get(col) ?? [];
          const tone = STATUS_TONE[col];
          const wip = WIP[col];
          const overWip = wip != null && items.length > wip;
          return (
            <div
              key={col}
              className="flex w-[200px] shrink-0 flex-col gap-2 rounded-md p-2"
              style={{
                background: "var(--surface-1)",
                border: `1px solid ${overWip ? "var(--rose-200, var(--border-default))" : "var(--border-subtle)"}`,
                minHeight: 360,
              }}
              onDragOver={onDragOver}
              onDrop={onDrop(col)}
            >
              <div className="flex items-baseline justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {STATUS_LABEL[col]}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {items.length}{wip != null ? `/${wip}` : ""}
                  </span>
                </div>
                {overWip && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--danger-fg)" }}>
                    over WIP
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {items.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    isDragging={dragId === card.id}
                    isPending={pending === card.id}
                    canDrag={canWrite}
                    onDragStart={onDragStart(card.id)}
                  />
                ))}
                {items.length === 0 && (
                  <div
                    className="rounded-md border border-dashed px-2 py-3 text-center text-[11px]"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-faint)" }}
                  >
                    Drop here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  card, isDragging, isPending, canDrag, onDragStart,
}: {
  card: BoardCard;
  isDragging: boolean;
  isPending: boolean;
  canDrag: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      style={{
        opacity: isDragging ? 0.4 : isPending ? 0.7 : 1,
        cursor: canDrag ? "grab" : "default",
      }}
    >
      <Link
        href={`/platform/operations/feature-requests/${card.id}`}
        className="ts-focus block rounded-md border p-2 transition-colors"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-default)",
        }}
      >
        <div className="flex items-start justify-between gap-1.5">
          <span className="line-clamp-2 text-[12px] font-semibold">{card.title}</span>
          {card.isPublic && (
            <span
              className="shrink-0 rounded-full px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
              title="Visible on the public roadmap"
            >
              Pub
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ background: "var(--surface-2)", color: "var(--accent-primary)" }}
            title={`${card.upvoteCount} upvotes`}
          >
            ▲ {card.upvoteCount}
          </span>
          <IceChip score={card.iceScore} />
          <EffortChip effort={card.effort} />
          {card.plannedRelease && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {card.plannedRelease}
            </span>
          )}
        </div>
        {card.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full px-1.5 py-0.5 text-[10px]"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
          <span className="truncate">
            {card.submitterTenantName ?? "—"}
            {card.swimlane && ` · ${card.swimlane}`}
          </span>
          {card.linkedSupportTicketIds.length > 0 && (
            <span title={`${card.linkedSupportTicketIds.length} linked tickets`}>
              🎫 {card.linkedSupportTicketIds.length}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
