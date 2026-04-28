import * as React from "react";
import { cn } from "@/lib/cn";

// Leaderboard — ranked list with a value bar showing relative magnitude.
// Used for "top customers", "top sellers", "top vendors", etc.
//
//   <Leaderboard
//     entries={[
//       { id: "a", name: "Acme Sign Co.", value: 12_400 },
//       { id: "b", name: "Bricks LLC",    value:  8_200 },
//     ]}
//     formatValue={(n) => `$${n.toLocaleString()}`}
//   />

export interface LeaderboardEntry {
  id: string;
  name: React.ReactNode;
  value: number;
  /** Optional avatar/icon node rendered to the left of the name. */
  badge?: React.ReactNode;
  /** Optional secondary line (e.g. "12 orders"). */
  hint?: React.ReactNode;
}

export interface LeaderboardProps {
  entries: LeaderboardEntry[];
  /** Cap rendered rows; trailing rows hidden silently. */
  maxItems?: number;
  /** Format the trailing value (default: localeString). */
  formatValue?: (n: number) => string;
  className?: string;
}

const RANK_COLORS = [
  "var(--accent-primary)",
  "var(--accent-primary)",
  "var(--accent-primary)",
];

export function Leaderboard({
  entries,
  maxItems = 8,
  formatValue = (n) => n.toLocaleString(),
  className,
}: LeaderboardProps) {
  const rows = entries.slice(0, maxItems);
  const peak = rows.reduce((m, r) => Math.max(m, r.value), 0) || 1;

  return (
    <ol className={cn("space-y-2", className)}>
      {rows.map((row, i) => {
        const pct = (row.value / peak) * 100;
        return (
          <li
            key={row.id}
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: "1.5rem 1fr auto" }}
          >
            <span
              className="text-center text-xs font-semibold tabular-nums"
              style={{ color: i < 3 ? RANK_COLORS[i]! : "var(--text-faint)" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {row.badge}
                <div
                  className="truncate text-sm"
                  style={{ color: "var(--text-default)" }}
                >
                  {row.name}
                </div>
              </div>
              <div
                className="mt-1 h-1 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-3)" }}
              >
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{
                    width: `${pct}%`,
                    background: "var(--accent-primary)",
                    transitionDuration: "var(--duration-base)",
                  }}
                />
              </div>
              {row.hint && (
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  {row.hint}
                </div>
              )}
            </div>
            <div
              className="text-right text-sm tabular-nums"
              style={{ color: "var(--text-default)" }}
            >
              {formatValue(row.value)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
