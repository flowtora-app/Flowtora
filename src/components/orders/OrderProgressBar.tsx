import * as React from "react";
import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUSES, statusLabel } from "@/lib/orders";

// Phase 5 — Horizontal "step pipeline" shown in the sticky order
// header. Replaces the floating status chip with a glanceable dot
// diagram so someone scanning the page can see where the job is in
// its lifecycle without reading labels.
//
// We show five forward-moving steps:
//   NEW → IN_PRODUCTION → READY → OUT_FOR_INSTALL → COMPLETED
// CANCELED is intentionally not rendered as a step — when the order
// is canceled the dot row is replaced by a muted "Canceled" marker.

type StepValue = Extract<
  OrderStatus,
  "NEW" | "IN_PRODUCTION" | "READY" | "OUT_FOR_INSTALL" | "COMPLETED"
>;

const STEPS: StepValue[] = [
  "NEW",
  "IN_PRODUCTION",
  "READY",
  "OUT_FOR_INSTALL",
  "COMPLETED",
];

// Compact one-word labels so the strip fits on mobile without
// wrapping. Falls back to statusLabel() for anything unexpected.
const SHORT_LABELS: Record<StepValue, string> = {
  NEW:             "New",
  IN_PRODUCTION:   "In prod",
  READY:           "Ready",
  OUT_FOR_INSTALL: "Install",
  COMPLETED:       "Done",
};

export function OrderProgressBar({
  status,
  stagePct,
}: {
  status: OrderStatus;
  /** Optional 0–100 production-stage progress, used to fill the bar
   *  between "In prod" and "Ready" when the order is in production. */
  stagePct?: number;
}) {
  if (status === "CANCELED") {
    const color = ORDER_STATUSES.find((s) => s.value === "CANCELED")?.color ?? "var(--text-muted)";
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
        style={{ background: "var(--surface-1)", color: color, border: "1px solid var(--border-subtle)" }}
      >
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: color }} />
        Canceled — {statusLabel(status)}
      </div>
    );
  }

  const currentIdx = STEPS.indexOf(status as StepValue);
  // Not a forward step (shouldn't happen with a healthy enum) — bail.
  if (currentIdx < 0) return null;

  return (
    <div className="flex w-full items-center gap-0" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const isDone    = i <  currentIdx;
        const isCurrent = i === currentIdx;
        const stepColor = ORDER_STATUSES.find((s) => s.value === step)?.color ?? "var(--accent-primary)";

        // Fill between this step and the next one.
        let connectorPct = 0;
        if (i < currentIdx) connectorPct = 100;
        else if (i === currentIdx) {
          if (status === "IN_PRODUCTION" && stagePct != null && stagePct > 0 && stagePct < 100) {
            connectorPct = Math.min(100, Math.max(0, stagePct));
          }
        }

        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
              <div
                className="flex items-center justify-center rounded-full text-[10px] font-semibold"
                style={{
                  width:  isCurrent ? 22 : 18,
                  height: isCurrent ? 22 : 18,
                  background: isDone || isCurrent ? stepColor : "var(--surface-2)",
                  color:      isDone || isCurrent ? "white"    : "var(--text-muted)",
                  border: isCurrent ? `2px solid ${stepColor}` : "1px solid var(--border-subtle)",
                  boxShadow: isCurrent ? `0 0 0 3px color-mix(in srgb, ${stepColor} 20%, transparent)` : undefined,
                  transition: "all 120ms ease",
                }}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <div
                className="mt-1 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  color: isCurrent ? "var(--text-default)" : "var(--text-muted)",
                  fontWeight: isCurrent ? 600 : 500,
                }}
              >
                {SHORT_LABELS[step]}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 overflow-hidden rounded-full"
                style={{
                  height: 3,
                  background: "var(--surface-2)",
                  marginBottom: 18, /* align with dot centers, not labels */
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${connectorPct}%`,
                    background: stepColor,
                    transition: "width 200ms ease",
                  }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
