"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// TimePicker — Spec Page 0 §0.5.7.
//
// 12h / 24h based on locale. Hour + minute spinners with up/down
// arrows; AM/PM toggle in 12h mode. `minuteStep` prop (default 5).

export interface TimeValue {
  hours: number;   // 0-23
  minutes: number; // 0-59
}

export interface TimePickerProps {
  value: TimeValue;
  onChange: (next: TimeValue) => void;
  /** 12 = AM/PM, 24 = 24-hour. Defaults to 12 (US locale convention). */
  format?: 12 | 24;
  minuteStep?: number;
  size?: "sm" | "md" | "lg";
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  disabled?: boolean;
}

const SIZE_CLASS = {
  sm: "h-8  text-[13px]",
  md: "h-9  text-[14px]",
  lg: "h-10 text-[14px]",
} as const;

function pad(n: number): string { return n.toString().padStart(2, "0"); }

export function TimePicker({
  value,
  onChange,
  format = 12,
  minuteStep = 5,
  size = "md",
  label,
  hint,
  error,
  className,
  disabled,
}: TimePickerProps) {
  const isPM = value.hours >= 12;
  const display12 = format === 12 ? ((value.hours % 12) || 12) : value.hours;

  const setHours12 = (h12: number, pm: boolean) => {
    const h24 = (h12 % 12) + (pm ? 12 : 0);
    onChange({ hours: h24, minutes: value.minutes });
  };

  const setHours24 = (h: number) => {
    onChange({ hours: ((h % 24) + 24) % 24, minutes: value.minutes });
  };

  const setMinutes = (m: number) => {
    onChange({ hours: value.hours, minutes: ((m % 60) + 60) % 60 });
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{label}</label>
      )}
      <div
        className={cn(
          "ts-focus inline-flex items-center gap-1 rounded-md border bg-transparent px-2",
          SIZE_CLASS[size],
        )}
        style={{
          background: "var(--surface-1)",
          borderColor: error ? "var(--danger-border, var(--rose-500))" : "var(--border-default)",
          color: "var(--text-default)",
          opacity: disabled ? 0.5 : 1,
          pointerEvents: disabled ? "none" : undefined,
        }}
      >
        <Spinner
          value={display12}
          onChange={(n) => format === 12 ? setHours12(n, isPM) : setHours24(n)}
          min={format === 12 ? 1 : 0}
          max={format === 12 ? 12 : 23}
        />
        <span style={{ color: "var(--text-muted)" }}>:</span>
        <Spinner
          value={value.minutes}
          onChange={setMinutes}
          min={0}
          max={59}
          step={minuteStep}
        />
        {format === 12 && (
          <button
            type="button"
            onClick={() => setHours12(display12, !isPM)}
            className="ts-focus ml-1 inline-flex items-center rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            {isPM ? "PM" : "AM"}
          </button>
        )}
      </div>
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}>{error ?? hint}</span>
      )}
    </div>
  );
}

function Spinner({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        onClick={() => {
          let n = value - step;
          if (n < min) n = max;
          onChange(n);
        }}
        className="ts-focus px-1 text-xs"
        style={{ color: "var(--text-muted)" }}
        aria-label="Decrement"
      >
        ▾
      </button>
      <span className="w-7 text-center font-mono tabular-nums" style={{ color: "var(--text-default)" }}>
        {pad(value)}
      </span>
      <button
        type="button"
        onClick={() => {
          let n = value + step;
          if (n > max) n = min;
          onChange(n);
        }}
        className="ts-focus px-1 text-xs"
        style={{ color: "var(--text-muted)" }}
        aria-label="Increment"
      >
        ▴
      </button>
    </div>
  );
}
