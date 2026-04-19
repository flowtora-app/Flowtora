import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";
import { confirmPasswordReset } from "@/app/actions/account-security";

export const metadata: Metadata = {
  title: "Pick a new password — Tracksign",
  robots: { index: false, follow: false },
};

// Phase 2 — set a new password given a valid reset token.
//
// We validate the token on GET so that an expired/used/missing link
// redirects straight to /reset/invalid instead of showing a form that
// will fail. Token hashing happens server-side; the raw token never
// hits the DB.

export default async function ResetWithTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, usedAt: true, expiresAt: true, userId: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    redirect("/reset/invalid");
  }

  // Minutes remaining — subtle reassurance on the page so the user
  // doesn't panic about the link timing out mid-type.
  const minutesLeft = Math.max(
    1,
    Math.round((row.expiresAt.getTime() - Date.now()) / 60000),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Pick a new password
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          You&apos;ll be signed out of all devices and asked to sign back in.
          This link expires in {minutesLeft} minute{minutesLeft === 1 ? "" : "s"}.
        </p>
      </div>

      <form action={confirmPasswordReset} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          hint="At least 8 characters. Mix a word you'd remember with a number."
        />
        <PasswordField
          label="Confirm new password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
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
            {decodeURIComponent(sp.error)}
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
          Set new password
        </button>
      </form>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        <Link
          href="/login"
          className="font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}

function PasswordField(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
  },
) {
  const { label, hint, ...rest } = props;
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
        type="password"
        className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && (
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
