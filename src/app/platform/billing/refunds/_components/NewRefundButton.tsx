"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Select,
  Textarea,
  Input,
  useToast,
} from "@/components/ui";
import { Checkbox } from "@/components/ui/Checkbox";
import { createRefund } from "@/app/actions/platform-refunds";
import type { RefundablePayment } from "@/server/platform/refunds-disputes";

const REASONS = [
  { value: "CUSTOMER_REQUEST", label: "Customer request" },
  { value: "FRAUD",            label: "Fraud" },
  { value: "DUPLICATE",        label: "Duplicate" },
  { value: "SUBSCRIPTION_MISTAKE", label: "Subscription mistake" },
  { value: "SERVICE_ISSUE",    label: "Service issue" },
  { value: "OTHER",            label: "Other" },
] as const;

export function NewRefundButton({ payments }: { payments: RefundablePayment[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [paymentId, setPaymentId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState<typeof REASONS[number]["value"]>("CUSTOMER_REQUEST");
  const [reasonNote, setReasonNote] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");
  const [customerNote, setCustomerNote] = React.useState("");
  const [asCredit, setAsCredit] = React.useState(false);

  const selectedPayment = payments.find((p) => p.id === paymentId) ?? null;
  const remaining = selectedPayment
    ? Math.max(0, selectedPayment.amount - selectedPayment.alreadyRefunded)
    : 0;

  const onSelectPayment = (id: string) => {
    setPaymentId(id);
    const p = payments.find((x) => x.id === id);
    if (p) {
      const left = Math.max(0, p.amount - p.alreadyRefunded);
      setAmount((left / 100).toFixed(2));
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!paymentId) { toast.error("Pick a payment to refund"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("paymentId", paymentId);
      fd.set("amount", amount);
      fd.set("reason", reason);
      if (reasonNote) fd.set("reasonNote", reasonNote);
      if (internalNote) fd.set("internalNote", internalNote);
      if (customerNote) fd.set("customerNote", customerNote);
      if (asCredit) fd.set("asCredit", "1");
      const res = await createRefund(fd);
      if (res.ok) {
        toast.success(asCredit ? "Credit issued" : "Refund queued");
        setOpen(false);
        // Reset
        setPaymentId(""); setAmount(""); setReason("CUSTOMER_REQUEST");
        setReasonNote(""); setInternalNote(""); setCustomerNote(""); setAsCredit(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't issue refund");
      }
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New refund</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="New refund"
          description="Refund a successful payment in part or in full. ‘Refund as credit’ skips the gateway and mints a Flowtora credit note."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <form id="newRefundForm" onSubmit={onSubmit} className="flex flex-col gap-4">
            <Select label="Payment" required value={paymentId}
                    onChange={(e) => onSelectPayment(e.target.value)}>
              <option value="">Select a payment…</option>
              {payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.tenantName} · {p.invoiceNumber} · ${(p.amount / 100).toFixed(2)} {p.currency}
                  {p.alreadyRefunded > 0 ? ` (${(p.alreadyRefunded / 100).toFixed(2)} refunded)` : ""} · {p.attemptedAt.toLocaleDateString()}
                </option>
              ))}
            </Select>
            {selectedPayment && (
              <div className="rounded-md border p-2 text-[11px]"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text-default)" }}>Refundable balance:</strong>{" "}
                ${(remaining / 100).toFixed(2)} {selectedPayment.currency}
                {selectedPayment.alreadyRefunded > 0 && (
                  <> · ${(selectedPayment.alreadyRefunded / 100).toFixed(2)} previously refunded</>
                )}
              </div>
            )}

            <Input label="Refund amount" required type="number" step="0.01" min="0.01"
                   value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   hint="Dollars (e.g. 49.00). Use the full balance for a complete refund." />

            <Select label="Reason" required value={reason}
                    onChange={(e) => setReason(e.target.value as typeof REASONS[number]["value"])}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>

            <Textarea label="Internal note" rows={2}
                      placeholder="Why we're issuing this — only visible to platform staff."
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)} />

            <Textarea label="Customer-visible note" rows={2}
                      placeholder="Optional message shown on the customer credit memo."
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)} />

            <Textarea label="Reason note (extra detail)" rows={2}
                      placeholder="Free-form context attached to the reason code."
                      value={reasonNote}
                      onChange={(e) => setReasonNote(e.target.value)} />

            <Checkbox
              label="Refund as credit"
              description="Skip the gateway and mint a Flowtora credit note. Settles immediately and applies to future invoices."
              checked={asCredit}
              onCheckedChange={(v: boolean) => setAsCredit(v)}
            />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newRefundForm" disabled={busy}>
            {asCredit ? "Issue credit" : "Issue refund"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
