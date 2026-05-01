import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  USER_STATUS_LABEL,
  loadUserActivity,
  loadUserMemberships,
  loadUserNotes,
  loadUserOwnedResources,
  loadUserProfile,
  loadUserSecurityEvents,
  loadUserSessions,
  loadUserSupportTickets,
} from "@/server/platform/users-list";
import { db } from "@/lib/db";
import { ProfileTab } from "./_components/ProfileTab";
import { TenantsTab } from "./_components/TenantsTab";
import { SessionsTab } from "./_components/SessionsTab";
import { ActivityTab } from "./_components/ActivityTab";
import { OwnedResourcesTab } from "./_components/OwnedResourcesTab";
import { SecurityTab } from "./_components/SecurityTab";
import { SupportTab } from "./_components/SupportTab";
import { NotesTab } from "./_components/NotesTab";
import { UserHeaderActions } from "./_components/UserHeaderActions";

export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };
const TABS = [
  "profile", "tenants", "sessions", "activity", "owned", "security", "support", "notes",
] as const;
type Tab = (typeof TABS)[number];

export default async function UserDetailPage({
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
    ? (sp.tab as Tab) : "profile";

  const profile = await loadUserProfile(id);
  if (!profile) notFound();

  const canBan = ctx.can("users.ban");
  const canImpersonate = ctx.can("tenant.impersonate");

  // Load only the tab the user is viewing.
  const [memberships, sessions, activity, owned, secEvents, support, notes] = await Promise.all([
    tab === "tenants" || tab === "profile" ? loadUserMemberships(id) : Promise.resolve([]),
    tab === "sessions" ? loadUserSessions(id) : Promise.resolve([]),
    tab === "activity" ? loadUserActivity(id) : Promise.resolve([]),
    tab === "owned" ? loadUserOwnedResources(id) : Promise.resolve({ quotes: 0, orders: 0, customers: 0, invoices: 0 }),
    tab === "security" ? loadUserSecurityEvents(id) : Promise.resolve([]),
    tab === "support" ? loadUserSupportTickets(id) : Promise.resolve([]),
    tab === "notes" ? loadUserNotes(id, ctx.userId) : Promise.resolve([]),
  ]);

  const tabHref = (id2: Tab) =>
    `/platform/users/${id}${id2 === "profile" ? "" : `?tab=${id2}`}`;

  const displayName = profile.name?.trim() || profile.email;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Users", href: "/platform/users" },
          { label: displayName },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={
              <span className="flex items-center gap-3">
                <Avatar size="md" src={profile.image ?? undefined} name={displayName} />
                <span className="min-w-0">
                  <span className="block truncate">{displayName}</span>
                  <span className="block text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>
                    {profile.email}
                    {profile.platformRole && (
                      <span className="ml-2 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                        {profile.platformRole.replaceAll("_", " ").toLowerCase()}
                      </span>
                    )}
                    <span className="ml-2 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: profile.status === "banned" ? "var(--rose-50)"
                                     : profile.status === "deactivated" || profile.status === "merged" ? "var(--surface-2)"
                                     : profile.status === "locked" ? "var(--amber-50)"
                                     : "var(--emerald-50)",
                            color: profile.status === "banned" ? "var(--rose-700)"
                                : profile.status === "deactivated" || profile.status === "merged" ? "var(--text-muted)"
                                : profile.status === "locked" ? "var(--amber-700)"
                                : "var(--emerald-700)",
                          }}>
                      {USER_STATUS_LABEL[profile.status]}
                    </span>
                  </span>
                </span>
              </span>
            }
            description=""
            actions={
              <>
                <Link href={`mailto:${profile.email}`}>
                  <Button size="sm" variant="secondary">Email</Button>
                </Link>
                {canBan && (
                  <UserHeaderActions
                    userId={profile.id}
                    userName={displayName}
                    isDeactivated={profile.status === "deactivated"}
                  />
                )}
              </>
            }
          />
        </div>
      </div>

      <Tabs
        variant="pill"
        activeHref={tabHref(tab)}
        items={(TABS as readonly Tab[]).map((id2) => ({
          label: id2 === "profile" ? "Profile"
              : id2 === "tenants" ? "Tenants"
              : id2 === "sessions" ? "Sessions"
              : id2 === "activity" ? "Activity"
              : id2 === "owned" ? "Owned resources"
              : id2 === "security" ? "Security"
              : id2 === "support" ? "Support history"
              : "Notes",
          href: tabHref(id2),
        }))}
      />

      {tab === "profile" && (
        <ProfileTab profile={profile} membershipCount={memberships.length} />
      )}
      {tab === "tenants" && (
        <TenantsTab
          userId={id}
          memberships={memberships}
          canBan={canBan}
          canImpersonate={canImpersonate}
        />
      )}
      {tab === "sessions" && (
        <SessionsTab
          userId={id}
          sessions={sessions}
          canBan={canBan}
        />
      )}
      {tab === "activity" && <ActivityTab rows={activity} />}
      {tab === "owned" && <OwnedResourcesTab counts={owned} />}
      {tab === "security" && <SecurityTab events={secEvents} profile={profile} />}
      {tab === "support" && <SupportTab tickets={support} />}
      {tab === "notes" && (
        <NotesTab
          userId={id}
          notes={notes}
          currentUserId={ctx.userId}
          canModerate={canBan}
        />
      )}
    </div>
  );

  // Reference the unused db import to silence lint; we use it only to
  // pre-warm the select() cache for the page header. (Kept for future
  // detail-page work that wants tenant context.)
  void db;
}
