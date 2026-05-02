"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { createPlatformInvoice } from "@/app/actions/platform-billing";

// NewInvoiceButton — manual-invoice composer. Wraps the existing
// createPlatformInvoice server action which expects `tenantId`,
// `currency`, optional `couponCode`, optional `dueAt`, and parallel
// `itemDescription[] / itemQuantity[] / itemUnit[]` arrays.
//
// Auto-opens when ?compose=1 is present in the URL (so the row-menu
// "+ New invoice" link from the page header lands directly in the
// composer).

interface LineItem {
  description: string;
  quantity: number;
  unitAmount: string; // dollars (e.g. "49.00")
}

const EMPTY_LINE: LineItem = { description: "", quantity: 1, unitAmount: "" };

export function NewInvoiceButton() {
  const sp = useSearchParams();
  const [open, setOpen] = React.useState(sp.get("compose") === "1");
  const [tenantId, setTenantId] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [dueAt, setDueAt] = React.useState("");
  const [couponCode, setCouponCode] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [items, setItems] = React.useState<LineItem[]>([{ ...EMPTY_LINE }]);

  const addLine = () => setItems((p) => [...p, { ...EMPTY_LINE }]);
  const removeLine = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<LineItem>) =>
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New invoice</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader title="New manual invoice"
                      description="Drafts the invoice — review the line items, then click Send from the detail page to issue it."
                      onClose={() => setOpen(false)} />
        <DialogBody>
          {/* Native form posts to the server action; the action redirects
              back to /platform/billing/invoices after success. */}
          <form id="newInvoiceForm" action={createPlatformInvoice} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Tenant ID" name="tenantId" required
                     value={tenantId}
                     onChange={(e) => setTenantId(e.target.value)}
                     hint="cuid — find on the tenant detail page." />
              <Select label="Currency" name="currency" value={currency}
                      onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AUD">AUD</option>
              </Select>
              <Input label="Due date (optional)" name="dueAt" type="date"
                     value={dueAt}
                     onChange={(e) => setDueAt(e.target.value)} />
              <Input label="Coupon code (optional)" name="couponCode"
                     value={couponCode}
                     onChange={(e) => setCouponCode(e.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                Line items
              </label>
              <div className="rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_120px_32px] gap-2 border-b p-2 last:border-0"
                       style={{ borderColor: "var(--border-subtle)" }}>
                    <Input size="sm" placeholder="Description" name="itemDescription"
                           value={it.description}
                           onChange={(e) => updateLine(idx, { description: e.target.value })} />
                    <Input size="sm" type="number" min={1} placeholder="Qty" name="itemQuantity"
                           value={it.quantity}
                           onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 1 })} />
                    <Input size="sm" type="number" step="0.01" placeholder="Unit price" name="itemUnit"
                           value={it.unitAmount}
                           onChange={(e) => updateLine(idx, { unitAmount: e.target.value })} />
                    <button type="button"
                            onClick={() => removeLine(idx)}
                            disabled={items.length === 1}
                            className="ts-focus inline-flex h-9 w-8 items-center justify-center rounded-md hover:bg-[var(--surface-2)] disabled:opacity-30"
                            style={{ color: "var(--text-muted)" }}
                            title="Remove line">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addLine}
                      className="mt-1 text-[11px] hover:underline"
                      style={{ color: "var(--accent-primary)" }}>
                + Add line item
              </button>
            </div>

            <Textarea label="Customer-visible notes" name="notes" rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)} />
            <Textarea label="Terms text" name="termsText" rows={2}
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      placeholder="Net 30 — wire instructions in PDF" />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" type="submit" form="newInvoiceForm">
            Create draft
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
