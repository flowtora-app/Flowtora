// Page 61 — Rate Limits & Quotas.
//
// KPI strip + 7 tabs:
//   Limits Editor · Per-Plan Quotas · Per-Tenant Overrides · Top Consumers ·
//   Throttled Requests · Abuse Alerts · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadRateLimitsPage,
  ALGORITHM_LABEL, SCOPE_LABEL, ACTION_TONE,
  ABUSE_SEVERITY_TONE, ABUSE_STATUS_TONE,
  relativeFromNow, shortDate, formatBytes,
} from "@/server/platform/rate-limits";
import {
  saveRule, deleteRule,
  savePlanQuota,
  saveOverride, deleteOverride,
  notifyConsumer,
  setAlertStatus,
  saveRateLimitSettings,
} from "@/app/actions/platform-rate-limits";
import type {
  RateLimitAlgorithm,
  RateLimitScope,
  RateLimitAction,
  AbuseAlertSeverity,
  AbuseAlertStatus,
  Plan,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["rules", "quotas", "overrides", "consumers", "throttled", "alerts", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  rules:     "Limits editor",
  quotas:    "Per-plan quotas",
  overrides: "Per-tenant overrides",
  consumers: "Top consumers",
  throttled: "Throttled requests",
  alerts:    "Abuse alerts",
  settings:  "Settings",
};

const ALGORITHMS: RateLimitAlgorithm[] = ["TOKEN_BUCKET", "SLIDING_WINDOW", "FIXED_WINDOW", "LEAKY_BUCKET"];
const SCOPES: RateLimitScope[] = ["PER_KEY", "PER_IP", "PER_TENANT", "PER_USER", "GLOBAL"];
const ACTIONS: RateLimitAction[] = ["THROTTLE", "CHALLENGE", "BLOCK", "LOG_ONLY"];
const PLANS: Plan[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];
const ABUSE_STATUSES: AbuseAlertStatus[] = ["OPEN", "ACKNOWLEDGED", "ACTION_TAKEN", "DISMISSED"];

export default async function RateLimitsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("ratelimits.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Rate Limits & Quotas.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("ratelimits.manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "rules";

  const data = await loadRateLimitsPage();
  const { kpis, rules, quotas, overrides, consumers, throttled, alerts, settings, tenants } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Rate limits &amp; quotas</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Per-endpoint limits · plan quotas · tenant overrides · top consumers · throttled requests · abuse alerts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active rules" value={`${kpis.activeRules}/${kpis.rules}`}
             sub={`${kpis.overrideCount} tenant overrides`} />
        <Kpi label="Requests (24h)" value={kpis.totalRequests24h.toLocaleString()}
             sub={`Top endpoint: ${kpis.topThrottledEndpoint ?? "—"}`} />
        <Kpi label="Throttled (24h)" value={kpis.throttled24h.toLocaleString()}
             sub={kpis.totalRequests24h === 0 ? "—" : `${((kpis.throttled24h / kpis.totalRequests24h) * 100).toFixed(2)}% of traffic`}
             tone={kpis.throttled24h > 1000 ? "warning" : "default"} />
        <Kpi label="Abuse alerts" value={String(kpis.abuseAlerts)}
             sub={`${kpis.criticalAlerts} critical · open`}
             tone={kpis.criticalAlerts > 0 ? "danger" : kpis.abuseAlerts > 0 ? "warning" : "good"} />
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

      {tab === "rules"     && <RulesTab rows={rules} canManage={canManage} />}
      {tab === "quotas"    && <QuotasTab rows={quotas} canManage={canManage} />}
      {tab === "overrides" && <OverridesTab rows={overrides} rules={rules} tenants={tenants} canManage={canManage} />}
      {tab === "consumers" && <ConsumersTab rows={consumers} canManage={canManage} />}
      {tab === "throttled" && <ThrottledTab series={throttled.series} topEndpoints={throttled.topEndpoints} />}
      {tab === "alerts"    && <AlertsTab rows={alerts} canManage={canManage} />}
      {tab === "settings"  && <SettingsTab settings={settings} canManage={canManage} />}
    </main>
  );
}

/* ── Rules ─────────────────────────────────────────────── */

