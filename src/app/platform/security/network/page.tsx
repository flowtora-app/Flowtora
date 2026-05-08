// Page 55 — IP Allowlist / Geo Restrictions.
//
// 8 tabs: Global Allow · Global Block · Per-Tenant · Geo · Tor/VPN/Proxy · Bot · DDoS · WAF.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadNetworkPage,
  SCOPE_LABEL, SCOPE_TONE, TENANT_MODE_TONE,
  GEO_MODE_TONE, GEO_SOURCE_LABEL,
  FEED_KIND_LABEL, DDOS_VECTOR_LABEL, DDOS_STATUS_TONE,
  WAF_TYPE_LABEL, WAF_ACTION_TONE,
  relativeFromNow, shortDateTime,
  type RuleRow, type TenantConfigRow, type GeoRow,
} from "@/server/platform/network";
import {
  saveNetworkRule, deleteNetworkRule, toggleNetworkRule,
  saveTenantNetworkConfig,
  saveGeoRestriction, setGeoMode,
  saveFeed,
  saveBotSettings,
  recordDdosEvent,
  saveWafRule, toggleWafRule,
} from "@/app/actions/platform-network";
import type {
  NetworkRuleScope,
  TenantNetworkMode,
  GeoRestrictionMode,
  GeoRestrictionSource,
  NetworkFeedKind,
  DdosVector,
  DdosStatus,
  WafRuleType,
  WafRuleAction,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["allow", "block", "tenants", "geo", "feeds", "bot", "ddos", "waf"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  allow:   "Global allow",
  block:   "Global block",
  tenants: "Per-tenant",
  geo:     "Geo restrictions",
  feeds:   "Tor / VPN / Proxy",
  bot:     "Bot mitigation",
  ddos:    "DDoS events",
  waf:     "WAF rules",
};

const FEED_KINDS: NetworkFeedKind[] = ["TOR", "VPN_COMMERCIAL", "OPEN_PROXY", "DATACENTER", "KNOWN_SCANNER", "CRYPTO_MINER"];
const TENANT_MODES: TenantNetworkMode[] = ["ALLOWLIST_ONLY", "BLOCKLIST", "DISABLED"];
const GEO_MODES: GeoRestrictionMode[] = ["ALLOW", "BLOCK", "CHALLENGE"];
const GEO_SOURCES: GeoRestrictionSource[] = ["MANUAL", "OFAC", "EU_SANCTIONS", "UN_SANCTIONS", "CUSTOM_FEED"];
const DDOS_VECTORS: DdosVector[] = ["HTTP_FLOOD", "SYN_FLOOD", "UDP_AMPLIFICATION", "DNS_AMPLIFICATION", "SLOWLORIS", "APPLICATION_LAYER", "GENERIC"];
const DDOS_STATUSES: DdosStatus[] = ["ACTIVE", "MITIGATED", "ESCALATED", "ARCHIVED"];
const WAF_TYPES: WafRuleType[] = ["OWASP_CRS", "MANAGED_BOT", "RATE_LIMIT", "CUSTOM_REGEX", "IP_REPUTATION", "GEOFENCE"];
const WAF_ACTIONS: WafRuleAction[] = ["ALLOW", "CHALLENGE", "BLOCK", "LOG"];

export default async function NetworkPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("network.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view network restrictions.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("network.manage");
  const canWaf    = ctx.can("network.waf.write");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "allow";

  const data = await loadNetworkPage();
  const { kpis, globalAllow, globalBlock, tenantConfigs, geo, feeds, botSettings, ddos, waf, tenants } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Network restrictions</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Global + per-tenant IP rules · geo blocks · Tor/VPN feeds · bot mitigation · DDoS events · WAF rules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Global allow"  value={String(kpis.globalAllowCount)} sub="CIDRs" />
        <Kpi label="Global block"  value={String(kpis.globalBlockCount)} sub="CIDRs"
             tone={kpis.globalBlockCount > 0 ? "warning" : "default"} />
        <Kpi label="Tenants gated" value={String(kpis.tenantsWithRules)} sub="With custom rules" />
        <Kpi label="Blocked 24h"   value={kpis.blocked24h.toLocaleString()} sub="Hits across blocklist"
             tone={kpis.blocked24h > 1000 ? "danger" : "default"} />
        <Kpi label="Geo blocked"   value={String(kpis.geoBlockedCountries)} sub="Countries"
             tone={kpis.geoBlockedCountries > 0 ? "warning" : "default"} />
        <Kpi label="WAF / DDoS"    value={`${kpis.activeWafRules} / ${kpis.activeDdosCount}`}
             sub="Active rules · active DDoS"
             tone={kpis.activeDdosCount > 0 ? "danger" : "good"} />
      </section>

      {/* Tabs */}
      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <a key={t} href={`?tab=${t}`}
             className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
             style={{
               borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
               color: tab === t ? "var(--text-default)" : "var(--text-muted)",
             }}>
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {tab === "allow" && (
        <RuleTab title="Global allowlist" subtitle="IPs/CIDRs that bypass all blocks (corporate office, vendors)."
                 rows={globalAllow} scope="GLOBAL_ALLOW" canManage={canManage} tenants={tenants} />
      )}
      {tab === "block" && (
        <RuleTab title="Global blocklist" subtitle="Hard blocks at the edge across all tenants."
                 rows={globalBlock} scope="GLOBAL_BLOCK" canManage={canManage} tenants={tenants} />
      )}
      {tab === "tenants" && (
        <TenantsTab rows={tenantConfigs} tenants={tenants} canManage={canManage} />
      )}
      {tab === "geo" && (
        <GeoTab rows={geo} canManage={canManage} />
      )}
      {tab === "feeds" && (
        <FeedsTab rows={feeds} canManage={canManage} />
      )}
      {tab === "bot" && (
        <BotTab settings={botSettings} canManage={canManage} />
      )}
      {tab === "ddos" && (
        <DdosTab rows={ddos} canManage={canManage} />
      )}
      {tab === "waf" && (
        <WafTab rows={waf} canWaf={canWaf} />
      )}
    </main>
  );
}

