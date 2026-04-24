import { QuickActions, type QuickAction } from "@/components/dashboard/QuickActions";

// Platform-admin quick actions. Curated for the operator persona: spin
// up offerings, reach customers, dive into the tenant list, or jump to
// config surfaces. Ordered roughly by frequency of use.

const PLATFORM_ACTIONS: QuickAction[] = [
  {
    label: "View tenants",
    href: "/platform/tenants",
    hint: "Browse, filter, and act on customer workspaces",
    icon: "▥",
    primary: true,
  },
  {
    label: "Notification templates",
    href: "/platform/notifications",
    hint: "Edit transactional emails and in-app messages",
    icon: "✉",
  },
  {
    label: "Plans & pricing",
    href: "/platform/plans",
    hint: "Manage pricing plans and feature gates",
    icon: "$",
  },
  {
    label: "Support queue",
    href: "/platform/support",
    hint: "Open tickets, SLAs, and replies",
    icon: "?",
  },
  {
    label: "Audit log",
    href: "/platform/audit",
    hint: "Every privileged action, searchable",
    icon: "≡",
  },
  {
    label: "Design system",
    href: "/platform/design",
    hint: "Theme tokens, components, and previews",
    icon: "◧",
  },
  {
    // Announcements is a roadmap stub — the page loads and documents
    // the intended shape but there is no Announcement model yet. Keep
    // the quick action visible so staff can discover it, with a hint
    // that flags the preview state. See docs/transformation-plan.md
    // §Phase 1.
    label: "Announcements",
    href: "/platform/announcements",
    hint: "Preview — model not yet wired up; see the page for current alternatives",
    icon: "◉",
  },
  {
    label: "Platform health",
    href: "/platform/health",
    hint: "Exports, deletions, and background jobs",
    icon: "♥",
  },
];

export function PlatformQuickActions() {
  return <QuickActions actions={PLATFORM_ACTIONS} />;
}
