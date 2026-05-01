import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadTeamsKpi,
  loadTeamsList,
} from "@/server/platform/teams";
import { NewTeamButton } from "./_components/NewTeamButton";

export const dynamic = "force-dynamic";

// Page 11 — Teams list. Single table with name / description /
// member count / inherited roles / on-call indicator / created /
// per-row "Open →" link.

export default async function TeamsListPage() {
  const ctx = await requirePlatformStaff();
  const canEdit = ctx.can("staff.assign_role");

  const [kpi, rows] = await Promise.all([loadTeamsKpi(), loadTeamsList()]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Teams" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Teams"
            description="Organise platform admins into functional teams with on-call rotations and inherited roles."
            actions={canEdit ? <NewTeamButton /> : null}
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Teams"          value={kpi.total.toString()} />
        <Kpi label="With on-call"   value={kpi.withOnCall.toString()} />
        <Kpi label="Total members"  value={kpi.totalMembers.toString()} />
        <Kpi label="Shifts · 7d"    value={kpi.shiftsNext7d.toString()} />
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <Card padding="lg">
          <div className="text-center">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No teams yet</h3>
            <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
              Mint a team to organise admins by function (Engineering, Support, Sales, Finance, CSM…) and wire up
              on-call rotations.
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Team</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Description</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Members</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Inherited roles</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>On-call</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Created</th>
                <th className="w-20 px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="inline-block h-3 w-3 rounded-full"
                            style={{ background: r.color ? `#${r.color}` : "var(--surface-3)" }} />
                      <Link href={`/platform/access/teams/${r.id}`}
                            className="font-semibold hover:underline"
                            style={{ color: "var(--text-default)" }}>
                        {r.name}
                      </Link>
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>{r.key}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 max-w-[360px]" style={{ color: "var(--text-muted)" }}>
                    {r.description ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.memberCount}
                  </td>
                  <td className="px-3 py-2">
                    {r.inheritedRoleKeys.length === 0 ? (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.inheritedRoleKeys.map((k) => (
                          <span key={k} className="inline-flex items-center rounded-full px-1.5 text-[10px] font-mono"
                                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.currentOnCall ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar size="xs" name={r.currentOnCall.name ?? r.currentOnCall.email} />
                        <span className="text-[11px]" style={{ color: "var(--text-default)" }}>
                          {r.currentOnCall.name?.trim() || r.currentOnCall.email}
                        </span>
                      </div>
                    ) : r.hasOnCall ? (
                      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>scheduled</span>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/platform/access/teams/${r.id}`}
                          className="text-[11px] hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="md" className="h-full">
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
