"use client";

import * as React from "react";
import { Button, useToast } from "@/components/ui";
import { sendPaymentPortalLink } from "@/app/actions/platform-subscriptions";

export function PaymentPortalLinkButton({ tenantId }: { tenantId: string }) {
  const [pending, setPending] = React.useState(false);
  const toast = useToast();

  const onClick = async () => {
    if (!window.confirm("Email the workspace owner a link to update their payment method?")) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      const res = await sendPaymentPortalLink(fd);
      if (res.ok) toast.success("Email sent");
      else toast.error(res.error ?? "Couldn't send");
    } finally { setPending(false); }
  };

  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={pending}>
      {pending ? "Sending…" : "Email payment portal link"}
    </Button>
  );
}
