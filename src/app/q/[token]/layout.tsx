import type { Metadata } from "next";

// Phase 9 — public quote share view. Routes under /q/[token] render a
// customer-facing quote outside the signed-in portal shell. Keeps tenant
// branding minimal by design: the share link is typically pasted into an
// email, and we don't want it to look like a login-walled app.

export const metadata: Metadata = {
  title: "Your quote · Tracksign",
  robots: { index: false, follow: false },
};

export default function PublicQuoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--surface-0)", color: "var(--text-default)" }}
    >
      <div className="mx-auto max-w-3xl px-5 py-8">{children}</div>
    </div>
  );
}