/* ── Rule tab (allow/block) ─────────────────────────────── */

function RuleTab({
  title, subtitle, rows, scope, canManage, tenants,
}: {
  title: string;
  subtitle: string;
  rows: RuleRow[];
  scope: NetworkRuleScope;
  canManage: boolean;
  tenants: { id: string; name: string; slug: string }[];
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{subtitle} · {rows.length} rules.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No rules in this scope.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>CIDR</Th><Th>Description</Th><Th>Tag</Th><Th>Hits 24h</Th>
                <Th>Last hit</Th><Th>Created by</Th><Th>Created</Th><Th>Expires</Th>
                <Th>Active</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.cidr}</code></Td>
                  <Td><span className="text-[12px]" style={{ color: "var(--text-default)" }}>{r.description ?? "—"}</span></Td>
                  <Td>{r.tag
                    ? <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>{r.tag}</span>
                    : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td><span className="text-[11px] tabular-nums"
                            style={{ color: r.hits24h > 100 ? "var(--rose-700)" : "var(--text-default)" }}>
                    {r.hits24h.toLocaleString()}
                  </span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.lastHitAt)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.createdByEmail ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.createdAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                            style={{ color: r.expiresAt && r.expiresAt < new Date() ? "var(--rose-700)" : "var(--text-muted)" }}>
                    {r.expiresAt ? shortDateTime(r.expiresAt).slice(0, 10) : "permanent"}
                  </span></Td>
                  <Td>
                    {canManage ? (
                      <form action={toggleNetworkRule} className="inline-flex">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                        <button type="submit"
                                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  background: r.active ? "var(--emerald-100)" : "var(--surface-2)",
                                  color: r.active ? "var(--emerald-700)" : "var(--text-muted)",
                                }}>
                          {r.active ? "Active" : "Paused"}
                        </button>
                      </form>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: r.active ? "var(--emerald-100)" : "var(--surface-2)",
                              color: r.active ? "var(--emerald-700)" : "var(--text-muted)",
                            }}>
                        {r.active ? "Active" : "Paused"}
                      </span>
                    )}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteNetworkRule} className="inline-flex">
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                          Delete
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
              + Add rule
            </summary>
            <form action={saveNetworkRule} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <input type="hidden" name="scope" value={scope} />
              <Input name="cidr" label="CIDR (e.g. 203.0.113.0/24)" defaultValue="" required />
              <Input name="tag"  label="Tag" defaultValue="" />
              <Input name="expiresAt" label="Expires (optional)" type="datetime-local" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <input name="description" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save rule
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Tenants tab ───────────────────────────────────────── */

