// Tenant-side surface for the platform's published industry benchmarks
// (Page 32). Renders only metrics the platform admin has explicitly
// published AND that meet the minSampleSize privacy floor — silently
// nothing if neither condition holds.

import type { BenchmarkRow } from "@/server/tenant/benchmarks";

export function BenchmarkBadge({ rows }: { rows: BenchmarkRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section
      className="rounded-lg border p-4"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            How you compare
          </h2>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Anonymized industry benchmarks across peer shops over the last 90 days.
            Published by Flowtora staff once enough peers contribute samples.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => <BadgeCell key={r.metric} row={r} />)}
      </div>
    </section>
  );
}

function BadgeCell({ row }: { row: BenchmarkRow }) {
  const tone =
    row.direction === "ahead"  ? { fg: "var(--success-fg)", bg: "var(--success-surface)", border: "var(--emerald-200, var(--border-default))" } :
    row.direction === "behind" ? { fg: "var(--warning-fg)", bg: "var(--warning-surface)", border: "var(--amber-200, var(--border-default))" } :
                                  { fg: "var(--text-muted)", bg: "var(--surface-2)",       border: "var(--border-subtle)" };
  const label =
    row.direction === "ahead"  ? "Ahead of industry" :
    row.direction === "behind" ? "Below industry"    :
                                  "On par";

  const fmt = (n: number | null): string => {
    if (n == null) return "—";
    if (row.unit === "pct")   return `${n.toFixed(1)}%`;
    if (row.unit === "days")  return `${n.toFixed(1)}d`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <div
      className="rounded-md border p-3"
      style={{ background: "var(--surface-1)", borderColor: tone.border }}
    >
      <div
        className="mb-1 inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: tone.bg, color: tone.fg }}
      >
        {label}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {row.label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="text-[20px] font-semibold tabular-nums"
          style={{ color: tone.fg }}
        >
          {fmt(row.yourValue)}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          you
        </span>
      </div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Industry: <span className="tabular-nums" style={{ color: "var(--text-default)" }}>{fmt(row.industryMean)}</span>
        {" · "}
        <span style={{ color: "var(--text-faint)" }}>{row.sampleSize} peers</span>
      </div>
    </div>
  );
}
