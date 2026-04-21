import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { totpUri } from "@/lib/security";
import { Card, CardHeader } from "@/components/Card";
import { PasswordField } from "@/components/auth/PasswordField";
import {
  changePassword,
  requestEmailChange,
  start2faSetup,
  verify2faSetup,
  disable2fa,
  regenerateRecoveryCodes,
  revokeAllSessions,
  sendInitialVerification,
} from "@/app/actions/account-security";

// Phase 2 — Account → Security settings.
//
// Single canonical page for everything the signed-in user can do to
// harden their own account:
//
//   • Change password
//   • Change email (sends verification to new address)
//   • Enable/disable two-factor auth (TOTP)
//   • Manage recovery codes
//   • Sign out all other sessions
//   • Review recent security events (login, password change, 2FA, etc.)
//
// The page lives under /t/[slug]/settings because that's where the rest
// of settings lives — but the actions themselves are user-scoped, not
// tenant-scoped. `backTo` is threaded through each action so errors and
// one-time data (like new recovery codes) flow back to *this* page.

export const dynamic = "force-dynamic";

type SP = {
  error?: string;
  ok?: string;
  codes?: string;
  setup?: string; // "1" means show the TOTP setup panel
};

export default async function SecuritySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  // Rely on requireTenant for the tenant membership check; the actions
  // themselves don't need it — they're user-scoped — but the rest of
  // the settings chrome expects us to be inside a tenant context.
  const { tenant } = await requireTenant(slug);

  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { twoFactor: true },
  });
  if (!user) redirect("/login");

  const events = await db.securityEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const backTo = `/t/${slug}/settings/security`;
  const twoFaEnabled = user.twoFactorEnabled && !!user.twoFactor?.verifiedAt;
  const twoFaPending = !!user.twoFactor && !user.twoFactor.verifiedAt;
  const otpauth =
    user.twoFactor && !user.twoFactor.verifiedAt
      ? totpUri({
          accountName: user.email,
          issuer: `Flowtora (${tenant.name})`,
          secret: user.twoFactor.secret,
        })
      : null;

  const codes = sp.codes ? decodeURIComponent(sp.codes).split(",") : null;

  return (
    <div className="space-y-6">
      {/* Flash messages. Success / error / fresh-recovery-codes are each
          one-off events so we render them at the top and let the page
          underneath stay "steady state". */}
      {sp.ok && (
        <FlashBanner tone="success">{decodeURIComponent(sp.ok)}</FlashBanner>
      )}
      {sp.error && (
        <FlashBanner tone="danger">{decodeURIComponent(sp.error)}</FlashBanner>
      )}
      {codes && <RecoveryCodesCard codes={codes} />}

      {/* Email + verification status */}
      <Card>
        <CardHeader
          title="Account email"
          description="Used for sign-in, security alerts, and password recovery."
        />
        <div className="space-y-5 px-5 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                {user.email}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {user.emailVerified
                  ? `Verified ${user.emailVerified.toLocaleDateString()}`
                  : "Not verified yet — some features stay read-only until you confirm."}
              </div>
            </div>
            {!user.emailVerified && (
              <form action={sendInitialVerification}>
                <SmallButton>Resend verification</SmallButton>
              </form>
            )}
          </div>

          <form
            action={requestEmailChange.bind(null, backTo)}
            className="grid grid-cols-1 gap-3 border-t pt-5 sm:grid-cols-[1fr_auto]"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <Input
              label="New email address"
              name="newEmail"
              type="email"
              autoComplete="email"
              required
            />
            <Input
              label="Current password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
            <div className="sm:col-span-2 flex justify-end">
              <PrimaryButton>Send confirmation link</PrimaryButton>
            </div>
          </form>
        </div>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader
          title="Password"
          description="You'll be signed out of every device after you change it."
        />
        {/* Vertical stack — the 3-col grid was cramped once the
            new-password field grew a strength meter + checklist.
            `PasswordField` renders with its own internal label. */}
        <form
          action={changePassword.bind(null, backTo)}
          className="flex flex-col gap-5 px-5 py-5"
        >
          <PasswordField
            label="Current password"
            name="currentPassword"
            autoComplete="current-password"
            showStrength={false}
            enforceMinLength={false}
          />
          <PasswordField
            label="New password"
            name="newPassword"
          />
          <PasswordField
            label="Confirm new password"
            name="confirmPassword"
            showStrength={false}
          />
          <div className="flex justify-end">
            <PrimaryButton>Change password</PrimaryButton>
          </div>
        </form>
      </Card>

      {/* Two-factor */}
      <Card>
        <CardHeader
          title="Two-factor authentication"
          description={
            twoFaEnabled
              ? "Enabled — a 6-digit code is required at every sign-in."
              : "Require a 6-digit code from an authenticator app in addition to your password."
          }
          right={
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                background: twoFaEnabled
                  ? "var(--success-surface)"
                  : "var(--surface-2)",
                color: twoFaEnabled
                  ? "var(--success-fg)"
                  : "var(--text-muted)",
                border: `1px solid ${twoFaEnabled ? "var(--success-fg)" : "var(--border-subtle)"}`,
              }}
            >
              {twoFaEnabled ? "On" : twoFaPending ? "Setup in progress" : "Off"}
            </span>
          }
        />
        <div className="px-5 py-5">
          {!twoFaEnabled && !twoFaPending && (
            <form action={start2faSetup.bind(null, `${backTo}?setup=1`)}>
              <PrimaryButton>Set up two-factor auth</PrimaryButton>
              <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                Works with Google Authenticator, 1Password, Authy, Bitwarden,
                and any other TOTP app.
              </p>
            </form>
          )}

          {twoFaPending && otpauth && (
            <TotpSetupPanel
              secret={user.twoFactor!.secret}
              otpauth={otpauth}
              verifyAction={verify2faSetup.bind(null, backTo)}
            />
          )}

          {twoFaEnabled && (
            <div className="space-y-5">
              <div
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {user.twoFactor?.recoveryCodeHashes.length ?? 0} recovery
                {" "}code{user.twoFactor?.recoveryCodeHashes.length === 1 ? "" : "s"}{" "}
                remaining. Use one only if you lose access to your authenticator.
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={regenerateRecoveryCodes.bind(null, backTo)}>
                  <SmallButton>Regenerate recovery codes</SmallButton>
                </form>
                <form
                  action={disable2fa.bind(null, backTo)}
                  className="flex items-end gap-2"
                >
                  <Input
                    label="Current password"
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    compact
                  />
                  <DangerButton>Disable 2FA</DangerButton>
                </form>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader
          title="Active sessions"
          description="Sign out of every device that's currently signed in — including this one."
        />
        <div className="flex items-center justify-between px-5 py-5">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Last sign-in: {user.lastLoginAt ? user.lastLoginAt.toLocaleString() : "—"}
          </p>
          <form action={revokeAllSessions.bind(null, backTo)}>
            <DangerButton>Sign out everywhere</DangerButton>
          </form>
        </div>
      </Card>

      {/* Activity log */}
      <Card>
        <CardHeader
          title="Recent security activity"
          description="Every sign-in, password change, and 2FA event for your account."
        />
        <div className="px-5 py-4">
          {events.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No activity yet.
            </p>
          ) : (
            <ul
              className="divide-y text-sm"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between py-3">
                  <div>
                    <div
                      className="font-medium"
                      style={{ color: "var(--text-default)" }}
                    >
                      {formatEventKind(e.kind)}
                    </div>
                    <div
                      className="mt-0.5 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {[e.ipAddress, e.userAgent].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div
                    className="shrink-0 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {e.createdAt.toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Local UI primitives — this page uses its own styled inputs/buttons
// because the shared Field/Button use a slightly different token set
// (`--accent` vs `--accent-primary`) and the Account surface is
// premium-tier chrome.
// ────────────────────────────────────────────────────────────

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    compact?: boolean;
  },
) {
  const { label, compact, ...rest } = props;
  return (
    <label className="block">
      <span
        className="mb-1 block text-xs font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <input
        {...rest}
        className={`ts-focus w-full rounded-md px-3 text-sm outline-none ${compact ? "py-1.5" : "py-2"}`}
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
    </label>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="ts-focus rounded-md px-4 py-2 text-sm font-medium transition-colors hover:brightness-110"
      style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
    >
      {children}
    </button>
  );
}

function SmallButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-default)",
        border: "1px solid var(--border-default)",
      }}
    >
      {children}
    </button>
  );
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
      style={{
        background: "var(--danger-surface)",
        color: "var(--danger-fg)",
        border: "1px solid var(--danger-fg)",
      }}
    >
      {children}
    </button>
  );
}