function TenantsTab({
  rows, tenants, canManage,
}: {
  rows: TenantConfigRow[];
  tenants: { id: string; name: string; slug: string }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Per-tenant network mode</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} tenants configured.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No tenant network policies set yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Tenant</Th><Th>Mode</Th><Th>Rule count</Th><Th>Support bypass</Th>
                <Th>Notes</Th><Th>Last edit</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.tenantName}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.tenantSlug}</div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: TENANT_MODE_TONE[r.mode].bg, color: TENANT_MODE_TONE[r.mode].fg }}>
                      {TENANT_MODE_TONE[r.mode].label}
                    </span>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.ruleCount}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: r.supportBypass ? "var(--emerald-700)" : "var(--rose-700)" }}>
                    {r.supportBypass ? "Yes" : "No"}
                  </span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.notes ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.updatedAt)}</span></Td>
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
              + Save tenant config
            </summary>
            <form action={saveTenantNetworkConfig} className="mt-3 grid grid-cols-2 gap-2">
              <Select name="tenantId" label="Tenant"
                      options={tenants.map((t) => ({ value: t.id, label: t.name }))} />
              <Select name="mode" label="Mode"
                      options={TENANT_MODES.map((m) => ({ value: m, label: TENANT_MODE_TONE[m].label }))} />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="supportBypass" defaultChecked /> Allow Flowtora support IPs
              </label>
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save tenant policy
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Geo tab ───────────────────────────────────────────── */

