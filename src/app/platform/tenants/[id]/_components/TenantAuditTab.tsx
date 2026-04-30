import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { classifySeverity, classifySource } from "@/server/platform/activity-feed";

// Tab 12 — Audit Log. Tenant-scoped feed; full filtering lives on
// /platform/activity (we link out for that).

export interface TenantAuditTabProps { tenantId: string; canExport: boolean }

export async function TenantAuditTab({ tenantId, canExport }: TenantAuditTabProps) {
  const rows = await db.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, action: true, entityType: true, entityId: true,
      ipAddress: true, userAgent: true, createdAt: true,
      userId: true,
    },
  });

  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x))));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, platformRole: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const exportHref = `/api/platform/activity/export?tenantIds=${tenantId}&format=csv`;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <CardHeader
          title="Audit log"
          description={`${rows.length} most recent events scoped to this tenant`}
          right={
            <div className="flex items-center gap-2">
              {canExport && (
                <Link href={exportHref}>
                  <Button size="xs" variant="ghost">Export CSV</Button>
                </Link>
              )}
              <Link href={`/platform/activity?tenantIds=${tenantId}`}>
                <Button size="xs" variant="secondary">Open in feed</Button>
              </Link>
            </div>
          }
        />
      </div>
      {rows.length === 0 ? (
        <CardBody><EmptyState title="No audit events for this tenant" description="As soon as members or platform staff act on this account, events land here." /></CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <Th>When</Th><Th>Action</Th><Th>Severity</Th><Th>Source</Th><Th>Actor</Th><Th>Entity</Th><Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sev = classifySeverity(r.action);
                const src = classifySource(r.action, !!r.userId);
                const actor = r.userId ? userById.get(r.userId) : null;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td><span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{r.createdAt.toLocaleString()}</span></Td>
                    <Td><span className="font-mono">{r.action}</span></Td>
                    <Td>
                      {sev === "info"
                        ? <span style={{ color: "var(--text-faint)" }}>info</span>
                        : <Badge size="xs" color={sev === "critical" ? "error" : sev === "warning" ? "warning" : "info"}>{sev}</Badge>}
                    </Td>
                    <Td><span style={{ color: "var(--text-muted)" }}>{src}</span></Td>
                    <Td>
                      {actor
                        ? <span title={actor.email}>{actor.name ?? actor.email}{actor.platformRole ? <Badge size="xs" color="info" className="ml-1.5">staff</Badge> : null}</span>
                        : <span style={{ color: "var(--text-faint)" }}>system</span>}
                    </Td>
                    <Td>{r.entityType ?? <span style={{ color: "var(--text-faint)" }}>—</span>}{r.entityId ? <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{r.entityId.slice(0, 8)}</span> : null}</Td>
                    <Td><span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{r.ipAddress ?? "—"}</span></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top" style={{ color: "var(--text-default)" }}>{children}</td>;
}
