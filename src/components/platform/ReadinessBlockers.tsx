import * as React from "react";

// "What's blocking the most tenants?" panel.
//
//   ⚠ Stripe customer linked       18 tenants   ████████████░░░░░ 60%
//   ⚠ First quote created          12 tenants   ████████░░░░░░░░░ 40%
//   · Logo or brand color set       9 tenants   ██████░░░░░░░░░░░ 30%
//
// Sorted by tenants-blocked desc. Required checks (✖ red) bubble up
// above optional ones (· dim). Helps PMs answer "what one thing would
// move the most tenants forward?".

export interface BlockerRow {
  id: string;
  label: string;
  required: boolean;
  /** Number of non-archived tenants that don't pass this check. */
  blockedCount: number;
}

export function ReadinessBlockers({
  blockers,
  totalTenants,
}: {
  blockers: BlockerRow[];
  totalTenants: number;
}) {
  // Sort: required first, then by impact (most-blocked descending).
  const sorted = [...blockers].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return b.blockedCount - a.blockedCount;
  });

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
        className="flex items-baseline justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Top blockers
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            Checks that the most tenants are still missing. Required first; dimmer rows are nice-to-have.
          </p>
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          across {totalTenants} tenant{totalTenants === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {sorted.map((b) => {
          const pct = totalTenants === 0 ? 0 : (b.blockedCount / totalTenants) * 100;
          const tone = b.required
            ? { fg: "var(--danger-fg)", bg: "var(--danger-surface)", icon: "⚠" }
            : { fg: "var(--text-muted)", bg: "var(--surface-2)",     icon: "·" };
          return (
            <li
              key={b.id}
              className="grid grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-[220px_80px_1fr_60px]"
              style={{ opacity: b.blockedCount === 0 ? 0.5 : 1 }}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: tone.bg, color: tone.fg }}
                >
                  {tone.icon}
                </span>
                <span
                  className="text-sm"
                  style={{ color: b.required ? "var(--text-default)" : "var(--text-muted)" }}
                >
                  {b.label}
                </span>
                {b.required && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--danger-surface)", color: "var(--danger-fg)" }}
                  >
                    required
                  </span>
                )}
              </div>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: tone.fg }}
              >
                {b.blockedCount}
                <span
                  className="ml-1 text-[10px] font-normal"
                  style={{ color: "var(--text-muted)" }}
                >
                  blocked
                </span>
              </span>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-3)" }}
              >
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${pct}%`,
                    background: b.required ? "var(--danger-fg)" : "var(--text-faint)",
                    transitionDuration: "var(--duration-base)",
                  }}
                />
              </div>
              <span
                className="text-right text-xs tabular-nums"
                style={{ color: "var(--text-muted)" }}
              >
                {pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
