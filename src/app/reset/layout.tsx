import Link from "next/link";
import { Logomark, Wordmark } from "@/components/brand/BrandMark";

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
        <Logomark size={32} />
        <Wordmark style={{ fontSize: 16 }} />
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
