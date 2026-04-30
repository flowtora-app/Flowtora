import { db } from "@/lib/db";
import { Banner, Card, CardBody, CardHeader, ProgressBar } from "@/components/ui";
import { GB_IN_BYTES } from "@/lib/storage-quota";

// Tab 4 — Usage & Limits. Per-feature usage cards. Plan limits live
// in PLAN_ENTITLEMENTS today (boolean flags only) — numeric caps are
// reserved for a follow-up that adds a `limits` JSON column to
// PricingPlan. Until then we surface the raw usage values + a soft
// "approaching limit" banner sourced from the spec's standard
// thresholds (10GB / 250 jobs / 5 seats / etc.).

interface UsageCard {
  label: string;
  used: number;
  /** Soft threshold for the warning banner — not enforced. */
  softLimit: number | null;
  unit: string;
  hint?: string;
}

// Soft thresholds — used to surface "approaching limit" banners
// without enforcing anything. Wire numeric plan caps when the
// PricingPlan.limits JSON column lands.
const SOFT_LIMIT_BY_PLAN: Record<string, { storage: number; seats: number; jobs: number; customDomains: number }> = {
  STARTER:    { storage: 5,   seats: 3,  jobs: 50,  customDomains: 0 },
  GROWTH:     { storage: 25,  seats: 10, jobs: 250, customDomains: 1 },
  PRO:        { storage: 100, seats: 25, jobs: 1000, customDomains: 1 },
  ENTERPRISE: { storage: 500, seats: 100, jobs: 5000, customDomains: 5 },
};

export interface TenantUsageTabProps { tenantId: string }

export async function TenantUsageTab({ tenantId }: TenantUsageTabProps) {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, customDomain: true } });
  if (!t) return null;
  const limits = SOFT_LIMIT_BY_PLAN[t.plan] ?? SOFT_LIMIT_BY_PLAN.GROWTH!;

  const [memberCount, fileSum, ordersThisMonth, integrationCount, notifCount, apiHits] = await Promise.all([
    db.membership.count({ where: { tenantId } }),
    db.file.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    db.order.count({ where: { tenantId, createdAt: { gte: monthStart() } } }),
    db.tenantIntegration.count({ where: { tenantId, status: "CONNECTED" } }),
    db.notification.count({ where: { tenantId, createdAt: { gte: monthStart() } } }),
    db.auditLog.count({
      where: {
        tenantId,
        action: { startsWith: "api." },
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
  ]);

  const storageBytes = Number(fileSum._sum.sizeBytes ?? 0);
  const storageGb = round2(storageBytes / GB_IN_BYTES);

  const cards: UsageCard[] = [
    { label: "Storage",            used: storageGb,         softLimit: limits.storage, unit: "GB" },
    { label: "User seats",         used: memberCount,       softLimit: limits.seats,   unit: "" },
    { label: "Jobs (this month)",  used: ordersThisMonth,   softLimit: limits.jobs,    unit: "" },
    { label: "Custom domains",     used: t.customDomain ? 1 : 0, softLimit: limits.customDomains, unit: "" },
    { label: "Integrations",       used: integrationCount,  softLimit: null,           unit: "connected" },
    { label: "In-app notifications", used: notifCount,      softLimit: null,           unit: "this month" },
    { label: "API events (30d)",   used: apiHits,           softLimit: null,           unit: "" },
  ];

  const overage = cards.some((c) => c.softLimit != null && c.softLimit > 0 && c.used > c.softLimit);
  const nearLimit = cards.some((c) => c.softLimit != null && c.softLimit > 0 && c.used > 0.8 * c.softLimit && c.used <= c.softLimit);

  return (
    <div className="space-y-4">
      {overage && (
        <Banner variant="error" title="Soft-limit exceeded">
          One or more features are above the plan's soft limit. Upgrade the plan from the
          Tenants list bulk-bar, or add a per-tenant feature-flag override on the Flags tab.
        </Banner>
      )}
      {!overage && nearLimit && (
        <Banner variant="warning" title="Approaching limits">
          One or more features are above 80% of the plan's soft limit.
        </Banner>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const pct = c.softLimit != null && c.softLimit > 0
            ? Math.min(100, Math.round((c.used / c.softLimit) * 100))
            : null;
          const tone: "default" | "danger" | "warning" | "success" = pct == null
            ? "default"
            : pct >= 100 ? "danger" : pct >= 80 ? "warning" : "success";
          return (
            <Card key={c.label} padding="md">
              <CardHeader title={c.label} description={c.hint} />
              <CardBody>
                <div className="flex items-baseline justify-between">
                  <div className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                    {c.used.toLocaleString()} {c.unit}
                  </div>
                  {c.softLimit != null && (
                    <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      / {c.softLimit.toLocaleString()} {c.unit}
                    </div>
                  )}
                </div>
                {pct != null && (
                  <div className="mt-2">
                    <ProgressBar
                      value={pct}
                      size="sm"
                      tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "success"}
                    />
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
      <Card padding="md">
        <CardHeader title="Adjust limits" />
        <CardBody>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Soft limits in this view are derived from the plan tier (Starter / Growth / Pro / Enterprise).
            Numeric per-tenant overrides arrive when <code>PricingPlan.limits</code> ships — until then,
            reach for the Flags tab for boolean entitlement overrides or the Tenants-list bulk-bar
            for plan changes.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function monthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
