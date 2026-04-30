"use client";

import * as React from "react";
import {
  AreaChartCard,
  BarChartCard,
  DonutChartCard,
  LineChartCard,
} from "@/components/ui";
import type { ReportViz } from "@/server/platform/reports/loaders";

// ReportViz — renders the visualization for any report payload.
//
// Bundled here in one client file so each viz kind can hold its own
// formatter (functions can't cross the server→client boundary, same
// constraint we hit on the dashboard charts).

const fmtUsdCompact = (n: number): string => {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000)    return `$${(n / 1_000).toFixed(1)}k`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
};
const fmtNumberCompact = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000)    return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
};

export function ReportVizRenderer({ viz }: { viz: ReportViz }) {
  if (viz.kind === "waterfall") return <Waterfall bars={viz.bars} />;
  if (viz.kind === "line")      return <LineChartCard data={viz.data} xKey={viz.xKey} series={viz.series} valueFormat={fmtUsdCompact} height="md" />;
  if (viz.kind === "area")      return <AreaChartCard data={viz.data} xKey={viz.xKey} series={viz.series} stacked={viz.stacked} valueFormat={fmtUsdCompact} height="md" />;
  if (viz.kind === "bar")       return <BarChartCard  data={viz.data} xKey={viz.xKey} series={viz.series} stacked={viz.stacked} layout={viz.horizontal ? "horizontal" : "vertical"} valueFormat={fmtNumberCompact} height="md" />;
  if (viz.kind === "donut")     return <DonutChartCard data={viz.data} centerLabel={viz.centerLabel} valueFormat={fmtNumberCompact} height="md" />;
  if (viz.kind === "funnel")    return <Funnel steps={viz.steps} />;
  if (viz.kind === "sankey")    return <Sankey nodes={viz.nodes} links={viz.links} />;
  if (viz.kind === "heatmap")   return <Heatmap rows={viz.rows} cols={viz.cols} cells={viz.cells} valueLabel={viz.valueLabel} />;
  if (viz.kind === "kpi-grid")  return <KpiGrid kpis={viz.kpis} />;
  return null; // table-only — caller renders just the data table
}

/* ── Waterfall ────────────────────────────────────────────── */

