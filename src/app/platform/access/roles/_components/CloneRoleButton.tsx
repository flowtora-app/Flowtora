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
  useToast,
} from "@/components/ui";
import { cloneRole } from "@/app/actions/platform-roles";
import type {
  BuiltInRoleRow,
  CustomRoleRow,
} from "@/server/platform/roles-page";

export function CloneRoleButton({
  platformRoles,
  customRoles,
}: {
  platformRoles: BuiltInRoleRow[];
  customRoles: CustomRoleRow[];
}) {
  const [open, setOpen] = React.useState(false);
  const [sourceId, setSourceId] = React.useState(platformRoles[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    if (!sourceId) { toast.error("Pick a source role"); return; }
    if (!name.trim()) { toast.error("Name is required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("sourceId", sourceId);
      fd.set("name", name.trim());
      const res = await cloneRole(fd);
      if (res.ok) {
        toast.success("Cloned");
        setOpen(false);
        setName("");
        router.push(`/platform/access/roles/${res.id}`);
      } else toast.error(res.error ?? "Couldn't clone");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Clone role</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title="Clone role"
          description="Copy permissions from any built-in or custom role into a new draft."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Select label="Source role" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <optgroup label="Built-in">
                {platformRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({r.permissions.length})</option>
                ))}
              </optgroup>
              {customRoles.length > 0 && (
                <optgroup label="Custom">
                  {customRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.permissions.length})</option>
                  ))}
                </optgroup>
              )}
            </Select>
            <Input label="New role name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Cloning…" : "Clone"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
