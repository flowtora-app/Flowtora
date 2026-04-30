import { db } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar } from "@/components/ui";
import { TenantIpRulesEditor } from "./TenantSecurityClient";

// Tab 13 — Security. MFA % + SSO config + IP allowlist/blocklist +
// recent suspicious events + password / session policy hooks.

export interface TenantSecurityTabProps { tenantId: string; canEdit: boolean }

export async function TenantSecurityTab({ tenantId, canEdit }: TenantSecurityTabProps) {
  const since30d = new Date(Date.now() - 30 * 86_400_000);
  const [t, ipRules, memberships, recentFailures] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { ssoEnabled: true, ssoProvider: true, mfaEnforced: true },
    }),
    db.tenantIpRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    db.membership.findMany({
      where: { tenantId },
      select: { user: { select: { twoFactorEnabled: true } } },
    }),
    db.auditLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: since30d },
        OR: [
          { action: { contains: "auth.failed", mode: "insensitive" } },
          { action: { contains: "auth.locked", mode: "insensitive" } },
          { action: { contains: "rate.limit", mode: "insensitive" } },
          { action: { contains: "suspicious", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, action: true, ipAddress: true, createdAt: true },
    }),
  ]);
  if (!t) return null;

  const totalMembers = memberships.length;
  const mfaEnabled = memberships.filter((m) => m.user.twoFactorEnabled).length;
  const mfaPct = totalMembers === 0 ? 0 : Math.round((mfaEnabled / totalMembers) * 100);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader title="Multi-factor authentication" />
        <CardBody>
          <div className="flex items-center gap-4">
            <div className="text-[36px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{mfaPct}%</div>
            <div className="flex-1">
              <ProgressBar value={mfaPct} size="sm" tone={mfaPct >= 80 ? "success" : mfaPct >= 50 ? "warning" : "danger"} />
              <div className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                {mfaEnabled} / {totalMembers} members have 2FA enabled.
                {t.mfaEnforced ? " MFA is enforced for this tenant." : " MFA is optional today."}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="Single sign-on (SSO)" />
        <CardBody>
          {t.ssoEnabled ? (
            <div>
              <Badge size="xs" color="success">Enabled</Badge>
              <span className="ml-2 text-[13px]" style={{ color: "var(--text-default)" }}>
                Provider: <code className="font-mono">{t.ssoProvider ?? "(unspecified)"}</code>
              </span>
              <div className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                IdP metadata + SCIM endpoints surface in the legacy security console at <code>/platform/security</code>.
              </div>
            </div>
          ) : (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              SSO is not enabled. Members sign in with email + password.
            </div>
          )}
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="IP allowlist / blocklist" />
        <CardBody>
          {ipRules.length === 0 ? (
            <div className="mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
              No IP rules configured. By default any IP can authenticate.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="mb-3 w-full text-[12px]">
                <thead style={{ background: "var(--surface-2)" }}>
                  <tr><Th>Kind</Th><Th>CIDR</Th><Th>Note</Th><Th>Last hit</Th><Th>Hits</Th></tr>
                </thead>
                <tbody>
                  {ipRules.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <Td><Badge size="xs" color={r.kind === "ALLOW" ? "success" : "error"}>{r.kind}</Badge></Td>
                      <Td><code className="font-mono">{r.cidr}</code></Td>
                      <Td>{r.note ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                      <Td>{r.lastTriggeredAt ? r.lastTriggeredAt.toLocaleString() : <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                      <Td>{r.triggeredCount.toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && <TenantIpRulesEditor tenantId={tenantId} rules={ipRules.map((r) => ({ id: r.id, kind: r.kind, cidr: r.cidr, note: r.note }))} />}
        </CardBody>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Recent suspicious events (30d)" description={`${recentFailures.length} matched`} />
        </div>
        {recentFailures.length === 0 ? (
          <CardBody><EmptyState title="Nothing flagged" description="Failed logins, lockouts, rate-limit hits, or geo anomalies show up here." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr><Th>When</Th><Th>Action</Th><Th>IP</Th></tr>
              </thead>
              <tbody>
                {recentFailures.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td><span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{r.createdAt.toLocaleString()}</span></Td>
                    <Td><span className="font-mono">{r.action}</span></Td>
                    <Td><span className="font-mono">{r.ipAddress ?? "—"}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="md">
        <CardHeader title="Password & session policy" />
        <CardBody>
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Platform-wide policy applies (10-char minimum, lockout after 5 failed attempts,
            session-version bump on password change). Per-tenant overrides land in a
            future slice — for now the global policy is enforced uniformly.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>{children}</td>;
}
