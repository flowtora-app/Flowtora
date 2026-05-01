import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  loadCurrentOnCall,
  loadTeamActivity,
  loadTeamDetail,
  loadTeamMembers,
  loadTeamShifts,
} from "@/server/platform/teams";
import { MembersTab } from "../_components/MembersTab";
import { PermissionsTab } from "../_components/PermissionsTab";
import { OnCallTab } from "../_components/OnCallTab";
import { ActivityTab } from "../_components/ActivityTab";
import { SettingsTab } from "../_components/SettingsTab";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };
const TABS = ["members", "permissions", "oncall", "activity", "settings"] as const;
type Tab = (typeof TABS)[number];

const DAY = 86_400_000;

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab) : "members";

  const detail = await loadTeamDetail(id);
  if (!detail) notFound();

  const canEdit = ctx.can("staff.assign_role");

  // 4-week window for the on-call calendar (2 past + 2 future).
  const now = new Date();
  const windowStart = new Date(now.getTime() - 14 * DAY);
  const windowEnd = new Date(now.getTime() + 14 * DAY);

  const [members, shifts, activity, currentOnCall, customRoles, allStaff] = await Promise.all([
    tab === "members" || tab === "oncall" ? loadTeamMembers(id) : Promise.resolve([]),
    tab === "oncall" ? loadTeamShifts(id, windowStart, windowEnd) : Promise.resolve([]),
    tab === "activity" ? loadTeamActivity(id, 200) : Promise.resolve([]),
    tab === "members" || tab === "oncall" ? loadCurrentOnCall(id) : Promise.resolve([]),
    tab === "permissions" ? db.customPlatformRole.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true, status: true, permissions: true },
    }) : Promise.resolve([]),
    tab === "members" ? db.user.findMany({
      where: {
        OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }],
      },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true, image: true },
      take: 200,
    }) : Promise.resolve([]),
  ]);

  const tabHref = (id2: Tab) => `/platform/access/teams/${id}${id2 === "members" ? "" : `?tab=${id2}`}`;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Teams", href: "/platform/access/teams" },
          { label: detail.name },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={
              <span className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-3 w-3 rounded-full"
                      style={{ background: detail.color ? `#${detail.color}` : "var(--surface-3)" }} />
                <span>{detail.name}</span>
              </span>
            }
            description={detail.description ?? ""}
          />
        </div>
      </div>

      <Tabs
        variant="pill"
        activeHref={tabHref(tab)}
        items={(TABS as readonly Tab[]).map((id2) => ({
          label: id2 === "members" ? "Members"
              : id2 === "permissions" ? "Permissions"
              : id2 === "oncall" ? "On-call"
              : id2 === "activity" ? "Activity"
              : "Settings",
          href: tabHref(id2),
        }))}
      />

      {tab === "members" && (
        <MembersTab
          teamId={id}
          members={members}
          allStaff={allStaff.filter((u) => !members.some((m) => m.userId === u.id))}
          currentOnCall={currentOnCall}
          canEdit={canEdit}
        />
      )}
      {tab === "permissions" && (
        <PermissionsTab
          teamId={id}
          inheritedRoleKeys={detail.inheritedRoleKeys}
          customRoles={customRoles}
          canEdit={canEdit}
        />
      )}
      {tab === "oncall" && (
        <OnCallTab
          teamId={id}
          shifts={shifts}
          members={members}
          currentOnCall={currentOnCall}
          windowStart={windowStart}
          windowEnd={windowEnd}
          canEdit={canEdit}
          slackChannel={detail.slackChannel}
          notifyChannels={{
            slack: detail.notifySlack,
            pagerDuty: detail.notifyPagerDuty,
            sms: detail.notifySms,
          }}
        />
      )}
      {tab === "activity" && (
        <ActivityTab rows={activity} />
      )}
      {tab === "settings" && (
        <SettingsTab team={detail} canEdit={canEdit} />
      )}
    </div>
  );
}
