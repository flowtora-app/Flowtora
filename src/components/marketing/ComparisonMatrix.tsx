import * as React from "react";

// ComparisonMatrix — "Tracksign vs. the usual alternatives".
//
// The hardest objection in this category isn't price — it's "I already
// have QuickBooks + a Google Sheet + my sales rep's phone, why switch?"
// This matrix makes that alternative look as chaotic as it actually is
// and positions Tracksign as the single-record truth.
//
// Intentional design choices:
//   • Three alternatives, not ten. More columns → visual noise and a
//     reader who bounces.
//   • "Tracksign" column is highlighted with the accent border so the
//     eye lands there first.
//   • Uses short symbols (✓ / ~ / ✗) + a one-line note per cell —
//     "yes/no" alone reads as hand-wavy. A note earns trust.

export interface ComparisonRow {
  capability: string;
  subcopy?: string;
  cells: [CellValue, CellValue, CellValue, CellValue]; // Tracksign, ColA, ColB, ColC
}

export type CellValue =
  | { mark: "yes"; note?: string }
  | { mark: "partial"; note?: string }
  | { mark: "no"; note?: string };

export interface ComparisonMatrixProps {
  competitors: [string, string, string]; // column headers for the 3 alternatives
  rows: ComparisonRow[];
}

export function ComparisonMatrix({ competitors, rows }: ComparisonMatrixProps) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr>
              <th
                className="px-6 py-4 text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                Capability
              </th>
              <th
                className="px-6 py-4 align-bottom"
                style={{
                  background: "var(--accent-surface)",
                  borderLeft: "1px solid var(--accent-primary)",
                  borderRight: "1px solid var(--accent-primary)",
                }}
              >
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Tracksign
                </div>
                <div
                  className="mt-1 text-sm font-semibold"
                  style={{ color: "var(--text-default)" }}
                >
                  One platform
                </div>
              </th>
              {competitors.map((c) => (
                <th
                  key={c}
                  className="px-6 py-4 align-bottom"
                  style={{ color: "var(--text-muted)" }}
                >
                  <div className="text-xs font-semibold uppercase tracking-wider">
                    {c}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.capability}
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  background: idx % 2 === 1 ? "var(--surface-2)" : "transparent",
                }}
              >
                <td className="px-6 py-5 align-top">
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--text-default)" }}
                  >
                    {row.capability}
                  </div>
                  {row.subcopy && (
                    <div
                      className="mt-1 text-xs leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {row.subcopy}
                    </div>
                  )}
                </td>
                <td
                  className="px-6 py-5 align-top"
                  style={{
                    background: "var(--accent-surface)",
                    borderLeft: "1px solid var(--accent-primary)",
                    borderRight: "1px solid var(--accent-primary)",
                  }}
                >
                  <Cell value={row.cells[0]} emphasis />
                </td>
                <td className="px-6 py-5 align-top">
                  <Cell value={row.cells[1]} />
                </td>
                <td className="px-6 py-5 align-top">
                  <Cell value={row.cells[2]} />
                </td>
                <td className="px-6 py-5 align-top">
                  <Cell value={row.cells[3]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ value, emphasis }: { value: CellValue; emphasis?: boolean }) {
  const { bg, fg, glyph } =
    value.mark === "yes"
      ? {
          bg: "var(--success-surface)",
          fg: "var(--success-fg)",
          glyph: "✓",
        }
      : value.mark === "partial"
        ? {
            bg: "var(--warning-surface)",
            fg: "var(--warning-fg)",
            glyph: "~",
          }
        : {
            bg: "var(--surface-2)",
            fg: "var(--text-faint)",
            glyph: "✗",
          };

  return (
    <div>
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
        style={{ background: bg, color: fg }}
      >
        {glyph}
      </span>
      {value.note && (
        <div
          className="mt-2 text-xs leading-relaxed"
          style={{ color: emphasis ? "var(--text-default)" : "var(--text-muted)" }}
        >
          {value.note}
        </div>
      )}
    </div>
  );
}
