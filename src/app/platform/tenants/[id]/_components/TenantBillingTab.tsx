import { db } from "@/lib/db";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  StatusPill,
} from "@/components/ui";
import { getAllPlans } from "@/lib/plans";
import type { Plan } from "@prisma/client";

export interface TenantBillingTabProps {
  tenantId: string;
  canPlanChange: boolean;
  canRefund: boolean;
  canCoupon: boolean;
}

export async function TenantBillingTab({ tenantId, canPlanChange, canRefund, canCoupon }: TenantBillingTabProps) {
  const [tenant, payments, invoices] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plan: true, status: true, stripeCustomerId: true, stripeSubscriptionId: true,
        currency: true, taxId: true, trialEndsAt: true, archivedAt: true,
        activeCouponId: true, dunningStage: true,
        activeCoupon: { select: { code: true, discountType: true, amount: true } },
      },
    }),
    db.payment.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, amount: true, method: true,
        receivedAt: true, failedAt: true, voidedAt: true,
        failureReason: true, createdAt: true,
      },
    }),
    db.platformBillingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, number: true, status: true, currency: true,
        total: true, issuedAt: true, dueAt: true, paidAt: true,
      },
    }),
  ]);
  const planList = await getAllPlans();
  if (!tenant) return null;

  const planRow = planList.find((p) => p.slug.toUpperCase() === tenant.plan);
  const planPrice = planRow?.priceMonthly ?? 0;
  const isPaying = tenant.status === "ACTIVE" || tenant.status === "PAST_DUE";

  return (
    <div className="space-y-4">
      {/* Current subscription */}
      <Card padding="md">
        <CardHeader title="Current subscription" right={canPlanChange ? <PlanChangeButton currentPlan={tenant.plan} /> : null} />
        <CardBody>
          <dl className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-4">
            <Field label="Plan"   value={planRow?.name ?? tenant.plan} />
            <Field label="Status" value={<StatusPill status={tenant.status === "ACTIVE" ? "active" : tenant.status === "PAST_DUE" ? "past_due" : tenant.status === "TRIAL" ? "trialing" : "draft"} size="sm" />} />
            <Field label="Monthly" value={planPrice ? `$${planPrice.toLocaleString()}` : "—"} />
            <Field label="Currency" value={tenant.currency} />
            <Field label="Stripe customer" value={tenant.stripeCustomerId ? <code className="font-mono text-[11px]">{tenant.stripeCustomerId}</code> : null} />
            <Field label="Stripe subscription" value={tenant.stripeSubscriptionId ? <code className="font-mono text-[11px]">{tenant.stripeSubscriptionId}</code> : null} />
            <Field label="Trial ends" value={tenant.trialEndsAt?.toLocaleDateString() ?? null} />
            <Field label="Tax ID" value={tenant.taxId ?? null} />
          </dl>
        </CardBody>
      </Card>

      {/* Dunning / coupon strip */}
      {(tenant.dunningStage !== "NONE" || tenant.activeCoupon) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tenant.dunningStage !== "NONE" && (
            <Card padding="md">
              <CardHeader title="Dunning" />
              <CardBody>
                <Badge size="xs" color="warning">{tenant.dunningStage.replace("_", " ")}</Badge>
                <div className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Recovery cycle in progress. The /platform/billing/dunning page has the full step-by-step view.
                </div>
              </CardBody>
            </Card>
          )}
          {tenant.activeCoupon && (
            <Card padding="md">
              <CardHeader title="Active coupon" />
              <CardBody>
                <div className="flex items-baseline gap-2">
                  <Badge size="xs" color="success">{tenant.activeCoupon.code}</Badge>
                  <span className="text-[13px]" style={{ color: "var(--text-default)" }}>
                    {tenant.activeCoupon.discountType === "PERCENT" ? `${tenant.activeCoupon.amount}% off` : `$${(tenant.activeCoupon.amount / 100).toFixed(2)} off`}
                  </span>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Invoice history */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Invoice history" description={invoices.length > 0 ? `${invoices.length} most recent` : "Stripe-managed invoices land in the Stripe dashboard"} />
        </div>
        {invoices.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No platform invoices on file"
              description={
                <span>
                  This tenant's billing happens in Stripe. Click the Stripe customer link above to open the
                  full invoice history. Manual / overage invoices created from this admin appear here.
                </span>
              }
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Number</Th><Th>Status</Th><Th align="right">Total</Th><Th>Issued</Th><Th>Due</Th><Th>Paid</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td><span className="font-mono">{inv.number}</span></Td>
                    <Td><Badge size="xs" color={inv.status === "PAID" ? "success" : inv.status === "VOIDED" || inv.status === "REFUNDED" ? "neutral" : "warning"}>{inv.status}</Badge></Td>
                    <Td align="right">${(inv.total / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} {inv.currency}</Td>
                    <Td>{inv.issuedAt?.toLocaleDateString() ?? "—"}</Td>
                    <Td>{inv.dueAt?.toLocaleDateString() ?? "—"}</Td>
                    <Td>{inv.paidAt?.toLocaleDateString() ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payment history */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader
            title="Payment history"
            description={`${payments.length} most recent · ${isPaying ? "tenant currently in a paying state" : "tenant not currently paying"}`}
          />
        </div>
        {payments.length === 0 ? (
          <CardBody><EmptyState title="No payments" description="Payments land here once they're recorded." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>When</Th><Th>Method</Th><Th align="right">Amount</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const status =
                    p.voidedAt   ? { label: "Voided",  color: "neutral" as const } :
                    p.receivedAt ? { label: "Paid",    color: "success" as const } :
                    p.failedAt   ? { label: "Failed",  color: "error"   as const } :
                                   { label: "Pending", color: "warning" as const };
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <Td>{(p.receivedAt ?? p.failedAt ?? p.createdAt).toLocaleString()}</Td>
                      <Td>{p.method}</Td>
                      <Td align="right">${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Td>
                      <Td><Badge size="xs" color={status.color}>{status.label}</Badge>{p.failureReason ? <span className="ml-2" style={{ color: "var(--text-faint)" }}>{p.failureReason}</span> : null}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Actions */}
      <Card padding="md">
        <CardHeader title="Actions" />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {canCoupon && (
              <a href={`/platform/billing/coupons?tenant=${tenantId}`}>
                <Button size="sm" variant="secondary">Apply coupon</Button>
              </a>
            )}
            {canRefund && (
              <a href={`/platform/billing/payments?tenant=${tenantId}`}>
                <Button size="sm" variant="secondary">Refund / credit</Button>
              </a>
            )}
            {tenant.stripeCustomerId && (
              <a href={`https://dashboard.stripe.com/customers/${tenant.stripeCustomerId}`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost">Open in Stripe ↗</Button>
              </a>
            )}
          </div>
          {(!canCoupon && !canRefund) && (
            <div className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
              Your role is read-only on billing actions.
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function PlanChangeButton({ currentPlan }: { currentPlan: Plan }) {
  // Server-rendered "open Bulk → Move plan" hint — the bulk picker
  // already covers single-tenant plan changes and emits the right
  // SubscriptionEvent. Avoids a per-tenant client modal duplicate.
  return (
    <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
      Current: {currentPlan} · Use the Tenants list bulk-bar to change.
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode | null }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="mt-0.5" style={{ color: "var(--text-default)" }}>
        {value == null || value === "" ? <span style={{ color: "var(--text-faint)" }}>—</span> : value}
      </dd>
    </div>
  );
}
function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", textAlign: align }}>
      {children}
    </th>
  );
}
function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)", textAlign: align, fontVariantNumeric: align === "right" ? "tabular-nums" : undefined, fontFamily: align === "right" ? "ui-monospace, Menlo, monospace" : undefined }}>{children}</td>;
}
