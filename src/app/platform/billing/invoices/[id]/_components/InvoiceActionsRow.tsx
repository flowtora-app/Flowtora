"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import {
  markPlatformInvoicePaid,
  sendPlatformInvoice,
  voidPlatformInvoice,
} from "@/app/actions/platform-billing";
import { markInvoiceUncollectible } from "@/app/actions/platform-invoices";
import type { InvoiceDetail } from "@/server/platform/invoices";

export function InvoiceActionsRow({
  detail, canEdit,
}: {
  detail: InvoiceDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  // The legacy invoice actions (send / markPaid / void) all redirect
  // — both on success and on validation error. We catch the
  // NEXT_REDIRECT throw and let Next handle the navigation; refresh
  // is a fallback for the rare case where the action returned without
  // redirecting.
  const runRedirecting = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMsg);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally { setBusy(false); }
  };

  const onSend = () => runRedirecting(
    () => sendPlatformInvoice(detail.id),
    detail.status === "DRAFT" ? "Invoice sent" : "Resent",
  );
  const onMarkPaid = () => {
    if (!window.confirm(`Mark ${detail.number} as paid?`)) return;
    const fd = new FormData();
    fd.set("invoiceId", detail.id);
    return runRedirecting(() => markPlatformInvoicePaid(detail.id, fd), "Marked paid");
  };
  const onVoid = () => {
    if (!window.confirm(`Void ${detail.number}?`)) return;
    return runRedirecting(() => voidPlatformInvoice(detail.id), "Voided");
  };
  const onMarkUncollectible = async () => {
    const reason = window.prompt(`Mark ${detail.number} uncollectible. Reason:`);
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("invoiceId", detail.id);
      fd.set("reason", reason.trim());
      const res = await markInvoiceUncollectible(fd);
      if (res.ok) { toast.success("Marked uncollectible"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setBusy(false); }
  };

  if (!canEdit) return null;
  return (
    <>
      {detail.status === "DRAFT" && (
        <Button size="sm" onClick={onSend} disabled={busy}>Send</Button>
      )}
      {(detail.status === "SENT" || detail.status === "OPEN") && (
        <>
          <Button size="sm" onClick={onSend} disabled={busy}>Resend</Button>
          <Button size="sm" variant="secondary" onClick={onMarkPaid} disabled={busy}>Mark paid</Button>
          <Button size="sm" variant="ghost" onClick={onMarkUncollectible} disabled={busy}>Uncollectible</Button>
        </>
      )}
      {(detail.status === "DRAFT" || detail.status === "SENT" || detail.status === "OPEN") && (
        <Button size="sm" variant="ghost" onClick={onVoid} disabled={busy}>Void</Button>
      )}
    </>
  );
}
