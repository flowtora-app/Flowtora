import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/communications — hub for transactional templates +
// broadcast announcements + (eventually) Slack/Teams/SMS channels.

export const dynamic = "force-dynamic";

export default async function CommunicationsHub() {
  await requirePlatformStaff();

  const [templateCount, publishedTemplates, announcementCount, recentAnnouncement] = await Promise.all([
    db.notificationTemplate.count({ where: { channel: "EMAIL", locale: "en" } }).catch(() => 0),
    db.notificationTemplate.count({ where: { channel: "EMAIL", locale: "en", status: "PUBLISHED" } }).catch(() => 0),
    db.platformAnnouncement.count().catch(() => 0),
    db.platformAnnouncement.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true },
    }).catch(() => null),
  ]);

  return (
    <SectionPage
      eyebrow="Communications"
      eyebrowIcon="MessageSquare"
      title="Communications"
      description="Transactional email templates, in-app notifications, and tenant-facing announcement broadcasts. Single place to control what messages go out and from whom."
      tiles={[
        {
          href: "/platform/notifications",
          icon: "Bell",
          title: "Templates",
          description: `${publishedTemplates} of ${templateCount} email templates published. Every transactional email is editable here.`,
          meta: `${publishedTemplates}/${templateCount}`,
        },
        {
          href: "/platform/announcements",
          icon: "Megaphone",
          title: "Announcements",
          description: `${announcementCount} broadcasts. Audience targeting + read receipts.${recentAnnouncement ? ` Latest: "${recentAnnouncement.title}"` : ""}`,
          meta: String(announcementCount),
          preview: true,
        },
        {
          href: "/platform/feedback",
          icon: "MessageSquare",
          title: "Feedback inbox",
          description: "Tenant-side feedback (ideas / bugs / praise). Triage queue + response loop.",
        },
      ]}
      roadmap={[
        {
          title: "Slack + Teams channels",
          body: "Per-tenant webhook destinations so internal-team notifications land where the team lives. Needs org-side OAuth setup before we can ship — currently deferred.",
        },
        {
          title: "SMS via Twilio",
          body: "Critical alerts only (auth, billing-failure). Wired through the same NotificationDispatcher; needs Twilio account.",
        },
        {
          title: "Per-tenant email branding",
          body: "Tenant-supplied logo + color seeded into transactional templates so customer-facing email matches their brand.",
        },
      ]}
    />
  );
}
