"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/tenant";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import type { Plan } from "@prisma/client";
import type { BillingCycle } from "@/lib/stripe";

// startCheckout — form-driven action used by the in-app billing
// settings page. Reads `plan` from a hidden form input; cycle defaults
// to monthly because that page doesn't expose a cycle toggle yet.
export async function startCheckout(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const plan = String(formData.get("plan") ?? "") as Plan;
  if (plan !== "STARTER" && plan !== "GROWTH" && plan !== "PRO") {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }
  const cycle = (String(formData.get("cycle") ?? "monthly") as BillingCycle);
  const session = await auth();
  const url = await createCheckoutSession({
    tenant: ctx.tenant,
    ownerEmail: session?.user?.email ?? "",
    plan,
    cycle,
    returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/t/${slug}/settings/billing`,
  });
  if (!url) redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
  redirect(url);
}

// startCheckoutDirect — programmatic variant used by the marketing →
// signup → Stripe handoff. The `checkout-direct` route calls this
// after reading plan+cycle from the URL. Keeps the form-less flow out
// of `startCheckout` so the in-app billing page can evolve
// independently.
//
// Unlike `startCheckout` (existing user upgrading), this flow lands
// the user on `/welcome?checkout=success&plan=…&cycle=…` afterward —
// a celebratory handoff into the onboarding wizard. Brand-new tenants
// haven't set up anything yet, so dumping them on /settings/billing
// would feel cold and miss the chance to funnel them into setup.
export async function startCheckoutDirect(
  slug: string,
  plan: Exclude<Plan, "ENTERPRISE">,
  cycle: BillingCycle,
) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const session = await auth();
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const returnUrl = new URL(`/t/${slug}/welcome`, base);
  returnUrl.searchParams.set("plan", plan);
  returnUrl.searchParams.set("cycle", cycle);
  const url = await createCheckoutSession({
    tenant: ctx.tenant,
    ownerEmail: session?.user?.email ?? "",
    plan,
    cycle,
    returnUrl: returnUrl.toString(),
  });
  if (!url) {
    redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
  }
  redirect(url);
}

export async function openBillingPortal(slug: string) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const url = await createPortalSession({
    tenant: ctx.tenant,
    returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/t/${slug}/settings/billing`,
  });
  if (!url) redirect(`/t/${slug}/settings/billing?error=no_customer`);
  redirect(url);
}
