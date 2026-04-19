import Link from "next/link";

// Phase 2 — password reset pages share a minimal centered layout.
//
// We keep the reset flow outside the (auth) group because we want the
// URL structure `/reset/[token]` at the app root (shorter, more
// memorable, cleaner in emails) without dragging in the brand panel —
// the reset flow is imperative, not aspirational.

export default function ResetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{ background: "var(--surface-0)" }}
    >
      <Link href="/" className="mb-8 inline-flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          T
        </span>
        <span
          className="text-base font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Tracksign
        </span>
      </Link>
      <div
        className="w-full max-w-md rounded-xl p-8"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
