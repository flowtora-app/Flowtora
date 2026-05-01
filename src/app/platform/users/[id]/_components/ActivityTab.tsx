import { Card, CardBody, CardHeader } from "@/components/ui";
import type { UserActivityRow } from "@/server/platform/users-list";
import Link from "next/link";

// ActivityTab — chronological audit-log timeline scoped to this user.
// Mostly read-only; clicking the tenant column links into the tenant
// detail page so an admin can pivot.

export function ActivityTab({ rows }: { rows: UserActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No activity</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            This user hasn&apos;t produced any audit-log rows yet.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title={`Recent activity (${rows.length})`}
                  description="Audit-log rows attributed to this user, newest first." />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>When</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Action</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Entity</th>
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
                    {r.entityType ? `${r.entityType}${r.entityId ? `:${r.entityId}` : ""}` : <span style={{ color: "var(--text-faint)" }}>—</span>}
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
      </CardBody>
    </Card>
  );
}
