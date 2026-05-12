// Page 66 — Branding & White-Label.
//
// Six tabs: Brand · Profiles · Tenants · Email Footer · Login Pages · Powered-By
// Plus Activity at the end.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadBrandingPage, loadProfileDetail,
  POWERED_BY_MODE_LABEL, POWERED_BY_MODE_TONE, POWERED_BY_VARIANTS,
  BRANDING_CHANGE_LABEL, BRANDING_CHANGE_TONE,
  ALLOWED_GOOGLE_FONTS,
  parseSocialLinks, parseSocialProof,
  relativeFromNow,
} from "@/server/platform/branding";
import {
  saveBrand, saveEmailFooter, saveLoginPage, savePoweredBy,
  saveProfile, deleteProfile,
  applyProfileToTenant, revertTenantBranding,
} from "@/app/actions/platform-branding";
import type { PoweredByMode } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["brand", "profiles", "tenants", "email-footer", "login-pages", "powered-by", "activity"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  brand:         "Flowtora Brand",
  profiles:      "White-Label Profiles",
  tenants:       "Per-Tenant Branding",
  "email-footer": "Email Footer",
  "login-pages": "Login Pages",
  "powered-by":  "Powered-By",
  activity:      "Activity",
};

const POWERED_BY_MODES: PoweredByMode[] = ["ALWAYS_ON", "ALWAYS_OFF", "BY_PLAN", "BY_PROFILE"];

