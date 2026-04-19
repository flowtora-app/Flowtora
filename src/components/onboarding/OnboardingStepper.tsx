"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Phase 18 Slice D — onboarding stepper.
//
// Client component so we can drive the active-step highlight off the
// current pathname. The layout (server) owns data; this owns chrome.
//
// Behavior notes:
//   - Steps before the current one are clickable (go back).
//   - The current step is highlighted.
//   - Steps after the current one are disabled — we don't let users
//     skip forward because each step has real side effects (saving to
//     the tenant). They can advance by completing the form.
//   - The welcome index (`/onboarding`) shows with all steps as
//     "upcoming" and the intro callout highlighted.

export interface OnboardingStepperStep {
  slug: string;
  label: string;
  description: string;
}

export interface OnboardingStepperProps {
  tenantSlug: string;
  tenantName: string;
  steps: OnboardingStepperStep[];
}

export function OnboardingStepper({ tenantSlug, tenantName, steps }: OnboardingStepperProps) {
  const pathname = usePathname() ?? "";
  const base = `/t/${tenantSlug}/onboarding`;
  const tail = pathname.replace(base, "").replace(/^\//, "");
  // Welcome is the empty tail (or "done" has its own handling elsewhere).
  const isWelcome = tail === "" || tail === "index";
  const isDone = tail === "done";
  const currentIndex = isWelcome ? -1 : steps.findIndex((s) => s.slug === tail);

  return (
    <header className="mb-10">
      <div
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--accent-primary)" }}
      >
        Setting up {tenantName}
      </div>
      <h1
        className="mt-1 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--text-default)" }}
      >
        {isDone
          ? "You're ready to go."
          : isWelcome
            ? "Welcome to Tracksign."
            : steps[currentIndex]?.label ?? "Setup"}
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {isDone
          ? "Your shop is set up. Jump into the dashboard when you're ready."
          : isWelcome
            ? "Five minutes of setup puts your shop on solid footing."
            : steps[currentIndex]?.description}
      </p>

      {!isDone && (
        <ol
          className="mt-8 grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((s, i) => {
            const state: "done" | "current" | "upcoming" =
              currentIndex < 0
                ? "upcoming"
                : i < currentIndex
                  ? "done"
                  : i === currentIndex
                    ? "current"
                    : "upcoming";
            const clickable = state === "done";
            const content = (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                  clickable && "hover:brightness-110",
                )}
                style={{
                  background:
                    state === "current"
                      ? "var(--accent-surface)"
                      : state === "done"
                        ? "var(--surface-1)"
                        : "transparent",
                  borderColor:
                    state === "current"
                      ? "var(--accent-surface-strong)"
                      : "var(--border-subtle)",
                  opacity: state === "upcoming" ? 0.6 : 1,
                }}
              >
                <StepBubble index={i + 1} state={state} />
                <div className="min-w-0">
                  <div
                    className="text-xs font-semibold"
                    style={{
                      color:
                        state === "current"
                          ? "var(--accent-primary)"
                          : "var(--text-default)",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="truncate text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {s.description}
                  </div>
                </div>
              </div>
            );
            return (
              <li key={s.slug}>
                {clickable ? (
                  <Link href={`${base}/${s.slug}`} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
      )}
    </header>
  );
}

function StepBubble({
  index,
  state,
}: {
  index: number;
  state: "done" | "current" | "upcoming";
}) {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        background:
          state === "done"
            ? "var(--success-surface)"
            : state === "current"
              ? "var(--accent-primary)"
              : "transparent",
        color:
          state === "done"
            ? "var(--success-fg)"
            : state === "current"
              ? "var(--accent-fg)"
              : "var(--text-muted)",
        border:
          state === "upcoming"
            ? "1px solid var(--border-default)"
            : state === "done"
              ? "1px solid var(--success-fg)"
              : "1px solid var(--accent-primary)",
      }}
    >
      {state === "done" ? "✓" : index}
    </span>
  );
}
