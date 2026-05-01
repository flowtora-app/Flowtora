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
import { createTeam } from "@/app/actions/platform-teams";

export function NewTeamButton() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("#6366F1");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (description.trim()) fd.set("description", description.trim());
      if (color) fd.set("color", color);
      const res = await createTeam(fd);
      if (res.ok) {
        toast.success("Team created");
        setOpen(false);
        setName(""); setDescription("");
        router.push(`/platform/access/teams/${res.id}`);
      } else toast.error(res.error ?? "Couldn't create");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New team</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader title="Create team" onClose={() => setOpen(false)} />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Textarea label="Description" rows={3} value={description}
                      onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            <div>
              <label className="block text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                Colour
              </label>
              <input type="color" className="mt-1 h-9 w-20 cursor-pointer rounded-md border"
                     style={{ borderColor: "var(--border-default)" }}
                     value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
