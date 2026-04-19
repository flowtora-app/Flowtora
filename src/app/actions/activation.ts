"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Phase 4 Slice D / F — activation banner + member welcome dismissal.
//
// Two mutations, both intentionally small and server-action flavor so
// they work inside a plain <form action={…}>. No redirects — we stamp a
// timestamp and revalidate the layout so the banner disappears on the
// next render.

/**
 * Stamp `Tenant.activationDismissedAt`. The persistent "finish setup"
 * banner rearms 7 days later in `shouldShowActivationBanner`, so this
 * is a snooze, not a permanent dismissal.
 */
export async function dismissActivationBanner(slug: string) {
  const ctx = await requireTenant(slug);
  // Only owners/admins ever see the banner; other roles can't trigger
  // the dismissal through the UI, but guard anyway so a direct hit
  // from curl doesn't mutate tenant state.
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return;
  }
  await db.tenant.update({
    where: { id: ctx.tenant.id },
    data: { activationDismissedAt: new Date() },
  });
  revalidatePath(`/t/${slug}`, "layout");
}

/**
 * Stamp `Membership.welcomeSeenAt` so the non-admin first-run welcome
 * card doesn't render again for this user on this workspace.
 */
export async function dismissMemberWelcome(slug: string) {
  const ctx = await requireTenant(slug);
  // Owners/admins don't see the welcome card — they go through the
  // full onboarding wizard. Still, only touch the caller's own
  // membership, not anyone else's.
  await db.membership.update({
    where: {
      userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenant.id },
    },
    data: { welcomeSeenAt: new Date() },
  });
  revalidatePath(`/t/${slug}`, "layout");
}
