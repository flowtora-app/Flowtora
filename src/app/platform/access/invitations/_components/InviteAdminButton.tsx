"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { createPlatformInvites } from "@/app/actions/platform-invites";
import type { PlatformRole } from "@prisma/client";

const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super admin", SITE_MANAGER: "Site manager", SUPPORT_AGENT: "Support agent",
  ADMIN: "Admin", MANAGER: "Manager", SUPPORT_LEAD: "Support lead",
  BILLING_MANAGER: "Billing manager", DEVELOPER: "Developer",
  MARKETING_MANAGER: "Marketing manager", CONTENT_MANAGER: "Content manager",
  ANALYST: "Analyst", READ_ONLY_VIEWER: "Read-only viewer",
};

export function InviteAdminButton({
  roles,
  customRoles,
  teams,
}: {
  roles: PlatformRole[];
  customRoles: { id: string; name: string; key: string }[];
  teams: { id: string; name: string; key: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const [emails, setEmails] = React.useState("");
  const [platformRole, setPlatformRole] = React.useState<PlatformRole>("ADMIN");
  const [customRoleId, setCustomRoleId] = React.useState("");
  const [selectedTeams, setSelectedTeams] = React.useState<Set<string>>(new Set());
  const [customMessage, setCustomMessage] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState(7);
  const [mfaRequired, setMfaRequired] = React.useState(true);
  const [pending, setPending] = React.useState(false);

  const reset = () => {
    setEmails(""); setPlatformRole("ADMIN");
    setCustomRoleId(""); setSelectedTeams(new Set());
    setCustomMessage(""); setExpiryDays(7); setMfaRequired(true);
  };

  const toggleTeam = (id: string) => {
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (emails.trim().length === 0) { toast.error("Enter at least one email"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("emails", emails);
      fd.set("platformRole", platformRole);
      if (customRoleId) fd.set("customRoleId", customRoleId);
      if (selectedTeams.size > 0) fd.set("teamIds", Array.from(selectedTeams).join(","));
      if (customMessage.trim()) fd.set("customMessage", customMessage.trim());
      fd.set("expiryDays", String(expiryDays));
      fd.set("mfaRequired", mfaRequired ? "on" : "off");
      const res = await createPlatformInvites(fd);
      if (res.ok) {
        toast.success(`Sent ${res.created}${res.skipped > 0 ? ` · skipped ${res.skipped} existing` : ""}${res.failed > 0 ? ` · ${res.failed} failed` : ""}`);
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't send");
      }
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Invite admin</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader
          title="Invite platform admin"
          description="Send an invitation email with the accept link. Multiple emails — comma- or newline-separated — fan out as separate invites."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <div className="flex flex-col gap-4">
            <Textarea
              label="Email(s)"
              rows={3}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="alice@flowtora.app, bob@flowtora.app"
              hint="Comma, newline, or space separated. Already-pending invites for the same email are skipped."
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select label="Built-in role" value={platformRole}
                      onChange={(e) => setPlatformRole(e.target.value as PlatformRole)}>
                {roles.map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABEL[r]}</option>)}
              </Select>
              <Select label="Custom role (optional)" value={customRoleId}
                      onChange={(e) => setCustomRoleId(e.target.value)}>
                <option value="">— None —</option>
                {customRoles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Input label="Expiry (days)" type="number" min={1} max={60}
                     value={expiryDays}
                     onChange={(e) => setExpiryDays(Number(e.target.value) || 7)} />
              <label className="flex items-end gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" checked={mfaRequired}
                       onChange={(e) => setMfaRequired(e.target.checked)} />
                MFA required at first sign-in
              </label>
            </div>

            <div>
              <label className="block text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                Teams (optional)
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {teams.length === 0 ? (
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    No teams to assign — create one in <span className="font-mono">Access · Teams</span>.
                  </span>
                ) : teams.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTeam(t.id)}
                    className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      borderColor: selectedTeams.has(t.id) ? "var(--accent-primary)" : "var(--border-default)",
                      background: selectedTeams.has(t.id) ? "var(--accent-surface)" : "var(--surface-1)",
                      color: selectedTeams.has(t.id) ? "var(--accent-primary)" : "var(--text-muted)",
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              label="Custom message (optional)"
              rows={3}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              maxLength={2000}
              placeholder="Welcome to the team — let me know if anything looks off."
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
