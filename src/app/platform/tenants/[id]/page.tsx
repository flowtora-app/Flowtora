import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
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
  upsertFeatureFlag,
  deleteFeatureFlag,
  resetTenantSandbox,
} from "@/app/actions/platform";
import { formatMoney } from "@/lib/format";
import { resolveAllEntitlements } from "@/lib/entitlements";
import { computeTenantHealth, environmentColor, healthColor } from "@/lib/tenant-health";
import { COHORT_OPTIONS, cohortChip, cohortLabel } from "@/lib/cohorts";
import { computeReadiness } from "@/lib/readiness";

// Phase 17 Slice A — platform tenant detail page.
//
// Everyone on the platform staff tiers can view; the write affordances
// (status, plan) are form-gated by requirePlatformAdmin on the action
// side, so support agents see the controls but their submit redirects
// back with ?error=forbidden. Notes *are* writable by support.

// Note: ARCHIVED is a separate lifecycle path (archive/restore form),
// not a value the "Status" dropdown can set directly. Keeping it off
// this list makes the UI unambiguous — you can't accidentally "archive"
// by changing a select.
const TENANT_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELED"] as const;
const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;
const ENVIRONMENTS = ["LIVE", "DEMO", "TEST"] as const;

export default async function PlatformTenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const tenant = await db.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();

  // Usage analytics — parallelized aggregate queries. Skip anything behind
  // date ranges for v1; the "total" and "this month" are the two numbers
  // support staff reach for when triaging.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    memberCount,
    customerCount,
    productCount,
    quoteCount,
    quoteThisMonth,
    orderCount,
    orderThisMonth,
    invoiceCount,
    revenue,
    openAR,
    lastQuote,
    lastOrder,
    recentAudits,
  ] = await Promise.all([
    db.membership.count({ where: { tenantId: id, status: "ACTIVE" } }),
    db.customer.count({ where: { tenantId: id } }),
    db.product.count({ where: { tenantId: id } }),
    db.quote.count({ where: { tenantId: id } }),
    db.quote.count({ where: { tenantId: id, createdAt: { gte: monthStart } } }),
    db.order.count({ where: { tenantId: id } }),
    db.order.count({ where: { tenantId: id, createdAt: { gte: monthStart } } }),
    db.invoice.count({ where: { tenantId: id } }),
    db.payment.aggregate({
      where: { tenantId: id },
      _sum: { amount: true },
    }),
    // Open A/R = sum(total - amountPaid) across SENT / PARTIAL / OVERDUE.
    // Prisma can't subtract in aggregate, so pull the two columns and reduce.
    db.invoice.findMany({
      where: { tenantId: id, status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
      select: { total: true, amountPaid: true },
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
      take: 25,
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
  ]);

  // Per-tenant entitlement matrix — Slice C. Pulls resolved state for
  // every FeatureKey (per-tenant → global → plan) plus the raw tenant-
  // scoped override rows so we have an id for the "Clear" button.
  const [entitlements, tenantFlagRows, openTickets] = await Promise.all([
    resolveAllEntitlements(tenant.id, tenant.plan),
    db.featureFlag.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, key: true, enabled: true, note: true },
    }),
    // Slice D — surface any live tickets for this tenant inline so platform
    // staff triaging from the tenant page don't have to cross-reference the
    // queue. Cap at 10 to stay out of the way of the rest of the page.
    db.supportTicket.findMany({
      where: { tenantId: tenant.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 10,
      select: {
        id: true, subject: true, status: true, priority: true, category: true,
        updatedAt: true, assignedTo: true,
      },
    }),
  ]);
  const tenantFlagByKey = new Map(tenantFlagRows.map((f) => [f.key, f]));

  // Resolve userIds that appear in audits so we can show names instead of
  // cuids. Platform staff vs. tenant staff both mingle in this log.
  const userIds = Array.from(new Set(recentAudits.map((a) => a.userId).filter(Boolean))) as string[];
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true, platformRole: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const saveStatus = updateTenantStatus.bind(null, tenant.id);
  const savePlan   = updateTenantPlan.bind(null, tenant.id);
  const saveNotes  = updateTenantNotes.bind(null, tenant.id);
  const saveEnv    = updateTenantEnvironment.bind(null, tenant.id);
  const saveCohort = updateTenantCohort.bind(null, tenant.id);
  const doArchive  = archiveTenant.bind(null, tenant.id);
  const doRestore  = restoreTenant.bind(null, tenant.id);
  const resetSandbox = resetTenantSandbox.bind(null, tenant.id);
  const impersonate = startImpersonation.bind(null, tenant.id);

  // Phase 1 — unified health for the detail-page chip and signal panel.
  const health = computeTenantHealth(tenant);
  const envChip = environmentColor(tenant.environment);
  const healthChip = healthColor(health.level);

  // Phase 19 — launch readiness report. All inputs are already fetched
  // above; computeReadiness is pure, so this is effectively free.
  const readiness = computeReadiness({
    tenant,
    memberCount,
    customerCount,
    productCount,
    quoteCount,
    orderCount,
  });

  const revenueTotal = revenue._sum.amount?.toString() ?? "0";
  // Sum remaining balance in memory. Decimal arithmetic via string keeps
  // precision; for the platform dashboard two-decimal rounding is fine.
  const openARTotal = openAR
    .reduce((sum, inv) => sum + (Number(inv.total) - Number(inv.amountPaid)), 0)
    .toFixed(2);

  const lastActivity = tenant.lastActivityAt ?? lastQuote?.createdAt ?? lastOrder?.createdAt ?? tenant.createdAt;
  const daysSinceActivity = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            <Link href="/platform/tenants" className="underline">Tenants</Link> / {tenant.name}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{tenant.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <span>{tenant.slug}</span>
            <span>·</span>
            <StatusBadge status={tenant.status} />
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{ background: envChip.bg, color: envChip.fg }}
              title="Environment — non-LIVE shows a persistent ribbon in the workspace."
            >
              {envChip.label}
            </span>
            {tenant.betaCohort !== "NONE" && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                style={{ background: cohortChip(tenant.betaCohort).bg, color: cohortChip(tenant.betaCohort).fg }}
                title="Release cohort"
              >
                {cohortLabel(tenant.betaCohort)}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: healthChip.bg, color: healthChip.fg }}
              title={health.signals.join(" · ")}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: healthChip.fg }} />
              {health.label}
            </span>
            <span>·</span>
            <span>{tenant.plan}</span>
            <span>·</span>
            <span>Active {daysSinceActivity === 0 ? "today" : `${daysSinceActivity}d ago`}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/t/${tenant.slug}/dashboard`}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
            title="Navigate to workspace without starting an audited impersonation session"
          >
            Open (silent)
          </Link>
        </div>
      </div>

      {/* ── Impersonation starter ── */}
      {ctx.canImpersonate && (
        <Card>
          <CardHeader
            title="Sign in as this tenant"
            description="Starts an audited impersonation session. A banner will show inside the workspace until you end it."
          />
          <form action={impersonate} className="flex items-end gap-3 px-5 py-4">
            <div className="flex-1">
              <Field
                label="Reason (logged)"
                name="reason"
                placeholder="e.g. Helping owner configure tax rates per ticket #482"
              />
            </div>
            <Button type="submit">Sign in as →</Button>
          </form>
        </Card>
      )}

      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}
      {sp.ok && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#15341a", color: "#7dd688", border: "1px solid #215a2a" }}
        >
          {decodeURIComponent(sp.ok)}
        </div>
      )}

      {/* ── Trial expiry warning ── */}
      {tenant.status === "TRIAL" && tenant.trialEndsAt && (() => {
        const daysLeft = Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000);
        if (daysLeft > 7) return null;
        const overdue = daysLeft < 0;
        return (
          <div
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: overdue ? "#3a1517" : "#3a2a15",
              color:      overdue ? "#ff8b8b" : "#ffc98b",
              border:     `1px solid ${overdue ? "#5b2024" : "#5b4b20"}`,
            }}
          >
            <div className="font-medium">
              {overdue ? `Trial expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago` : `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </div>
            <div className="mt-0.5 text-xs" style={{ opacity: 0.8 }}>
              Expires {tenant.trialEndsAt.toISOString().slice(0, 10)} — convert or suspend to avoid limbo.
            </div>
          </div>
        );
      })()}

      {tenant.status === "SUSPENDED" && tenant.suspensionReason && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{ background: "#3a2a15", color: "#ffc98b", border: "1px solid #5b4b20" }}
        >
          <div className="font-medium">Suspended</div>
          <div className="mt-0.5 text-xs">{tenant.suspensionReason}</div>
        </div>
      )}

      {/* ── Usage analytics ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Users" value={memberCount.toString()} sub="active memberships" />
        <Stat label="Customers" value={customerCount.toString()} />
        <Stat label="Products" value={productCount.toString()} />
        <Stat label="Quotes" value={quoteCount.toString()} sub={`${quoteThisMonth} this month`} />
        <Stat label="Orders" value={orderCount.toString()} sub={`${orderThisMonth} this month`} />
        <Stat label="Invoices" value={invoiceCount.toString()} />
        <Stat label="Revenue" value={formatMoney(revenueTotal, tenant.currency)} sub="lifetime payments" />
        <Stat label="A/R open" value={formatMoney(openARTotal, tenant.currency)} sub="outstanding balance" />
      </div>

      {/* ── Launch readiness ── */}
      <Card>
        <CardHeader
          title="Launch readiness"
          description={
            readiness.ready
              ? `All ${readiness.requiredTotal} required checks pass — tenant is ready to flip to LIVE.`
              : `${readiness.requiredDone}/${readiness.requiredTotal} required checks pass · ${readiness.doneCount}/${readiness.totalCount} overall (${readiness.percent}%).`
          }
        />
        <ul className="divide-y px-5 py-2" style={{ borderColor: "var(--border)" }}>
          {readiness.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2 text-sm">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
                style={{
                  background: c.done ? "#15332a" : c.required ? "#3a1517" : "var(--panel)",
                  color:      c.done ? "#7dd688" : c.required ? "#ff8b8b" : "var(--muted)",
                  border:     `1px solid ${c.done ? "#205033" : c.required ? "#5b2024" : "var(--border)"}`,
                }}
              >
                {c.done ? "✓" : c.required ? "!" : "·"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span style={{ color: c.done ? "var(--muted)" : "var(--text)", textDecoration: c.done ? "line-through" : undefined }}>
                    {c.label}
                  </span>
                  {c.required && !c.done && (
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "#ff8b8b" }}>
                      required
                    </span>
                  )}
                </div>
                {c.hint && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{c.hint}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ── Business profile + onboarding milestones ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Business profile" description="Contact info from tenant settings." />
          <dl className="space-y-1 px-5 py-4 text-sm">
            {[
              ["Phone",   tenant.phone],
              ["Website", tenant.website],
              ["Address", [tenant.addressLine1, tenant.city, tenant.region, tenant.country].filter(Boolean).join(", ")],
              ["Timezone", tenant.timezone],
              ["Currency", tenant.currency],
              ["Tax ID",  tenant.taxId],
            ].map(([label, value]) =>
              value ? (
                <div key={label as string} className="flex gap-2">
                  <dt className="w-20 shrink-0" style={{ color: "var(--muted)" }}>{label}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ) : null
            )}
            {[tenant.phone, tenant.website, tenant.addressLine1, tenant.taxId].every((v) => !v) && (
              <p style={{ color: "var(--muted)" }}>No profile data entered yet.</p>
            )}
          </dl>
        </Card>

        <Card>
          <CardHeader title="Onboarding milestones" description="Key activation events for this tenant." />
          <ul className="divide-y px-5 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
            {(
              [
                ["Workspace created",    tenant.createdAt,               true],
                ["Onboarding complete",  tenant.onboardingCompletedAt,   false],
                ["Sample data loaded",   tenant.sampleDataLoadedAt,      false],
                ["Sample data cleared",  tenant.sampleDataClearedAt,     false],
                ["Trial ends",           tenant.trialEndsAt,             false],
              ] as [string, Date | null | undefined, boolean][]
            ).map(([label, date, required]) => (
              <li key={label} className="flex items-center justify-between py-2">
                <span style={{ color: date ? "var(--text)" : "var(--muted)" }}>{label}</span>
                {date ? (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {date.toISOString().slice(0, 10)}
                  </span>
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: required ? "#ff8b8b" : "var(--muted)" }}
                  >
                    {required ? "missing" : "—"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Controls + notes ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Status"
            description="Suspending blocks all tenant access with a reason shown to the owner."
          />
          <form action={saveStatus} className="space-y-3 px-5 py-4">
            <SelectField
              label="Account status"
              name="status"
              defaultValue={tenant.status}
              options={TENANT_STATUSES.map((s) => ({ value: s, label: s }))}
            />
            <Field
              label="Suspension reason (shown to owner when status is SUSPENDED)"
              name="suspensionReason"
              defaultValue={tenant.suspensionReason ?? ""}
              placeholder="e.g. Payment failed 3x — contact billing@tracksign.com"
            />
            <Button type="submit" disabled={!ctx.canWrite}>
              {ctx.canWrite ? "Save status" : "Requires admin role"}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Plan"
            description="Changing plan bypasses Stripe — use only for comp'd, legacy, or manual accounts."
          />
          <form action={savePlan} className="space-y-3 px-5 py-4">
            <SelectField
              label="Subscription plan"
              name="plan"
              defaultValue={tenant.plan}
              options={PLANS.map((p) => ({ value: p, label: p }))}
            />
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Stripe customer: {tenant.stripeCustomerId ?? "—"}<br />
              Stripe subscription: {tenant.stripeSubscriptionId ?? "—"}
            </div>
            <Button type="submit" disabled={!ctx.canWrite}>
              {ctx.canWrite ? "Save plan" : "Requires admin role"}
            </Button>
          </form>
        </Card>
      </div>

      {/* ── Phase 1: environment + lifecycle · Phase 19: cohort ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="Environment"
            description="Marks this tenant as live, demo, or test. Non-LIVE shows a ribbon across the workspace."
          />
          <form action={saveEnv} className="space-y-3 px-5 py-4">
            <SelectField
              label="Environment"
              name="environment"
              defaultValue={tenant.environment}
              options={ENVIRONMENTS.map((e) => ({ value: e, label: e }))}
            />
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              LIVE — real paying customer. Default.<br />
              DEMO — sales/marketing demo. Billing disabled.<br />
              TEST — QA sandbox or internal playground.
            </div>
            <Button type="submit" disabled={!ctx.canWrite}>
              {ctx.canWrite ? "Save environment" : "Requires admin role"}
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Release cohort"
            description="Groups tenants into rollout waves. Feature flags and announcements can target a whole cohort at once."
          />
          <form action={saveCohort} className="space-y-3 px-5 py-4">
            <SelectField
              label="Cohort"
              name="betaCohort"
              defaultValue={tenant.betaCohort}
              options={COHORT_OPTIONS.map((o) => ({
                value: o.value,
                label: o.value === "NONE" ? "GA (general availability)" : o.label,
              }))}
            />
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              {COHORT_OPTIONS.map((o) => (
                <div key={o.value}>
                  <b>{o.value === "NONE" ? "GA" : o.label}</b> — {o.description}
                </div>
              ))}
            </div>
            <Button type="submit" disabled={!ctx.canWrite}>
              {ctx.canWrite ? "Save cohort" : "Requires admin role"}
            </Button>
          </form>
        </Card>

        {tenant.environment !== "LIVE" && (
          <Card>
            <CardHeader
              title="Sandbox reset"
              description="Wipes demo customers/products (and their cascading quotes/orders/invoices) and re-seeds a fresh sample set. Real data is untouched — only rows tagged as seeded are removed."
            />
            <form action={resetSandbox} className="space-y-3 px-5 py-4">
              <div
                className="rounded-md px-3 py-2 text-xs"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
              >
                Environment is <b>{tenant.environment}</b>. Sandbox reset is blocked on LIVE tenants.
                {tenant.sampleDataLoadedAt && (
                  <> Sample data last loaded {tenant.sampleDataLoadedAt.toISOString().slice(0, 10)}.</>
                )}
              </div>
              <Button type="submit" variant="danger" disabled={!ctx.canWrite}>
                {ctx.canWrite ? "Reset sandbox" : "Requires admin role"}
              </Button>
            </form>
          </Card>
        )}

        <Card>
          <CardHeader
            title={tenant.status === "ARCHIVED" ? "Restore" : "Archive"}
            description={
              tenant.status === "ARCHIVED"
                ? "Archived on " + (tenant.archivedAt?.toISOString().slice(0, 10) ?? "—") +
                  (tenant.scheduledDeletionAt
                    ? " · scheduled for deletion " + tenant.scheduledDeletionAt.toISOString().slice(0, 10)
                    : "")
                : "Soft-deletes the tenant. Data stays intact for a grace window; status flips to ARCHIVED and owner access is blocked."
            }
          />
          {tenant.status === "ARCHIVED" ? (
            <form action={doRestore} className="space-y-3 px-5 py-4">
              {tenant.archiveReason && (
                <div className="rounded-md px-3 py-2 text-xs"
                  style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
                >
                  <div className="font-medium" style={{ color: "var(--text)" }}>Reason archived</div>
                  <div className="mt-0.5">{tenant.archiveReason}</div>
                </div>
              )}
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
              <Button type="submit" disabled={!ctx.canWrite}>
                {ctx.canWrite ? "Restore tenant" : "Requires admin role"}
              </Button>
            </form>
          ) : (
            <form action={doArchive} className="space-y-3 px-5 py-4">
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
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                During the grace window, data is preserved and a platform admin can restore.
                After the window ends a cron can hard-delete — restore is no longer guaranteed.
              </div>
              <Button type="submit" disabled={!ctx.canWrite}>
                {ctx.canWrite ? "Archive tenant" : "Requires admin role"}
              </Button>
            </form>
          )}
        </Card>
      </div>

      {/* ── Phase 1: health signals ── */}
      {health.signals.length > 0 && (
        <Card>
          <CardHeader
            title="Health signals"
            description="Computed from status, trial clock, billing, and recent activity."
          />
          <ul className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            {health.signals.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: healthChip.fg }}
                />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Internal notes"
          description="Platform-only — the shop never sees this. Use for context, known issues, billing disputes."
        />
        <form action={saveNotes} className="space-y-3 px-5 py-4">
          <TextArea
            label="Notes"
            name="notes"
            rows={6}
            defaultValue={tenant.notes ?? ""}
            placeholder="e.g. Owner requested quarterly billing in March — follow up next cycle."
          />
          <Button type="submit">Save notes</Button>
        </form>
      </Card>

      {/* ── Open support tickets ── */}
      {openTickets.length > 0 && (
        <Card>
          <CardHeader
            title={`Open tickets (${openTickets.length})`}
            description="Unresolved support tickets from this tenant. Click through to reply."
          />
          <ul>
            {openTickets.map((t) => (
              <li key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Link href={`/platform/support/${t.id}`} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.subject}</div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {t.status.replace(/_/g, " ").toLowerCase()} · {t.category.replace(/_/g, " ").toLowerCase()} ·
                      {" "}priority {t.priority.toLowerCase()}
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {t.assignedTo ? "assigned" : "unassigned"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Entitlements matrix ── */}
      <Card>
        <CardHeader
          title="Feature entitlements"
          description="Tenant override beats global override beats plan default. Clear an override to fall back to the next layer."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-5 py-3 font-normal">Feature</th>
                <th className="px-4 py-3 font-normal">Current</th>
                <th className="px-4 py-3 font-normal">Source</th>
                <th className="px-4 py-3 font-normal text-right">Override</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(entitlements) as (keyof typeof entitlements)[]).map((k) => {
                const row = entitlements[k];
                const override = tenantFlagByKey.get(k);
                return (
                  <tr key={k} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-5 py-3 font-mono text-xs">{k}</td>
                    <td className="px-4 py-3">
                      {row.value ? (
                        <span style={{ color: "#7dd688" }}>ON</span>
                      ) : (
                        <span style={{ color: "#ff8b8b" }}>OFF</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted)" }}>
                      {row.source === "tenant" ? "per-tenant override"
                        : row.source === "global" ? "global override"
                        : `plan default (${tenant.plan})`}
                      {override?.note && (
                        <div className="mt-0.5">{override.note}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ctx.canWrite ? (
                        <div className="flex items-center justify-end gap-2">
                          <form action={upsertFeatureFlag}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <input type="hidden" name="key" value={k} />
                            <input type="hidden" name="enabled" value="on" />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs"
                              style={{ border: "1px solid var(--border)", color: "#7dd688" }}
                              disabled={row.source === "tenant" && row.value}
                            >
                              Force ON
                            </button>
                          </form>
                          <form action={upsertFeatureFlag}>
                            <input type="hidden" name="tenantId" value={tenant.id} />
                            <input type="hidden" name="key" value={k} />
                            <input type="hidden" name="enabled" value="" />
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs"
                              style={{ border: "1px solid var(--border)", color: "#ff8b8b" }}
                              disabled={row.source === "tenant" && !row.value}
                            >
                              Force OFF
                            </button>
                          </form>
                          {override && (
                            <form action={deleteFeatureFlag.bind(null, override.id)}>
                              <button
                                type="submit"
                                className="text-xs underline"
                                style={{ color: "var(--muted)" }}
                              >
                                Clear
                              </button>
                            </form>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          read only
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Activity feed ── */}
      <Card>
        <CardHeader
          title="Recent activity"
          description="Audit log from tenant staff and platform staff, latest first."
        />
        {recentAudits.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            Nothing logged yet.
          </p>
        ) : (
          <ul>
            {recentAudits.map((a) => {
              const actor = a.userId ? userById.get(a.userId) : null;
              const who = actor?.name ?? actor?.email ?? (a.userId ? "unknown" : "system");
              const isPlatform = a.action.startsWith("platform.");
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[140px_1fr_auto] items-baseline gap-3 px-5 py-2 text-xs"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <span style={{ color: "var(--muted)" }}>
                    {a.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  </span>
                  <span>
                    <span className="font-medium">{a.action}</span>
                    {a.entityType && (
                      <span style={{ color: "var(--muted)" }}> · {a.entityType}{a.entityId ? ` ${a.entityId.slice(0, 8)}` : ""}</span>
                    )}
                  </span>
                  <span style={{ color: isPlatform ? "var(--accent)" : "var(--muted)" }}>
                    {who}{actor?.platformRole ? " (platform)" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-md px-4 py-4"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { bg, fg } =
    status === "ACTIVE" ? { bg: "#15341a", fg: "#7dd688" } :
    status === "TRIAL"  ? { bg: "#15263a", fg: "#8bb9ff" } :
    status === "PAST_DUE" ? { bg: "#3a2a15", fg: "#ffc98b" } :
    status === "SUSPENDED" ? { bg: "#3a1517", fg: "#ff8b8b" } :
    { bg: "var(--panel)", fg: "var(--muted)" };
  return (
    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: bg, color: fg }}>
      {status}
    </span>
  );
}
