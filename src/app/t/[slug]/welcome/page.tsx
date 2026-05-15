import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { PLAN_LABELS } from "@/lib/billing";
import type { Plan } from "@prisma/client";

// Links on this page intentionally use plain `<a>` instead of next/link.
//
// Welcome shares `/t/[slug]/layout.tsx` with /dashboard and /onboarding,
// but that layout conditionally returns bare `<>{children}</>` for
// /welcome and the full `<AppShell>` for every other route. With
// next/link's soft navigation the App Router preserves the cached
// layout segment between siblings, and React can't reconcile swapping
// a Fragment wrapper for an AppShell wrapper — the destination page
// renders inside the welcome's shell-less layout (no sidebar) until
// the user refreshes. Hard-loading via `<a>` forces the server to
// re-render the layout fresh for the new path. Welcome is a one-time
// transitional moment; a single full navigation is fine and is
// strictly better than landing on a broken dashboard.

// Post-payment confirmation / "receipt moment".
//
// Stripe's success_url points here after a brand-new signup completes
// checkout (see startCheckoutDirect). The purpose is threefold:
//   1. Give the user a clear "you're in" moment so the signup→pay
//      flow doesn't just dump them on a settings page.
//   2. Tell them the receipt is on its way (Stripe emails it —
//      we don't recreate it on-page).
//   3. Funnel them into the onboarding wizard, since a brand-new
//      tenant hasn't set up anything yet.
//
// Existing users upgrading mid-flight still land on /settings/billing
// (see startCheckout). This page is specifically for the
// marketing → purchase handoff.

const VALID_PLANS = new Set<Plan>(["STARTER", "GROWTH", "PRO"]);
const VALID_CYCLES = new Set(["monthly", "annual"]);

export default async function WelcomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string; cycle?: string; checkout?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant } = await requireTenant(slug);

  // If the visitor lands here without a checkout=success marker (e.g.
  // bookmarked the URL and came back a week later), bounce them to
  // wherever makes sense for their current state. Welcome is a
  // one-time moment, not a permanent page.
  if (sp.checkout !== "success") {
    redirect(
      tenant.onboardingCompletedAt
        ? `/t/${slug}/dashboard`
        : `/t/${slug}/onboarding`,
    );
  }

  const session = await auth();
  const user = session?.user?.id
    ? await db.user.findUnique({
        where: { id: session.user.id },
        select: { email: true, name: true },
      })
    : null;

  // Derive plan + cycle from the URL params (set by startCheckoutDirect
  // when it built Stripe's success_url). We don't rely on tenant.plan
  // because the Stripe webhook may not have synced yet by the time the
  // browser lands here — subscription.created lags session.completed by
  // a few seconds.
  const rawPlan = (sp.plan ?? "").toUpperCase() as Plan;
  const planKey = VALID_PLANS.has(rawPlan) ? rawPlan : null;
  const planLabel = planKey ? PLAN_LABELS[planKey] : "Flowtora";
  const cycle = VALID_CYCLES.has(sp.cycle ?? "") ? sp.cycle : null;

  const onboarded = !!tenant.onboardingCompletedAt;
  const primaryHref = onboarded
    ? `/t/${slug}/dashboard`
    : `/t/${slug}/onboarding`;
  const primaryLabel = onboarded
    ? "Go to dashboard"
    : "Set up your workspace";

  return (
    <main
      className="relative mx-auto flex min-h-screen max-w-xl items-center px-6 py-16"
      style={{
        // Soft radial accent at the top to celebrate the moment without
        // overwhelming the white space the page relies on.
      }}
    >
      {/* Background accent halo — fixed so it stays put as the page renders. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(900px circle at 50% -10%, var(--accent-surface), transparent 50%), " +
            "radial-gradient(620px circle at 50% 110%, color-mix(in oklab, var(--emerald-500) 8%, transparent), transparent 55%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div className="relative z-10 w-full space-y-6">
        {/* Success glyph — gradient emerald tile with glow. */}
        <div
          className="mx-auto flex items-center justify-center"
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--emerald-500) 28%, transparent), color-mix(in oklab, var(--emerald-500) 14%, transparent))",
            color: "var(--emerald-500)",
            border:
              "1px solid color-mix(in oklab, var(--emerald-500) 35%, transparent)",
            boxShadow:
              "inset 0 1px 0 0 color-mix(in oklab, white 8%, transparent), " +
              "0 0 32px -4px color-mix(in oklab, var(--emerald-500) 35%, transparent), " +
              "0 4px 14px -2px rgba(0,0,0,0.25)",
          }}
          aria-hidden
        >
          <svg
            width="36"
            height="36"
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

        <div className="text-center">
          <h1
            className="font-semibold"
            style={{
              color: "var(--text-default)",
              fontSize: 32,
              letterSpacing: "-0.022em",
              lineHeight: 1.15,
            }}
          >
            {onboarded
              ? `You're on Flowtora ${planLabel}.`
              : `Welcome to Flowtora ${planLabel}.`}
          </h1>
          <p
            className="mx-auto mt-3 max-w-md"
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Your subscription is active.
            {user?.email && (
              <>
                {" "}A receipt is on its way to{" "}
                <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
                  {user.email}
                </span>
                .
              </>
            )}
          </p>
        </div>

        {/* Plan summary card — premium rounded-2xl with accent halo. */}
        {planKey && (
          <div
            className="mx-auto flex max-w-sm items-center justify-between overflow-hidden rounded-2xl"
            style={{
              padding: "16px 20px",
              background:
                "radial-gradient(540px circle at -10% -40%, var(--accent-surface), transparent 60%), " +
                "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
              border: "1px solid var(--border-subtle)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.18)",
            }}
          >
            <div>
              <div
                style={{
                  color: "var(--text-faint)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: 1.1,
                }}
              >
                Plan
              </div>
              <div
                className="mt-1"
                style={{
                  color: "var(--text-default)",
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                }}
              >
                Flowtora {planLabel}
              </div>
            </div>
            {cycle && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
                  padding: "4px 10px",
                  borderRadius: 999,
                  lineHeight: 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: "var(--accent-primary)",
                  }}
                />
                {cycle === "annual" ? "Annual" : "Monthly"}
              </span>
            )}
          </div>
        )}

        <div className="pt-2">
          <a
            href={primaryHref}
            className="ts-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold transition-transform"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
              color: "var(--accent-fg)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                "0 4px 14px -2px color-mix(in oklab, var(--accent-primary) 40%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.35)",
              fontSize: 14,
              letterSpacing: "-0.005em",
            }}
          >
            {primaryLabel}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
          {!onboarded && (
            <p
              className="mt-3 text-center"
              style={{
                color: "var(--text-muted)",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              Takes about 5 minutes — you can pick up where you left off anytime.
            </p>
          )}
        </div>

        {/* Escape hatch. */}
        {!onboarded && (
          <p className="text-center">
            <a
              href={`/t/${slug}/dashboard`}
              className="ts-focus inline-block transition-colors hover:text-[var(--text-default)]"
              style={{
                color: "var(--text-faint)",
                fontSize: 11.5,
                fontWeight: 500,
              }}
            >
              Skip for now — go to dashboard
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
