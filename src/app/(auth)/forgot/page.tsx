import Link from "next/link";
import type { Metadata } from "next";
import { requestPasswordReset } from "@/app/actions/account-security";

export const metadata: Metadata = {
  title: "Reset your password — Flowtora",
  description: "Send a reset link to your Flowtora email address.",
};

// Phase 2 — password reset request.
//
// Always shows the same "check your inbox" confirmation regardless of
// whether the email was on file. The action enforces this too; we repeat
// the behavior in the UI so a curious user reading the source can't tell
// from client-side behavior whether an email exists.

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";

  if (sent) {
    return (
      <div className="space-y-6">
        <div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            Check your inbox
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            If an account with that email exists, we&apos;ve sent a password
            reset link. The link expires in 30 minutes.
          </p>
        </div>
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Not seeing it? Check spam, or request another link in a minute.
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/login"
            className="font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            ← Back to sign in
          </Link>
          <Link
            href="/forgot"
            className="font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Send another
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-3xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Reset your password
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Enter the email on your account and we&apos;ll send a link to pick
          a new password.
        </p>
      </div>

      <form action={requestPasswordReset} className="space-y-5">
        <label className="block">
          <span
            className="mb-1 block text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            Work email
            <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
              *
            </span>
          </span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={sp.email ?? ""}
            className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>

        <button
          type="submit"
          className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          Send reset link
        </button>
      </form>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          Back to sign in →
        </Link>
      </p>
    </div>
  );
}
