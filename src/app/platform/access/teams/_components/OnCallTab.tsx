"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  deleteOnCallShift,
  upsertOnCallShift,
} from "@/app/actions/platform-teams";
import type {
  CurrentOnCall,
  OnCallShiftRow,
  TeamMemberRow,
} from "@/server/platform/teams";
import type { OnCallLevel } from "@prisma/client";

// OnCallTab — current on-call panel + shift list (chronological)
// + per-shift Edit / Delete + "Add shift" CRUD. The full calendar
// widget (week / 2-week grid view, drag-to-resize) is a roadmap
// item; the chronological list keeps the surface honest while the
// data model + escalation policy work as designed.

export function OnCallTab({
  teamId,
  shifts,
  members,
  currentOnCall,
  windowStart,
  windowEnd,
  canEdit,
  slackChannel,
  notifyChannels,
}: {
  teamId: string;
  shifts: OnCallShiftRow[];
  members: TeamMemberRow[];
  currentOnCall: CurrentOnCall[];
  windowStart: Date;
  windowEnd: Date;
  canEdit: boolean;
  slackChannel: string | null;
  notifyChannels: { slack: boolean; pagerDuty: boolean; sms: boolean };
}) {
  const [editing, setEditing] = React.useState<OnCallShiftRow | "new" | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        <Card>
          <CardHeader
            title={`Shifts · ${windowStart.toLocaleDateString()} → ${windowEnd.toLocaleDateString()}`}
            description="Past 14 days + next 14 days. Override shifts are tinted amber."
          />
          <CardBody>
            {shifts.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                No shifts in this window. {canEdit && "Add the first one with the button on the right."}
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {shifts.map((s) => (
                  <ShiftRow
                    key={s.id}
                    shift={s}
                    canEdit={canEdit}
                    onEdit={() => setEditing(s)}
                  />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
          <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
            <strong>Calendar widget</strong> (drag-to-resize, week / 2-week grid) is a roadmap item. Today the
            chronological list is the editing surface; the data model + escalation policy run end-to-end.
          </p>
        </Card>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader title="On-call now" />
          <CardBody>
            {currentOnCall.length === 0 ? (
              <div className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                Nobody on call right now.
              </div>
            ) : (
              <ul className="space-y-2">
                {currentOnCall.map((c) => (
                  <li key={`${c.userId}-${c.level}`} className="flex items-center gap-2 text-[12px]">
                    <Avatar size="sm" name={c.name ?? c.email} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" style={{ color: "var(--text-default)" }}>
                        {c.name?.trim() || c.email}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        until {c.endsAt.toLocaleString()}
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: c.level === "PRIMARY" ? "var(--rose-50)"
                                    : c.level === "SECONDARY" ? "var(--amber-50)"
                                    : "var(--surface-2)",
                            color: c.level === "PRIMARY" ? "var(--rose-700)"
                                : c.level === "SECONDARY" ? "var(--amber-700)"
                                : "var(--text-muted)",
                          }}>
                      {c.level.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Escalation policy" />
          <CardBody>
            <ol className="list-decimal space-y-1 pl-4 text-[12px]" style={{ color: "var(--text-default)" }}>
              <li>Primary on-call · 5 min wait window</li>
              <li>Secondary on-call · 10 min wait window</li>
              <li>Tertiary on-call · paged immediately</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <Channel on={notifyChannels.slack} label={slackChannel ? `Slack · ${slackChannel}` : "Slack"} />
              <Channel on={notifyChannels.pagerDuty} label="PagerDuty" />
              <Channel on={notifyChannels.sms} label="SMS" />
            </div>
          </CardBody>
        </Card>

        {canEdit && (
          <Card padding="sm">
            <Button size="sm" onClick={() => setEditing("new")} className="w-full">
              + Add shift
            </Button>
          </Card>
        )}
      </div>

      {editing && (
        <ShiftEditor
          teamId={teamId}
          shift={editing === "new" ? null : editing}
          members={members}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Channel({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 text-[10px]"
          style={{
            background: on ? "var(--emerald-50)" : "var(--surface-2)",
            color: on ? "var(--emerald-700)" : "var(--text-faint)",
          }}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: on ? "var(--emerald-600)" : "var(--text-faint)" }} />
      {label}
    </span>
  );
}

function ShiftRow({
  shift,
  canEdit,
  onEdit,
}: {
  shift: OnCallShiftRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const isActive = Date.now() >= shift.startsAt.getTime() && Date.now() <= shift.endsAt.getTime();

  const onDelete = async () => {
    if (!window.confirm("Delete this shift?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("shiftId", shift.id);
      const res = await deleteOnCallShift(fd);
      if (res.ok) { toast.success("Deleted"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't delete");
    } finally { setBusy(false); }
  };

  return (
    <li className="flex items-center gap-2 py-2 text-[12px]"
        style={{ background: shift.isOverride ? "var(--amber-50)" : undefined }}>
      <Avatar size="xs" name={shift.user.name ?? shift.user.email} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate" style={{ color: "var(--text-default)" }}>
            {shift.user.name?.trim() || shift.user.email}
          </span>
          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: shift.level === "PRIMARY" ? "var(--rose-50)"
                          : shift.level === "SECONDARY" ? "var(--amber-50)"
                          : "var(--surface-2)",
                  color: shift.level === "PRIMARY" ? "var(--rose-700)"
                      : shift.level === "SECONDARY" ? "var(--amber-700)"
                      : "var(--text-muted)",
                }}>
            {shift.level.toLowerCase()}
          </span>
          {shift.isOverride && (
            <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--amber-700)" }}>
              override
            </span>
          )}
          {isActive && (
            <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--emerald-700)" }}>
              active
            </span>
          )}
        </div>
        <div className="text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>
          {shift.startsAt.toLocaleString()} → {shift.endsAt.toLocaleString()}
        </div>
        {shift.notes && (
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{shift.notes}</div>
        )}
      </div>
      {canEdit && (
        <div className="shrink-0 flex items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button size="xs" variant="ghost" onClick={onDelete} disabled={busy}>Delete</Button>
        </div>
      )}
    </li>
  );
}

function ShiftEditor({
  teamId,
  shift,
  members,
  onClose,
}: {
  teamId: string;
  shift: OnCallShiftRow | null;
  members: TeamMemberRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [userId, setUserId] = React.useState(shift?.userId ?? members[0]?.userId ?? "");
  const [level, setLevel] = React.useState<OnCallLevel>(shift?.level ?? "PRIMARY");
  const [startsAt, setStartsAt] = React.useState(toDateTimeLocal(shift?.startsAt ?? defaultStart()));
  const [endsAt, setEndsAt] = React.useState(toDateTimeLocal(shift?.endsAt ?? defaultEnd()));
  const [isOverride, setIsOverride] = React.useState(shift?.isOverride ?? false);
  const [notes, setNotes] = React.useState(shift?.notes ?? "");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (!userId) { toast.error("Pick a member"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      if (shift?.id) fd.set("id", shift.id);
      fd.set("teamId", teamId);
      fd.set("userId", userId);
      fd.set("level", level);
      fd.set("startsAt", new Date(startsAt).toISOString());
      fd.set("endsAt", new Date(endsAt).toISOString());
      if (isOverride) fd.set("isOverride", "on");
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await upsertOnCallShift(fd);
      if (res.ok) { toast.success("Saved"); onClose(); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="md">
      <DialogHeader title={shift ? "Edit shift" : "Add shift"} onClose={onClose} />
      <DialogBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Member" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {members.length === 0 ? (
              <option value="">— No team members yet —</option>
            ) : members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name?.trim() || m.user.email}
              </option>
            ))}
          </Select>
          <Select label="Level" value={level} onChange={(e) => setLevel(e.target.value as OnCallLevel)}>
            <option value="PRIMARY">Primary</option>
            <option value="SECONDARY">Secondary</option>
            <option value="TERTIARY">Tertiary</option>
          </Select>
          <Input label="Starts at" type="datetime-local" value={startsAt}
                 onChange={(e) => setStartsAt(e.target.value)} />
          <Input label="Ends at" type="datetime-local" value={endsAt}
                 onChange={(e) => setEndsAt(e.target.value)} />
          <label className="flex items-center gap-2 text-[12px] sm:col-span-2"
                 style={{ color: "var(--text-default)" }}>
            <input type="checkbox" checked={isOverride}
                   onChange={(e) => setIsOverride(e.target.checked)} />
            Override (vacation cover or one-off swap)
          </label>
          <div className="sm:col-span-2">
            <Textarea label="Notes" rows={2} value={notes}
                      onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function defaultEnd(): Date {
  const d = defaultStart();
  d.setHours(d.getHours() + 8);
  return d;
}
