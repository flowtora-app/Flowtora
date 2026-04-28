"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Slider — single-value or range selection. Built on top of one or two
// hidden <input type="range"> controls so keyboard, screen readers, and
// pointer interaction all "just work" via native semantics; the visual
// is a custom track + thumbs painted on top.
//
//   <Slider value={[40]}     onValueChange={([n]) => setN(n)} min={0} max={100} />
//   <Slider value={[20, 80]} onValueChange={setRange}        min={0} max={100} />

export interface SliderProps {
  value: number[];                 // [single] or [low, high]
  onValueChange?: (next: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
  formatValue?: (n: number) => string;
  className?: string;
  /** ARIA label for the (single) thumb when `value.length === 1`. */
  label?: string;
}

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 16;

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  showValue = false,
  formatValue = (n) => String(n),
  className,
  label,
}: SliderProps) {
  const isRange = value.length === 2;
  const lo = isRange ? Math.min(value[0]!, value[1]!) : value[0]!;
  const hi = isRange ? Math.max(value[0]!, value[1]!) : value[0]!;

  const pct = (n: number) => ((n - min) / (max - min)) * 100;

  const onSingleChange = (next: number) => {
    onValueChange?.([clamp(next, min, max)]);
  };

  const onRangeChange = (idx: 0 | 1, next: number) => {
    const clamped = clamp(next, min, max);
    const a = idx === 0 ? clamped : value[0]!;
    const b = idx === 1 ? clamped : value[1]!;
    // Don't reorder; the parent decides if it wants ordered values.
    onValueChange?.([a, b]);
  };

  return (
    <div
      className={cn("relative w-full select-none", disabled && "opacity-60", className)}
      style={{ paddingTop: showValue ? 22 : 8, paddingBottom: 8 }}
    >
      {showValue && (
        <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
          <span>{isRange ? formatValue(lo) : ""}</span>
          <span>{isRange ? formatValue(hi) : formatValue(value[0]!)}</span>
        </div>
      )}

      <div
        className="relative w-full rounded-full"
        style={{ height: TRACK_HEIGHT, background: "var(--surface-3)" }}
      >
        <div
          className="absolute h-full rounded-full"
          style={{
            left: `${pct(lo)}%`,
            width: `${pct(hi) - pct(lo)}%`,
            background: "var(--accent-primary)",
          }}
        />
        {/* visible thumbs */}
        <Thumb left={pct(value[0]!)} />
        {isRange && <Thumb left={pct(value[1]!)} />}
        {/* hidden native ranges — they receive keyboard / pointer */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0]}
          disabled={disabled}
          aria-label={label}
          onChange={(e) =>
            isRange ? onRangeChange(0, Number(e.target.value)) : onSingleChange(Number(e.target.value))
          }
          className="ts-slider-input"
          style={inputStyle}
        />
        {isRange && (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value[1]}
            disabled={disabled}
            onChange={(e) => onRangeChange(1, Number(e.target.value))}
            className="ts-slider-input"
            style={inputStyle}
          />
        )}
      </div>
    </div>
  );
}

function Thumb({ left }: { left: number }) {
  return (
    <span
      aria-hidden
      className="absolute top-1/2 rounded-full"
      style={{
        left: `${left}%`,
        transform: `translate(-50%, -50%)`,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        background: "var(--surface-1)",
        border: "2px solid var(--accent-primary)",
        boxShadow: "var(--shadow-sm)",
      }}
    />
  );
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

// The native ranges sit on top of the painted track. Setting their
// thumbs invisible lets the user interact (keyboard + pointer) while
// our visual layer renders the look. Each range is positioned absolute
// across the full track so both thumbs receive events even at overlap.
const inputStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  background: "transparent",
  appearance: "none",
  pointerEvents: "auto",
  opacity: 0,
  cursor: "pointer",
};