function FlashBanner({
  tone,
  children,
}: {
  tone: "success" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className="rounded-md px-4 py-3 text-sm"
      style={{
        background: tone === "success" ? "var(--success-surface)" : "var(--danger-surface)",
        color: tone === "success" ? "var(--success-fg)" : "var(--danger-fg)",
        border: `1px solid ${tone === "success" ? "var(--success-fg)" : "var(--danger-fg)"}`,
      }}
    >
      {children}
    </div>
  );
}

function RecoveryCodesCard({ codes }: { codes: string[] }) {
  return (
    <Card>
      <CardHeader
        title="Save your recovery codes"
        description="Each code works once. Store them somewhere you'll find if you lose your phone."
      />
      <div className="px-5 py-5">
        <div
          className="grid grid-cols-2 gap-2 rounded-md p-4 font-mono text-sm"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {codes.map((c) => (
            <div key={c} style={{ color: "var(--text-default)" }}>
              {c}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs" style={{ color: "var(--warning-fg)" }}>
          This is the only time we&apos;ll show these. You can regenerate a
          fresh set, which invalidates any codes you haven&apos;t used.
        </p>
      </div>
    </Card>
  );
}

function TotpSetupPanel({
  secret,
  otpauth,
  verifyAction,
}: {
  secret: string;
  otpauth: string;
  verifyAction: (formData: FormData) => void | Promise<void>;
}) {
  // We intentionally don't embed a QR code (would pull in another dep).
  // Users scan the otpauth:// URI from their authenticator directly, or
  // paste the secret by hand.
  return (
    <div className="space-y-5">
      <ol
        className="space-y-3 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        <li>
          <span style={{ color: "var(--text-default)" }}>1.</span> Open your
          authenticator app and add a new account.
        </li>
        <li>
          <span style={{ color: "var(--text-default)" }}>2.</span> Scan this
          URL, or paste the secret manually:
        </li>
      </ol>
      <div
        className="rounded-md p-4"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Secret
            </div>
            <div
              className="break-all font-mono text-sm"
              style={{ color: "var(--text-default)" }}
            >
              {secret}
            </div>
          </div>
          <a
            href={otpauth}
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: "var(--accent-surface)",
              color: "var(--accent-primary)",
              border: "1px solid var(--accent-primary)",
            }}
          >
            Open in authenticator
          </a>
        </div>
      </div>
      <form action={verifyAction} className="flex items-end gap-3">
        <Input
          label="Enter the 6-digit code"
          name="code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          required
          compact
        />
        <PrimaryButton>Verify and turn on</PrimaryButton>
      </form>
    </div>
  );
}

function formatEventKind(kind: string): string {
  const map: Record<string, string> = {
    LOGIN_SUCCESS: "Signed in",
    LOGIN_FAILED: "Sign-in failed",
    LOGIN_LOCKED: "Account locked (too many attempts)",
    LOGOUT: "Signed out",
    PASSWORD_CHANGED: "Password changed",
    PASSWORD_RESET_REQUESTED: "Password reset requested",
    PASSWORD_RESET_COMPLETED: "Password reset completed",
    EMAIL_CHANGE_REQUESTED: "Email change requested",
    EMAIL_CHANGE_COMPLETED: "Email change completed",
    EMAIL_VERIFIED: "Email verified",
    TWO_FACTOR_ENABLED: "2FA enabled",
    TWO_FACTOR_DISABLED: "2FA disabled",
    TWO_FACTOR_CHALLENGE_OK: "2FA code accepted",
    TWO_FACTOR_CHALLENGE_FAILED: "2FA code rejected",
    RECOVERY_CODE_USED: "Recovery code used",
    SESSIONS_REVOKED: "All sessions revoked",
  };
  return map[kind] ?? kind;
}
