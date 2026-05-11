// Page 59 — Storage & CDN.
//
// KPI strip + 8 tabs:
//   Overview · Per-Tenant · Buckets · CDN · Image Optimization · Lifecycle Policies · Egress Cost · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadStoragePage,
  PROVIDER_LABEL, ENCRYPTION_LABEL, PUBLIC_ACCESS_TONE,
  LIFECYCLE_ACTION_LABEL, CDN_HEALTH_TONE,
  relativeFromNow, formatBytes, formatCents,
  type BucketRow, type TenantUsageRow, type CdnPopRow, type CdnUrlRow,
  type EgressTenantRow,
} from "@/server/platform/storage-cdn";
import {
  saveBucket, deleteBucketEntry,
  saveLifecyclePolicy,
  purgeCdn,
  clearAnomalyFlag, setHotlinkFlag,
  saveStorageSettings,
} from "@/app/actions/platform-storage";
import type {
  StorageBucketProvider,
  StorageEncryptionMode,
  StoragePublicAccess,
  StorageLifecycleAction,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["overview", "tenants", "buckets", "cdn", "images", "lifecycle", "egress", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  overview:  "Overview",
  tenants:   "Per-tenant",
  buckets:   "Buckets",
  cdn:       "CDN",
  images:    "Image optimization",
  lifecycle: "Lifecycle policies",
  egress:    "Egress cost",
  settings:  "Settings",
};

const PROVIDERS: StorageBucketProvider[] = ["AWS_S3", "CLOUDFLARE_R2", "GCS", "AZURE_BLOB", "BACKBLAZE_B2", "OTHER"];
const ENCRYPTIONS: StorageEncryptionMode[] = ["NONE", "SSE_S3", "SSE_KMS", "SSE_CMK", "CSE"];
const PUBLIC_ACCESS_OPTS: StoragePublicAccess[] = ["PRIVATE", "TENANT_GATED", "PUBLIC_READ", "PUBLIC_READ_WRITE"];
const LIFECYCLE_ACTIONS: StorageLifecycleAction[] = ["ARCHIVE", "DELETE", "TRANSITION_IA", "TRANSITION_GLACIER", "TRANSITION_DEEP_ARCHIVE", "EXPIRE_VERSIONS"];

export default async function StoragePage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("storage.read") && !ctx.can("storage.egress.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Storage & CDN.
        </p>
      </main>
    );
  }
  const canRead   = ctx.can("storage.read");
  const canManage = ctx.can("storage.manage");
  const canEgress = ctx.can("storage.egress.read");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  let tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "overview";
  // Finance-only role: jump straight to egress.
  if (!canRead && canEgress) tab = "egress";

  const data = await loadStoragePage();
  const { kpis, buckets, tenantUsage, pops, topUrls, imageStats, lifecycle, egressDaily, egressTenants, settings } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Storage &amp; CDN</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Storage buckets · per-tenant usage · CDN POP performance · image optimization · lifecycle · egress cost.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total storage" value={formatBytes(kpis.totalBytes)}
             sub={`${kpis.bucketCount} buckets · ${kpis.totalObjects.toLocaleString()} objects`} />
        <Kpi label="Bandwidth (24h)" value={formatBytes(kpis.bandwidth24hBytes)}
             sub={`${kpis.anomalyTenants} anomaly tenants · ${kpis.hotlinkTenants} hotlink flagged`}
             tone={kpis.anomalyTenants > 0 || kpis.hotlinkTenants > 0 ? "warning" : "default"} />
        <Kpi label="CDN hit rate" value={`${kpis.hitRatePct.toFixed(1)}%`}
             sub={`Target ≥${kpis.hitRateTargetPct}%`}
             tone={kpis.hitRatePct >= kpis.hitRateTargetPct ? "good" : kpis.hitRatePct >= kpis.hitRateTargetPct - 5 ? "warning" : "danger"} />
        <Kpi label="Cost (MTD)" value={formatCents(kpis.mtdCostCents)}
             sub={kpis.monthlyBudgetCents === 0
               ? "No budget set"
               : `${kpis.budgetUsedPct.toFixed(1)}% of ${formatCents(kpis.monthlyBudgetCents)}`}
             tone={kpis.budgetUsedPct > 90 ? "danger" : kpis.budgetUsedPct > 75 ? "warning" : "good"} />
      </section>

      {/* Tabs */}
      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => {
          // Finance role: only show egress tab.
          if (!canRead && canEgress && t !== "egress") return null;
          return (
            <a key={t} href={`?tab=${t}`}
               className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
               style={{
                 borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
                 color: tab === t ? "var(--text-default)" : "var(--text-muted)",
               }}>
              {TAB_LABEL[t]}
            </a>
          );
        })}
      </nav>

      {tab === "overview"  && canRead && <OverviewTab buckets={buckets} pops={pops} egressDaily={egressDaily} kpis={kpis} />}
      {tab === "tenants"   && canRead && <TenantsTab rows={tenantUsage} canManage={canManage} />}
      {tab === "buckets"   && canRead && <BucketsTab rows={buckets} lifecycle={lifecycle} canManage={canManage} />}
      {tab === "cdn"       && canRead && <CdnTab pops={pops} topUrls={topUrls} canManage={canManage} />}
      {tab === "images"    && canRead && <ImagesTab stats={imageStats} />}
      {tab === "lifecycle" && canRead && <LifecycleTab rows={lifecycle} canManage={canManage} />}
      {tab === "egress"    && canEgress && <EgressTab daily={egressDaily} tenants={egressTenants} canManage={canManage} />}
      {tab === "settings"  && canManage && <SettingsTab settings={settings} lifecycle={lifecycle} />}
    </main>
  );
}

