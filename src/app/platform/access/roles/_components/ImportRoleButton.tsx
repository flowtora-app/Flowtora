"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Textarea,
  useToast,
} from "@/components/ui";
import { importRole } from "@/app/actions/platform-roles";

const SAMPLE_JSON = JSON.stringify({
  name: "Imported role",
  description: "Permissions copied from another environment.",
  permissions: ["tenant.read", "billing.read", "support.respond"],
}, null, 2);

export function ImportRoleButton() {
  const [open, setOpen] = React.useState(false);
  const [json, setJson] = React.useState(SAMPLE_JSON);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("json", json);
      const res = await importRole(fd);
      if (res.ok) {
        toast.success("Imported");
        setOpen(false);
        router.push(`/platform/access/roles/${res.id}`);
      } else toast.error(res.error ?? "Couldn't import");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Import role</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="Import role from JSON"
          description="Paste a previously-exported role JSON. Unknown permission keys are dropped silently."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <Textarea
            label="JSON"
            rows={12}
            value={json}
            onChange={(e) => setJson(e.target.value)}
            className="font-mono"
          />
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
