import { Card, CardBody, CardHeader } from "@/components/ui";
import { TenantSettingsForms } from "./TenantSettingsClient";

// Tab 16 — Settings / Danger Zone. All editable settings + the
// destructive operations (cancel + hard-delete) gated by 2-step
// typed confirmation.

export interface TenantSettingsTabProps {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  canRename: boolean;
  canTransfer: boolean;
  canSuspend: boolean;
  canDelete: boolean;
  canCancel: boolean;
}

export function TenantSettingsTab(props: TenantSettingsTabProps) {
  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader title="General" />
        <CardBody>
          <TenantSettingsForms
            tenantId={props.tenantId}
            tenantName={props.tenantName}
            tenantSlug={props.tenantSlug}
            canRename={props.canRename}
            canTransfer={props.canTransfer}
          />
        </CardBody>
      </Card>

      <Card padding="md" style={{ borderColor: "var(--rose-300)" }}>
        <CardHeader
          title={<span style={{ color: "var(--rose-700)" }}>Danger zone</span>}
          description={<span style={{ color: "var(--rose-700)" }}>Destructive actions. All require typed confirmation.</span>}
        />
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="rounded-md border p-3" style={{ borderColor: "var(--rose-200)", background: "var(--rose-50)" }}>
              <div className="font-semibold text-[13px]" style={{ color: "var(--rose-800)" }}>Cancel subscription immediately</div>
              <p className="mb-2 mt-1 text-[12px]" style={{ color: "var(--rose-700)" }}>
                Flips status to CANCELED and emits a CANCELED SubscriptionEvent so MRR-movement
                reports reflect the churn. The tenant can still be restored from the Tenants list.
              </p>
              <DangerCancel tenantId={props.tenantId} canCancel={props.canCancel} />
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "var(--rose-200)", background: "var(--rose-50)" }}>
              <div className="font-semibold text-[13px]" style={{ color: "var(--rose-800)" }}>Hard delete</div>
              <p className="mb-2 mt-1 text-[12px]" style={{ color: "var(--rose-700)" }}>
                Permanently deletes the tenant and every cascade-linked row. <strong>Cannot be undone.</strong>
                You'll be asked to type the slug exactly to confirm.
              </p>
              <DangerHardDelete tenantId={props.tenantId} tenantSlug={props.tenantSlug} canDelete={props.canDelete} />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

import { DangerCancel, DangerHardDelete } from "./TenantSettingsClient";
