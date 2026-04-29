import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/legal — hub for compliance, data exports, deletion
// requests, and policy versions. The "show me what we've kept and
// what we've deleted" surface for audits and DSAR responses.

export const dynamic = "force-dynamic";

export default async function LegalHub() {
  await requirePlatformStaff();

  const [pendingExports, pendingDeletions, recentMerges] = await Promise.all([
    db.dataExportRequest.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }).catch(() => 0),
    db.accountDeletionRequest.count({ where: { status: "SCHEDULED" } }).catch(() => 0),
    db.userMergeRecord.count({ where: { executedAt: { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }).catch(() => 0),
  ]);

  return (
    <SectionPage
      eyebrow="Legal"
      eyebrowIcon="Scale"
      title="Legal"
      description="Compliance posture, data-export + deletion request handling, policy version history. The DSAR + audit-readiness surface."
      tiles={[
        {
          href: "/platform/compliance",
          icon: "Scale",
          title: "Compliance",
          description: `Data-governance control center. ${pendingExports + pendingDeletions > 0 ? `${pendingExports + pendingDeletions} pending DSARs` : "No pending DSARs"}.`,
          meta: pendingExports + pendingDeletions > 0 ? String(pendingExports + pendingDeletions) : undefined,
        },
        {
          href: "/platform/audit?action=platform.merged_user",
          icon: "FileText",
          title: "Merge & purge audit",
          description: `${recentMerges} cross-tenant merges in the last 30 days. Full hard-delete history for GDPR audits.`,
          meta: String(recentMerges),
        },
      ]}
      roadmap={[
        {
          title: "Policy version manager",
          body: "Track every revision of Terms, Privacy, DPA. Auto-prompt tenants to re-accept on material change.",
        },
        {
          title: "Standard SCC + DPA generator",
          body: "Per-tenant DPA generation from a templated form, signed via internal e-sign flow.",
        },
        {
          title: "SOC 2 / ISO evidence drawer",
          body: "Map controls to audit evidence — access reviews, change management, vendor list.",
        },
      ]}
    />
  );
}
