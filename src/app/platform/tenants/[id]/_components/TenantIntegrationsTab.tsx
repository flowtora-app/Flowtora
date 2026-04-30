import { db } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { INTEGRATION_REGISTRY, INTEGRATION_CATEGORIES, findIntegration } from "@/lib/integrations";
import { TenantIntegrationCardActions } from "./TenantIntegrationsClient";

// Tab 8 — Integrations. Card per integration in the master registry,
// status drawn from any matching TenantIntegration row.

export interface TenantIntegrationsTabProps { tenantId: string; canEdit: boolean }

export async function TenantIntegrationsTab({ tenantId, canEdit }: TenantIntegrationsTabProps) {
  const rows = await db.tenantIntegration.findMany({
    where: { tenantId },
    select: {
      id: true, provider: true, status: true, scope: true,
      lastSyncAt: true, recordsSynced: true, errorCount: true, lastError: true,
    },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return (
    <div className="space-y-4">
      {INTEGRATION_CATEGORIES.map((cat) => {
        const items = INTEGRATION_REGISTRY.filter((i) => i.category === cat.id);
        return (
          <Card key={cat.id} padding="md">
            <CardHeader title={cat.label} />
            <CardBody>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((def) => {
                  const row = byProvider.get(def.key);
                  const status = row?.status ?? "DISCONNECTED";
                  const palette =
                    status === "CONNECTED"    ? { color: "success" as const,  label: "Connected" }   :
                    status === "ERRORED"      ? { color: "error"   as const,  label: "Errored" }     :
                    status === "PAUSED"       ? { color: "warning" as const,  label: "Paused" }      :
                                                { color: "neutral" as const,  label: "Disconnected" };
                  return (
                    <div key={def.key} className="rounded-md border p-3"
                         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                      <div className="flex items-center gap-2">
                        <span aria-hidden style={{ fontSize: 22 }}>{def.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{def.name}</span>
                            <Badge size="xs" color={palette.color}>{palette.label}</Badge>
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{def.description}</div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        <Stat label="Last sync"      value={row?.lastSyncAt?.toLocaleString() ?? "—"} />
                        <Stat label="Records synced" value={(row?.recordsSynced ?? 0).toLocaleString()} />
                        <Stat label="Errors"         value={(row?.errorCount ?? 0).toLocaleString()} tone={row?.errorCount && row.errorCount > 0 ? "danger" : "default"} />
                        <Stat label="Scope"          value={row?.scope ?? def.availableScopes.slice(0, 2).join(", ") + (def.availableScopes.length > 2 ? "…" : "")} />
                      </div>
                      {row?.lastError && (
                        <div className="mt-2 rounded p-2 text-[11px]"
                             style={{ background: "var(--rose-50)", color: "var(--rose-800)" }}>
                          {row.lastError}
                        </div>
                      )}
                      {canEdit && (
                        <div className="mt-2">
                          <TenantIntegrationCardActions
                            tenantId={tenantId}
                            integrationId={row?.id}
                            provider={def.key}
                            status={status}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        );
      })}
      {void findIntegration}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "default" }) {
  return (
    <div>
      <div className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5" style={{ color: tone === "danger" ? "var(--rose-700)" : "var(--text-default)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{value}</div>
    </div>
  );
}
