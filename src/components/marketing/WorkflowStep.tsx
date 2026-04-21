import * as React from "react";
import { SectionEyebrow } from "./SectionEyebrow";

// WorkflowStep — one leg of a multi-step workflow walkthrough. Used on
// the industry pages (/for-sign-shops, /for-print-shops) where we
// alternate L/R through six steps. Lighter-weight than FeatureShowcase
// (which is a full section with its own background): WorkflowStep
// renders inline inside a parent Section so a caller can stack many.
//
// Design notes:
//   • A big step number sits at the top of the copy column (tokenized
//     accent color) so the sequence reads at a glance — sequence
//     matters more than title on a walkthrough.
//   • Visual column uses the same backdrop halo as FeatureShowcase so
//     the walkthrough feels of a piece with the rest of the site.
//   • `reverse` flips the column order on desktop only. On mobile it's
//     always copy-then-visual.
//   • Caller owns the visual node (mock, image, etc.).

export interface WorkflowStepProps {
  step: string | number;
  title: React.ReactNode;
  description?: React.ReactNode;
  bullets?: React.ReactNode[];
  visual: React.ReactNode;
  reverse?: boolean;
  eyebrow?: React.ReactNode;
}

export function WorkflowStep({
  step,
  title,
  description,
  bullets,
  visual,
  reverse = false,
  eyebrow,
}: WorkflowStepProps) {
  return (
    <div
      className={`grid grid-cols-1 items-center gap-10 py-8 md:gap-14 md:py-12 lg:grid-cols-[1fr_1.1fr] ${
        reverse ? "lg:[direction:rtl]" : ""
      }`}
    >
      {/* Copy */}
      <div
        className="order-1 min-w-0 lg:order-none"
        style={{ direction: "ltr" }}
      >
        <div className="flex items-baseline gap-3">
          <span
            className="font-mono text-4xl font-semibold tracking-tight md:text-5xl"
            style={{
              color: "var(--accent-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            {typeof step === "number" ? String(step).padStart(2, "0") : step}
          </span>
          {eyebrow && <SectionEyebrow variant="dot">{eyebrow}</SectionEyebrow>}
        </div>
        <h3
          className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl"
          style={{
            color: "var(--text-default)",
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            className="mt-3 max-w-xl text-base leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            {description}
          </p>
        )}
        {bullets && bullets.length > 0 && (
          <ul className="mt-5 space-y-2">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-sm"
                style={{ color: "var(--text-default)" }}
              >
                <span
                  aria-hidden
                  className="mt-[7px] inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: "var(--accent-primary)" }}
                />
                <span style={{ color: "var(--text-muted)" }}>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Visual */}
      <div
        className="order-2 relative min-w-0 lg:order-none"
        style={{ direction: "ltr" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, var(--accent-surface) 0%, transparent 60%)",
            opacity: 0.5,
            filter: "blur(50px)",
          }}
        />
        {visual}
      </div>
    </div>
  );
}
