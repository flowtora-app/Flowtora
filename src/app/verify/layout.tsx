import Link from "next/link";
import { BrandLockup } from "@/components/brand/BrandMark";

// Phase 2 — email verification shares the same sparse centered layout
// as `/reset`. We deliberately don't nest under (auth) because the flow
// also runs for signed-in users changing their email, where a separate
// brand panel would be noise.

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{ background: "var(--surface-0)" }}
    >
      <Link href="/" className="mb-8 inline-flex items-center gap-2">
        <BrandLockup size={32} />
      </Link>
      <div
        className="w-full max-w-md rounded-xl p-8"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
