"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

// ActivityFeedItem — Spec Page 0 §0.5.53.
//
// Anatomy: actor avatar + verb-led summary + target (link) +
// timestamp + meta chips (tenant, IP) + 3-dot menu (subscribe,
// view in audit log).
// Density: condensed (1 line) vs expanded (with diff/preview).

export interface ActivityFeedItemProps {
  actor: { name: string; avatarUrl?: string | null };
  /** Verb + target. The component renders [Actor] [verb summary]
   *  [target] [timestamp] inline; pass `summary` as the verb-led
   *  predicate. */
  summary: React.ReactNode;
  target?: React.ReactNode;
  timestamp: Date;
  metaChips?: React.ReactNode[];
  density?: "condensed" | "expanded";
  /** Expanded preview / diff content. */
  preview?: React.ReactNode;
  /** Trailing 3-dot menu trigger. */
  menu?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function ActivityFeedItem({
  actor,
  summary,
  target,
  timestamp,
  metaChips,
  density = "condensed",
  preview,
  menu,
  onClick,
  className,
}: ActivityFeedItemProps) {
  return (
    <article
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        onClick && "cursor-pointer hover:bg-[var(--surface-2)]",
        className,
      )}
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <Avatar size="sm" src={actor.avatarUrl ?? undefined} name={actor.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1 text-[13px]">
          <span className="font-medium" style={{ color: "var(--text-default)" }}>{actor.name}</span>
          <span style={{ color: "var(--text-muted)" }}>{summary}</span>
          {target && (
            <span className="font-medium" style={{ color: "var(--text-default)" }}>{target}</span>
          )}
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>· {formatRelative(timestamp)}</span>
        </div>
        {metaChips && metaChips.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {metaChips.map((chip, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {density === "expanded" && preview && (
          <div className="mt-2 rounded-md border p-2 text-[12px]" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {preview}
          </div>
        )}
      </div>
      {menu && (
        <div onClick={(e) => e.stopPropagation()}>{menu}</div>
      )}
    </article>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day) return `${Math.floor(ms / hour)}h`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d`;
  return d.toLocaleDateString();
}
