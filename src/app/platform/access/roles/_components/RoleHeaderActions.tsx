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
  Textarea,
  useToast,
} from "@/components/ui";
import {
  cloneRole,
  deleteCustomRole,
  renameRole,
  setRoleStatus,
} from "@/app/actions/platform-roles";
import type { RoleDetail } from "@/server/platform/roles-page";

// RoleHeaderActions — the row of buttons next to the role header.
// Built-in roles only get Clone; custom roles get the full lifecycle.

export function RoleHeaderActions({
  role,
  canEdit,
}: {
  role: RoleDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [renaming, setRenaming] = React.useState(false);
  const [cloning, setCloning] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const isCustom = role.kind === "custom";

  const onPromote = async (next: "ACTIVE" | "DRAFT" | "ARCHIVED") => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("roleId", role.id);
      fd.set("status", next);
      const res = await setRoleStatus(fd);
      if (res.ok) { toast.success("Status updated"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setPending(false); }
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete "${role.name}" permanently?`)) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("roleId", role.id);
      const res = await deleteCustomRole(fd);
      if (res.ok) { toast.success("Deleted"); router.push("/platform/access/roles"); }
      else toast.error(res.error ?? "Couldn't delete");
    } finally { setPending(false); }
  };

  return (
    <>
      {isCustom && canEdit && role.status === "DRAFT" && (
        <Button size="sm" onClick={() => onPromote("ACTIVE")} disabled={pending}>Activate</Button>
      )}
      {isCustom && canEdit && role.status === "ACTIVE" && (
        <Button size="sm" variant="secondary" onClick={() => onPromote("ARCHIVED")} disabled={pending}>Archive</Button>
      )}
      {isCustom && canEdit && role.status === "ARCHIVED" && (
        <Button size="sm" variant="secondary" onClick={() => onPromote("DRAFT")} disabled={pending}>Reopen as draft</Button>
      )}
      {isCustom && canEdit && (
        <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>Rename</Button>
      )}
      {canEdit && (
        <Button size="sm" variant="ghost" onClick={() => setCloning(true)}>Clone</Button>
      )}
      {isCustom && canEdit && (role.status === "DRAFT" || (role.status === "ARCHIVED" && role.assignedCount === 0)) && (
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={pending}>Delete</Button>
      )}

      {renaming && (
        <RenameDialog role={role} onClose={() => setRenaming(false)} />
      )}
      {cloning && (
        <CloneDialog role={role} onClose={() => setCloning(false)} />
      )}
    </>
  );
}

function RenameDialog({ role, onClose }: { role: RoleDetail; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(role.name);
  const [description, setDescription] = React.useState(role.description ?? "");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("roleId", role.id);
      fd.set("name", name);
      if (description.trim()) fd.set("description", description.trim());
      const res = await renameRole(fd);
      if (res.ok) { toast.success("Renamed"); onClose(); router.refresh(); }
      else toast.error(res.error ?? "Couldn't rename");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title="Rename role" onClose={onClose} />
      <DialogBody>
        <div className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <Textarea label="Description" rows={3} value={description}
                    onChange={(e) => setDescription(e.target.value)} maxLength={500} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </Dialog>
  );
}

function CloneDialog({ role, onClose }: { role: RoleDetail; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(`${role.name} (copy)`);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("sourceId", role.id);
      fd.set("name", name);
      const res = await cloneRole(fd);
      if (res.ok) { toast.success("Cloned"); onClose(); router.push(`/platform/access/roles/${res.id}`); }
      else toast.error(res.error ?? "Couldn't clone");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title={`Clone ${role.name}`}
                    description="Permissions are copied as a new draft custom role."
                    onClose={onClose} />
      <DialogBody>
        <Input label="New name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>{pending ? "Cloning…" : "Clone"}</Button>
      </DialogFooter>
    </Dialog>
  );
}
