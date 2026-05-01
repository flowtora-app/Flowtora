"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, useToast } from "@/components/ui";
import { detachRoleMember } from "@/app/actions/platform-roles";

export function RoleMembersList({
  roleId,
  members,
  canEdit,
}: {
  roleId: string;
  members: { id: string; name: string | null; email: string; image: string | null }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const onDetach = async (userId: string, name: string) => {
    if (!window.confirm(`Detach ${name} from this role? They'll fall back to their baseline platform role.`)) return;
    setBusy(userId);
    try {
      const fd = new FormData();
      fd.set("roleId", roleId);
      fd.set("userId", userId);
      const res = await detachRoleMember(fd);
      if (res.ok) { toast.success("Detached"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't detach");
    } finally { setBusy(null); }
  };

  return (
    <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-2 py-2 text-[12px]">
          <Avatar size="xs" name={m.name ?? m.email} src={m.image ?? undefined} />
          <Link href={`/platform/users/${m.id}`} className="min-w-0 flex-1 hover:underline"
                style={{ color: "var(--text-default)" }}>
            <div className="truncate font-medium">{m.name?.trim() || m.email}</div>
            {m.name && (
              <div className="truncate text-[10px]" style={{ color: "var(--text-faint)" }}>{m.email}</div>
            )}
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={() => onDetach(m.id, m.name?.trim() || m.email)}
              disabled={busy === m.id}
              className="ts-focus inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
              style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
