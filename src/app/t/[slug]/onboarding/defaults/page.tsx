import { redirect } from "next/navigation";

// Phase 4 (transformation) — wizard step → settings redirect.
// Numbering is the first thing new shops tend to change (their own
// quote prefix), so that's where we land; financial defaults are one
// tab over under Money.

export default async function OnboardingDefaultsStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/settings/numbering?hl=defaults`);
}
