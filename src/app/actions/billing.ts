"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { requirePermission } from "@/lib/tenant";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import type { Plan } from "@prisma/client";

export async function startCheckout(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "tenant:billing");
  const plan = String(formData.get("plan") ?? "") as Plan;
  if (plan !== "STARTER" && plan !== "GROWTH" && plan !== "PRO") {
    redirect(`/t/${slug}/settings/billing?error=invalid_plan`);
  }
  const session = await auth();
  const url = await createCheckoutSession({
    tenant: ctx.tenant,
    ownerEmail: session?.user?.email ?? "",
    plan,
    returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/t/${slug}/settings/billing`,
  });
  if (!url) redirect(`/t/${slug}/settings/billing?error=stripe_unconfigured`);
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
