// Page 65 — Platform Settings.
//
// Two-column form layout, one card per section. Each section has its
// own server action so the audit row records which section changed.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadPlatformSettingsPage,
  TIMEZONES, LANGUAGES, CURRENCIES, DATE_FORMATS,
  TIME_FORMAT_LABEL, FIRST_DAY_LABEL, MEASUREMENT_LABEL,
  BANNER_VARIANT_LABEL, BANNER_VARIANT_TONE,
  WEEKDAYS, parseBusinessHours, parseHolidays,
  parseFeatureDefaults, FEATURE_DEFAULT_CATALOG,
  relativeFromNow, shortDateTime,
} from "@/server/platform/platform-settings";
import {
  saveIdentity, saveDefaults, saveBusinessHours, saveMaintenance,
  saveSignup, saveSession, saveCommunication, saveAuditCompliance,
  saveFeatureDefaults,
} from "@/app/actions/platform-settings";
import type {
  SystemBannerVariant,
  FirstDayOfWeek,
  TimeFormat,
  MeasurementSystem,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const SECTIONS = [
  { key: "identity",       label: "Identity" },
  { key: "defaults",       label: "Defaults" },
  { key: "business-hours", label: "Business hours" },
  { key: "maintenance",    label: "Maintenance" },
  { key: "signup",         label: "Signup & trial" },
  { key: "session",        label: "Session & security" },
  { key: "communication",  label: "Communication" },
  { key: "audit",          label: "Audit & compliance" },
  { key: "features",       label: "Feature defaults" },
  { key: "activity",       label: "Activity" },
] as const;

const TIME_FORMATS: TimeFormat[] = ["TWELVE_HOUR", "TWENTY_FOUR_HOUR"];
const FIRST_DAYS: FirstDayOfWeek[] = ["SUNDAY", "MONDAY"];
const MEASUREMENTS: MeasurementSystem[] = ["IMPERIAL", "METRIC"];
const BANNER_VARIANTS: SystemBannerVariant[] = ["INFO", "SUCCESS", "WARNING", "DANGER"];
const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

function inputDateTimeValue(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 16);
}

