import Link from "next/link";
import type { TenantProductionSample } from "@/server/platform/production-health";

export function DistributionTable({
  samples, minSampleSize,
}: {
  samples: TenantProductionSample[];
  minSampleSize: number;
}) {
  return (
    <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
      <table className="w-full text-[12px]">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Orders</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>On-time</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Cycle</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>AOV</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Margin</th>
            <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Late rate</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Sample</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => {
            const lowSample = s.completedCount < minSampleSize;
            return (
              <tr key={s.tenantId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2">
                  <Link href={`/platform/tenants/${s.tenantId}`}
                        className="hover:underline" style={{ color: "var(--text-default)" }}>
                    {s.tenantName}
                  </Link>
                  {s.region && (
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {s.region}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {s.planSlug ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {s.completedCount}
                  <span style={{ color: "var(--text-muted)" }}> / {s.totalCount}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {s.onTimeRatePct == null ? "—" : `${s.onTimeRatePct.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {s.avgCycleDays == null ? "—" : `${s.avgCycleDays.toFixed(1)}d`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {s.avgOrderValue == null ? "—" : `$${s.avgOrderValue.toLocaleString()}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {s.estMarginPct == null ? "—" : `${s.estMarginPct.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums"
                    style={{ color: s.lateRatePct != null && s.lateRatePct > 10 ? "var(--rose-700)" : "var(--text-default)" }}>
                  {s.lateRatePct == null ? "—" : `${s.lateRatePct.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2">
                  {lowSample ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--amber-50)", color: "var(--amber-700)", border: "1px solid var(--amber-200)" }}
                          title={`< ${minSampleSize} completed orders — below privacy floor`}>
                      Low
                    </span>
                  ) : (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" }}>
                      OK
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
