"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@/components/ui";
import { recomputeTenantHealth } from "@/app/actions/tenant-detail";

export function TenantHealthRecomputeButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const [reason, setReason] = React.useState("Manual recompute");
  const [showReason, setShowReason] = React.useState(false);

  if (!showReason) {
    return <Button size="sm" variant="secondary" onClick={() => setShowReason(true)}>Recompute</Button>;
  }

  const onSubmit = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("reason", reason);
    const res = await recomputeTenantHealth(fd);
    setPending(false);
    if (!res.ok) toast.error(res.error ?? "Couldn't recompute");
    else { toast.success(`New score: ${res.score}`); setShowReason(false); router.refresh(); }
  };

  return (
    <div className="flex items-end gap-2">
      <Input size="sm" label="Reason" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      <Button size="sm" loading={pending} onClick={onSubmit}>Run</Button>
      <Button size="sm" variant="ghost" onClick={() => setShowReason(false)}>Cancel</Button>
    </div>
  );
}