/* ── Overview ──────────────────────────────────────────── */

function OverviewTab({
  buckets, pops, egressDaily, kpis,
}: {
  buckets: BucketRow[];
  pops: CdnPopRow[];
  egressDaily: { day: string; bytes: number; costCents: number }[];
  kpis: { totalBytes: number };
}) {
  const topBuckets = buckets.slice().sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 5);
  const maxBytes = Math.max(1, ...egressDaily.map((e) => e.bytes));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Egress — last 30 days</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Daily egress bytes + cost.</p>
        </header>
        <div className="p-4">
          <div className="flex h-24 items-end gap-[2px]">
            {egressDaily.map((d, i) => (
              <div key={i}
                   title={`${d.day}: ${formatBytes(d.bytes)} · ${formatCents(d.costCents)}`}
                   className="flex-1 rounded-sm"
                   style={{ height: `${(d.bytes / maxBytes) * 100}%`, background: "var(--sky-500)", opacity: 0.85 }} />
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>CDN POPs</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{pops.length} POPs · {pops.filter((p) => p.health === "HEALTHY").length} healthy.</p>
        </header>
        <ul className="space-y-1 p-4">
          {pops.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div>
                <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{p.popCode}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.region} · {p.hitRate.toFixed(1)}% hit</div>
              </div>
              <Pill tone={CDN_HEALTH_TONE[p.health]} />
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border lg:col-span-3"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top buckets by size</h3>
        </header>
        <div className="overflow-x-auto p-4">
          {topBuckets.length === 0 ? <Empty>No buckets yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Name</Th><Th>Provider</Th><Th>Region</Th><Th>Size</Th><Th>Objects</Th><Th>Cost/mo</Th><Th>Encryption</Th>
                </tr>
              </thead>
              <tbody>
                {topBuckets.map((b) => (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><code className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.name}</code></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{PROVIDER_LABEL[b.provider]}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b.region}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(b.sizeBytes)}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.objectCount.toLocaleString()}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatCents(b.monthlyCostCents)}</span></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ENCRYPTION_LABEL[b.encryption]}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Per-tenant ────────────────────────────────────────── */

function TenantsTab({
  rows, canManage,
}: { rows: TenantUsageRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top tenants by storage</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} tenants · anomaly detection on sudden growth.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No tenant usage data yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Tenant</Th><Th>Used</Th><Th>Limit</Th><Th>%</Th>
                <Th>Bandwidth 30d</Th><Th>Files</Th><Th>Largest folder</Th><Th>Flag</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.tenantName}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.tenantSlug}</div>
                  </Td>
                  <Td><span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(r.storageBytes)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.limitBytes === 0 ? "—" : formatBytes(r.limitBytes)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                        <div className="h-full rounded-full"
                             style={{
                               width: `${Math.min(100, r.pctUsed)}%`,
                               background: r.pctUsed > 90 ? "var(--rose-500)" : r.pctUsed > 70 ? "var(--amber-500)" : "var(--emerald-500)",
                             }} />
                      </div>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.pctUsed.toFixed(1)}%</span>
                    </div>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(r.bandwidth30dBytes)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.fileCount.toLocaleString()}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.largestFolder ?? "—"}</code></Td>
                  <Td>
                    {r.anomalyFlag
                      ? <span title={r.anomalyReason ?? ""}
                              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "var(--amber-100)", color: "var(--amber-700)" }}>
                          Anomaly
                        </span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={clearAnomalyFlag}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="clear" value={r.anomalyFlag ? "1" : "0"} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                          {r.anomalyFlag ? "Clear flag" : "Flag"}
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Buckets ───────────────────────────────────────────── */

