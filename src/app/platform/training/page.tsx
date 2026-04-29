import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/training — preview stub. Internal training material
// for new platform staff + tenant-facing learning content.

export default async function TrainingPage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="Training"
      eyebrowIcon="Bookmark"
      title="Training"
      description="Internal runbooks for platform staff and tenant-facing learning content. Two audiences, one knowledge base — internal pages stay private, customer-facing pages go to the help center."
      preview
      roadmap={[
        {
          title: "Internal runbooks",
          body: "Step-by-step guides for handling common admin tasks: how to investigate a payment dispute, how to revive a stuck dunning sequence, how to handle a GDPR erasure request.",
        },
        {
          title: "Tenant onboarding curriculum",
          body: "Structured learning path for new shop owners — sample-data tour, video walkthroughs, certification quizzes.",
        },
        {
          title: "Support team certification",
          body: "Track which support agents have passed which certifications (refunds, suspensions, impersonation). Feeds into role assignment.",
        },
        {
          title: "Knowledge-base article CMS",
          body: "Edit help-center articles. Search-indexed for the in-app help drawer + the support team's macro library.",
        },
      ]}
    />
  );
}
