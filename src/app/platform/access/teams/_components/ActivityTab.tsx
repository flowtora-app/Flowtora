import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui";
import type { TeamActivityRow } from "@/server/platform/teams";

export function ActivityTab({ rows }: { rows: TeamActivityRow[] }) {
  return (
    <Card>
      <CardHeader title={`Team activity (${rows.length})`}
                  description="Audit-log rows authored by any current member of this team. Honest approximation — we don't tag rows with team id today." />
      <CardBody>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
            No activity yet from this team.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>When</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Action</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Author</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {r.createdAt.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--text-default)" }}>{r.action}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {r.userEmail ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.tenantId && r.tenantName ? (
                        <Link href={`/platform/tenants/${r.tenantId}`} className="hover:underline"
                              style={{ color: "var(--text-default)" }}>
                          {r.tenantName}
                        </Link>
                      ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
