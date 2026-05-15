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
      <header
        className="relative mb-5 overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 9,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </span>
          <div>
            <h1
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 24,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              Settings
            </h1>
            <p
              className="mt-0.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              Configure how{" "}
              <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
                {ctx.tenant.name}
              </span>{" "}
              runs in Flowtora.
            </p>
          </div>
        </div>
      </header>

      <SettingsShell slug={slug} tabs={visible}>
        {children}
      </SettingsShell>
    </div>
  );
}
