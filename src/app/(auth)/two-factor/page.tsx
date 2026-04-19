import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  twoFactorChallengeAction,
  cancelTwoFactorChallenge,
  readPendingTwoFactor,
} from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Two-factor verification — Tracksign",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Phase 2 — 2FA challenge page.
//
// Reached only when a user with 2FA enabled has submitted a correct
// password. The pending-login cookie encodes WHICH user — we never
// show or accept the email or password here.
//
// Accepts either a 6-digit TOTP code from the authenticator app or one
// of the user's printed recovery codes (format `ABCDE-FGHJK`).

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const pending = await readPendingTwoFactor();
  // If the cookie is missing or stale, bounce back to login — there's
  // nothing on this page we can render meaningfully.
  if (!pending) {
    redirect("/login");
  }

  const minsLeft = Math.max(
    1,
    Math.round((pending.expiresAt.getTime() - Date.now()) / 60000),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Enter your verification code
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Open your authenticator app and enter the 6-digit code for{" "}
          <strong>{pending.email}</strong>. Or paste a recovery code if you&apos;ve
          lost access to your authenticator.
        </p>
      </div>

      <form action={twoFactorChallengeAction} className="space-y-5">
        <label className="block">
          <span
            className="mb-1 block text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            6-digit code or recovery code
          </span>
          <input
            name="totpCode"
            type="text"
            autoComplete="one-time-code"
            inputMode="text"
            autoFocus
            required
            className="ts-focus w-full rounded-md px-3 py-2.5 text-base font-mono tracking-[0.3em] outline-none transition-colors"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
          <span
            className="mt-1 block text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            Code expires in {minsLeft} minute{minsLeft === 1 ? "" : "s"}.
          </span>
        </label>

        {sp.error === "bad" && (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            That code didn&apos;t match. Wait for a fresh one and try again,
            or use a recovery code.
          </div>
        )}

        <button
          type="submit"
          className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          Verify and continue
        </button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <form action={cancelTwoFactorChallenge}>
          <button
            type="submit"
            className="font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            ← Cancel and sign in again
          </button>
        </form>
        <Link
          href="/support"
          className="font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          Lost your codes?
        </Link>
      </div>
    </div>
  );
}
