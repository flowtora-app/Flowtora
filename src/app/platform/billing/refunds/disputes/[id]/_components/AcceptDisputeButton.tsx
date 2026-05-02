"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { acceptDispute } from "@/app/actions/platform-refunds";

export function AcceptDisputeButton({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const onClick = async () => {
    if (!window.confirm("Accept this dispute? This concedes the loss and can't be undone.")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("disputeId", disputeId);
      const res = await acceptDispute(fd);
      if (res.ok) {
        toast.success("Dispute accepted");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't accept");
    } finally { setBusy(false); }
  };

  return (
    <Button size="sm" variant="secondary" onClick={onClick} disabled={busy}>
      Accept dispute
    </Button>
  );
}
