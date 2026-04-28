import Link from "next/link";

// UpgradeRequired — full-page paywall card. Drop-in for any feature
// that's gated behind a higher plan. Renders centered in the main
// content area (the surrounding sidebar/topbar still show), so users
// keep their bearings while seeing they need to upgrade.
//
//   if (!await isEntitled(...)) {
//     return <UpgradeRequired
//       slug={slug}
//       featureName="Vendors & expenses"
//       requiredPlan="Professional"
//       reason="Track vendor bills and job expenses for true margin reporting."
//     />;
//   }
//
// Pattern matches Notion/Linear/Stripe — the page navigates normally
// (URL updates, sidebar highlight stays) but the body content is the
// upgrade prompt instead of the gated feature.

export interface UpgradeRequiredProps {
  /** Tenant slug — used to build the upgrade link. */
  slug: string;
  /** Friendly name of the feature, e.g. "Vendors & expenses". */
  featureName: string;
  /** Friendly name of the lowest plan that includes the feature. */
  requiredPlan: string;
  /** One-sentence reason / value prop. */
  reason: string;
}

export function UpgradeRequired({
  slug,
  featureName,
  requiredPlan,
  reason,
}: UpgradeRequiredProps) {
  const upgradeHref = `/t/${slug}/settings/billing`;
  const pricingHref = "/pricing";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div
        className="w-full max-w-md rounded-2xl px-8 py-10 text-center"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Lock icon — inline SVG, no dep. */}
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
          }}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>

        <h1
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          {featureName} is part of {requiredPlan}
        </h1>

        <p
          className="mt-2 text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {reason}
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <Link
            href={upgradeHref}
            className="inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Upgrade to {requiredPlan}
          </Link>
          <Link
            href={pricingHref}
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm transition-colors"
            style={{
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
          >
            Compare all plans
          </Link>
        </div>

        <p
          className="mt-5 text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          Already on {requiredPlan}? <Link href={`/t/${slug}/settings/billing`} className="underline" style={{ color: "var(--text-muted)" }}>Check your billing</Link>.
        </p>
      </div>
    </div>
  );
}
