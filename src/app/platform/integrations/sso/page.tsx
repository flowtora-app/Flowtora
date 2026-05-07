// Page 49 — SSO Providers (top-level).
//
// 5 tabs: Providers · Per-Tenant Configurations · SCIM Logs ·
//         Identity Provider Templates · Settings.

import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadSsoKpis,
  loadProviderCatalog,
  loadTenantConfigs,
  loadScimLogs,
  loadIdpTemplates,
  loadSsoSettings,
  PROVIDER_LABELS,
  PROVIDER_ICONS,
  OPERATION_LABELS,
  type SsoKpis,
  type ProviderCatalogTile,
  type TenantConfigRow,
  type TenantConfigFilters,
  type ScimLogFilters,
  type ScimLogRow,
  type TemplateRow,
} from "@/server/platform/sso";
import {
  createTenantConfig,
  saveProvider,
  deleteProvider,
  saveTemplate,
  deleteTemplate,
  saveSsoSettings,
  retryScimEvent,
} from "@/app/actions/platform-sso";
import type {
  SsoProviderKey, SsoConfigType, SsoConfigStatus, ScimOperation, ScimLogStatus,
} from "@prisma/client";
import {
  Kpi, StatusPill, ScimStatusPill, ProviderBadge, OperationLabel,
  FormError, FormOk, Field, relativeFromNow,
} from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const asNum = (v: string | string[] | undefined): number | undefined => {
  const s = asString(v);
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
};

const TABS = ["providers", "configs", "scim", "templates", "settings"] as const;
type Tab = typeof TABS[number];

const PROVIDER_KEYS: SsoProviderKey[] = [
  "OKTA", "AZURE_AD", "GOOGLE", "ONELOGIN", "JUMPCLOUD",
  "PING", "AUTH0", "DUO", "ADFS", "GENERIC_SAML", "GENERIC_OIDC",
];
const STATUSES: SsoConfigStatus[] = ["PENDING", "TEST", "ACTIVE", "FAILED", "DISABLED"];
const OPERATIONS: ScimOperation[] = [
  "USER_CREATE", "USER_UPDATE", "USER_DELETE", "USER_PATCH",
  "GROUP_CREATE", "GROUP_UPDATE", "GROUP_DELETE", "GROUP_PATCH",
];
const SCIM_STATUSES: ScimLogStatus[] = ["OK", "ERROR", "RETRYING", "DEAD_LETTER"];

