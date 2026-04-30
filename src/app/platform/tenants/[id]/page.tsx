import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatusPill,
  Tabs,
} from "@/components/ui";
import { flagEmoji, normalizeCountry } from "@/lib/country-codes";
import { getAllPlans } from "@/lib/plans";
import type { Plan } from "@prisma/client";
import { TenantRightRail } from "./_components/TenantRightRail";
import { TenantImpersonateButton } from "./_components/TenantImpersonateButton";
import { TenantNotesPanel } from "./_components/TenantNotesPanel";
import { TenantUsersTab } from "./_components/TenantUsersTab";
import { TenantBillingTab } from "./_components/TenantBillingTab";
import { TenantUsageTab } from "./_components/TenantUsageTab";
import { TenantJobsTab } from "./_components/TenantJobsTab";
import { TenantCustomersTab } from "./_components/TenantCustomersTab";
import { TenantCatalogTab } from "./_components/TenantCatalogTab";
import { TenantIntegrationsTab } from "./_components/TenantIntegrationsTab";
import { TenantFeatureFlagsTab } from "./_components/TenantFeatureFlagsTab";
import { TenantBrandingTab } from "./_components/TenantBrandingTab";
import { TenantCommunicationsTab } from "./_components/TenantCommunicationsTab";
import { TenantAuditTab } from "./_components/TenantAuditTab";
import { TenantSecurityTab } from "./_components/TenantSecurityTab";
import { TenantHealthScoreTab } from "./_components/TenantHealthScoreTab";
import { TenantSettingsTab } from "./_components/TenantSettingsTab";

export const dynamic = "force-dynamic";

const TAB_IDS = [
  "overview", "users", "billing", "usage", "jobs", "customers",
  "catalog", "integrations", "flags", "branding", "communications",
  "audit", "security", "health", "notes", "settings",
] as const;
type TabId = (typeof TAB_IDS)[number];

const STATUS_TO_PILL: Record<string, "active" | "trialing" | "past_due" | "suspended" | "cancelled" | "draft"> = {
  ACTIVE: "active", TRIAL: "trialing", PAST_DUE: "past_due",
  SUSPENDED: "suspended", CANCELED: "cancelled", ARCHIVED: "draft",
};

