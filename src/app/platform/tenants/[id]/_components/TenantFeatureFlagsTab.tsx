import { db } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";

// Tab 9 — Feature Flags. Per-tenant flag overrides.

export interface TenantFeatureFlagsTabProps { tenantId: string; canWrite: boolean }

export async function TenantFeatureFlagsTab({ tenantId, canWrite }: TenantFeatureFlagsTabProps) {
  const [tenantOverrides, globals] = await Promise.all([
    db.featureFlag.findMany({
      where: { tenantId },
      orderBy: { key: "asc" },
      select: { id: true, key: true, enabled: true, note: true, updatedAt: true, updatedBy: true, rolloutPct: true, expiresAt: true },
    }),
    db.featureFlag.findMany({
      where: { tenantId: null },
      orderBy: { key: "asc" },
      select: { key: true, enabled: true },
    }),
  ]);
  const globalsByKey = new Map(globals.map((g) => [g.key, g.enabled]));

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <CardHeader
          title="Feature flags"
          description={`${tenantOverrides.length} per-tenant override${tenantOverrides.length === 1 ? "" : "s"}${globals.length > 0 ? ` · ${globals.length} global default${globals.length === 1 ? "" : "s"}` : ""}`}
        />
      </div>
      {tenantOverrides.length === 0 ? (
        <CardBody>
          <EmptyState
            title="No per-tenant overrides"
            description={
              <span>
                Plan-tier defaults from <code>PLAN_ENTITLEMENTS</code> apply.
                Add an override from <a href="/platform/feature-flags" className="hover:underline" style={{ color: "var(--accent-primary)" }}>/platform/feature-flags</a>
                {" "}or with a per-tenant flag command-line script.
              </span>
            }
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <Th>Key</Th><Th>Tenant override</Th><Th>Global default</Th><Th>Rollout</Th><Th>Note</Th><Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {tenantOverrides.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <Td><span className="font-mono text-[11px]">{f.key}</span></Td>
                  <Td>
                    <Badge size="xs" color={f.enabled ? "success" : "neutral"}>
                      {f.enabled ? "ON" : "OFF"}
                    </Badge>
                  </Td>
                  <Td>
                    {globalsByKey.has(f.key)
                      ? <Badge size="xs" color={globalsByKey.get(f.key) ? "success" : "neutral"}>{globalsByKey.get(f.key) ? "ON" : "OFF"}</Badge>
                      : <span style={{ color: "var(--text-faint)" }}>plan default</span>}
                  </Td>
                  <Td>{f.rolloutPct != null ? `${f.rolloutPct}%` : <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                  <Td><span style={{ color: "var(--text-muted)" }}>{f.note ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</span></Td>
                  <Td><span style={{ color: "var(--text-faint)" }}>{f.updatedAt.toLocaleString()}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!canWrite && (
        <CardBody>
          <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Your role is read-only on feature flags. The <code>feature_flag.write</code> permission gates per-tenant edits.
          </div>
        </CardBody>
      )}
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>{children}</td>;
}
