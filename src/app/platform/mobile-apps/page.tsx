import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/mobile-apps — preview stub. Mobile-app version + crash
// management. Today there is no mobile app — this is forward-looking
// surface for when the iOS + Android apps ship.

export default async function MobileAppsPage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="Mobile Apps"
      eyebrowIcon="Monitor"
      title="Mobile Apps"
      description="Manage the iOS + Android companion apps once they ship. Today the platform is web-only — this section becomes load-bearing the first day a mobile binary lands in TestFlight or Play Console."
      preview
      roadmap={[
        {
          title: "Released versions + minimum supported",
          body: "Track which app versions are live, what the floor is, and force-update via JWT claim when an old build hits a server-side breaking change.",
        },
        {
          title: "Crash + ANR dashboard",
          body: "Per-version crash rate, sourcemap-resolved stack traces. Pulls from Sentry for parity with web error tracking.",
        },
        {
          title: "Feature flags scoped to platform",
          body: "Roll out a feature to web first, then iOS, then Android. Wired through the existing /platform/feature-flags surface but with platform: 'mobile_ios' | 'mobile_android' axis.",
        },
        {
          title: "Push notification campaigns",
          body: "Send platform-wide pushes (planned-maintenance window, new-feature announcement). Currently in-app notifications cover this — mobile pushes layer on once we have device tokens.",
        },
      ]}
    />
  );
}
