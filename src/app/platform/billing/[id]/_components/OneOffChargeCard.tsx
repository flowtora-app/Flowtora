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
  useToast,
} from "@/components/ui";
import { addOneOffCharge } from "@/app/actions/platform-subscriptions";

export function OneOffChargeCard({
  tenantId,
  currency,
}: {
  tenantId: string;
  currency: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"charge" | "credit">("charge");
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    const dollars = Number(amount);
    if (Number.isNaN(dollars) || dollars <= 0) { toast.error("Amount must be > 0"); return; }
    if (!description.trim()) { toast.error("Description required"); return; }
    setPending(true);
    try {
      const cents = Math.round(dollars * 100) * (mode === "credit" ? -1 : 1);
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("amountCents", String(cents));
      fd.set("description", description.trim());
      fd.set("currency", currency);
      const res = await addOneOffCharge(fd);
      if (res.ok) {
        toast.success(mode === "charge" ? "Charge added" : "Credit issued");
        setOpen(false);
        setAmount(""); setDescription("");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't add");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => { setMode("charge"); setOpen(true); }}>
        + One-off
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader title={mode === "charge" ? "Add one-time charge" : "Issue credit"}
                      description="Mints a DRAFT platform invoice. Issue + send happens from the Invoices page."
                      onClose={() => setOpen(false)} />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              <button type="button"
                      onClick={() => setMode("charge")}
                      className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        borderColor: mode === "charge" ? "var(--accent-primary)" : "var(--border-default)",
                        background: mode === "charge" ? "var(--accent-surface)" : "var(--surface-1)",
                        color: mode === "charge" ? "var(--accent-primary)" : "var(--text-muted)",
                      }}>
                Charge
              </button>
              <button type="button"
                      onClick={() => setMode("credit")}
                      className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        borderColor: mode === "credit" ? "var(--accent-primary)" : "var(--border-default)",
                        background: mode === "credit" ? "var(--accent-surface)" : "var(--surface-1)",
                        color: mode === "credit" ? "var(--accent-primary)" : "var(--text-muted)",
                      }}>
                Credit
              </button>
            </div>
            <Input label={`Amount (${currency})`} type="number" step="0.01"
                   value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label="Description" value={description}
                   onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Saving…" : mode === "charge" ? "Add charge" : "Issue credit"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
