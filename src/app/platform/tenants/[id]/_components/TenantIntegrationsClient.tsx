"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import {
  connectTenantIntegration,
  disconnectTenantIntegration,
  resyncTenantIntegration,
} from "@/app/actions/tenant-detail";

export function TenantIntegrationCardActions({
  tenantId,
  integrationId,
  provider,
  status,
}: {
  tenantId: string;
  integrationId: string | undefined;
  provider: string;
  status: "CONNECTED" | "ERRORED" | "PAUSED" | "DISCONNECTED";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<string | null>(null);

  const onConnect = async () => {
    setPending("connect");
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("provider", provider);
    const res = await connectTenantIntegration(fd);
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't connect");
    else { toast.success("Connected"); router.refresh(); }
  };
  const onDisconnect = async () => {
    if (!integrationId) return;
    if (!confirm("Disconnect this integration? Records already synced are kept.")) return;
    setPending("disconnect");
    const fd = new FormData();
    fd.set("id", integrationId);
    const res = await disconnectTenantIntegration(fd);
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't disconnect");
    else { toast.success("Disconnected"); router.refresh(); }
  };
  const onResync = async () => {
    if (!integrationId) return;
    setPending("resync");
    const fd = new FormData();
    fd.set("id", integrationId);
    const res = await resyncTenantIntegration(fd);
    setPending(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't resync");
    else { toast.success("Resync triggered"); router.refresh(); }
  };

  return (
    <div className="flex flex-wrap gap-1">
      {status === "DISCONNECTED" ? (
        <Button size="xs" variant="primary" loading={pending === "connect"} onClick={onConnect}>Connect</Button>
      ) : (
        <>
          <Button size="xs" variant="ghost" loading={pending === "resync"} onClick={onResync}>Resync</Button>
          <Button size="xs" variant="ghost" loading={pending === "disconnect"} onClick={onDisconnect}>Disconnect</Button>
        </>
      )}
    </div>
  );
}
