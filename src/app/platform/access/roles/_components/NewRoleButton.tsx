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
import { createDraftRole } from "@/app/actions/platform-roles";
import type { PlatformPermission } from "@/lib/rbac";

// NewRoleButton — mint a fresh DRAFT custom role with name +
// description; admin picks permissions on the next screen.

export function NewRoleButton({
  catalog,
}: {
  catalog: { domain: string; perms: PlatformPermission[] }[];
}) {
  void catalog;
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (description.trim()) fd.set("description", description.trim());
      const res = await createDraftRole(fd);
      if (res.ok) {
        toast.success("Draft role created");
        setOpen(false);
        setName("");
        setDescription("");
        router.push(`/platform/access/roles/${res.id}`);
      } else {
        toast.error(res.error ?? "Couldn't create");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New role</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title="Create custom role"
          description="Mint a draft role; pick permissions from the matrix on the next screen."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Textarea label="Description" rows={3} value={description}
                      onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
