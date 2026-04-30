"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

// AuditLogRow — Spec Page 0 §0.5.59.
//
// Columns: timestamp · actor (avatar+name) · action (verb badge) ·
// resource link · status (success/failure dot) · IP · tenant chip ·
// 3-dot.
// Click row: caller opens slide-over with full event JSON, before/
// after diff, related events timeline.

export interface AuditLogRowProps {
  timestamp: Date;
  actor?: { name: string; email?: string; avatarUrl?: string | null } | null;
  /** Verb-led action label (e.g. "platform.tenant_suspended"). */
  action: React.ReactNode;
  /** Resource the event targets — typically a Link to the entity. */
  resource?: React.ReactNode;
  /** "success" / "failure" / "warning". */
  status?: "success" | "failure" | "warning" | "neutral";
  ip?: string | null;
  tenant?: { name: string; slug?: string } | null;
  onClick?: () => void;
  /** Trailing 3-dot menu trigger. */
  menu?: React.ReactNode;
  className?: string;
}

const STATUS_DOT: Record<NonNullable<AuditLogRowProps["status"]>, string> = {
  success: "var(--emerald-500, var(--success))",
  failure: "var(--rose-500, var(--danger))",
  warning: "var(--amber-500, var(--warning))",
  neutral: "var(--slate-400, var(--text-faint))",
};

export function AuditLogRow({
  timestamp,
  actor,
  action,
  resource,
  status = "success",
  ip,
  tenant,
  onClick,
  menu,
  className,
}: AuditLogRowProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === "Enter" || e.key === " ")) onClick(); }}
      className={cn(
        "ts-focus grid items-center gap-3 px-4 py-2.5 text-[12px]",
        onClick && "cursor-pointer hover:bg-[var(--surface-2)]",
        className,
      )}
      style={{
        gridTemplateColumns: "auto 1fr auto",
        borderBottom: "1px solid var(--border-subtle)",
        color: "var(--text-default)",
      }}
    >
      {/* Status dot + timestamp */}
      <div className="flex items-center gap-2">
        <span aria-label={`status: ${status}`} title={status} style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_DOT[status] }} />
        <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
          {timestamp.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>

      {/* Actor + action + resource */}
      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {actor && (
          <span className="inline-flex items-center gap-1.5">
            <Avatar size="xs" src={actor.avatarUrl ?? undefined} name={actor.name} />
            <span className="font-medium" style={{ color: "var(--text-default)" }}>{actor.name}</span>
          </span>
        )}
        {!actor && (
          <span style={{ color: "var(--text-muted)" }}>system</span>
        )}
        <span
          className="inline-flex items-center rounded font-mono"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-default)",
            padding: "0px 6px",
            fontSize: 11,
            border: "1px solid var(--border-subtle)",
          }}
        >
          {action}
        </span>
        {resource && (
          <span className="min-w-0 truncate">
            {resource}
          </span>
        )}
        {tenant && (
          <span
            className="inline-flex items-center rounded-full px-1.5 text-[10px] font-medium"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            {tenant.name}
          </span>
        )}
        {ip && (
          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 10 }}>{ip}</span>
        )}
      </div>

      {/* Menu */}
      {menu && (
        <div onClick={(e) => e.stopPropagation()}>
          {menu}
        </div>
      )}
    </div>
  );
}
