import * as React from "react";
import { cn } from "@/lib/cn";

// Stepper — Spec Page 0 §0.5.24 (Stepper / Wizard).
//
// Orientation: horizontal (top), vertical (left rail).
// Step:   filled emerald-500 when complete (with check); brand-600
//         ring when current; gray when upcoming. Spec colors —
//         intentionally distinct from the brand accent so "done" reads
//         differently from "active step." Errors get a rose ring + ×.
// Connector: line; turns brand-600 when crossed.
//
//   <Stepper
//     orientation="horizontal"
//     currentStep={1}
//     steps={[
//       { id: "customer", title: "Customer" },
//       { id: "items",    title: "Items"    },
//       { id: "review",   title: "Review"   },
//       { id: "send",     title: "Send"     },
//     ]}
//   />

export type StepState = "completed" | "current" | "upcoming" | "error";

export interface StepperStep {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  state?: StepState;
  disabled?: boolean;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index or id of the current step (used when individual `state` not set). */
  currentStep?: number | string;
  orientation?: "horizontal" | "vertical";
  onStepClick?: (step: StepperStep, index: number) => void;
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  orientation = "horizontal",
  onStepClick,
  className,
}: StepperProps) {
  const currentIdx = resolveCurrent(steps, currentStep);

  return (
    <ol
      className={cn(
        orientation === "horizontal" ? "flex items-start gap-3" : "flex flex-col gap-4",
        className,
      )}
    >
      {steps.map((step, i) => {
        const state: StepState =
          step.state ??
          (i < currentIdx ? "completed" : i === currentIdx ? "current" : "upcoming");
        const isLast = i === steps.length - 1;
        const clickable = !!onStepClick && !step.disabled;

        return (
          <li
            key={step.id}
            className={cn(
              orientation === "horizontal" ? "flex flex-1 items-start gap-3" : "flex items-start gap-3",
            )}
          >
            <div className="flex flex-col items-center">
              <Dot state={state} index={i} />
              {orientation === "vertical" && !isLast && (
                <span
                  aria-hidden
                  className="mt-1 w-px flex-1"
                  style={{
                    minHeight: 18,
                    background:
                      state === "completed" ? "var(--brand-600, var(--accent-primary))" : "var(--border-default)",
                  }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(step, i)}
                className={cn(
                  "block w-full text-left",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <div
                  className="text-sm font-medium"
                  style={{
                    color:
                      state === "current" || state === "completed"
                        ? "var(--text-default)"
                        : state === "error"
                        ? "var(--danger-fg)"
                        : "var(--text-muted)",
                  }}
                >
                  {step.title}
                </div>
                {step.description && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {step.description}
                  </div>
                )}
              </button>
            </div>
            {orientation === "horizontal" && !isLast && (
              <span
                aria-hidden
                className="mt-3 h-px flex-1"
                style={{
                  background:
                    state === "completed" ? "var(--accent-primary)" : "var(--border-default)",
                }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ state, index }: { state: StepState; index: number }) {
  const baseStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    borderRadius: "9999px",
    border: "1px solid var(--border-default)",
    background: "var(--surface-1)",
    color: "var(--text-muted)",
    fontSize: 11,
    fontWeight: 600,
  };

  if (state === "completed") {
    // Spec: filled emerald-500 with check.
    Object.assign(baseStyle, {
      background: "var(--emerald-500, var(--success))",
      borderColor: "var(--emerald-500, var(--success))",
      color: "#ffffff",
    });
  } else if (state === "current") {
    // Spec: brand-600 ring around the dot.
    Object.assign(baseStyle, {
      borderColor: "var(--brand-600, var(--accent-primary))",
      color: "var(--brand-700, var(--accent-primary))",
      boxShadow: "0 0 0 4px var(--brand-100, var(--accent-surface))",
    });
  } else if (state === "error") {
    // Spec: rose ring + ! icon.
    Object.assign(baseStyle, {
      background: "var(--rose-50, var(--danger-surface))",
      borderColor: "var(--rose-500, var(--danger))",
      color: "var(--rose-700, var(--danger-fg))",
    });
  }

  return (
    <span className="inline-flex items-center justify-center" style={baseStyle}>
      {state === "completed" ? (
        <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
        </svg>
      ) : state === "error" ? (
        // Spec §0.5.24 — rose ring + "!" glyph.
        <span aria-hidden style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>!</span>
      ) : (
        index + 1
      )}
    </span>
  );
}

function resolveCurrent(steps: StepperStep[], current: number | string | undefined): number {
  if (typeof current === "number") return current;
  if (typeof current === "string") {
    const idx = steps.findIndex((s) => s.id === current);
    if (idx >= 0) return idx;
  }
  // Default: index of the first step that isn't completed.
  const firstIncomplete = steps.findIndex((s) => s.state !== "completed");
  return firstIncomplete < 0 ? steps.length : firstIncomplete;
}
