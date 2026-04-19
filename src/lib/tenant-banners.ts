// Phase 1 — Core SaaS Foundation — workspace banner derivation.
//
// The tenant shell (src/app/t/[slug]/layout.tsx) renders at most a small
// stack of banners at the top of every page:
//
//   1. Environment ribbon — TEST or DEMO environments always show a ribbon
//      so real data and sandbox data can't be mistaken.
//   2. Impersonation bar — already rendered separately; we don't duplicate
//      here.
//   3. Trial countdown — "Trial ends in Xd" nudges, escalating tone under
//      7 days, blocking tone on day 0.
//   4. Past due — structured warning when status is PAST_DUE.
//   5. Archived — if somehow a member lands in an ARCHIVED workspace
//      (shouldn't happen because requireTenant redirects them, but we
//      show it as a failsafe inside platform-staff impersonation).
//
// Keeping derivation in one function means the UI is a straight render —
// the shell calls tenantBanners(tenant) and renders whatever comes back.

import type { Tenant } from "@prisma/client";

export type TenantBannerTone = "info" | "accent" | "warning" | "danger";

export type TenantBanner = {
  /** Stable id — React key; also usable as a dismiss token later. */
  id: string;
  tone: TenantBannerTone;
  title: string;
  body?: string;
  /** Optional CTA — e.g. `/t/[slug]/settings/billing`. */
  href?: string;
  ctaLabel?: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;

type Input = Pick<
  Tenant,
  "slug" | "status" | "environment" | "trialEndsAt" | "archivedAt" | "scheduledDeletionAt"
>;

export function tenantBanners(t: Input, now = new Date()): TenantBanner[] {
  const out: TenantBanner[] = [];

  // ── Environment ribbon — non-LIVE always visible. Renders first so it
  // sits directly under the workspace header.
  if (t.environment === "TEST") {
    out.push({
      id: "env-test",
      tone: "warning",
      title: "Test environment",
      body: "This workspace is marked as a sandbox — data here is not production.",
    });
  } else if (t.environment === "DEMO") {
    out.push({
      id: "env-demo",
      tone: "accent",
      title: "Demo account",
      body: "Shown to prospects. Billing is disabled; audit and reporting are unaffected.",
    });
  }

  // ── Archived — failsafe; normally requireTenant redirects before we
  // render the shell, but platform-staff impersonation can still reach it.
  if (t.status === "ARCHIVED" || t.archivedAt) {
    const deletionIn = t.scheduledDeletionAt
      ? Math.max(0, Math.ceil((t.scheduledDeletionAt.getTime() - now.getTime()) / DAY_MS))
      : null;
    out.push({
      id: "status-archived",
      tone: "danger",
      title: "Workspace archived",
      body: deletionIn != null
        ? `Scheduled for permanent deletion in ${deletionIn} day${deletionIn === 1 ? "" : "s"}. Platform staff can restore before then.`
        : "Data is retained until a platform admin restores or permanently deletes.",
    });
    return out; // nothing else matters once archived
  }

  // ── Past due — single loud banner with a link to billing.
  if (t.status === "PAST_DUE") {
    out.push({
      id: "status-past-due",
      tone: "danger",
      title: "Payment past due",
      body: "Update your payment method to avoid service interruption.",
      href: `/t/${t.slug}/settings/billing`,
      ctaLabel: "Update billing",
    });
  }

  // ── Trial countdown.
  if (t.status === "TRIAL" && t.trialEndsAt) {
    const days = Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
    if (days <= 0) {
      out.push({
        id: "trial-expired",
        tone: "danger",
        title: "Your trial has ended",
        body: "Pick a plan to keep using Flowtora. Your data is safe while you decide.",
        href: `/t/${t.slug}/settings/billing`,
        ctaLabel: "Choose a plan",
      });
    } else if (days <= 3) {
      out.push({
        id: `trial-${days}`,
        tone: "danger",
        title: `Trial ends in ${days} day${days === 1 ? "" : "s"}`,
        body: "Add a payment method now to avoid losing access.",
        href: `/t/${t.slug}/settings/billing`,
        ctaLabel: "Set up billing",
      });
    } else if (days <= 7) {
      out.push({
        id: `trial-${days}`,
        tone: "warning",
        title: `Trial ends in ${days} days`,
        body: "You can add a payment method any time — no change until day 0.",
        href: `/t/${t.slug}/settings/billing`,
        ctaLabel: "Set up billing",
      });
    }
  }

  return out;
}
