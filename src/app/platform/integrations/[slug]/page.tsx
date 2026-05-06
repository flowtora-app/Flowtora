// Page 45 — Integration detail (/[slug]).
//
// 12 tabs: Overview · Configuration Schema · Adoption · Health & Monitoring ·
// Versions · Documentation · Permissions & Scopes · Pricing & Billing ·
// Webhooks · Field Mappings · Test Sandbox · Audit Log · Danger Zone.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCatalogDetail,
  loadCatalogAdoption,
  loadCatalogHealth,
  CATEGORY_LABELS,
  AUTH_LABELS,
  REGION_LABELS,
  type CatalogDetailView,
  type AdoptionView,
  type HealthView,
} from "@/server/platform/integrations-catalog";
import {
  saveIntegration,
  createVersion,
  setVersionDefault,
  deprecateVersionAction,
  deprecateIntegration,
  forceDisconnectAll,
  deleteIntegrationCatalog,
} from "@/app/actions/platform-integrations-catalog";
import { Kpi, StatusPill, CategoryBadge, AuthTypeBadge, RegionBadge, FormError, FormOk, Logo, relativeFromNow } from "../_shared";

export const dynamic = "force-dynamic";

const TABS = [
  "overview", "config", "adoption", "health", "versions", "docs",
  "permissions", "pricing", "webhooks", "mappings", "sandbox", "audit", "danger",
] as const;
type Tab = typeof TABS[number];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function IntegrationDetailPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const { slug } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("integrations.manage");

  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "overview";

  const [detail, adoption, health] = await Promise.all([
    loadCatalogDetail(slug),
    loadCatalogAdoption(slug),
    loadCatalogHealth(slug),
  ]);
  if (!detail) notFound();

  return (
    <div className="space-y-5">
      <Breadcrumbs name={detail.name} />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <Header detail={detail} />

      <KpiBar detail={detail} />

      <TabsBar active={tab} />

      {tab === "overview"     && <OverviewTab detail={detail} />}
      {tab === "config"       && <ConfigTab detail={detail} canWrite={canWrite} />}
      {tab === "adoption"     && <AdoptionTab adoption={adoption} />}
      {tab === "health"       && <HealthTab health={health} />}
      {tab === "versions"     && <VersionsTab detail={detail} canWrite={canWrite} />}
      {tab === "docs"         && <DocsTab detail={detail} />}
      {tab === "permissions"  && <PermissionsTab detail={detail} />}
      {tab === "pricing"      && <PricingTab detail={detail} />}
      {tab === "webhooks"     && <WebhooksTab detail={detail} />}
      {tab === "mappings"     && <FieldMappingsTab detail={detail} />}
      {tab === "sandbox"      && <SandboxTab detail={detail} canWrite={canWrite} />}
      {tab === "audit"        && <AuditTab detail={detail} />}
      {tab === "danger"       && <DangerZone detail={detail} canWrite={canWrite} />}
    </div>
  );
}

function Breadcrumbs({ name }: { name: string }) {
  return (
    <nav className="text-[11px]" aria-label="Breadcrumbs">
      <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        Integrations Catalog
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <span style={{ color: "var(--text-default)" }}>{name}</span>
    </nav>
  );
}

/* ── Header ─────────────────────────────────────────── */