function BucketsTab({
  rows, lifecycle, canManage,
}: {
  rows: BucketRow[];
  lifecycle: { id: string; name: string; active: boolean }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Buckets</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} buckets across providers.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No buckets configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Provider</Th><Th>Region</Th><Th>Encryption</Th>
                <Th>Versioning</Th><Th>Access</Th>
                <Th>Objects</Th><Th>Size</Th><Th>Cost/mo</Th>
                <Th>Lifecycle</Th><Th>Refreshed</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <code className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.name}</code>
                    {b.tag && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>tag: {b.tag}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{PROVIDER_LABEL[b.provider]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b.region}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ENCRYPTION_LABEL[b.encryption]}</span></Td>
                  <Td>
                    <span className="text-[11px]" style={{ color: b.versioning ? "var(--emerald-700)" : "var(--text-muted)" }}>
                      {b.versioning ? "On" : "Off"}
                    </span>
                  </Td>
                  <Td><Pill tone={PUBLIC_ACCESS_TONE[b.publicAccess]} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.objectCount.toLocaleString()}</span></Td>
                  <Td>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(b.sizeBytes)}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {formatBytes(b.hotBytes)} hot / {formatBytes(b.archiveBytes)} archive
                    </div>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatCents(b.monthlyCostCents)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b.lifecyclePolicyName ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(b.lastRefreshedAt)}</span></Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteBucketEntry}>
                        <input type="hidden" name="id" value={b.id} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                          Remove
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Save bucket
            </summary>
            <form action={saveBucket} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Name" defaultValue="" required />
              <Select name="provider" label="Provider"
                      options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))} />
              <Input name="region" label="Region" defaultValue="us-east-1" />
              <Select name="encryption" label="Encryption"
                      options={ENCRYPTIONS.map((e) => ({ value: e, label: ENCRYPTION_LABEL[e] }))} />
              <Select name="publicAccess" label="Public access"
                      options={PUBLIC_ACCESS_OPTS.map((a) => ({ value: a, label: PUBLIC_ACCESS_TONE[a].label }))} />
              <Input name="monthlyCostCents" label="Monthly cost (cents)" type="number" defaultValue="0" />
              <Select name="lifecyclePolicyId" label="Lifecycle policy" defaultValue=""
                      options={[{ value: "", label: "—" }, ...lifecycle.map((l) => ({ value: l.id, label: l.name }))]} />
              <Input name="tag" label="Tag" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="versioning" defaultChecked /> Versioning
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <input name="notes" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save bucket
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── CDN ───────────────────────────────────────────────── */

