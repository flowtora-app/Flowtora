import * as React from "react";
import { formatConversionRate, type SourceStat } from "@/lib/lead-sources";
import { formatMoney } from "@/lib/format";

// Phase 7 — lead source analytics panel.
//
// Compact insight card for the pipeline page. Shows a small table of
// sources with three actionable columns: conversion rate, won value,
// and current pipeline value. Sorted by won value so top revenue
// drivers surface first.

export function LeadSourcePanel({
  stats,
  currency,
}: {
  stats: SourceStat[];
  currency: string;
}) {
  if (stats.length === 0) {
    return (
      <section
        className="rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <header
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Lead sources
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            Track which channels pay off.
          </p>
        </header>
        <p className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
          No lead sources recorded yet. Add a source when you create a
          customer (Website, Referral, Trade show…) and the conversion
          breakdown will start filling in.
        </p>
      </section>
    );
  }

  // Pick a row to call out as the "best converter" — the one with the
  // highest conversion rate with at least 3 decided deals. Under 3
  // the sample is too small to trust.
  const candidates = stats.filter(
    (s) => s.conversionRate != null && s.wonLeads + s.lostLeads >= 3,
  );
  const bestConverter = candidates.reduce<SourceStat | null>((best, s) => {
    if (!best) return s;
    return (s.conversionRate ?? 0) > (best.conversionRate ?? 0) ? s : best;
  }, null);

  // Max values used to draw the bar-in-cell for won value.
  const maxWon = Math.max(1, ...stats.map((s) => s.wonValue));

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <header
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Lead sources
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Which channels close, which ones stall.
            </p>
          </div>
          {bestConverter && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
              style={{
                background: "var(--success-surface)",
                color: "var(--success-fg)",
              }}
              title={`${bestConverter.wonLeads} won out of ${bestConverter.wonLeads + bestConverter.lostLeads} decided`}
            >
              Best converter: {bestConverter.source}
              <span style={{ opacity: 0.75 }}>
                · {formatConversionRate(bestConverter.conversionRate)}
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              <th className="px-5 py-2 font-semibold">Source</th>
              <th className="px-5 py-2 font-semibold text-right">Leads</th>
              <th className="px-5 py-2 font-semibold text-right">Conversion</th>
              <th className="px-5 py-2 font-semibold text-right">Won value</th>
              <th className="px-5 py-2 font-semibold text-right">In pipeline</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr
                key={s.source}
                style={{
                  borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)",
                }}
              >
                <td className="px-5 py-2.5">
                  <div
                    className="font-medium"
                    style={{ color: "var(--text-default)" }}
                  >
                    {s.source}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {s.wonLeads} won · {s.lostLeads} lost · {s.openLeads} open
                  </div>
                </td>
                <td
                  className="px-5 py-2.5 text-right"
                  style={{ color: "var(--text-default)" }}
                >
                  {s.totalLeads}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <ConversionPill rate={s.conversionRate} sample={s.wonLeads + s.lostLeads} />
                </td>
                <td
                  className="px-5 py-2.5 text-right"
                  style={{ color: "var(--text-default)" }}
                >
                  <div className="flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="hidden h-1.5 rounded-full md:block"
                      style={{
                        width: `${Math.max(4, Math.round((s.wonValue / maxWon) * 60))}px`,
                        background: s.wonValue > 0 ? "var(--success-fg)" : "var(--border-subtle)",
                        opacity: s.wonValue > 0 ? 1 : 0.5,
                      }}
                    />
                    <span>
                      {s.wonValue > 0
                        ? formatMoney(s.wonValue, currency)
                        : "—"}
                    </span>
                  </div>
                </td>
                <td
                  className="px-5 py-2.5 text-right"
                  style={{ color: "var(--text-muted)" }}
                >
                  {s.openLeads > 0
                    ? formatMoney(
                        // Open-stage share of the total pipeline value from this source.
                        estimateOpenValue(s),
                        currency,
                      )
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ConversionPill({ rate, sample }: { rate: number | null; sample: number }) {
  if (rate == null || sample === 0) {
    return (
      <span style={{ color: "var(--text-faint)" }} title="No closed deals yet from this source">
        —
      </span>
    );
  }
  let tone: { bg: string; fg: string };
  if (rate >= 0.5) tone = { bg: "var(--success-surface)", fg: "var(--success-fg)" };
  else if (rate >= 0.25) tone = { bg: "var(--accent-surface)", fg: "var(--accent-primary)" };
  else tone = { bg: "var(--danger-surface)", fg: "var(--danger-fg)" };
  const trusted = sample >= 3;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
      style={{
        background: tone.bg,
        color: tone.fg,
        opacity: trusted ? 1 : 0.7,
      }}
      title={
        trusted
          ? `${Math.round(rate * 100)}% of ${sample} decided deals closed won`
          : `Only ${sample} decided deal${sample === 1 ? "" : "s"} — too small to draw conclusions`
      }
    >
      {Math.round(rate * 100)}%
      {!trusted && <span className="ml-1" style={{ opacity: 0.6 }}>·n={sample}</span>}
    </span>
  );
}

// "Open" value is what's currently in-flight. We derive it by
// subtracting won value from the grand total — more accurate than
// re-summing, because we've already counted each value once.
function estimateOpenValue(s: SourceStat): number {
  return Math.max(0, s.pipelineValue - s.wonValue);
}
