"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import { updateImpersonationSettings } from "@/app/actions/impersonation-admin";
import type { ResolvedSettings } from "@/server/platform/impersonation";

// SettingsTab — single-form dialog backing the Compliance settings
// row (singleton id="default"). Read-only when the role can't edit.

export function SettingsTab({
  settings,
  adminOptions,
  canEdit,
}: {
  settings: ResolvedSettings;
  adminOptions: { id: string; label: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [maxDurationMin, setMaxDuration] = React.useState(settings.maxDurationMin);
  const [idleTimeoutMin, setIdleTimeout] = React.useState(settings.idleTimeoutMin);
  const [reasonRequired, setReasonRequired] = React.useState(settings.reasonRequired);
  const [approvalRequired, setApprovalRequired] = React.useState(settings.approvalRequired);
  const [approverIds, setApproverIds] = React.useState<string[]>(settings.approverIds);
  const [bannerCopy, setBannerCopy] = React.useState(settings.bannerCopy);
  const [recordingRetentionDays, setRetention] = React.useState(settings.recordingRetentionDays);
  const [auditOnlyMode, setAuditOnly] = React.useState(settings.auditOnlyMode);
  const [disabledActionsText, setDisabledActions] = React.useState(settings.disabledActions.join(", "));
  const [pending, setPending] = React.useState(false);

  const toggleApprover = (id: string) => {
    setApproverIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("maxDurationMin", String(maxDurationMin));
      fd.set("idleTimeoutMin", String(idleTimeoutMin));
      if (reasonRequired) fd.set("reasonRequired", "on");
      if (approvalRequired) fd.set("approvalRequired", "on");
      fd.set("approverIds", approverIds.join(","));
      if (bannerCopy.trim()) fd.set("bannerCopy", bannerCopy.trim());
      fd.set("recordingRetentionDays", String(recordingRetentionDays));
      if (auditOnlyMode) fd.set("auditOnlyMode", "on");
      fd.set("disabledActions", disabledActionsText.split(",").map((s) => s.trim()).filter(Boolean).join(","));
      const res = await updateImpersonationSettings(fd);
      if (res.ok) { toast.success("Settings saved"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader title="Session limits"
                    description="Hard caps the cron enforces every 5 minutes." />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Max duration (min)" type="number" min={5} max={480}
                   value={maxDurationMin} disabled={!canEdit}
                   onChange={(e) => setMaxDuration(Number(e.target.value) || 60)} />
            <Input label="Idle timeout (min)" type="number" min={1} max={120}
                   value={idleTimeoutMin} disabled={!canEdit}
                   onChange={(e) => setIdleTimeout(Number(e.target.value) || 15)} />
            <Input label="Recording retention (days)" type="number" min={1} max={3650}
                   value={recordingRetentionDays} disabled={!canEdit}
                   onChange={(e) => setRetention(Number(e.target.value) || 90)}
                   hint="Audit-log + session rows pruned after this." />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Reason & approval"
                    description="Gate every new impersonation start." />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Toggle
              label="Reason required"
              description="Reject new sessions without categorical reason or freetext."
              checked={reasonRequired}
              onChange={setReasonRequired}
              disabled={!canEdit}
            />
            <Toggle
              label="Approval required"
              description="Block new sessions until a designated approver clicks Approve."
              checked={approvalRequired}
              onChange={setApprovalRequired}
              disabled={!canEdit}
            />
            {approvalRequired && (
              <div>
                <div className="mb-1 text-[12px] font-medium" style={{ color: "var(--text-default)" }}>Approvers</div>
                <div className="flex flex-wrap gap-1.5">
                  {adminOptions.length === 0 ? (
                    <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                      No platform staff available to assign as approvers.
                    </span>
                  ) : adminOptions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleApprover(u.id)}
                      disabled={!canEdit}
                      className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                      style={{
                        borderColor: approverIds.includes(u.id) ? "var(--accent-primary)" : "var(--border-default)",
                        background: approverIds.includes(u.id) ? "var(--accent-surface)" : "var(--surface-1)",
                        color: approverIds.includes(u.id) ? "var(--accent-primary)" : "var(--text-muted)",
                      }}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Banner copy"
                    description="The amber band shown across every page during impersonation." />
        <CardBody>
          <Textarea
            label="Banner template"
            rows={2}
            value={bannerCopy}
            disabled={!canEdit}
            onChange={(e) => setBannerCopy(e.target.value)}
            hint="Tokens: {tenant}, {time}, {duration}. Leave blank to use the default."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Allowed actions"
                    description="Audit-only mode short-circuits every mutation; the disabled-actions list narrows that down to specific keys when audit-only is off." />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Toggle
              label="Audit-only mode"
              description="Read-only impersonation — every mutating action is rejected at the action layer."
              checked={auditOnlyMode}
              onChange={setAuditOnly}
              disabled={!canEdit}
            />
            <Textarea
              label="Disabled action keys"
              rows={3}
              value={disabledActionsText}
              disabled={!canEdit || auditOnlyMode}
              onChange={(e) => setDisabledActions(e.target.value)}
              hint="Comma-separated audit-action strings, e.g. tenant.archive, billing.refund. Ignored when Audit-only is on."
            />
          </div>
        </CardBody>
      </Card>

      <Card padding="sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {settings.updatedAt
              ? `Last edited ${settings.updatedAt.toLocaleString()}`
              : "Defaults — no overrides saved yet."}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => router.refresh()} disabled={pending}>
              Reset
            </Button>
            <Button size="sm" type="submit" disabled={!canEdit || pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      </Card>

      {!canEdit && (
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Read-only mode — your role can&apos;t edit compliance settings.
        </div>
      )}
    </form>
  );
}

function Toggle({
  label, description, checked, onChange, disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-2"
           style={{
             borderColor: checked ? "var(--accent-primary)" : "var(--border-subtle)",
             background: checked ? "var(--accent-surface)" : "var(--surface-1)",
             opacity: disabled ? 0.6 : 1,
           }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <div className="min-w-0">
        <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{label}</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{description}</div>
      </div>
    </label>
  );
}
