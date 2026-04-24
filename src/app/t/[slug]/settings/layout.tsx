import { requireTenant } from "@/lib/tenant";
import { isEntitled } from "@/lib/entitlements";
import { hasPermission } from "@/lib/rbac";
import { SettingsShell, type ResolvedSettingsTab } from "@/components/settings/SettingsShell";
import { SETTINGS_TABS } from "@/components/settings/tabs";

// Phase 4 (transformation) — Settings chrome.
//
// Swapped the flat 6-group sidebar for a 6-tab shell. The raw IA lives
// in `@/components/settings/tabs.ts` alongside permission metadata; we
// resolve RBAC + plan gates here so the shell component stays dumb.
//
// What the user sees:
//   • Top: horizontal tab bar (Profile & branding / Money / Workflow /
//     Team / Me / Advanced).
//   • Left of content: sub-section nav scoped to the active tab.
//   • Right: the sub-route's own page.
//
// URL structure is unchanged — /settings/<sub> still routes the same
// page. The shell classifies the current pathname into a tab and
// highlights accordingly. This keeps server-action redirect targets
// and every cross-link in the codebase intact.

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);

  // Filter every tab's items against the caller's role + tenant plan.
  // Tabs that end up empty still render as a disabled-looking pill so
  // the user understands the IA; clicking them lands on /settings
  // which will re-route them to the first visible tab (see page.tsx).
  type ResolvedItem = { slug: string; label: string; description?: string };
  const resolved: ResolvedSettingsTab[] = await Promise.all(
    SETTINGS_TABS.map(async (tab) => {
      const maybeItems = await Promise.all(
        tab.items.map(async (item): Promise<ResolvedItem | null> => {
          if (item.ownerOnly && ctx.role !== "OWNER") return null;
          if (item.adminOrOwner && ctx.role !== "OWNER" && ctx.role !== "ADMIN") return null;
          if (item.perm && !hasPermission(ctx.role, item.perm)) return null;
          if (item.gate) {
            const allowed = await isEntitled(ctx.tenant.id, ctx.tenant.plan, item.gate);
            if (!allowed) return null;
          }
          return {
            slug: item.slug,
            label: item.label,
            ...(item.description ? { description: item.description } : {}),
          };
        }),
      );
      const items = maybeItems.filter((x): x is ResolvedItem => x !== null);
      return {
        id: tab.id,
        label: tab.label,
        blurb: tab.blurb,
        items,
      };
    }),
  );

  // Drop tabs where every sub-section was filtered out — no point
  // showing a tab that can't land anywhere.
  const visible = resolved.filter((t) => t.items.length > 0);

  return (
    <div>
      <header className="mb-6">
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

      <SettingsShell slug={slug} tabs={visible}>
        {children}
      </SettingsShell>
    </div>
  );
}
