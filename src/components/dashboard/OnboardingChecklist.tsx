import * as React from "react";
import Link from "next/link";
import type { OnboardingProgress } from "@/lib/onboarding";

// Phase 18 Slice D — onboarding checklist card.
//
// Rendered on the dashboard (for Owner/Admin personas only) until every
// step is done, at which point the parent hides the component entirely.
//
// Design goals vs. the previous inline block in dashboard/page.tsx:
//   - Uses the new design tokens (surface-1, accent-primary, etc.).
//   - Progress ring (circular) instead of a thin bar — feels more like
//     a status widget and less like a loading indicator.
//   - Each step shows a clearer done vs. pending state, with the next
//     undone step visually emphasized as the suggested action.

export interface OnboardingChecklistProps {
  slug: string;
  progress: OnboardingProgress;
}

export function OnboardingChecklist({ slug, progress }: OnboardingChecklistProps) {
  const nextUndoneKey = progress.steps.find((s) => !s.done)?.key ?? null;

  return (
    <section
      className="rounded-xl p-6"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-5">
        <ProgressRing percent={progress.percent} />
        <div className="flex-1">
          <h2
            className="text-base font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            Get Tracksign running in your shop
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {progress.completed} of {progress.total} steps complete. We&apos;ll
            hide this once everything&apos;s checked off.
          </p>
        </div>
      </div>

      <ul className="mt-5 grid gap-2 md:grid-cols-2">
        {progress.steps.map((s) => {
          const isNext = !s.done && s.key === nextUndoneKey;
          return (
            <li key={s.key}>
              <Link
                href={`/t/${slug}${s.href}`}
                className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:brightness-110"
                style={{
                  background: isNext ? "var(--accent-surface)" : "var(--surface-0)",
                  border: `1px solid ${
                    isNext
                      ? "var(--accent-surface-strong)"
                      : "var(--border-subtle)"
                  }`,
                  opacity: s.done ? 0.65 : 1,
                }}
              >
                <StepCheck done={s.done} next={isNext} />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-medium"
                    style={{
                      color: "var(--text-default)",
                      textDecoration: s.done ? "line-through" : "none",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="mt-0.5 text-xs leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {s.description}
                  </div>
                  {isNext && (
                    <div
                      className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      Next up →
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Tiny circular progress indicator. */
function ProgressRing({ percent }: { percent: number }) {
  const size = 60;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-primary)"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 300ms ease" }}
        />
      </svg>
      <span
        className="absolute text-xs font-semibold"
        style={{ color: "var(--text-default)" }}
      >
        {percent}%
      </span>
    </div>
  );
}

function StepCheck({ done, next }: { done: boolean; next: boolean }) {
  return (
    <span
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{
        background: done
          ? "var(--success-surface)"
          : next
            ? "var(--accent-primary)"
            : "transparent",
        color: done
          ? "var(--success-fg)"
          : next
            ? "var(--accent-fg)"
            : "var(--text-muted)",
        border: done
          ? "1px solid var(--success-fg)"
          : next
            ? "1px solid var(--accent-primary)"
            : "1px solid var(--border-default)",
      }}
    >
      {done ? "✓" : ""}
    </span>
  );
}
