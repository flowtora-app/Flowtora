import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Button, SelectField, TextArea, Field } from "@/components/Field";
import {
  updateTenantStatus,
  updateTenantPlan,
  updateTenantNotes,
  updateTenantEnvironment,
  updateTenantCohort,
  archiveTenant,
  restoreTenant,
  startImpersonation,
  resetTenantSandbox,
} from "@/app/actions/platform";
import {
  upsertPriceOverride,
  deletePriceOverride,
} from "@/app/actions/plan-overrides";
import { formatMoney } from "@/lib/format";
import { resolveAllEntitlements } from "@/lib/entitlements";
import type { FeatureKey } from "@/lib/entitlements";
import { computeTenantHealth } from "@/lib/tenant-health";
import { COHORT_OPTIONS } from "@/lib/cohorts";
import { computeReadiness } from "@/lib/readiness";

import { TenantHeaderBar } from "@/components/platform/TenantHeaderBar";
import { TenantTabs, type TenantTabKey, type TenantTab } from "@/components/platform/TenantTabs";
import { TenantOverviewKPIs, type TenantKpi } from "@/components/platform/TenantOverviewKPIs";
import { TenantHealthPanel } from "@/components/platform/TenantHealthPanel";
import {
  TenantFeaturesPanel,
  type EntitlementMap,
  type TenantFlagRow,
} from "@/components/platform/TenantFeaturesPanel";
import {
  TenantActivityTimeline,
  type ActivityEvent,
} from "@/components/platform/TenantActivityTimeline";

// Phase 22 (transformation) — Tenant detail control center.
//
// One sticky identity header + tabbed body. Six tabs:
//
//   Overview · Billing · Access · Settings · Admin · Activity
//
// All data fetched up-front in a flat Promise.all so any tab loads at
// the same speed as the current monolithic page; the cost is
// amortized across the typical admin session who hops between tabs.
//
// All UI state lives in the URL (?tab=). No client-side state.

const TENANT_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"] as const;
const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;
const ENVIRONMENTS = ["LIVE", "DEMO", "TEST"] as const;

const TAB_KEYS: TenantTabKey[] = ["overview", "billing", "access", "settings", "admin", "activity"];

const DAY_MS = 86_400_000;

