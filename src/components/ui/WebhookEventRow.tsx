"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// WebhookEventRow — Spec Page 0 §0.5.60.
//
// Columns: timestamp · event type · status (200/4xx/5xx) · attempts ·
// destination URL · response time · 3-dot (replay, view payload).

export interface WebhookEventRowProps {
  timestamp: Date;
  eventType: string;
  /** HTTP status code from the destination (or 0 for "did not connect"). */
  statusCode: number;
  attempts: number;
  destinationUrl: string;
  /** Response time in ms. */
  responseMs?: number | null;
  onReplay?: () => void;
  onViewPayload?: () => void;
  className?: string;
}

export function WebhookEventRow({
  timestamp,
  eventType,
  statusCode,
  attempts,
  destinationUrl,
  responseMs,
  onReplay,
  onViewPayload,
  className,
}: WebhookEventRowProps) {
  const tone = statusTone(statusCode);
  return (
    <div
      className={cn(
        "grid items-center gap-3 border-b px-4 py-2 text-[12px]",
        className,
      )}
      style={{
        gridTemplateColumns: "auto auto 1fr auto",
        borderColor: "var(--border-subtle)",
        color: "var(--text-default)",
      }}
    >
      <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
        {timestamp.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <StatusPill tone={tone} code={statusCode} />
      <div className="min-w-0 flex flex-wrap items-baseline gap-2">
        <span className="font-mono" style={{ color: "var(--text-default)" }}>{eventType}</span>
        <span className="min-w-0 truncate font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{destinationUrl}</span>
        {attempts > 1 && (
          <span
            className="inline-flex items-center rounded-full px-1.5 text-[10px]"
            style={{ background: "var(--amber-50, var(--warning-surface))", color: "var(--amber-700, var(--warning-fg))" }}
            title="Number of delivery attempts"
          >
            ↻ {attempts}
          </span>
        )}
        {responseMs != null && (
          <span className="font-mono tabular-nums" style={{ color: "var(--text-faint)", fontSize: 10 }}>{responseMs}ms</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onViewPayload && (
          <RowBtn onClick={onViewPayload} title="View payload">{"{ }"}</RowBtn>
        )}
        {onReplay && (
          <RowBtn onClick={onReplay} title="Replay">↻</RowBtn>
        )}
      </div>
    </div>
  );
}

function StatusPill({ tone, code }: { tone: "success" | "warning" | "danger"; code: number }) {
  const palette = tone === "success"
    ? { bg: "var(--emerald-50, var(--success-surface))", fg: "var(--emerald-700, var(--success-fg))" }
    : tone === "warning"
    ? { bg: "var(--amber-50, var(--warning-surface))", fg: "var(--amber-700, var(--warning-fg))" }
    : { bg: "var(--rose-50, var(--danger-surface))", fg: "var(--rose-700, var(--danger-fg))" };
  return (
    <span
      className="inline-flex items-center rounded font-mono tabular-nums"
      style={{
        padding: "1px 6px",
        fontSize: 11,
        fontWeight: 600,
        background: palette.bg,
        color: palette.fg,
      }}
    >
      {code === 0 ? "—" : code}
    </span>
  );
}

function statusTone(code: number): "success" | "warning" | "danger" {
  if (code >= 200 && code < 300) return "success";
  if (code === 0 || code >= 500) return "danger";
  return "warning";
}

function RowBtn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded text-[11px]"
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}
