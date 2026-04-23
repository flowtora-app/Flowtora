import * as React from "react";

// Compact "↑ 12.4%" pill used next to KPIs.
//
// Semantics:
//   - `value` is a signed percentage. +5.2 → up, -3.1 → down, 0 → flat.
//   - `invertGood` flips the color logic: for churn, down is good.
//   - null → render a neutral dash (no delta available).

type Props = {
  value: number | null;
  invertGood?: boolean;
  suffix?: string; // default "%"
  hint?: string;   // for tooltip ("vs. last 30 days")
};

export function DeltaPill({ value, invertGood = false, suffix = "%", hint }: Props) {
  if (value == null) {
    return (
      <span
        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
        title={hint}
      >
        —
      </span>
    );
  }

  const rounded = Math.round(value * 10) / 10;
  const up = rounded > 0;
  const flat = rounded === 0;

  const positive = flat ? false : invertGood ? !up : up;
  const fg = flat
    ? "var(--text-muted)"
    : positive
      ? "var(--success-fg)"
      : "var(--danger-fg)";
  const bg = flat
    ? "var(--surface-2)"
    : positive
      ? "var(--success-surface)"
      : "var(--danger-surface)";

  const arrow = flat ? "·" : up ? "↑" : "↓";
  const magnitude = Math.abs(rounded);

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
      style={{ background: bg, color: fg }}
      title={hint}
    >
      <span aria-hidden>{arrow}</span>
      <span>
        {magnitude}
        {suffix}
      </span>
    </span>
  );
}
