"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// NumberStepper — numeric input flanked by +/− buttons. Holds shift to
// step by 10× and shift+arrow on keyboard does the same. Empty input is
// allowed during typing; on blur we clamp to [min, max] (or revert to
// the previous valid value if the field was left blank).

type Size = "sm" | "md" | "lg";

const SIZE_HEIGHT: Record<Size, number> = { sm: 28, md: 32, lg: 40 };
const SIZE_FONT: Record<Size, string> = { sm: "13px", md: "14px", lg: "16px" };

export interface NumberStepperProps {
  value: number;
  onValueChange?: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: Size;
  disabled?: boolean;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Form name so the parent <form> picks up the value on submit. */
  name?: string;
  className?: string;
  id?: string;
}

export function NumberStepper({
  value,
  onValueChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  size = "md",
  disabled,
  label,
  hint,
  error,
  name,
  className,
  id,
}: NumberStepperProps) {
  const reactId = React.useId();
  const inputId = id ?? `nstep-${reactId}`;
  const [text, setText] = React.useState<string>(String(value));
  React.useEffect(() => {
    setText(String(value));
  }, [value]);

  const apply = (next: number) => {
    if (disabled) return;
    const clamped = clamp(next, min, max);
    if (clamped !== value) onValueChange?.(clamped);
    setText(String(clamped));
  };

  const bump = (delta: number) => apply(value + delta);

  const height = SIZE_HEIGHT[size];

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium" style={{ color: "var(--text-default)" }}>
          {label}
        </label>
      )}
      <div
        className="inline-flex items-stretch overflow-hidden rounded-md"
        style={{
          height,
          background: "var(--surface-1)",
          border: `1px solid ${error ? "var(--danger-border)" : "var(--border-default)"}`,
        }}
      >
        <BumpButton onPress={(big) => bump(-(big ? step * 10 : step))} disabled={disabled || value <= min} aria-label="Decrement">
          −
        </BumpButton>
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) onValueChange?.(clamp(parsed, min, max));
          }}
          onBlur={() => {
            const parsed = Number(text);
            if (!Number.isFinite(parsed)) {
              setText(String(value));
              return;
            }
            apply(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              bump(e.shiftKey ? step * 10 : step);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              bump(-(e.shiftKey ? step * 10 : step));
            }
          }}
          disabled={disabled}
          className="w-16 bg-transparent text-center tabular-nums focus:outline-none"
          style={{ color: "var(--text-default)", fontSize: SIZE_FONT[size] }}
        />
        <BumpButton onPress={(big) => bump(big ? step * 10 : step)} disabled={disabled || value >= max} aria-label="Increment">
          +
        </BumpButton>
      </div>
      {error ? (
        <div className="text-xs" style={{ color: "var(--danger-fg)" }}>{error}</div>
      ) : hint ? (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>
      ) : null}
    </div>
  );
}

function BumpButton({
  children,
  onPress,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  onPress: (bigStep: boolean) => void;
  disabled?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={(e) => onPress(e.shiftKey)}
      disabled={disabled}
      className="px-3 transition-colors"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-default)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transitionDuration: "var(--duration-fast)",
        borderInlineEnd: "1px solid var(--border-subtle)",
        borderInlineStart: "1px solid var(--border-subtle)",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
