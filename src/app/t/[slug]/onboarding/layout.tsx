import { requireTenant } from "@/lib/tenant";

// Phase 4 (transformation) — onboarding is a checklist, not a wizard.
//
// We dropped the `OnboardingStepper` that used to live here. The
// stepper made sense when each step owned its own form; now the steps
// deep-link into Settings instead (see `./page.tsx`), so the progress
// UI lives on the landing page as a checklist rather than a step bar.
//
// Layout just owns the max-width wrapper + tenant hydration. The
// `/onboarding/done` completion page still renders inside this.

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTenant(slug);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      {children}
    </div>
  );
}
