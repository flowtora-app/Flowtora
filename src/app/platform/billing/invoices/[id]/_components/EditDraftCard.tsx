"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Textarea,
  useToast,
} from "@/components/ui";
import { editDraftInvoice } from "@/app/actions/platform-invoices";
import type { InvoiceDetail } from "@/server/platform/invoices";

export function EditDraftCard({ detail }: { detail: InvoiceDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = React.useState(detail.notes ?? "");
  const [internalNotes, setInternalNotes] = React.useState(detail.internalNotes ?? "");
  const [terms, setTerms] = React.useState(detail.termsText ?? "");
  const [pending, setPending] = React.useState(false);

  const onSave = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("invoiceId", detail.id);
      if (notes.trim()) fd.set("notes", notes.trim());
      if (internalNotes.trim()) fd.set("internalNotes", internalNotes.trim());
      if (terms.trim()) fd.set("termsText", terms.trim());
      const res = await editDraftInvoice(fd);
      if (res.ok) { toast.success("Saved"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <Card>
      <CardHeader title="Edit draft"
                  description="Notes + terms only. Line items can't be edited after creation — void + redraft if you need to change them." />
      <CardBody>
        <div className="flex flex-col gap-3">
          <Textarea label="Customer-visible notes" rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
          <Textarea label="Internal notes" rows={2} value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)} maxLength={2000}
                    hint="Platform staff only — never shown on the customer PDF." />
          <Textarea label="Terms text" rows={2} value={terms}
                    onChange={(e) => setTerms(e.target.value)} maxLength={500} />
          <div className="flex justify-end">
            <Button size="sm" onClick={onSave} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
