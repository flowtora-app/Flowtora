"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Drawer,
  useToast,
} from "@/components/ui";
import {
  retryInvoicePayment,
  sendUpdatePaymentMethodEmail,
} from "@/app/actions/platform-payments";
import type { PaymentDetail } from "@/server/platform/payments";

export function PaymentDetailDrawer({
  detail, canRetry, canRefund,
}: {
  detail: PaymentDetail;
  canRetry: boolean;
  canRefund: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const close = () => {
    const u = new URLSearchParams(sp.toString());
    u.delete("detail");
    const q = u.toString();
    router.replace(q ? `/platform/billing/payments?${q}` : "/platform/billing/payments");
  };

  const onRetry = async () => {
    if (!window.confirm("Queue a retry for this payment?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("paymentId", detail.id);
      const res = await retryInvoicePayment(fd);
      if (res.ok) { toast.success("Retry queued"); router.refresh(); close(); }
      else toast.error(res.error ?? "Couldn't retry");
    } finally { setBusy(false); }
  };

  const onSendPortal = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("paymentId", detail.id);
      const res = await sendUpdatePaymentMethodEmail(fd);
      if (res.ok) toast.success("Email sent");
      else toast.error(res.error ?? "Couldn't send");
    } finally { setBusy(false); }
  };

  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); }
    catch { toast.error("Couldn't copy"); }
  };

  return (
    <Drawer open onOpenChange={(o) => { if (!o) close(); }} side="right" size="lg"
            title={
              <span className="flex items-center gap-2">
                <span className="font-mono text-[14px]">
                  {(detail.amount / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                </span>
                <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: detail.status === "succeeded" ? "var(--emerald-50)"
                                : detail.status === "failed" ? "var(--rose-50)"
                                : "var(--amber-50)",
                        color: detail.status === "succeeded" ? "var(--emerald-700)"
                            : detail.status === "failed" ? "var(--rose-700)"
                            : "var(--amber-700)",
                      }}>
                  {detail.status.replaceAll("_", " ")}
                </span>
              </span>
            }
            description={`${detail.gateway} · ${detail.attemptedAt.toLocaleString()}`}>
      <div className="flex flex-col gap-5">
        {/* Identity + amounts */}
        <Section title="Payment">
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
            <Row label="Payment ID" value={
              <button type="button" onClick={() => copy("Payment ID", detail.id)}
                      className="font-mono hover:underline" style={{ color: "var(--text-default)" }}>
                {detail.id}
              </button>
            } />
            {detail.gatewayPaymentId && (
              <Row label="Gateway ID" value={
                <button type="button" onClick={() => copy("Gateway ID", detail.gatewayPaymentId!)}
                        className="font-mono hover:underline" style={{ color: "var(--text-default)" }}>
                  {detail.gatewayPaymentId}
                </button>
              } />
            )}
            <Row label="Method" value={detail.method ?? "—"} />
            <Row label="Gateway" value={detail.gateway} />
            <Row label="Amount" value={
              (detail.amount / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })
            } />
            <Row label="Fee" value={
              detail.fee === 0 ? "—"
                : (detail.fee / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })
            } />
            <Row label="Net" value={
              detail.net === 0 ? "—"
                : (detail.net / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })
            } />
            <Row label="Attempted" value={detail.attemptedAt.toLocaleString()} />
            {detail.refundedAt && (
              <Row label="Refunded" value={detail.refundedAt.toLocaleString()} />
            )}
          </dl>
        </Section>

        {/* Failure */}
        {detail.failureCode && (
          <Section title="Failure">
            <div className="rounded-md border p-3 text-[12px]"
                 style={{ borderColor: "var(--rose-200)", background: "var(--rose-50)", color: "var(--rose-700)" }}>
              <div className="font-mono font-semibold">{detail.failureCode}</div>
              {detail.failureReason && <div className="mt-1">{detail.failureReason}</div>}
            </div>
          </Section>
        )}

        {/* Risk metadata */}
        {detail.riskMetadata && Object.keys(detail.riskMetadata).length > 0 && (
          <Section title="Risk metadata">
            <pre className="max-h-60 overflow-auto rounded-md border p-2 text-[10px] font-mono"
                 style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
              {JSON.stringify(detail.riskMetadata, null, 2)}
            </pre>
            <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
              Risk score, AVS, CVV, 3DS — whatever the gateway returned.
            </p>
          </Section>
        )}

        {/* Raw response */}
        {detail.rawResponse && (
          <Section title="Gateway response">
            <pre className="max-h-60 overflow-auto rounded-md border p-2 text-[10px] font-mono"
                 style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
              {detail.rawResponse}
            </pre>
          </Section>
        )}

        {/* Invoice link + related attempts */}
        <Section title="Invoice">
          <div className="rounded-md border p-3 text-[12px]"
               style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <Link href={`/platform/billing/invoices/${detail.invoiceId}`}
                    className="font-mono font-semibold hover:underline"
                    style={{ color: "var(--accent-primary)" }}>
                {detail.invoiceNumber}
              </Link>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                {(detail.invoiceTotal / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                {" · "}
                {detail.invoiceStatus.toLowerCase()}
              </span>
            </div>
            <div className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
              Tenant <Link href={`/platform/tenants/${detail.tenant.id}`}
                           className="hover:underline"
                           style={{ color: "var(--text-muted)" }}>{detail.tenant.name}</Link>
            </div>
          </div>
        </Section>

        {detail.relatedAttempts.length > 0 && (
          <Section title={`Other attempts on this invoice (${detail.relatedAttempts.length})`}>
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {detail.relatedAttempts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-1.5 text-[11px]">
                  <span className="rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: a.status === "succeeded" ? "var(--emerald-50)"
                                  : a.status === "failed" ? "var(--rose-50)"
                                  : "var(--surface-2)",
                          color: a.status === "succeeded" ? "var(--emerald-700)"
                              : a.status === "failed" ? "var(--rose-700)"
                              : "var(--text-muted)",
                        }}>
                    {a.status.replaceAll("_", " ")}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                    {(a.amount / 100).toLocaleString(undefined, { style: "currency", currency: detail.currency })}
                  </span>
                  <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
                    {a.attemptedAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Recovery actions */}
        {(canRetry || canRefund) && (
          <Section title="Actions">
            <div className="flex flex-wrap gap-2">
              {canRetry && detail.status === "failed" && (
                <Button size="sm" onClick={onRetry} disabled={busy}>Retry now</Button>
              )}
              {canRetry && (
                <Button size="sm" variant="secondary" onClick={onSendPortal} disabled={busy}>
                  Email update-payment link
                </Button>
              )}
              {canRefund && detail.status === "succeeded" && (
                <Link href={`/platform/billing/invoices/${detail.invoiceId}#payments`}>
                  <Button size="sm" variant="ghost">Refund (on invoice)</Button>
                </Link>
              )}
            </div>
            {detail.status === "disputed" && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
                Disputed — handled in the gateway dashboard. Surface here once we wire dispute webhooks.
              </p>
            )}
          </Section>
        )}
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: "var(--text-default)" }}>{value}</dd>
    </>
  );
}
