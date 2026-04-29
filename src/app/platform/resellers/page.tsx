import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/resellers — preview stub. Partner / reseller channel
// management. Designers, agencies, and consultants who resell
// Flowtora to their print + sign clients.

export default async function ResellersPage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="Resellers"
      eyebrowIcon="Vendors"
      title="Resellers"
      description="Partner / reseller channel — designers + agencies who set up and manage Flowtora workspaces for their clients. Future revenue lever: build the channel before pouring money into direct sales."
      preview
      roadmap={[
        {
          title: "Reseller signup + verification",
          body: "Public partner application form, internal review queue, NDA + reseller agreement signature flow.",
        },
        {
          title: "Tenant ownership transfer",
          body: "Resellers spin up workspaces under their account, then transfer ownership to the end customer once setup is complete. Requires a clean tenant-ownership model — currently every Membership has equal weight.",
        },
        {
          title: "Reseller billing + revenue share",
          body: "Resellers can either pass-through bill (customer pays Flowtora directly + reseller gets a kickback) or wholesale (reseller pays us, marks up to client). Stripe Connect powers the payout side.",
        },
        {
          title: "Co-branded onboarding",
          body: "Reseller can swap the Flowtora logo for their own (or both) on the customer-facing portal during the first 30 days post-handoff.",
        },
        {
          title: "Reseller dashboard",
          body: "Per-reseller view of their tenant book — MRR, health, churn risk, support tickets opened against their accounts.",
        },
      ]}
    />
  );
}
