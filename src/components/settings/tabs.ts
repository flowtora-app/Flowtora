// Settings IA — 6 top-level tabs, each with its own sub-section sidebar.
//
// Phase 4 (transformation) rebalances the previous 6-group flat sidebar
// (Me / Business / Money / Workspace / Platform / Account) into the
// canonical tabs defined in the product-strategy doc:
//
//   Profile & branding — shop identity, document rules, numbering
//   Money              — subscription + financial defaults
//   Workflow           — operational rules, automation, production,
//                        templates, invite defaults, demo data
//   Team               — members, locations, franchise sharing
//   Me                 — personal profile + notifications + security
//   Advanced           — integrations, audit, danger zone
//
// URL structure stays flat (/settings/<slug>/…) — the shell classifies
// the current pathname into one of the six tabs at render time. Moving
// to nested URLs like /settings/workflow/automation would require
// rewriting every server action redirect target and every link in the
// codebase; not worth the churn. The tabs are a *presentation layer*.

import type { Permission } from "@/lib/rbac";

export type SettingsTabId =
  | "profile"
  | "money"
  | "workflow"
  | "team"
  | "me"
  | "advanced";

export interface SettingsSubItem {
  /** URL segment under /settings/{slug}/… */
  slug: string;
  label: string;
  description?: string;
  perm?: Permission;
  gate?: "franchiseGroup";
  ownerOnly?: boolean;
  adminOrOwner?: boolean;
  /** Extra pathname prefixes that should also light this nav item up.
   *  Example: the unified Templates section matches both
   *  /settings/templates AND /settings/message-templates. */
  matches?: string[];
}

export interface SettingsTab {
  id: SettingsTabId;
  label: string;
  /** Short one-liner shown below the tab name in the hub. */
  blurb: string;
  items: SettingsSubItem[];
}

export const SETTINGS_TABS: SettingsTab[] = [
  {
    id: "profile",
    label: "Profile & branding",
    blurb: "How your shop shows up on documents and the customer portal.",
    items: [
      {
        slug: "profile",
        label: "Business profile",
        description: "Shop name, logo, contact info, brand color, sender.",
        perm: "tenant:manage",
      },
      {
        slug: "documents",
        label: "Documents",
        description: "Footers and payment instructions on quotes, invoices, emails.",
        perm: "tenant:manage",
      },
      {
        slug: "numbering",
        label: "Numbering",
        description: "Prefixes and counters for quotes, orders, invoices.",
        perm: "tenant:manage",
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    blurb: "Subscription, tax, deposits, and payment terms.",
    items: [
      {
        slug: "financial",
        label: "Tax & terms",
        description: "Default tax rate, deposits, and payment terms.",
        perm: "tenant:manage",
      },
      {
        slug: "billing",
        label: "Subscription",
        description: "Flowtora plan, invoices, and payment method.",
        perm: "tenant:billing",
      },
    ],
  },
  {
    id: "workflow",
    label: "Workflow",
    blurb: "How work flows through your shop — rules, templates, and defaults.",
    items: [
      {
        slug: "workflow",
        label: "Rules & gates",
        description: "Approval thresholds, proof gates, and rush pricing.",
        perm: "tenant:manage",
      },
      {
        slug: "automation",
        label: "Automation",
        description: "Default sales rep, production manager, and auto-applied checklists.",
        perm: "tenant:manage",
      },
      {
        slug: "production",
        label: "Production",
        description: "Departments, workstations, and production stages.",
        perm: "production:manage",
      },
      {
        slug: "templates",
        label: "Templates",
        description: "Reusable checklists and canned customer messages.",
        perm: "templates:manage",
        matches: ["/message-templates"],
      },
      {
        slug: "notifications-defaults",
        label: "Invite defaults",
        description: "House default alerts new members inherit on invite-accept.",
        perm: "staff:manage",
      },
      {
        slug: "sample-data",
        label: "Demo data",
        description: "Load or clear the onboarding demo data set.",
        perm: "tenant:manage",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    blurb: "People, branches, and shared assets.",
    items: [
      {
        slug: "team",
        label: "Members & roles",
        description: "Invite members, set roles, and manage access.",
        perm: "staff:manage",
      },
      {
        slug: "locations",
        label: "Locations",
        description: "Branches your team operates out of.",
        perm: "locations:manage",
      },
      {
        slug: "franchise",
        label: "Group sharing",
        description: "Franchise / multi-tenant shared templates.",
        perm: "tenant:manage",
        gate: "franchiseGroup",
      },
    ],
  },
  {
    id: "me",
    label: "Me",
    blurb: "Your personal profile and alert preferences.",
    items: [
      {
        slug: "me",
        label: "Profile",
        description: "Your display name and avatar — how teammates see you.",
      },
      {
        slug: "notifications",
        label: "Notifications",
        description: "Your personal in-app and email alert preferences.",
      },
      {
        slug: "security",
        label: "Security",
        description: "Password, two-factor, sessions, and recent login activity.",
      },
    ],
  },
  {
    id: "advanced",
    label: "Advanced",
    blurb: "Integrations, audit log, and escape hatches.",
    items: [
      {
        slug: "integrations",
        label: "Integrations",
        description: "Connected services and their health — Stripe, email, and more.",
        perm: "tenant:manage",
      },
      {
        slug: "audit-log",
        label: "Audit log",
        description: "Workspace-wide activity feed. Who did what, when.",
        adminOrOwner: true,
      },
      {
        slug: "danger",
        label: "Danger zone",
        description: "Export data, archive, or delete this workspace.",
        ownerOnly: true,
      },
    ],
  },
];

/** Find which tab owns a given settings sub-slug (e.g. "billing" → "money").
 *  Returns `null` if the slug isn't in the IA (shouldn't happen for valid
 *  routes). The `matches` array lets a single nav item respond to multiple
 *  URL slugs — e.g. "templates" also claims "message-templates". */
export function findTabForSlug(slug: string): SettingsTabId | null {
  for (const tab of SETTINGS_TABS) {
    for (const item of tab.items) {
      if (item.slug === slug) return tab.id;
      if (item.matches?.some((m) => m === `/${slug}` || m === slug)) return tab.id;
    }
  }
  return null;
}

/** The first tab becomes /settings's default landing target. */
export const DEFAULT_TAB: SettingsTabId = "profile";

/** First sub-item slug inside a tab — used when the user clicks the tab
 *  with no sub-route already selected. */
export function defaultSlugForTab(id: SettingsTabId): string | null {
  const tab = SETTINGS_TABS.find((t) => t.id === id);
  return tab?.items[0]?.slug ?? null;
}
