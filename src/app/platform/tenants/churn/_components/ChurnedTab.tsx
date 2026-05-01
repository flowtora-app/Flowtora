"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Card, DonutChartCard, Input, Select } from "@/components/ui";
import {
  ARCHIVE_REASON_LABEL,
  type ChurnedKpi,
  type ChurnedRow,
} from "@/server/platform/churn";
import type { ArchiveReasonCode } from "@prisma/client";

// ChurnedTab — list of CANCELED / ARCHIVED tenants with reason
// donut, KPI strip, and per-row actions. Row actions are reduced
// here because by the time a tenant is churned, retention options
// have been exhausted — Open detail + Send win-back are what's left.

export function ChurnedTab({
  rows,
  kpi,
  planOptions,
  reasonCodes,
}: {
  rows: ChurnedRow[];
  kpi: ChurnedKpi;
  planOptions: string[];
  reasonCodes: ArchiveReasonCode[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const update = React.useCallback(
    (overrides: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(overrides)) {
        if (v == null || v === "") u.delete(k);
        else u.set(k, v);
      }
      const q = u.toString();
      router.replace(q ? `/platform/tenants/churn?${q}` : "/platform/tenants/churn");
    },
    [router, sp],
  );

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total churned" value={kpi.total.toLocaleString()} />
        <KpiCard label="MRR lost" value={kpi.mrrLost === 0 ? "—" : `$${kpi.mrrLost.toLocaleString()}/mo`}
                 tone={kpi.mrrLost > 0 ? "danger" : "default"} />
        <KpiCard label="Voluntary" value={kpi.voluntary.toLocaleString()}
                 sub={`${kpi.total === 0 ? 0 : Math.round((kpi.voluntary / kpi.total) * 100)}% of total`} />
        <KpiCard label="Involuntary" value={kpi.involuntary.toLocaleString()}
                 sub={`${kpi.total === 0 ? 0 : Math.round((kpi.involuntary / kpi.total) * 100)}% of total`} />
        <KpiCard label="% Won back" value={`${kpi.wonBackPct}%`}
                 tone={kpi.wonBackPct > 0 ? "good" : "default"} />
      </div>

      {/* Filters + donut */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-1">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Cancellation reasons
          </div>
          {kpi.reasonBreakdown.length === 0 ? (
            <div className="rounded-md border border-dashed py-12 text-center text-[12px]"
                 style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
              No reasons captured yet.
            </div>
          ) : (
            <DonutChartCard
              data={kpi.reasonBreakdown.map((r) => ({ name: r.label, value: r.count }))}
              height="md"
            />
          )}
        </Card>
        <Card padding="md" className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px]">
              <Select label="Reason" size="sm"
                      value={get("code")}
                      onChange={(e) => update({ code: e.target.value || null })}>
                <option value="">Any</option>
                {reasonCodes.map((c) => (
                  <option key={c} value={c}>{ARCHIVE_REASON_LABEL[c]}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Select label="Plan" size="sm"
                      value={get("plan")}
                      onChange={(e) => update({ plan: e.target.value || null })}>
                <option value="">Any</option>
                {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <Input label="Cancelled since" size="sm" type="date"
                   value={get("since")}
                   onChange={(e) => update({ since: e.target.value || null })} />
            <Input label="Until" size="sm" type="date"
                   value={get("until")}
                   onChange={(e) => update({ until: e.target.value || null })} />
            {(get("code") || get("plan") || get("since") || get("until")) && (
              <button
                type="button"
                onClick={() => update({ code: null, plan: null, since: null, until: null })}
                className="text-[12px] hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>MRR lost</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Reason</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Cancelled</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Verbatim</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Won back?</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--text-faint)" }}>
                No churned tenants for this filter.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={r.name} />
                    <Link href={`/platform/tenants/${r.id}`} className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.name}
                    </Link>
                  </div>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.plan}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.mrrLost === 0 ? "—" : `$${r.mrrLost.toLocaleString()}`}
                </td>
                <td className="px-3 py-2">
                  {r.reasonCode ? (
                    <span style={{ color: "var(--text-default)" }}>
                      {ARCHIVE_REASON_LABEL[r.reasonCode]}
                      {r.reasonCode === "SWITCHED_TO_COMPETITOR" && r.competitorName && (
                        <span className="ml-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                          → {r.competitorName}
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: "var(--text-faint)" }}>Uncategorised</span>}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.cancelledAt ? r.cancelledAt.toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2 max-w-xs truncate" style={{ color: "var(--text-muted)" }}
                    title={r.archiveReason ?? undefined}>
                  {r.archiveReason ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2">
                  {r.wonBackAt ? (
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold"
                          style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>
                      Yes · {r.wonBackAt.toLocaleDateString()}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link href={`/platform/tenants/${r.id}`}
                          className="ts-focus inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-2)]"
                          style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
                      Open
                    </Link>
                    {r.ownerEmail && (
                      <a href={`mailto:${r.ownerEmail}`}
                         className="ts-focus inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-2)]"
                         style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
                        Email
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
        {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </Card>
  );
}
