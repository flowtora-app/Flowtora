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
import { blockIp } from "@/app/actions/platform-sessions";

export function BlockIpButton() {
  const [open, setOpen] = React.useState(false);
  const [cidr, setCidr] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    if (!cidr.trim()) { toast.error("Enter an IP or CIDR"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("cidr", cidr.trim());
      if (reason.trim()) fd.set("reason", reason.trim());
      if (expiresAt) fd.set("expiresAt", new Date(expiresAt).toISOString());
      const res = await blockIp(fd);
      if (res.ok) {
        toast.success("IP blocked");
        setOpen(false);
        setCidr(""); setReason(""); setExpiresAt("");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't block");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Block IP</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader title="Block IP / CIDR"
                      description="Adds a row to the platform-wide blocklist. Affected admins won't be able to sign in from these addresses."
                      onClose={() => setOpen(false)} />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input label="IP or CIDR" placeholder="203.0.113.0/24"
                   value={cidr} onChange={(e) => setCidr(e.target.value)} maxLength={50} />
            <Textarea label="Reason (optional)" rows={3}
                      value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <Input label="Expires (optional)" type="datetime-local"
                   value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Blocking…" : "Block"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
