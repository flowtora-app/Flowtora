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
    label: "Announcements",
    href: "/platform/announcements",
    hint: "Broadcast to tenants or specific segments",
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
