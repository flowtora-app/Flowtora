"use client";

import * as React from "react";
import { duplicateReport } from "@/app/actions/reports";
import { Button, useToast } from "@/components/ui";

/** Fork-a-prebuilt button. Submits to duplicateReport which redirects
 *  to the new custom Report's detail page on success. */
export function ForkButton({ fromKey, sourceName }: { fromKey: string; sourceName: string }) {
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const onClick = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("fromKey", fromKey);
    fd.set("name", `${sourceName} (custom)`);
    try {
      await duplicateReport(fd);
    } catch {
      // duplicateReport throws a redirect on success.
      return;
    }
    setPending(false);
    toast.error("Couldn't fork — check the audit log.");
  };
  return (
    <Button size="xs" loading={pending} onClick={onClick}>Use this template</Button>
  );
}