export default async function PlatformTenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const activeTab: TenantTabKey =
    (TAB_KEYS as readonly string[]).includes(sp.tab ?? "")
      ? (sp.tab as TenantTabKey)
      : "overview";

  const tenant = await db.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();

  // ── Time windows for trend deltas ───────────────────────────
  const now = new Date();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const win30 = new Date(now.getTime() - 30 * DAY_MS);
  const win60 = new Date(now.getTime() - 60 * DAY_MS);

  // ── Parallel data fetch ─────────────────────────────────────
  const [
    memberCount,
    customerCount,
    productCount,
    quoteCount,
    quoteThisMonth,
    quotes30d,
    quotesPrior30d,
    orderCount,
    orderThisMonth,
    orders30d,
    ordersPrior30d,
    invoiceCount,
    revenue,
    revenue30d,
    revenuePrior30d,
    openAR,
    lastQuote,
    lastOrder,
    recentAudits,
    entitlements,
    tenantFlagRows,
    openTickets,
    priceOverrides,
    pricingPlans,
  ] = await Promise.all([
    db.membership.count({ where: { tenantId: id, status: "ACTIVE" } }),
    db.customer.count({ where: { tenantId: id } }),
    db.product.count({ where: { tenantId: id } }),
    db.quote.count({ where: { tenantId: id } }),
    db.quote.count({ where: { tenantId: id, createdAt: { gte: monthStart } } }),
    db.quote.count({ where: { tenantId: id, createdAt: { gte: win30 } } }),
    db.quote.count({ where: { tenantId: id, createdAt: { gte: win60, lt: win30 } } }),
    db.order.count({ where: { tenantId: id } }),
    db.order.count({ where: { tenantId: id, createdAt: { gte: monthStart } } }),
    db.order.count({ where: { tenantId: id, createdAt: { gte: win30 } } }),
    db.order.count({ where: { tenantId: id, createdAt: { gte: win60, lt: win30 } } }),
    db.invoice.count({ where: { tenantId: id } }),
    db.payment.aggregate({ where: { tenantId: id }, _sum: { amount: true } }),
    db.payment.aggregate({
      where: { tenantId: id, createdAt: { gte: win30 } },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { tenantId: id, createdAt: { gte: win60, lt: win30 } },
      _sum: { amount: true },
    }),
    db.invoice.findMany({
      where: { tenantId: id, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
      select: { total: true, amountPaid: true, dueDate: true, status: true },
    }),
    db.quote.findFirst({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.order.findFirst({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.auditLog.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        userId: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    }),
    resolveAllEntitlements(tenant.id, tenant.plan),
    db.featureFlag.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, key: true, enabled: true, note: true },
    }),
    db.supportTicket.findMany({
      where: { tenantId: tenant.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 10,
      select: {
        id: true, subject: true, status: true, priority: true, category: true,
        updatedAt: true, assignedTo: true,
      },
    }),
    db.planPriceOverride.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        planId: true,
        priceMonthly: true,
        priceAnnual: true,
        currency: true,
        note: true,
        expiresAt: true,
        createdAt: true,
        plan: { select: { slug: true, name: true } },
      },
    }),
    db.pricingPlan.findMany({
      where: { status: { in: ["PUBLISHED", "HIDDEN"] } },
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, slug: true, name: true, priceMonthly: true, priceAnnual: true },
    }),
  ]);

  const tenantFlagByKey = new Map<string, TenantFlagRow>(
    tenantFlagRows.map((f) => [f.key, f]),
  );

  // Resolve userIds in audits to friendly names.
  const userIds = Array.from(new Set(recentAudits.map((a) => a.userId).filter(Boolean))) as string[];
  const users = userIds.length
    ? await db.user.findMany({
        where:  { id: { in: userIds } },
        select: { id: true, email: true, name: true, platformRole: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // ── Derived numbers ─────────────────────────────────────────
  const revenueTotal = revenue._sum.amount ? Number(revenue._sum.amount) : 0;
  const revenue30dN  = revenue30d._sum.amount ? Number(revenue30d._sum.amount) : 0;
  const revenuePrior30dN = revenuePrior30d._sum.amount ? Number(revenuePrior30d._sum.amount) : 0;
  const openARTotal = openAR.reduce(
    (sum, inv) => sum + (Number(inv.total) - Number(inv.amountPaid)),
    0,
  );
  const overdueAR = openAR
    .filter((inv) => inv.status === "OVERDUE" || (inv.dueDate && inv.dueDate.getTime() < now.getTime()))
    .reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.amountPaid)), 0);

  const lastActivity =
    tenant.lastActivityAt ?? lastQuote?.createdAt ?? lastOrder?.createdAt ?? tenant.createdAt;
  const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS);
  const lastActivityLabel =
    daysSinceActivity === 0 ? "Active today"
    : daysSinceActivity < 7 ? `Active ${daysSinceActivity}d ago`
    : daysSinceActivity < 30 ? `Idle ${daysSinceActivity}d`
    : `Dormant ${daysSinceActivity}d`;

  const health = computeTenantHealth(tenant);
  const readiness = computeReadiness({
    tenant,
    memberCount,
    customerCount,
    productCount,
    quoteCount,
    orderCount,
  });

  // ── Bound server actions to this tenant id ──────────────────
  const saveStatus  = updateTenantStatus.bind(null, tenant.id);
  const savePlan    = updateTenantPlan.bind(null, tenant.id);
  const saveNotes   = updateTenantNotes.bind(null, tenant.id);
  const saveEnv     = updateTenantEnvironment.bind(null, tenant.id);
  const saveCohort  = updateTenantCohort.bind(null, tenant.id);
  const doArchive   = archiveTenant.bind(null, tenant.id);
  const doRestore   = restoreTenant.bind(null, tenant.id);
  const resetSandbox = resetTenantSandbox.bind(null, tenant.id);
  const impersonate = startImpersonation.bind(null, tenant.id);

  // ── Header chips ────────────────────────────────────────────
  const statusTone =
    tenant.status === "ACTIVE"    ? "success" :
    tenant.status === "TRIAL"     ? "accent"  :
    tenant.status === "PAST_DUE"  ? "warning" :
    tenant.status === "SUSPENDED" ? "danger"  :
    tenant.status === "CANCELED"  ? "neutral" :
    tenant.status === "ARCHIVED"  ? "neutral" :
    "default";
  const envTone = tenant.environment === "LIVE" ? "default" : tenant.environment === "DEMO" ? "warning" : "accent";
  const healthTone =
    health.level === "healthy"   ? "success" :
    health.level === "attention" ? "accent"  :
    health.level === "at-risk"   ? "warning" :
    health.level === "critical"  ? "danger"  :
    "neutral";

  const headerChips: { label: string; tone: "default" | "accent" | "success" | "warning" | "danger" | "neutral"; dot?: boolean; title?: string }[] = [
    { label: tenant.status,      tone: statusTone, title: "Account status" },
    { label: tenant.plan,        tone: "default",  title: "Subscription plan" },
    { label: tenant.environment, tone: envTone,    title: "Environment — non-LIVE shows a workspace ribbon" },
    ...(tenant.betaCohort && tenant.betaCohort !== "NONE" ? [{ label: tenant.betaCohort, tone: "accent" as const, title: "Release cohort" }] : []),
    { label: health.label, tone: healthTone, dot: true, title: health.signals.join(" · ") || "Tenant health" },
  ];

  const subline = `${tenant.slug} · ${lastActivityLabel}${
    health.daysUntilTrialEnd !== null && health.daysUntilTrialEnd >= 0
      ? ` · Trial ends in ${health.daysUntilTrialEnd}d`
      : ""
  }`;

  // ── Tab bar with attention badges ───────────────────────────
  const requiredMissing = readiness.checks.filter((c) => c.required && !c.done).length;
  const tabs: TenantTab[] = [
    { key: "overview", label: "Overview" },
    {
      key: "billing",
      label: "Billing",
      badge: !tenant.stripeCustomerId && tenant.environment === "LIVE" ? "!" : undefined,
      badgeTone: "warning",
    },
    { key: "access",   label: "Access" },
    { key: "settings", label: "Settings" },
    {
      key: "admin",
      label: "Admin",
      badge: openTickets.length > 0 ? openTickets.length : undefined,
      badgeTone: "warning",
    },
    {
      key: "activity",
      label: "Activity",
      badge: requiredMissing > 0 ? requiredMissing : undefined,
      badgeTone: "danger",
    },
  ];

  // ── KPI tiles ───────────────────────────────────────────────
  const kpis: TenantKpi[] = [
    { label: "Users",     value: memberCount.toString(),    subtitle: "active memberships" },
    { label: "Customers", value: customerCount.toLocaleString() },
    { label: "Products",  value: productCount.toLocaleString() },
    {
      label: "Quotes",
      value: quoteCount.toLocaleString(),
      subtitle: `${quoteThisMonth} this month`,
      deltaPct: pctDelta(quotes30d, quotesPrior30d),
    },
    {
      label: "Orders",
      value: orderCount.toLocaleString(),
      subtitle: `${orderThisMonth} this month`,
      deltaPct: pctDelta(orders30d, ordersPrior30d),
    },
    { label: "Invoices", value: invoiceCount.toLocaleString() },
    {
      label: "Revenue",
      value: formatMoney(revenueTotal, tenant.currency),
      subtitle: "lifetime payments",
      deltaPct: pctDelta(revenue30dN, revenuePrior30dN),
      emphasis: "success",
    },
    {
      label: "A/R open",
      value: formatMoney(openARTotal.toFixed(2), tenant.currency),
      subtitle: overdueAR > 0
        ? `${formatMoney(overdueAR.toFixed(2), tenant.currency)} overdue`
        : "outstanding balance",
      emphasis: overdueAR > 0 ? "warning" : "default",
    },
  ];

  // ── Activity events (latest 25 for the timeline preview / 50 for tab) ──
  const auditEvents: ActivityEvent[] = recentAudits.map((a) => {
    const actor = a.userId ? userById.get(a.userId) : null;
    const who = actor?.name ?? actor?.email ?? (a.userId ? "unknown user" : "system");
    return {
      id: a.id,
      action: a.action,
      createdAt: a.createdAt,
      actorLabel: actor?.platformRole ? `${who} (platform)` : who,
      isPlatform: !!actor?.platformRole || a.action.startsWith("platform."),
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata,
    };
  });

  return (
    <div>
      {/* ── Identity header ─────────────────────────────────── */}
      <TenantHeaderBar
        name={tenant.name}
        slug={tenant.slug}
        workspaceHref={`/t/${tenant.slug}/dashboard`}
        chips={headerChips}
        subline={subline}
      />

      {/* ── Inline banners (always visible) ─────────────────── */}
      <div className="mt-4 space-y-2">
        {sp.error && (
          <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />
        )}
        {sp.ok && (
          <Banner tone="success" title="Saved" body={decodeURIComponent(sp.ok)} />
        )}
        {tenant.status === "TRIAL" && tenant.trialEndsAt && (() => {
          const daysLeft = Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / DAY_MS);
          if (daysLeft > 7) return null;
          const overdue = daysLeft < 0;
          return (
            <Banner
              tone={overdue ? "danger" : "warning"}
              title={overdue ? `Trial expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago` : `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
              body={`Expires ${tenant.trialEndsAt.toISOString().slice(0, 10)} — convert or suspend to avoid limbo.`}
            />
          );
        })()}
        {tenant.status === "SUSPENDED" && tenant.suspensionReason && (
          <Banner tone="warning" title="Suspended" body={tenant.suspensionReason} />
        )}
        {tenant.status === "ARCHIVED" && (
          <Banner
            tone="neutral"
            title="Archived"
            body={
              "Archived on " + (tenant.archivedAt?.toISOString().slice(0, 10) ?? "—") +
              (tenant.scheduledDeletionAt
                ? " · scheduled for permanent deletion " + tenant.scheduledDeletionAt.toISOString().slice(0, 10)
                : "")
            }
          />
        )}
      </div>

      {/* ── Tab nav ─────────────────────────────────────────── */}
      <div className="mt-6">
        <TenantTabs tenantId={tenant.id} active={activeTab} tabs={tabs} />
      </div>

      {/* ── Tab body ────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <OverviewTab
          kpis={kpis}
          health={health}
          readiness={readiness}
          lastActivityLabel={lastActivityLabel}
          recentEvents={auditEvents.slice(0, 8)}
          tenantId={tenant.id}
        />
      )}

      {activeTab === "billing" && (
        <BillingTab
          tenant={tenant}
          canWrite={ctx.canWrite}
          savePlan={savePlan}
          priceOverrides={priceOverrides}
          pricingPlans={pricingPlans}
        />
      )}

      {activeTab === "access" && (
        <AccessTab
          tenantId={tenant.id}
          tenantPlan={tenant.plan}
          entitlements={entitlements as EntitlementMap}
          tenantFlagByKey={tenantFlagByKey}
          canWrite={ctx.canWrite}
          canImpersonate={ctx.canImpersonate}
          impersonate={impersonate}
        />
      )}

      {activeTab === "settings" && (
        <SettingsTab
          tenant={tenant}
          canWrite={ctx.canWrite}
          saveEnv={saveEnv}
          saveCohort={saveCohort}
          resetSandbox={resetSandbox}
        />
      )}

      {activeTab === "admin" && (
        <AdminTab
          tenant={tenant}
          canWrite={ctx.canWrite}
          saveStatus={saveStatus}
          doArchive={doArchive}
          doRestore={doRestore}
          openTickets={openTickets}
        />
      )}

      {activeTab === "activity" && (
        <ActivityTab
          events={auditEvents}
          notes={tenant.notes}
          saveNotes={saveNotes}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// TAB PANELS
// ────────────────────────────────────────────────────────────────

function OverviewTab({
  kpis,
  health,
  readiness,
  lastActivityLabel,
  recentEvents,
  tenantId,
}: {
  kpis: TenantKpi[];
  health: ReturnType<typeof computeTenantHealth>;
  readiness: ReturnType<typeof computeReadiness>;
  lastActivityLabel: string;
  recentEvents: ActivityEvent[];
  tenantId: string;
}) {
  return (
    <div className="space-y-6">
      <TenantOverviewKPIs kpis={kpis} />
      <TenantHealthPanel
        health={health}
        readiness={readiness}
        lastActivityLabel={lastActivityLabel}
      />
      <Section title="Recent activity" right={
        <Link
          href={`/platform/tenants/${tenantId}?tab=activity`}
          className="text-xs underline"
          style={{ color: "var(--text-muted)" }}
        >
          See all →
        </Link>
      }>
        <TenantActivityTimeline events={recentEvents} />
      </Section>
    </div>
  );
}

function BillingTab({
  tenant,
  canWrite,
  savePlan,
  priceOverrides,
  pricingPlans,
}: {
  tenant: { id: string; plan: string; currency: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null; trialEndsAt: Date | null; environment: string };
  canWrite: boolean;
  savePlan: (formData: FormData) => Promise<void>;
  priceOverrides: Array<{
    id: string;
    planId: string;
    priceMonthly: unknown;
    priceAnnual: unknown;
    currency: string;
    note: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    plan: { slug: string; name: string };
  }>;
  pricingPlans: Array<{ id: string; slug: string; name: string; priceMonthly: unknown; priceAnnual: unknown }>;
}) {
  const stripeMissing = !tenant.stripeCustomerId && tenant.environment === "LIVE";
  return (
    <div className="space-y-6">
      {stripeMissing && (
        <Banner
          tone="warning"
          title="No Stripe customer linked"
          body="Live tenants need a Stripe customer to bill. Comp'd or grandfathered accounts can ignore this."
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Subscription plan" description="Bypasses Stripe — use only for comp'd, legacy, or manual accounts.">
          <form action={savePlan} className="space-y-3">
            <SelectField
              label="Plan tier"
              name="plan"
              defaultValue={tenant.plan}
              options={PLANS.map((p) => ({ value: p, label: p }))}
            />
            <Button type="submit" disabled={!canWrite}>
              {canWrite ? "Save plan" : "Requires admin role"}
            </Button>
          </form>
        </Section>

        <Section title="Stripe linkage" description="Reference IDs pulled from the Stripe customer object.">
          <dl className="space-y-2 text-sm">
            <DT label="Customer ID"     value={tenant.stripeCustomerId} mono />
            <DT label="Subscription ID" value={tenant.stripeSubscriptionId} mono />
            <DT label="Currency"        value={tenant.currency} />
            <DT label="Trial ends"      value={tenant.trialEndsAt?.toISOString().slice(0, 10) ?? null} />
          </dl>
        </Section>
      </div>

      <Section
        title="Price overrides"
        description="Custom pricing that beats the plan's sticker price. One override per plan max."
        right={
          priceOverrides.length === 0 ? (
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              Uses plan sticker prices
            </span>
          ) : null
        }
      >
        {priceOverrides.length > 0 && (
          <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)" }}>
                <tr className="text-left">
                  <th className="px-4 py-3 font-normal">Plan</th>
                  <th className="px-4 py-3 text-right font-normal">Monthly</th>
                  <th className="px-4 py-3 text-right font-normal">Annual</th>
                  <th className="px-4 py-3 font-normal">Note</th>
                  <th className="px-4 py-3 font-normal">Expires</th>
                  <th className="px-4 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {priceOverrides.map((o) => {
                  const expired = o.expiresAt != null && o.expiresAt.getTime() < Date.now();
                  return (
                    <tr key={o.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: "var(--text-default)" }}>
                          {o.plan.name}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                          {o.plan.slug}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.priceMonthly != null
                          ? formatMoney(Number(o.priceMonthly), o.currency)
                          : <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.priceAnnual != null
                          ? formatMoney(Number(o.priceAnnual), o.currency)
                          : <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {o.note ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {o.expiresAt == null ? (
                          <span style={{ color: "var(--text-faint)" }}>Never</span>
                        ) : (
                          <span style={{ color: expired ? "var(--danger-fg)" : "var(--text-muted)" }}>
                            {o.expiresAt.toISOString().slice(0, 10)}
                            {expired && " (expired)"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && (
                          <form action={deletePriceOverride.bind(null, tenant.id, o.id)}>
                            <button
                              type="submit"
                              className="ts-focus rounded-md px-2 py-1 text-xs font-medium"
                              style={{
                                background: "var(--danger-surface)",
                                color: "var(--danger-fg)",
                                border: "1px solid var(--danger-fg)",
                              }}
                            >
                              Remove
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canWrite && pricingPlans.length > 0 && (
          <form
            action={upsertPriceOverride.bind(null, tenant.id)}
            className="space-y-4 px-5 pt-5"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField
                label="Plan"
                name="planId"
                defaultValue={pricingPlans[0]?.id ?? ""}
                options={pricingPlans.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.slug})`,
                }))}
              />
              <Field label="Override monthly" name="priceMonthly" placeholder="e.g. 49" hint="Blank = use plan's annual price only." />
              <Field label="Override annual"  name="priceAnnual"  placeholder="e.g. 490" hint="Blank = use plan's monthly price only." />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Currency"   name="currency" defaultValue="USD" maxLength={3} hint="ISO code." />
              <Field label="Expires at" name="expiresAt" type="date" hint="Blank = permanent." />
              <Field label="Note"       name="note" placeholder="e.g. 2024 launch deal" maxLength={400} hint="Internal only. 400 chars max." />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                Saving on a plan that already has an override replaces it in place.
              </p>
              <Button type="submit">Save override</Button>
            </div>
          </form>
        )}

        {!canWrite && priceOverrides.length === 0 && (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No overrides. Admins can add one here.
          </p>
        )}
      </Section>
    </div>
  );
}

