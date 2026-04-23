import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { sendInitialVerification } from "@/app/actions/account-security";

export const metadata: Metadata = {
  title: "Verification link no longer valid — Flowtora",
  robots: { index: false, follow: false },
};

// Phase 2 (redesigned 2026-04-22) — dead email verification link.
//
// Two paths:
//   • Signed-in user still unverified → inline resend form that spawns
//     a fresh token. This is the common case (the original link
//     expired or was re-clicked after use).
//   • Signed-out → gentle nudge back to sign-in, where the unverified
//     banner inside the app offers a resend after login.
//
// An explicit `?error=<msg>` query param ever lands us here via an
// email-change conflict ("that email is already in use"); we surface
// it prominently so the user understands the blocker.

export default async function VerifyInvalidPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const sp = await searchParams;
  const detail = sp.error ? decodeURIComponent(sp.error) : null;
  const justResent = sp.sent === "1";
  const session = await auth();
  const signedIn = !!session?.user?.id;

  // The resend server action issues a fresh token and emails it, then
  // redirects back here with ?sent=1 so the user gets confirmation
  // feedback without a separate route.
  async function resendAction() {
    "use server";
    await sendInitialVerification();
    const { redirect } = await import("next/navigation");
    redirect("/verify/invalid?sent=1");
  }

  return (
    <div className="space-y-6">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background: "var(--warning-surface)",
          color: "var(--warning-fg)",
        }}
        aria-hidden="true"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>

      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          This verification link isn&apos;t valid
        </h1>
        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Links expire after 24 hours and can only be used once.
          {detail ? ` ${detail}` : ""} No problem — we can send a fresh one.
        </p>
      </div>

      {justResent ? (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-border, transparent)",
          }}
          role="status"
        >
          <strong>New link sent.</strong> Check your inbox — it should arrive in a few seconds.
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {signedIn ? (
          <>
            <form action={resendAction}>
              <button
                type="submit"
                className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                }}
              >
                Send me a new verification link
              </button>
            </form>
            <Link
              href="/select-tenant"
              className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors"
              style={{
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              Back to your workspaces
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="ts-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
              style={{
                background: "var(--accent-primary)",
                color: "var(--accent-fg)",
              }}
            >
              Sign in to send a new link
            </Link>
            <p
              className="text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Once you sign in, we&apos;ll offer to resend from the top of your workspace.
            </p>
          </>
        )}
      </div>

      <p
        className="border-t pt-4 text-xs leading-relaxed"
        style={{
          color: "var(--text-muted)",
          borderColor: "var(--border-subtle)",
        }}
      >
        Trouble receiving emails? Check your spam folder, or reply to any Flowtora email
        and we&apos;ll help.
      </p>
    </div>
  );
}
