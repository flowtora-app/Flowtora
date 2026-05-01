"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import { updateRolePermissions } from "@/app/actions/platform-roles";
import type { PlatformPermission } from "@/lib/rbac";

// PermissionMatrixEditor — toggle grid keyed by domain. Read-only
// when canEdit=false. Save flushes the full set in one round-trip.

export function PermissionMatrixEditor({
  roleId,
  roleKind,
  catalog,
  descriptions,
  initialPermissions,
  initialDescription,
  canEdit,
}: {
  roleId: string;
  roleKind: "builtin" | "custom";
  catalog: { domain: string; perms: PlatformPermission[] }[];
  descriptions: Record<PlatformPermission, string>;
  initialPermissions: PlatformPermission[];
  initialDescription: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = React.useState<Set<PlatformPermission>>(
    () => new Set(initialPermissions),
  );
  const [description, setDescription] = React.useState(initialDescription);
  const [filter, setFilter] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setEnabled(new Set(initialPermissions));
    setDescription(initialDescription);
    setDirty(false);
  }, [initialPermissions, initialDescription]);

  const toggle = (p: PlatformPermission) => {
    if (!canEdit) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
    setDirty(true);
  };

  const toggleDomain = (domain: string, on: boolean) => {
    if (!canEdit) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      const group = catalog.find((g) => g.domain === domain);
      if (!group) return next;
      for (const p of group.perms) {
        if (on) next.add(p);
        else next.delete(p);
      }
      return next;
    });
    setDirty(true);
  };

  const onReset = () => {
    setEnabled(new Set(initialPermissions));
    setDescription(initialDescription);
    setDirty(false);
  };

  const onSave = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("roleId", roleId);
      fd.set("permissions", Array.from(enabled).join(","));
      if (description.trim()) fd.set("description", description.trim());
      const res = await updateRolePermissions(fd);
      if (res.ok) { toast.success("Saved"); setDirty(false); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  const onExportJson = () => {
    const payload = {
      name: "Exported role",
      description,
      permissions: Array.from(enabled),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `role-${roleId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter view by domain or permission key.
  const filteredCatalog = React.useMemo(() => {
    if (!filter.trim()) return catalog;
    const q = filter.toLowerCase();
    return catalog
      .map((g) => ({
        domain: g.domain,
        perms: g.domain.toLowerCase().includes(q)
          ? g.perms
          : g.perms.filter((p) => p.toLowerCase().includes(q)),
      }))
      .filter((g) => g.perms.length > 0);
  }, [catalog, filter]);

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <Textarea
          label="Description"
          rows={2}
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
          maxLength={500}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <Input
          label=""
          size="sm"
          placeholder="Filter by domain or perm key…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          containerClassName="flex-1 max-w-[300px]"
        />
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {enabled.size} of {catalog.reduce((sum, g) => sum + g.perms.length, 0)} permissions enabled
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {filteredCatalog.map((g) => {
          const allOn = g.perms.every((p) => enabled.has(p));
          const someOn = !allOn && g.perms.some((p) => enabled.has(p));
          return (
            <fieldset key={g.domain} className="rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5"
                   style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                <legend className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = someOn; }}
                    onChange={(e) => toggleDomain(g.domain, e.target.checked)}
                    disabled={!canEdit}
                  />
                  <span className="font-mono">{g.domain}</span>
                </legend>
                <span className="text-[10px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                  {g.perms.filter((p) => enabled.has(p)).length} / {g.perms.length}
                </span>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {g.perms.map((p) => (
                  <li key={p} className="flex items-start gap-2 px-3 py-1.5 text-[12px]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={enabled.has(p)}
                      onChange={() => toggle(p)}
                      disabled={!canEdit}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono" style={{ color: "var(--text-default)" }}>{p}</div>
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {descriptions[p] ?? ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
           style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onExportJson}>Export JSON</Button>
          {roleKind === "builtin" && (
            <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              Built-in role — clone to edit.
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onReset} disabled={pending || !dirty}>
              Discard
            </Button>
            <Button size="sm" onClick={onSave} disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
