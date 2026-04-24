import { redirect } from "next/navigation";

// Phase 4 (transformation) — wizard step → settings redirect.

export default async function OnboardingTeamStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/settings/team?hl=team`);
}
