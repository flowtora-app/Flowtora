import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/security — hub bundling staff/RBAC, abuse + bans, the
// audit log, and feature flags. Each tile shows a live status chip
// so admins can see "are we okay?" at a glance.

export const dynamic = "force-dynamic";

export default async function SecurityHub() {
  await requirePlatformStaff();

  const now = new Date();
  const [
    staffCount,
    activeElevations,
    bannedUsers,
    activeIpBans,
    activeDomainBans,
    auditLast24h,
    flagCount,
  ] = await Promise.all([
    db.user.count({ where: { platformRole: { not: null } } }),
    db.platformRoleElevation.count({
      where: { revokedAt: null, expiresAt: { gt: now } },
    }),
    db.user.count({ where: { bannedAt: { not: null } } }),
    db.banRecord.count({
      where: { kind: "IP", liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    db.banRecord.count({
      where: { kind: "EMAIL_DOMAIN", liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
    db.auditLog.count({
      where: { createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    db.featureFlag.count(),
  ]);

  return (
    <SectionPage
      eyebrow="Security"
      eyebrowIcon="Shield"
      title="Security"
      description="Staff access, abuse + bans, audit trail, and feature-flag overrides. Every mutation that touches a tenant or user lands in the audit log here."
      tiles={[
        {
          href: "/platform/staff",
          icon: "Shield",
          title: "Staff & roles",
          description: `${staffCount} staff total${activeElevations > 0 ? ` · ${activeElevations} elevated` : ""}. Manage baseline + custom roles, time-bounded elevation.`,
          meta: String(staffCount),
        },
        {
          href: "/platform/abuse",
          icon: "Shield",
          title: "Abuse & bans",
          description: `${bannedUsers} users · ${activeIpBans} IPs · ${activeDomainBans} domains banned. Sign-in refuses any active ban.`,
          meta: String(bannedUsers + activeIpBans + activeDomainBans),
        },
        {
          href: "/platform/audit",
          icon: "FileText",
          title: "Audit log",
          description: `${auditLast24h} actions in the last 24h. Every mutation by staff or system writes here.`,
          meta: String(auditLast24h),
        },
        {
          href: "/platform/feature-flags",
          icon: "Flag",
          title: "Feature flags",
          description: "Per-tenant rollouts and emergency kill-switches. Wired into RSC + middleware.",
          meta: String(flagCount),
        },
      ]}
      callout={{
        title: "Recent activity",
        body: "Auth-side ban enforcement is wired into the credentials authorize() and the magic-link signIn callback. CIDR ranges supported on IP bans. Edge-middleware IP gating still requires Vercel KV / Upstash to do meaningfully — currently deferred.",
      }}
    />
  );
}
