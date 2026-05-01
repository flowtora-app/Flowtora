"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Card, Input, Select, useToast } from "@/components/ui";
import type {
  AtRiskKpi,
  AtRiskRow,
  WinbackCampaignRow,
} from "@/server/platform/churn";
import { TenantImpersonateButton } from "../../[id]/_components/TenantImpersonateButton";
import { RetentionActionMenu } from "./RetentionActionMenu";
import { BulkEnrolButton } from "./BulkEnrolButton";

// AtRiskTab — list of live tenants flagged as at-risk by health
// score / signals. Per-row menu offers Save with offer / Schedule
// call / Mark engaged / Suppress alert / Send win-back email.

export function AtRiskTab({
  rows,
  kpi,
  planOptions,
  csmOptions,
  campaigns,
  coupons,
  canEdit,
  canCoupon,
  canImpersonate,
}: {
  rows: AtRiskRow[];
  kpi: AtRiskKpi;
  planOptions: string[];
  csmOptions: { id: string; label: string }[];
  campaigns: WinbackCampaignRow[];
  coupons: { id: string; label: string }[];
  canEdit: boolean;
  canCoupon: boolean;
  canImpersonate: boolean;
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

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.tenantId));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.tenantId)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const includeSuppressed = sp.get("includeSuppressed") === "1";

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="At-risk total" value={kpi.total.toLocaleString()} />
        <KpiCard label="Predicted ≤30d" value={kpi.next30d.toLocaleString()}
                 tone={kpi.next30d > 0 ? "danger" : "default"} />
        <KpiCard label="Predicted ≤60d" value={kpi.next60d.toLocaleString()} />
        <KpiCard label="Predicted ≤90d" value={kpi.next90d.toLocaleString()} />
        <KpiCard label="MRR at risk" value={kpi.mrrAtRisk === 0 ? "—" : `$${kpi.mrrAtRisk.toLocaleString()}/mo`}
                 tone={kpi.mrrAtRisk > 0 ? "warning" : "default"} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[120px]">
            <Select
              label="Risk window"
              size="sm"
              value={get("window")}
              onChange={(e) => update({ window: e.target.value || null })}
            >
              <option value="">Any</option>
              <option value="30">≤ 30 days</option>
              <option value="60">≤ 60 days</option>
              <option value="90">≤ 90 days</option>
              <option value="180">≤ 180 days</option>
            </Select>
          </div>
          <Input
            label="Risk min"
            size="sm" type="number" min={0} max={100}
            value={get("min")}
            onChange={(e) => update({ min: e.target.value || null })}
          />
          <Input
            label="Risk max"
            size="sm" type="number" min={0} max={100}
            value={get("max")}
            onChange={(e) => update({ max: e.target.value || null })}
          />
          <div className="min-w-[120px]">
            <Select label="Plan" size="sm"
                    value={get("plan")}
                    onChange={(e) => update({ plan: e.target.value || null })}>
              <option value="">Any</option>
              {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Select label="CSM" size="sm"
                    value={get("csm")}
                    onChange={(e) => update({ csm: e.target.value || null })}>
              <option value="">Any</option>
              {csmOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Select label="Reason factor" size="sm"
                    value={get("reason")}
                    onChange={(e) => update({ reason: e.target.value || null })}>
              <option value="">Any</option>
              <option value="no_login_30d">No login 30d+</option>
              <option value="payment_failed">Payment failed</option>
              <option value="high_tickets">High tickets</option>
              <option value="past_due">Past due</option>
              <option value="suspended">Suspended</option>
              <option value="score_critical">Score critical (&lt;40)</option>
              <option value="score_low">Score low (40–59)</option>
            </Select>
          </div>
          <label className="ts-focus inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", color: "var(--text-default)" }}>
            <input
              type="checkbox"
              checked={includeSuppressed}
              onChange={(e) => update({ includeSuppressed: e.target.checked ? "1" : null })}
            />
            Include suppressed
          </label>
        </div>
      </Card>

      {/* Bulk action */}
      {canEdit && selected.size > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--text-default)" }}>
              {selected.size} tenant{selected.size === 1 ? "" : "s"} selected
            </span>
            <BulkEnrolButton
              tenantIds={Array.from(selected)}
              campaigns={campaigns}
              onComplete={() => setSelected(new Set())}
            />
          </div>
        </Card>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              {canEdit && (
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>MRR</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Risk</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>~Days</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Top reasons</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>CSM</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="px-3 py-8 text-center" style={{ color: "var(--text-faint)" }}>
                  No at-risk tenants for this filter.
                </td>
              </tr>
            ) : rows.map((r) => (
              <tr key={r.tenantId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {canEdit && (
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.tenantId)}
                      onChange={() => toggleOne(r.tenantId)}
                      aria-label={`Select ${r.tenantName}`}
                    />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={r.tenantName} />
                    <Link href={`/platform/tenants/${r.tenantId}`} className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.tenantName}
                    </Link>
                    {r.suppressedUntil && (
                      <span className="rounded-full px-1.5 text-[10px]"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                            title={`Suppressed until ${r.suppressedUntil.toLocaleDateString()}`}>
                        muted
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{r.plan}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.mrr === 0 ? "—" : `$${r.mrr.toLocaleString()}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <RiskScore score={r.riskScore} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  ~{r.predictedDays}d
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.topReasons.map((c) => (
                      <span key={c.key}
                            className="inline-flex items-center rounded-full px-1.5 text-[10px] font-medium"
                            style={{
                              background: c.severity === "high" ? "var(--rose-50)"
                                       : c.severity === "medium" ? "var(--amber-50)"
                                       : "var(--surface-2)",
                              color: c.severity === "high" ? "var(--rose-700)"
                                  : c.severity === "medium" ? "var(--amber-700)"
                                  : "var(--text-muted)",
                            }}>
                        {c.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.csmName ?? r.csmEmail ?? <span style={{ color: "var(--text-faint)" }}>Unassigned</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    {canEdit && (
                      <RetentionActionMenu
                        tenantId={r.tenantId}
                        tenantName={r.tenantName}
                        coupons={coupons}
                        canCoupon={canCoupon}
                      />
                    )}
                    {canImpersonate && (
                      <TenantImpersonateButton
                        tenantId={r.tenantId}
                        tenantName={r.tenantName}
                        size="xs"
                        variant="ghost"
                        enabled={canImpersonate}
                      />
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
  void useToast;
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: "default" | "warning" | "danger" }) {
  const palette =
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
      </div>
    </Card>
  );
}

function RiskScore({ score }: { score: number }) {
  const color =
    score >= 80 ? "var(--rose-700)" :
    score >= 60 ? "var(--amber-700)" :
                  "var(--text-muted)";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="font-semibold" style={{ color }}>{score}</span>
    </span>
  );
}