function AccessTab({
  tenantId,
  tenantPlan,
  entitlements,
  tenantFlagByKey,
  canWrite,
  canImpersonate,
  impersonate,
}: {
  tenantId: string;
  tenantPlan: string;
  entitlements: EntitlementMap;
  tenantFlagByKey: Map<string, TenantFlagRow>;
  canWrite: boolean;
  canImpersonate: boolean;
  impersonate: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      {canImpersonate && (
        <Section
          title="Sign in as this tenant"
          description="Starts an audited impersonation session. A banner shows inside the workspace until you end it."
        >
          <form action={impersonate} className="flex flex-col items-stretch gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Field
                label="Reason (logged)"
                name="reason"
                placeholder="e.g. Helping owner configure tax rates per ticket #482"
              />
            </div>
            <Button type="submit">Sign in as →</Button>
          </form>
        </Section>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Feature entitlements
        </h2>
        <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
          Resolution order: tenant override beats global override beats plan default. Clear an override to fall back to the next layer.
        </p>
        <TenantFeaturesPanel
          tenantId={tenantId}
          tenantPlan={tenantPlan}
          entitlements={entitlements}
          tenantFlagByKey={tenantFlagByKey}
          canWrite={canWrite}
        />
      </div>
    </div>
  );
}

function SettingsTab({
  tenant,
  canWrite,
  saveEnv,
  saveCohort,
  resetSandbox,
}: {
  tenant: {
    environment: string;
    betaCohort: string;
    sampleDataLoadedAt: Date | null;
    timezone: string | null;
    currency: string;
    phone: string | null;
    website: string | null;
    addressLine1: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    taxId: string | null;
  };
  canWrite: boolean;
  saveEnv: (formData: FormData) => Promise<void>;
  saveCohort: (formData: FormData) => Promise<void>;
  resetSandbox: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Environment" description="LIVE = real customer · DEMO = sales/marketing demo · TEST = QA sandbox.">
          <form action={saveEnv} className="space-y-3">
            <SelectField
              label="Environment"
              name="environment"
              defaultValue={tenant.environment}
              options={ENVIRONMENTS.map((e) => ({ value: e, label: e }))}
            />
            <Button type="submit" disabled={!canWrite}>
              {canWrite ? "Save environment" : "Requires admin role"}
            </Button>
          </form>
        </Section>

        <Section title="Release cohort" description="Groups tenants into rollout waves. Feature flags target a whole cohort.">
          <form action={saveCohort} className="space-y-3">
            <SelectField
              label="Cohort"
              name="betaCohort"
              defaultValue={tenant.betaCohort}
              options={COHORT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.value === "NONE" ? "GA (general availability)" : o.label,
              }))}
            />
            <Button type="submit" disabled={!canWrite}>
              {canWrite ? "Save cohort" : "Requires admin role"}
            </Button>
          </form>
        </Section>
      </div>

      <Section
        title="Business profile"
        description="Pulled from tenant settings. Edit in the workspace; surfaced here for support context."
      >
        <dl className="grid gap-y-2 text-sm md:grid-cols-2">
          <DT label="Phone"    value={tenant.phone} />
          <DT label="Website"  value={tenant.website} />
          <DT label="Address"  value={[tenant.addressLine1, tenant.city, tenant.region, tenant.country].filter(Boolean).join(", ") || null} />
          <DT label="Timezone" value={tenant.timezone} />
          <DT label="Currency" value={tenant.currency} />
          <DT label="Tax ID"   value={tenant.taxId} />
        </dl>
        {[tenant.phone, tenant.website, tenant.addressLine1, tenant.taxId].every((v) => !v) && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            No profile data entered yet — owner can add this from workspace settings.
          </p>
        )}
      </Section>

      {tenant.environment !== "LIVE" && (
        <Section
          title="Sandbox reset"
          description="Wipes seeded demo data (customers / products / quotes / orders / invoices) and re-seeds a fresh sample set. Real data is untouched."
        >
          <form action={resetSandbox} className="space-y-3">
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              Environment is <b style={{ color: "var(--text-default)" }}>{tenant.environment}</b>. Sandbox reset is blocked on LIVE tenants.
              {tenant.sampleDataLoadedAt && (
                <> Sample data last loaded {tenant.sampleDataLoadedAt.toISOString().slice(0, 10)}.</>
              )}
            </div>
            <Button type="submit" variant="danger" disabled={!canWrite}>
              {canWrite ? "Reset sandbox" : "Requires admin role"}
            </Button>
          </form>
        </Section>
      )}
    </div>
  );
}

