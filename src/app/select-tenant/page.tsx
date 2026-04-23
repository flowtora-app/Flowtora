import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";

// Workspace picker + post-signup landing pad.
//
// Also doubles as the post-email-verification success screen:
// confirmVerification(INITIAL) redirects here with `?verified=1`
// so we can celebrate the confirmation moment before dropping the
// user into their workspace. When `verified=1` is present we skip
// the usual single-membership auto-redirect so the user actually
// sees the success state — otherwise the confirmation would flash
// past too fast to register as feedback.

export default async function SelectTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const sp = await searchParams;
  const justVerified = sp.verified === "1";

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Platform staff get sent to the platform console.
  if (session.user.platformRole) redirect("/platform");

  const memberships = await db.membership.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  // Fast-path: exactly one workspace and not a celebration moment.
  // With `verified=1` we want the user to see the success state, so
  // we keep them on this page with a clear "Continue" button.
  if (memberships.length === 1 && !justVerified) {
    redirect(`/t/${memberships[0].tenant.slug}/dashboard`);
  }

  return (
    <main
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16"
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
          F
        </span>
        <span
          className="text-base font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Flowtora
        </span>
      </Link>

      <div
        className="w-full rounded-xl p-8"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        {justVerified ? (
          <div className="mb-6 space-y-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: "var(--success-surface, #dcfce7)",
                color: "var(--success-fg, #166534)",
              }}
              aria-hidden="true"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <h1
                className="text-2xl font-semibold tracking-tight"
                style={{ color: "var(--text-default)" }}
              >
                Email confirmed
              </h1>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {memberships.length === 0
                  ? "Your Flowtora account is ready. Next, create a workspace for your shop."
                  : memberships.length === 1
                    ? "Your Flowtora account is verified. Let's get to work."
                    : "Your Flowtora account is verified. Pick a workspace to continue."}
              </p>
            </div>
          </div>
        ) : (
          <h1
            className="mb-6 text-2xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            {memberships.length === 0 ? "No workspaces yet" : "Choose a workspace"}
          </h1>
        )}

        {memberships.length === 0 ? (
          <>
            {!justVerified ? (
              <p
                className="mb-6 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                You don&apos;t have access to any shop. Ask an admin to invite you,
                or start your own.
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              <Link
                href="/signup"
                className="ts-focus inline-flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                }}
              >
                Create a shop
              </Link>
              <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
                <button
                  type="submit"
                  className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors"
                  style={{
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-default)",
                  }}
                >
                  Sign out
                </button>
              </form>
            </div>
          </>
        ) : memberships.length === 1 && justVerified ? (
          // Verified + single workspace: one big continue button.
          <Link
            href={`/t/${memberships[0].tenant.slug}/dashboard`}
            className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Continue to {memberships[0].tenant.name}
          </Link>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/t/${m.tenant.slug}/dashboard`}
                  className="ts-focus block rounded-md px-4 py-3 transition-colors hover:brightness-105"
                  style={{
                    background: "var(--surface-2, var(--panel))",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--text-default)" }}
                  >
                    {m.tenant.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {m.role.replace(/_/g, " ")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
