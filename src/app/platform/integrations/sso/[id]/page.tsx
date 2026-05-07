// Page 49 — Tenant SSO config detail (/[id]).
//
// Edit SAML or OIDC fields, run test login, refresh metadata,
// inspect recent SCIM activity, see attribute mappings + group rules.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadTenantConfig,
  PROVIDER_LABELS,
  PROVIDER_ICONS,
  type TenantConfigDetail,
  type ScimLogRow,
} from "@/server/platform/sso";
import {
  saveSamlConfig,
  saveOidcConfig,
  deleteTenantConfig,
  runTestLogin,
  refreshSamlMetadata,
  retryScimEvent,
} from "@/app/actions/platform-sso";
import {
  StatusPill, ScimStatusPill, ProviderBadge, OperationLabel,
  FormError, FormOk, Field, relativeFromNow,
} from "../_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const STATUSES: Array<"PENDING" | "TEST" | "ACTIVE" | "FAILED" | "DISABLED"> = [
  "PENDING", "TEST", "ACTIVE", "FAILED", "DISABLED",
];

export default async function SsoConfigDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("sso.manage");
  const canTest = ctx.can("sso.test_login");

  const detail = await loadTenantConfig(id);
  if (!detail) notFound();

  return (
    <div className="space-y-5">
      <Breadcrumbs detail={detail} />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <Header detail={detail} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <main className="lg:col-span-2 space-y-4">
          {detail.type === "SAML" ? (
            <SamlForm detail={detail} canWrite={canWrite} />
          ) : (
            <OidcForm detail={detail} canWrite={canWrite} />
          )}
          <ScimRecentCard rows={detail.scimRecent} canWrite={canWrite} />
        </main>
        <aside className="space-y-4">
          <ActionsCard detail={detail} canWrite={canWrite} canTest={canTest} />
          <FlagsCard detail={detail} />
          <CommonForm detail={detail} canWrite={canWrite} />
          <DangerZone detail={detail} canWrite={canWrite} />
        </aside>
      </div>
    </div>
  );
}

function Breadcrumbs({ detail }: { detail: TenantConfigDetail }) {
  return (
    <nav className="text-[11px]" aria-label="Breadcrumbs">
      <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        Integrations Catalog
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <Link href="/platform/integrations/sso?tab=configs" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        SSO
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <span style={{ color: "var(--text-default)" }}>{detail.tenantName} · {PROVIDER_LABELS[detail.providerKey]}</span>
    </nav>
  );
}

function Header({ detail }: { detail: TenantConfigDetail }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {detail.displayName}
          </h1>
          <StatusPill status={detail.status} />
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: detail.type === "SAML" ? "var(--accent-surface)" : "var(--surface-2)",
                  color:      detail.type === "SAML" ? "var(--accent-primary)" : "var(--text-default)",
                }}>
            {detail.type}
          </span>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <Link href={`/platform/tenants/${detail.tenantSlug}`} className="ts-focus underline">
            {detail.tenantName}
          </Link>
          {" · "}<ProviderBadge providerKey={detail.providerKey} />
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {detail.lastLoginAt ? `Last login ${relativeFromNow(detail.lastLoginAt)}` : "No logins yet"}
          {detail.lastSyncAt ? ` · last SCIM sync ${relativeFromNow(detail.lastSyncAt)}` : ""}
          {detail.metadataLastRefreshedAt ? ` · metadata refreshed ${relativeFromNow(detail.metadataLastRefreshedAt)}` : ""}
        </p>
        {detail.lastError && (
          <p className="mt-1 rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
            ⚠ {detail.lastError}
          </p>
        )}
      </div>
    </header>
  );
}

/* ── SAML form ────────────────────────────── */

