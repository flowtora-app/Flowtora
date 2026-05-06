// Page 46 — API Keys & Webhooks (top-level).
//
// Single route, 7 tabs:
//   API Keys · Webhook Endpoints · Event Catalog · Deliveries ·
//   Signing Secrets · Rate Limits · Settings.

import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadApiKpis,
  loadApiKeys,
  loadApiKeyTeams,
  loadWebhookEndpoints,
  loadEventCatalog,
  loadDeliveries,
  loadDeliveryDetail,
  loadRateLimitData,
  loadWebhookSettings,
  KEY_STATUS_TONE,
  ENDPOINT_STATUS_TONE,
  DELIVERY_STATUS_TONE,
  STABILITY_TONE,
  CATEGORY_LABELS,
  type ApiKpis,
  type ApiKeyRow,
  type ApiKeyFilters,
  type EndpointRow,
  type EventCatalogRow,
  type DeliveryRow,
  type DeliveryFilters,
  type RateLimitRow,
  type WebhookSettingsView,
} from "@/server/platform/webhooks";
import {
  createApiKey,
  rotateApiKey,
  revokeApiKey,
  rotateAllKeys,
  saveWebhookEndpoint,
  deleteWebhookEndpoint,
  pauseWebhookEndpoint,
  rotateEndpointSecret,
  rotateAllSecrets,
  replayDelivery,
  markDeliveryResolved,
  moveDeliveryToDeadLetter,
  saveEvent,
  saveWebhookSettings,
} from "@/app/actions/platform-webhooks";
import type {
  ApiKeyEnvironment,
  ApiKeyStatus,
  WebhookDeliveryStatus,
  WebhookEventCategory,
} from "@prisma/client";

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

const TABS = ["keys", "endpoints", "events", "deliveries", "secrets", "ratelimits", "settings"] as const;
type Tab = typeof TABS[number];

const ENVIRONMENTS: ApiKeyEnvironment[] = ["PRODUCTION", "STAGING", "SANDBOX"];
const KEY_STATUSES: ApiKeyStatus[] = ["ACTIVE", "REVOKED", "EXPIRED"];

export default async function ApiKeysAndWebhooksPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("webhooks.manage");
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const revealKey = asString(sp.revealKey);
  const revealId  = asString(sp.revealId);

  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "keys";

  const [kpis, keyTeams, settings, endpoints, eventsCat, deliveryDetailHover] = await Promise.all([
    loadApiKpis(),
    loadApiKeyTeams(),
    loadWebhookSettings(),
    loadWebhookEndpoints(),
    loadEventCatalog({ q: asString(sp.eventQ), category: asString(sp.eventCat) as WebhookEventCategory | undefined }),
    asString(sp.deliveryId) ? loadDeliveryDetail(asString(sp.deliveryId)!) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      <Header />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      {revealKey && (
        <RevealKeyBanner fullKey={revealKey} keyId={revealId ?? null} />
      )}

      <KpiBar kpis={kpis} />

      <TabsBar active={tab} kpis={kpis} />

      {tab === "keys" && (
        <KeysTab
          ctx={{ canWrite, viewerId: ctx.userId }}
          filters={{
            q:           asString(sp.q),
            status:      asString(sp.status) as ApiKeyStatus | "ALL" | undefined,
            environment: asString(sp.env)    as ApiKeyEnvironment | "ALL" | undefined,
            team:        asString(sp.team),
            scope:       asString(sp.scope),
          }}
          teams={keyTeams}
        />
      )}
      {tab === "endpoints" && (
        <EndpointsTab endpoints={endpoints} canWrite={canWrite} />
      )}
      {tab === "events" && (
        <EventCatalogTab
          groups={eventsCat.groups}
          q={asString(sp.eventQ)}
          category={asString(sp.eventCat) as WebhookEventCategory | undefined}
          canWrite={canWrite}
        />
      )}
      {tab === "deliveries" && (
        <DeliveriesTab
          filters={{
            endpointId: asString(sp.endpoint),
            eventName:  asString(sp.event),
            status:     asString(sp.status) as WebhookDeliveryStatus | "ALL" | undefined,
            httpCode:   asNum(sp.code),
            tenantId:   asString(sp.tenant),
            hasRetries: asString(sp.retries) === "1" ? true : undefined,
            from:       asString(sp.from) ? new Date(asString(sp.from)!) : undefined,
            to:         asString(sp.to)   ? new Date(asString(sp.to)!)   : undefined,
          }}
          page={asNum(sp.page) ?? 1}
          endpoints={endpoints}
          canWrite={canWrite}
          detail={deliveryDetailHover}
        />
      )}
      {tab === "secrets" && (
        <SecretsTab endpoints={endpoints} canWrite={canWrite} />
      )}
      {tab === "ratelimits" && (
        <RateLimitsTab />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ── Header / KPI / Tabs ───────────────────────────── */

function Header() {
  return (
    <div>
      <nav className="text-[11px]" aria-label="Breadcrumbs">
        <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Integrations Catalog
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text-default)" }}>API &amp; Webhooks</span>
      </nav>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        API Keys &amp; Webhooks
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Platform-level system-to-system credentials, the Flowtora webhook event catalog,
        delivery logs, signing-secret rotation, rate limits, and global webhook settings.
      </p>
    </div>
  );
}

function KpiBar({ kpis }: { kpis: ApiKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Active API keys" value={kpis.activeKeys.toLocaleString()}
           sub={kpis.expiringSoon > 0 ? `${kpis.expiringSoon} expiring within 14d` : "All healthy"}
           tone={kpis.expiringSoon > 0 ? "warning" : "good"} />
      <Kpi label="Endpoints · active" value={kpis.endpointsActive.toLocaleString()}
           sub={`${kpis.endpointsFailing} failing`}
           tone={kpis.endpointsFailing > 0 ? "warning" : "good"} />
      <Kpi label="Deliveries · 24h" value={kpis.deliveriesLast24h.toLocaleString()} />
      <Kpi label="Success rate · 24h"
           value={kpis.successRate24h == null ? "—" : `${(kpis.successRate24h * 100).toFixed(1)}%`}
           tone={kpis.successRate24h == null ? "default" :
                 kpis.successRate24h >= 0.99 ? "good" :
                 kpis.successRate24h >= 0.95 ? "warning" : "danger"} />
      <Kpi label="Dead-letter" value={kpis.deadLetterCount.toLocaleString()}
           tone={kpis.deadLetterCount === 0 ? "good" : kpis.deadLetterCount > 50 ? "danger" : "warning"} />
      <Kpi label="Rate-limited · 24h" value={kpis.rateLimitedRequests24h.toLocaleString()}
           tone={kpis.rateLimitedRequests24h === 0 ? "good" : kpis.rateLimitedRequests24h > 100 ? "warning" : "default"} />
    </div>
  );
}

function TabsBar({ active, kpis }: { active: Tab; kpis: ApiKpis }) {
  const items: Array<{ key: Tab; label: string; badge?: string; tone?: "warn" | "danger" }> = [
    { key: "keys",       label: "API Keys" },
    { key: "endpoints",  label: "Webhook Endpoints", badge: kpis.endpointsFailing > 0 ? String(kpis.endpointsFailing) : undefined, tone: "warn" },
    { key: "events",     label: "Event Catalog" },
    { key: "deliveries", label: "Deliveries", badge: kpis.deadLetterCount > 0 ? String(kpis.deadLetterCount) : undefined, tone: "danger" },
    { key: "secrets",    label: "Signing Secrets" },
    { key: "ratelimits", label: "Rate Limits", badge: kpis.rateLimitedRequests24h > 0 ? String(kpis.rateLimitedRequests24h) : undefined },
    { key: "settings",   label: "Settings" },
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
                      background: i.tone === "warn" ? "var(--warning-surface)" :
                                  i.tone === "danger" ? "var(--rose-50, var(--surface-2))" : "var(--surface-2)",
                      color:      i.tone === "warn" ? "var(--warning-fg)" :
                                  i.tone === "danger" ? "var(--danger-fg)" : "var(--text-muted)",
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

/* ── Reveal-key banner ─────────────────────────────── */

function RevealKeyBanner({ fullKey, keyId }: { fullKey: string; keyId: string | null }) {
  return (
    <div className="rounded-lg border-l-4 p-3 space-y-2"
         style={{ borderColor: "var(--success-fg)", background: "var(--success-surface)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--success-fg)" }}>
          ✓ API key generated — copy this once. It won't be shown again.
        </h2>
        {keyId && (
          <Link href={`?tab=keys`} scroll={false}
                className="text-[11px] underline" style={{ color: "var(--success-fg)" }}>
            Dismiss
          </Link>
        )}
      </div>
      <pre className="rounded-md border p-2 text-[12px] font-mono select-all overflow-x-auto"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-default)" }}>
        {fullKey}
      </pre>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Store this in your secret manager (1Password, Doppler, AWS Secrets Manager).
        Flowtora only stores a SHA-256 hash — losing this means rotation is your only recourse.
      </p>
    </div>
  );
}

/* ── API Keys tab ──────────────────────────────────── */

async function KeysTab({
  ctx, filters, teams,
}: {
  ctx: { canWrite: boolean; viewerId: string };
  filters: ApiKeyFilters;
  teams: string[];
}) {
  const rows = await loadApiKeys(filters);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-1 flex-wrap items-center gap-2" method="get">
          <input type="hidden" name="tab" value="keys" />
          <input type="text" name="q" defaultValue={filters.q ?? ""}
                 placeholder="Search by name, prefix, or description…"
                 className="ts-focus min-w-[240px] flex-1 rounded-md border px-2.5 py-1.5 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <select name="status" defaultValue={typeof filters.status === "string" ? filters.status : "ALL"}
                  className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="ALL">All statuses</option>
            {KEY_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select>
          <select name="env" defaultValue={typeof filters.environment === "string" ? filters.environment : "ALL"}
                  className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="ALL">All envs</option>
            {ENVIRONMENTS.map((e) => <option key={e} value={e}>{e.toLowerCase()}</option>)}
          </select>
          <select name="team" defaultValue={filters.team ?? ""}
                  className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">All teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" name="scope" defaultValue={filters.scope ?? ""}
                 placeholder="Scope filter (e.g. tenants:read)"
                 className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", width: 160 }} />
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Filter
          </button>
        </form>
        {ctx.canWrite && (
          <>
            <details className="relative">
              <summary className="ts-focus cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium list-none"
                       style={{ background: "var(--accent-primary)", color: "white" }}>
                + Create API Key
              </summary>
              <div className="absolute right-0 z-10 mt-1 w-[420px] rounded-md border shadow-lg p-3"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}>
                <CreateKeyForm />
              </div>
            </details>
            <form action={rotateAllKeys}>
              <button type="submit"
                      className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}
                      title="Rotate every active key. Existing keys stop working immediately.">
                Rotate All
              </button>
            </form>
          </>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            No API keys match these filters.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Name</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Prefix</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Owner</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Scopes</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Env</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Calls 7d</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Last used</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Expires</th>
                {ctx.canWrite && <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => <KeyRow key={k.id} k={k} canWrite={ctx.canWrite} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KeyRow({ k, canWrite }: { k: ApiKeyRow; canWrite: boolean }) {
  const tone = KEY_STATUS_TONE[k.status];
  const expiringSoon = k.expiresAt
    ? (k.expiresAt.getTime() - Date.now()) / 86_400_000 < 14
    : false;
  return (
    <tr className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="px-2 py-1.5">
        <div className="font-medium" style={{ color: "var(--text-default)" }}>{k.name}</div>
        {k.description && (
          <div className="text-[11px] truncate max-w-[280px]" style={{ color: "var(--text-muted)" }}>{k.description}</div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <code className="rounded px-1.5 py-0.5 text-[11px]"
              style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
          {k.keyPrefix}…
        </code>
      </td>
      <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>
        {k.ownerTeam ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
        {k.createdByName && (
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>by {k.createdByName}</div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-0.5">
          {k.scopes.slice(0, 3).map((s) => (
            <code key={s} className="rounded px-1 py-0.5 text-[9px]"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {s}
            </code>
          ))}
          {k.scopes.length > 3 && (
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              +{k.scopes.length - 3}
            </span>
          )}
        </div>
        {k.ipAllowlist.length > 0 && (
          <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            IPs: {k.ipAllowlist.length}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: k.environment === "PRODUCTION" ? "var(--accent-surface)" : "var(--surface-2)",
                color:      k.environment === "PRODUCTION" ? "var(--accent-primary)" : "var(--text-muted)",
              }}>
          {k.environment.toLowerCase()}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: tone.bg, color: tone.fg }}>
          {k.status.toLowerCase()}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
        {k.usage7d.toLocaleString()}
      </td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {relativeFromNow(k.lastUsedAt)}
      </td>
      <td className="px-2 py-1.5 text-[11px]"
          style={{ color: expiringSoon ? "var(--warning-fg)" : "var(--text-muted)" }}>
        {k.expiresAt ? k.expiresAt.toLocaleDateString() : "—"}
      </td>
      {canWrite && (
        <td className="px-2 py-1.5">
          <div className="flex justify-end gap-1">
            {k.status === "ACTIVE" && (
              <>
                <form action={rotateApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                    Rotate
                  </button>
                </form>
                <form action={revokeApiKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                          style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                    Revoke
                  </button>
                </form>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function CreateKeyForm() {
  return (
    <form action={createApiKey} className="space-y-2">
      <Field label="Name">
        <input type="text" name="name" required maxLength={120}
               placeholder="Datadog APM ingest"
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Description">
        <textarea name="description" rows={2} maxLength={500}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Owner team">
        <input type="text" name="ownerTeam" maxLength={80}
               placeholder="Engineering"
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Scopes (one per line or comma-separated)">
        <textarea name="scopesRaw" rows={3} maxLength={2000}
                  placeholder={"tenants:read\ntenants:write\nbilling:read"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Environment">
        <select name="environment" defaultValue="PRODUCTION"
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="PRODUCTION">Production</option>
          <option value="STAGING">Staging</option>
          <option value="SANDBOX">Sandbox</option>
        </select>
      </Field>
      <Field label="Expiry">
        <select name="expiry" defaultValue="90d"
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="none">No expiry</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="1y">1 year</option>
        </select>
      </Field>
      <Field label="IP allowlist (CIDR per line)">
        <textarea name="ipAllowlistRaw" rows={2} maxLength={2000}
                  placeholder={"10.0.0.0/24\n203.0.113.0/24"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Rate limit override (req/min)">
        <input type="number" name="rateLimitPerMin" min={0} max={100_000}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <div className="flex justify-end pt-1">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Create key
        </button>
      </div>
    </form>
  );
}

/* ── Webhook endpoints tab ────────────────────────── */

function EndpointsTab({ endpoints, canWrite }: { endpoints: EndpointRow[]; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add Endpoint
          </summary>
          <EndpointForm canWrite={canWrite} />
        </details>
      )}

      {endpoints.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No webhook endpoints configured.</p>
      ) : (
        <ul className="space-y-2">
          {endpoints.map((e) => <EndpointCard key={e.id} e={e} canWrite={canWrite} />)}
        </ul>
      )}
    </div>
  );
}

function EndpointCard({ e, canWrite }: { e: EndpointRow; canWrite: boolean }) {
  const tone = ENDPOINT_STATUS_TONE[e.status];
  return (
    <li className="rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="truncate text-[12px] font-semibold"
                  style={{ color: "var(--text-default)" }}>{e.url}</code>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: tone.bg, color: tone.fg }}>
              {e.status.toLowerCase()}
            </span>
          </div>
          {e.description && (
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{e.description}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span><strong style={{ color: "var(--text-default)" }}>{e.subscribedEvents.length}</strong> events</span>
            <span>·</span>
            <span style={{
              color: e.successRate24h == null ? "var(--text-muted)" :
                     e.successRate24h >= 0.99 ? "var(--success-fg)" :
                     e.successRate24h >= 0.95 ? "var(--warning-fg)" : "var(--danger-fg)",
            }}>
              {e.successRate24h == null ? "—" : `${(e.successRate24h * 100).toFixed(1)}%`} 24h success
            </span>
            <span>·</span>
            <span>retry: {e.retryPolicy.toLowerCase()} · {e.maxAttempts} attempts</span>
            <span>·</span>
            <span>timeout: {e.timeoutSec}s</span>
            {e.lastDeliveryAt && (
              <>
                <span>·</span>
                <span>last delivered {relativeFromNow(e.lastDeliveryAt)}</span>
              </>
            )}
          </div>
          {e.lastError && (
            <p className="mt-1 truncate text-[10px]" style={{ color: "var(--danger-fg)" }}>
              ⚠ {e.lastError}
            </p>
          )}
        </div>
        {canWrite && (
          <div className="flex items-center gap-1">
            <form action={pauseWebhookEndpoint}>
              <input type="hidden" name="id" value={e.id} />
              <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                {e.status === "PAUSED" ? "Resume" : "Pause"}
              </button>
            </form>
            <form action={deleteWebhookEndpoint}>
              <input type="hidden" name="id" value={e.id} />
              <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                      style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                Delete
              </button>
            </form>
          </div>
        )}
      </div>

      {e.subscribedEvents.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {e.subscribedEvents.map((ev) => (
            <code key={ev} className="rounded px-1.5 py-0.5 text-[9px]"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {ev}
            </code>
          ))}
        </div>
      )}

      {canWrite && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px]" style={{ color: "var(--accent-primary)" }}>
            Edit endpoint
          </summary>
          <EndpointForm canWrite={canWrite} initial={e} />
        </details>
      )}
    </li>
  );
}

function EndpointForm({ canWrite, initial }: { canWrite: boolean; initial?: EndpointRow }) {
  return (
    <form action={saveWebhookEndpoint} className="mt-2 space-y-2">
      <fieldset disabled={!canWrite} className="contents">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <Field label="URL (HTTPS)">
          <input type="url" name="url" required maxLength={500}
                 defaultValue={initial?.url ?? "https://"}
                 pattern="https://.*"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Description">
          <input type="text" name="description" maxLength={500}
                 defaultValue={initial?.description ?? ""}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Subscribed events (one per line or comma-separated)">
          <textarea name="subscribedEventsRaw" rows={4} maxLength={5000}
                    defaultValue={initial?.subscribedEvents.join("\n") ?? ""}
                    placeholder={"tenant.created\nbilling.invoice.paid\nuser.login"}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Field label="Status">
            <select name="status" defaultValue={initial?.status ?? "ACTIVE"}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </Field>
          <Field label="Retry policy">
            <select name="retryPolicy" defaultValue={initial?.retryPolicy ?? "EXPONENTIAL"}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="EXPONENTIAL">Exponential</option>
              <option value="LINEAR">Linear</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </Field>
          <Field label="Max attempts">
            <input type="number" name="maxAttempts" min={1} max={10}
                   defaultValue={initial?.maxAttempts ?? 5}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Timeout (sec)">
            <input type="number" name="timeoutSec" min={1} max={30}
                   defaultValue={initial?.timeoutSec ?? 15}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Auto-disable after N failures">
            <input type="number" name="autoDisableThreshold" min={0} max={1000}
                   defaultValue={initial?.autoDisableThreshold ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>
        <Field label="Custom headers (Header-Name: value, one per line)">
          <textarea name="customHeadersRaw" rows={3} maxLength={2000}
                    defaultValue={(initial?.customHeaders ?? []).map((h) => `${h.key}: ${h.value}`).join("\n")}
                    placeholder={"X-Flowtora-Source: platform\nAuthorization: Bearer …"}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Filter expression (CEL/JSONLogic, optional)">
          <input type="text" name="filterExpression" maxLength={2000}
                 defaultValue={initial?.filterExpression ?? ""}
                 placeholder="payload.tenant.plan == 'ENTERPRISE'"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <div className="flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save endpoint
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Event catalog tab ────────────────────────────── */

function EventCatalogTab({
  groups, q, category, canWrite,
}: {
  groups: Array<{ category: WebhookEventCategory; rows: EventCatalogRow[] }>;
  q?: string;
  category?: WebhookEventCategory;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2" method="get">
        <input type="hidden" name="tab" value="events" />
        <input type="text" name="eventQ" defaultValue={q ?? ""}
               placeholder="Search events…"
               className="ts-focus min-w-[220px] flex-1 rounded-md border px-2.5 py-1.5 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        <select name="eventCat" defaultValue={category ?? ""}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">All categories</option>
          {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Filter
        </button>
        {canWrite && (
          <details className="relative">
            <summary className="ts-focus cursor-pointer rounded-md px-3 py-1.5 text-[12px] font-medium list-none"
                     style={{ background: "var(--accent-primary)", color: "white" }}>
              + Add Event
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-[420px] rounded-md border shadow-lg p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}>
              <EventForm />
            </div>
          </details>
        )}
      </form>

      {groups.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No events match.</p>
      ) : (
        groups.map((g) => (
          <div key={g.category} className="rounded-lg border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <h3 className="px-3 py-2 text-[12px] font-semibold border-b"
                style={{ color: "var(--text-default)", borderColor: "var(--border-subtle)" }}>
              {CATEGORY_LABELS[g.category]} · {g.rows.length}
            </h3>
            <ul>
              {g.rows.map((e) => <EventRow key={e.id} e={e} canWrite={canWrite} />)}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function EventRow({ e, canWrite }: { e: EventCatalogRow; canWrite: boolean }) {
  const tone = STABILITY_TONE[e.stability];
  return (
    <li className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <details>
        <summary className="cursor-pointer p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{e.name}</code>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: tone.bg, color: tone.fg }}>
              {e.stability.toLowerCase()}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              v{e.introducedVersion}
            </span>
            <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text-default)" }}>{e.subscriberCount}</strong> subscriber{e.subscriberCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {e.description}
          </p>
        </summary>

        <div className="px-3 pb-3 space-y-3">
          {e.deprecationNotice && (
            <p className="rounded-md border-l-2 px-2 py-1 text-[11px]"
               style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
              ⚠ Deprecated: {e.deprecationNotice}
            </p>
          )}
          <div>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Sample payload
            </h4>
            <pre className="rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap"
                 style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
              {JSON.stringify(e.samplePayload, null, 2)}
            </pre>
          </div>
          {e.versions.length > 0 && (
            <div>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Version history
              </h4>
              <ul className="space-y-0.5 text-[11px]">
                {e.versions.map((v) => (
                  <li key={v.id}>
                    <code className="font-mono" style={{ color: "var(--text-default)" }}>v{v.version}</code>
                    {v.breaking && (
                      <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
                            style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
                        breaking
                      </span>
                    )}
                    <span className="ml-1" style={{ color: "var(--text-muted)" }}>
                      {v.releasedAt.toLocaleDateString()}
                      {v.changes ? ` · ${v.changes.slice(0, 80)}${v.changes.length > 80 ? "…" : ""}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Object.keys(e.codeSamples).length > 0 && (
            <div>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Code samples
              </h4>
              {Object.entries(e.codeSamples).map(([lang, code]) => (
                <details key={lang} className="mt-1">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
                    {lang}
                  </summary>
                  <pre className="mt-1 rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap"
                       style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
                    {code}
                  </pre>
                </details>
              ))}
            </div>
          )}
          {canWrite && (
            <details>
              <summary className="cursor-pointer text-[11px] font-medium" style={{ color: "var(--accent-primary)" }}>
                Edit event
              </summary>
              <EventForm initial={e} />
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

function EventForm({ initial }: { initial?: EventCatalogRow }) {
  return (
    <form action={saveEvent} className="space-y-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Event name (e.g. tenant.created)">
        <input type="text" name="name" required maxLength={120}
               defaultValue={initial?.name ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Category">
        <select name="category" defaultValue={initial?.category ?? "SYSTEM"}
                className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <textarea name="description" required rows={2} maxLength={2000}
                  defaultValue={initial?.description ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Introduced version">
          <input type="text" name="introducedVersion" maxLength={50}
                 defaultValue={initial?.introducedVersion ?? "2024.01"}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Stability">
          <select name="stability" defaultValue={initial?.stability ?? "STABLE"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="STABLE">Stable</option>
            <option value="BETA">Beta</option>
            <option value="DEPRECATED">Deprecated</option>
          </select>
        </Field>
      </div>
      <Field label="Schema URL">
        <input type="url" name="schemaUrl" maxLength={500}
               defaultValue={initial?.schemaUrl ?? ""}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Sample payload (JSON)">
        <textarea name="samplePayloadRaw" rows={4} maxLength={20_000}
                  defaultValue={JSON.stringify(initial?.samplePayload ?? {}, null, 2)}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <Field label="Deprecation notice (markdown, optional)">
        <textarea name="deprecationNotice" rows={2} maxLength={1000}
                  defaultValue={initial?.deprecationNotice ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[11px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </Field>
      <div className="flex justify-end">
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "white" }}>
          Save event
        </button>
      </div>
    </form>
  );
}

/* ── Deliveries tab ───────────────────────────────── */

async function DeliveriesTab({
  filters, page, endpoints, canWrite, detail,
}: {
  filters: DeliveryFilters;
  page: number;
  endpoints: EndpointRow[];
  canWrite: boolean;
  detail: Awaited<ReturnType<typeof loadDeliveryDetail>>;
}) {
  const result = await loadDeliveries(filters, { page, pageSize: 100 });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2" method="get">
        <input type="hidden" name="tab" value="deliveries" />
        <select name="endpoint" defaultValue={filters.endpointId ?? ""}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">All endpoints</option>
          {endpoints.map((e) => <option key={e.id} value={e.id}>{e.url}</option>)}
        </select>
        <input type="text" name="event" defaultValue={filters.eventName ?? ""}
               placeholder="Event name"
               className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", width: 180 }} />
        <select name="status" defaultValue={typeof filters.status === "string" ? filters.status : "ALL"}
                className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="ALL">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="SUCCEEDED">Succeeded</option>
          <option value="FAILED">Failed</option>
          <option value="DEAD_LETTER">Dead-letter</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <input type="number" name="code" defaultValue={filters.httpCode ?? ""}
               placeholder="HTTP code"
               className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", width: 110 }} />
        <label className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="retries" value="1" defaultChecked={!!filters.hasRetries} className="ts-focus h-3.5 w-3.5" />
          Has retries
        </label>
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Filter
        </button>
      </form>

      {detail && (
        <DeliveryDrawer detail={detail} canWrite={canWrite} />
      )}

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {result.rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            No deliveries match.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Attempted</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Event</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Endpoint</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tenant</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Code</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Latency</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Attempts</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Next retry</th>
                {canWrite && <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((d) => <DeliveryRowComp key={d.id} d={d} canWrite={canWrite} />)}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>
            Page {page} of {totalPages} · {result.total.toLocaleString()} deliveries
          </span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link href={`?tab=deliveries&page=${page - 1}`} scroll={false}
                    className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?tab=deliveries&page=${page + 1}`} scroll={false}
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

function DeliveryRowComp({ d, canWrite }: { d: DeliveryRow; canWrite: boolean }) {
  const tone = DELIVERY_STATUS_TONE[d.status];
  return (
    <tr className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {relativeFromNow(d.attemptedAt)}
      </td>
      <td className="px-2 py-1.5">
        <Link href={`?tab=deliveries&deliveryId=${d.id}`} scroll={false}
              className="ts-focus underline font-mono"
              style={{ color: "var(--text-default)" }}>
          {d.eventName}
        </Link>
      </td>
      <td className="px-2 py-1.5 text-[11px] truncate" style={{ color: "var(--text-muted)", maxWidth: 240 }}>
        {d.endpointUrl}
      </td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {d.tenantName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
      </td>
      <td className="px-2 py-1.5">
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: tone.bg, color: tone.fg }}>
          {d.status.toLowerCase().replace(/_/g, " ")}
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums"
          style={{
            color: d.httpCode == null ? "var(--text-faint)" :
                   d.httpCode < 300 ? "var(--success-fg)" :
                   d.httpCode < 500 ? "var(--warning-fg)" : "var(--danger-fg)",
          }}>
        {d.httpCode ?? "—"}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
        {d.latencyMs == null ? "—" : `${d.latencyMs}ms`}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums"
          style={{ color: d.attempts > 1 ? "var(--warning-fg)" : "var(--text-muted)" }}>
        {d.attempts}
      </td>
      <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {d.nextRetryAt ? d.nextRetryAt.toLocaleString() : "—"}
      </td>
      {canWrite && (
        <td className="px-2 py-1.5">
          <div className="flex justify-end gap-1">
            {(d.status === "FAILED" || d.status === "DEAD_LETTER") && (
              <form action={replayDelivery}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                  Replay
                </button>
              </form>
            )}
            {d.status !== "RESOLVED" && d.status !== "SUCCEEDED" && (
              <form action={markDeliveryResolved}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--emerald-200)" }}>
                  Resolve
                </button>
              </form>
            )}
            {d.status === "FAILED" && (
              <form action={moveDeliveryToDeadLetter}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                  Dead-letter
                </button>
              </form>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

function DeliveryDrawer({ detail, canWrite }: {
  detail: NonNullable<Awaited<ReturnType<typeof loadDeliveryDetail>>>;
  canWrite: boolean;
}) {
  const { row, payload, responseBody, requestHeaders, responseHeaders } = detail;
  return (
    <div className="rounded-lg border p-3 space-y-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--accent-primary)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Delivery {row.id.slice(0, 12)}
        </h3>
        <Link href="?tab=deliveries" scroll={false}
              className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>
          Close
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
        <div>
          <div style={{ color: "var(--text-muted)" }}>Event</div>
          <code style={{ color: "var(--text-default)" }}>{row.eventName}</code>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)" }}>Endpoint</div>
          <div className="truncate" style={{ color: "var(--text-default)" }}>{row.endpointUrl}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)" }}>Status</div>
          <div style={{ color: "var(--text-default)" }}>{row.status.toLowerCase().replace(/_/g, " ")}</div>
        </div>
        <div>
          <div style={{ color: "var(--text-muted)" }}>HTTP / latency</div>
          <div style={{ color: "var(--text-default)" }}>
            {row.httpCode ?? "—"} · {row.latencyMs ?? "—"}ms
          </div>
        </div>
      </div>
      {row.errorMessage && (
        <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
          {row.errorMessage}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
          Request payload
        </summary>
        <pre className="mt-1 rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
      <details>
        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
          Request headers
        </summary>
        <pre className="mt-1 rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
          {JSON.stringify(requestHeaders, null, 2)}
        </pre>
      </details>
      {responseBody && (
        <details>
          <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
            Response body
          </summary>
          <pre className="mt-1 rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
            {responseBody}
          </pre>
        </details>
      )}
      <details>
        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: "var(--text-default)" }}>
          Response headers
        </summary>
        <pre className="mt-1 rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
          {JSON.stringify(responseHeaders, null, 2)}
        </pre>
      </details>
      {canWrite && (row.status === "FAILED" || row.status === "DEAD_LETTER") && (
        <div className="flex gap-2">
          <form action={replayDelivery}>
            <input type="hidden" name="id" value={row.id} />
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Replay delivery
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── Signing secrets tab ───────────────────────────── */

function SecretsTab({ endpoints, canWrite }: { endpoints: EndpointRow[]; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Per-endpoint secret rotation
        </h2>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          When you rotate, the previous secret stays active for 24 hours so subscribers can switch over without
          dropping deliveries.
        </p>
        {endpoints.length === 0 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            No endpoints configured.
          </p>
        ) : (
          <table className="mt-2 w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Endpoint</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Current secret</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Grace period</th>
                {canWrite && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 text-[11px] truncate" style={{ color: "var(--text-default)", maxWidth: 280 }}>
                    {e.url}
                  </td>
                  <td className="px-2 py-1.5">
                    <code className="rounded px-1.5 py-0.5 text-[10px] font-mono select-all"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                      {e.signingSecret.slice(0, 14)}…
                    </code>
                  </td>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {e.signingSecretRotatesAt
                      ? (e.hasPreviousSecret ? `Old expires ${e.signingSecretRotatesAt.toLocaleString()}` : "—")
                      : "—"}
                  </td>
                  {canWrite && (
                    <td className="px-2 py-1.5 text-right">
                      <form action={rotateEndpointSecret}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit"
                                className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                          Rotate
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {canWrite && (
        <div className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)" }}>
          <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--danger-fg)" }}>
            Force rotate ALL secrets
          </h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Rotates every endpoint secret in one go. All previous secrets stay valid for 24h.
            Type <code>ROTATE ALL SECRETS</code> to confirm.
          </p>
          <form action={rotateAllSecrets} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="text" name="confirm" required maxLength={50}
                   placeholder="Type to confirm"
                   className="ts-focus min-w-[200px] flex-1 rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--rose-200)", background: "var(--surface-1)" }} />
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--danger-fg)", color: "white" }}>
              Rotate all secrets
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── Rate limits tab ───────────────────────────────── */

async function RateLimitsTab() {
  const data = await loadRateLimitData();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label="Top consumers"
             value={data.rows.length === 0 ? "0" : (data.rows[0]!.callsLastHour.toLocaleString())}
             sub={data.rows.length === 0 ? "—" : `${data.rows[0]!.name} · last hour`} />
        <Kpi label="Throttled · 24h" value={data.throttled24hTotal.toLocaleString()}
             tone={data.throttled24hTotal === 0 ? "good" : data.throttled24hTotal > 100 ? "warning" : "default"} />
        <Kpi label="Active keys" value={data.rows.length.toLocaleString()} />
      </div>

      <div className="rounded-lg border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Rate-limit consumption
        </h2>
        {data.rows.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No active keys.</p>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((r) => <RateLimitGauge key={r.id} r={r} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function RateLimitGauge({ r }: { r: RateLimitRow }) {
  return (
    <li className="text-[12px]">
      <div className="flex items-center justify-between">
        <span style={{ color: "var(--text-default)" }}>
          {r.name}{r.ownerTeam ? ` · ${r.ownerTeam}` : ""}
        </span>
        <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
          {r.callsLastMin.toLocaleString()}/min · {r.callsLastHour.toLocaleString()}/hr
          {r.rateLimitPerMin ? ` · cap ${r.rateLimitPerMin}` : ""}
          {r.throttled24h > 0 && (
            <span className="ml-2" style={{ color: "var(--warning-fg)" }}>
              {r.throttled24h} throttled (24h)
            </span>
          )}
        </span>
      </div>
      <div className="mt-1 h-2 w-full rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full"
             style={{
               width: `${r.consumptionPct}%`,
               background: r.consumptionPct >= 90 ? "var(--danger-fg)" :
                           r.consumptionPct >= 60 ? "var(--warning-fg)" : "var(--success-fg)",
             }} />
      </div>
    </li>
  );
}

/* ── Settings tab ──────────────────────────────────── */

function SettingsTab({ settings, canWrite }: { settings: WebhookSettingsView; canWrite: boolean }) {
  return (
    <form action={saveWebhookSettings}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Global webhook settings
      </h2>
      <fieldset disabled={!canWrite} className="contents">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Default retry policy">
            <select name="defaultRetryPolicy" defaultValue={settings.defaultRetryPolicy}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="EXPONENTIAL">Exponential</option>
              <option value="LINEAR">Linear</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </Field>
          <Field label="Default max attempts">
            <input type="number" name="defaultMaxAttempts" defaultValue={settings.defaultMaxAttempts} min={1} max={10}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Default timeout (sec)">
            <input type="number" name="defaultTimeoutSec" defaultValue={settings.defaultTimeoutSec} min={1} max={60}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Dead-letter retention (days)">
            <input type="number" name="deadLetterRetentionDays" defaultValue={settings.deadLetterRetentionDays} min={1} max={365}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Default auto-disable threshold">
            <input type="number" name="defaultAutoDisableThreshold" defaultValue={settings.defaultAutoDisableThreshold ?? ""} min={0} max={1000}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Encryption algorithm">
            <input type="text" name="encryptionAlgorithm" defaultValue={settings.encryptionAlgorithm ?? ""} maxLength={80}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>
        <Field label="Egress IP allowlist (one per line — share with tenants for firewall config)" full>
          <textarea name="egressIpsRaw" rows={4} maxLength={2000}
                    defaultValue={settings.egressIps.join("\n")}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>

        <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--success-fg)", background: "var(--success-surface)", color: "var(--success-fg)" }}>
          ✓ Encryption-at-rest verified{settings.encryptionVerifiedAt ? ` ${relativeFromNow(settings.encryptionVerifiedAt)}` : ""}
          {settings.encryptionAlgorithm ? ` · ${settings.encryptionAlgorithm}` : ""}
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

/* ── Layout primitives ────────────────────────────── */

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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
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

function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}
