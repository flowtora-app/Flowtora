// Page 39 §Performance — overall email performance dashboard.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCampaignKpis,
  loadPerformanceSnapshot,
} from "@/server/platform/email-campaigns";
import { TabsBar } from "../_components/TabsBar";
import { Kpi } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  await requirePlatformStaff();
  const [kpis, snap] = await Promise.all([
    loadCampaignKpis(),
    loadPerformanceSnapshot(30),
  ]);
  const maxBar = Math.max(1, ...snap.daily.map((d) => d.delivered));

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Email campaigns
      </h1>
      <TabsBar active="performance" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Delivered · 30d" value={kpis.delivered30d.toLocaleString()} />
        <Kpi label="Opens · 30d"     value={kpis.opens30d.toLocaleString()} />
        <Kpi label="Clicks · 30d"    value={kpis.clicks30d.toLocaleString()} />
        <Kpi label="Open rate"
             value={kpis.openRate30d == null ? "—" : `${(kpis.openRate30d * 100).toFixed(1)}%`}
             tone={kpis.openRate30d == null ? "default" : kpis.openRate30d >= 0.30 ? "good" : kpis.openRate30d >= 0.15 ? "warning" : "danger"} />
        <Kpi label="CTR"
             value={kpis.ctr30d == null ? "—" : `${(kpis.ctr30d * 100).toFixed(1)}%`}
             tone={kpis.ctr30d == null ? "default" : kpis.ctr30d >= 0.05 ? "good" : "default"} />
        <Kpi label="Unsubs · 30d"
             value={kpis.unsubscribes30d.toLocaleString()}
             tone={kpis.unsubscribes30d > 50 ? "danger" : "default"} />
      </div>

      <div className="rounded-lg border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Daily delivered (blue) vs opens (orange) · last 30 days
        </h2>
        <div className="flex h-32 items-end gap-[2px]">
          {snap.daily.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col-reverse"
                 title={`${d.date}: ${d.delivered} delivered · ${d.opened} opened · ${d.clicked} clicked`}>
              <div className="rounded-t-sm" style={{ background: "var(--accent-primary)", height: `${(d.delivered / maxBar) * 100}%` }} />
              <div style={{ background: "var(--warning-fg)", height: `${(d.opened / maxBar) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Top campaigns by CTR · last 30 days
        </h2>
        {snap.top.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No campaigns met the ≥5 send threshold yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {snap.top.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] items-center gap-2 text-[12px]">
                <Link href={`/platform/marketing/campaigns/${c.id}`}
                      className="ts-focus truncate underline" style={{ color: "var(--text-default)" }}>
                  {c.name}
                </Link>
                <span className="text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{c.sent} sent</span>
                <span className="text-right tabular-nums" style={{ color: c.openRate >= 0.3 ? "var(--success-fg)" : "var(--text-default)" }}>
                  {(c.openRate * 100).toFixed(1)}%
                </span>
                <span className="text-right tabular-nums font-semibold" style={{ color: c.ctr >= 0.05 ? "var(--success-fg)" : "var(--text-default)" }}>
                  {(c.ctr * 100).toFixed(2)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
