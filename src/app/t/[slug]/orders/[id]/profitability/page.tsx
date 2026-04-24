import { redirect } from "next/navigation";

// Phase 5 (transformation) — deep-link shortcut.
//
// Stable URL the Orders list (and later the dashboard) can link to
// when a user specifically wants to see "what did we make on this
// job." Lands them on the Money tab of the order page, which now
// hosts the profitability widget.

export default async function OrderProfitabilityRedirect({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  redirect(`/t/${slug}/orders/${id}?tab=money&hl=profit`);
}
