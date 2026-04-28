import * as React from "react";
import { cn } from "@/lib/cn";

// Stepper — multi-step progress indicator (horizontal or vertical).
// Each step is described declaratively; the component figures out
// which dot is filled, ringed, or marked with an error glyph based on
// the `state`, with `current` automatically computed when omitted.
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
                      state === "completed" ? "var(--accent-primary)" : "var(--border-default)",
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
    Object.assign(baseStyle, {
      background: "var(--accent-primary)",
      borderColor: "var(--accent-primary)",
      color: "var(--accent-fg)",
    });
  } else if (state === "current") {
    Object.assign(baseStyle, {
      borderColor: "var(--accent-primary)",
      color: "var(--accent-primary)",
      boxShadow: "0 0 0 4px var(--accent-surface)",
    });
  } else if (state === "error") {
    Object.assign(baseStyle, {
      background: "var(--danger-surface)",
      borderColor: "var(--danger-border, var(--danger))",
      color: "var(--danger-fg)",
    });
  }

  return (
    <span className="inline-flex items-center justify-center" style={baseStyle}>
      {state === "completed" ? (
        <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
        </svg>
      ) : state === "error" ? (
        <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
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
