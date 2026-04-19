import { requirePermission } from "@/lib/tenant";
import { startCheckout, openBillingPortal } from "@/app/actions/billing";
import { Button } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { PLAN_LABELS } from "@/lib/billing";

const PLANS: { key: "STARTER" | "GROWTH" | "PRO"; price: string; blurb: string }[] = [
  { key: "STARTER", price: "$29/mo", blurb: "Solo or small shop. CRM, quotes, invoices." },
  { key: "GROWTH", price: "$79/mo", blurb: "More users, production tracking, customer portal." },
  { key: "PRO", price: "$149/mo", blurb: "Automation, install scheduling, advanced reports." },
];

export default async function BillingSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; checkout?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant } = await requirePermission(slug, "tenant:billing");
  const checkout = startCheckout.bind(null, slug);
  const portal = openBillingPortal.bind(null, slug);

  const trialDaysLeft = tenant.trialEndsAt
    ? Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Current plan" />
        <div className="px-5 py-5 text-sm">
          <div><strong>{PLAN_LABELS[tenant.plan]}</strong> · {tenant.status}</div>
          {tenant.status === "TRIAL" && trialDaysLeft !== null && (
            <div className="mt-1" style={{ color: "var(--text-muted)" }}>
              Trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} remaining.
            </div>
          )}
          {tenant.stripeCustomerId && (
            <form action={portal} className="mt-4">
              <Button type="submit" variant="secondary">Manage billing</Button>
            </form>
          )}
        </div>
      </Card>

      {sp.error === "stripe_unconfigured" && (
        <p className="text-sm" style={{ color: "var(--danger-fg)" }}>
          Stripe isn&apos;t configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_* to your .env.
        </p>
      )}
      {sp.checkout === "success" && (
        <p className="text-sm" style={{ color: "var(--success-fg)" }}>Subscription updated.</p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.key}>
            <div className="px-5 py-5">
              <div className="text-sm font-semibold">{PLAN_LABELS[p.key]}</div>
              <div className="mt-1 text-2xl font-semibold">{p.price}</div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>{p.blurb}</p>
              <form action={checkout} className="mt-4">
                <input type="hidden" name="plan" value={p.key} />
                <Button
                  type="submit"
                  variant={tenant.plan === p.key ? "secondary" : "primary"}
                >
                  {tenant.plan === p.key && tenant.status === "ACTIVE" ? "Current plan" : "Choose"}
                </Button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
