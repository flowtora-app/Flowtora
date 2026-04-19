"use client";

import { useEffect } from "react";
import Link from "next/link";

// Phase 23 — tenant-scoped error boundary.
//
// Any unhandled server-component error inside /t/[slug] lands here instead
// of Next.js' default white page. We log the digest to console so support
// can correlate an incident to a Vercel log entry, and give the user a
// "try again" + "back to dashboard" escape hatch rather than a dead-end.

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[tenant-boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
        Something went wrong
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        We hit an unexpected error rendering this page. The team's been notified.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs font-mono" style={{ color: "var(--text-faint)" }}>
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md px-3 py-1.5 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg, white)" }}
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md px-3 py-1.5 text-sm"
          style={{ border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
