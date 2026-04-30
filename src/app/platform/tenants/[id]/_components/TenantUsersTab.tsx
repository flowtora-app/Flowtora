import { db } from "@/lib/db";
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  StatusPill,
} from "@/components/ui";

const ROLE_COLOR: Record<string, "neutral" | "brand" | "success" | "info" | "accent" | "warning" | "error"> = {
  OWNER:              "accent",
  ADMIN:              "brand",
  SALES_REP:          "success",
  CSR:                "info",
  DESIGNER:           "info",
  PRODUCTION_MANAGER: "neutral",
  INSTALLER:          "neutral",
  ACCOUNTING:         "warning",
  EMPLOYEE:           "neutral",
};

export interface TenantUsersTabProps {
  tenantId: string;
  ownerEmail: string | null;
  canImpersonate: boolean;
  canTag: boolean;
}

export async function TenantUsersTab({ tenantId, ownerEmail, canImpersonate, canTag }: TenantUsersTabProps) {
  const memberships = await db.membership.findMany({
    where: { tenantId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, role: true, status: true, createdAt: true,
      user: {
        select: {
          id: true, name: true, email: true,
          twoFactorEnabled: true, lastLoginAt: true,
          bannedAt: true, mergedAt: true,
        },
      },
    },
  });

  if (memberships.length === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          title="No users yet"
          description="Memberships appear here once owners invite their team."
        />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <CardHeader
          title="Users"
          description={`${memberships.length} member${memberships.length === 1 ? "" : "s"} ${ownerEmail ? `· owner ${ownerEmail}` : ""}`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>MFA</Th>
              <Th>Last login</Th>
              <Th>Joined</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => {
              const isBanned = !!m.user.bannedAt;
              const isMerged = !!m.user.mergedAt;
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar size="xs" name={m.user.name ?? m.user.email} />
                      <div className="min-w-0">
                        <div className="truncate font-medium" style={{ color: "var(--text-default)" }}>
                          {m.user.name ?? m.user.email}
                        </div>
                        <a href={`mailto:${m.user.email}`} className="truncate text-[10px] hover:underline" style={{ color: "var(--text-muted)" }}>
                          {m.user.email}
                        </a>
                      </div>
                    </div>
                  </Td>
                  <Td><Badge size="xs" color={ROLE_COLOR[m.role] ?? "neutral"}>{m.role.toLowerCase().replace("_", " ")}</Badge></Td>
                  <Td>
                    {isBanned
                      ? <StatusPill status="suspended" size="sm" />
                      : isMerged
                      ? <Badge size="xs" color="info">Merged</Badge>
                      : m.status === "ACTIVE"
                      ? <StatusPill status="active" size="sm" />
                      : <StatusPill status="suspended" size="sm" />}
                  </Td>
                  <Td>
                    {m.user.twoFactorEnabled
                      ? <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "var(--emerald-500)" }} />
                      : <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: "var(--slate-400)" }} />}
                  </Td>
                  <Td>{m.user.lastLoginAt ? formatRelative(m.user.lastLoginAt) : <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                  <Td>{m.createdAt.toLocaleDateString()}</Td>
                  <Td>
                    <div className="flex items-center gap-1 text-[11px]">
                      {canImpersonate && (
                        <a href={`/platform/users/${m.user.id}`} className="hover:underline" style={{ color: "var(--accent-primary)" }}>Open</a>
                      )}
                      <span style={{ color: "var(--text-faint)" }}>·</span>
                      <a href={`mailto:${m.user.email}`} className="hover:underline" style={{ color: "var(--text-muted)" }}>Email</a>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CardBody>
        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Per-user actions (Reset password, Force MFA, Resend invite, Revoke session, Change role,
          Deactivate) live on the user detail page at <code>/platform/users/[id]</code>.
          {!canImpersonate && " Your role can't impersonate users."}
          {!canTag && " Your role is read-only on user roster changes."}
        </div>
      </CardBody>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>{children}</td>;
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)  return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day)  return `${Math.floor(ms / hour)}h`;
  return `${Math.floor(ms / day)}d ago`;
}
