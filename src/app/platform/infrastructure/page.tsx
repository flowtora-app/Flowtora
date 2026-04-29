import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/infrastructure — hub for system health, usage, feature
// flags, readiness checks. Things you'd page through to answer "is
// the platform healthy?"

export const dynamic = "force-dynamic";

export default async function InfrastructureHub() {
  await requirePlatformStaff();

  const [tenantCount, activeTenants, flagCount, recentReadiness] = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
    db.featureFlag.count(),
    db.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] }, onboardingCompletedAt: { not: null } } }),
  ]);

  return (
    <SectionPage
      eyebrow="Infrastructure"
      eyebrowIcon="Heartbeat"
      title="Infrastructure"
      description="System health, usage, readiness, feature-flag rollouts. The mission-control surface for keeping the platform running."
      tiles={[
        {
          href: "/platform/health",
          icon: "Heartbeat",
          title: "Health",
          description: "Live monitoring — DB latency, queue depth, recent errors, tenant cohort health roll-ups.",
        },
        {
          href: "/platform/usage",
          icon: "Activity",
          title: "Usage",
          description: `${activeTenants} of ${tenantCount} tenants active. Per-tenant resource usage + storage quota.`,
          meta: `${activeTenants}/${tenantCount}`,
        },
        {
          href: "/platform/readiness",
          icon: "Rocket",
          title: "Readiness",
          description: `${recentReadiness} tenants with completed onboarding. Activation funnel + per-tenant blockers.`,
          meta: String(recentReadiness),
        },
        {
          href: "/platform/feature-flags",
          icon: "Flag",
          title: "Feature flags",
          description: "Cohort-targeted rollouts and emergency kill-switches.",
          meta: String(flagCount),
        },
      ]}
      callout={{
        title: "Background jobs",
        body: "Three crons run: hourly dunning advance, daily merged-user purge, daily reminder fan-out. Logs land in the audit trail with source=cron. A dedicated jobs UI is on the roadmap.",
        href: "/platform/audit?action=cron",
        cta: "View cron audit",
      }}
    />
  );
}