function SamlForm({ detail, canWrite }: { detail: TenantConfigDetail; canWrite: boolean }) {
  const groupRulesText = detail.groupRules.map((r) => `${r.group} | ${r.roleId}`).join("\n");
  return (
    <form action={saveSamlConfig}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <input type="hidden" name="id" value={detail.id} />
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          SAML 2.0 configuration
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Display name (login button)">
            <input type="text" name="displayName" required maxLength={120} defaultValue={detail.displayName}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={detail.status}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
          </Field>
          <Field label="IdP metadata URL">
            <input type="url" name="metadataUrl" maxLength={500} defaultValue={detail.metadataUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Entity ID">
            <input type="text" name="entityId" maxLength={500} defaultValue={detail.entityId ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Single Logout URL">
            <input type="url" name="sloUrl" maxLength={500} defaultValue={detail.sloUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Signature algorithm">
            <select name="signatureAlgorithm" defaultValue={detail.signatureAlgorithm}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="RSA_SHA256">RSA-SHA256</option>
              <option value="RSA_SHA512">RSA-SHA512</option>
              <option value="RSA_SHA1">RSA-SHA1 (legacy)</option>
            </select>
          </Field>
          <Field label="Default role id (assigned on first login)">
            <input type="text" name="defaultRoleId" maxLength={120} defaultValue={detail.defaultRoleId ?? ""}
                   placeholder="MEMBER"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>

        <Field label="ACS URL (Flowtora-side, copy into IdP setup)" full>
          <code className="block rounded-md border p-2 text-[11px] font-mono select-all"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {detail.acsUrl ?? "—"}
          </code>
        </Field>

        <Field label="IdP metadata XML (paste here if no URL)" full>
          <textarea name="metadataXml" rows={6} maxLength={200_000} defaultValue={detail.metadataXml ?? ""}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-2)" }} />
        </Field>
        <Field label="Encryption certificate (PEM)" full>
          <textarea name="encryptionCertPem" rows={5} maxLength={20_000} defaultValue={detail.encryptionCertPem ?? ""}
                    placeholder={"-----BEGIN CERTIFICATE-----\n..."}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-2)" }} />
        </Field>

        <h3 className="text-[12px] font-semibold pt-2" style={{ color: "var(--text-default)" }}>
          Attribute mappings
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Email">
            <input type="text" name="attrEmail" maxLength={200}
                   defaultValue={detail.attributeMappings.email ?? ""}
                   placeholder="$NAMEID or http://schemas.xmlsoap.org/.../emailaddress"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Given name">
            <input type="text" name="attrGivenName" maxLength={200}
                   defaultValue={detail.attributeMappings.given_name ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Family name">
            <input type="text" name="attrFamilyName" maxLength={200}
                   defaultValue={detail.attributeMappings.family_name ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Groups">
            <input type="text" name="attrGroups" maxLength={200}
                   defaultValue={detail.attributeMappings.groups ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>

        <Field label="Group → role rules (one per line: GroupName | roleId)" full>
          <textarea name="groupRulesRaw" rows={4} maxLength={5000} defaultValue={groupRulesText}
                    placeholder={"Engineering | ADMIN\nSupport | MEMBER"}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>

        <Field label="Allowed email domains (comma or newline separated)" full>
          <input type="text" name="allowedEmailDomainsRaw" maxLength={2000}
                 defaultValue={detail.allowedEmailDomains.join(", ")}
                 placeholder="acme.com, acme.example"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>

        <CommonToggles detail={detail} />

        <div className="flex justify-end pt-1">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save SAML config
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── OIDC form ────────────────────────────── */

function OidcForm({ detail, canWrite }: { detail: TenantConfigDetail; canWrite: boolean }) {
  return (
    <form action={saveOidcConfig}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <input type="hidden" name="id" value={detail.id} />
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          OIDC configuration
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Display name (login button)">
            <input type="text" name="displayName" required maxLength={120} defaultValue={detail.displayName}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={detail.status}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
          </Field>
          <Field label="Issuer">
            <input type="url" name="issuer" maxLength={500} defaultValue={detail.issuer ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Discovery URL">
            <input type="url" name="discoveryUrl" maxLength={500} defaultValue={detail.discoveryUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Client ID">
            <input type="text" name="clientId" maxLength={500} defaultValue={detail.clientId ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label={`Client secret ${detail.hasClientSecret ? "(stored — leave blank to keep)" : "(set new)"}`}>
            <input type="password" name="clientSecret" maxLength={2000}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Authorize URL">
            <input type="url" name="authorizeUrl" maxLength={500} defaultValue={detail.authorizeUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Token URL">
            <input type="url" name="tokenUrl" maxLength={500} defaultValue={detail.tokenUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="UserInfo URL">
            <input type="url" name="userInfoUrl" maxLength={500} defaultValue={detail.userInfoUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Default role id (first login)">
            <input type="text" name="defaultRoleId" maxLength={120} defaultValue={detail.defaultRoleId ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>

        <Field label="Scopes (comma or newline separated)" full>
          <input type="text" name="scopesRaw" maxLength={2000}
                 defaultValue={detail.scopes.join(", ")}
                 placeholder="openid email profile groups"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>

        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="pkceEnabled" defaultChecked={detail.pkceEnabled} className="ts-focus h-4 w-4" />
          PKCE (recommended)
        </label>

        <Field label="Allowed email domains" full>
          <input type="text" name="allowedEmailDomainsRaw" maxLength={2000}
                 defaultValue={detail.allowedEmailDomains.join(", ")}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>

        <CommonToggles detail={detail} />

        <div className="flex justify-end pt-1">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save OIDC config
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Common toggles (used by both forms) ───── */

function CommonToggles({ detail }: { detail: TenantConfigDetail }) {
  return (
    <div className="rounded-md border p-2 space-y-1"
         style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
      <h4 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Provisioning
      </h4>
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="jitProvisioning" defaultChecked={detail.jitProvisioningEnabled} className="ts-focus h-4 w-4" />
        Just-in-time provisioning (auto-create users on first login)
      </label>
      <label className="block">
        <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="forceSso" defaultChecked={detail.forceSso} className="ts-focus h-4 w-4" />
          Force SSO (disables password login for this tenant)
        </span>
      </label>
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="scimEnabled" defaultChecked={detail.scimEnabled} className="ts-focus h-4 w-4" />
        SCIM provisioning enabled
      </label>
      {detail.scimEnabled && (
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="rotateScimToken" className="ts-focus h-4 w-4" />
          Rotate SCIM bearer token on save
        </label>
      )}
      {detail.scimEnabled && detail.hasScimToken && (
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          SCIM bearer token configured. Rotate via the checkbox above to mint a new one.
        </p>
      )}
    </div>
  );
}

/* ── Right rail cards ────────────────────── */

function ActionsCard({
  detail, canWrite, canTest,
}: { detail: TenantConfigDetail; canWrite: boolean; canTest: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Actions</h2>
      {canTest && (
        <form action={runTestLogin} className="space-y-1">
          <input type="hidden" name="id" value={detail.id} />
          <input type="text" name="reason" maxLength={500}
                 placeholder="Reason (audit trail)"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[11px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <button type="submit"
                  className="ts-focus w-full rounded-md px-3 py-1.5 text-[11px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Run test login
          </button>
        </form>
      )}
      {canWrite && detail.type === "SAML" && detail.metadataUrl && (
        <form action={refreshSamlMetadata}>
          <input type="hidden" name="id" value={detail.id} />
          <button type="submit"
                  className="ts-focus w-full rounded-md px-3 py-1.5 text-[11px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Refresh metadata from URL
          </button>
        </form>
      )}
    </div>
  );
}

function FlagsCard({ detail }: { detail: TenantConfigDetail }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Status flags</h2>
      <Row label="JIT" on={detail.jitProvisioningEnabled} />
      <Row label="Force SSO" on={detail.forceSso} />
      <Row label="SCIM" on={detail.scimEnabled} />
      <Row label="SCIM token" on={detail.hasScimToken} />
      <Row label="PKCE" on={detail.pkceEnabled} only={detail.type === "OIDC"} />
      <Row label="Encryption cert" on={!!detail.encryptionCertPem} only={detail.type === "SAML"} />
      <p className="pt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
        Allowed domains: {detail.allowedEmailDomains.length === 0 ? "—" : detail.allowedEmailDomains.join(", ")}
      </p>
    </div>
  );
}

function Row({ label, on, only }: { label: string; on: boolean; only?: boolean }) {
  if (only === false) return null;
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: on ? "var(--success-fg)" : "var(--text-faint)" }}>
        {on ? "✓" : "—"}
      </span>
    </div>
  );
}

function CommonForm({ detail, canWrite }: { detail: TenantConfigDetail; canWrite: boolean }) {
  void detail;
  void canWrite;
  return null; // Toggles already inside the SAML/OIDC forms.
}

function DangerZone({ detail, canWrite }: { detail: TenantConfigDetail; canWrite: boolean }) {
  if (!canWrite) return null;
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--danger-fg)" }}>Danger zone</h2>
      <form action={deleteTenantConfig} className="mt-2">
        <input type="hidden" name="id" value={detail.id} />
        <button type="submit"
                className="ts-focus w-full rounded-md px-3 py-1.5 text-[11px] font-medium"
                style={{ background: "var(--danger-fg)", color: "white" }}>
          Delete configuration (also clears SCIM token)
        </button>
      </form>
    </div>
  );
}

/* ── SCIM recent activity ─────────────────── */

function ScimRecentCard({ rows, canWrite }: { rows: ScimLogRow[]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Recent SCIM activity · {rows.length}
      </h2>
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No SCIM events for this tenant yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 10).map((r) => (
            <li key={r.id} className="rounded-md border p-2 text-[11px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <OperationLabel operation={r.operation} />
                <ScimStatusPill status={r.status} />
                {r.attempts > 1 && (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>×{r.attempts}</span>
                )}
                <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {relativeFromNow(r.occurredAt)}
                </span>
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {r.resourceType}{r.resourceId ? ` · ${r.resourceId.slice(0, 12)}` : ""}
                {r.externalId ? ` · ext ${r.externalId}` : ""}
                {r.httpCode != null ? ` · HTTP ${r.httpCode}` : ""}
              </div>
              {r.errorMessage && (
                <div className="text-[10px]" style={{ color: "var(--danger-fg)" }}>⚠ {r.errorMessage}</div>
              )}
              {canWrite && (r.status === "ERROR" || r.status === "DEAD_LETTER") && (
                <form action={retryScimEvent} className="mt-1">
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit"
                          className="ts-focus rounded-md px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                    Retry
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
