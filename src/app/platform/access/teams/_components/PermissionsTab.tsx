"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  useToast,
} from "@/components/ui";
import { setTeamInheritedRoles } from "@/app/actions/platform-teams";
import type { CustomPlatformRoleStatus } from "@prisma/client";

// PermissionsTab — pick which CustomPlatformRole rows every team
// member inherits. Built-in PlatformRole inheritance is intentionally
// not surfaced here; admins set baseline roles per-user on the user
// detail page. Teams compose on top via custom roles.

export function PermissionsTab({
  teamId,
  inheritedRoleKeys,
  customRoles,
  canEdit,
}: {
  teamId: string;
  inheritedRoleKeys: string[];
  customRoles: { id: string; key: string; name: string; status: CustomPlatformRoleStatus; permissions: string[] }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set(inheritedRoleKeys));
  const [pending, setPending] = React.useState(false);
  const dirty = !sameSet(selected, new Set(inheritedRoleKeys));

  React.useEffect(() => { setSelected(new Set(inheritedRoleKeys)); }, [inheritedRoleKeys]);

  const toggle = (key: string) => {
    if (!canEdit) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const onSave = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("teamId", teamId);
      fd.set("roleKeys", Array.from(selected).join(","));
      const res = await setTeamInheritedRoles(fd);
      if (res.ok) { toast.success("Saved"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader title="Inherited custom roles"
                    description="Every team member picks up the union of permissions from the roles selected here." />
        <CardBody>
          {customRoles.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
                 style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
              No custom roles minted yet. Create one in <span className="font-mono">Roles & Permissions</span> first.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {customRoles.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-2 text-[12px]">
                  <input type="checkbox" className="mt-0.5"
                         checked={selected.has(r.key)}
                         disabled={!canEdit}
                         onChange={() => toggle(r.key)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: "var(--text-default)" }}>{r.name}</span>
                      <span className="rounded-full px-1.5 text-[10px] font-mono"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                        {r.key}
                      </span>
                      <span className="rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: r.status === "ACTIVE" ? "var(--emerald-50)" : "var(--amber-50)",
                              color: r.status === "ACTIVE" ? "var(--emerald-700)" : "var(--amber-700)",
                            }}>
                        {r.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canEdit && (
        <Card padding="sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {selected.size} role{selected.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost"
                      onClick={() => setSelected(new Set(inheritedRoleKeys))}
                      disabled={pending || !dirty}>
                Discard
              </Button>
              <Button size="sm" onClick={onSave} disabled={pending || !dirty}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
