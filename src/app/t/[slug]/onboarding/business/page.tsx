import { redirect } from "next/navigation";

// Phase 4 (transformation) — the wizard step is gone; everything
// configurable lives in /settings/profile. We preserve this URL
// because it shipped in onboarding emails, so a redirect keeps stored
// links working. `?hl=business` surfaces the OnboardingBanner on the
// target page so the user knows they're still in a setup flow.

export default async function OnboardingBusinessStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/settings/profile?hl=business`);
}
