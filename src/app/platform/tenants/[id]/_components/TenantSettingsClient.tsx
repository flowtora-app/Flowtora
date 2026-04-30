"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Input, Textarea, useToast } from "@/components/ui";
import {
  cancelTenantSubscription,
  changeTenantSlug,
  hardDeleteTenant,
  renameTenant,
  toggleTenantVip,
  transferTenantOwnership,
} from "@/app/actions/tenant-detail";

// Settings tab — all editable forms + the danger-zone destructive
// confirmation modals.

export function TenantSettingsForms({
  tenantId,
  tenantName,
  tenantSlug,
  canRename,
  canTransfer,
}: {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  canRename: boolean;
  canTransfer: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(tenantName);
  const [slug, setSlug] = React.useState(tenantSlug);
  const [transferEmail, setTransferEmail] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);

  const onRename = async () => {
    setPending("rename");
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("name", name);
    const res = await renameTenant(fd);
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't rename");
    else { toast.success("Renamed"); router.refresh(); }
  };

  const onSlug = async () => {
    if (!confirm("Change the slug? Members signed in via the old slug will need to navigate to the new one.")) return;
    setPending("slug");
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("slug", slug);
    const res = await changeTenantSlug(fd);
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't change slug");
    else { toast.success("Slug updated"); router.refresh(); }
  };

  const onTransfer = async () => {
    if (!transferEmail.trim()) return;
    if (!confirm(`Transfer ownership to ${transferEmail}? The current OWNER will be demoted to ADMIN.`)) return;
    setPending("transfer");
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("newOwnerEmail", transferEmail.trim());
    const res = await transferTenantOwnership(fd);
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't transfer");
    else { toast.success("Ownership transferred"); router.refresh(); }
  };

  const onToggleVip = async () => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    const res = await toggleTenantVip(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't update");
    else { toast.success(res.isVip ? "Marked VIP" : "Unmarked VIP"); router.refresh(); }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Input label="Tenant name" value={name} onChange={(e) => setName(e.currentTarget.value)} disabled={!canRename} />
        <div><Button size="sm" loading={pending === "rename"} disabled={!canRename || name === tenantName || !name.trim()} onClick={onRename}>Save name</Button></div>
      </div>
      <div className="space-y-2">
        <Input label="Slug" value={slug} onChange={(e) => setSlug(e.currentTarget.value)} disabled={!canRename}
               hint="Members access the tenant at /t/<slug>." />
        <div><Button size="sm" variant="secondary" loading={pending === "slug"} disabled={!canRename || slug === tenantSlug || slug.length < 2} onClick={onSlug}>Change slug</Button></div>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Input label="Transfer ownership to (email)" value={transferEmail} onChange={(e) => setTransferEmail(e.currentTarget.value)}
               disabled={!canTransfer} hint="The new owner must already have a Flowtora account." />
        <div><Button size="sm" variant="secondary" loading={pending === "transfer"} disabled={!canTransfer || !transferEmail.trim()} onClick={onTransfer}>Transfer ownership</Button></div>
      </div>
      <div id="vip" className="md:col-span-2">
        <Button size="sm" variant="ghost" onClick={onToggleVip}>Toggle VIP star</Button>
      </div>
    </div>
  );
}

export function DangerCancel({ tenantId, canCancel }: { tenantId: string; canCancel: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const onSubmit = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    if (reason.trim()) fd.set("reason", reason.trim());
    const res = await cancelTenantSubscription(fd);
    setPending(false);
    if (!res.ok) toast.error(res.error ?? "Couldn't cancel");
    else { toast.success("Subscription cancelled"); setOpen(false); router.refresh(); }
  };
  return (
    <>
      <Button size="sm" variant="destructive" disabled={!canCancel} onClick={() => setOpen(true)}>
        Cancel subscription…
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader title="Cancel subscription?" description="Status flips to CANCELED, members can no longer sign in, and a CANCELED subscription event is logged for MRR-movement reporting." />
        <DialogBody>
          <Textarea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.currentTarget.value)} rows={3} />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Keep active</Button>
          <Button variant="destructive" loading={pending} onClick={onSubmit}>Cancel subscription</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

export function DangerHardDelete({ tenantId, tenantSlug, canDelete }: { tenantId: string; tenantSlug: string; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const onSubmit = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("confirmSlug", confirm);
    try {
      await hardDeleteTenant(fd);
    } catch {
      // hardDeleteTenant redirects on success; landing here = error.
    }
    setPending(false);
    router.refresh();
  };
  return (
    <>
      <Button size="sm" variant="destructive" disabled={!canDelete} onClick={() => setOpen(true)}>
        Delete forever…
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader title="Hard delete tenant?" description="This permanently removes the tenant and every cascade-linked row. This cannot be undone." />
        <DialogBody>
          <Input
            label={`Type "${tenantSlug}" exactly to confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.currentTarget.value)}
            error={confirm && confirm !== tenantSlug ? "Doesn't match" : undefined}
            autoFocus
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" loading={pending} disabled={confirm !== tenantSlug} onClick={onSubmit}>Delete forever</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
