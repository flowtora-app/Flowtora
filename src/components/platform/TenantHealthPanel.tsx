import * as React from "react";
import type { TenantHealth } from "@/lib/tenant-health";
import type { ReadinessReport } from "@/lib/readiness";

// Combined health + launch-readiness panel.
//
//   ┌──────────────────────────────┬──────────────────────────────┐
//   │  HEALTH                       │  LAUNCH READINESS              │
//   │  ● Healthy                    │  ████████████░░░░░░  72%        │
//   │  Active 2d ago · 14d in trial │  6/8 required · 9/12 overall    │
//   │                                │                                  │
//   │  • Active in last 7 days      │  Still missing:                  │
//   │  • On Professional plan       │  ! Add a Stripe customer        │
//   │  • Stripe in good standing    │  · Load sample data             │
//   └──────────────────────────────┴──────────────────────────────┘
//
// Both panels read from already-computed inputs — no DB calls inside
// this component, so it can be dropped into any tab without cost.

const HEALTH_TONE: Record<TenantHealth["level"], { bg: string; fg: string; label: string }> = {
  healthy:   { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Healthy"     },
  attention: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Attention"   },
  "at-risk": { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "At risk"     },
  critical:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      label: "Critical"    },
  dormant:   { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "Dormant"     },
};

export function TenantHealthPanel({
  health,
  readiness,
  lastActivityLabel,
}: {
  health: TenantHealth;
  readiness: ReadinessReport;
  /** Human-readable last-activity, e.g. "Active today" or "Idle 14 days". */
  lastActivityLabel: string;
}) {
  const tone = HEALTH_TONE[health.level];
  const missing = readiness.checks.filter((c) => !c.done);
  const required = missing.filter((c) => c.required);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* ─── Health card ──────────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--text-muted)" }}
        >
          Health
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: tone.fg }}
            />
            {tone.label}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            · {lastActivityLabel}
            {health.daysUntilTrialEnd !== null && health.daysUntilTrialEnd >= 0 && (
              <> · {health.daysUntilTrialEnd}d trial left</>
            )}
            {health.isPaying && <> · paying</>}
          </span>
        </div>
        {health.signals.length > 0 ? (
          <ul className="mt-4 space-y-1.5 text-sm">
            {health.signals.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-2"
                style={{ color: "var(--text-default)" }}
              >
                <span
                  aria-hidden
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: tone.fg }}
                />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No active signals — tenant looks normal.
          </p>
        )}
      </div>

      {/* ─── Readiness card ───────────────────────────────────── */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div className="flex items-baseline justify-between">
          <div
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Launch readiness
          </div>
          <div
            className="text-xs"
            style={{ color: readiness.ready ? "var(--success-fg)" : "var(--text-muted)" }}
          >
            {readiness.requiredDone}/{readiness.requiredTotal} required ·{" "}
            {readiness.doneCount}/{readiness.totalCount} overall
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <span
            className="text-3xl font-semibold tabular-nums tracking-tight"
            style={{
              color: readiness.ready ? "var(--success-fg)" : "var(--text-default)",
            }}
          >
            {readiness.percent}%
          </span>
          {readiness.ready && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
            >
              ready to launch
            </span>
          )}
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full"
          style={{ background: "var(--surface-3)" }}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${readiness.percent}%`,
              background: readiness.ready ? "var(--success-fg)" : "var(--accent-primary)",
              transitionDuration: "var(--duration-base)",
            }}
          />
        </div>
        {missing.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
            All checks pass.
          </p>
        ) : (
          <div className="mt-4">
            <div
              className="mb-2 text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              Still missing
            </div>
            <ul className="space-y-1.5 text-sm">
              {missing.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      background: c.required ? "var(--danger-surface)" : "var(--surface-2)",
                      color:      c.required ? "var(--danger-fg)"      : "var(--text-muted)",
                    }}
                  >
                    {c.required ? "!" : "·"}
                  </span>
                  <span style={{ color: "var(--text-default)" }}>{c.label}</span>
                </li>
              ))}
              {missing.length > 5 && (
                <li className="text-xs" style={{ color: "var(--text-muted)" }}>
                  + {missing.length - 5} more
                </li>
              )}
            </ul>
            {required.length > 0 && (
              <div
                className="mt-3 text-xs"
                style={{ color: "var(--danger-fg)" }}
              >
                {required.length} required check{required.length === 1 ? "" : "s"} blocking launch
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
