import Link from "next/link";
import type { Metadata } from "next";
import { signupAction } from "@/app/actions/auth";
import { SignupShopFields } from "@/components/auth/SignupShopFields";
import { PasswordField } from "@/components/auth/PasswordField";
import { getPublishedPlanBySlug } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Start your trial — Flowtora",
  description:
    "Spin up your shop in 15 minutes. 14-day free trial, no credit card required.",
};

// Signup page — serves two flows from one form:
//
//   1. Trial flow (default). The user landed here from "Start free
//      trial" anywhere on the site. No URL params (or an unknown
//      plan param). Copy sells the 14-day trial; after account
//      creation the auth action redirects to the onboarding wizard.
//
//   2. Purchase flow. The user clicked a tier CTA on /pricing, so
//      the URL carries ?plan=<slug>&cycle=<cycle>. We resolve the
//      slug against the live PricingPlan table; if it's a published,
//      self-serve, priced plan we render the "Get <plan>" variant
//      and stamp hidden `plan` + `cycle` inputs that the signup
//      action uses to route the new tenant through checkout-direct
//      → Stripe. Any unrecognized or non-purchasable slug falls
//      through to the trial flow so marketing never lands a user
//      on a dead CTA.
//
// Either way the form fields and validation are identical — the
// branching is pure presentation + post-signup redirect.

function parseCycle(raw?: string): "monthly" | "annual" {
  return raw === "annual" ? "annual" : "monthly";
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string; cycle?: string; ref?: string }>;
}) {
  const sp = await searchParams;
  const rawSlug = (sp.plan ?? "").trim().toLowerCase();
  const cycle = parseCycle(sp.cycle);
  // Page 3 §Affiliate Earnings — capture `?ref=<code>` so it survives
  // the form POST and lands on the signup action.
  const ref = (sp.ref ?? "").trim().slice(0, 64) || null;

  // Resolve the plan against the published catalog. Only plans that
  // are self-serve purchasable (not contact-sales, have a price,
  // showOnSignup) qualify for the purchase flow — everything else
  // falls back to the trial variant.
  const planRow = rawSlug ? await getPublishedPlanBySlug(rawSlug) : null;
  const isPurchase =
    planRow !== null &&
    planRow.showOnSignup &&
    !planRow.isContactSales &&
    (planRow.priceMonthly != null || planRow.priceAnnual != null);

  const plan = isPurchase ? planRow!.slug : null;
  const planLabel = isPurchase ? planRow!.name : null;
  const planBlurb = isPurchase
    ? planRow!.subtitle ??
      planRow!.description ??
      `You'll continue to secure checkout after creating your ${planRow!.name} account.`
    : null;

  return (
    <div className="space-y-8">
      <div>
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-surface-strong)",
          }}
        >
          {isPurchase
            ? `${planLabel} · ${cycle === "annual" ? "Annual billing" : "Monthly billing"}`
            : "14-day free trial · No credit card"}
        </span>
        <h1
          className="mt-4 text-3xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          {isPurchase
            ? `Start your ${planLabel} subscription`
            : "Spin up your shop"}
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {isPurchase
            ? planBlurb
            : "Import your customers, seed your price book, and send your first quote today."}
        </p>
      </div>

      <form action={signupAction} className="space-y-5">
        {/* Purchase-intent fields. Empty on the trial flow, which the
            server action handles as "no purchase intent, redirect to
            onboarding like normal." */}
        {isPurchase && plan && (
          <>
            <input type="hidden" name="plan" value={plan} />
            <input type="hidden" name="cycle" value={cycle} />
          </>
        )}
        {ref && <input type="hidden" name="ref" value={ref} />}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Your name"
            name="name"
            autoComplete="name"
            required
          />
          <Field
            label="Work email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        {/* Password rules + live strength meter + checklist are
            enforced and surfaced by the shared PasswordField. The
            same rules apply server-side via `passwordSchema` in
            src/lib/password.ts. */}
        <PasswordField />
        {/* Shop name auto-fills the slug; slug field does a live
            availability check against /api/signup/slug-check. Both
            states are client-owned, so the pair is lifted into its
            own client component. */}
        <SignupShopFields />

        {sp.error && (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            {decodeURIComponent(sp.error)}
          </div>
        )}

        <button
          type="submit"
          className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          {isPurchase ? "Create account" : "Start free trial"}
        </button>

        {isPurchase ? (
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            You&apos;ll be redirected to Stripe to complete payment. Your card
            isn&apos;t charged until the next step. Want to evaluate first?{" "}
            <Link href="/signup" className="underline">
              Start a 14-day trial
            </Link>{" "}
            instead.
          </p>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        )}
      </form>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          Sign in →
        </Link>
      </p>
    </div>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
  },
) {
  const { label, hint, ...rest } = props;
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
        {label}
        {rest.required && (
          <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
            *
          </span>
        )}
      </span>
      <input
        {...rest}
        className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && (
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
