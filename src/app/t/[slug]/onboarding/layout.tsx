import { requireTenant } from "@/lib/tenant";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { ONBOARDING_STEPS } from "./steps";

// Phase 18 Slice D — onboarding chrome.
//
// The layout owns the tenant fetch and hands the stepper the shared
// list of steps. The stepper itself is a client component because it
// drives the active highlight off `usePathname`.

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <OnboardingStepper
        tenantSlug={slug}
        tenantName={tenant.name}
        steps={ONBOARDING_STEPS}
      />
      {children}
    </div>
  );
}
