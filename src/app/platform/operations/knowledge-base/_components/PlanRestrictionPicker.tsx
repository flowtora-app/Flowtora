"use client";

// Page 34 — multi-select plan picker for KbArticle.visibilityPlans.
// Writes a comma-separated string into a hidden field for the form
// action to read.

import * as React from "react";

const PLAN_OPTIONS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

export function PlanRestrictionPicker({
  initialPlans,
  name,
  disabled,
}: {
  initialPlans: string[];
  name: string;
  disabled?: boolean;
}) {
  const [picked, setPicked] = React.useState<string[]>(initialPlans);
  const toggle = (p: string) => {
    setPicked((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };
  return (
    <>
      <input type="hidden" name={name} value={picked.join(", ")} />
      <div className="flex flex-wrap gap-1.5">
        {PLAN_OPTIONS.map((p) => {
          const checked = picked.includes(p);
          return (
            <label
              key={p}
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] cursor-pointer"
              style={{
                background: "var(--surface-1)",
                borderColor: checked ? "var(--accent-primary)" : "var(--border-default)",
                color: "var(--text-default)",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(p)}
                disabled={disabled}
                className="ts-focus h-3 w-3"
              />
              {p}
            </label>
          );
        })}
      </div>
    </>
  );
}
