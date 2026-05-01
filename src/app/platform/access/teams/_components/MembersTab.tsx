"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  useToast,
} from "@/components/ui";
import {
  addTeamMember,
  removeTeamMember,
  setTeamMemberRole,
} from "@/app/actions/platform-teams";
import type {
  CurrentOnCall,
  TeamMemberRow,
} from "@/server/platform/teams";
import type { PlatformTeamMemberRole } from "@prisma/client";

export function MembersTab({
  teamId,
  members,
  allStaff,
  currentOnCall,
  canEdit,
}: {
  teamId: string;
  members: TeamMemberRow[];
  allStaff: { id: string; name: string | null; email: string; image: string | null }[];
  currentOnCall: CurrentOnCall[];
  canEdit: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-3">
        <Card>
          <CardHeader title={`Members (${members.length})`}
                      description="Each member inherits the team's assigned platform roles." />
          <CardBody>
            {members.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                No members yet. Add admins from the right-hand picker.
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {members.map((m) => (
                  <Row key={m.id} member={m} canEdit={canEdit} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-3">
        {currentOnCall.length > 0 && (
          <Card>
            <CardHeader title="On-call now" />
            <CardBody>
              <ul className="space-y-1.5">
                {currentOnCall.map((c) => (
                  <li key={`${c.userId}-${c.level}`} className="flex items-center gap-2 text-[12px]">
                    <Avatar size="xs" name={c.name ?? c.email} />
                    <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-default)" }}>
                      {c.name?.trim() || c.email}
                    </span>
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
            </CardBody>
          </Card>
        )}

        {canEdit && allStaff.length > 0 && (
          <AddMemberCard teamId={teamId} allStaff={allStaff} />
        )}
      </div>
    </div>
  );
}

function Row({ member, canEdit }: { member: TeamMemberRow; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [role, setRole] = React.useState<PlatformTeamMemberRole>(member.role);

  const onChangeRole = async (next: PlatformTeamMemberRole) => {
    if (next === role) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("membershipId", member.id);
      fd.set("role", next);
      const res = await setTeamMemberRole(fd);
      if (res.ok) { toast.success("Role updated"); setRole(next); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setBusy(false); }
  };

  const onRemove = async () => {
    if (!window.confirm(`Remove ${member.user.name?.trim() || member.user.email} from this team?`)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("membershipId", member.id);
      const res = await removeTeamMember(fd);
      if (res.ok) { toast.success("Removed"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't remove");
    } finally { setBusy(false); }
  };

  return (
    <li className="flex items-center gap-2 py-2 text-[12px]">
      <Avatar size="xs" name={member.user.name ?? member.user.email} src={member.user.image ?? undefined} />
      <Link href={`/platform/users/${member.user.id}`}
            className="min-w-0 flex-1 hover:underline"
            style={{ color: "var(--text-default)" }}>
        <div className="truncate font-medium">{member.user.name?.trim() || member.user.email}</div>
        {member.user.name && (
          <div className="truncate text-[10px]" style={{ color: "var(--text-faint)" }}>{member.user.email}</div>
        )}
      </Link>
      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
        joined {member.joinedAt.toLocaleDateString()}
      </span>
      {canEdit ? (
        <>
          <Select
            size="sm"
            value={role}
            disabled={busy}
            onChange={(e) => onChangeRole(e.target.value as PlatformTeamMemberRole)}
            containerClassName="w-28"
          >
            <option value="LEAD">Lead</option>
            <option value="MEMBER">Member</option>
          </Select>
          <button type="button"
                  onClick={onRemove}
                  disabled={busy}
                  className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[10px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                  style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
            Remove
          </button>
        </>
      ) : (
        <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: role === "LEAD" ? "var(--accent-surface)" : "var(--surface-2)",
                color: role === "LEAD" ? "var(--accent-primary)" : "var(--text-muted)",
              }}>
          {role.toLowerCase()}
        </span>
      )}
    </li>
  );
}

function AddMemberCard({
  teamId,
  allStaff,
}: {
  teamId: string;
  allStaff: { id: string; name: string | null; email: string; image: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [userId, setUserId] = React.useState(allStaff[0]?.id ?? "");
  const [memberRole, setMemberRole] = React.useState<PlatformTeamMemberRole>("MEMBER");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (!userId) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("userId", userId);
      fd.set("role", memberRole);
      const res = await addTeamMember(fd);
      if (res.ok) { toast.success("Added"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't add");
    } finally { setPending(false); }
  };

  return (
    <Card>
      <CardHeader title="Add member" />
      <CardBody>
        <div className="flex flex-col gap-2">
          <Select label="Admin" size="sm" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {allStaff.map((u) => (
              <option key={u.id} value={u.id}>{u.name?.trim() || u.email}</option>
            ))}
          </Select>
          <Select label="Role" size="sm" value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as PlatformTeamMemberRole)}>
            <option value="MEMBER">Member</option>
            <option value="LEAD">Lead</option>
          </Select>
          <Button size="sm" onClick={onSubmit} disabled={pending || !userId}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
