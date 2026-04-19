import Link from "next/link";

// Phase 18 Slice E — portal expired landing.
//
// Deliberately plain so nothing reveals what was at the old token. This
// is the wall a stale or revoked link hits — it should feel final but
// calm, not alarming.

export default function PortalExpiredPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--surface-0)" }}
    >
      <div
        className="max-w-md rounded-xl px-6 py-8 text-center"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Link no longer valid
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          This portal link has expired or been revoked. Please contact the
          company you were working with for an updated link.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm underline"
          style={{ color: "var(--accent-primary)" }}
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
