"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// PillFilterChips — Spec Page 0 §0.5.45.
//
// Single-select group: clicking selects + deselects others.
// Multi-select group: clicking toggles.
// Visual: unselected (border-default, transparent), selected (brand-50
// bg, brand-700 text, brand-200 border).
// With optional count badge trailing.

export interface PillChipOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

interface BaseProps<V extends string> {
  options: readonly PillChipOption<V>[];
  className?: string;
  /** Compact size (used in dense filter rows). */
  size?: "sm" | "md";
  /** Optional aria-label for the group. */
  label?: string;
}

interface SingleProps<V extends string> extends BaseProps<V> {
  mode: "single";
  value: V | null;
  onChange: (next: V | null) => void;
}

interface MultiProps<V extends string> extends BaseProps<V> {
  mode: "multi";
  value: readonly V[];
  onChange: (next: V[]) => void;
}

export type PillFilterChipsProps<V extends string = string> = SingleProps<V> | MultiProps<V>;

const SIZE_CLASS = {
  sm: "h-7 px-2.5 text-[12px]",
  md: "h-8 px-3 text-[13px]",
} as const;

export function PillFilterChips<V extends string = string>(props: PillFilterChipsProps<V>) {
  const { options, className, size = "md", label } = props;

  const isSelected = (value: V) =>
    props.mode === "single" ? props.value === value : props.value.includes(value);

  const handleClick = (value: V) => {
    if (props.mode === "single") {
      // Spec §0.5.45 single-select: clicking selects + deselects others.
      // Re-clicking the active chip clears.
      props.onChange(props.value === value ? null : value);
      return;
    }
    const set = new Set(props.value);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    props.onChange([...set] as V[]);
  };

  return (
    <div
      role={props.mode === "single" ? "radiogroup" : "group"}
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {options.map((opt) => {
        const selected = isSelected(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role={props.mode === "single" ? "radio" : "checkbox"}
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => handleClick(opt.value)}
            className={cn(
              "ts-focus inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors",
              SIZE_CLASS[size],
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={
              selected
                ? {
                    background: "var(--brand-50, var(--accent-surface))",
                    color: "var(--brand-700, var(--accent-primary))",
                    borderColor: "var(--brand-200, var(--accent-primary))",
                  }
                : {
                    background: "transparent",
                    color: "var(--text-muted)",
                    borderColor: "var(--border-default)",
                  }
            }
          >
            {opt.label}
            {opt.count != null && (
              <span
                className="inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                style={
                  selected
                    ? { background: "var(--brand-200, var(--accent-surface))", color: "var(--brand-800, var(--accent-primary))", minWidth: 18 }
                    : { background: "var(--surface-2)",                       color: "var(--text-muted)",     minWidth: 18 }
                }
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