function GeoTab({
  rows, canManage,
}: { rows: GeoRow[]; canManage: boolean }) {
  const blocked = rows.filter((r) => r.mode === "BLOCK");
  const challenged = rows.filter((r) => r.mode === "CHALLENGE");
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Geo restrictions</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {blocked.length} blocked · {challenged.length} challenged · sanctions feeds (OFAC, EU) auto-loaded.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No geo rules configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Country</Th><Th>ISO-2</Th><Th>Mode</Th><Th>Source</Th>
                <Th>Hits 24h</Th><Th>Last hit</Th><Th>Notes</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{g.countryName}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{g.countryCode}</code></Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: GEO_MODE_TONE[g.mode].bg, color: GEO_MODE_TONE[g.mode].fg }}>
                      {GEO_MODE_TONE[g.mode].label}
                    </span>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{GEO_SOURCE_LABEL[g.source]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{g.hits24h.toLocaleString()}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(g.lastHitAt)}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{g.notes ?? "—"}</span></Td>
                  {canManage && (
                    <Td right>
                      <form action={setGeoMode} className="inline-flex items-center gap-1">
                        <input type="hidden" name="countryCode" value={g.countryCode} />
                        <select name="mode" defaultValue={g.mode}
                                className="rounded-md border px-1.5 py-0.5 text-[11px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          {GEO_MODES.map((m) => <option key={m} value={m}>{m.toLowerCase()}</option>)}
                        </select>
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                          Set
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
              + Save geo restriction
            </summary>
            <form action={saveGeoRestriction} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="countryCode" label="ISO-2 country code" defaultValue="" required />
              <Input name="countryName" label="Country name" defaultValue="" required />
              <Input name="iso3" label="ISO-3 (optional)" defaultValue="" />
              <Select name="mode" label="Mode"
                      options={GEO_MODES.map((m) => ({ value: m, label: GEO_MODE_TONE[m].label }))} />
              <Select name="source" label="Source"
                      options={GEO_SOURCES.map((s) => ({ value: s, label: GEO_SOURCE_LABEL[s] }))} />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save geo
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Feeds tab ─────────────────────────────────────────── */

function FeedsTab({
  rows, canManage,
}: {
  rows: { id: string; kind: NetworkFeedKind; enabled: boolean; sourceName: string; feedUrl: string | null; lastSyncedAt: Date | null; entryCount: number; hits24h: number; overrideCidrs: string[]; notes: string | null }[];
  canManage: boolean;
}) {
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {FEED_KINDS.map((kind) => {
        const r = byKind.get(kind);
        return (
          <section key={kind} className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{FEED_KIND_LABEL[kind]}</h3>
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: r?.enabled ? "var(--emerald-100)" : "var(--surface-2)",
                      color: r?.enabled ? "var(--emerald-700)" : "var(--text-muted)",
                    }}>
                {r?.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {r ? (
              <>
                <div className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Source: <span style={{ color: "var(--text-default)" }}>{r.sourceName}</span>
                </div>
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.entryCount.toLocaleString()} entries · {r.hits24h.toLocaleString()} hits 24h · synced {relativeFromNow(r.lastSyncedAt)}
                </div>
                {r.overrideCidrs.length > 0 && (
                  <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Overrides: {r.overrideCidrs.length}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Not configured.</p>
            )}
            {canManage && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                  Edit feed
                </summary>
                <form action={saveFeed} className="mt-2 grid grid-cols-1 gap-2">
                  <input type="hidden" name="kind" value={kind} />
                  <Input name="sourceName" label="Source name" defaultValue={r?.sourceName ?? ""} required />
                  <Input name="feedUrl" label="Feed URL" type="url" defaultValue={r?.feedUrl ?? ""} />
                  <Input name="overrideCidrs" label="Override CIDRs (comma-separated)" defaultValue={r?.overrideCidrs.join(", ") ?? ""} />
                  <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                    <input type="checkbox" name="enabled" defaultChecked={r?.enabled ?? false} /> Enabled
                  </label>
                  <Input name="notes" label="Notes" defaultValue={r?.notes ?? ""} />
                  <div className="flex justify-end">
                    <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                      Save
                    </button>
                  </div>
                </form>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Bot mitigation tab ────────────────────────────────── */

function BotTab({
  settings, canManage,
}: {
  settings: { id: string; enabled: boolean; botScoreThreshold: number; actionAboveThreshold: WafRuleAction; challengeProvider: string; defaultRpmPerIp: number; managedBotAllowlist: boolean; notes: string | null } | null;
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Bot mitigation</h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Cloudflare/AWS WAF integration · bot score threshold · challenge provider · default rate limit.
      </p>
      {!canManage ? (
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <Row label="Enabled"        value={settings?.enabled ? "Yes" : "No"} />
          <Row label="Bot threshold"  value={String(settings?.botScoreThreshold ?? 60)} />
          <Row label="Action ≥ threshold" value={settings?.actionAboveThreshold ?? "CHALLENGE"} />
          <Row label="Challenge"      value={settings?.challengeProvider ?? "TURNSTILE"} />
          <Row label="Default RPM/IP" value={String(settings?.defaultRpmPerIp ?? 120)} />
          <Row label="Managed-bot allowlist" value={settings?.managedBotAllowlist ? "On" : "Off"} />
        </div>
      ) : (
        <form action={saveBotSettings} className="mt-4 grid grid-cols-2 gap-3">
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="enabled" defaultChecked={settings?.enabled ?? true} /> Enable bot mitigation
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="managedBotAllowlist" defaultChecked={settings?.managedBotAllowlist ?? true} /> Allowlist managed bots (Googlebot, Bingbot)
          </label>
          <Input name="botScoreThreshold" label="Bot score threshold (0-100)" type="number" defaultValue={String(settings?.botScoreThreshold ?? 60)} />
          <Select name="actionAboveThreshold" label="Action ≥ threshold" defaultValue={settings?.actionAboveThreshold ?? "CHALLENGE"}
                  options={WAF_ACTIONS.map((a) => ({ value: a, label: WAF_ACTION_TONE[a].label }))} />
          <Input name="challengeProvider" label="Challenge provider" defaultValue={settings?.challengeProvider ?? "TURNSTILE"} />
          <Input name="defaultRpmPerIp" label="Default rate limit (rpm/IP)" type="number" defaultValue={String(settings?.defaultRpmPerIp ?? 120)} />
          <label className="col-span-2 block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Runbook notes</span>
            <textarea name="notes" rows={3} defaultValue={settings?.notes ?? ""}
                      className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          <div className="col-span-2 flex justify-end">
            <button type="submit" className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save bot settings
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ── DDoS events tab ───────────────────────────────────── */

function DdosTab({
  rows, canManage,
}: {
  rows: { id: string; startedAt: Date; endedAt: Date | null; durationSec: number | null; status: DdosStatus; vector: DdosVector; peakMbps: number | null; peakMpps: number | null; sourceIpCount: number | null; attribution: string | null; summary: string | null; mitigationLayer: string | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>DDoS events</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} events on file.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No DDoS events recorded.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Started</Th><Th>Duration</Th><Th>Vector</Th>
                <Th>Peak Mbps</Th><Th>Peak Mpps</Th><Th>Sources</Th>
                <Th>Mitigation</Th><Th>Attribution</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{shortDateTime(d.startedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {d.durationSec ? `${Math.round(d.durationSec / 60)}m` : "—"}
                  </span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{DDOS_VECTOR_LABEL[d.vector]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{d.peakMbps != null ? d.peakMbps.toLocaleString() : "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{d.peakMpps != null ? d.peakMpps.toLocaleString() : "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{d.sourceIpCount != null ? d.sourceIpCount.toLocaleString() : "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{d.mitigationLayer ?? "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{d.attribution ?? "—"}</span></Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: DDOS_STATUS_TONE[d.status].bg, color: DDOS_STATUS_TONE[d.status].fg }}>
                      {DDOS_STATUS_TONE[d.status].label}
                    </span>
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
              + Record event
            </summary>
            <form action={recordDdosEvent} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="startedAt" label="Started" type="datetime-local"
                     defaultValue={new Date().toISOString().slice(0, 16)} required />
              <Input name="endedAt"   label="Ended (optional)" type="datetime-local" defaultValue="" />
              <Select name="status" label="Status"
                      options={DDOS_STATUSES.map((s) => ({ value: s, label: DDOS_STATUS_TONE[s].label }))} />
              <Select name="vector" label="Vector"
                      options={DDOS_VECTORS.map((v) => ({ value: v, label: DDOS_VECTOR_LABEL[v] }))} />
              <Input name="peakMbps" label="Peak Mbps" type="number" defaultValue="0" />
              <Input name="peakMpps" label="Peak Mpps" type="number" defaultValue="0" />
              <Input name="sourceIpCount" label="Source IPs at peak" type="number" defaultValue="0" />
              <Input name="attribution" label="Attribution" defaultValue="" />
              <Input name="mitigationLayer" label="Mitigation layer" defaultValue="Cloudflare" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Summary</span>
                <textarea name="summary" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Record event
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── WAF rules tab ─────────────────────────────────────── */

function WafTab({
  rows, canWaf,
}: {
  rows: { id: string; name: string; description: string | null; type: WafRuleType; matchExpr: string; action: WafRuleAction; enabled: boolean; priority: number; hits24h: number; hitsTotal: number; lastHitAt: Date | null; externalId: string | null; tag: string | null }[];
  canWaf: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>WAF rules</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} rules · sorted by priority.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No WAF rules configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Pri</Th><Th>Name</Th><Th>Type</Th><Th>Match</Th><Th>Action</Th>
                <Th>Hits 24h</Th><Th>Tag</Th><Th>Active</Th>
                {canWaf && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.priority}</span></Td>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.name}</div>
                    {r.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.description}</div>}
                    {r.externalId && <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>ext: {r.externalId}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{WAF_TYPE_LABEL[r.type]}</span></Td>
                  <Td>
                    <code className="text-[11px] tabular-nums whitespace-pre-wrap break-all" style={{ color: "var(--text-default)" }}>
                      {r.matchExpr.length > 80 ? r.matchExpr.slice(0, 80) + "…" : r.matchExpr}
                    </code>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: WAF_ACTION_TONE[r.action].bg, color: WAF_ACTION_TONE[r.action].fg }}>
                      {WAF_ACTION_TONE[r.action].label}
                    </span>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: r.hits24h > 0 ? "var(--text-default)" : "var(--text-muted)" }}>
                    {r.hits24h.toLocaleString()}
                  </span></Td>
                  <Td>{r.tag
                    ? <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>{r.tag}</span>
                    : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td>
                    {canWaf ? (
                      <form action={toggleWafRule} className="inline-flex">
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit"
                                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  background: r.enabled ? "var(--emerald-100)" : "var(--surface-2)",
                                  color: r.enabled ? "var(--emerald-700)" : "var(--text-muted)",
                                }}>
                          {r.enabled ? "On" : "Off"}
                        </button>
                      </form>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: r.enabled ? "var(--emerald-100)" : "var(--surface-2)",
                              color: r.enabled ? "var(--emerald-700)" : "var(--text-muted)",
                            }}>
                        {r.enabled ? "On" : "Off"}
                      </span>
                    )}
                  </Td>
                  {canWaf && (
                    <Td right>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {relativeFromNow(r.lastHitAt)}
                      </span>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canWaf && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Save WAF rule
            </summary>
            <form action={saveWafRule} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="name" label="Rule name" defaultValue="" required />
              <Select name="type" label="Type"
                      options={WAF_TYPES.map((t) => ({ value: t, label: WAF_TYPE_LABEL[t] }))} />
              <Select name="action" label="Action"
                      options={WAF_ACTIONS.map((a) => ({ value: a, label: WAF_ACTION_TONE[a].label }))} />
              <Input name="priority" label="Priority (lower fires first)" type="number" defaultValue="100" />
              <Input name="externalId" label="External id (e.g. OWASP 942100)" defaultValue="" />
              <Input name="tag" label="Tag" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Match expression</span>
                <textarea name="matchExpr" rows={3} className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <input name="description" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="enabled" defaultChecked /> Enabled
              </label>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save rule
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md border px-2 py-1.5"
         style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{value}</span>
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
