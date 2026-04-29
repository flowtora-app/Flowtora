import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/cms — preview stub. Marketing-site content management:
// edit /pricing copy, /features explainers, /for-sign-shops + /for-
// print-shops landing pages without a deploy.

export default async function CmsPage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="CMS"
      eyebrowIcon="FileText"
      title="CMS"
      description="Edit flowtora.com marketing copy without a code deploy. Today the marketing routes are hard-coded React; this surface will let marketing team members ship copy + image changes through an admin form."
      preview
      callout={{
        title: "What's editable today",
        body: "Public plan + feature copy lives in /platform/plans and /platform/features — marketing team can edit pricing, names, and bullets there and changes go live immediately. The CMS surface fills the gap for everything else (hero copy, testimonials, FAQ, blog).",
        href: "/platform/marketing",
        cta: "Marketing surfaces",
      }}
      roadmap={[
        {
          title: "Marketing-site copy editor",
          body: "Per-route content blocks — edit hero copy, sub-heading, CTA text on /, /pricing, /features, /for-sign-shops, /for-print-shops.",
        },
        {
          title: "Testimonials + customer stories",
          body: "Manage social proof with attribution + headshot uploads.",
        },
        {
          title: "FAQ + help-doc CMS",
          body: "Categorized FAQ, surfaced on /pricing and the in-app help drawer. Doubles as the source for the support team's macro library.",
        },
        {
          title: "Blog / changelog",
          body: "Markdown-authored posts with cover image, scheduled publish, RSS.",
        },
      ]}
    />
  );
}
