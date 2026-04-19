import Link from "next/link";

// Phase 18 Slice C — refreshed auth layout.
//
// Split panel: brand + talking points on the left, the sign-in or
// sign-up form on the right. Collapses to a single column on mobile
// with the form first so the hero copy never pushes the input below
// the fold.

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid min-h-screen grid-cols-1 lg:grid-cols-5"
      style={{ background: "var(--surface-0)" }}
    >
      {/* Brand panel — desktop only. */}
      <aside
        className="relative hidden overflow-hidden lg:col-span-2 lg:flex lg:flex-col"
        style={{
          background:
            "linear-gradient(160deg, var(--accent-surface-strong) 0%, var(--surface-1) 70%)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full blur-3xl"
          style={{ background: "var(--accent-surface)", opacity: 0.6 }}
        />
        <div className="relative flex flex-1 flex-col justify-between p-10">
          <Link href="/" className="inline-flex items-center gap-2">
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
              Flowtora
            </span>
          </Link>

          <div>
            <blockquote
              className="text-xl font-medium leading-snug"
              style={{ color: "var(--text-default)" }}
            >
              &ldquo;We replaced three tools with Flowtora and finally have a
              single place to look. Our install crews know what&apos;s coming
              up next and our AR dropped by 22 days.&rdquo;
            </blockquote>
            <div className="mt-4 flex items-center gap-3">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                }}
              >
                P
              </span>
              <div className="text-sm">
                <div
                  className="font-semibold"
                  style={{ color: "var(--text-default)" }}
                >
                  Placeholder Name
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  Owner · Placeholder Signs Co.
                </div>
              </div>
            </div>
          </div>

          <div
            className="text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            © {new Date().getFullYear()} Flowtora, Inc.
          </div>
        </div>
      </aside>

      {/* Form panel. */}
      <main className="flex items-center justify-center px-6 py-12 lg:col-span-3">
        <div className="w-full max-w-md">
          {/* Mobile brand (the aside is hidden on < lg). */}
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 lg:hidden"
          >
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
              Flowtora
            </span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
