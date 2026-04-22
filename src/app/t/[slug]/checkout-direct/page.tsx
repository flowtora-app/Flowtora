import { redirect } from "next/navigation";
import { startCheckoutDirect } from "@/app/actions/billing";
import type { Plan } from "@prisma/client";
import type { BillingCycle } from "@/lib/stripe";

// Purchase-intent landing pad.
//
// The marketing pricing tiers link to /signup?plan=PRO&cycle=annual.
// After a fresh signup the auth action signs the user in with a
// redirectTo pointed at THIS route, which then kicks the Stripe
// checkout session server-side and 302s to Stripe. The user sees
// signup form → brief "Redirecting to checkout…" flash → Stripe.
//
// If Stripe is unconfigured or params are invalid we fall back to
// the regular billing settings page where the user can re-attempt
// the purchase manually. We deliberately don't render any UI here
// that requires client interaction — the whole point is to be an
// invisible handoff. The returned JSX is a minimal fallback only
// rendered if neither redirect fires (shouldn't happen).

const VALID_PLANS = new Set<string>(["STARTER", "GROWTH", "PRO", "ENTERPRISE"]);
const VALID_CYCLES = new Set<string>(["monthly", "annual"]);

export default async function CheckoutDirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string; cycle?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawPlan = (sp.plan ?? "").toUpperCase();
  const rawCycle = (sp.cycle ?? "monthly").toLowerCase();

  if (!VALID_PLANS.has(rawPlan) || !VALID_CYCLES.has(rawCycle)) {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }

  const plan = rawPlan as Plan;
  const cycle = rawCycle as BillingCycle;

  // startCheckoutDirect throws a NEXT_REDIRECT on both success
  // (redirects to Stripe URL) and failure (redirects to billing
  // settings with an error param). Either way, control never returns.
  await startCheckoutDirect(slug, plan, cycle);

  // Unreachable — included for type-safety in case startCheckoutDirect
  // ever stops always-redirecting.
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p style={{ color: "var(--text-muted)" }}>Redirecting to checkout…</p>
    </div>
  );
}
