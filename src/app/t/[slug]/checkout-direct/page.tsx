import { redirect } from "next/navigation";
import { startCheckoutDirect } from "@/app/actions/billing";
import { getPublishedPlanBySlug } from "@/lib/plans";
import type { Plan } from "@prisma/client";
import type { BillingCycle } from "@/lib/stripe";

// Purchase-intent landing pad.
//
// The marketing pricing tiers link to /signup?plan=<slug>&cycle=annual.
// After a fresh signup the auth action signs the user in with a
// redirectTo pointed at THIS route, which then kicks the Stripe
// checkout session server-side and 302s to Stripe. The user sees
// signup form → brief "Redirecting to checkout…" flash → Stripe.
//
// The plan whitelist is the live PricingPlan catalog — any slug that
// is published, self-serve, and priced qualifies. Unknown / unpriced
// / contact-sales slugs fall back to the regular billing settings
// page where the user can re-attempt the purchase manually.

const VALID_CYCLES = new Set<string>(["monthly", "annual"]);

// `startCheckoutDirect` still takes the legacy Plan enum, so we map
// DB slugs back to it here. Any slug that isn't in the enum (e.g. a
// future custom tier) is rejected with invalid_plan.
function mapSlugToPlan(slug: string): Plan | null {
  switch (slug.toLowerCase()) {
    case "starter":
      return "STARTER";
    case "growth":
      return "GROWTH";
    case "pro":
      return "PRO";
    case "enterprise":
      return "ENTERPRISE";
    default:
      return null;
  }
}

export default async function CheckoutDirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ plan?: string; cycle?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawPlan = (sp.plan ?? "").trim().toLowerCase();
  const rawCycle = (sp.cycle ?? "monthly").trim().toLowerCase();

  if (!rawPlan || !VALID_CYCLES.has(rawCycle)) {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }

  const planRow = await getPublishedPlanBySlug(rawPlan);
  const isPurchasable =
    planRow !== null &&
    planRow.showOnSignup &&
    !planRow.isContactSales &&
    (planRow.priceMonthly != null || planRow.priceAnnual != null);
  if (!isPurchasable) {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }

  const plan = mapSlugToPlan(planRow!.slug);
  if (!plan) {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }
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
