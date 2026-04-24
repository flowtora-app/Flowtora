import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isEntitled } from "@/lib/entitlements";
import { hasPermission } from "@/lib/rbac";
import { SETTINGS_TABS } from "@/components/settings/tabs";

// Phase 4 (transformation) — the settings card-grid hub is gone.
//
// The old /settings page tried to act as a "find-a-setting" launcher
// via a 5-section card grid. With a tabbed shell now wrapping every
// sub-route, the card grid is redundant — the tab bar IS the launcher.
// So /settings just redirects to the caller's first accessible sub-
// section, preserving compat for existing bookmarks and deep-links.
//
// We walk the canonical tab list in order, filter by RBAC + plan
// entitlements, and redirect to the first item we find. An empty-handed
// caller (no tenant-level settings at all — only personal /me) still
// lands somewhere sensible because the "me" tab is ungated.

export default async function SettingsIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);

  for (const tab of SETTINGS_TABS) {
    for (const item of tab.items) {
      if (item.ownerOnly && ctx.role !== "OWNER") continue;
      if (item.adminOrOwner && ctx.role !== "OWNER" && ctx.role !== "ADMIN") continue;
      if (item.perm && !hasPermission(ctx.role, item.perm)) continue;
      if (item.gate) {
        const allowed = await isEntitled(ctx.tenant.id, ctx.tenant.plan, item.gate);
        if (!allowed) continue;
      }
      redirect(`/t/${slug}/settings/${item.slug}`);
    }
  }

  // Absolute worst case — no tab items visible (shouldn't happen; the
  // "me" tab is never gated). Bounce to the home dashboard.
  redirect(`/t/${slug}`);
}
