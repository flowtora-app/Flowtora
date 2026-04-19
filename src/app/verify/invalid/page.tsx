import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Verification link no longer valid — Tracksign",
  robots: { index: false, follow: false },
};

// Phase 2 — dead email verification link.
//
// Offers a "send another" path when the user is signed in (we can
// re-issue a token), and a "sign in" path otherwise.

export default async function VerifyInvalidPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const detail = sp.error ? decodeURIComponent(sp.error) : null;
  const session = await auth();
  const signedIn = !!session?.user?.id;

  return (
    <div className="space-y-6">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background: "var(--warning-surface)",
          color: "var(--warning-fg)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Verification links expire after 24 hours and can only be used once.
          {detail ? ` ${detail}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {signedIn ? (
          <Link
            href="/select-tenant"
            className="ts-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Back to your workspaces
          </Link>
        ) : (
          <Link
            href="/login"
            className="ts-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