export default async function BrandingPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("branding.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Branding.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("branding.manage");
  const canTenantManage = ctx.can("branding.tenant_manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "brand";
  const selectedProfileKey = asString(sp.profile);

  const data = await loadBrandingPage();
  const { kpis, brandSettings, profiles, tenantBrandings, changes, allTenants } = data;

  const selectedProfile = selectedProfileKey
    ? profiles.find((p) => p.key === selectedProfileKey) ?? null
    : null;
  const selectedProfileDetail = selectedProfile
    ? await loadProfileDetail(selectedProfile.id)
    : null;

  return (
    <main className="mx-auto w-full max-w-[1620px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Branding &amp; white-label</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Manage Flowtora&apos;s own brand and white-label profiles for resellers + Enterprise tenants.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Profiles" value={`${kpis.activeProfiles}/${kpis.totalProfiles}`}
             sub={`${kpis.resellerProfiles} reseller-owned`} />
        <Kpi label="Branded tenants" value={String(kpis.brandedTenants)}
             sub={`${kpis.defaultTenants} on default`} />
        <Kpi label="White-label tenants" value={String(kpis.whiteLabelTenants)}
             sub="Flowtora mentions removed"
             tone={kpis.whiteLabelTenants > 0 ? "good" : "default"} />
        <Kpi label="Powered-By" value={POWERED_BY_MODE_LABEL[kpis.poweredByMode]}
             sub="program-level policy" />
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

      {tab === "brand" && (
        <BrandTab settings={brandSettings} canManage={canManage} />
      )}
      {tab === "profiles" && (
        <ProfilesTab profiles={profiles} selected={selectedProfileDetail}
                     allTenants={allTenants} canManage={canManage} />
      )}
      {tab === "tenants" && (
        <TenantsTab tenantBrandings={tenantBrandings} profiles={profiles}
                    allTenants={allTenants} canTenantManage={canTenantManage} />
      )}
      {tab === "email-footer" && (
        <EmailFooterTab settings={brandSettings} canManage={canManage} />
      )}
      {tab === "login-pages" && (
        <LoginPagesTab settings={brandSettings} canManage={canManage} />
      )}
      {tab === "powered-by" && (
        <PoweredByTab settings={brandSettings} canManage={canManage} />
      )}
      {tab === "activity" && (
        <ActivityTab rows={changes} />
      )}
    </main>
  );
}

/* ── Brand tab ─────────────────────────────────────────── */

function BrandTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadBrandingPage>>["brandSettings"];
  canManage: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      <form action={saveBrand} className="rounded-xl border p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="mb-3 border-b pb-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Flowtora brand</h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Used wherever a tenant isn&apos;t under a white-label profile.
          </p>
        </header>
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Logos &amp; icons
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              <Input name="logoFullColorUrl"  type="url" label="Logo (full color URL)"  defaultValue={settings.logoFullColorUrl ?? ""} />
              <Input name="logoMonochromeUrl" type="url" label="Logo (monochrome URL)"  defaultValue={settings.logoMonochromeUrl ?? ""} />
              <Input name="faviconUrl"        type="url" label="Favicon URL"            defaultValue={settings.faviconUrl ?? ""} />
              <Input name="socialCardUrl"     type="url" label="Social card URL"         defaultValue={settings.socialCardUrl ?? ""} />
              <Input name="appIconUrl"        type="url" label="PWA app icon URL"        defaultValue={settings.appIconUrl ?? ""} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Colors
            </h3>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              <Input name="primaryColor"    label="Primary"    defaultValue={settings.primaryColor} />
              <Input name="accentColor"     label="Accent"     defaultValue={settings.accentColor} />
              <Input name="backgroundColor" label="Background" defaultValue={settings.backgroundColor} />
              <Input name="textColor"       label="Text"       defaultValue={settings.textColor} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Typography
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <Select name="primaryFont" label="Primary font" defaultValue={settings.primaryFont}
                      options={ALLOWED_GOOGLE_FONTS.map((f) => ({ value: f, label: f }))} />
              <Select name="headingFont" label="Heading font" defaultValue={settings.headingFont}
                      options={ALLOWED_GOOGLE_FONTS.map((f) => ({ value: f, label: f }))} />
              <Select name="bodyFont"    label="Body font"    defaultValue={settings.bodyFont}
                      options={ALLOWED_GOOGLE_FONTS.map((f) => ({ value: f, label: f }))} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Marketing assets
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input name="brandKitZipUrl"    type="url" label="Brand kit ZIP URL"        defaultValue={settings.brandKitZipUrl ?? ""} />
              <Input name="brandGuidelinesUrl" type="url" label="Brand guidelines doc URL" defaultValue={settings.brandGuidelinesUrl ?? ""} />
            </div>
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
            <textarea name="notes" rows={3} defaultValue={settings.notes ?? ""}
                      className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          {canManage && (
            <div className="flex justify-end border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
              <button type="submit"
                      className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Save brand
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Live preview */}
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Preview</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="rounded-lg p-4" style={{ background: settings.backgroundColor, color: settings.textColor }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: settings.primaryColor }}>
              {settings.primaryFont}
            </div>
            <div className="mt-1 text-[18px] font-bold" style={{ fontFamily: settings.headingFont }}>
              Flowtora — sample heading
            </div>
            <p className="mt-1 text-[12px]" style={{ fontFamily: settings.bodyFont }}>
              Body copy in {settings.bodyFont}. Brand colors render exactly as set above.
            </p>
            <button type="button"
                    className="mt-3 rounded-md px-3 py-1.5 text-[11px] font-medium"
                    style={{ background: settings.primaryColor, color: settings.backgroundColor }}>
              Primary CTA
            </button>
            <button type="button"
                    className="ml-2 rounded-md px-3 py-1.5 text-[11px] font-medium"
                    style={{ background: settings.accentColor, color: settings.backgroundColor }}>
              Accent CTA
            </button>
          </div>
          <ul className="space-y-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <li>Last updated by <strong style={{ color: "var(--text-default)" }}>{settings.updatedByEmail ?? "system"}</strong></li>
            <li>{relativeFromNow(settings.updatedAt)}</li>
          </ul>
        </div>
      </aside>
    </section>
  );
}

/* ── Profiles tab ─────────────────────────────────────── */

