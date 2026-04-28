import * as React from "react";

// Activation funnel visualization for /platform/readiness.
//
//   Tenant created           42  ████████████████████ 100%
//   Onboarding completed     38  ██████████████████░░ 90%
//   First customer           34  █████████████████░░░ 81%   ↓ -10%
//   First product            29  ██████████████░░░░░░ 69%   ↓ -15% (biggest drop-off)
//   First quote              22  ███████████░░░░░░░░░ 52%
//   First order              16  ████████░░░░░░░░░░░░ 38%
//   Stripe connected         12  ██████░░░░░░░░░░░░░░ 29%
//   Fully ready              10  █████░░░░░░░░░░░░░░░ 24%
//
// Each stage is a bar with the absolute count + cumulative % of the
// top-of-funnel total. Rows that show the largest drop-off from the
// previous step get a red callout — that's where attention goes first.

export interface FunnelStage {
  id: string;
  label: string;
  count: number;
  /** Optional href to drill into "tenants who haven't passed this stage". */
  href?: string;
}

export function ActivationFunnel({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) return null;
  const top = stages[0].count || 1;

  // Compute drop-off vs previous stage for each row, and find the biggest.
  let biggestDropIdx = -1;
  let biggestDropAmount = 0;
  for (let i = 1; i < stages.length; i++) {
    const drop = stages[i - 1].count - stages[i].count;
    if (drop > biggestDropAmount) {
      biggestDropAmount = drop;
      biggestDropIdx = i;
    }
  }

  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          Activation funnel
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          From tenant creation to "fully ready". The biggest drop-off is where to focus next.
        </p>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {stages.map((s, i) => {
          const pct = top === 0 ? 0 : (s.count / top) * 100;
          const prevCount = i > 0 ? stages[i - 1].count : null;
          const dropAbs = prevCount != null ? prevCount - s.count : 0;
          const dropPct = prevCount && prevCount > 0 ? (dropAbs / prevCount) * 100 : 0;
          const isBiggestDrop = i === biggestDropIdx && dropAbs > 0;
          const barColor = isBiggestDrop
            ? "var(--danger-fg)"
            : pct >= 80
            ? "var(--success-fg)"
            : pct >= 50
            ? "var(--accent-primary)"
            : "var(--warning-fg)";

          return (
            <li key={s.id} className="px-5 py-3">
              <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[220px_60px_1fr_120px]">
                <span className="text-sm" style={{ color: "var(--text-default)" }}>
                  {s.label}
                </span>
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: "var(--text-default)" }}
                >
                  {s.count.toLocaleString()}
                </span>
                <div
                  className="h-2 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--surface-3)" }}
                  aria-label={`${pct.toFixed(0)}% of top of funnel`}
                  title={`${pct.toFixed(1)}%`}
                >
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${pct}%`,
                      background: barColor,
                      transitionDuration: "var(--duration-base)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 text-xs">
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {pct.toFixed(0)}%
                  </span>
                  {prevCount != null && dropAbs > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 tabular-nums"
                      style={{
                        background: isBiggestDrop ? "var(--danger-surface)" : "var(--surface-2)",
                        color:      isBiggestDrop ? "var(--danger-fg)"      : "var(--text-muted)",
                      }}
                      title={`${dropAbs} tenant${dropAbs === 1 ? "" : "s"} drop out at this stage`}
                    >
                      ↓ {dropPct.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {biggestDropIdx > 0 && (
        <div
          className="px-5 py-3 text-xs"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--surface-2)",
            color: "var(--text-muted)",
          }}
        >
          <b style={{ color: "var(--danger-fg)" }}>Biggest drop-off:</b>{" "}
          <span style={{ color: "var(--text-default)" }}>{stages[biggestDropIdx].label}</span> —{" "}
          {biggestDropAmount} tenant{biggestDropAmount === 1 ? "" : "s"} stop here. This is the highest-leverage step to fix.
        </div>
      )}
    </section>
  );
}
