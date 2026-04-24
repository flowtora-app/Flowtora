import { redirect } from "next/navigation";

// Phase 4 (transformation) — wizard step → settings redirect.
// See /onboarding/page.tsx for the checklist this deep-links out of.

export default async function OnboardingBrandingStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/settings/profile?hl=branding`);
}
