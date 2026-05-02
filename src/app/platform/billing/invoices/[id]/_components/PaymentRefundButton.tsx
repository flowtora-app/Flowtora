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
import { refundInvoicePayment } from "@/app/actions/platform-invoices";

export function PaymentRefundButton({
  paymentId, amount, currency,
}: {
  paymentId: string;
  amount: number;
  currency: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [refundAmount, setRefundAmount] = React.useState((amount / 100).toFixed(2));
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    const dollars = Number(refundAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) { toast.error("Amount must be > 0"); return; }
    if (reason.trim().length < 3) { toast.error("Reason required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("paymentId", paymentId);
      fd.set("amountCents", String(Math.round(dollars * 100)));
      fd.set("reason", reason.trim());
      const res = await refundInvoicePayment(fd);
      if (res.ok) { toast.success("Refunded"); setOpen(false); router.refresh(); }
      else toast.error(res.error ?? "Couldn't refund");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        Refund
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader title="Refund payment"
                      description="Records the refund + drops the invoice back to REFUNDED if full. Doesn't push the refund to the gateway — that's still a manual step today."
                      onClose={() => setOpen(false)} />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input label={`Amount (${currency})`} type="number" step="0.01"
                   value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <Textarea label="Reason" rows={3} value={reason}
                      onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Refunding…" : "Refund"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
