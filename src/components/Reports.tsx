// Presentational helpers used across every report page.
//
// RangePicker is a plain form — GET submit rebuilds the URL so the page can
// be bookmarked / shared. Bar / Funnel / StatCard are stateless renderers.

import Link from "next/link";
import { RANGE_PRESETS, type ResolvedRange, type ResolvedBranch } from "@/lib/reports";
import { Card } from "@/components/Card";
import { formatDate } from "@/lib/format";

export function RangePicker({
  range,
  basePath,
  branch,
}: {
  range: ResolvedRange;
  basePath: string;
  /** Optional Phase 15 branch picker. Omit on report pages without branch awareness. */
  branch?: ResolvedBranch;
}) {
  return (
    <Card>
      <form method="get" action={basePath} className="flex flex-wrap items-end gap-3 px-5 py-3">
        <label className="text-sm">
          <span className="mb-1 block">Range</span>
          <select
            name="range"
            defaultValue={range.preset}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {RANGE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block">From</span>
          <input
            type="date"
            name="from"
            defaultValue={formatDate(range.from)}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block">To</span>
          <input
            type="date"
            name="to"
            defaultValue={formatDate(range.to)}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        {branch && branch.choices.length > 1 && (
          <label className="text-sm">
            <span className="mb-1 block">Branch</span>
            <select
              name="branch"
              defaultValue={branch.selected ?? ""}
              className="rounded-md px-2 py-1.5 text-sm"
              style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              <option value="">All branches</option>
              {branch.choices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className="rounded-md px-3 py-1.5 text-sm" style={{ border: "1px solid var(--border)" }}>
          Apply
        </button>
        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
          Selected: {range.label}
          {branch?.selected && <> · {branch.choices.find((b) => b.id === branch.selected)?.name}</>}
        </span>
      </form>
    </Card>
  );
}

export function Stat({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-md px-4 py-5" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// Simple horizontal bar. `value` and `max` are numbers; label + meta optional.
export function Bar({
  label,
  value,
  max,
  meta,
  color = "var(--accent)",
}: {
  label: string;
  value: number;
  max: number;
  meta?: string;
  color?: string;
}) {
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span>{label}</span>
        <span style={{ color: "var(--muted)" }}>{meta ?? value}</span>
      </div>
      <div
        className="h-2 rounded"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-2 rounded"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}

// Funnel: each stage is an absolute value; width is relative to the largest.
// Different from stacked bar because stages are sequential, not mutually
// exclusive — e.g. pipeline funnel or quote conversion funnel.
export function Funnel({
  stages,
}: {
  stages: { label: string; value: number; meta?: string; color?: string }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <div className="space-y-3">
      {stages.map((s) => (
        <Bar key={s.label} label={s.label} value={s.value} max={max} meta={s.meta} color={s.color} />
      ))}
    </div>
  );
}
