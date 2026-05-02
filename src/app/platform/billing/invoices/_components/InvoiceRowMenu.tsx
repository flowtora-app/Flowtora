"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  markPlatformInvoicePaid,
  sendPlatformInvoice,
  voidPlatformInvoice,
} from "@/app/actions/platform-billing";
import { markInvoiceUncollectible } from "@/app/actions/platform-invoices";
import type { InvoiceRow } from "@/server/platform/invoices";

export function InvoiceRowMenu({
  row, canEdit, canRefund,
}: {
  row: InvoiceRow;
  canEdit: boolean;
  canRefund: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Legacy invoice actions redirect on every path — we catch
  // NEXT_REDIRECT and let Next handle the nav; the toast covers the
  // no-redirect fallback.
  const runRedirecting = async (fn: () => Promise<void>, msg: string) => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      await fn();
      toast.success(msg);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally { setBusy(false); }
  };

  const onSend = () => runRedirecting(() => sendPlatformInvoice(row.id), "Invoice sent");
  const onMarkPaid = () => {
    const fd = new FormData();
    fd.set("invoiceId", row.id);
    return runRedirecting(() => markPlatformInvoicePaid(row.id, fd), "Marked paid");
  };
  const onVoid = () => {
    if (!window.confirm(`Void invoice ${row.number}?`)) return;
    return runRedirecting(() => voidPlatformInvoice(row.id), "Voided");
  };

  const onMarkUncollectible = async () => {
    const reason = window.prompt(`Mark ${row.number} uncollectible. Reason:`);
    if (!reason || reason.trim().length < 3) return;
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const fd = new FormData();
      fd.set("invoiceId", row.id);
      fd.set("reason", reason.trim());
      const res = await markInvoiceUncollectible(fd);
      if (res.ok) { toast.success("Marked uncollectible"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setBusy(false); }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button"
              aria-label={`Actions for ${row.number}`}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] font-bold leading-none hover:bg-[var(--surface-2)]"
              style={{ color: "var(--text-muted)" }}>⋯</button>
      {open && (
        <div role="menu"
             className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
             onClick={(e) => e.stopPropagation()}>
          <Link href={`/platform/billing/invoices/${row.id}`} role="menuitem"
                className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-default)" }}>
            View
          </Link>
          <Link href={`/api/platform/billing/invoices/${row.id}/pdf`} role="menuitem"
                target="_blank" rel="noopener noreferrer"
                className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-default)" }}>
            Download PDF
          </Link>
          {canEdit && row.status === "DRAFT" && (
            <button type="button" role="menuitem" onClick={onSend} disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Send
            </button>
          )}
          {canEdit && (row.status === "SENT" || row.status === "OPEN") && (
            <button type="button" role="menuitem" onClick={onSend} disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Resend
            </button>
          )}
          {canEdit && (row.status === "DRAFT" || row.status === "SENT" || row.status === "OPEN") && (
            <button type="button" role="menuitem" onClick={onVoid} disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--rose-700)" }}>
              Void
            </button>
          )}
          {canEdit && (row.status === "SENT" || row.status === "OPEN") && (
            <button type="button" role="menuitem" onClick={onMarkPaid} disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Mark paid
            </button>
          )}
          {canEdit && (row.status === "SENT" || row.status === "OPEN") && (
            <button type="button" role="menuitem" onClick={onMarkUncollectible} disabled={busy}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--rose-700)" }}>
              Mark uncollectible
            </button>
          )}
          {canRefund && row.status === "PAID" && (
            <Link href={`/platform/billing/invoices/${row.id}#credit-note`} role="menuitem"
                  className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
              Issue credit note
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