export default async function PlatformTenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : "overview";
  const tab: TabId = (TAB_IDS as readonly string[]).includes(tabRaw) ? (tabRaw as TabId) : "overview";

  // ── Fan out the universal queries (header + right rail + counts).
  const [tenant, plans] = await Promise.all([
    db.tenant.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, logoUrl: true,
        plan: true, status: true, country: true,
        createdAt: true, updatedAt: true, lastActivityAt: true, trialEndsAt: true,
        adminTags: true, accountManagerId: true, customDomain: true,
        ssoEnabled: true, ssoProvider: true, mfaEnforced: true,
        signupSource: true, businessType: true, environment: true, betaCohort: true,
        stripeCustomerId: true, stripeSubscriptionId: true,
        notes: true, brandPrimaryColor: true,
        currency: true, taxId: true, phone: true, website: true,
        addressLine1: true, addressLine2: true, city: true, region: true, postalCode: true,
        timezone: true,
        archivedAt: true, archivedBy: true, archiveReasonCode: true,
        suspensionReason: true,
        accountManager: { select: { id: true, name: true, email: true } },
        memberships: {
          where: { role: "OWNER" },
          select: { user: { select: { id: true, name: true, email: true } } },
          take: 1,
        },
        _count: { select: { memberships: true } },
      },
    }),
    getAllPlans(),
  ]);
  if (!tenant) notFound();

  const priceByPlan = new Map<Plan, number>();
  for (const p of plans) priceByPlan.set(p.slug.toUpperCase() as Plan, p.priceMonthly ?? 0);
  const planPrice = priceByPlan.get(tenant.plan) ?? 0;
  const planName = plans.find((p) => p.slug.toUpperCase() === tenant.plan)?.name ?? String(tenant.plan);
  const isPaying = tenant.status === "ACTIVE" || tenant.status === "PAST_DUE";
  const mrr = isPaying ? planPrice : 0;
  const norm = normalizeCountry(tenant.country);
  const isVip = tenant.adminTags.includes("vip");
  const ownerUser = tenant.memberships[0]?.user;

  // Health score (heuristic; the Health tab can recompute + persist).
  const lastDays = tenant.lastActivityAt
    ? Math.floor((Date.now() - tenant.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const baseScore = tenant.status === "ACTIVE" ? 90 : tenant.status === "PAST_DUE" ? 40 : tenant.status === "TRIAL" ? 70 : 30;
  const activityPenalty = lastDays == null ? 20 : lastDays > 30 ? 30 : lastDays > 7 ? 10 : 0;
  const healthScore = Math.max(0, Math.min(100, baseScore - activityPenalty));

  // LTV — sum of paid payments to date.
  const lifetimePayments = await db.payment.aggregate({
    where: { tenantId: id, voidedAt: null, failedAt: null },
    _sum: { amount: true },
  });
  const ltv = Math.round(Number((lifetimePayments._sum as { amount?: unknown } | null)?.amount ?? 0));

  // Touch viewer log + read recent viewers for the right rail.
  await db.tenantViewedBy.upsert({
    where: { tenantId_userId: { tenantId: id, userId: ctx.userId } },
    update: { viewedAt: new Date() },
    create: { tenantId: id, userId: ctx.userId, viewedAt: new Date() },
  });
  const recentViewers = await db.tenantViewedBy.findMany({
    where: { tenantId: id, NOT: { userId: ctx.userId } },
    orderBy: { viewedAt: "desc" },
    take: 5,
    select: {
      userId: true, viewedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  /* ── Header ───────────────────────────────────────────── */

  const header = (
    <div>
      <Breadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Tenants", href: "/platform/tenants" },
          { label: tenant.name },
        ]}
      />
      <div className="mt-3">
        <PageHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono text-[11px]">{tenant.slug}</span>
              {isVip && <span title="VIP" aria-label="VIP">⭐</span>}
              {tenant.environment !== "LIVE" && (
                <Badge size="xs" color="warning">{tenant.environment}</Badge>
              )}
            </span>
          }
          title={
            <span className="flex items-center gap-3">
              <Avatar size="lg" src={tenant.logoUrl ?? undefined} name={tenant.name} />
              <span className="min-w-0">{tenant.name}</span>
            </span>
          }
          description={
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <StatusPill status={STATUS_TO_PILL[tenant.status] ?? "draft"} size="sm" />
              <Badge size="xs" color="brand">{planName}</Badge>
              {mrr > 0 && <Badge size="xs" color="success">${mrr.toLocaleString()}/mo</Badge>}
              <span style={{ color: "var(--text-muted)" }}>·</span>
              <span style={{ color: "var(--text-muted)" }}>{tenant._count.memberships} {tenant._count.memberships === 1 ? "user" : "users"}</span>
              {norm && (
                <>
                  <span style={{ color: "var(--text-muted)" }}>·</span>
                  <span style={{ color: "var(--text-muted)" }}>{flagEmoji(norm.iso2)} {norm.name}</span>
                </>
              )}
            </div>
          }
          actions={
            <>
              <TenantImpersonateButton
                tenantId={tenant.id}
                tenantName={tenant.name}
                size="sm"
                enabled={ctx.can("tenant.impersonate")}
              />
              {ownerUser?.email && (
                <a href={`mailto:${ownerUser.email}`}>
                  <Button size="sm" variant="secondary">Send email</Button>
                </a>
              )}
              <Link href={`?tab=notes`}>
                <Button size="sm" variant="secondary">Add note</Button>
              </Link>
              <Link href={`?tab=communications#new-ticket`}>
                <Button size="sm" variant="secondary">Create ticket</Button>
              </Link>
            </>
          }
        />
      </div>
    </div>
  );

  /* ── Tabs row ─────────────────────────────────────────── */

  const baseTabs = [
    { id: "overview",       label: "Overview" },
    { id: "users",          label: "Users" },
    { id: "billing",        label: "Billing" },
    { id: "usage",          label: "Usage" },
    { id: "jobs",           label: "Jobs" },
    { id: "customers",      label: "Customers" },
    { id: "catalog",        label: "Catalog" },
    { id: "integrations",   label: "Integrations" },
    { id: "flags",          label: "Flags" },
    { id: "branding",       label: "Branding" },
    { id: "communications", label: "Communications" },
    { id: "audit",          label: "Audit" },
    { id: "security",       label: "Security" },
    { id: "health",         label: "Health" },
    { id: "notes",          label: "Notes" },
    { id: "settings",       label: "Settings" },
  ];
  const tabHrefFor = (id: string) => `/platform/tenants/${tenant.id}?tab=${id}`;
  const activeHref = tabHrefFor(tab);

  /* ── Right rail ───────────────────────────────────────── */

  const rail = (
    <TenantRightRail
      canImpersonate={ctx.can("tenant.impersonate")}
      tenant={{
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        planName,
        status: tenant.status,
        mrr,
        ltv,
        healthScore,
        trialEndsAt: tenant.trialEndsAt,
        countryIso2: norm?.iso2 ?? null,
        countryName: norm?.name ?? null,
        isVip,
        adminTags: tenant.adminTags,
        accountManager: tenant.accountManager
          ? { id: tenant.accountManager.id, name: tenant.accountManager.name, email: tenant.accountManager.email }
          : null,
        stripeCustomerId: tenant.stripeCustomerId,
        customDomain: tenant.customDomain,
      }}
      recentViewers={recentViewers.map((v) => ({
        userId: v.userId,
        name: v.user.name,
        email: v.user.email,
        viewedAt: v.viewedAt,
      }))}
    />
  );

  /* ── Tab content ──────────────────────────────────────── */

  const headerCtx = { tenant, planName, mrr, ltv, healthScore, ownerUser };

  return (
    <div className="min-w-0 space-y-5">
      {header}

      {/* Status banner — reflects the most-impactful state. */}
      {tenant.status === "PAST_DUE" && (
        <Banner variant="error" title="Past due">
          Payment failed and dunning is in progress. Settle the latest invoice or apply credit from the Billing tab.
        </Banner>
      )}
      {tenant.status === "SUSPENDED" && (
        <Banner variant="warning" title="Suspended">
          {tenant.suspensionReason
            ? <>Reason: {tenant.suspensionReason}</>
            : "All members are signed out. Reactivate from Settings → Status to restore access."}
        </Banner>
      )}
      {tenant.status === "ARCHIVED" && (
        <Banner variant="neutral" title="Archived">
          This tenant is soft-deleted. Restore from Settings → Status before any other change takes effect.
        </Banner>
      )}

      <Tabs
        variant="line"
        activeHref={activeHref}
        items={baseTabs.map((t) => ({ label: t.label, href: tabHrefFor(t.id) }))}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {tab === "overview"       && <OverviewSection {...headerCtx} />}
          {tab === "users"          && <TenantUsersTab tenantId={tenant.id} ownerEmail={ownerUser?.email ?? null} canImpersonate={ctx.can("tenant.impersonate")} canTag={ctx.can("tenant.tag")} />}
          {tab === "billing"        && <TenantBillingTab tenantId={tenant.id} canPlanChange={ctx.can("billing.plan_change")} canRefund={ctx.can("billing.refund")} canCoupon={ctx.can("billing.coupon")} />}
          {tab === "usage"          && <TenantUsageTab tenantId={tenant.id} />}
          {tab === "jobs"           && <TenantJobsTab tenantId={tenant.id} canImpersonate={ctx.can("tenant.impersonate")} />}
          {tab === "customers"      && <TenantCustomersTab tenantId={tenant.id} canImpersonate={ctx.can("tenant.impersonate")} />}
          {tab === "catalog"        && <TenantCatalogTab tenantId={tenant.id} />}
          {tab === "integrations"   && <TenantIntegrationsTab tenantId={tenant.id} canEdit={ctx.can("tenant.tag")} />}
          {tab === "flags"          && <TenantFeatureFlagsTab tenantId={tenant.id} canWrite={ctx.can("feature_flag.write")} />}
          {tab === "branding"       && <TenantBrandingTab tenantId={tenant.id} />}
          {tab === "communications" && <TenantCommunicationsTab tenantId={tenant.id} />}
          {tab === "audit"          && <TenantAuditTab tenantId={tenant.id} canExport={ctx.can("audit.read")} />}
          {tab === "security"       && <TenantSecurityTab tenantId={tenant.id} canEdit={ctx.can("tenant.tag")} />}
          {tab === "health"         && <TenantHealthScoreTab tenantId={tenant.id} canRecompute={ctx.can("tenant.tag")} />}
          {tab === "notes"          && <TenantNotesPanel tenantId={tenant.id} currentUserId={ctx.userId} canWrite={ctx.can("tenant.tag")} />}
          {tab === "settings"       && <TenantSettingsTab tenantId={tenant.id} tenantName={tenant.name} tenantSlug={tenant.slug} canRename={ctx.can("tenant.tag")} canTransfer={ctx.can("tenant.transfer")} canSuspend={ctx.can("tenant.suspend")} canDelete={ctx.can("tenant.delete")} canCancel={ctx.can("billing.plan_change")} />}
        </div>
        {rail}
      </div>
    </div>
  );
}

/* ── Overview tab (inline — shares the header context) ──── */

// We narrow the tenant shape to the subset the Overview reads — the
// page-level fetch already pulls a wider select() but Overview only
// needs these fields.
interface OverviewTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  country: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  customDomain: string | null;
  taxId: string | null;
  currency: string;
  timezone: string;
  businessType: string | null;
  trialEndsAt: Date | null;
  lastActivityAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  signupSource: string;
}

