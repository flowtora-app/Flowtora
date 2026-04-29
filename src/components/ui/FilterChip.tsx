"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// FilterChip — Spec Page 0 §0.5.43 (Filter chip).
//
// Anatomy: field name + operator + value(s) + X to remove. Click the
// body to edit (caller handles edit UI).
//
// Operators per type (caller-supplied label):
//   text:    is, contains, starts with, ends with, regex
//   number:  =, ≠, >, <, between
//   date:    is, before, after, between, last N days, this week/month
//   boolean
//   enum:    is one of, is not one of

export interface FilterChipProps {
  field: string;
  operator: string;
  value: React.ReactNode;
  /** Click anywhere on the body to fire this — caller pops a popover etc. */
  onEdit?: () => void;
  onRemove: () => void;
  className?: string;
}

export function FilterChip({
  field,
  operator,
  value,
  onEdit,
  onRemove,
  className,
}: FilterChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border text-[12px]",
        className,
      )}
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--border-default)",
        color: "var(--text-default)",
      }}
    >
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className="ts-focus inline-flex h-full items-center gap-1.5 px-2 disabled:cursor-default"
      >
        <span className="font-medium">{field}</span>
        <span style={{ color: "var(--text-muted)" }}>{operator}</span>
        <span className="font-medium">{value}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${field} filter`}
        className="ts-focus inline-flex h-full items-center px-1.5"
        style={{
          color: "var(--text-muted)",
          borderInlineStart: "1px solid var(--border-default)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="3" y1="3" x2="9" y2="9" />
          <line x1="9" y1="3" x2="3" y2="9" />
        </svg>
      </button>
    </span>
  );
}