function AdminTab({
  tenant,
  canWrite,
  saveStatus,
  doArchive,
  doRestore,
  openTickets,
}: {
  tenant: {
    id: string;
    status: string;
    suspensionReason: string | null;
    archivedAt: Date | null;
    scheduledDeletionAt: Date | null;
    archiveReason: string | null;
  };
  canWrite: boolean;
  saveStatus: (formData: FormData) => Promise<void>;
  doArchive: (formData: FormData) => Promise<void>;
  doRestore: (formData: FormData) => Promise<void>;
  openTickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    category: string;
    updatedAt: Date;
    assignedTo: string | null;
  }>;
}) {
  return (
    <div className="space-y-6">
      {openTickets.length > 0 && (
        <Section
          title={`Open support tickets (${openTickets.length})`}
          description="Unresolved tickets from this tenant. Click through to reply."
        >
          <ul className="-mx-5 -mb-5">
            {openTickets.map((t, i) => (
              <li
                key={t.id}
                style={{ borderTop: i === 0 ? "1px solid var(--border-subtle)" : "1px solid var(--border-subtle)" }}
              >
                <Link
                  href={`/platform/support/${t.id}`}
                  className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:opacity-90"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium" style={{ color: "var(--text-default)" }}>
                      {t.subject}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {t.status.replace(/_/g, " ").toLowerCase()} · {t.category.replace(/_/g, " ").toLowerCase()} ·{" "}
                      priority {t.priority.toLowerCase()}
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {t.assignedTo ? "assigned" : "unassigned"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Danger zone ─── */}
      <div
        className="rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--danger-fg)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          className="flex items-center gap-2 px-5 py-3"
          style={{ borderBottom: "1px solid var(--danger-fg)", background: "var(--danger-surface)" }}
        >
          <span aria-hidden style={{ color: "var(--danger-fg)" }}>⚠</span>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--danger-fg)" }}>
            Danger zone
          </h2>
        </div>
        <div className="grid gap-px md:grid-cols-2" style={{ background: "var(--border-subtle)" }}>
          <div className="space-y-3 p-5" style={{ background: "var(--surface-1)" }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                Account status
              </h3>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                Suspending blocks all tenant access with a reason shown to the owner.
              </p>
            </div>
            <form action={saveStatus} className="space-y-3">
              <SelectField
                label="Set status"
                name="status"
                defaultValue={tenant.status === "ARCHIVED" ? "ACTIVE" : tenant.status}
                options={TENANT_STATUSES.map((s) => ({ value: s, label: s }))}
              />
              <Field
                label="Suspension reason (shown to owner if SUSPENDED)"
                name="suspensionReason"
                defaultValue={tenant.suspensionReason ?? ""}
                placeholder="e.g. Payment failed 3x — contact billing@flowtora.com"
              />
              <Button type="submit" disabled={!canWrite}>
                {canWrite ? "Save status" : "Requires admin role"}
              </Button>
            </form>
          </div>

          <div className="space-y-3 p-5" style={{ background: "var(--surface-1)" }}>
            {tenant.status === "ARCHIVED" ? (
              <>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                    Restore tenant
                  </h3>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    Archived on {tenant.archivedAt?.toISOString().slice(0, 10) ?? "—"}
                    {tenant.scheduledDeletionAt
                      ? ` · scheduled for deletion ${tenant.scheduledDeletionAt.toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                </div>
                {tenant.archiveReason && (
                  <div
                    className="rounded-md px-3 py-2 text-xs"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <div className="font-medium" style={{ color: "var(--text-default)" }}>Reason archived</div>
                    <div className="mt-0.5">{tenant.archiveReason}</div>
                  </div>
                )}
                <form action={doRestore} className="space-y-3">
                  <SelectField
                    label="Restore as"
                    name="nextStatus"
                    defaultValue="ACTIVE"
                    options={[
                      { value: "ACTIVE",   label: "ACTIVE" },
                      { value: "TRIAL",    label: "TRIAL" },
                      { value: "PAST_DUE", label: "PAST_DUE" },
                    ]}
                  />
                  <Button type="submit" disabled={!canWrite}>
                    {canWrite ? "Restore tenant" : "Requires admin role"}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                    Archive tenant
                  </h3>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    Soft-delete. Status flips to ARCHIVED, owner access is blocked, data preserved during the grace window.
                  </p>
                </div>
                <form action={doArchive} className="space-y-3">
                  <Field
                    label="Reason (logged)"
                    name="reason"
                    placeholder="e.g. Owner requested closure — ticket #291"
                  />
                  <Field
                    label="Grace period (days before permanent deletion)"
                    name="graceDays"
                    defaultValue="30"
                    placeholder="30"
                  />
                  <Button type="submit" variant="danger" disabled={!canWrite}>
                    {canWrite ? "Archive tenant" : "Requires admin role"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({
  events,
  notes,
  saveNotes,
}: {
  events: ActivityEvent[];
  notes: string | null;
  saveNotes: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <Section
        title="Internal notes"
        description="Platform-only — the shop never sees this. Use for context, known issues, billing disputes."
      >
        <form action={saveNotes} className="space-y-3">
          <TextArea
            label="Notes"
            name="notes"
            rows={6}
            defaultValue={notes ?? ""}
            placeholder="e.g. Owner requested quarterly billing in March — follow up next cycle."
          />
          <Button type="submit">Save notes</Button>
        </form>
      </Section>

      <Section title="Activity timeline" description="Audit log from tenant staff and platform staff, latest first.">
        <TenantActivityTimeline events={events} />
      </Section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SHARED LITTLE BITS
// ────────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex items-start justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          )}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "warning" | "success" | "neutral";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      border: "var(--danger-fg)"      } :
    tone === "warning" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     border: "var(--warning-fg)"     } :
    tone === "success" ? { bg: "var(--success-surface)", fg: "var(--success-fg)",     border: "var(--success-fg)"     } :
                          { bg: "var(--surface-2)",       fg: "var(--text-default)",   border: "var(--border-default)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}

function DT({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="w-24 shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </dt>
      <dd
        className={`flex-1 break-all text-sm ${mono ? "font-mono text-xs" : ""}`}
        style={{ color: value ? "var(--text-default)" : "var(--text-faint)" }}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function pctDelta(current: number, prior: number): number | undefined {
  if (prior <= 0) return current > 0 ? 1 : undefined;
  return (current - prior) / prior;
}
