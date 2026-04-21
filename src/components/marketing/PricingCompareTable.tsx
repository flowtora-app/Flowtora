import * as React from "react";

// PricingCompareTable — the deep feature-by-feature pricing matrix.
//
// Sibling to PricingTable (the tier cards at the top of /pricing);
// this component is the lower, scannable grid that answers "exactly
// what do I get in Pro vs. Enterprise?". Grouped by category with
// sticky category headers on desktop, horizontal-scroll on mobile so
// long feature labels don't truncate.
//
// Design notes:
//   • We rely on <table> for accessibility — screen readers know what
//     a row/column is.
//   • Tier column headers pin at the top on scroll. The category
//     heading rows sit underneath that, so you always know which
//     section you're reading *and* which tier each cell belongs to.
//   • Values are one of: boolean (✓ / em-dash), string (literal like
//     "3 seats"), or { text, highlight } to emphasize an upgrade
//     point (e.g. "Unlimited seats" in the Enterprise column).
//   • A second Flowtora-accent column is used across every row for
//     the "most popular" tier, matching the tier card highlight.

export type CompareCell = boolean | string | { text: string; highlight?: boolean };

export interface CompareRow {
  label: string;
  detail?: string;
  cells: CompareCell[]; // length must equal tiers.length
}

export interface CompareCategory {
  title: string;
  rows: CompareRow[];
}

export interface PricingCompareTableProps {
  tiers: { name: string; tagline?: string; highlight?: boolean }[];
  categories: CompareCategory[];
}

export function PricingCompareTable({
  tiers,
  categories,
}: PricingCompareTableProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed text-left text-sm">
          <colgroup>
            <col style={{ width: "38%" }} />
            {tiers.map((_, i) => (
              <col key={i} style={{ width: `${62 / tiers.length}%` }} />
            ))}
          </colgroup>
          {/* Tier headers — sticky on desktop so they stay put as the
              reader scrolls through category groups. */}
          <thead className="sticky top-0 z-10">
            <tr
              style={{
                background:
                  "color-mix(in oklab, var(--surface-1) 94%, var(--surface-0))",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <th
                className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--text-faint)" }}
              >
                Compare
              </th>
              {tiers.map((t) => (
                <th
                  key={t.name}
                  className="px-6 py-4"
                  style={
                    t.highlight
                      ? {
                          background: "var(--accent-surface)",
                          borderLeft: "1px solid var(--accent-primary)",
                          borderRight: "1px solid var(--accent-primary)",
                        }
                      : {}
                  }
                >
                  <div
                    className="text-sm font-semibold"
                    style={{
                      color: t.highlight
                        ? "var(--accent-primary)"
                        : "var(--text-default)",
                    }}
                  >
                    {t.name}
                  </div>
                  {t.tagline && (
                    <div
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {t.tagline}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <React.Fragment key={cat.title}>
                {/* Category header row — spans full width. Small accent
                    stripe on the left edge so the eye registers a new
                    section without us inventing a new layout. */}
                <tr>
                  <td
                    colSpan={tiers.length + 1}
                    className="px-6 py-3"
                    style={{
                      background: "var(--surface-2)",
                      borderTop: "1px solid var(--border-subtle)",
                      borderBottom: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--accent-primary)" }}
                      />
                      <span
                        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: "var(--text-default)" }}
                      >
                        {cat.title}
                      </span>
                    </div>
                  </td>
                </tr>
                {cat.rows.map((row) => (
                  <tr
                    key={row.label}
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <td className="px-6 py-4 align-top">
                      <div
                        className="text-sm font-medium"
                        style={{ color: "var(--text-default)" }}
                      >
                        {row.label}
                      </div>
                      {row.detail && (
                        <div
                          className="mt-0.5 text-xs leading-relaxed"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {row.detail}
                        </div>
                      )}
                    </td>
                    {row.cells.map((cell, ci) => {
                      const tier = tiers[ci];
                      const tierHighlight = tier?.highlight;
                      return (
                        <td
                          key={ci}
                          className="px-6 py-4 align-top"
                          style={
                            tierHighlight
                              ? {
                                  background: "var(--accent-surface)",
                                  borderLeft: "1px solid var(--accent-primary)",
                                  borderRight: "1px solid var(--accent-primary)",
                                }
                              : {}
                          }
                        >
                          <CellView cell={cell} emphasis={tierHighlight} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellView({
  cell,
  emphasis,
}: {
  cell: CompareCell;
  emphasis?: boolean;
}) {
  if (typeof cell === "boolean") {
    return cell ? (
      <span
        aria-label="Included"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold"
        style={{
          background: "var(--success-surface)",
          color: "var(--success-fg)",
        }}
      >
        ✓
      </span>
    ) : (
      <span
        aria-label="Not included"
        className="inline-block text-sm"
        style={{ color: "var(--text-faint)" }}
      >
        —
      </span>
    );
  }
  if (typeof cell === "string") {
    return (
      <span
        className="text-sm"
        style={{
          color: emphasis ? "var(--text-default)" : "var(--text-muted)",
          fontWeight: emphasis ? 500 : 400,
        }}
      >
        {cell}
      </span>
    );
  }
  return (
    <span
      className="text-sm"
      style={{
        color: cell.highlight
          ? "var(--accent-primary)"
          : emphasis
            ? "var(--text-default)"
            : "var(--text-muted)",
        fontWeight: cell.highlight ? 600 : emphasis ? 500 : 400,
      }}
    >
      {cell.text}
    </span>
  );
}
