import Link from "next/link";
import type { Metadata } from "next";
import { loginAction, requestMagicLinkAction } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Sign in — Flowtora",
  description: "Sign in to your Flowtora account.",
};

// Phase 2 — expanded search-param surface.
//
//   error=credentials   bad email/password
//   error=locked        account temporarily locked (5 bad attempts)
//   reset=1             just completed a password reset
//   password_changed=1  just changed password in settings
//   email_changed=1     just confirmed an email change
//   signed_out_everywhere=1  revoked all sessions
//   verified=1          just confirmed initial email
//   email               pre-fill after a redirect (e.g. from lockout)
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
    email?: string;
    reset?: string;
    password_changed?: string;
    email_changed?: string;
    signed_out_everywhere?: string;
    verified?: string;
    magic_link_sent?: string;
  }>;
}) {
  const sp = await searchParams;

  const banner = (() => {
    if (sp.reset === "1") return { tone: "success" as const, text: "Your password has been reset. Sign in with your new password." };
    if (sp.password_changed === "1") return { tone: "success" as const, text: "Password changed. Sign in with your new password." };
    if (sp.email_changed === "1") return { tone: "success" as const, text: "Email updated. Sign in with your new address." };
    if (sp.signed_out_everywhere === "1") return { tone: "info" as const, text: "All sessions signed out. Sign in again to continue." };
    if (sp.verified === "1") return { tone: "success" as const, text: "Email confirmed. You're all set." };
    if (sp.magic_link_sent === "1") return {
      tone: "success" as const,
      text: sp.email
        ? `If an account exists for ${sp.email}, we've sent a sign-in link. Check your inbox — link is good for 15 minutes.`
        : "If an account exists for that email, we've sent a sign-in link. Check your inbox — link is good for 15 minutes.",
    };
    return null;
  })();

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Welcome back
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Sign in to pick up where you left off.
        </p>
      </div>

      {banner && (
        <div
          role="status"
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: banner.tone === "success" ? "var(--success-surface)" : "var(--surface-1)",
            color: banner.tone === "success" ? "var(--success-fg)" : "var(--text-default)",
            border: `1px solid ${banner.tone === "success" ? "var(--success-fg)" : "var(--border-subtle)"}`,
          }}
        >
          {banner.text}
        </div>
      )}

      <form action={loginAction} className="space-y-5">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={sp.email ?? ""}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {sp.error && (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            {sp.error === "credentials" && "Invalid email or password."}
            {sp.error === "locked" &&
              "Too many failed attempts. Your account is locked for 15 minutes. Try resetting your password instead."}
            {sp.error === "banned" &&
              "This account is unavailable. Contact support if you believe this is an error."}
            {sp.error !== "credentials" && sp.error !== "locked" && sp.error !== "banned" && "We couldn't sign you in. Try again."}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            type="submit"
            className="ts-focus inline-flex h-11 flex-1 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Sign in
          </button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <Link
            href="/forgot"
            className="font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Forgot password?
          </Link>
          <Link
            href="/signup"
            className="font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            Create an account →
          </Link>
        </div>
      </form>

      {/* Phase 1 follow-up — passwordless magic-link path. Posts to a
          separate action so the password form's required attributes
          don't block submission, and so the credentials/magic-link
          intents stay distinct in the audit trail. */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full" style={{ borderTop: "1px solid var(--border-subtle)" }} />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-2" style={{ background: "var(--surface-0)", color: "var(--text-muted)" }}>
            or
          </span>
        </div>
      </div>

      <form action={requestMagicLinkAction} className="space-y-3">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field
          label="Sign in with a one-time link"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@flowtora.com"
          defaultValue={sp.email ?? ""}
        />
        <button
          type="submit"
          className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          Email me a sign-in link
        </button>
        <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
          We'll email a one-time link. No password needed. Link expires in 15 minutes.
        </p>
      </form>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
        {label}
        {rest.required && (
          <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
            *
          </span>
        )}
      </span>
      <input
        {...rest}
        className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
    </label>
  );
}
