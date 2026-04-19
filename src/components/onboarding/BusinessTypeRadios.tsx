"use client";

import * as React from "react";
import type { BusinessType } from "@prisma/client";
import { businessDefaultsFor } from "@/lib/business-defaults";

// Phase 4 Slice A — business type picker with live-filtering services.
//
// Sits inside a server-rendered <form>, so we just mutate the checkbox
// inputs the server component already rendered. Two side effects per
// selection:
//   1. Toggle each service checkbox to match the preset. We only touch
//      presets for the NEW selection vs. the old one — if the user
//      manually checked something outside the preset, we leave it alone
//      (no "surprise, your custom picks vanished").
//   2. Swap the rationale paragraph below the fieldset.
//
// `hasStoredServices` lets the parent decide whether this is the first
// render (apply preset freely) or a re-edit (respect stored values,
// only swap on explicit radio change).

const OPTIONS: ReadonlyArray<[BusinessType, string, string]> = [
  ["SIGN_SHOP", "Sign shop", "Vehicle wraps, channel letters, large-format signage."],
  ["PRINT_SHOP", "Print shop", "Business cards, flyers, packaging, wide-format."],
  ["HYBRID", "Both signs and print", "Full-service shop with signage and print work."],
  ["OTHER", "Something else", "We'll keep defaults neutral and you can tune later."],
];

export function BusinessTypeRadios({
  initialType,
  hasStoredServices,
}: {
  initialType: BusinessType;
  hasStoredServices: boolean;
}) {
  const [type, setType] = React.useState<BusinessType>(initialType);
  // Track the preset we last APPLIED so we can undo only that preset's
  // picks when the user swaps — user-added picks outside the preset
  // shouldn't be cleared.
  const lastAppliedRef = React.useRef<BusinessType | null>(
    hasStoredServices ? null : initialType,
  );

  const preset = businessDefaultsFor(type);

  const handleChange = (next: BusinessType) => {
    setType(next);

    const form = document.querySelector<HTMLFormElement>("form");
    if (!form) return;

    const prevPreset = lastAppliedRef.current
      ? businessDefaultsFor(lastAppliedRef.current).services
      : [];
    const nextPreset = businessDefaultsFor(next).services;

    // Uncheck items the old preset added but the new preset doesn't.
    for (const service of prevPreset) {
      if (!nextPreset.includes(service)) {
        const el = form.querySelector<HTMLInputElement>(
          `input[type="checkbox"][name="services"][value="${cssEscape(service)}"]`,
        );
        if (el && !el.dataset.userTouched) el.checked = false;
      }
    }
    // Check items the new preset wants that aren't already on.
    for (const service of nextPreset) {
      const el = form.querySelector<HTMLInputElement>(
        `input[type="checkbox"][name="services"][value="${cssEscape(service)}"]`,
      );
      if (el && !el.dataset.userTouched) el.checked = true;
    }
    lastAppliedRef.current = next;
  };

  // Track user overrides — any checkbox the user clicks directly gets a
  // `data-user-touched` attribute, and we never overwrite those after.
  React.useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("form");
    if (!form) return;
    const boxes = form.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"][name="services"]',
    );
    const handler = (e: Event) => {
      const el = e.currentTarget as HTMLInputElement;
      el.dataset.userTouched = "1";
    };
    boxes.forEach((b) => b.addEventListener("change", handler));
    return () => boxes.forEach((b) => b.removeEventListener("change", handler));
  }, []);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Business type</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map(([value, label, hint]) => {
          const active = type === value;
          return (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors"
              style={{
                background: active ? "var(--accent-surface)" : "var(--surface-0)",
                borderColor: active
                  ? "var(--accent-surface-strong)"
                  : "var(--border-subtle)",
              }}
            >
              <input
                type="radio"
                name="businessType"
                value={value}
                checked={type === value}
                onChange={() => handleChange(value)}
                className="mt-0.5"
                required
              />
              <div className="min-w-0">
                <div
                  className="font-medium"
                  style={{
                    color: active ? "var(--accent-primary)" : "var(--text-default)",
                  }}
                >
                  {label}
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {hint}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <p
        className="rounded-md px-3 py-2 text-xs leading-relaxed"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <span
          className="font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Recommended defaults:{" "}
        </span>
        {preset.rationale}
      </p>
    </fieldset>
  );
}

// Minimal CSS.escape polyfill for attribute selectors. Service labels
// contain spaces and `&` — both break naive `[value=""]` queries without
// escaping. CSS.escape is safe on modern browsers but we defend against
// the edge case where it's missing.
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/([^\w-])/g, "\\$1");
}