function Waterfall({ bars }: { bars: { label: string; value: number; tone: "start" | "positive" | "negative" | "end" }[] }) {
  // Compute running totals so each bar starts where the previous
  // ended (proper waterfall).
  let running = 0;
  const positions = bars.map((b) => {
    if (b.tone === "start" || b.tone === "end") {
      const start = 0;
      const end = b.value;
      running = end;
      return { start, end, value: b.value };
    }
    if (b.tone === "positive") {
      const start = running;
      const end = running + b.value;
      running = end;
      return { start, end, value: b.value };
    }
    // negative
    const start = running - b.value;
    const end = running;
    running = start;
    return { start, end, value: b.value };
  });
  const max = Math.max(0, ...positions.map((p) => p.end), ...positions.map((p) => p.start));

  return (
    <div className="flex h-72 items-end gap-3 px-2 py-4" style={{ background: "var(--surface-1)" }}>
      {bars.map((b, i) => {
        const p = positions[i]!;
        const heightPct = max === 0 ? 0 : ((p.end - p.start) / max) * 100;
        const offsetPct = max === 0 ? 0 : (p.start / max) * 100;
        const color =
          b.tone === "positive" ? "var(--emerald-500)" :
          b.tone === "negative" ? "var(--rose-500)" :
          b.tone === "end"      ? "var(--brand-700)" :
                                  "var(--brand-500)";
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-end">
            <div className="relative flex h-full w-full items-end justify-center">
              <div
                className="w-full rounded-t-md"
                style={{
                  height: `${Math.max(2, heightPct)}%`,
                  marginBottom: `${offsetPct}%`,
                  background: color,
                  transition: "height 240ms ease-out",
                }}
                title={`${b.label}: $${b.value.toLocaleString()}`}
              />
            </div>
            <div className="mt-2 max-w-full truncate text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{b.label}</div>
            <div className="font-mono text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>
              {fmtUsdCompact(b.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Funnel ───────────────────────────────────────────────── */

function Funnel({ steps }: { steps: { label: string; value: number; pct: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="flex flex-col gap-2 p-4">
      {steps.map((s, i) => {
        const widthPct = (s.value / max) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 shrink-0 truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-md" style={{ background: "var(--surface-2)" }}>
              <div
                className="absolute inset-y-0 left-0 flex items-center justify-end pr-2 text-[11px] font-semibold"
                style={{
                  width: `${widthPct}%`,
                  background: i === 0 ? "var(--brand-600)" : i === steps.length - 1 ? "var(--emerald-600)" : "var(--brand-500)",
                  color: "white",
                  transition: "width 240ms ease-out",
                }}
              >
                {s.value.toLocaleString()}
              </div>
            </div>
            <div className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {Math.round(s.pct * 10) / 10}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Sankey (in-house, no d3-sankey dep) ─────────────────── */

function Sankey({ nodes, links }: { nodes: { id: string; label: string }[]; links: { source: string; target: string; value: number }[] }) {
  // Two-column layout: nodes ending in `_from` on the left, `_to`
  // on the right. Width-by-value links connect them.
  const leftNodes = nodes.filter((n) => n.id.endsWith("_from"));
  const rightNodes = nodes.filter((n) => n.id.endsWith("_to"));
  const totalIn = links.reduce((s, l) => s + l.value, 0);

  return (
    <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 p-4">
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>From</div>
        {leftNodes.map((n) => (
          <div key={n.id} className="rounded-md border px-2 py-1 text-[12px]"
               style={{ background: "var(--brand-50)", borderColor: "var(--brand-200)", color: "var(--brand-800)" }}>
            {n.label}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Migrations</div>
        {links.length === 0 ? (
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No flows in window.</div>
        ) : (
          links
            .slice()
            .sort((a, b) => b.value - a.value)
            .map((l, i) => {
              const src = nodes.find((n) => n.id === l.source);
              const tgt = nodes.find((n) => n.id === l.target);
              const widthPct = totalIn === 0 ? 0 : Math.max(8, (l.value / totalIn) * 100);
              return (
                <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-default)" }}>
                  <span className="w-12 truncate font-medium">{src?.label}</span>
                  <span style={{ color: "var(--text-faint)" }}>→</span>
                  <div className="flex h-3 flex-1 items-center overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div
                      style={{
                        width: `${widthPct}%`,
                        background: l.source.includes("ENTERPRISE") ? "var(--brand-700)"
                                  : l.source.includes("PRO")        ? "var(--brand-500)"
                                  : l.source.includes("GROWTH")     ? "var(--emerald-500)"
                                  :                                   "var(--cyan-500)",
                        height: "100%",
                      }}
                    />
                  </div>
                  <span className="w-12 truncate font-medium">{tgt?.label}</span>
                  <span className="w-10 text-right font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>{l.value}</span>
                </div>
              );
            })
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>To</div>
        {rightNodes.map((n) => (
          <div key={n.id} className="rounded-md border px-2 py-1 text-[12px]"
               style={{ background: "var(--emerald-50)", borderColor: "var(--emerald-200)", color: "var(--emerald-800)" }}>
            {n.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Heatmap ──────────────────────────────────────────────── */

function Heatmap({ rows, cols, cells, valueLabel }: {
  rows: { id: string; label: string }[];
  cols: { id: string; label: string }[];
  cells: { rowId: string; colId: string; value: number; pct?: number }[];
  valueLabel?: string;
}) {
  const cellByKey = new Map(cells.map((c) => [`${c.rowId}::${c.colId}`, c]));
  const useColor = (pct?: number, value?: number) => {
    if (pct != null) {
      // Retention-style: 0..100 → rose..emerald via brand.
      if (pct >= 90) return "var(--emerald-500)";
      if (pct >= 75) return "var(--emerald-300)";
      if (pct >= 50) return "var(--brand-300)";
      if (pct >= 25) return "var(--amber-300)";
      if (pct > 0)   return "var(--rose-300)";
      return "var(--surface-3)";
    }
    if (value != null && value > 0) {
      // Generic count: light → dark brand by quartile.
      const allValues = cells.map((c) => c.value);
      const max = Math.max(1, ...allValues);
      const ratio = value / max;
      if (ratio >= 0.75) return "var(--brand-700)";
      if (ratio >= 0.50) return "var(--brand-500)";
      if (ratio >= 0.25) return "var(--brand-300)";
      return "var(--brand-100)";
    }
    return "var(--surface-3)";
  };

  return (
    <div className="overflow-x-auto p-4">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c.id} className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th className="pr-2 text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                {r.label}
              </th>
              {cols.map((c) => {
                const cell = cellByKey.get(`${r.id}::${c.id}`);
                const bg = useColor(cell?.pct, cell?.value);
                return (
                  <td
                    key={c.id}
                    title={cell ? `${r.label} · ${c.label}: ${cell.value}${cell.pct != null ? ` (${Math.round(cell.pct)}%)` : ""}` : "—"}
                    style={{
                      background: bg,
                      width: 32,
                      height: 28,
                      borderRadius: 4,
                      textAlign: "center",
                      fontFamily: "ui-monospace, Menlo, Monaco, monospace",
                      fontSize: 10,
                      color: cell?.pct != null && cell.pct >= 50 ? "white" : "var(--text-default)",
                    }}
                  >
                    {cell ? (cell.pct != null ? `${Math.round(cell.pct)}` : cell.value) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {valueLabel && (
        <div className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>{valueLabel}</div>
      )}
    </div>
  );
}

/* ── KPI grid ─────────────────────────────────────────────── */

function KpiGrid({ kpis }: { kpis: { label: string; value: string; sub?: string; tone?: "default" | "success" | "warning" | "danger" }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-4">
      {kpis.map((k, i) => {
        const palette =
          k.tone === "success" ? { bg: "var(--emerald-50)", fg: "var(--emerald-700)" } :
          k.tone === "warning" ? { bg: "var(--amber-50)",   fg: "var(--amber-700)" } :
          k.tone === "danger"  ? { bg: "var(--rose-50)",    fg: "var(--rose-700)" } :
                                 { bg: "var(--surface-2)",  fg: "var(--text-default)" };
        return (
          <div key={i} className="rounded-md border p-3"
               style={{ background: palette.bg, borderColor: "var(--border-subtle)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              {k.label}
            </div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: palette.fg }}>{k.value}</div>
            {k.sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{k.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
