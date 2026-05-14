// Page 72 — My Profile.
//
// Six tabs: Profile · Security · Sessions · Connected Accounts · Preferences
// · Recovery Codes. Spec route is /admin/me/profile — we mount at
// /platform/me/profile to match our platform/* prefix.

import * as React from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  saveMyProfile, saveMyPreferences,
} from "@/app/actions/platform-me";
import {
  changePassword,
  start2faSetup,
  verify2faSetup,
  disable2fa,
  regenerateRecoveryCodes,
  revokeAllSessions,
} from "@/app/actions/account-security";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["profile", "security", "sessions", "connected", "preferences", "recovery"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  profile:     "Profile",
  security:    "Security",
  sessions:    "Sessions",
  connected:   "Connected Accounts",
  preferences: "Preferences",
  recovery:    "Recovery Codes",
};

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Asia/Tokyo", "Asia/Hong_Kong", "Asia/Singapore", "Asia/Dubai",
  "Australia/Sydney", "Australia/Melbourne",
];

const LANGUAGES = [
  "en-US", "en-GB", "es-MX", "es-ES", "fr-FR", "de-DE",
  "pt-BR", "it-IT", "ja-JP", "zh-CN", "ar-SA", "nl-NL",
];

export default async function MyProfilePage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab as string)
    ? (sp.tab as Tab) : "profile";
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const setupSecret = asString(sp.setup);
  const newCodes = asString(sp.codes);

  const me = await db.user.findUnique({
    where: { id: ctx.userId },
    include: {
      sessions: { orderBy: { lastUsedAt: "desc" }, take: 30 },
      accounts: true,
      twoFactor: true,
    },
  });

  if (!me) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Profile not found</h1>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          My profile
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Personal account settings, security posture, and admin UI preferences.
        </p>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}
      {newCodes && (
        <Banner tone="success">
          New recovery codes (save these — they won&apos;t be shown again):
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">{decodeURIComponent(newCodes)}</pre>
        </Banner>
      )}

      {/* Tab nav */}
      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/platform/me/profile?tab=${t}`}
            className="rounded-t-md px-3 py-2 text-xs font-medium"
            style={{
              background: tab === t ? "var(--accent-primary)" : "transparent",
              color: tab === t ? "var(--accent-fg)" : "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
              borderBottom: tab === t ? "1px solid var(--accent-primary)" : "1px solid transparent",
            }}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {/* Tab: Profile */}
      {tab === "profile" && (
        <Card title="Profile" description="Visible to other admins on the Users + Team pages.">
          <form action={saveMyProfile} className="space-y-3 px-5 py-5">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Display name" name="name" defaultValue={me.name ?? ""} maxLength={120} />
              <FormField label="Pronouns" name="pronouns" defaultValue={me.pronouns ?? ""} maxLength={40} placeholder="they/them" />
              <FormField label="First name" name="firstName" defaultValue={me.firstName ?? ""} maxLength={80} />
              <FormField label="Last name" name="lastName" defaultValue={me.lastName ?? ""} maxLength={80} />
              <FormField label="Title" name="title" defaultValue={me.title ?? ""} maxLength={120} />
              <FormField label="Department" name="department" defaultValue={me.department ?? ""} maxLength={120} />
              <FormField label="Phone" name="phone" defaultValue={me.phone ?? ""} maxLength={40} placeholder="+1 415 555 0123" />
              <FormField label="Slack handle" name="slackHandle" defaultValue={me.slackHandle ?? ""} maxLength={80} placeholder="@you" />
              <FormField label="Primary email (locked)" name="primaryEmailLocked" defaultValue={me.email} disabled hint="Change via Auth settings." />
              <FormField label="Secondary email" name="secondaryEmail" type="email" defaultValue={me.secondaryEmail ?? ""} maxLength={200} />
              <Field label="Timezone">
                <select name="timezone" defaultValue={me.timezone ?? ""}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="">— pick —</option>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </Field>
              <Field label="Language">
                <select name="language" defaultValue={me.language ?? ""}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="">— pick —</option>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <FormField label="Date format" name="dateFormat" defaultValue={me.dateFormat ?? ""} maxLength={40} placeholder="MM/DD/YYYY" />
              <FormField label="Time format" name="timeFormat" defaultValue={me.timeFormat ?? ""} maxLength={40} placeholder="h:mm A" />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm">Bio</span>
              <textarea name="bio" defaultValue={me.bio ?? ""} rows={4} maxLength={1000}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </label>
            <div className="flex justify-end">
              <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                Save profile
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab: Security */}
      {tab === "security" && (
        <div className="space-y-4">
          <Card title="Change password" description="Use a strong unique password. We check against breached-credential lists.">
            <form action={changePassword.bind(null, "/platform/me/profile?tab=security")} className="space-y-3 px-5 py-5">
              <FormField label="Current password" name="currentPassword" type="password" required />
              <FormField label="New password" name="newPassword" type="password" required hint="Minimum 12 characters; mix of cases, digits, symbols recommended." />
              <FormField label="Confirm new password" name="confirmPassword" type="password" required />
              <div className="flex justify-end">
                <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                  Update password
                </button>
              </div>
            </form>
          </Card>
          <Card title="Two-factor authentication" description={me.twoFactorEnabled ? "MFA is enabled. Disabling requires a password." : "Set up TOTP-based MFA (Authy, 1Password, Google Authenticator)."}>
            <div className="px-5 py-5">
              {!me.twoFactorEnabled && !setupSecret && (
                <form action={start2faSetup.bind(null, "/platform/me/profile?tab=security")}>
                  <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                    Begin TOTP setup
                  </button>
                </form>
              )}
              {setupSecret && (
                <form action={verify2faSetup.bind(null, "/platform/me/profile?tab=security")} className="space-y-3">
                  <input type="hidden" name="secret" value={decodeURIComponent(setupSecret)} />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Add this secret to your authenticator app, then enter the current 6-digit code:
                  </p>
                  <pre className="rounded-md px-3 py-2 font-mono text-xs"
                    style={{ background: "var(--surface-2)" }}>{decodeURIComponent(setupSecret)}</pre>
                  <FormField label="6-digit code" name="code" required maxLength={6} />
                  <div className="flex justify-end">
                    <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                      Verify + enable
                    </button>
                  </div>
                </form>
              )}
              {me.twoFactorEnabled && (
                <form action={disable2fa.bind(null, "/platform/me/profile?tab=security")} className="space-y-3">
                  <FormField label="Current password" name="password" type="password" required />
                  <div className="flex justify-end">
                    <button type="submit" className="rounded-md px-3 py-2 text-xs"
                      style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}>
                      Disable MFA
                    </button>
                  </div>
                </form>
              )}
            </div>
          </Card>
          <Card title="Sign out everywhere" description="Revoke every session except the one you're using now.">
            <form action={revokeAllSessions.bind(null, "/platform/me/profile?tab=sessions")} className="px-5 py-5">
              <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                style={{ background: "var(--rose-100)", color: "var(--rose-700)", border: "1px solid var(--rose-300)" }}>
                Sign out all sessions
              </button>
            </form>
          </Card>
        </div>
      )}

      {/* Tab: Sessions */}
      {tab === "sessions" && (
        <Card title="Active sessions" description="Devices currently signed into your account. Revoking 'Sign out everywhere' is on the Security tab.">
          <ul>
            {me.sessions.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No active sessions recorded.
              </li>
            )}
            {me.sessions.map((s) => (
              <li key={s.id} className="grid grid-cols-1 gap-3 px-5 py-3 text-sm md:grid-cols-[1fr_140px_120px_120px]"
                style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div>
                  <div className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {s.userAgent ? s.userAgent.slice(0, 80) : "Unknown UA"}
                  </div>
                  <div className="mt-0.5 text-xs">{s.ipAddress ?? "(no IP)"}</div>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Created {relativeFromNow(s.createdAt)}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Active {relativeFromNow(s.lastUsedAt ?? s.createdAt)}
                </span>
                <span className="text-xs">{s.expires ? `Expires ${relativeFromNow(s.expires)}` : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Tab: Connected Accounts */}
      {tab === "connected" && (
        <Card title="Connected accounts" description="External identities linked to this admin account.">
          <ul>
            {me.accounts.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No external accounts linked.
              </li>
            )}
            {me.accounts.map((a) => (
              <li key={a.id} className="grid grid-cols-[1fr_120px_140px] gap-3 px-5 py-3 text-sm"
                style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="font-medium">{a.provider}</div>
                <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>{a.type}</span>
                <span className="text-xs" style={{ color: "var(--text-faint)" }}>
                  {a.providerAccountId.slice(0, 16)}…
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Tab: Preferences */}
      {tab === "preferences" && (
        <Card title="UI preferences" description="Saved per device-independent profile — applies everywhere you sign in.">
          <form action={saveMyPreferences} className="space-y-3 px-5 py-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Theme">
                <select name="themePreference" defaultValue={me.themePreference}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="AUTO">Auto (system)</option>
                  <option value="LIGHT">Light</option>
                  <option value="DARK">Dark</option>
                </select>
              </Field>
              <Field label="Density">
                <select name="density" defaultValue={me.density}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="COMFORTABLE">Comfortable</option>
                  <option value="COMPACT">Compact</option>
                </select>
              </Field>
              <Field label="Sidebar default">
                <select name="sidebarDefault" defaultValue={me.sidebarDefault}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="EXPANDED">Expanded</option>
                  <option value="COLLAPSED">Collapsed</option>
                </select>
              </Field>
              <FormField label="Default landing page" name="defaultLanding" defaultValue={me.defaultLanding ?? ""} maxLength={120} placeholder="/platform" hint="Path after sign-in." />
              <FormField label="Auto-refresh dashboard (seconds)" name="autoRefreshSec" type="number" defaultValue={me.autoRefreshSec.toString()} hint="0 = off. 60–600 reasonable." />
              <FormField label="Currency display" name="currencyDisplay" defaultValue={me.currencyDisplay ?? ""} maxLength={10} placeholder="USD" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="betaFeaturesOptIn" defaultChecked={me.betaFeaturesOptIn} className="h-4 w-4" />
              <span>Opt into beta features</span>
            </label>
            <div className="flex justify-end">
              <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                Save preferences
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab: Recovery Codes */}
      {tab === "recovery" && (
        <Card title="Recovery codes" description="10 single-use codes used to recover the account if you lose your MFA device. Regenerating invalidates the old set.">
          <div className="px-5 py-5">
            {me.twoFactorEnabled ? (
              <form action={regenerateRecoveryCodes.bind(null, "/platform/me/profile?tab=recovery")} className="space-y-3">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Click below to generate a new set of 10 codes. Store them in a password manager.
                </p>
                <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                  Generate new codes
                </button>
              </form>
            ) : (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Recovery codes are only available once MFA is enabled. Set up 2FA on the Security tab first.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      {children}
    </label>
  );
}

function FormField({ label, name, type = "text", defaultValue, required, placeholder, maxLength, hint, disabled }: {
  label: string; name: string; type?: string; defaultValue?: string; required?: boolean;
  placeholder?: string; maxLength?: number; hint?: string; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      <input type={type} name={name} defaultValue={defaultValue} required={required} placeholder={placeholder}
        maxLength={maxLength} disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", opacity: disabled ? 0.6 : 1 }} />
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