function RulesTab({
  rows, canManage,
}: {
  rows: { id: string; endpoint: string; name: string; description: string | null; rps: number; burst: number; dailyCap: number; scope: RateLimitScope; algorithm: RateLimitAlgorithm; action: RateLimitAction; active: boolean; hits24h: number; throttled24h: number; notes: string | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Limits editor</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} rules across endpoints.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No rules configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Endpoint</Th><Th>RPS</Th><Th>Burst</Th><Th>Daily cap</Th>
                <Th>Scope</Th><Th>Algorithm</Th><Th>Action</Th>
                <Th>Hits 24h</Th><Th>Throttled</Th><Th>Active</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <code className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.endpoint}</code>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.name}</div>
                  </Td>
                  <Td><Num n={r.rps} /></Td>
                  <Td><Num n={r.burst} /></Td>
                  <Td><Num n={r.dailyCap} /></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{SCOPE_LABEL[r.scope]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ALGORITHM_LABEL[r.algorithm]}</span></Td>
                  <Td><Pill tone={ACTION_TONE[r.action]} /></Td>
                  <Td><Num n={r.hits24h} /></Td>
                  <Td><Num n={r.throttled24h} tone={r.throttled24h > 100 ? "danger" : r.throttled24h > 0 ? "warning" : undefined} /></Td>
                  <Td>
                    {r.active
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Active</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Paused</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteRule}>
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
              + Save rule
            </summary>
            <form action={saveRule} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="endpoint" label="Endpoint pattern" defaultValue="" required />
              <Input name="name" label="Name" defaultValue="" required />
              <Select name="scope" label="Scope"
                      options={SCOPES.map((s) => ({ value: s, label: SCOPE_LABEL[s] }))} />
              <Input name="rps" label="RPS" type="number" defaultValue="10" />
              <Input name="burst" label="Burst" type="number" defaultValue="20" />
              <Input name="dailyCap" label="Daily cap (0 = unlimited)" type="number" defaultValue="0" />
              <Select name="algorithm" label="Algorithm"
                      options={ALGORITHMS.map((a) => ({ value: a, label: ALGORITHM_LABEL[a] }))} />
              <Select name="action" label="Action"
                      options={ACTIONS.map((a) => ({ value: a, label: ACTION_TONE[a].label }))} />
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

/* ── Plan quotas ───────────────────────────────────────── */

