"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Select,
  useToast,
} from "@/components/ui";
import {
  changeInviteRole,
  resendPlatformInvite,
  revokePlatformInvite,
} from "@/app/actions/platform-invites";
import type { InviteRow } from "@/server/platform/platform-invites";
import type { PlatformInviteStatus, PlatformRole } from "@prisma/client";

const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super admin", SITE_MANAGER: "Site manager", SUPPORT_AGENT: "Support agent",
  ADMIN: "Admin", MANAGER: "Manager", SUPPORT_LEAD: "Support lead",
  BILLING_MANAGER: "Billing manager", DEVELOPER: "Developer",
  MARKETING_MANAGER: "Marketing manager", CONTENT_MANAGER: "Content manager",
  ANALYST: "Analyst", READ_ONLY_VIEWER: "Read-only viewer",
};

export function InvitesTable({
  rows,
  roles,
  customRoles,
  canEdit,
}: {
  rows: InviteRow[];
  roles: PlatformRole[];
  customRoles: { id: string; name: string; key: string }[];
  canEdit: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No invitations</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            Use <strong>+ Invite admin</strong> to send the first invitation.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
      <table className="w-full text-[12px]">
        <thead style={{ background: "var(--surface-2)" }}>
          <tr>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Invitee</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Role</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Teams</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Invited by</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Sent</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Expires</th>
            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
            <th className="w-44 px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              roles={roles}
              customRoles={customRoles}
              canEdit={canEdit}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  row,
  roles,
  customRoles,
  canEdit,
}: {
  row: InviteRow;
  roles: PlatformRole[];
  customRoles: { id: string; name: string; key: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState(false);

  const onResend = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("inviteId", row.id);
      const res = await resendPlatformInvite(fd);
      if (res.ok) { toast.success("Resent"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't resend");
    } finally { setBusy(false); }
  };

  const onRevoke = async () => {
    if (!window.confirm(`Revoke invite to ${row.email}?`)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("inviteId", row.id);
      const res = await revokePlatformInvite(fd);
      if (res.ok) { toast.success("Revoked"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't revoke");
    } finally { setBusy(false); }
  };

  const onCopy = async () => {
    const url = `${window.location.origin}/accept-platform-invite/${row.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const isOpen = row.status === "SENT" || row.status === "OPENED";

  return (
    <>
      <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <td className="px-3 py-2">
          <span className="font-medium" style={{ color: "var(--text-default)" }}>{row.email}</span>
          {row.mfaRequired && (
            <span className="ml-1.5 inline-flex items-center rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
              MFA
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <span style={{ color: "var(--text-default)" }}>{PLATFORM_ROLE_LABEL[row.platformRole]}</span>
            {row.customRoleName && (
              <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                + {row.customRoleKey}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2">
          {row.teamNames.length === 0 ? (
            <span style={{ color: "var(--text-faint)" }}>—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.teamNames.map((n) => (
                <span key={n} className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  {n}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
          {row.invitedByName?.trim() || row.invitedByEmail}
        </td>
        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
          {row.createdAt.toLocaleDateString()}
        </td>
        <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
          {row.expiresAt.toLocaleDateString()}
        </td>
        <td className="px-3 py-2">
          <StatusPill status={row.status} />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1.5">
            {canEdit && isOpen && (
              <>
                <Button size="xs" variant="ghost" onClick={onResend} disabled={busy}>Resend</Button>
                <Button size="xs" variant="ghost" onClick={() => setEditingRole(true)} disabled={busy}>Change role</Button>
                <Button size="xs" variant="ghost" onClick={onCopy}>Copy link</Button>
                <Button size="xs" variant="ghost" onClick={onRevoke} disabled={busy}>Revoke</Button>
              </>
            )}
            {!isOpen && row.status !== "ACCEPTED" && (
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>—</span>
            )}
            {row.status === "ACCEPTED" && (
              <span className="text-[10px]" style={{ color: "var(--emerald-700)" }}>
                accepted {row.acceptedAt?.toLocaleDateString()}
              </span>
            )}
          </div>
        </td>
      </tr>
      {editingRole && (
        <ChangeRoleDialog
          row={row}
          roles={roles}
          customRoles={customRoles}
          onClose={() => setEditingRole(false)}
        />
      )}
    </>
  );
}

function ChangeRoleDialog({
  row,
  roles,
  customRoles,
  onClose,
}: {
  row: InviteRow;
  roles: PlatformRole[];
  customRoles: { id: string; name: string; key: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [platformRole, setPlatformRole] = React.useState<PlatformRole>(row.platformRole);
  const [customRoleId, setCustomRoleId] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("inviteId", row.id);
      fd.set("platformRole", platformRole);
      if (customRoleId) fd.set("customRoleId", customRoleId);
      const res = await changeInviteRole(fd);
      if (res.ok) { toast.success("Role updated"); onClose(); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title={`Change role for ${row.email}`} onClose={onClose} />
      <DialogBody>
        <div className="flex flex-col gap-3">
          <Select label="Built-in role" value={platformRole}
                  onChange={(e) => setPlatformRole(e.target.value as PlatformRole)}>
            {roles.map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABEL[r]}</option>)}
          </Select>
          <Select label="Custom role (optional)" value={customRoleId}
                  onChange={(e) => setCustomRoleId(e.target.value)}>
            <option value="">— None —</option>
            {customRoles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </Dialog>
  );
}

function StatusPill({ status }: { status: PlatformInviteStatus }) {
  const palette =
    status === "ACCEPTED" ? { bg: "var(--emerald-50)", fg: "var(--emerald-700)" } :
    status === "OPENED"   ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" } :
    status === "SENT"     ? { bg: "var(--amber-50)", fg: "var(--amber-700)" } :
    status === "EXPIRED"  ? { bg: "var(--surface-2)", fg: "var(--text-muted)" } :
                            { bg: "var(--rose-50)", fg: "var(--rose-700)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {status.toLowerCase()}
    </span>
  );
}