export default async function SsoPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("sso.manage");
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "providers";

  const [kpis, providers, settings, tenants] = await Promise.all([
    loadSsoKpis(),
    loadProviderCatalog(),
    loadSsoSettings(),
    db.tenant.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-5">
      <Header />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiBar kpis={kpis} />

      <TabsBar active={tab} kpis={kpis} />

      {tab === "providers" && (
        <ProvidersTab providers={providers} canWrite={canWrite} />
      )}
      {tab === "configs" && (
        <ConfigsTab
          filters={{
            q:          asString(sp.q),
            providerId: asString(sp.provider),
            status:     asString(sp.status) as SsoConfigStatus | "ALL" | undefined,
            scimOnly:   asString(sp.scim) === "1" ? true : undefined,
          }}
          providers={providers}
          tenants={tenants}
          canWrite={canWrite}
        />
      )}
      {tab === "scim" && (
        <ScimLogsTab
          filters={{
            tenantId:  asString(sp.tenant),
            operation: asString(sp.op) as ScimOperation | undefined,
            status:    asString(sp.status) as ScimLogStatus | "ALL" | undefined,
            from:      asString(sp.from) ? new Date(asString(sp.from)!) : undefined,
            to:        asString(sp.to)   ? new Date(asString(sp.to)!) : undefined,
          }}
          page={asNum(sp.page) ?? 1}
          tenants={tenants}
          canWrite={canWrite}
        />
      )}
      {tab === "templates" && (
        <TemplatesTab providers={providers} canWrite={canWrite} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ── Header ────────────────────────────────────── */

function Header() {
  return (
    <div>
      <nav className="text-[11px]" aria-label="Breadcrumbs">
        <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Integrations Catalog
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text-default)" }}>SSO</span>
      </nav>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        SSO Providers
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        SAML 2.0 / OIDC sign-on and SCIM provisioning for Enterprise tenants. Manage the
        provider catalog, per-tenant configurations, and SCIM telemetry.
      </p>
    </div>
  );
}

/* ── KPI bar ─────────────────────────────────── */

function KpiBar({ kpis }: { kpis: SsoKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Active providers" value={kpis.activeProviders.toLocaleString()}
           sub="Catalog tiles enabled" />
      <Kpi label="Configs · active" value={kpis.activeConfigs.toLocaleString()}
           sub={`${kpis.totalConfigs} total`}
           tone={kpis.activeConfigs > 0 ? "good" : "default"} />
      <Kpi label="Pending / test" value={kpis.pendingConfigs.toLocaleString()}
           tone={kpis.pendingConfigs > 0 ? "warning" : "default"} />
      <Kpi label="Failed" value={kpis.failedConfigs.toLocaleString()}
           tone={kpis.failedConfigs > 0 ? "danger" : "good"} />
      <Kpi label="SCIM enabled" value={kpis.scimEnabled.toLocaleString()}
           sub={kpis.scimEvents24h > 0 ? `${kpis.scimEvents24h} events 24h` : "no events 24h"} />
      <Kpi label="Force SSO tenants" value={kpis.forcedSsoTenants.toLocaleString()}
           sub={kpis.scimErrorRate24h == null
             ? ""
             : `${(kpis.scimErrorRate24h * 100).toFixed(1)}% SCIM err 24h`}
           tone={kpis.scimErrorRate24h != null && kpis.scimErrorRate24h > 0.05 ? "warning" : "default"} />
    </div>
  );
}

/* ── Tabs bar ────────────────────────────────── */

function TabsBar({ active, kpis }: { active: Tab; kpis: SsoKpis }) {
  const items: Array<{ key: Tab; label: string; badge?: string; tone?: "warn" | "danger" }> = [
    { key: "providers", label: "Providers" },
    { key: "configs",   label: "Per-Tenant Configurations", badge: kpis.failedConfigs > 0 ? String(kpis.failedConfigs) : undefined, tone: "danger" },
    { key: "scim",      label: "SCIM Logs",                 badge: kpis.scimEvents24h > 0 ? String(kpis.scimEvents24h) : undefined },
    { key: "templates", label: "Identity Provider Templates" },
    { key: "settings",  label: "Settings" },
  ];
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((i) => {
        const isActive = i.key === active;
        return (
          <Link key={i.key} href={`?tab=${i.key}`} scroll={false}
                className="ts-focus inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
                style={{
                  color: isActive ? "var(--text-default)" : "var(--text-muted)",
                  borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
            {i.label}
            {i.badge && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: i.tone === "danger" ? "var(--rose-50, var(--surface-2))" :
                                  i.tone === "warn"   ? "var(--warning-surface)" : "var(--surface-2)",
                      color:      i.tone === "danger" ? "var(--danger-fg)" :
                                  i.tone === "warn"   ? "var(--warning-fg)" : "var(--text-muted)",
                    }}>
                {i.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Providers tab ───────────────────────────── */

function ProvidersTab({ providers, canWrite }: { providers: ProviderCatalogTile[]; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add provider
          </summary>
          <ProviderForm />
        </details>
      )}

      {providers.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No providers in the catalog yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => <ProviderCard key={p.id} p={p} canWrite={canWrite} />)}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ p, canWrite }: { p: ProviderCatalogTile; canWrite: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", opacity: p.active ? 1 : 0.6 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md text-[20px]"
               style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
            {PROVIDER_ICONS[p.key]}
          </div>
          <div>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
              {PROVIDER_LABELS[p.key]}
            </h3>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Default: {p.defaultType.toLowerCase()}
            </div>
          </div>
        </div>
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: p.active ? "var(--success-surface)" : "var(--surface-2)",
                color:      p.active ? "var(--success-fg)" : "var(--text-faint)",
              }}>
          {p.active ? "active" : "disabled"}
        </span>
      </div>
      {p.description && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{p.description}</p>
      )}
      {p.notes && (
        <p className="rounded-md border-l-2 px-2 py-1 text-[11px]"
           style={{ borderColor: "var(--accent-primary)", background: "var(--accent-surface)", color: "var(--text-default)" }}>
          {p.notes}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[10px]"
           style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        <span>
          <strong style={{ color: "var(--text-default)" }}>{p.connectedTenantCount}</strong> tenants
        </span>
        <span>·</span>
        <span style={{ color: p.configsActiveCount > 0 ? "var(--success-fg)" : "var(--text-muted)" }}>
          {p.configsActiveCount} active
        </span>
        {p.defaultScopes.length > 0 && (
          <>
            <span>·</span>
            <span title={p.defaultScopes.join(", ")}>
              {p.defaultScopes.length} default scope{p.defaultScopes.length === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>
      {canWrite && (
        <details>
          <summary className="cursor-pointer text-[11px] font-medium" style={{ color: "var(--accent-primary)" }}>
            Edit
          </summary>
          <ProviderForm initial={p} />
          <form action={deleteProvider} className="mt-2">
            <input type="hidden" name="id" value={p.id} />
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                    style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
              Delete provider (blocked when in use)
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

function ProviderForm({ initial }: { initial?: ProviderCatalogTile }) {
  return (
    <form action={saveProvider} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Provider key">
        <select name="key" defaultValue={initial?.key ?? "OKTA"} required
                disabled={!!initial}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          {PROVIDER_KEYS.map((k) => <option key={k} value={k}>{PROVIDER_LABELS[k]}</option>)}
        </select>
      </Field>
      <Field label="Display name">
        <input type="text" name="name" required maxLength={120} defaultValue={initial?.name ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Default type">
        <select name="defaultType" defaultValue={initial?.defaultType ?? "SAML"}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="SAML">SAML 2.0</option>
          <option value="OIDC">OIDC</option>
        </select>
      </Field>
      <Field label="Default scopes (comma-separated)">
        <input type="text" name="defaultScopesRaw" maxLength={1000}
               defaultValue={initial?.defaultScopes.join(", ") ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Description" full>
        <textarea name="description" rows={2} maxLength={500} defaultValue={initial?.description ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Setup docs URL">
        <input type="url" name="setupDocsUrl" maxLength={500} defaultValue={initial?.setupDocsUrl ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Icon key">
        <input type="text" name="iconKey" maxLength={80} defaultValue={initial?.iconKey ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Notes (admin-only)" full>
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={initial?.notes ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <label className="md:col-span-2 inline-flex items-center gap-2 text-[12px]"
             style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="ts-focus h-4 w-4" />
        Active — show in catalog
      </label>
      <div className="md:col-span-2 flex justify-end">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Save provider
        </button>
      </div>
    </form>
  );
}

/* ── Per-tenant configs tab ────────────────── */

async function ConfigsTab({
  filters, providers, tenants, canWrite,
}: {
  filters: TenantConfigFilters;
  providers: ProviderCatalogTile[];
  tenants: Array<{ id: string; name: string; slug: string }>;
  canWrite: boolean;
}) {
  const rows = await loadTenantConfigs(filters);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="tab" value="configs" />
          <input type="text" name="q" defaultValue={filters.q ?? ""}
                 placeholder="Search by tenant name, slug, display name…"
                 className="ts-focus min-w-[260px] flex-1 rounded-md border px-2.5 py-1.5 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <select name="provider" defaultValue={filters.providerId ?? ""}
                  className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">All providers</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="status" defaultValue={typeof filters.status === "string" ? filters.status : "ALL"}
                  className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="ALL">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select>
          <label className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="scim" value="1" defaultChecked={!!filters.scimOnly}
                   className="ts-focus h-3.5 w-3.5" />
            SCIM only
          </label>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Filter
          </button>
        </form>
        {canWrite && (
          <details className="relative">
            <summary className="ts-focus cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium list-none"
                     style={{ background: "var(--accent-primary)", color: "white" }}>
              + New config
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-[420px] rounded-md border shadow-lg p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}>
              <NewConfigForm providers={providers} tenants={tenants} />
            </div>
          </details>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>No configurations match.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tenant</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Provider</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Type</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Display name</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">SCIM</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Force SSO</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Last login</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Last sync</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Metadata refreshed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <ConfigRow key={r.id} r={r} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ConfigRow({ r }: { r: TenantConfigRow }) {
  return (
    <tr className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="px-2 py-1.5">
        <Link href={`/platform/tenants/${r.tenantSlug}`}
              className="ts-focus underline" style={{ color: "var(--text-default)" }}>
          {r.tenantName}
        </Link>
      </td>
      <td className="px-2 py-1.5"><ProviderBadge providerKey={r.providerKey} /></td>
      <td className="px-2 py-1.5">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: r.type === "SAML" ? "var(--accent-surface)" : "var(--surface-2)",
                color:      r.type === "SAML" ? "var(--accent-primary)" : "var(--text-default)",
              }}>
          {r.type}
        </span>
      </td>
      <td className="px-2 py-1.5"><StatusPill status={r.status} /></td>
      <td className="px-2 py-1.5">
        <Link href={`/platform/integrations/sso/${r.id}`}
              className="ts-focus underline" style={{ color: "var(--text-default)" }}>
          {r.displayName}
        </Link>
        {r.lastError && (
          <div className="text-[10px]" style={{ color: "var(--danger-fg)" }}>⚠ {r.lastError}</div>
        )}
      </td>
      <td className="px-2 py-1.5">
        {r.scimEnabled ? (
          <span style={{ color: "var(--success-fg)" }}>✓</span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>—</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        {r.forceSso ? (
          <span style={{ color: "var(--accent-primary)" }}>🔒</span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.lastLoginAt)}</td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.lastSyncAt)}</td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {relativeFromNow(r.metadataLastRefreshedAt)}
      </td>
    </tr>
  );
}

function NewConfigForm({
  providers, tenants,
}: {
  providers: ProviderCatalogTile[];
  tenants: Array<{ id: string; name: string; slug: string }>;
}) {
  return (
    <form action={createTenantConfig} className="space-y-2">
      <Field label="Tenant">
        <select name="tenantId" required defaultValue=""
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="" disabled>— Select tenant —</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field label="Provider">
        <select name="providerId" required defaultValue=""
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="" disabled>— Select provider —</option>
          {providers.filter((p) => p.active).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <select name="type" defaultValue="SAML"
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="SAML">SAML 2.0</option>
          <option value="OIDC">OIDC</option>
        </select>
      </Field>
      <Field label="Display name (shown on login button)">
        <input type="text" name="displayName" required maxLength={120}
               placeholder="Sign in with Okta"
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <div className="flex justify-end">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Create config
        </button>
      </div>
    </form>
  );
}

/* ── SCIM Logs tab ───────────────────────────── */

async function ScimLogsTab({
  filters, page, tenants, canWrite,
}: {
  filters: ScimLogFilters;
  page: number;
  tenants: Array<{ id: string; name: string; slug: string }>;
  canWrite: boolean;
}) {
  const result = await loadScimLogs(filters, { page, pageSize: 100 });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2" method="get">
        <input type="hidden" name="tab" value="scim" />
        <select name="tenant" defaultValue={filters.tenantId ?? ""}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">All tenants</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="op" defaultValue={filters.operation ?? ""}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">All operations</option>
          {OPERATIONS.map((o) => <option key={o} value={o}>{OPERATION_LABELS[o]}</option>)}
        </select>
        <select name="status" defaultValue={typeof filters.status === "string" ? filters.status : "ALL"}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="ALL">All statuses</option>
          {SCIM_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <input type="date" name="from" defaultValue={filters.from ? filters.from.toISOString().slice(0, 10) : ""}
               className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        <input type="date" name="to" defaultValue={filters.to ? filters.to.toISOString().slice(0, 10) : ""}
               className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Filter
        </button>
      </form>

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {result.rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>No SCIM events match.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Time</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tenant</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Operation</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Resource</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">External ID</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Code</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Error</th>
                {canWrite && <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => <ScimRow key={r.id} r={r} canWrite={canWrite} />)}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>Page {page} of {totalPages} · {result.total.toLocaleString()} events</span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link href={`?tab=scim&page=${page - 1}`} scroll={false}
                    className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?tab=scim&page=${page + 1}`} scroll={false}
                    className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScimRow({ r, canWrite }: { r: ScimLogRow; canWrite: boolean }) {
  return (
    <tr className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {relativeFromNow(r.occurredAt)}
      </td>
      <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>
        {r.tenantName ?? r.tenantId.slice(0, 8)}
      </td>
      <td className="px-2 py-1.5">
        <OperationLabel operation={r.operation} />
      </td>
      <td className="px-2 py-1.5">
        <span style={{ color: "var(--text-default)" }}>{r.resourceType}</span>
        {r.resourceId && (
          <code className="ml-1 rounded px-1 py-0.5 text-[10px]"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
            {r.resourceId.slice(0, 8)}
          </code>
        )}
      </td>
      <td className="px-2 py-1.5">
        <code className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          {r.externalId ?? "—"}
        </code>
      </td>
      <td className="px-2 py-1.5">
        <ScimStatusPill status={r.status} />
        {r.attempts > 1 && (
          <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            ×{r.attempts}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums"
          style={{
            color: r.httpCode == null ? "var(--text-faint)" :
                   r.httpCode < 300 ? "var(--success-fg)" :
                   r.httpCode < 500 ? "var(--warning-fg)" : "var(--danger-fg)",
          }}>
        {r.httpCode ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--danger-fg)" }}>
        {r.errorMessage && r.errorMessage.length > 80 ? r.errorMessage.slice(0, 80) + "…" : r.errorMessage}
      </td>
      {canWrite && (
        <td className="px-2 py-1.5 text-right">
          <div className="flex justify-end gap-1">
            <details>
              <summary className="cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium list-none"
                       style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                View raw
              </summary>
              <pre className="absolute right-0 z-10 mt-1 w-[420px] rounded-md border p-2 text-[10px] font-mono whitespace-pre-wrap"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}>
                {JSON.stringify(r.payload, null, 2)}
              </pre>
            </details>
            {(r.status === "ERROR" || r.status === "DEAD_LETTER") && (
              <form action={retryScimEvent}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit"
                        className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                  Retry
                </button>
              </form>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

/* ── Templates tab ───────────────────────────── */

async function TemplatesTab({
  providers, canWrite,
}: { providers: ProviderCatalogTile[]; canWrite: boolean }) {
  const templates = await loadIdpTemplates();
  return (
    <div className="space-y-4">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add template
          </summary>
          <TemplateForm providers={providers} />
        </details>
      )}

      {templates.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No templates yet. Templates pre-fill SAML/OIDC config snippets that tenants can copy-paste during setup.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.id} className="rounded-lg border p-3 space-y-2"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px]">{PROVIDER_ICONS[t.providerKey]}</span>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                  {t.providerName} · {t.name}
                </h3>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: t.type === "SAML" ? "var(--accent-surface)" : "var(--surface-2)",
                        color:      t.type === "SAML" ? "var(--accent-primary)" : "var(--text-default)",
                      }}>
                  {t.type}
                </span>
              </div>
              {t.description && (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.description}</p>
              )}
              <pre className="rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto"
                   style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
                {t.snippet}
              </pre>
              {canWrite && (
                <details>
                  <summary className="cursor-pointer text-[11px]" style={{ color: "var(--accent-primary)" }}>
                    Edit
                  </summary>
                  <TemplateForm providers={providers} initial={t} />
                  <form action={deleteTemplate} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit"
                            className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                            style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                      Delete template
                    </button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateForm({
  providers, initial,
}: { providers: ProviderCatalogTile[]; initial?: TemplateRow }) {
  return (
    <form action={saveTemplate} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Provider">
        <select name="providerId" required defaultValue={initial?.providerId ?? ""}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="" disabled>— Select —</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Template name">
        <input type="text" name="name" required maxLength={120} defaultValue={initial?.name ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Type">
        <select name="type" defaultValue={initial?.type ?? "SAML"}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="SAML">SAML 2.0</option>
          <option value="OIDC">OIDC</option>
        </select>
      </Field>
      <Field label="Description">
        <input type="text" name="description" maxLength={500} defaultValue={initial?.description ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Snippet (XML or JSON)" full>
        <textarea name="snippet" required rows={8} maxLength={20_000}
                  defaultValue={initial?.snippet ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-2)" }} />
      </Field>
      <div className="md:col-span-2 flex justify-end">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Save template
        </button>
      </div>
    </form>
  );
}

/* ── Settings tab ──────────────────────────── */

function SettingsTab({
  settings, canWrite,
}: {
  settings: Awaited<ReturnType<typeof loadSsoSettings>>;
  canWrite: boolean;
}) {
  return (
    <form action={saveSsoSettings}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          SSO settings
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="enforceMfaWithSso" defaultChecked={settings.enforceMfaWithSso} className="ts-focus h-4 w-4" />
            Enforce MFA with SSO globally
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="idpInitiatedSsoAllowed" defaultChecked={settings.idpInitiatedSsoAllowed} className="ts-focus h-4 w-4" />
            Allow IdP-initiated SSO
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="jitDeprovisionEnabled" defaultChecked={settings.jitDeprovisionEnabled} className="ts-focus h-4 w-4" />
            Just-in-time deprovision (auto-disable on missing IdP record)
          </label>
          <Field label="Session lifetime override (hours, blank = platform default)">
            <input type="number" name="sessionLifetimeHours" min={1} max={720}
                   defaultValue={settings.sessionLifetimeHours ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Last edited {settings.updatedAt.toLocaleString()}
          </p>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save settings
          </button>
        </div>
      </fieldset>
    </form>
  );
}
