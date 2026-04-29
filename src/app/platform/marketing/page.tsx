import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/marketing — hub linking the existing public-facing
// marketing surfaces (leads, plans, features, announcements) under
// one nav item. Each tile shows a live count so admins can spot
// where attention is needed at a glance.

export const dynamic = "force-dynamic";

export default async function MarketingHub() {
  await requirePlatformStaff();

  const [leadCount, newLeadCount, planCount, featureCount, announcementCount] = await Promise.all([
    db.marketingLead.count().catch(() => 0),
    db.marketingLead.count({ where: { status: "NEW" } }).catch(() => 0),
    db.pricingPlan.count().catch(() => 0),
    db.planFeature.count().catch(() => 0),
    db.platformAnnouncement.count().catch(() => 0),
  ]);

  return (
    <SectionPage
      eyebrow="Marketing"
      eyebrowIcon="Megaphone"
      title="Marketing"
      description="Public-facing marketing copy, lead capture, plan + feature catalog, and announcement broadcasts. Edit what prospects see on flowtora.com from one place."
      tiles={[
        {
          href: "/platform/leads",
          icon: "Target",
          title: "Leads",
          description: `Demo requests + sales inbox. ${newLeadCount > 0 ? `${newLeadCount} marked NEW.` : "Track who's signing up for a demo."}`,
          meta: String(leadCount),
        },
        {
          href: "/platform/plans",
          icon: "Package",
          title: "Plans",
          description: "Public plan catalog — pricing, features, Stripe price IDs. Edits surface on /pricing.",
          meta: String(planCount),
        },
        {
          href: "/platform/features",
          icon: "Sparkles",
          title: "Features",
          description: "Feature taxonomy used on the marketing site + plan comparison table.",
          meta: String(featureCount),
        },
        {
          href: "/platform/announcements",
          icon: "Megaphone",
          title: "Announcements",
          description: "Tenant-facing broadcast banners. Audience targeting + read receipts.",
          meta: String(announcementCount),
          preview: true,
        },
      ]}
    />
  );
}
