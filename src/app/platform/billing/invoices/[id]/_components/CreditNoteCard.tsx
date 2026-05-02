"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import { issueCreditNote } from "@/app/actions/platform-invoices";

export function CreditNoteCard({
  invoiceId,
  maxAmount,
  currency,
}: {
  invoiceId: string;
  maxAmount: number;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) { toast.error("Amount must be > 0"); return; }
    const cents = Math.round(dollars * 100);
    if (cents > maxAmount) {
      toast.error(`Amount can't exceed ${(maxAmount / 100).toLocaleString(undefined, { style: "currency", currency })}`);
      return;
    }
    if (reason.trim().length < 3) { toast.error("Reason required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("invoiceId", invoiceId);
      fd.set("amountCents", String(cents));
      fd.set("reason", reason.trim());
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await issueCreditNote(fd);
      if (res.ok) {
        toast.success(`Issued ${res.number}`);
        setAmount(""); setReason(""); setNotes("");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't issue");
    } finally { setPending(false); }
  };

  return (
    <Card id="credit-note">
      <CardHeader title="Issue credit note"
                  description="Records a CN-N row. Doesn't push the credit to the gateway today — that's a manual reconciliation step." />
      <CardBody>
        <div className="flex flex-col gap-3">
          <Input label={`Amount (${currency})`} type="number" step="0.01"
                 value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <Textarea label="Notes (optional)" rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          <div className="flex justify-end">
            <Button size="sm" onClick={onSubmit} disabled={pending}>
              {pending ? "Issuing…" : "Issue credit note"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
