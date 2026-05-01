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
import {
  setTeamArchived,
  updateTeam,
} from "@/app/actions/platform-teams";
import type { TeamDetail } from "@/server/platform/teams";

export function SettingsTab({
  team,
  canEdit,
}: {
  team: TeamDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(team.name);
  const [description, setDescription] = React.useState(team.description ?? "");
  const [color, setColor] = React.useState(team.color ? `#${team.color}` : "#6366F1");
  const [slackChannel, setSlackChannel] = React.useState(team.slackChannel ?? "");
  const [emailDistro, setEmailDistro] = React.useState(team.emailDistro ?? "");
  const [notifySlack, setNotifySlack] = React.useState(team.notifySlack);
  const [notifyPagerDuty, setNotifyPagerDuty] = React.useState(team.notifyPagerDuty);
  const [notifySms, setNotifySms] = React.useState(team.notifySms);
  const [pending, setPending] = React.useState(false);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("teamId", team.id);
      fd.set("name", name);
      if (description.trim()) fd.set("description", description.trim());
      if (color) fd.set("color", color);
      if (slackChannel.trim()) fd.set("slackChannel", slackChannel.trim());
      if (emailDistro.trim()) fd.set("emailDistro", emailDistro.trim());
      if (notifySlack) fd.set("notifySlack", "on");
      if (notifyPagerDuty) fd.set("notifyPagerDuty", "on");
      if (notifySms) fd.set("notifySms", "on");
      const res = await updateTeam(fd);
      if (res.ok) { toast.success("Saved"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  const onToggleArchive = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("teamId", team.id);
      fd.set("archive", team.archivedAt ? "off" : "on");
      const res = await setTeamArchived(fd);
      if (res.ok) {
        toast.success(team.archivedAt ? "Restored" : "Archived");
        if (team.archivedAt) router.refresh();
        else router.push("/platform/access/teams");
      } else toast.error(res.error ?? "Couldn't update");
    } finally { setPending(false); }
  };

  return (
    <form onSubmit={onSave} className="space-y-3">
      <Card>
        <CardHeader title="Identity" />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={120} />
            <div>
              <label className="block text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                Colour
              </label>
              <input type="color" className="mt-1 h-9 w-20 cursor-pointer rounded-md border"
                     style={{ borderColor: "var(--border-default)" }}
                     value={color} disabled={!canEdit}
                     onChange={(e) => setColor(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Textarea label="Description" rows={2} value={description}
                        disabled={!canEdit}
                        onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Channels"
                    description="Where the on-call escalator pages this team." />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Slack channel" placeholder="#engineering"
                   value={slackChannel} disabled={!canEdit}
                   onChange={(e) => setSlackChannel(e.target.value)} maxLength={120} />
            <Input label="Email distro" placeholder="eng@flowtora.app"
                   value={emailDistro} disabled={!canEdit}
                   onChange={(e) => setEmailDistro(e.target.value)} maxLength={200} />
            <div className="sm:col-span-2 flex flex-wrap gap-3">
              <Toggle label="Notify Slack"     checked={notifySlack}     onChange={setNotifySlack}     disabled={!canEdit} />
              <Toggle label="Notify PagerDuty" checked={notifyPagerDuty} onChange={setNotifyPagerDuty} disabled={!canEdit} />
              <Toggle label="Notify SMS"       checked={notifySms}       onChange={setNotifySms}       disabled={!canEdit} />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card padding="sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {team.archivedAt
              ? `Archived ${team.archivedAt.toLocaleString()}`
              : `Updated ${team.updatedAt.toLocaleString()}`}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button size="sm" variant="ghost" type="button" onClick={onToggleArchive} disabled={pending}>
                {team.archivedAt ? "Restore" : "Archive"}
              </Button>
            )}
            <Button size="sm" type="submit" disabled={!canEdit || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}

function Toggle({
  label, checked, onChange, disabled,
}: {
  label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]"
           style={{
             borderColor: checked ? "var(--accent-primary)" : "var(--border-subtle)",
             background: checked ? "var(--accent-surface)" : "var(--surface-1)",
             opacity: disabled ? 0.6 : 1,
             color: "var(--text-default)",
           }}>
      <input type="checkbox" checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
