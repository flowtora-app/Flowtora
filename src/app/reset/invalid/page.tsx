import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset link no longer valid — Flowtora",
  robots: { index: false, follow: false },
};

// Phase 2 — terminal state for a dead reset link.
//
// The token is either expired, already used, or simply wrong. We don't
// distinguish — all three look the same to the user and we don't give
// fingerprint-able information to an attacker scraping this page.

export default async function ResetInvalidPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const detail = sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div className="space-y-6">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          This reset link isn&apos;t valid
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Reset links expire after 30 minutes and can only be used once.
          {detail ? ` ${detail}` : ""} You can request a fresh one below.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/forgot"
          className="ts-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          Request a new link
        </Link>
        <Link
          href="/login"
          className="ts-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
