// Page 70 — Domain Management.
//
// Five tabs: Custom Domains · DNS Templates · SSL Certificates · Apex Helpers
// · Settings. Tenant custom-domain provisioning with DNS, SSL, and apex /
// subdomain handling.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import {
  loadDomainsPage,
  STATUS_TONE,
  CERT_STATUS_TONE,
  ISSUER_LABEL,
  CHALLENGE_LABEL,
  relativeFromNow,
  daysUntil,
} from "@/server/platform/domains";
import {
  saveDomain, deleteDomain, reverifyDomain, reissueCert, toggleDomainDisabled,
  saveDnsTemplate, deleteDnsTemplate,
  saveApexGuide, deleteApexGuide,
  saveDomainSettings,
} from "@/app/actions/platform-domains";
import type {
  CustomDomainStatus,
  CustomDomainType,
  SslIssuer,
  AcmeChallengeType,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["domains", "dns", "certs", "apex", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  domains:  "Custom Domains",
  dns:      "DNS Templates",
  certs:    "SSL Certificates",
  apex:     "Apex Helpers",
  settings: "Settings",
};

const STATUSES: CustomDomainStatus[] = ["PENDING_DNS", "VERIFYING", "ISSUING_SSL", "ACTIVE", "EXPIRING", "FAILED", "DISABLED"];
const TYPES: CustomDomainType[] = ["APEX", "SUBDOMAIN"];
const ISSUERS: SslIssuer[] = ["LETS_ENCRYPT", "ZEROSSL", "GOOGLE_TRUST_SERVICES", "CUSTOM_UPLOAD"];
const CHALLENGES: AcmeChallengeType[] = ["HTTP_01", "DNS_01"];

export default async function DomainsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("domains.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Domain Management.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("domains.manage");
  const canVerify = ctx.can("domains.verify");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab as string)
    ? (sp.tab as Tab) : "domains";
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const selectedDomain = asString(sp.domain);

  const data = await loadDomainsPage();
  const { kpis, domains, certs, templates, guides, settings } = data;
  const tenants = await db.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
    take: 200,
  });
  const focusedDomain = selectedDomain
    ? domains.find((d) => d.domain === selectedDomain) ?? null
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Domain Management
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Custom domains for tenants. DNS, SSL issuance + renewal, apex
            setup guides, and global defaults.
          </p>
        </div>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <MiniKpi label="Total domains" value={kpis.total.toString()} />
        <MiniKpi label="Active"        value={kpis.active.toString()} tone="success" />
        <MiniKpi label="Pending"       value={kpis.pending.toString()} tone={kpis.pending > 0 ? "warning" : "default"} />
        <MiniKpi label="Failed"        value={kpis.failed.toString()} tone={kpis.failed > 0 ? "danger" : "default"} />
        <MiniKpi label="Expiring (30d)" value={kpis.expiringSoon.toString()} tone={kpis.expiringSoon > 0 ? "warning" : "default"} />
        <MiniKpi label="Apex"          value={kpis.apexCount.toString()} />
        <MiniKpi label="Subdomain"     value={kpis.subdomainCount.toString()} />
      </div>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <a
            key={t}
            href={`/platform/settings/domains?tab=${t}#${t}`}
            className="rounded-t-md px-3 py-2 text-xs font-medium"
            style={{
              background: tab === t ? "var(--accent-primary)" : "transparent",
              color: tab === t ? "var(--accent-fg)" : "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
              borderBottom: tab === t ? "1px solid var(--accent-primary)" : "1px solid transparent",
            }}
          >
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {/* Tab: Custom Domains */}
      {tab === "domains" && (
        <section id="domains" className="space-y-4">
          <div
            className="overflow-x-auto rounded-xl"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
          >
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Domain</Th>
                  <Th>Tenant</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>DNS</Th>
                  <Th>SSL issuer</Th>
                  <Th>Expires</Th>
                  <Th>Last verified</Th>
                  <Th aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {domains.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                      No custom domains yet. Add one below to start the wizard.
                    </td>
                  </tr>
                )}
                {domains.map((d) => {
                  const tone = STATUS_TONE[d.status];
                  const daysToExpiry = daysUntil(d.sslExpiresAt);
                  return (
                    <tr key={d.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-3 py-2 align-top">
                        <a
                          href={`/platform/settings/domains?tab=domains&domain=${encodeURIComponent(d.domain)}#domains`}
                          className="font-mono text-[12px] font-medium hover:underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {d.domain}
                        </a>
                        {d.isPrimary && (
                          <span className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                            style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                            primary
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-xs" style={{ color: "var(--text-muted)" }}>
                        {d.tenant.name}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{d.type === "APEX" ? "Apex" : "Subdomain"}</td>
                      <td className="px-3 py-2 align-top">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                          style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}>
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {d.dnsVerified ? (
                          <span style={{ color: "var(--emerald-700)" }}>✓ verified</span>
                        ) : (
                          <span style={{ color: "var(--amber-700)" }}>pending</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{ISSUER_LABEL[d.sslIssuer]}</td>
                      <td className="px-3 py-2 align-top text-xs">
                        {d.sslExpiresAt ? (
                          <span style={{ color: daysToExpiry !== null && daysToExpiry < 30 ? "var(--amber-700)" : "var(--text-muted)" }}>
                            {relativeFromNow(d.sslExpiresAt)}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs" style={{ color: "var(--text-muted)" }}>
                        {relativeFromNow(d.verifiedAt)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {canVerify && (
                            <form action={reverifyDomain}>
                              <input type="hidden" name="id" value={d.id} />
                              <button type="submit" className="text-[10px]" style={{ color: "var(--accent-primary)" }}>
                                Re-verify
                              </button>
                            </form>
                          )}
                          {canManage && (
                            <>
                              <form action={reissueCert}>
                                <input type="hidden" name="id" value={d.id} />
                                <button type="submit" className="text-[10px]" style={{ color: "var(--accent-primary)" }}>
                                  Reissue
                                </button>
                              </form>
                              <form action={toggleDomainDisabled}>
                                <input type="hidden" name="id" value={d.id} />
                                <button type="submit" className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  {d.status === "DISABLED" ? "Enable" : "Disable"}
                                </button>
                              </form>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Wizard / edit form */}
          {canManage && (
            <Card title={focusedDomain ? `Edit: ${focusedDomain.domain}` : "Add a custom domain"}>
              <form action={saveDomain} className="space-y-4 px-5 py-5">
                {focusedDomain && <input type="hidden" name="id" value={focusedDomain.id} />}
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Tenant" required>
                    <select name="tenantId" defaultValue={focusedDomain?.tenantId ?? ""} required className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                      <option value="">— Pick a tenant —</option>
                      {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
                    </select>
                  </Field>
                  <FormField label="Domain" name="domain" required defaultValue={focusedDomain?.domain ?? ""} placeholder="app.example.com" maxLength={253} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Type">
                    <select name="type" defaultValue={focusedDomain?.type ?? "SUBDOMAIN"} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                      {TYPES.map((t) => <option key={t} value={t}>{t === "APEX" ? "Apex (root domain)" : "Subdomain"}</option>)}
                    </select>
                  </Field>
                  <label className="flex items-end gap-2 text-sm">
                    <input type="checkbox" name="isPrimary" defaultChecked={focusedDomain?.isPrimary ?? false} className="h-4 w-4" />
                    <span>Set as tenant primary domain</span>
                  </label>
                </div>
                <Card title="DNS record">
                  <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                    <FormField label="Record type" name="dnsRecordType" required defaultValue={focusedDomain?.dnsRecordType ?? "CNAME"} maxLength={20} />
                    <FormField label="Record value" name="dnsRecordValue" required defaultValue={focusedDomain?.dnsRecordValue ?? "endpoint.flowtora.com"} maxLength={400} />
                  </div>
                </Card>
                <Card title="SSL">
                  <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                    <Field label="Issuer">
                      <select name="sslIssuer" defaultValue={focusedDomain?.sslIssuer ?? "LETS_ENCRYPT"} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                        {ISSUERS.map((i) => <option key={i} value={i}>{ISSUER_LABEL[i]}</option>)}
                      </select>
                    </Field>
                    <Field label="ACME challenge">
                      <select name="acmeChallenge" defaultValue={focusedDomain?.acmeChallenge ?? "HTTP_01"} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                        {CHALLENGES.map((c) => <option key={c} value={c}>{CHALLENGE_LABEL[c]}</option>)}
                      </select>
                    </Field>
                    <FormField label="Additional SANs (comma-separated)" name="sanList" defaultValue={focusedDomain?.sanList.join(", ") ?? ""} maxLength={1000} hint="e.g. www.example.com, m.example.com" />
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="forceHttps" defaultChecked={focusedDomain?.forceHttps ?? true} className="h-4 w-4" />
                        <span>Force HTTPS</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="hstsEnabled" defaultChecked={focusedDomain?.hstsEnabled ?? false} className="h-4 w-4" />
                        <span>Enable HSTS</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="hstsPreload" defaultChecked={focusedDomain?.hstsPreload ?? false} className="h-4 w-4" />
                        <span>HSTS preload list</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="redirectFromWww" defaultChecked={focusedDomain?.redirectFromWww ?? true} className="h-4 w-4" />
                        <span>Redirect from www →</span>
                      </label>
                    </div>
                  </div>
                </Card>
                <TextArea label="Notes" name="notes" rows={3} defaultValue={focusedDomain?.notes ?? ""} maxLength={2000} />
                <div className="flex items-center justify-end gap-2 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {focusedDomain && (
                    <form action={deleteDomain}>
                      <input type="hidden" name="id" value={focusedDomain.id} />
                      <button
                        type="submit"
                        className="rounded-md px-3 py-2 text-xs"
                        style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
                      >
                        Delete domain
                      </button>
                    </form>
                  )}
                  <button
                    type="submit"
                    className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                  >
                    Save domain
                  </button>
                </div>
              </form>
            </Card>
          )}

          {focusedDomain && focusedDomain.verificationToken && (
            <Card title="DNS instructions" description="Add the records below in your DNS provider; we'll auto-poll for verification.">
              <pre className="overflow-x-auto px-5 py-4 font-mono text-xs"
                style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
{`# Primary record
${focusedDomain.domain}.    ${focusedDomain.dnsRecordType}    ${focusedDomain.dnsRecordValue}

# Verification (TXT)
_flowtora.${focusedDomain.domain}.    TXT    "${focusedDomain.verificationToken}"`}
              </pre>
            </Card>
          )}
        </section>
      )}

      {/* Tab: DNS Templates */}
      {tab === "dns" && (
        <section id="dns" className="space-y-4">
          <Card title="DNS templates" description="Copy-able TXT/CNAME records used during verification + setup. Edit to match your platform domain.">
            <ul>
              {templates.length === 0 && (
                <li className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
                  No templates yet — add one below.
                </li>
              )}
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3 text-sm md:grid-cols-[180px_1fr_auto]"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>{t.key}</div>
                    {t.envScope && (
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                        {t.envScope}
                      </div>
                    )}
                  </div>
                  <pre className="overflow-x-auto rounded-md px-3 py-2 font-mono text-[11px]"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
{`${t.hostnamePattern}    ${t.recordType}    ${t.valuePattern}`}
                  </pre>
                  {canManage && (
                    <form action={deleteDnsTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="text-xs" style={{ color: "var(--danger-fg)" }}>Delete</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {canManage && (
            <Card title="Add / edit template">
              <form action={saveDnsTemplate} className="space-y-3 px-5 py-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Key" name="key" required placeholder="apex-alias" maxLength={120} hint="Lower-case slug" />
                  <FormField label="Label" name="label" required maxLength={120} />
                  <FormField label="Sort order" name="sortOrder" type="number" defaultValue="0" required />
                </div>
                <TextArea label="Description (markdown)" name="description" required rows={3} maxLength={2000} />
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Record type" name="recordType" required maxLength={20} placeholder="CNAME" />
                  <FormField label="Hostname pattern" name="hostnamePattern" required maxLength={200} placeholder="{sub}.{apex}" />
                  <FormField label="Value pattern" name="valuePattern" required maxLength={400} placeholder="endpoint.flowtora.com" />
                </div>
                <FormField label="Environment scope (optional)" name="envScope" maxLength={40} placeholder="prod | staging | preview" />
                <div className="flex justify-end">
                  <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                    Save template
                  </button>
                </div>
              </form>
            </Card>
          )}
        </section>
      )}

      {/* Tab: SSL Certificates */}
      {tab === "certs" && (
        <section id="certs" className="space-y-4">
          <div className="overflow-x-auto rounded-xl"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Domain</Th><Th>Status</Th><Th>Issuer</Th><Th>Common name</Th>
                  <Th>SAN list</Th><Th>Issued</Th><Th>Expires</Th><Th>Serial</Th>
                </tr>
              </thead>
              <tbody>
                {certs.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                    No certificates yet.
                  </td></tr>
                )}
                {certs.map((c) => {
                  const tone = CERT_STATUS_TONE[c.status];
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-3 py-2 align-top font-mono text-[12px]">{c.domain.domain}</td>
                      <td className="px-3 py-2 align-top">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                          style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}>
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{ISSUER_LABEL[c.issuer]}</td>
                      <td className="px-3 py-2 align-top text-xs">{c.commonName}</td>
                      <td className="px-3 py-2 align-top text-xs" style={{ color: "var(--text-muted)" }}>
                        {c.sanList.slice(0, 3).join(", ")}{c.sanList.length > 3 ? `, +${c.sanList.length - 3} more` : ""}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{relativeFromNow(c.issuedAt)}</td>
                      <td className="px-3 py-2 align-top text-xs">{relativeFromNow(c.expiresAt)}</td>
                      <td className="px-3 py-2 align-top font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {c.serialNumber ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab: Apex Helpers */}
      {tab === "apex" && (
        <section id="apex" className="space-y-4">
          <Card title="Apex setup guides" description="Provider-specific instructions for setting up an apex/root domain. Use ALIAS/ANAME where supported; A records otherwise.">
            {guides.length === 0 && (
              <p className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
                No guides yet — add one below.
              </p>
            )}
            {guides.map((g) => (
              <details
                key={g.id}
                className="px-5 py-3 text-sm"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <summary className="cursor-pointer font-medium">
                  {g.providerName}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    {g.supportsAlias ? "(supports ALIAS/ANAME)" : "(A records only)"}
                  </span>
                </summary>
                <pre
                  className="mt-2 whitespace-pre-wrap rounded-md px-3 py-2 font-mono text-[11px]"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)" }}
                >
                  {g.bodyMarkdown}
                </pre>
                {canManage && (
                  <form action={deleteApexGuide} className="mt-2">
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="text-xs" style={{ color: "var(--danger-fg)" }}>Delete</button>
                  </form>
                )}
              </details>
            ))}
          </Card>
          {canManage && (
            <Card title="Add / edit guide">
              <form action={saveApexGuide} className="space-y-3 px-5 py-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField label="Provider key" name="providerKey" required maxLength={60} placeholder="cloudflare" />
                  <FormField label="Provider name" name="providerName" required maxLength={120} placeholder="Cloudflare" />
                  <FormField label="Sort order" name="sortOrder" type="number" defaultValue="0" required />
                </div>
                <TextArea label="Body (markdown)" name="bodyMarkdown" required rows={8} maxLength={8000} hint="Step-by-step instructions for adding an ALIAS/ANAME record." />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="supportsAlias" className="h-4 w-4" />
                  <span>Provider supports ALIAS / ANAME records</span>
                </label>
                <div className="flex justify-end">
                  <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                    Save guide
                  </button>
                </div>
              </form>
            </Card>
          )}
        </section>
      )}

      {/* Tab: Settings */}
      {tab === "settings" && (
        <section id="settings" className="space-y-4">
          <Card title="Default issuance + HSTS defaults">
            <form action={saveDomainSettings} className="space-y-4 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Default issuer">
                  <select name="defaultIssuer" defaultValue={settings.defaultIssuer} className="w-full rounded-md px-3 py-2 text-sm outline-none" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                    {ISSUERS.map((i) => <option key={i} value={i}>{ISSUER_LABEL[i]}</option>)}
                  </select>
                </Field>
                <FormField label="ACME account email" name="acmeAccountEmail" type="email" required defaultValue={settings.acmeAccountEmail} maxLength={200} />
              </div>
              <FormField label="CA fallback list (comma-separated)" name="caFallbackList" defaultValue={settings.caFallbackList.join(", ")} maxLength={500} hint="Order of fallback CAs if the primary issuer is unavailable." />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="HSTS max-age (seconds)" name="hstsDefaultMaxAge" type="number" required defaultValue={settings.hstsDefaultMaxAge.toString()} hint="Default 1y = 31536000" />
                <label className="flex items-end gap-2 text-sm">
                  <input type="checkbox" name="hstsDefaultPreload" defaultChecked={settings.hstsDefaultPreload} className="h-4 w-4" />
                  <span>Enable HSTS preload by default</span>
                </label>
              </div>
              <TextArea label="Cert revocation procedure" name="certRevocationProcedure" rows={4} defaultValue={settings.certRevocationProcedure ?? ""} maxLength={4000} hint="Documented steps for revoking a leaked cert." />
              <TextArea label="Notes" name="notes" rows={3} defaultValue={settings.notes ?? ""} maxLength={2000} />
              <div className="flex justify-end">
                <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                  Save settings
                </button>
              </div>
            </form>
          </Card>
        </section>
      )}
    </div>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Card({
  title, description, children,
}: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
    >
      {title && (
        <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function MiniKpi({
  label, value, tone = "default",
}: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const palette =
    tone === "success" ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" } :
    tone === "warning" ? { bg: "var(--amber-100)",   fg: "var(--amber-700)"   } :
    tone === "danger"  ? { bg: "var(--rose-100)",    fg: "var(--rose-700)"    } :
                          { bg: "var(--surface-1)",   fg: "var(--text-default)" };
  return (
    <div className="rounded-md px-3 py-2.5"
      style={{ background: palette.bg, border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: palette.fg }}>{value}</div>
    </div>
  );
}

function Th({
  children, className = "", ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement> & { className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color: "var(--text-muted)" }}
      {...rest}
    >
      {children}
    </th>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      {children}
    </label>
  );
}

function FormField({
  label, name, type = "text", defaultValue, required, placeholder, maxLength, hint,
}: {
  label: string; name: string; type?: string; defaultValue?: string; required?: boolean;
  placeholder?: string; maxLength?: number; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      <input type={type} name={name} defaultValue={defaultValue} required={required} placeholder={placeholder} maxLength={maxLength}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function TextArea({
  label, name, defaultValue, rows = 4, required, maxLength, hint,
}: {
  label: string; name: string; defaultValue?: string; rows?: number; required?: boolean; maxLength?: number; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} required={required} maxLength={maxLength}
        className="w-full rounded-md px-3 py-2 font-mono text-sm outline-none"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const palette = tone === "success"
    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)", border: "var(--emerald-300)" }
    : { bg: "var(--rose-100)", fg: "var(--rose-700)", border: "var(--rose-300)" };
  return (
    <div className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>
      {children}
    </div>
  );
}
