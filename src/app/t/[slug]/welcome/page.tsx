import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { PLAN_LABELS } from "@/lib/billing";
import type { Plan } from "@prisma/client";

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
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <div className="w-full space-y-6">
        {/* Success glyph — a simple check inside a tinted circle.
            Using inline SVG keeps the page dep-free and renders
            consistently across themes via currentColor. */}
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
          aria-hidden
        >
          <svg
            width="28"
            height="28"
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
            className="text-3xl font-semibold tracking-tight"
            style={{ color: "var(--text-default)" }}
          >
            {onboarded
              ? `You're on Flowtora ${planLabel}.`
              : `Welcome to Flowtora ${planLabel}!`}
          </h1>
          <p
            className="mx-auto mt-3 max-w-md text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Your subscription is active.
            {user?.email && (
              <>
                {" "}A receipt is on its way to{" "}
                <span style={{ color: "var(--text-default)" }}>
                  {user.email}
                </span>
                .
              </>
            )}
          </p>
        </div>

        {/* Plan summary chip. Only renders if we got a valid plan from
            the URL — otherwise we keep the page clean rather than
            invent data. */}
        {planKey && (
          <div
            className="mx-auto flex max-w-sm items-center justify-between rounded-xl px-5 py-4 text-sm"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <div
                className="text-xs uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Plan
              </div>
              <div
                className="mt-0.5 font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                Flowtora {planLabel}
              </div>
            </div>
            {cycle && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  background: "var(--accent-surface)",
                  color: "var(--accent-primary)",
                  border: "1px solid var(--accent-surface-strong)",
                }}
              >
                Billed {cycle === "annual" ? "annually" : "monthly"}
              </span>
            )}
          </div>
        )}

        <div className="pt-2">
          <Link
            href={primaryHref}
            className="ts-focus inline-flex h-12 w-full items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors hover:brightness-110"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            {primaryLabel}
            <span aria-hidden>→</span>
          </Link>
          {!onboarded && (
            <p
              className="mt-3 text-center text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Takes about 5 minutes — you can pick up where you left off anytime.
            </p>
          )}
        </div>

        {/* Escape hatch for users who want to look around first.
            Not prominent; the primary CTA is onboarding. */}
        {!onboarded && (
          <p className="text-center text-xs">
            <Link
              href={`/t/${slug}/dashboard`}
              className="underline"
              style={{ color: "var(--text-muted)" }}
            >
              Skip for now — go to dashboard
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
