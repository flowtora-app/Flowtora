import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadInvitesKpi,
  loadInvitesList,
  type InvitesFilters,
} from "@/server/platform/platform-invites";
import { db } from "@/lib/db";
import type { PlatformInviteStatus, PlatformRole } from "@prisma/client";
import { InviteAdminButton } from "./_components/InviteAdminButton";
import { InvitesFiltersBar } from "./_components/InvitesFiltersBar";
import { InvitesTable } from "./_components/InvitesTable";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUSES: PlatformInviteStatus[] = ["SENT", "OPENED", "ACCEPTED", "EXPIRED", "REVOKED"];
const ROLES: PlatformRole[] = [
  "SUPER_ADMIN", "SITE_MANAGER", "SUPPORT_AGENT", "ADMIN", "MANAGER",
  "SUPPORT_LEAD", "BILLING_MANAGER", "DEVELOPER", "MARKETING_MANAGER",
  "CONTENT_MANAGER", "ANALYST", "READ_ONLY_VIEWER",
];

function parseFilters(sp: SearchParams): InvitesFilters {
  const f: InvitesFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.status === "string" && (STATUSES as string[]).includes(sp.status)) {
    f.status = sp.status as PlatformInviteStatus;
  }
  if (typeof sp.role === "string" && (ROLES as string[]).includes(sp.role)) {
    f.role = sp.role as PlatformRole;
  }
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  return f;
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canEdit = ctx.can("staff.invite");

  const [kpi, rows, customRoles, teams] = await Promise.all([
    loadInvitesKpi(),
    loadInvitesList(parseFilters(sp)),
    db.customPlatformRole.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, key: true },
    }),
    db.platformTeam.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, key: true },
    }),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Invitations" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Invitations"
            description="Manage pending platform-admin invitations."
            actions={canEdit ? (
              <InviteAdminButton
                roles={ROLES}
                customRoles={customRoles}
                teams={teams}
              />
            ) : null}
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Pending"           value={kpi.pending.toString()}
             tone={kpi.pending > 0 ? "warning" : "default"} />
        <Kpi label="Accepted · 30d"    value={kpi.acceptedLast30d.toString()} tone="good" />
        <Kpi label="Expired"           value={kpi.expired.toString()} />
        <Kpi label="Revoked"           value={kpi.revoked.toString()} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <InvitesFiltersBar
          statuses={STATUSES}
          roles={ROLES}
        />
      </Card>

      {/* Table */}
      <InvitesTable
        rows={rows}
        roles={ROLES}
        customRoles={customRoles}
        canEdit={canEdit}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "default" | "good" | "warning" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
      </div>
    </Card>
  );
}
