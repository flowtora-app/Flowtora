import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import type {
  BuiltInRoleRow,
  CustomRoleRow,
} from "@/server/platform/roles-page";

// PlatformRolesTab — list of every PlatformRole with assigned-count
// + permission-count summary. Click row → role detail page.

export function PlatformRolesTab({
  roles,
  customRoles,
}: {
  roles: BuiltInRoleRow[];
  customRoles: CustomRoleRow[];
}) {
  return (
    <Card>
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Role</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Description</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Permissions</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}># Admins</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Variant</th>
                <th className="w-24 px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2">
                    <Link href={`/platform/access/roles/${r.id}`}
                          className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 max-w-[420px]" style={{ color: "var(--text-muted)" }}>
                    {r.description}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.permissions.length}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.assignedCount}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                      Built-in
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/platform/access/roles/${r.id}`}
                          className="text-[11px] hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {customRoles.filter((c) => c.status !== "ARCHIVED").map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
                  <td className="px-3 py-2">
                    <Link href={`/platform/access/roles/${r.id}`}
                          className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.name}
                    </Link>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>{r.key}</div>
                  </td>
                  <td className="px-3 py-2 max-w-[420px]" style={{ color: "var(--text-muted)" }}>
                    {r.description ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.permissions.length}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.assignedCount}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: r.status === "ACTIVE" ? "var(--emerald-50)" : "var(--amber-50)",
                            color: r.status === "ACTIVE" ? "var(--emerald-700)" : "var(--amber-700)",
                          }}>
                      Custom · {r.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/platform/access/roles/${r.id}`}
                          className="text-[11px] hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                      Edit →
                    </Link>
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
