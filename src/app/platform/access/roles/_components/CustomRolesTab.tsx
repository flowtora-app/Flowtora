"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Card, CardBody, useToast } from "@/components/ui";
import { setRoleStatus, deleteCustomRole } from "@/app/actions/platform-roles";
import type { CustomRoleRow } from "@/server/platform/roles-page";

export function CustomRolesTab({
  roles,
  canEdit,
}: {
  roles: CustomRoleRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const onPromote = async (id: string, next: "ACTIVE" | "DRAFT" | "ARCHIVED") => {
    const fd = new FormData();
    fd.set("roleId", id);
    fd.set("status", next);
    const res = await setRoleStatus(fd);
    if (res.ok) { toast.success("Status updated"); router.refresh(); }
    else toast.error(res.error ?? "Couldn't update");
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" permanently? Members must be detached first.`)) return;
    const fd = new FormData();
    fd.set("roleId", id);
    const res = await deleteCustomRole(fd);
    if (res.ok) { toast.success("Deleted"); router.refresh(); }
    else toast.error(res.error ?? "Couldn't delete");
  };

  if (roles.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No custom roles yet</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            Use <strong>+ New role</strong> or clone an existing built-in role to get started.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead style={{ background: "var(--surface-2)" }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Name</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Author</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Permissions</th>
                <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Members</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Updated</th>
                {canEdit && <th className="w-44 px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2">
                    <Link href={`/platform/access/roles/${r.id}`}
                          className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.name}
                    </Link>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>{r.key}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Avatar size="xs" name={r.createdBy.name ?? r.createdBy.email} />
                      <span style={{ color: "var(--text-muted)" }}>{r.createdBy.name?.trim() || r.createdBy.email}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.permissions.length}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.assignedCount}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: r.status === "ACTIVE" ? "var(--emerald-50)"
                                    : r.status === "ARCHIVED" ? "var(--surface-2)"
                                    : "var(--amber-50)",
                            color: r.status === "ACTIVE" ? "var(--emerald-700)"
                                : r.status === "ARCHIVED" ? "var(--text-muted)"
                                : "var(--amber-700)",
                          }}>
                      {r.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.updatedAt.toLocaleDateString()}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === "DRAFT" && (
                          <button type="button" onClick={() => onPromote(r.id, "ACTIVE")}
                                  className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium hover:bg-[var(--surface-2)]"
                                  style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
                            Activate
                          </button>
                        )}
                        {r.status === "ACTIVE" && (
                          <button type="button" onClick={() => onPromote(r.id, "ARCHIVED")}
                                  className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium hover:bg-[var(--surface-2)]"
                                  style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
                            Archive
                          </button>
                        )}
                        {(r.status === "DRAFT" || (r.status === "ARCHIVED" && r.assignedCount === 0)) && (
                          <button type="button" onClick={() => onDelete(r.id, r.name)}
                                  className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium hover:bg-[var(--surface-2)]"
                                  style={{ borderColor: "var(--rose-300)", color: "var(--rose-700)" }}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}