function ProfilesTab({
  profiles, selected, allTenants, canManage,
}: {
  profiles: Awaited<ReturnType<typeof loadBrandingPage>>["profiles"];
  selected: Awaited<ReturnType<typeof loadProfileDetail>>;
  allTenants: Awaited<ReturnType<typeof loadBrandingPage>>["allTenants"];
  canManage: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="flex items-center justify-between border-b px-3 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Profiles</h3>
          <a href="?tab=profiles&profile=" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>+ new</a>
        </header>
        <ul className="max-h-[680px] overflow-y-auto">
          {profiles.length === 0 ? (
            <li className="p-5 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>No profiles yet.</li>
          ) : profiles.map((p) => {
            const active = selected?.id === p.id;
            return (
              <li key={p.id}>
                <a href={`?tab=profiles&profile=${encodeURIComponent(p.key)}`}
                   className="block border-b px-3 py-2 transition hover:bg-[var(--surface-2)]"
                   style={{
                     borderColor: "var(--border-subtle)",
                     background: active ? "var(--accent-surface)" : "transparent",
                   }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{p.name}</span>
                    <div className="flex items-center gap-1">
                      {p.isDefault && <Pill tone={{ bg: "var(--amber-100)", fg: "var(--amber-700)" }} label="Default" />}
                      {!p.active && <Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-muted)" }} label="Archived" />}
                      {p.removeFlowtoraMentions && <Pill tone={{ bg: "var(--violet-100)", fg: "var(--violet-700)" }} label="White-label" />}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <code className="text-[10px]">{p.key}</code>
                    {p.resellerTenant && (<><span>·</span><span>{p.resellerTenant.name}</span></>)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <span>{p._count.tenants} tenants</span>
                    <span>·</span>
                    <span>{relativeFromNow(p.updatedAt)}</span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </aside>

      <div>
        <ProfileEditor profile={selected} allTenants={allTenants} canManage={canManage} />
      </div>
    </section>
  );
}

function ProfileEditor({
  profile, allTenants, canManage,
}: {
  profile: Awaited<ReturnType<typeof loadProfileDetail>>;
  allTenants: Awaited<ReturnType<typeof loadBrandingPage>>["allTenants"];
  canManage: boolean;
}) {
  const social = profile?.socialLinksJson ? parseSocialLinks(profile.socialLinksJson) : {};
  return (
    <article className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-default)" }}>
            {profile ? `Edit profile — ${profile.name}` : "Create profile"}
          </h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {profile?.removeFlowtoraMentions
              ? "White-label: Flowtora mentions removed — applies to Enterprise resellers only."
              : "Use this to set up a reseller-facing brand."}
          </p>
        </div>
        {profile && canManage && (
          <form action={deleteProfile}>
            <input type="hidden" name="id" value={profile.id} />
            <button type="submit" className="text-[11px] underline" style={{ color: "var(--rose-700)" }}>Delete profile</button>
          </form>
        )}
      </header>
      <form action={saveProfile} className="space-y-4 p-5">
        <input type="hidden" name="id" value={profile?.id ?? ""} />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <Input name="key"  label="Slug (URL-safe)" defaultValue={profile?.key ?? ""} />
          <Input name="name" label="Name"            defaultValue={profile?.name ?? ""} />
          <Select name="resellerTenantId" label="Reseller tenant (optional)" defaultValue={profile?.resellerTenantId ?? ""}
                  options={[{ value: "", label: "— Flowtora-owned —" }, ...allTenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.plan}` }))]} />
        </div>
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
          <input name="description" defaultValue={profile?.description ?? ""}
                 className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>

        <Section title="Logos">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            <Input name="logoLightUrl"  type="url" label="Logo (light bg)" defaultValue={profile?.logoLightUrl ?? ""} />
            <Input name="logoDarkUrl"   type="url" label="Logo (dark bg)"  defaultValue={profile?.logoDarkUrl ?? ""} />
            <Input name="faviconUrl"    type="url" label="Favicon URL"     defaultValue={profile?.faviconUrl ?? ""} />
            <Input name="emailLogoUrl"  type="url" label="Email logo URL"  defaultValue={profile?.emailLogoUrl ?? ""} />
            <Input name="pwaFaviconUrl" type="url" label="PWA favicon URL" defaultValue={profile?.pwaFaviconUrl ?? ""} />
          </div>
        </Section>

        <Section title="Colors &amp; fonts">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Input name="primaryColor"    label="Primary"    defaultValue={profile?.primaryColor    ?? "#5A4FD9"} />
            <Input name="accentColor"     label="Accent"     defaultValue={profile?.accentColor     ?? "#22C55E"} />
            <Input name="backgroundColor" label="Background" defaultValue={profile?.backgroundColor ?? "#FFFFFF"} />
            <Input name="textColor"       label="Text"       defaultValue={profile?.textColor       ?? "#0F172A"} />
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Select name="primaryFont" label="Primary font" defaultValue={profile?.primaryFont ?? "Inter"}
                    options={ALLOWED_GOOGLE_FONTS.map((f) => ({ value: f, label: f }))} />
            <Select name="headingFont" label="Heading font" defaultValue={profile?.headingFont ?? "Inter"}
                    options={ALLOWED_GOOGLE_FONTS.map((f) => ({ value: f, label: f }))} />
          </div>
        </Section>

        <Section title="Domains">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input name="customDomain" label="Custom domain"  defaultValue={profile?.customDomain ?? ""} />
            <Input name="subdomain"    label="Subdomain"      defaultValue={profile?.subdomain    ?? ""} />
            <Input name="loginUrlSlug" label="Login URL slug" defaultValue={profile?.loginUrlSlug ?? ""} />
          </div>
        </Section>

        <Section title="Email">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input name="emailFromName"   label="Email from name"   defaultValue={profile?.emailFromName   ?? ""} />
            <Input name="emailFromDomain" label="Email from domain" defaultValue={profile?.emailFromDomain ?? ""} />
          </div>
        </Section>

        <Section title="Footer &amp; social">
          <Input name="footerText" label="Footer text" defaultValue={profile?.footerText ?? ""} />
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              Social links JSON ({`{twitter, linkedin, github, instagram, youtube}`})
            </span>
            <textarea name="socialLinksJson" rows={3}
                      defaultValue={Object.keys(social).length > 0 ? JSON.stringify(social, null, 2) : ""}
                      className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
        </Section>

        <Section title="Login page overrides">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input name="loginHeadline" label="Headline" defaultValue={profile?.loginHeadline ?? ""} />
            <Input name="loginSubtext"  label="Subtext"  defaultValue={profile?.loginSubtext ?? ""} />
            <Input name="loginBackgroundColor" label="Background color"  defaultValue={profile?.loginBackgroundColor ?? ""} />
            <Input name="loginBackgroundImageUrl" type="url" label="Background image URL" defaultValue={profile?.loginBackgroundImageUrl ?? ""} />
            <Input name="loginCtaText" label="CTA text" defaultValue={profile?.loginCtaText ?? ""} />
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Marketing copy</span>
            <textarea name="loginMarketingCopy" rows={3} defaultValue={profile?.loginMarketingCopy ?? ""}
                      className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
        </Section>

        <Section title="White-label policy">
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="removeFlowtoraMentions" defaultChecked={profile?.removeFlowtoraMentions ?? false} />
            Remove Flowtora mentions (requires Enterprise reseller)
          </label>
          <Input name="smsSenderName" label="SMS sender name (max 11 chars, alphanumeric)" defaultValue={profile?.smsSenderName ?? ""} />
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="active" defaultChecked={profile?.active ?? true} />
            Active
          </label>
        </Section>

        {canManage && (
          <div className="flex justify-end border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
            <button type="submit"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              {profile ? "Save profile" : "Create profile"}
            </button>
          </div>
        )}
      </form>

      {/* Applied tenants */}
      {profile && profile.tenants.length > 0 && (
        <section className="border-t p-5" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Applied to {profile.tenants.length} tenant{profile.tenants.length === 1 ? "" : "s"}
          </h3>
          <ul className="space-y-1 text-[11px]">
            {profile.tenants.map((tb) => (
              <li key={tb.id} className="flex items-center justify-between">
                <span>
                  <strong style={{ color: "var(--text-default)" }}>{tb.tenant.name}</strong>
                  <span style={{ color: "var(--text-muted)" }}> · {tb.tenant.slug}</span>
                </span>
                {tb.hasCustomOverrides && <Pill tone={{ bg: "var(--amber-100)", fg: "var(--amber-700)" }} label="Custom overrides" />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{title}</h3>
      {children}
    </div>
  );
}

/* ── Tenants tab ──────────────────────────────────────── */

function TenantsTab({
  tenantBrandings, profiles, allTenants, canTenantManage,
}: {
  tenantBrandings: Awaited<ReturnType<typeof loadBrandingPage>>["tenantBrandings"];
  profiles: Awaited<ReturnType<typeof loadBrandingPage>>["profiles"];
  allTenants: Awaited<ReturnType<typeof loadBrandingPage>>["allTenants"];
  canTenantManage: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Per-tenant branding</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {tenantBrandings.length} tenants with applied profiles · others run on the default Flowtora brand.
          </p>
        </header>
        <div className="overflow-x-auto p-4">
          {tenantBrandings.length === 0 ? <Empty>No tenants are using a custom profile yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Tenant</Th><Th>Plan</Th><Th>Profile</Th><Th>Overrides</Th>
                  <Th>Powered-by</Th><Th>Last edit</Th>
                  {canTenantManage && <Th right>Revert</Th>}
                </tr>
              </thead>
              <tbody>
                {tenantBrandings.map((tb) => (
                  <tr key={tb.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{tb.tenant.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tb.tenant.slug}</div>
                    </Td>
                    <Td><Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-default)" }} label={tb.tenant.plan} /></Td>
                    <Td>
                      {tb.profile
                        ? <span className="text-[12px]" style={{ color: "var(--text-default)" }}>{tb.profile.name}</span>
                        : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>— default —</span>}
                    </Td>
                    <Td>
                      {tb.hasCustomOverrides
                        ? <Pill tone={{ bg: "var(--amber-100)", fg: "var(--amber-700)" }} label="Custom" />
                        : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                    </Td>
                    <Td>
                      <span className="text-[11px]" style={{ color: "var(--text-default)" }}>
                        {tb.poweredByEnabled === true  ? "Forced ON"
                         : tb.poweredByEnabled === false ? "Forced OFF"
                         : "Follow policy"}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {relativeFromNow(tb.lastEditAt)}{tb.lastEditByEmail && ` · ${tb.lastEditByEmail}`}
                      </span>
                    </Td>
                    {canTenantManage && (
                      <Td right>
                        <form action={revertTenantBranding}>
                          <input type="hidden" name="tenantId" value={tb.tenantId} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--rose-700)" }}>
                            Revert to default
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
      </div>

      {/* Apply form */}
      {canTenantManage && (
        <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Apply / update profile for a tenant</h3>
          </header>
          <form action={applyProfileToTenant} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            <Select name="tenantId"  label="Tenant"
                    options={allTenants.map((t) => ({ value: t.id, label: `${t.name} · ${t.plan}` }))} />
            <Select name="profileId" label="Profile (blank = revert to default)" defaultValue=""
                    options={[{ value: "", label: "— default Flowtora —" }, ...profiles.map((p) => ({ value: p.id, label: `${p.name}${p.removeFlowtoraMentions ? " · white-label" : ""}` }))]} />
            <Select name="poweredByEnabled" label="Powered-By" defaultValue="follow"
                    options={[
                      { value: "follow", label: "Follow program policy" },
                      { value: "on",     label: "Force ON" },
                      { value: "off",    label: "Force OFF (white-label)" },
                    ]} />
            <Input name="primaryColorOverride"  label="Primary color override (optional)" defaultValue="" />
            <Input name="accentColorOverride"   label="Accent color override (optional)"  defaultValue="" />
            <Input name="logoOverrideUrl"       type="url" label="Logo override URL (optional)" defaultValue="" />
            <Input name="loginHeadlineOverride" label="Login headline override (optional)" defaultValue="" />
            <div className="md:col-span-2 xl:col-span-3 flex justify-end">
              <button type="submit"
                      className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Apply profile
              </button>
            </div>
          </form>
        </section>
      )}
    </section>
  );
}

/* ── Email Footer tab ─────────────────────────────────── */

function EmailFooterTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadBrandingPage>>["brandSettings"];
  canManage: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <form action={saveEmailFooter} className="rounded-xl border p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="mb-3 border-b pb-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Global email footer</h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            MJML source-of-truth + cached HTML render · supports per-profile variables.
          </p>
        </header>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>MJML source</span>
            <textarea name="emailFooterMjml" rows={12} defaultValue={settings.emailFooterMjml ?? ""}
                      placeholder='<mj-section><mj-column><mj-text>Footer text…</mj-text></mj-column></mj-section>'
                      className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Rendered HTML (cached)</span>
            <textarea name="emailFooterHtml" rows={6} defaultValue={settings.emailFooterHtml ?? ""}
                      className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          {canManage && (
            <div className="flex justify-end border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
              <button type="submit"
                      className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Save footer
              </button>
            </div>
          )}
        </div>
      </form>

      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Preview</h3>
        </header>
        <div className="p-4">
          {settings.emailFooterHtml
            ? (
              <div className="rounded-md border p-3 text-[11px]"
                   style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                   dangerouslySetInnerHTML={{ __html: settings.emailFooterHtml }} />
            )
            : <Empty>No footer rendered yet. Save the MJML to see a preview.</Empty>}
        </div>
        <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          Variables: <code>{`{{platform_name}}`}</code>, <code>{`{{unsubscribe_url}}`}</code>, <code>{`{{footer_text}}`}</code>
        </div>
      </aside>
    </section>
  );
}

/* ── Login Pages tab ──────────────────────────────────── */

function LoginPagesTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadBrandingPage>>["brandSettings"];
  canManage: boolean;
}) {
  const social = parseSocialProof(settings.loginSocialProofJson);
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <form action={saveLoginPage} className="rounded-xl border p-5"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="mb-3 border-b pb-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Login page template (default)</h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Used when a tenant isn&apos;t under a profile with its own login overrides.
          </p>
        </header>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Input name="loginHeadline"        label="Headline"        defaultValue={settings.loginHeadline ?? ""} />
            <Input name="loginSubtext"         label="Subtext"         defaultValue={settings.loginSubtext ?? ""} />
            <Input name="loginCtaText"         label="CTA text"        defaultValue={settings.loginCtaText ?? ""} />
            <Input name="loginBackgroundColor" label="Background color" defaultValue={settings.loginBackgroundColor ?? ""} />
            <Input name="loginHeroImageUrl"       type="url" label="Hero image URL"       defaultValue={settings.loginHeroImageUrl ?? ""} />
            <Input name="loginBackgroundImageUrl" type="url" label="Background image URL" defaultValue={settings.loginBackgroundImageUrl ?? ""} />
          </div>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Marketing copy</span>
            <textarea name="loginMarketingCopy" rows={3} defaultValue={settings.loginMarketingCopy ?? ""}
                      className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              Social proof JSON — array of {`{ name, role, quote, avatarUrl? }`}
            </span>
            <textarea name="loginSocialProofJson" rows={6}
                      defaultValue={social.length > 0 ? JSON.stringify(social, null, 2) : ""}
                      className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          {canManage && (
            <div className="flex justify-end border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
              <button type="submit"
                      className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Save login template
              </button>
            </div>
          )}
        </div>
      </form>

      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Preview</h3>
        </header>
        <div className="p-4 space-y-3">
          <div className="rounded-lg p-4" style={{ background: settings.loginBackgroundColor ?? settings.backgroundColor, color: settings.textColor }}>
            <div className="text-[18px] font-bold" style={{ color: settings.primaryColor }}>
              {settings.loginHeadline ?? "Sign in to your account"}
            </div>
            <p className="mt-1 text-[12px]">{settings.loginSubtext ?? "Continue where you left off."}</p>
            <button type="button"
                    className="mt-3 rounded-md px-3 py-1.5 text-[11px] font-medium"
                    style={{ background: settings.primaryColor, color: settings.backgroundColor }}>
              {settings.loginCtaText ?? "Sign in"}
            </button>
            {social.length > 0 && (
              <ul className="mt-4 space-y-2 text-[11px]">
                {social.slice(0, 3).map((s, i) => (
                  <li key={i} className="rounded-md p-2"
                      style={{ background: "rgba(0,0,0,0.04)", color: settings.textColor }}>
                    <strong>{s.name}</strong> · <span style={{ color: "var(--text-muted)" }}>{s.role}</span>
                    <div className="mt-0.5">“{s.quote}”</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}

/* ── Powered-By tab ───────────────────────────────────── */

function PoweredByTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadBrandingPage>>["brandSettings"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Powered-By policy</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Controls when the &quot;Powered by Flowtora&quot; badge appears. Enterprise resellers can override per tenant.
        </p>
      </header>
      <form action={savePoweredBy} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <Select name="poweredByMode" label="Mode" defaultValue={settings.poweredByMode}
                options={POWERED_BY_MODES.map((m) => ({ value: m, label: POWERED_BY_MODE_LABEL[m] }))} />
        <Input name="poweredByEnabledPlans" label="Enabled plans (comma-separated, when BY_PLAN)"
               defaultValue={settings.poweredByEnabledPlans.join(", ")} />
        <Select name="poweredByBadgeVariant" label="Badge variant" defaultValue={settings.poweredByBadgeVariant}
                options={POWERED_BY_VARIANTS.map((v) => ({ value: v, label: v }))} />
        <div className="md:col-span-3 rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <Pill tone={POWERED_BY_MODE_TONE[settings.poweredByMode]} label={POWERED_BY_MODE_LABEL[settings.poweredByMode]} />
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {settings.poweredByMode === "ALWAYS_ON"  && "Every tenant sees the badge."}
            {settings.poweredByMode === "ALWAYS_OFF" && "No tenant sees the badge (white-label across the board)."}
            {settings.poweredByMode === "BY_PLAN"    && `Tenants on these plans see the badge: ${settings.poweredByEnabledPlans.join(", ") || "—"}.`}
            {settings.poweredByMode === "BY_PROFILE" && "Each white-label profile decides; per-tenant override available."}
          </p>
        </div>
        {canManage && (
          <div className="md:col-span-3 flex justify-end">
            <button type="submit"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save Powered-By policy
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

/* ── Activity tab ─────────────────────────────────────── */

function ActivityTab({
  rows,
}: {
  rows: Awaited<ReturnType<typeof loadBrandingPage>>["changes"];
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Branding activity</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} recent events across brand, profiles, tenants, footer, login pages, and powered-by.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No activity yet.</Empty> : (
          <ol className="space-y-2">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-[11px]"
                  style={{ color: "var(--text-default)" }}>
                <Pill tone={BRANDING_CHANGE_TONE[c.kind]} label={BRANDING_CHANGE_LABEL[c.kind]} />
                {c.entityLabel && <span className="font-medium">{c.entityLabel}</span>}
                <span style={{ color: "var(--text-muted)" }}>· {c.summary}</span>
                <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {c.actorEmail} · {relativeFromNow(c.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ── Reusable UI primitives ────────────────────────────── */

function Kpi({
  label, value, sub, tone = "default",
}: {
  label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette = tone === "good"    ? { fg: "var(--emerald-700)", chip: "var(--emerald-100)" }
                : tone === "warning" ? { fg: "var(--amber-700)",   chip: "var(--amber-100)" }
                : tone === "danger"  ? { fg: "var(--rose-700)",    chip: "var(--rose-100)" }
                :                      { fg: "var(--text-default)", chip: "var(--surface-2)" };
  return (
    <div className="rounded-xl border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
              style={{ background: palette.chip }} />
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums" style={{ color: palette.fg }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Pill({ tone, label }: { tone: { bg: string; fg: string }; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}>{label}</span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ textAlign: right ? "right" : "left", color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className="px-2 py-1.5"
        style={{ textAlign: right ? "right" : "left", verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function Input({
  name, label, defaultValue, type = "text",
}: {
  name: string; label: string; defaultValue?: string;
  type?: "text" | "url" | "email" | "number" | "tel";
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue}
             className="w-full rounded-md border px-2 py-1.5 text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
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
      <select name={name} defaultValue={defaultValue}
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>{msg}</span>
  );
}

function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>{msg}</span>
  );
}
