import { QuickActions, type QuickAction } from "@/components/dashboard/QuickActions";

// Platform-admin quick actions. Aligned with the 21-item top-level
// nav: each shortcut lands on a hub that is itself in the sidebar so
// operators always know where they are. Ordered by frequency-of-use
// for the operator persona.

const PLATFORM_ACTIONS: QuickAction[] = [
  {
    label: "View tenants",
    href: "/platform/tenants",
    hint: "Browse, filter, and act on customer workspaces",
    icon: "▥",
    primary: true,
  },
  {
    label: "Billing & Revenue",
    href: "/platform/billing",
    hint: "Coupons, dunning, manual invoices, MRR analytics",
    icon: "$",
  },
  {
    label: "Users",
    href: "/platform/users",
    hint: "Cross-tenant user search, ban + merge",
    icon: "◉",
  },
  {
    label: "Support queue",
    href: "/platform/support",
    hint: "Open tickets, SLAs, and replies",
    icon: "?",
  },
  {
    label: "Security",
    href: "/platform/security",
    hint: "Staff & roles, abuse + bans, audit log",
    icon: "♦",
  },
  {
    label: "Communications",
    href: "/platform/communications",
    hint: "Transactional templates and announcements",
    icon: "✉",
  },
  {
    label: "Marketing",
    href: "/platform/marketing",
    hint: "Leads, plans, features, public-site copy",
    icon: "◧",
  },
  {
    label: "Settings",
    href: "/platform/settings",
    hint: "Maintenance mode, feature freeze, platform-wide knobs",
    icon: "≡",
  },
];

export function PlatformQuickActions() {
  return <QuickActions actions={PLATFORM_ACTIONS} />;
}
