import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/marketplace — preview stub. Catalog of third-party
// add-ons / extensions tenants can install into their workspace.

export default async function MarketplacePage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="Marketplace"
      eyebrowIcon="Package"
      title="Marketplace"
      description="Catalog of paid + free add-ons tenants can install — third-party templates, shop-specific integrations, premium product packs. Future revenue stream alongside subscriptions."
      preview
      roadmap={[
        {
          title: "Listing catalog + admin curation",
          body: "Browse + search listings, feature highlights, mark verified vendors. Admin-side approval queue for new submissions.",
        },
        {
          title: "Vendor onboarding + revenue split",
          body: "Stripe Connect for vendor payouts, configurable rev-share per category.",
        },
        {
          title: "One-click install per tenant",
          body: "When a tenant clicks Install, we provision the add-on against their workspace + bill them through the existing subscription invoice.",
        },
        {
          title: "Reviews + reports",
          body: "Star ratings, written reviews, abuse reporting tied into Trust & Safety.",
        },
      ]}
    />
  );
}