function QuotasTab({
  rows, canManage,
}: {
  rows: { id: string; plan: Plan; apiCallsPerMonth: number; storageBytes: bigint; users: number; webhooksPerMonth: number; overageRateCents: number; softCap: boolean; hardCap: boolean; notes: string | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Per-plan quotas</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} plans · soft and hard caps configurable.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No plan quotas yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Plan</Th><Th>API calls/mo</Th><Th>Storage</Th><Th>Users</Th>
                <Th>Webhooks/mo</Th><Th>Overage rate</Th><Th>Soft cap</Th><Th>Hard cap</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                      {q.plan}
                    </span>
                  </Td>
                  <Td><Num n={q.apiCallsPerMonth} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{formatBytes(Number(q.storageBytes))}</span></Td>
                  <Td><Num n={q.users} /></Td>
                  <Td><Num n={q.webhooksPerMonth} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>${(q.overageRateCents / 100).toFixed(2)}</span></Td>
                  <Td>
                    {q.softCap
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--amber-100)", color: "var(--amber-700)" }}>Soft</span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  <Td>
                    {q.hardCap
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Hard</span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
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
              + Save plan quota
            </summary>
            <form action={savePlanQuota} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Select name="plan" label="Plan" options={PLANS.map((p) => ({ value: p, label: p }))} />
              <Input name="apiCallsPerMonth" label="API calls / mo (0 = unlimited)" type="number" defaultValue="0" />
              <Input name="storageBytes" label="Storage (bytes, 0 = unlimited)" type="number" defaultValue="0" />
              <Input name="users" label="Users (0 = unlimited)" type="number" defaultValue="0" />
              <Input name="webhooksPerMonth" label="Webhooks / mo" type="number" defaultValue="0" />
              <Input name="overageRateCents" label="Overage rate (cents/unit)" type="number" defaultValue="0" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="softCap" defaultChecked /> Soft cap
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="hardCap" /> Hard cap
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
                  Save quota
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Tenant overrides ──────────────────────────────────── */

function OverridesTab({
  rows, rules, tenants, canManage,
}: {
  rows: { id: string; tenantId: string; tenant: { name: string; slug: string }; rule: { endpoint: string; name: string } | null; endpoint: string | null; rps: number | null; burst: number | null; dailyCap: number | null; action: RateLimitAction | null; reason: string; expiresAt: Date | null; grantedByEmail: string | null; active: boolean }[];
  rules: { id: string; endpoint: string; name: string }[];
  tenants: { id: string; name: string; slug: string }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Per-tenant overrides</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} overrides · expired entries auto-hide from enforcement.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No tenant overrides.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Tenant</Th><Th>Endpoint</Th>
                <Th>RPS</Th><Th>Burst</Th><Th>Daily cap</Th><Th>Action</Th>
                <Th>Reason</Th><Th>Expires</Th><Th>Granted by</Th><Th>Active</Th>
                {canManage && <Th right>Delete</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{o.tenant.name}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{o.tenant.slug}</div>
                  </Td>
                  <Td>
                    {o.rule
                      ? <code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{o.rule.endpoint}</code>
                      : <code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{o.endpoint ?? "—"}</code>}
                  </Td>
                  <Td>{o.rps != null ? <Num n={o.rps} /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td>{o.burst != null ? <Num n={o.burst} /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td>{o.dailyCap != null ? <Num n={o.dailyCap} /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td>{o.action ? <Pill tone={ACTION_TONE[o.action]} /> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{o.reason}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: o.expiresAt && o.expiresAt < new Date() ? "var(--rose-700)" : "var(--text-muted)" }}>
                    {o.expiresAt ? shortDate(o.expiresAt) : "permanent"}
                  </span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{o.grantedByEmail ?? "—"}</span></Td>
                  <Td>
                    {o.active
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Active</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Paused</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteOverride}>
                        <input type="hidden" name="id" value={o.id} />
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
              + Save override
            </summary>
            <form action={saveOverride} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Select name="tenantId" label="Tenant"
                      options={tenants.map((t) => ({ value: t.id, label: t.name }))} />
              <Select name="ruleId" label="Rule (or use custom endpoint)" defaultValue=""
                      options={[{ value: "", label: "— Custom endpoint —" }, ...rules.map((r) => ({ value: r.id, label: `${r.endpoint} (${r.name})` }))]} />
              <Input name="endpoint" label="Custom endpoint" defaultValue="" />
              <Input name="rps" label="RPS override" type="number" defaultValue="" />
              <Input name="burst" label="Burst override" type="number" defaultValue="" />
              <Input name="dailyCap" label="Daily cap override" type="number" defaultValue="" />
              <Select name="action" label="Action override" defaultValue=""
                      options={[{ value: "", label: "—" }, ...ACTIONS.map((a) => ({ value: a, label: ACTION_TONE[a].label }))]} />
              <Input name="expiresAt" label="Expires (optional)" type="date" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Reason</span>
                <input name="reason" required defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <Input name="grantedByEmail" label="Granted by (email)" type="email" defaultValue="" />
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save override
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Top consumers ─────────────────────────────────────── */

function ConsumersTab({
  rows, canManage,
}: {
  rows: { id: string; tenantId: string | null; tenantName: string | null; apiKeyKey: string | null; endpoint: string; requests24h: number; throttled24h: number; pctOfQuota: number; notified: boolean; refreshedAt: Date }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top consumers (24h)</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} entries · sorted by request volume.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No consumer data yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Tenant</Th><Th>API key</Th><Th>Endpoint</Th>
                <Th>Requests</Th><Th>% of quota</Th><Th>Throttled</Th><Th>Refreshed</Th>
                {canManage && <Th right>Notify</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <span className="text-[12px]" style={{ color: "var(--text-default)" }}>{c.tenantName ?? "—"}</span>
                  </Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{c.apiKeyKey ?? "—"}</code></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.endpoint}</code></Td>
                  <Td><Num n={c.requests24h} /></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                        <div className="h-full rounded-full"
                             style={{
                               width: `${Math.min(100, c.pctOfQuota)}%`,
                               background: c.pctOfQuota > 100 ? "var(--rose-500)" : c.pctOfQuota > 80 ? "var(--amber-500)" : "var(--emerald-500)",
                             }} />
                      </div>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.pctOfQuota.toFixed(1)}%</span>
                    </div>
                  </Td>
                  <Td><Num n={c.throttled24h} tone={c.throttled24h > 100 ? "danger" : c.throttled24h > 0 ? "warning" : undefined} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.refreshedAt)}</span></Td>
                  {canManage && (
                    <Td right>
                      {c.notified
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Notified</span>
                        : (
                          <form action={notifyConsumer}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                              Notify
                            </button>
                          </form>
                        )}
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

/* ── Throttled requests ────────────────────────────────── */

function ThrottledTab({
  series, topEndpoints,
}: {
  series: { day: string; count: number }[];
  topEndpoints: { endpoint: string; count: number }[];
}) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border p-4 lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Throttled — last 30 days</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Daily total across all endpoints.
        </p>
        <div className="mt-3 flex h-32 items-end gap-[2px]">
          {series.length === 0 ? (
            <div className="flex w-full items-center justify-center text-[11px]" style={{ color: "var(--text-muted)" }}>
              No samples in window.
            </div>
          ) : (
            series.map((d, i) => (
              <div key={i} title={`${d.day}: ${d.count.toLocaleString()} throttled`}
                   className="flex-1 rounded-sm"
                   style={{ height: `${(d.count / max) * 100}%`, background: "var(--rose-500)", opacity: 0.85 }} />
            ))
          )}
        </div>
      </section>
      <section className="rounded-xl border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top throttled endpoints</h3>
        <ul className="mt-2 space-y-1.5">
          {topEndpoints.length === 0
            ? <li className="text-[11px]" style={{ color: "var(--text-muted)" }}>No data.</li>
            : topEndpoints.map((e) => (
              <li key={e.endpoint} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <code className="truncate text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{e.endpoint}</code>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{e.count.toLocaleString()}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

/* ── Abuse alerts ──────────────────────────────────────── */

function AlertsTab({
  rows, canManage,
}: {
  rows: { id: string; tenantId: string | null; tenantName: string | null; apiKeyKey: string | null; endpoint: string | null; severity: AbuseAlertSeverity; status: AbuseAlertStatus; pattern: string; description: string | null; suggestedAction: string | null; detectedAt: Date; acknowledgedAt: Date | null; resolvedAt: Date | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Abuse alerts</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} alerts · anomaly detection on traffic spikes + patterns.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No abuse alerts.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Detected</Th><Th>Tenant</Th><Th>Endpoint / Key</Th>
                <Th>Severity</Th><Th>Status</Th><Th>Pattern</Th><Th>Suggested action</Th>
                {canManage && <Th right>Status</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(a.detectedAt)}</span></Td>
                  <Td>
                    <span className="text-[12px]" style={{ color: "var(--text-default)" }}>{a.tenantName ?? "—"}</span>
                  </Td>
                  <Td>
                    <code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{a.endpoint ?? "—"}</code>
                    {a.apiKeyKey && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>key: {a.apiKeyKey}</div>}
                  </Td>
                  <Td><Pill tone={ABUSE_SEVERITY_TONE[a.severity]} /></Td>
                  <Td><Pill tone={ABUSE_STATUS_TONE[a.status]} /></Td>
                  <Td>
                    <div className="text-[12px]" style={{ color: "var(--text-default)" }}>{a.pattern}</div>
                    {a.description && <div className="max-w-[420px] truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{a.description}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{a.suggestedAction ?? "—"}</span></Td>
                  {canManage && (
                    <Td right>
                      <form action={setAlertStatus} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={a.id} />
                        <select name="status" defaultValue={a.status}
                                className="rounded-md border px-1.5 py-0.5 text-[11px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          {ABUSE_STATUSES.map((s) => <option key={s} value={s}>{ABUSE_STATUS_TONE[s].label}</option>)}
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
    </section>
  );
}

/* ── Settings ──────────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: { defaultRps: number; defaultBurst: number; spikeMultiplier: number; notifyOnHighUsage: boolean; consumerRefreshH: number; notes: string | null } | null;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <div className="rounded-md border p-6 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
        Read access only — settings management requires <code>ratelimits.manage</code>.
      </div>
    );
  }
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Rate-limit settings</h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Defaults for new rules, anomaly spike multiplier, notification cadence.
      </p>
      <form action={saveRateLimitSettings} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Input name="defaultRps" label="Default RPS" type="number" defaultValue={String(settings?.defaultRps ?? 10)} />
        <Input name="defaultBurst" label="Default burst" type="number" defaultValue={String(settings?.defaultBurst ?? 20)} />
        <Input name="spikeMultiplier" label="Spike multiplier (× normal)" type="number" defaultValue={String(settings?.spikeMultiplier ?? 10)} />
        <Input name="consumerRefreshH" label="Consumer refresh (h)" type="number" defaultValue={String(settings?.consumerRefreshH ?? 1)} />
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="notifyOnHighUsage" defaultChecked={settings?.notifyOnHighUsage ?? true} /> Notify tenants on high usage (&gt;80%)
        </label>
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

function Num({ n, tone }: { n: number; tone?: "danger" | "warning" }) {
  const color =
    tone === "danger"  ? "var(--rose-700)" :
    tone === "warning" ? "var(--amber-700)" :
                          "var(--text-default)";
  return <span className="text-[11px] tabular-nums" style={{ color }}>{n.toLocaleString()}</span>;
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
