import { requireTenant } from "@/lib/tenant";
import { isEntitled } from "@/lib/entitlements";
import { SettingsNav, type SettingsNavGroup } from "@/components/settings/SettingsNav";

// Phase 18 Slice E — settings chrome.
//
// Horizontal tab strip → vertical sidebar, grouped. 11 items in one row
// was fine at 4 settings but became a wall at 11; grouping means users
// can find their way by category rather than scanning left-to-right.
//
// Gated items (Group / franchise) still resolve server-side — the nav
// component is dumb about entitlements.

type RawItem = {
  slug: string;
  label: string;
  description?: string;
  gate?: "franchiseGroup";
};

type RawGroup = { label: string; items: RawItem[] };

const RAW_GROUPS: RawGroup[] = [
  {
    label: "Shop",
    items: [
      { slug: "profile", label: "Profile" },
      { slug: "numbering", label: "Numbering" },
      { slug: "financial", label: "Financial" },
      { slug: "documents", label: "Documents" },
      { slug: "workflow", label: "Workflow" },
      { slug: "automation", label: "Automation" },
      { slug: "production", label: "Production" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { slug: "locations", label: "Locations" },
      { slug: "templates", label: "Checklists" },
      { slug: "message-templates", label: "Messages" },
      { slug: "sample-data", label: "Sample data" },
    ],
  },
  {
    label: "People",
    items: [
      { slug: "team", label: "Team" },
      { slug: "notifications-defaults", label: "Notification defaults" },
      { slug: "franchise", label: "Group", gate: "franchiseGroup" },
    ],
  },
  {
    label: "Account",
    items: [
      { slug: "notifications", label: "Notifications" },
      { slug: "security", label: "Security" },
      { slug: "billing", label: "Billing" },
      { slug: "danger", label: "Danger zone" },
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

  // Resolve gates. We only have one today (franchiseGroup), but this
  // scales to more without each page having to know about the nav.
  const resolvedGroups: SettingsNavGroup[] = await Promise.all(
    RAW_GROUPS.map(async (g) => {
      const items = await Promise.all(
        g.items.map(async (item) => {
          if (!item.gate) return item;
          const allowed = await isEntitled(ctx.tenant.id, ctx.tenant.plan, item.gate);
          return allowed ? item : null;
        }),
      );
      return {
        label: g.label,
        items: items.filter((x): x is RawItem => x !== null),
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

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <SettingsNav slug={slug} groups={resolvedGroups} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
