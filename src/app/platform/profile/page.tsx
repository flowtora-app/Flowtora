import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  changePassword,
  start2faSetup,
  verify2faSetup,
  disable2fa,
  regenerateRecoveryCodes,
  revokeAllSessions,
} from "@/app/actions/account-security";
import { updatePlatformProfile, updateThemePreference } from "@/app/actions/platform";
import { totpUri } from "@/lib/security";
import { PasswordField } from "@/components/auth/PasswordField";

// /platform/profile — admin self-service profile + preferences + security.
//
// Phase 23: this is the platform admin's "me" page. It mirrors the
// tenant-side /t/[slug]/settings/security but is scoped to platform staff
// and adds personal preferences (theme) + profile fields (bio, timezone).
//
// The security actions are shared with the tenant page (account-security.ts)
// — no duplication. backTo is threaded so errors and one-shot data (new
// recovery codes, TOTP setup) flow back to this page.

export const dynamic = "force-dynamic";

const BACK_TO = "/platform/profile";

export default async function PlatformProfilePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ok?: string;
    setup?: string;
    codes?: string;
    rotated?: string;
  }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      email: true,
      name: true,
      bio: true,
      timezone: true,
      themePreference: true,
      twoFactorEnabled: true,
      lastLoginAt: true,
      platformRole: true,
      createdAt: true,
    },
  });
  if (!user) redirect("/login");

  // Active sessions + recent security events for the security tab.
  const now = new Date();
  const [activeSessions, recentSecurity, twoFactor] = await Promise.all([
    db.session.count({ where: { userId: user.id, expires: { gt: now } } }),
    db.securityEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        kind: true,
        createdAt: true,
        ipAddress: true,
      },
    }),
    db.userTwoFactor.findUnique({
      where: { userId: user.id },
      select: { secret: true, verifiedAt: true },
    }),
  ]);

  // ── 2FA setup state ──
  // The setup ribbon shows on first ?setup=1; on success the action
  // redirects back without that flag.
  const setupMode = sp.setup === "1" && twoFactor?.secret && !twoFactor.verifiedAt;
  const totpAuthUri = setupMode && twoFactor?.secret
    ? totpUri({ secret: twoFactor.secret, accountName: user.email, issuer: "Flowtora Platform" })
    : null;
  const newRecoveryCodes = sp.codes ? sp.codes.split(",").filter(Boolean) : null;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Your profile
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Personal info, preferences, and security for your platform staff account.
            Tenant-side accounts manage themselves under each workspace's settings.
          </p>
        </div>
        <RoleBadge role={user.platformRole ?? "STAFF"} />
      </div>

      {/* ── Banners ────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body={
          sp.ok === "profile_saved" ? "Profile updated."
          : sp.ok === "theme_saved"   ? "Theme preference saved."
          : sp.ok === "password"      ? "Password changed. Other sessions have been signed out."
          : sp.ok === "2fa_enabled"   ? "Two-factor auth enabled. Save your recovery codes."
          : sp.ok === "2fa_disabled"  ? "Two-factor auth disabled."
          : sp.ok === "sessions"      ? "All other sessions have been signed out."
          : "Saved."
        } />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}
      {sp.rotated === "1" && (
        <Banner
          tone="warning"
          title="New recovery codes generated"
          body="Old codes are no longer valid. Save these somewhere safe before leaving the page."
        />
      )}

      {/* ── Identity ───────────────────────────────────── */}
      <Section
        title="Identity"
        description="Email is your platform staff identity — change requires re-verification through the support team."
      >
        <form action={updatePlatformProfile} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Display name" name="name" defaultValue={user.name ?? ""} placeholder="e.g. Hugo Morales" maxLength={120} />
            <FormField label="Email (read-only)" defaultValue={user.email} disabled mono />
            <FormField
              label="Timezone (IANA)"
              name="timezone"
              defaultValue={user.timezone ?? ""}
              placeholder="e.g. America/Los_Angeles"
              hint='e.g. "America/Los_Angeles", "Europe/London". Drives "your local time" displays.'
              maxLength={60}
            />
            <FormField label="Member since" defaultValue={user.createdAt.toISOString().slice(0, 10)} disabled mono />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
              Short bio
            </span>
            <textarea
              name="bio"
              defaultValue={user.bio ?? ""}
              rows={3}
              maxLength={500}
              placeholder="One or two lines about your role — surfaced on the team directory in future."
              className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save profile
            </button>
          </div>
        </form>
      </Section>

      {/* ── Preferences ────────────────────────────────── */}
      <Section
        title="Preferences"
        description="UI customization. Theme follows your OS by default."
      >
        <form action={updateThemePreference} className="space-y-3">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Theme
          </span>
          <div className="grid grid-cols-3 gap-2 max-w-md">
            {(["AUTO", "LIGHT", "DARK"] as const).map((opt) => {
              const active = user.themePreference === opt;
              return (
                <label
                  key={opt}
                  className="ts-focus flex items-center gap-2 rounded-lg p-3 text-sm cursor-pointer transition-colors"
                  style={{
                    background: active ? "var(--accent-surface)" : "var(--surface-1)",
                    border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                  }}
                >
                  <input
                    type="radio"
                    name="themePreference"
                    value={opt}
                    defaultChecked={active}
                  />
                  <span style={{ color: active ? "var(--accent-primary)" : "var(--text-default)" }}>
                    {opt === "AUTO" ? "🖥 Auto" : opt === "LIGHT" ? "☀ Light" : "🌙 Dark"}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save preference
            </button>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            AUTO follows your OS. The theme switcher reaches every page on next reload.
          </p>
        </form>
      </Section>

      {/* ── Security: Password ─────────────────────────── */}
      <Section title="Change password" description="Picks a new password and signs you out of every other session.">
        <form action={changePassword.bind(null, BACK_TO)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <PasswordField
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
            <div />
            <PasswordField
              label="New password"
              name="newPassword"
              autoComplete="new-password"
              required
            />
            <PasswordField
              label="Confirm new password"
              name="confirmPassword"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Change password
            </button>
          </div>
        </form>
      </Section>

      {/* ── Security: Two-factor ───────────────────────── */}
      <Section
        title="Two-factor authentication"
        description="Adds a TOTP code on top of your password. Strongly recommended for super-admin accounts."
      >
        {newRecoveryCodes && (
          <div
            className="mb-4 rounded-lg p-4"
            style={{
              background: "var(--warning-surface)",
              border: "1px solid var(--warning-fg)",
            }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--warning-fg)" }}>
              Save these recovery codes
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Each code works once if you lose your authenticator. They will not be shown again.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm" style={{ color: "var(--text-default)" }}>
              {newRecoveryCodes.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        )}

        {!user.twoFactorEnabled && !setupMode && (
          <form action={start2faSetup.bind(null, `${BACK_TO}?setup=1`)}>
            <p className="mb-3 text-sm" style={{ color: "var(--text-muted)" }}>
              2FA is currently <b style={{ color: "var(--danger-fg)" }}>off</b>. Click below to set up an
              authenticator app.
            </p>
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Enable two-factor auth
            </button>
          </form>
        )}

        {setupMode && totpAuthUri && (
          <form action={verify2faSetup.bind(null, BACK_TO)} className="space-y-3">
            <p className="text-sm" style={{ color: "var(--text-default)" }}>
              Scan this URI with Google Authenticator, 1Password, or any TOTP app, then enter the
              6-digit code it shows to confirm.
            </p>
            <div
              className="rounded-md p-3 font-mono text-xs break-all"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              {totpAuthUri}
            </div>
            <FormField
              label="6-digit code"
              name="token"
              required
              maxLength={6}
              placeholder="123456"
              mono
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                Verify and enable
              </button>
            </div>
          </form>
        )}

        {user.twoFactorEnabled && !setupMode && (
          <div className="space-y-4">
            <div
              className="flex items-center justify-between gap-3 rounded-md px-4 py-3"
              style={{
                background: "var(--success-surface)",
                border: "1px solid var(--success-fg)",
              }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--success-fg)" }}>
                  ✓ 2FA is enabled
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Verified {twoFactor?.verifiedAt?.toISOString().slice(0, 10) ?? "—"}.
                </div>
              </div>
              <form action={regenerateRecoveryCodes.bind(null, BACK_TO)}>
                <button
                  type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--text-default)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  New recovery codes
                </button>
              </form>
            </div>
            <form action={disable2fa.bind(null, BACK_TO)} className="space-y-3">
              <PasswordField
                label="Confirm with current password to disable"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
                  style={{
                    background: "var(--danger-surface)",
                    color: "var(--danger-fg)",
                    border: "1px solid var(--danger-fg)",
                  }}
                >
                  Disable 2FA
                </button>
              </div>
            </form>
          </div>
        )}
      </Section>

      {/* ── Sessions ──────────────────────────────────── */}
      <Section
        title={`Active sessions (${activeSessions})`}
        description="Each browser / device you've signed into. Sign out everywhere if you suspect a session is yours but you don't recognize it."
      >
        <form action={revokeAllSessions.bind(null, BACK_TO)} className="flex items-center justify-between gap-3">
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            <b style={{ color: "var(--text-default)" }} className="tabular-nums">
              {activeSessions}
            </b>{" "}
            session{activeSessions === 1 ? "" : "s"} currently signed in. The current session is preserved;
            every other one is invalidated.
          </div>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            Sign out all other sessions
          </button>
        </form>
      </Section>

      {/* ── Login history ──────────────────────────────── */}
      <Section
        title="Recent security events"
        description="Last 12 events on your account. Review for anything unfamiliar."
      >
        {recentSecurity.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No recent security events recorded.
          </p>
        ) : (
          <ol className="-mx-5 -mb-5">
            {recentSecurity.map((e, idx) => {
              const tone = securityKindTone(e.kind);
              return (
                <li
                  key={e.id}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tone.color }}>
                      {tone.label}
                    </span>
                    {e.ipAddress && (
                      <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                        from {e.ipAddress}
                      </span>
                    )}
                  </div>
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Need to manage your tenant-side workspaces? Use{" "}
        <Link href="/platform/tenants" className="underline">/platform/tenants</Link> for cross-tenant
        admin work, or sign into your own workspace for tenant settings.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function securityKindTone(kind: string): { color: string; label: string } {
  if (kind === "LOGIN_SUCCESS")               return { color: "var(--success-fg)",     label: "Login success" };
  if (kind === "LOGIN_FAILED")                return { color: "var(--warning-fg)",     label: "Login failed" };
  if (kind === "LOGIN_LOCKED")                return { color: "var(--danger-fg)",      label: "Locked out" };
  if (kind === "PASSWORD_CHANGED")            return { color: "var(--accent-primary)", label: "Password changed" };
  if (kind === "TWO_FACTOR_ENABLED")          return { color: "var(--success-fg)",     label: "2FA enabled" };
  if (kind === "TWO_FACTOR_DISABLED")         return { color: "var(--warning-fg)",     label: "2FA disabled" };
  if (kind === "TWO_FACTOR_CHALLENGE_FAILED") return { color: "var(--danger-fg)",      label: "2FA challenge failed" };
  return { color: "var(--text-muted)", label: kind.replace(/_/g, " ").toLowerCase() };
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
      style={{
        background: "var(--accent-surface)",
        color: "var(--accent-primary)",
        border: "1px solid var(--accent-primary)",
      }}
    >
      {role.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FormField({
  label,
  name,
  defaultValue,
  placeholder,
  required,
  maxLength,
  disabled,
  mono,
  hint,
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        className={`ts-focus w-full rounded-md px-3 py-2 text-sm outline-none ${mono ? "font-mono text-xs" : ""}`}
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
          opacity: disabled ? 0.7 : 1,
        }}
      />
      {hint && (
        <span className="mt-1 block text-[10px]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "warning" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  } :
    tone === "warning" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "var(--warning-fg)" } :
                          { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}
