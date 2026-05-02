// Page 18 — dispute detail.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import {
  loadDisputeDetail,
  loadEvidenceTemplates,
} from "@/server/platform/refunds-disputes";
import { DisputeEvidenceForm } from "./_components/DisputeEvidenceForm";
import { AcceptDisputeButton } from "./_components/AcceptDisputeButton";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

function formatMoney(minor: number, currency: string) {
  return (minor / 100).toLocaleString(undefined, { style: "currency", currency });
}

function StatusPill({ status }: { status: "NEEDS_RESPONSE" | "UNDER_REVIEW" | "WON" | "LOST" }) {
  const PALETTE: Record<typeof status, { bg: string; fg: string; label: string }> = {
    NEEDS_RESPONSE: { bg: "var(--rose-50)",     fg: "var(--rose-700)",    label: "Needs response" },
    UNDER_REVIEW:   { bg: "var(--amber-50)",    fg: "var(--amber-700)",   label: "Under review" },
    WON:            { bg: "var(--emerald-50)",  fg: "var(--emerald-700)", label: "Won" },
    LOST:           { bg: "var(--rose-50)",     fg: "var(--rose-700)",    label: "Lost" },
  };
  const p = PALETTE[status];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ background: p.bg, color: p.fg }}>
      {p.label}
    </span>
  );
}

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePlatformStaff();
  const [detail, templates] = await Promise.all([
    loadDisputeDetail(id),
    loadEvidenceTemplates(),
  ]);
  if (!detail) notFound();
  const canManage = ctx.can("billing.refund");

  const open = detail.status === "NEEDS_RESPONSE";
  const dueIn = detail.evidenceDueAt
    ? Math.ceil((detail.evidenceDueAt.getTime() - Date.now()) / DAY)
    : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Refunds & Disputes", href: "/platform/billing/refunds?tab=disputes" },
          { label: `Dispute · ${detail.id.slice(0, 10)}…` },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={detail.reason}
            description={`Dispute against ${detail.tenant.name} · ${detail.invoiceNumber}`}
            actions={
              <div className="flex items-center gap-2">
                <StatusPill status={detail.status} />
                {canManage && open && (
                  <AcceptDisputeButton disputeId={detail.id} />
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* Top-of-fold: deadline countdown */}
      {open && detail.evidenceDueAt && (
        <Card padding="md"
              style={{
                borderColor: dueIn != null && dueIn <= 3 ? "var(--rose-300)" : "var(--amber-200)",
                background: dueIn != null && dueIn <= 3 ? "var(--rose-50)" : "var(--amber-50)",
              }}>
          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <strong style={{ color: "var(--text-default)" }}>Evidence due</strong>
            <span style={{ color: "var(--text-muted)" }}>
              {detail.evidenceDueAt.toLocaleString()}
            </span>
            <span className="font-semibold tabular-nums"
                  style={{
                    color: dueIn == null ? "var(--text-muted)"
                         : dueIn < 0 ? "var(--rose-700)"
                         : dueIn <= 3 ? "var(--rose-700)"
                         : "var(--amber-700)",
                  }}>
              {dueIn == null ? "—"
                : dueIn < 0 ? `Overdue by ${Math.abs(dueIn)}d`
                : dueIn === 0 ? "Due today"
                : `${dueIn} day${dueIn === 1 ? "" : "s"} remaining`}
            </span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left column: dispute + payment + invoice context */}
        <div className="lg:col-span-2 space-y-5">
          <Card padding="md">
            <CardHeader title="Dispute details" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <Row k="Disputed amount" v={formatMoney(detail.amount, detail.currency)} />
              <Row k="Reason code" v={detail.reasonCode ?? "—"} />
              <Row k="Created" v={detail.createdAt.toLocaleString()} />
              <Row k="Evidence due" v={detail.evidenceDueAt?.toLocaleString() ?? "—"} />
              <Row k="Submitted" v={detail.submittedEvidenceAt?.toLocaleString() ?? "—"} />
              <Row k="Resolved" v={detail.resolvedAt?.toLocaleString() ?? "—"} />
            </dl>
          </Card>

          <Card padding="md">
            <CardHeader title="Original payment" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <Row k="Gateway" v={detail.payment.gateway} />
              <Row k="Gateway payment ID"
                   v={<span className="font-mono">{detail.payment.gatewayPaymentId ?? "—"}</span>} />
              <Row k="Method" v={detail.payment.method ?? "—"} />
              <Row k="Charged" v={detail.payment.attemptedAt.toLocaleString()} />
              <Row k="Amount" v={formatMoney(detail.payment.amount, detail.currency)} />
              <Row k="Fee" v={formatMoney(detail.payment.fee, detail.currency)} />
              <Row k="Net" v={formatMoney(detail.payment.net, detail.currency)} />
              {detail.payment.failureCode && (
                <Row k="Failure" v={`${detail.payment.failureCode}${detail.payment.failureReason ? ` · ${detail.payment.failureReason}` : ""}`} />
              )}
            </dl>
            <div className="mt-3">
              <Link href={`/platform/billing/invoices/${detail.invoiceId}`}
                    className="text-[12px] hover:underline"
                    style={{ color: "var(--accent-primary)" }}>
                Open invoice {detail.invoiceNumber} →
              </Link>
            </div>
          </Card>

          <Card padding="md">
            <CardHeader title="All payment attempts on this invoice" />
            {detail.invoiceAttempts.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>None.</p>
            ) : (
              <ul className="divide-y text-[12px]" style={{ borderColor: "var(--border-subtle)" }}>
                {detail.invoiceAttempts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-1.5">
                    <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {a.attemptedAt.toLocaleString()}
                    </span>
                    <span style={{ color: "var(--text-default)" }}>{a.status}</span>
                    <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                      {formatMoney(a.amount, detail.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Evidence form / read-only view */}
          {detail.status === "NEEDS_RESPONSE" && canManage ? (
            <Card padding="md">
              <CardHeader
                title="Submit evidence"
                description="Write the evidence packet here. We capture the customer-history snapshot at submission time so the gateway sees exactly what you did."
              />
              <DisputeEvidenceForm
                disputeId={detail.id}
                templates={templates}
                tenantName={detail.tenant.name}
                amountStr={formatMoney(detail.amount, detail.currency)}
                dateStr={detail.payment.attemptedAt.toLocaleDateString()}
              />
            </Card>
          ) : detail.evidenceText ? (
            <Card padding="md">
              <CardHeader
                title="Submitted evidence"
                description={detail.submittedEvidenceAt
                  ? `Submitted ${detail.submittedEvidenceAt.toLocaleString()}`
                  : undefined}
              />
              <pre className="rounded-md p-3 text-[12px] whitespace-pre-wrap break-words"
                   style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                {detail.evidenceText}
              </pre>
            </Card>
          ) : null}

          {detail.acceptedAt && (
            <Card padding="md" style={{ borderColor: "var(--rose-200)", background: "var(--rose-50)" }}>
              <p className="text-[12px]" style={{ color: "var(--rose-700)" }}>
                <strong>Dispute accepted</strong> on {detail.acceptedAt.toLocaleString()} — recorded as a loss.
              </p>
            </Card>
          )}
        </div>

        {/* Right column: customer history snapshot */}
        <aside className="space-y-5">
          <Card padding="md">
            <CardHeader title="Customer history" description="Snapshot for the evidence packet." />
            <dl className="grid grid-cols-1 gap-y-2 text-[12px]">
              <Row k="Tenant" v={
                <Link href={`/platform/tenants/${detail.tenant.id}`}
                      className="hover:underline"
                      style={{ color: "var(--accent-primary)" }}>
                  {detail.tenant.name}
                </Link>
              } />
              <Row k="Tenant status" v={detail.customerHistory.tenantStatus} />
              <Row k="On Flowtora since"
                   v={detail.customerHistory.tenantCreatedAt.toLocaleDateString()} />
              <Row k="Successful payments"
                   v={detail.customerHistory.totalSucceededPayments.toLocaleString()} />
              <Row k="Lifetime revenue"
                   v={formatMoney(detail.customerHistory.totalRevenueMinorUnits, detail.currency)} />
              <Row k="Past disputes"
                   v={detail.customerHistory.pastDisputes.toLocaleString()} />
              <Row k="Past refunds"
                   v={detail.customerHistory.pastRefunds.toLocaleString()} />
            </dl>
          </Card>

          {detail.contextSnapshot && Object.keys(detail.contextSnapshot).length > 0 && (
            <Card padding="md">
              <CardHeader
                title="Snapshot at submission"
                description="Locked-in record sent with the evidence."
              />
              <pre className="rounded-md p-2 text-[10px] whitespace-pre-wrap break-words"
                   style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                {JSON.stringify(detail.contextSnapshot, null, 2)}
              </pre>
            </Card>
          )}

          <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
            <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
              <strong>Honest deferral:</strong> submitting evidence here flips the local status to{" "}
              <span className="font-mono">UNDER_REVIEW</span> + records the packet, but doesn&apos;t ship it
              to the gateway yet. Once the Stripe dispute integration lands, the same submit will push the
              evidence + supporting docs to Stripe and we&apos;ll wait on the resolution webhook.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
      <dd style={{ color: "var(--text-default)" }}>{v}</dd>
    </>
  );
}