export default async function PlatformSettingsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.read_settings")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Platform Settings.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("system.write_settings");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const { settings, changes } = await loadPlatformSettingsPage();
  const businessHours = parseBusinessHours(settings.businessHoursJson);
  const holidays = parseHolidays(settings.holidaysJson);
  const features = parseFeatureDefaults(settings.featureDefaultsJson);

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Platform settings</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Global Flowtora configuration · every save lands in the audit log.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_1fr]">
        {/* Anchor nav */}
        <aside className="self-start rounded-xl border xl:sticky xl:top-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <ul className="p-2 text-[12px]">
            {SECTIONS.map((s) => (
              <li key={s.key}>
                <a href={`#${s.key}`}
                   className="block rounded-md px-2 py-1 transition hover:bg-[var(--surface-2)]"
                   style={{ color: "var(--text-default)" }}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          {settings.maintenanceMode && (
            <div className="border-t p-3" style={{ borderColor: "var(--border-subtle)" }}>
              <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label="Maintenance ON" />
              <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Tenants are seeing the banner.
              </p>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="space-y-4">
          {/* Identity */}
          <Card id="identity" title="Identity"
                hint="Public-facing platform name and contact addresses used in emails, footers, and the UI.">
            <form action={saveIdentity} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input name="platformName"      label="Platform name"      defaultValue={settings.platformName} />
              <Input name="platformShortName" label="Platform short name" defaultValue={settings.platformShortName} />
              <Input name="tagline"           label="Tagline"            defaultValue={settings.tagline ?? ""} />
              <Input name="phoneNumber"       label="Phone number" type="tel" defaultValue={settings.phoneNumber ?? ""} />
              <Input name="supportEmail" label="Support email" type="email" defaultValue={settings.supportEmail ?? ""} />
              <Input name="noreplyEmail" label="No-reply email" type="email" defaultValue={settings.noreplyEmail ?? ""} />
              <Input name="salesEmail"   label="Sales email"   type="email" defaultValue={settings.salesEmail ?? ""} />
              <Input name="pressEmail"   label="Press email"   type="email" defaultValue={settings.pressEmail ?? ""} />
              <label className="md:col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Mailing address (used in email footers)
                </span>
                <textarea name="mailingAddress" rows={3} defaultValue={settings.mailingAddress ?? ""}
                          className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Defaults */}
          <Card id="defaults" title="Defaults"
                hint="Defaults applied to new tenants. Existing tenants keep their own preferences.">
            <form action={saveDefaults} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Select name="defaultTimezone" label="Default timezone" defaultValue={settings.defaultTimezone}
                      options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
              <Select name="defaultLanguage" label="Default language" defaultValue={settings.defaultLanguage}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
              <Select name="defaultCurrency" label="Default currency" defaultValue={settings.defaultCurrency}
                      options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              <Select name="defaultDateFormat" label="Date format" defaultValue={settings.defaultDateFormat}
                      options={DATE_FORMATS.map((f) => ({ value: f, label: f }))} />
              <Select name="defaultTimeFormat" label="Time format" defaultValue={settings.defaultTimeFormat}
                      options={TIME_FORMATS.map((t) => ({ value: t, label: TIME_FORMAT_LABEL[t] }))} />
              <Select name="defaultFirstDayOfWeek" label="First day of week" defaultValue={settings.defaultFirstDayOfWeek}
                      options={FIRST_DAYS.map((d) => ({ value: d, label: FIRST_DAY_LABEL[d] }))} />
              <Select name="defaultMeasurement" label="Measurement system" defaultValue={settings.defaultMeasurement}
                      options={MEASUREMENTS.map((m) => ({ value: m, label: MEASUREMENT_LABEL[m] }))} />
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Business hours */}
          <Card id="business-hours" title="Business hours"
                hint="Office hours surface in support widgets and tenant-facing copy.">
            <form action={saveBusinessHours} className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <Th>Day</Th><Th>Open</Th><Th>Close</Th><Th>Closed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAYS.map((w) => {
                      const h = businessHours[w.key];
                      return (
                        <tr key={w.key} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                          <Td><span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{w.label}</span></Td>
                          <Td>
                            <input name={`hours_${w.key}_open`} type="time" defaultValue={h?.open ?? "09:00"}
                                   className="rounded-md border px-2 py-1 text-[12px] tabular-nums"
                                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                          </Td>
                          <Td>
                            <input name={`hours_${w.key}_close`} type="time" defaultValue={h?.close ?? "17:00"}
                                   className="rounded-md border px-2 py-1 text-[12px] tabular-nums"
                                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                          </Td>
                          <Td>
                            <input name={`hours_${w.key}_closed`} type="checkbox" defaultChecked={!!h?.closed} />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <label className="block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Holidays (one per line — <code>YYYY-MM-DD,Holiday Name</code>)
                </span>
                <textarea name="holidays" rows={5}
                          defaultValue={holidays.map((h) => `${h.date},${h.name}`).join("\n")}
                          className="w-full rounded-md border px-2 py-1.5 font-mono text-[11px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Maintenance */}
          <Card id="maintenance" title="Maintenance"
                hint="Block tenants from sensitive routes during planned outages. Admins always have access.">
            <form action={saveMaintenance} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-[12px] md:col-span-2" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="maintenanceMode" defaultChecked={settings.maintenanceMode} />
                Maintenance mode {settings.maintenanceMode
                  ? <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label="ON" />
                  : null}
              </label>
              <Input name="maintenanceEta" type="datetime-local" label="ETA" defaultValue={inputDateTimeValue(settings.maintenanceEta)} />
              <Input name="maintenanceAllowedIps" label="Allowed admin IPs (comma/newline-separated)"
                     defaultValue={settings.maintenanceAllowedIps.join(", ")} />
              <label className="md:col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Maintenance message (Markdown)
                </span>
                <textarea name="maintenanceMessage" rows={4}
                          defaultValue={settings.maintenanceMessage ?? ""}
                          className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Signup & Trial */}
          <Card id="signup" title="Signup & trial"
                hint="Controls the public signup funnel and trial defaults.">
            <form action={saveSignup} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="publicSignupEnabled" defaultChecked={settings.publicSignupEnabled} />
                Public signup enabled
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="requireCardForTrial" defaultChecked={settings.requireCardForTrial} />
                Require credit card for trial
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="blockDisposableEmails" defaultChecked={settings.blockDisposableEmails} />
                Block disposable email domains
              </label>
              <Input name="defaultTrialLengthDays" type="number" label="Trial length (days, 0–60)"
                     defaultValue={String(settings.defaultTrialLengthDays)} />
              <Select name="defaultSignupPlan" label="Default plan on signup" defaultValue={settings.defaultSignupPlan}
                      options={PLANS.map((p) => ({ value: p, label: p }))} />
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Session & Security */}
          <Card id="session" title="Session & security"
                hint="Admin-side session policies. Tenant sessions live on the Tenant App settings.">
            <form action={saveSession} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Input name="adminSessionLifetimeMin" type="number" label="Admin session lifetime (min)"
                     defaultValue={String(settings.adminSessionLifetimeMin)} />
              <Input name="idleTimeoutMin" type="number" label="Idle timeout (min)"
                     defaultValue={String(settings.idleTimeoutMin)} />
              <Input name="concurrentAdminSessions" type="number" label="Concurrent admin sessions"
                     defaultValue={String(settings.concurrentAdminSessions)} />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="forceMfaForAdmins" defaultChecked={settings.forceMfaForAdmins} />
                Force MFA for admins
              </label>
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Communication */}
          <Card id="communication" title="Communication preferences"
                hint="Sender identity for transactional email and an optional system-wide banner.">
            <form action={saveCommunication} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input name="defaultSenderName" label="Default sender name" defaultValue={settings.defaultSenderName} />
              <Input name="defaultReplyTo" type="email" label="Default reply-to" defaultValue={settings.defaultReplyTo ?? ""} />
              <Input name="systemBannerText" label="System banner text (optional)" defaultValue={settings.systemBannerText ?? ""} />
              <Select name="systemBannerVariant" label="Banner variant" defaultValue={settings.systemBannerVariant}
                      options={BANNER_VARIANTS.map((v) => ({ value: v, label: BANNER_VARIANT_LABEL[v] }))} />
              <Input name="systemBannerExpiresAt" type="datetime-local" label="Banner expires (optional)"
                     defaultValue={inputDateTimeValue(settings.systemBannerExpiresAt)} />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="systemBannerDismissable" defaultChecked={settings.systemBannerDismissable} />
                Dismissable
              </label>
              {settings.systemBannerText && (
                <div className="md:col-span-2 rounded-md border p-2"
                     style={{
                       background: BANNER_VARIANT_TONE[settings.systemBannerVariant].bg,
                       borderColor: "var(--border-subtle)",
                       color: BANNER_VARIANT_TONE[settings.systemBannerVariant].fg,
                     }}>
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Preview · </span>
                  <span className="text-[12px]">{settings.systemBannerText}</span>
                  {settings.systemBannerExpiresAt && (
                    <span className="ml-2 text-[10px] opacity-80">
                      expires {relativeFromNow(settings.systemBannerExpiresAt)}
                    </span>
                  )}
                </div>
              )}
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Audit & Compliance */}
          <Card id="audit" title="Audit & compliance"
                hint="Retention windows for the audit log and optional automatic PII anonymization.">
            <form action={saveAuditCompliance} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input name="auditRetentionDays" type="number" label="Audit retention (days)"
                     defaultValue={String(settings.auditRetentionDays)} />
              <Input name="anonymizePiiAfterDays" type="number" label="Anonymize PII after (days, blank = never)"
                     defaultValue={settings.anonymizePiiAfterDays != null ? String(settings.anonymizePiiAfterDays) : ""} />
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Feature defaults */}
          <Card id="features" title="Feature defaults"
                hint="Which features are ON for new tenants by default. Per-tenant overrides happen on the tenant detail page.">
            <form action={saveFeatureDefaults} className="space-y-2">
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {FEATURE_DEFAULT_CATALOG.map((f) => (
                  <li key={f.key} className="flex flex-wrap items-center gap-3 py-2">
                    <label className="flex flex-1 items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                      <input type="checkbox" name={`feat_${f.key}`} defaultChecked={features[f.key] ?? f.defaultOn} />
                      <span>
                        <strong>{f.label}</strong>
                        <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{f.description}</span>
                      </span>
                    </label>
                    <Pill tone={(features[f.key] ?? f.defaultOn)
                      ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" }
                      : { bg: "var(--surface-2)", fg: "var(--text-muted)" }}
                      label={(features[f.key] ?? f.defaultOn) ? "Default ON" : "Default OFF"} />
                  </li>
                ))}
              </ul>
              <SaveRow canManage={canManage} updatedBy={settings.updatedByEmail} updatedAt={settings.updatedAt} />
            </form>
          </Card>

          {/* Activity */}
          <Card id="activity" title="Activity"
                hint="Every save lands here, scoped to the section that changed.">
            {changes.length === 0
              ? <Empty>No changes recorded yet.</Empty>
              : (
                <ol className="space-y-2">
                  {changes.map((c) => (
                    <li key={c.id} className="rounded-lg border p-3"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <Pill tone={{ bg: "var(--sky-100)", fg: "var(--sky-700)" }} label={c.section} />
                        <span style={{ color: "var(--text-default)" }}>{c.actorEmail}</span>
                        <span style={{ color: "var(--text-muted)" }}>· {relativeFromNow(c.createdAt)}</span>
                        <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {shortDateTime(c.createdAt)}
                        </span>
                      </div>
                      {c.changedFields.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                          {c.changedFields.map((f) => (
                            <code key={f} className="rounded px-1 py-0.5"
                                  style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>{f}</code>
                          ))}
                        </div>
                      )}
                      {c.note && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{c.note}</div>}
                    </li>
                  ))}
                </ol>
              )}
          </Card>
        </div>
      </section>
    </main>
  );
}

/* ── Reusable card + save row ──────────────────────────── */

function Card({
  id, title, hint, children,
}: {
  id: string; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
        {hint && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SaveRow({
  canManage, updatedBy, updatedAt,
}: {
  canManage: boolean;
  updatedBy: string | null;
  updatedAt: Date;
}) {
  return (
    <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"
         style={{ borderColor: "var(--border-subtle)" }}>
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
        Last updated by <strong style={{ color: "var(--text-default)" }}>{updatedBy ?? "system"}</strong>
        {" · "}{relativeFromNow(updatedAt)}
      </span>
      {canManage ? (
        <button type="submit"
                className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
          Save section
        </button>
      ) : (
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Read-only</span>
      )}
    </div>
  );
}

/* ── Reusable UI primitives ────────────────────────────── */

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
  type?: "text" | "number" | "email" | "tel" | "url" | "date" | "datetime-local";
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