interface OverviewProps {
  tenant: OverviewTenant;
  planName: string;
  mrr: number;
  ltv: number;
  healthScore: number;
  ownerUser: { id: string; name: string | null; email: string } | undefined;
}

async function OverviewSection({ tenant, planName, mrr, ltv, healthScore, ownerUser }: OverviewProps) {
  // Tile data — fetch counts + last 30 events.
  const [userCount, customerCount, ytdJobs, fileSum, apiHits, integrationsCount, recentEvents, recentNotes] = await Promise.all([
    db.membership.count({ where: { tenantId: tenant.id } }),
    db.customer.count({ where: { tenantId: tenant.id } }),
    db.order.count({
      where: { tenantId: tenant.id, createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } },
    }),
    db.file.aggregate({ where: { tenantId: tenant.id }, _sum: { sizeBytes: true } }),
    db.auditLog.count({
      where: {
        tenantId: tenant.id,
        action: { startsWith: "api." },
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
    db.tenantIntegration.count({ where: { tenantId: tenant.id, status: "CONNECTED" } }),
    db.auditLog.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, createdAt: true, userId: true, entityType: true },
    }),
    db.tenantNote.findMany({
      where: { tenantId: tenant.id, isPrivate: false },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true, body: true, pinned: true, createdAt: true,
        author: { select: { name: true, email: true } },
      },
    }),
  ]);

  const storageBytes = Number(fileSum._sum.sizeBytes ?? 0);

  return (
    <div className="space-y-5">
      {/* Profile + ownership */}
      <Card padding="md">
        <CardHeader title="Profile" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
            <Field label="Legal name" value={tenant.name} />
            <Field label="Slug" value={<code className="font-mono">{tenant.slug}</code>} />
            <Field label="Phone" value={tenant.phone} />
            <Field label="Website" value={tenant.website ? <a href={tenant.website} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent-primary)" }}>{tenant.website}</a> : null} />
            <Field label="Address"
              value={[tenant.addressLine1, tenant.addressLine2, tenant.city, tenant.region, tenant.postalCode, tenant.country]
                .filter(Boolean).join(", ") || null} />
            <Field label="Custom domain" value={tenant.customDomain ?? null} />
            <Field label="Tax ID" value={tenant.taxId} />
            <Field label="Currency" value={tenant.currency} />
            <Field label="Time zone" value={tenant.timezone} />
            <Field label="Industry" value={tenant.businessType ? tenant.businessType.replace(/_/g, " ").toLowerCase() : null} />
          </dl>
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="Account ownership" />
        <CardBody>
          {ownerUser ? (
            <div className="flex items-center gap-3">
              <Avatar size="md" name={ownerUser.name ?? ownerUser.email} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium" style={{ color: "var(--text-default)" }}>
                  {ownerUser.name ?? ownerUser.email}
                </div>
                <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <a href={`mailto:${ownerUser.email}`} className="hover:underline">{ownerUser.email}</a> · OWNER
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No OWNER membership on file.</div>
          )}
        </CardBody>
      </Card>

      {/* Plan & subscription summary */}
      <Card padding="md">
        <CardHeader title="Plan & subscription" right={<Link href="?tab=billing" className="text-[12px] underline" style={{ color: "var(--accent-primary)" }}>Open billing →</Link>} />
        <CardBody>
          <dl className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-4">
            <Field label="Plan" value={planName} />
            <Field label="MRR" value={mrr === 0 ? "—" : `$${mrr.toLocaleString()}`} />
            <Field label="ARR" value={mrr === 0 ? "—" : `$${(mrr * 12).toLocaleString()}`} />
            <Field label="Lifetime" value={ltv === 0 ? "—" : `$${ltv.toLocaleString()}`} />
            <Field label="Trial ends" value={tenant.trialEndsAt?.toLocaleDateString() ?? null} />
            <Field label="Stripe customer" value={tenant.stripeCustomerId ?? null} />
            <Field label="Subscription" value={tenant.stripeSubscriptionId ?? null} />
            <Field label="Source" value={tenant.signupSource.toLowerCase()} />
          </dl>
        </CardBody>
      </Card>

      {/* Key-metric tiles */}
      <Card padding="md">
        <CardHeader title="Key metrics" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label="Users"           value={userCount.toLocaleString()} />
            <Tile label="Customers"       value={customerCount.toLocaleString()} />
            <Tile label="Jobs (YTD)"      value={ytdJobs.toLocaleString()} />
            <Tile label="Storage"         value={humanSize(storageBytes)} />
            <Tile label="API events (30d)" value={apiHits.toLocaleString()} />
            <Tile label="Integrations"    value={integrationsCount.toLocaleString()} />
          </div>
        </CardBody>
      </Card>

      {/* Health score breakdown */}
      <Card padding="md">
        <CardHeader title="Health score" right={<Link href="?tab=health" className="text-[12px] underline" style={{ color: "var(--accent-primary)" }}>Drilldown →</Link>} />
        <CardBody>
          <div className="flex items-center gap-4">
            <div className="text-[40px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{healthScore}</div>
            <div className="flex-1 space-y-1.5">
              <SubScore label="Login recency"     value={Math.max(0, 100 - (tenant.lastActivityAt ? Math.floor((Date.now() - tenant.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)) * 3 : 50))} />
              <SubScore label="Payment health"    value={tenant.status === "PAST_DUE" ? 30 : tenant.status === "ACTIVE" ? 95 : 70} />
              <SubScore label="Account base"      value={tenant.status === "ACTIVE" ? 90 : tenant.status === "PAST_DUE" ? 40 : tenant.status === "TRIAL" ? 70 : 30} />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Recent activity timeline */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Recent activity" right={<Link href="?tab=audit" className="text-[12px] underline" style={{ color: "var(--accent-primary)" }}>All audit →</Link>} description={`Last ${Math.min(30, recentEvents.length)} events`} />
        </div>
        {recentEvents.length === 0 ? (
          <CardBody><EmptyState title="No activity yet" description="Audit events scoped to this tenant land here." /></CardBody>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {recentEvents.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-[12px]">
                <span className="font-mono" style={{ color: "var(--text-default)" }}>{e.action}</span>
                <span style={{ color: "var(--text-faint)" }}>{e.createdAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Notes preview */}
      <Card padding="md">
        <CardHeader title="Pinned & recent notes" right={<Link href="?tab=notes" className="text-[12px] underline" style={{ color: "var(--accent-primary)" }}>All notes →</Link>} />
        <CardBody>
          {recentNotes.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No notes yet — capture handoff context, sales call summaries, etc.</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentNotes.map((n) => (
                <li key={n.id} className="rounded-md border p-3 text-[12px]"
                    style={{ borderColor: "var(--border-subtle)", background: n.pinned ? "var(--amber-50)" : "var(--surface-1)" }}>
                  <div className="mb-1 flex items-center gap-2">
                    <Avatar size="xs" name={n.author.name ?? n.author.email} />
                    <span className="font-medium" style={{ color: "var(--text-default)" }}>{n.author.name ?? n.author.email}</span>
                    <span style={{ color: "var(--text-faint)" }}>· {n.createdAt.toLocaleString()}</span>
                    {n.pinned && <Badge size="xs" color="warning">Pinned</Badge>}
                  </div>
                  <div style={{ color: "var(--text-default)" }}>{n.body.slice(0, 280)}{n.body.length > 280 ? "…" : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────── */

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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[120px_1fr_40px] items-center gap-2 text-[11px]">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <ProgressBar value={value} size="sm" tone={value >= 80 ? "success" : value >= 50 ? "warning" : "danger"} />
      <span className="text-right font-mono tabular-nums" style={{ color: "var(--text-default)" }}>{value}</span>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
