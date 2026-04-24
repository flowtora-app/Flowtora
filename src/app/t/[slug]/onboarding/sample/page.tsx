import { redirect } from "next/navigation";

// Phase 4 (transformation) — wizard step → settings redirect.
// The sample-data page lives under the Workflow tab in the new IA.

export default async function OnboardingSampleStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}/settings/sample-data?hl=sample`);
}