function CdnTab({
  pops, topUrls, canManage,
}: {
  pops: CdnPopRow[];
  topUrls: CdnUrlRow[];
  canManage: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>POPs</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{pops.length} edge locations.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {pops.length === 0 ? <Empty>No POP data yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>POP</Th><Th>Region</Th><Th>Hit rate</Th><Th>Bandwidth 24h</Th><Th>Requests</Th><Th>Avg latency</Th><Th>Health</Th>
                </tr>
              </thead>
              <tbody>
                {pops.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <code className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{p.popCode}</code>
                      {p.city && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.city}</div>}
                    </Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.region}</span></Td>
                    <Td><span className="text-[11px] tabular-nums"
                            style={{ color: p.hitRate >= 95 ? "var(--emerald-700)" : p.hitRate >= 85 ? "var(--amber-700)" : "var(--rose-700)" }}>
                      {p.hitRate.toFixed(1)}%
                    </span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(p.bandwidthBytes)}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{p.requests24h.toLocaleString()}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: p.avgLatencyMs > 200 ? "var(--amber-700)" : "var(--text-default)" }}>{p.avgLatencyMs}ms</span></Td>
                    <Td><Pill tone={CDN_HEALTH_TONE[p.health]} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top URLs by bandwidth</h3>
        </header>
        <ul className="space-y-1 p-4">
          {topUrls.slice(0, 10).map((u) => (
            <li key={u.id} className="rounded-md border px-2 py-1.5"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <code className="truncate text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{u.url}</code>
                {u.suspectedHotlink && (
                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Hotlink?</span>
                )}
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatBytes(u.bandwidthBytes)} · {u.requests24h.toLocaleString()} req · {u.hitRate.toFixed(1)}% hit
                {u.contentType && <> · {u.contentType}</>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <section className="rounded-xl border lg:col-span-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Purge tool</h3>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              URL, prefix, or tag. Synthesized — production wires Cloudflare/Vercel purge API.
            </p>
          </header>
          <form action={purgeCdn} className="grid grid-cols-1 gap-2 p-4 md:grid-cols-[1fr_auto]">
            <input name="pattern" required defaultValue=""
                   placeholder="e.g. /static/* or tag:proofs"
                   className="rounded-md border px-2 py-1.5 text-[12px]"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Purge
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

/* ── Images ────────────────────────────────────────────── */

function ImagesTab({
  stats,
}: {
  stats: { transforms24h: number; bytesSaved24h: bigint; webpCount24h: number; avifCount24h: number; jpegCount24h: number; pngCount24h: number; avgRatio: number; refreshedAt: Date | null; topTransforms: unknown } | null;
}) {
  if (!stats) {
    return <Empty>No image optimization stats yet.</Empty>;
  }
  const totalFormat = stats.webpCount24h + stats.avifCount24h + stats.jpegCount24h + stats.pngCount24h;
  const pct = (n: number) => totalFormat === 0 ? 0 : Math.round((n / totalFormat) * 100);
  const top = Array.isArray(stats.topTransforms) ? stats.topTransforms as Array<{ name: string; count: number }> : [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border p-4 lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Optimization summary</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Last refreshed {relativeFromNow(stats.refreshedAt)}.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Transforms 24h"  value={stats.transforms24h.toLocaleString()} />
          <Stat label="Bytes saved 24h" value={formatBytes(Number(stats.bytesSaved24h))} tone="good" />
          <Stat label="Avg ratio"       value={`${stats.avgRatio.toFixed(2)}×`} />
        </div>
        <div className="mt-4 space-y-1.5">
          <FormatBar label="WebP" pct={pct(stats.webpCount24h)} color="var(--emerald-500)" count={stats.webpCount24h} />
          <FormatBar label="AVIF" pct={pct(stats.avifCount24h)} color="var(--sky-500)"     count={stats.avifCount24h} />
          <FormatBar label="JPEG" pct={pct(stats.jpegCount24h)} color="var(--amber-500)"   count={stats.jpegCount24h} />
          <FormatBar label="PNG"  pct={pct(stats.pngCount24h)}  color="var(--violet-500)"  count={stats.pngCount24h} />
        </div>
      </section>
      <section className="rounded-xl border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top transforms</h3>
        <ul className="mt-2 space-y-1.5">
          {top.length === 0
            ? <li className="text-[11px]" style={{ color: "var(--text-muted)" }}>No transform metrics.</li>
            : top.slice(0, 8).map((t, i) => (
              <li key={i} className="flex items-center justify-between rounded-md border px-2 py-1"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{t.name}</code>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{t.count.toLocaleString()}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

function FormatBar({ label, pct, color, count }: { label: string; pct: number; color: string; count: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span style={{ color: "var(--text-default)" }}>{label}</span>
        <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{pct}% · {count.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  const color = tone === "good" ? "var(--emerald-700)" : "var(--text-default)";
  return (
    <div className="rounded-md border px-3 py-2"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[16px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

/* ── Lifecycle policies ────────────────────────────────── */

function LifecycleTab({
  rows, canManage,
}: {
  rows: { id: string; name: string; description: string | null; scope: string | null; action: StorageLifecycleAction; thresholdDays: number; secondaryThresholdDays: number | null; active: boolean; notes: string | null; _count: { buckets: number } }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Lifecycle policies</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} policies attached to buckets.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No policies yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Scope</Th><Th>Action</Th><Th>Threshold</Th><Th>Buckets</Th><Th>Active</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{p.name}</div>
                    {p.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.description}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.scope ?? "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{LIFECYCLE_ACTION_LABEL[p.action]}</span></Td>
                  <Td>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{p.thresholdDays}d</div>
                    {p.secondaryThresholdDays && (
                      <div className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>then {p.secondaryThresholdDays}d</div>
                    )}
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{p._count.buckets}</span></Td>
                  <Td>
                    {p.active
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Active</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Paused</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Save lifecycle policy
            </summary>
            <form action={saveLifecyclePolicy} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Name" defaultValue="" required />
              <Input name="scope" label="Scope (all, proofs, exports)" defaultValue="all" />
              <Select name="action" label="Action"
                      options={LIFECYCLE_ACTIONS.map((a) => ({ value: a, label: LIFECYCLE_ACTION_LABEL[a] }))} />
              <Input name="thresholdDays" label="Threshold days" type="number" defaultValue="30" required />
              <Input name="secondaryThresholdDays" label="Secondary threshold (optional)" type="number" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <input name="description" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <input name="notes" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save policy
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Egress cost ───────────────────────────────────────── */

function EgressTab({
  daily, tenants, canManage,
}: {
  daily: { day: string; bytes: number; costCents: number }[];
  tenants: EgressTenantRow[];
  canManage: boolean;
}) {
  const totalBytes = daily.reduce((s, d) => s + d.bytes, 0);
  const totalCost = daily.reduce((s, d) => s + d.costCents, 0);
  const maxBytes = Math.max(1, ...daily.map((d) => d.bytes));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Daily egress (30d)</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {formatBytes(totalBytes)} total · {formatCents(totalCost)} cost.
          </p>
        </header>
        <div className="p-4">
          <div className="flex h-32 items-end gap-[2px]">
            {daily.map((d, i) => (
              <div key={i}
                   title={`${d.day}: ${formatBytes(d.bytes)} · ${formatCents(d.costCents)}`}
                   className="flex-1 rounded-sm"
                   style={{ height: `${(d.bytes / maxBytes) * 100}%`, background: "var(--sky-500)", opacity: 0.85 }} />
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Hotlink suspects</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {tenants.filter((t) => t.suspectedHotlink).length} tenants flagged.
          </p>
        </header>
        <ul className="space-y-1 p-4">
          {tenants.filter((t) => t.suspectedHotlink).slice(0, 6).map((t) => (
            <li key={t.id} className="rounded-md border px-2 py-1.5"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{t.tenantName}</div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {formatBytes(t.bytes30d)}/30d · {formatCents(t.cost30dCents)}
                {t.hotlinkSourceDomain && <> · src: {t.hotlinkSourceDomain}</>}
              </div>
            </li>
          ))}
          {tenants.filter((t) => t.suspectedHotlink).length === 0 && (
            <li className="text-[11px]" style={{ color: "var(--text-muted)" }}>No suspects flagged.</li>
          )}
        </ul>
      </section>

      <section className="rounded-xl border lg:col-span-3"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top tenants by egress (30d)</h3>
        </header>
        <div className="overflow-x-auto p-4">
          {tenants.length === 0 ? <Empty>No egress data yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Tenant</Th><Th>Bytes 30d</Th><Th>Cost 30d</Th><Th>Hotlink</Th><Th>Source domain</Th><Th>Notes</Th>
                  {canManage && <Th right>Action</Th>}
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{t.tenantName}</div>
                      <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{t.tenantSlug}</div>
                    </Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(t.bytes30d)}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatCents(t.cost30dCents)}</span></Td>
                    <Td>
                      {t.suspectedHotlink
                        ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Suspected</span>
                        : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                    </Td>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{t.hotlinkSourceDomain ?? "—"}</code></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.notes ?? "—"}</span></Td>
                    {canManage && (
                      <Td right>
                        <form action={setHotlinkFlag} className="inline-flex items-center gap-1">
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="suspected" value={t.suspectedHotlink ? "0" : "1"} />
                          {!t.suspectedHotlink && (
                            <input name="domain" placeholder="source domain"
                                   className="w-32 rounded-md border px-1.5 py-0.5 text-[11px]"
                                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                          )}
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: t.suspectedHotlink ? "var(--text-muted)" : "var(--rose-700)" }}>
                            {t.suspectedHotlink ? "Clear flag" : "Flag"}
                          </button>
                        </form>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Settings ──────────────────────────────────────────── */

function SettingsTab({
  settings, lifecycle,
}: {
  settings: { monthlyBudgetCents: number; hitRateTargetPct: number; defaultLifecyclePolicyId: string | null; notes: string | null } | null;
  lifecycle: { id: string; name: string }[];
}) {
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Storage settings</h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Monthly budget, CDN hit-rate target, default lifecycle policy.
      </p>
      <form action={saveStorageSettings} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Input name="monthlyBudgetCents" label="Monthly budget (cents)" type="number" defaultValue={String(settings?.monthlyBudgetCents ?? 0)} />
        <Input name="hitRateTargetPct"   label="CDN hit-rate target (%)" type="number" defaultValue={String(settings?.hitRateTargetPct ?? 95)} />
        <Select name="defaultLifecyclePolicyId" label="Default lifecycle"
                defaultValue={settings?.defaultLifecyclePolicyId ?? ""}
                options={[{ value: "", label: "—" }, ...lifecycle.map((l) => ({ value: l.id, label: l.name }))]} />
        <label className="md:col-span-3 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea name="notes" rows={3} defaultValue={settings?.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        <div className="md:col-span-3 flex justify-end">
          <button type="submit" className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function Pill({ tone }: { tone: { bg: string; fg: string; label: string } }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {tone.label}
    </span>
  );
}

function Kpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`pb-2 text-${right ? "right" : "left"} text-[11px] font-medium uppercase tracking-wide`}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`py-2 pr-3 align-top ${right ? "text-right" : ""}`}>{children}</td>;
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
      {decodeURIComponent(msg)}
    </div>
  );
}
function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {decodeURIComponent(msg.replace(/-/g, " "))}
    </div>
  );
}

function Input({
  name, label, type, defaultValue, required,
}: { name: string; label: string; type?: string; defaultValue: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}{required && <span style={{ color: "var(--rose-500)" }}> *</span>}
      </span>
      <input
        type={type ?? "text"}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}
function Select({
  name, label, options, defaultValue,
}: {
  name: string; label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