function Header({ detail }: { detail: CatalogDetailView }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <Logo url={detail.logoUrl} name={detail.name} size={56} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
              {detail.name}
            </h1>
            <StatusPill status={detail.status} />
            {detail.internalOnly && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                internal-only
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {detail.shortDescription}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <CategoryBadge category={detail.category} />
            <AuthTypeBadge type={detail.authType} />
            {detail.regions.map((r) => <RegionBadge key={r} region={r} />)}
            <span style={{ color: "var(--text-muted)" }}>· slug:</span>
            <code style={{ color: "var(--text-muted)" }}>{detail.slug}</code>
          </div>
          {detail.deprecatedAt && (
            <div className="mt-2 rounded-md border-l-2 px-2 py-1 text-[11px]"
                 style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
              ⚠ Deprecated {relativeFromNow(detail.deprecatedAt)}
              {detail.sunsetAt ? ` · sunset on ${detail.sunsetAt.toLocaleDateString()}` : ""}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── KPI bar ────────────────────────────────────────── */

function KpiBar({ detail }: { detail: CatalogDetailView }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label="Connected tenants" value={detail.connectedTenantCount.toLocaleString()} />
      <Kpi label="Syncs · 7d" value={detail.syncCount7d.toLocaleString()} />
      <Kpi label="Errors · 30d" value={detail.errorCount30d.toLocaleString()}
           tone={detail.errorCount30d > 50 ? "warning" : detail.errorCount30d > 0 ? "default" : "good"} />
      <Kpi label="Uptime · 90d"
           value={detail.uptimePct90d == null ? "—" : `${detail.uptimePct90d.toFixed(2)}%`}
           tone={detail.uptimePct90d == null ? "default" :
                 detail.uptimePct90d >= 99 ? "good" :
                 detail.uptimePct90d >= 95 ? "warning" : "danger"} />
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────── */

function TabsBar({ active }: { active: Tab }) {
  const labels: Record<Tab, string> = {
    overview: "Overview",
    config: "Configuration",
    adoption: "Adoption",
    health: "Health",
    versions: "Versions",
    docs: "Documentation",
    permissions: "Permissions",
    pricing: "Pricing",
    webhooks: "Webhooks",
    mappings: "Field mappings",
    sandbox: "Test sandbox",
    audit: "Audit log",
    danger: "Danger zone",
  };
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {TABS.map((t) => {
        const isActive = t === active;
        return (
          <Link key={t} href={`?tab=${t}`} scroll={false}
                className="ts-focus inline-flex items-center px-3 py-2 text-[12px] font-medium"
                style={{
                  color: isActive ? "var(--text-default)" : (t === "danger" ? "var(--danger-fg)" : "var(--text-muted)"),
                  borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
            {labels[t]}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Overview ───────────────────────────────────────── */

function OverviewTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Description">
          <p className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
            {detail.description}
          </p>
        </Card>

        {detail.screenshots.length > 0 && (
          <Card title="Screenshots">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {detail.screenshots.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="rounded-md border"
                     style={{ borderColor: "var(--border-subtle)", objectFit: "cover", aspectRatio: "16/9" }} />
              ))}
            </div>
          </Card>
        )}

        <Card title="Capabilities matrix">
          {detail.capabilities.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No capabilities declared.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Entity</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">Read</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">Write</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">Sync</th>
                  <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">Webhook</th>
                </tr>
              </thead>
              <tbody>
                {detail.capabilities.map((c) => (
                  <tr key={c.entity} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="px-2 py-1.5 font-medium" style={{ color: "var(--text-default)" }}>{c.entity}</td>
                    <td className="px-2 py-1.5 text-center">{c.read ? "✓" : "—"}</td>
                    <td className="px-2 py-1.5 text-center">{c.write ? "✓" : "—"}</td>
                    <td className="px-2 py-1.5 text-center">{c.sync ? "✓" : "—"}</td>
                    <td className="px-2 py-1.5 text-center">{c.webhook ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Vendor info">
          <dl className="text-[12px] space-y-1">
            {detail.vendorUrl && (
              <Row label="Vendor URL">
                <a href={detail.vendorUrl} target="_blank" rel="noopener noreferrer"
                   className="ts-focus underline" style={{ color: "var(--accent-primary)" }}>
                  {detail.vendorUrl}
                </a>
              </Row>
            )}
            {detail.supportEmail && (
              <Row label="Support email">
                <a href={`mailto:${detail.supportEmail}`} style={{ color: "var(--text-default)" }}>{detail.supportEmail}</a>
              </Row>
            )}
            <Row label="Default version"><code>{detail.defaultVersion}</code></Row>
            <Row label="Category">{CATEGORY_LABELS[detail.category]}</Row>
            <Row label="Auth type">{AUTH_LABELS[detail.authType]}</Row>
            <Row label="Available plans">
              {detail.availablePlans.length === 0 ? "—" : detail.availablePlans.join(", ")}
            </Row>
            <Row label="Regions">
              {detail.regions.length === 0 ? "—" : detail.regions.map((r) => REGION_LABELS[r]).join(", ")}
            </Row>
            <Row label="Created">{detail.createdAt.toLocaleDateString()}</Row>
            <Row label="Last updated">{relativeFromNow(detail.updatedAt)}</Row>
          </dl>
        </Card>

        <Card title="Recent incidents">
          {detail.recentIncidents.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No incidents on file.</p>
          ) : (
            <ul className="space-y-2">
              {detail.recentIncidents.slice(0, 5).map((i) => (
                <li key={i.id} className="text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                          style={{
                            background: i.severity === "CRITICAL" ? "var(--rose-50, var(--surface-2))" :
                                        i.severity === "MAJOR" ? "var(--warning-surface)" : "var(--surface-2)",
                            color:      i.severity === "CRITICAL" ? "var(--danger-fg)" :
                                        i.severity === "MAJOR" ? "var(--warning-fg)" : "var(--text-muted)",
                          }}>
                      {i.severity.toLowerCase()}
                    </span>
                    <span style={{ color: "var(--text-default)" }}>{i.title}</span>
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(i.startedAt)}
                    {i.resolvedAt ? ` · resolved ${relativeFromNow(i.resolvedAt)}` : ` · ${i.status.toLowerCase()}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Configuration ──────────────────────────────────── */

function ConfigTab({ detail, canWrite }: { detail: CatalogDetailView; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      <form action={saveIntegration}
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Catalog metadata</h2>
        <fieldset disabled={!canWrite} className="contents">
          <input type="hidden" name="id" value={detail.id} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Slug (URL key)">
              <input type="text" name="slug" defaultValue={detail.slug} required
                     pattern="[a-z0-9-]+" maxLength={80}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Display name">
              <input type="text" name="name" defaultValue={detail.name} required maxLength={120}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Category">
              <select name="category" defaultValue={detail.category}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={detail.status}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                <option value="ACTIVE">Active</option>
                <option value="BETA">Beta</option>
                <option value="COMING_SOON">Coming soon</option>
                <option value="DEPRECATED">Deprecated</option>
                <option value="INTERNAL_ONLY">Internal only</option>
              </select>
            </Field>
            <Field label="Auth type">
              <select name="authType" defaultValue={detail.authType}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                <option value="OAUTH2">OAuth 2.0</option>
                <option value="API_KEY">API key</option>
                <option value="BASIC_AUTH">Basic auth</option>
                <option value="SAML">SAML</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </Field>
            <Field label="Default version">
              <input type="text" name="defaultVersion" defaultValue={detail.defaultVersion}
                     maxLength={50}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Logo URL">
              <input type="url" name="logoUrl" defaultValue={detail.logoUrl ?? ""} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Vendor URL">
              <input type="url" name="vendorUrl" defaultValue={detail.vendorUrl ?? ""} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Support email">
              <input type="email" name="supportEmail" defaultValue={detail.supportEmail ?? ""} maxLength={200}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Redirect URI">
              <input type="url" name="redirectUri" defaultValue={detail.redirectUri ?? ""} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Webhook endpoint">
              <input type="url" name="webhookEndpoint" defaultValue={detail.webhookEndpoint ?? ""} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Required env vars (comma-separated)">
              <input type="text" name="envVarsRequired" defaultValue={detail.envVarsRequired.join(", ")} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Available plans (comma-separated)">
              <input type="text" name="availablePlans" defaultValue={detail.availablePlans.join(", ")} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Regions (comma-separated: US, EU, …)">
              <input type="text" name="regions" defaultValue={detail.regions.join(", ")} maxLength={200}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="requiresUpgrade" defaultChecked={detail.requiresUpgrade}
                     className="ts-focus h-4 w-4" />
              Requires plan upgrade
            </label>
            <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="internalOnly" defaultChecked={detail.internalOnly}
                     className="ts-focus h-4 w-4" />
              Internal-only (not visible to tenants)
            </label>
            <Field label="Per-call cost (cents)">
              <input type="number" name="perCallCents" defaultValue={detail.perCallCents ?? ""}
                     min={0} max={1_000_000}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Pass-through fees (text)">
              <input type="text" name="passThroughFees" defaultValue={detail.passThroughFees ?? ""} maxLength={500}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
          </div>
          <Field label="Short description (1-line, max 140 chars)" full>
            <input type="text" name="shortDescription" defaultValue={detail.shortDescription} required maxLength={140}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Long description (markdown)" full>
            <textarea name="description" defaultValue={detail.description} required rows={6} maxLength={20_000}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Documentation (markdown)" full>
            <textarea name="documentation" defaultValue={detail.documentation ?? ""} rows={5} maxLength={50_000}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="FAQ (markdown)" full>
            <textarea name="faq" defaultValue={detail.faq ?? ""} rows={3} maxLength={20_000}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <div className="flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Save catalog metadata
            </button>
          </div>
        </fieldset>
      </form>

      <Card title="Configuration JSON schema (read-only)">
        <pre className="rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
          {JSON.stringify(detail.configSchema, null, 2)}
        </pre>
        <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Edit configSchema directly in the database — Monaco editor wiring is reserved for a future slice.
        </p>
      </Card>
    </div>
  );
}

/* ── Adoption ────────────────────────────────────── */

function AdoptionTab({ adoption }: { adoption: AdoptionView | null }) {
  if (!adoption) return <p>Adoption data unavailable.</p>;
  const max = Math.max(1, ...adoption.trend.map((t) => t.connections));
  return (
    <div className="space-y-4">
      <Card title={`Connections over time · ${adoption.totalConnected.toLocaleString()} total`}>
        <div className="flex h-32 items-end gap-[2px]">
          {adoption.trend.map((d) => (
            <div key={d.date} className="flex-1 rounded-t-sm"
                 style={{
                   background: "var(--accent-primary)",
                   height: `${Math.max(2, (d.connections / max) * 100)}%`,
                   opacity: 0.9,
                 }}
                 title={`${d.date}: ${d.connections} connection${d.connections === 1 ? "" : "s"}`} />
          ))}
        </div>
      </Card>

      <Card title="Tenants connected">
        {adoption.tenants.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No tenants connected yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Tenant</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Plan</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Connected</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Last sync</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Errors 30d</th>
              </tr>
            </thead>
            <tbody>
              {adoption.tenants.map((t) => (
                <tr key={t.tenantId} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5">
                    <Link href={`/platform/tenants/${t.tenantSlug}`} className="ts-focus underline"
                          style={{ color: "var(--text-default)" }}>
                      {t.tenantName}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{t.plan}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{relativeFromNow(t.connectedAt)}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{relativeFromNow(t.lastSyncAt)}</td>
                  <td className="px-2 py-1.5">
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: t.status === "CONNECTED" ? "var(--success-surface)" :
                                        t.status === "ERRORED" ? "var(--rose-50, var(--surface-2))" :
                                        t.status === "PAUSED" ? "var(--warning-surface)" : "var(--surface-2)",
                            color:      t.status === "CONNECTED" ? "var(--success-fg)" :
                                        t.status === "ERRORED" ? "var(--danger-fg)" :
                                        t.status === "PAUSED" ? "var(--warning-fg)" : "var(--text-muted)",
                          }}>
                      {t.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums"
                      style={{ color: t.errors30d > 0 ? "var(--danger-fg)" : "var(--text-muted)" }}>
                    {t.errors30d}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Health ─────────────────────────────────────── */

function HealthTab({ health }: { health: HealthView | null }) {
  if (!health) return <p>Health data unavailable.</p>;
  const totalRequests = health.daily.reduce((s, d) => s + d.success + d.error, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Uptime · 30d"
             value={health.uptimePct30d == null ? "—" : `${health.uptimePct30d.toFixed(2)}%`}
             tone={health.uptimePct30d == null ? "default" :
                   health.uptimePct30d >= 99 ? "good" :
                   health.uptimePct30d >= 95 ? "warning" : "danger"} />
        <Kpi label="Avg sync"
             value={health.avgSyncDurationMs == null ? "—" : `${Math.round(health.avgSyncDurationMs)}ms`} />
        <Kpi label="Error rate · 30d"
             value={health.errorRate30d == null ? "—" : `${(health.errorRate30d * 100).toFixed(2)}%`}
             tone={health.errorRate30d == null ? "default" :
                   health.errorRate30d <= 0.01 ? "good" :
                   health.errorRate30d <= 0.05 ? "warning" : "danger"} />
        <Kpi label="Dead-letter · 30d"
             value={health.deadLetterCount.toLocaleString()}
             tone={health.deadLetterCount === 0 ? "good" : health.deadLetterCount > 100 ? "danger" : "warning"} />
      </div>

      <Card title="Daily success / error · last 30 days">
        {totalRequests === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No sync events captured in the last 30 days.
          </p>
        ) : (
          <>
            <div className="flex h-32 items-end gap-[2px]">
              {health.daily.map((d) => {
                const total = d.success + d.error;
                const max = Math.max(1, ...health.daily.map((x) => x.success + x.error));
                return (
                  <div key={d.date} className="flex flex-1 flex-col-reverse"
                       title={`${d.date}: ${d.success} OK · ${d.error} err · p50 ${d.durationP50}ms · p95 ${d.durationP95}ms`}>
                    <div style={{
                      background: "var(--success-fg)",
                      height: `${(d.success / max) * 100}%`,
                    }} />
                    <div style={{
                      background: "var(--danger-fg)",
                      height: `${(d.error / max) * 100}%`,
                    }} />
                    {void total}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <span><span style={{ background: "var(--success-fg)", display: "inline-block", width: 10, height: 10 }} /> Success</span>
              <span><span style={{ background: "var(--danger-fg)", display: "inline-block", width: 10, height: 10 }} /> Error</span>
            </div>
          </>
        )}
      </Card>

      <Card title="Response time percentiles · last 30 days">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(["durationP50", "durationP95", "durationP99"] as const).map((k) => {
            const label = k === "durationP50" ? "p50" : k === "durationP95" ? "p95" : "p99";
            const max = Math.max(1, ...health.daily.map((d) => d[k]));
            return (
              <div key={k}>
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                    max {max}ms
                  </span>
                </div>
                <div className="flex h-12 items-end gap-[1px]">
                  {health.daily.map((d) => (
                    <div key={d.date} className="flex-1 rounded-t-sm"
                         style={{ background: "var(--accent-primary)", height: `${Math.max(2, (d[k] / max) * 100)}%` }}
                         title={`${d.date}: ${d[k]}ms`} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Rate-limit consumption">
        <div className="rounded-full h-3 w-full" style={{ background: "var(--surface-2)" }}>
          <div className="h-full rounded-full"
               style={{
                 width: `${health.rateLimitPct}%`,
                 background: health.rateLimitPct >= 80 ? "var(--danger-fg)" :
                            health.rateLimitPct >= 50 ? "var(--warning-fg)" : "var(--success-fg)",
               }} />
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {health.rateLimitPct}% of vendor rate limit consumed.
        </p>
      </Card>
    </div>
  );
}

/* ── Versions ───────────────────────────────────── */

function VersionsTab({ detail, canWrite }: { detail: CatalogDetailView; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Cut a new version
          </summary>
          <form action={createVersion} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input type="hidden" name="integrationId" value={detail.id} />
            <input type="hidden" name="slug" value={detail.slug} />
            <Field label="Version (semver)">
              <input type="text" name="version" required maxLength={50} placeholder="2.1.0"
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <label className="inline-flex items-center gap-2 text-[12px] md:col-span-2"
                   style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="isDefault" className="ts-focus h-4 w-4" />
              Set as default version
            </label>
            <Field label="Changelog (markdown)" full>
              <textarea name="changes" rows={4} maxLength={10_000}
                        className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                        style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "white" }}>
                Create version
              </button>
            </div>
          </form>
        </details>
      )}

      <Card title={`Version history · ${detail.versions.length}`}>
        {detail.versions.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No versions on file.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Version</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Released</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Changes</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Tenants</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">State</th>
                {canWrite && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((v) => (
                <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 font-mono font-semibold" style={{ color: "var(--text-default)" }}>{v.version}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{relativeFromNow(v.releasedAt)}</td>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-default)" }}>
                    {v.changes ? (v.changes.length > 80 ? v.changes.slice(0, 80) + "…" : v.changes) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {v.tenantCount}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      {v.isDefault && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                              style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                          default
                        </span>
                      )}
                      {v.deprecatedAt && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                              style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
                          deprecated
                        </span>
                      )}
                    </div>
                  </td>
                  {canWrite && (
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-1">
                        {!v.isDefault && (
                          <form action={setVersionDefault}>
                            <input type="hidden" name="versionId" value={v.id} />
                            <input type="hidden" name="integrationId" value={detail.id} />
                            <input type="hidden" name="slug" value={detail.slug} />
                            <button type="submit"
                                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                              Set default
                            </button>
                          </form>
                        )}
                        <form action={deprecateVersionAction}>
                          <input type="hidden" name="versionId" value={v.id} />
                          <input type="hidden" name="integrationId" value={detail.id} />
                          <input type="hidden" name="slug" value={detail.slug} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{ background: "var(--surface-2)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                            {v.deprecatedAt ? "Un-deprecate" : "Deprecate"}
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Documentation, Permissions, Pricing, Webhooks, Mappings ── */

function DocsTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <div className="space-y-4">
      <Card title="Tenant-facing documentation">
        {detail.documentation ? (
          <pre className="whitespace-pre-wrap text-[12px] font-mono"
               style={{ color: "var(--text-default)" }}>
            {detail.documentation}
          </pre>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No documentation yet.</p>
        )}
      </Card>

      <Card title="FAQ">
        {detail.faq ? (
          <pre className="whitespace-pre-wrap text-[12px] font-mono"
               style={{ color: "var(--text-default)" }}>
            {detail.faq}
          </pre>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No FAQ yet.</p>
        )}
      </Card>

      <Card title="Code samples">
        {Object.keys(detail.codeSamples).length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No samples on file.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(detail.codeSamples).map(([lang, code]) => (
              <details key={lang}>
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide"
                         style={{ color: "var(--text-muted)" }}>
                  {lang}
                </summary>
                <pre className="mt-1 rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto"
                     style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
                  {code}
                </pre>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PermissionsTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <Card title="Required OAuth scopes">
      {detail.oauthScopes.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No OAuth scopes declared (auth type: {AUTH_LABELS[detail.authType]}).
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Scope</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Capability</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Justification (shown to tenant)</th>
            </tr>
          </thead>
          <tbody>
            {detail.oauthScopes.map((s) => (
              <tr key={s.scope} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{s.scope}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{s.capability ?? "—"}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{s.justification ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function PricingTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <Card title="Pricing &amp; billing">
      <dl className="grid grid-cols-1 gap-2 md:grid-cols-2 text-[12px]">
        <Row label="Requires plan upgrade">{detail.requiresUpgrade ? "Yes" : "No"}</Row>
        <Row label="Per-call cost">
          {detail.perCallCents == null ? "Free" :
           `${(detail.perCallCents / 100).toFixed(4).replace(/\.?0+$/, "")}¢`}
        </Row>
        <Row label="Available plans">
          {detail.availablePlans.length === 0 ? "All plans" : detail.availablePlans.join(", ")}
        </Row>
        <Row label="Pass-through fees">{detail.passThroughFees ?? "None"}</Row>
      </dl>
    </Card>
  );
}

function WebhooksTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <div className="space-y-4">
      <Card title="Outbound webhooks (Flowtora → integration)">
        {detail.outboundWebhooks.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>None declared.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Event</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">URL</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Description</th>
              </tr>
            </thead>
            <tbody>
              {detail.outboundWebhooks.map((w, i) => (
                <tr key={i} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{w.event}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{w.url ?? "—"}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{w.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Inbound webhooks (integration → Flowtora)">
        {detail.inboundWebhooks.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>None declared.</p>
        ) : (
          <ul className="space-y-1">
            {detail.inboundWebhooks.map((w, i) => (
              <li key={i} className="text-[12px]">
                <code className="rounded px-1.5 py-0.5"
                      style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                  {w.event}
                </code>
                {w.description && (
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>{w.description}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FieldMappingsTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <Card title="Default field mappings">
      {detail.defaultFieldMappings.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No default mappings declared.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Flowtora field</th>
              <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide">Direction</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Partner field</th>
            </tr>
          </thead>
          <tbody>
            {detail.defaultFieldMappings.map((m, i) => (
              <tr key={i} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{m.flowtoraField}</td>
                <td className="px-2 py-1.5 text-center">
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                    {m.direction === "OUT" ? "→" : m.direction === "IN" ? "←" : "↔"} {m.direction}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{m.partnerField}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
        Drag-drop mapping editor lands in a follow-up slice — for now mappings are hand-edited via the database.
      </p>
    </Card>
  );
}

function SandboxTab({ detail, canWrite }: { detail: CatalogDetailView; canWrite: boolean }) {
  return (
    <Card title="Test sandbox">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Connect to {detail.name}'s sandbox environment, run a sample sync, and inspect the
        request/response payload.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <button
          type="button"
          disabled={!canWrite}
          className="ts-focus rounded-md px-3 py-2 text-[12px] font-medium"
          style={{ background: "var(--accent-primary)", color: "white", opacity: canWrite ? 1 : 0.5 }}
          title="Sandbox handshake will be wired up once vendor sandbox creds are added.">
          Connect to sandbox
        </button>
        <button
          type="button"
          disabled={!canWrite}
          className="ts-focus rounded-md px-3 py-2 text-[12px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)", opacity: canWrite ? 1 : 0.5 }}>
          Run sample sync
        </button>
      </div>
      <pre className="mt-3 rounded-md border p-2 text-[10px] font-mono whitespace-pre-wrap"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
{`# Sample request (replace with sandbox creds)
POST ${detail.webhookEndpoint ?? `https://api.${detail.slug}.com/v1/sync`}
Authorization: ${detail.authType === "OAUTH2" ? "Bearer <token>" : detail.authType === "API_KEY" ? "Token <key>" : "<custom>"}
Content-Type: application/json

{
  "event": "sync.invoice.created",
  "tenant": "demo-shop",
  "payload": { "invoice_id": "inv_test_123", "amount": 1234.56 }
}`}
      </pre>
      <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
        Sandbox handshake is reserved for a follow-up slice — the buttons above will live-fire once
        vendor sandbox credentials are configured.
      </p>
    </Card>
  );
}

function AuditTab({ detail }: { detail: CatalogDetailView }) {
  return (
    <Card title="Audit log">
      {detail.auditLog.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
      ) : (
        <ol className="space-y-2">
          {detail.auditLog.map((a) => (
            <li key={a.id} className="text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono" style={{ color: "var(--text-default)" }}>{a.action}</span>
                <span style={{ color: "var(--text-muted)" }}>{relativeFromNow(a.occurredAt)}</span>
              </div>
              {a.detail && (
                <div style={{ color: "var(--text-muted)" }}>{a.detail}</div>
              )}
              {a.authorName && (
                <div style={{ color: "var(--text-muted)" }}>by {a.authorName}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ── Danger zone ───────────────────────────────────── */

function DangerZone({ detail, canWrite }: { detail: CatalogDetailView; canWrite: boolean }) {
  if (!canWrite) {
    return (
      <Card title="Danger zone">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          You don't have permission to perform destructive actions on integrations.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card title="Deprecate integration">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Sets a sunset date and notifies tenants who have this integration connected. Connections
          continue working until the sunset date, then they're force-disconnected.
        </p>
        <form action={deprecateIntegration} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={detail.id} />
          <input type="hidden" name="slug" value={detail.slug} />
          <Field label="Sunset date">
            <input type="date" name="sunsetAt"
                   defaultValue={detail.sunsetAt ? detail.sunsetAt.toISOString().slice(0, 10) : ""}
                   className="ts-focus rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--warning-fg)", color: "white" }}>
            Deprecate
          </button>
        </form>
      </Card>

      <Card title="Force-disconnect all tenants">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Marks every tenant connection as DISCONNECTED. Use this when the vendor has deprecated
          their API or there's a security incident.
        </p>
        <form action={forceDisconnectAll} className="mt-2">
          <input type="hidden" name="id" value={detail.id} />
          <input type="hidden" name="slug" value={detail.slug} />
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--danger-fg)", color: "white" }}>
            Force disconnect all ({detail.connectedTenantCount})
          </button>
        </form>
      </Card>

      <Card title="Delete integration entry">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Removes the catalog entry permanently. All version history, incidents, sync events, and
          audit logs cascade-delete with it. To confirm, type the slug exactly.
        </p>
        <form action={deleteIntegrationCatalog} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={detail.id} />
          <Field label={`Type "${detail.slug}" to confirm`}>
            <input type="text" name="confirm" required
                   className="ts-focus rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--rose-200)", background: "var(--surface-1)" }} />
          </Field>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--danger-fg)", color: "white" }}>
            Delete permanently
          </button>
        </form>
      </Card>
    </div>
  );
}

/* ── Layout primitives ──────────────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3 space-y-2"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-right" style={{ color: "var(--text-default)" }}>{children}</dd>
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
