import { requireTenant } from "@/lib/tenant";
import { isEntitled } from "@/lib/entitlements";
import { hasPermission, type Permission } from "@/lib/rbac";
import { SettingsNav, type SettingsNavGroup } from "@/components/settings/SettingsNav";

// Settings chrome.
//
// Vertical sidebar, grouped by concern. The groups reflect how operators
// think about their workspace rather than how the code is organized:
//
//   Me          — personal, per-user (lives inside the tenant URL but
//                 the actions are user-scoped, not tenant-scoped)
//   Business    — shop identity, document rules, workflow gates
//   Money       — finance defaults + Flowtora subscription
//   Workspace   — shared assets: team, locations, templates, messages
//   Account     — tenant-level escape hatches (sample data, danger zone)
//
// Each item can carry a `perm` (RBAC permission key) and/or a `gate`
// (entitlement feature flag) and/or `ownerOnly`. We resolve them here so
// the nav component stays dumb — and so a CSR doesn't see settings they
// can't open, which would read as "you have access, we just don't like
// you" when they click and hit a 403.

type RawItem = {
  slug: string;
  label: string;
  description?: string;
  perm?: Permission;
  gate?: "franchiseGroup";
  ownerOnly?: boolean;
  // `adminOrOwner` is a softer role gate — shows for owners + admins
  // only, but doesn't require either of the two `tenant:*` permission
  // keys (used for cross-cutting views like the audit log).
  adminOrOwner?: boolean;
};

type RawGroup = { label: string; items: RawItem[] };

const RAW_GROUPS: RawGroup[] = [
  {
    label: "Me",
    items: [
      { slug: "me",             label: "Profile" },
      { slug: "security",       label: "Security" },
      { slug: "notifications",  label: "Notifications" },
    ],
  },
  {
    label: "Business",
    items: [
      { slug: "profile",    label: "Business profile", perm: "tenant:manage" },
      { slug: "documents",  label: "Documents",        perm: "tenant:manage" },
      { slug: "numbering",  label: "Numbering",        perm: "tenant:manage" },
      { slug: "workflow",   label: "Workflow",         perm: "tenant:manage" },
      { slug: "automation", label: "Automation",       perm: "tenant:manage" },
      { slug: "production", label: "Production",       perm: "production:manage" },
    ],
  },
  {
    label: "Money",
    items: [
      { slug: "financial",  label: "Tax & terms",      perm: "tenant:manage" },
      { slug: "billing",    label: "Subscription",     perm: "tenant:billing" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { slug: "team",                    label: "Team & roles",   perm: "staff:manage" },
      { slug: "notifications-defaults",  label: "Invite defaults", perm: "staff:manage" },
      { slug: "locations",               label: "Locations",       perm: "locations:manage" },
      { slug: "templates",               label: "Checklists",      perm: "templates:manage" },
      { slug: "message-templates",       label: "Canned messages", perm: "templates:manage" },
      { slug: "franchise",               label: "Group sharing",   perm: "tenant:manage", gate: "franchiseGroup" },
    ],
  },
  {
    label: "Platform",
    items: [
      { slug: "integrations", label: "Integrations", perm: "tenant:manage" },
      { slug: "audit-log",    label: "Audit log",    adminOrOwner: true },
    ],
  },
  {
    label: "Account",
    items: [
      { slug: "sample-data", label: "Demo data",   perm: "tenant:manage" },
      { slug: "danger",      label: "Danger zone", ownerOnly: true },
    ],
  },
];

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);

  // Filter in two passes:
  //   1. Per-item: permission key + owner-only + plan entitlement
  //   2. Per-group: drop groups that have no visible items left
  //
  // We do permission checks against `hasPermission` rather than
  // `ctx.can` directly because `ctx.can` is already bound to the role
  // the same way — kept explicit here so the reasoning is visible.
  const resolvedGroups: SettingsNavGroup[] = await Promise.all(
    RAW_GROUPS.map(async (g) => {
      const items = await Promise.all(
        g.items.map(async (item) => {
          if (item.ownerOnly && ctx.role !== "OWNER") return null;
          if (item.adminOrOwner && ctx.role !== "OWNER" && ctx.role !== "ADMIN") return null;
          if (item.perm && !hasPermission(ctx.role, item.perm)) return null;
          if (item.gate) {
            const allowed = await isEntitled(ctx.tenant.id, ctx.tenant.plan, item.gate);
            if (!allowed) return null;
          }
          const navItem: { slug: string; label: string; description?: string } = {
            slug: item.slug,
            label: item.label,
          };
          if (item.description) navItem.description = item.description;
          return navItem;
        }),
      );
      return {
        label: g.label,
        items: items.filter(
          (x): x is { slug: string; label: string; description?: string } => x !== null,
        ),
      };
    }),
  ).then((gs) => gs.filter((g) => g.items.length > 0));

  return (
    <div>
      <header className="mb-8">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Settings
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Configure how {ctx.tenant.name} runs in Flowtora.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav slug={slug} groups={resolvedGroups} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
