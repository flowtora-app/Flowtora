import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  savePlanDetails,
  savePlanPricing,
  savePlanMarketing,
  savePlanLifecycle,
  publishPlan,
  unpublishPlan,
  archivePlan,
  deletePlan,
} from "@/app/actions/pricing-plans";
import {
  createPlanAddOn,
  updatePlanAddOn,
  deletePlanAddOn,
} from "@/app/actions/plan-addons";
import { syncPlanToStripe } from "@/app/actions/stripe-sync";
import { formatMoney } from "@/lib/format";

import { PlanHeaderBar } from "@/components/platform/PlanHeaderBar";
import { PlanTabs, type PlanTabKey, type PlanTab } from "@/components/platform/PlanTabs";
import { PlanCardPreview, type PlanCardData } from "@/components/platform/PlanCardPreview";
import { PlanFeaturesEditor } from "@/components/platform/PlanFeaturesEditor";

// /platform/plans/[id] — plan editor (transformation rewrite).
//
// Six URL-driven tabs (?tab=):
//   Overview · Pricing · Features · Add-ons · Marketing · Advanced
//
// Sticky header on top with identity + chips + Publish/Archive quick
// actions. All server actions kept exactly as before; this is a layout
// + UX redesign, not a wiring change.

export const dynamic = "force-dynamic";

const TAB_KEYS: PlanTabKey[] = ["overview", "pricing", "features", "addons", "lifecycle", "marketing", "auditlog", "advanced"];

type SP = { tab?: string; ok?: string; error?: string; published?: string };

export default async function PlatformPlanEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const activeTab: PlanTabKey =
    (TAB_KEYS as readonly string[]).includes(sp.tab ?? "")
      ? (sp.tab as PlanTabKey)
      : "overview";

  const plan = await db.pricingPlan.findUnique({
    where: { id },
    include: {
      featureValues: true,
      addOns: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      _count: {
        select: { tenants: true, versions: true, overrides: true },
      },
    },
  });
  if (!plan) notFound();

  const allFeatures = await db.planFeature.findMany({
    orderBy: [{ groupSortOrder: "asc" }, { sortOrder: "asc" }],
  });
  const valueByFeature = new Map(plan.featureValues.map((fv) => [fv.featureId, fv]));

  // Tenant counts split by status — needed for the Overview metrics.
  const tenantStatus = await db.tenant.groupBy({
    by: ["status"],
    where: { pricingPlanId: plan.id },
    _count: { _all: true },
  });
  const counts = { active: 0, trial: 0, pastDue: 0 };
  for (const row of tenantStatus) {
    if (row.status === "ACTIVE")        counts.active  = row._count._all;
    else if (row.status === "TRIAL")    counts.trial   = row._count._all;
    else if (row.status === "PAST_DUE") counts.pastDue = row._count._all;
  }

  const canWrite = ctx.canWrite;

  const monthly = plan.priceMonthly == null ? null : Number(plan.priceMonthly);
  const annual  = plan.priceAnnual  == null ? null : Number(plan.priceAnnual);
  const mrr     = plan.isContactSales || monthly == null ? 0 : monthly * counts.active;

  // Build feature bullets for the live plan-card preview.
  // Rule: include any feature with truthy bool, non-null number, or non-empty text.
  const featureBullets: string[] = [];
  for (const f of allFeatures) {
    const v = valueByFeature.get(f.id);
    if (!v) continue;
    if (f.valueType === "BOOLEAN" && v.valueBool) {
      featureBullets.push(f.label);
    } else if (f.valueType === "NUMBER" && v.valueNumber != null) {
      const n = v.valueNumber === -1 ? "Unlimited" : v.valueNumber.toString();
      featureBullets.push(`${n} ${f.label.toLowerCase()}`);
    } else if (f.valueType === "TEXT" && v.valueText) {
      featureBullets.push(`${f.label}: ${v.valueText}`);
    }
  }

  const cardData: PlanCardData = {
    name: plan.name,
    slug: plan.slug,
    subtitle: plan.subtitle,
    description: plan.description,
    badge: plan.badge,
    highlight: plan.highlight,
    status: plan.status,
    isContactSales: plan.isContactSales,
    priceMonthly: monthly,
    priceAnnual: annual,
    currency: plan.currency || "USD",
    ctaLabel: plan.ctaLabel,
    trialDays: plan.trialDays,
    featureBullets,
  };

  // Header chips.
  const statusTone: "default" | "accent" | "success" | "warning" | "danger" | "neutral" =
    plan.status === "PUBLISHED" ? "success" :
    plan.status === "DRAFT"     ? "neutral" :
    plan.status === "HIDDEN"    ? "warning" :
    "neutral";

  const headerChips: { label: string; tone: "default" | "accent" | "success" | "warning" | "danger" | "neutral"; dot?: boolean; title?: string }[] = [
    { label: plan.status, tone: statusTone, dot: true, title: "Plan status" },
    { label: plan.isContactSales ? "Contact-sales" : (monthly != null ? `${formatMoney(monthly, plan.currency || "USD")}/mo` : "No price"), tone: "default", title: "Sticker price" },
    { label: `${counts.active} tenants`, tone: "default", title: `${counts.active} active · ${counts.trial} trial · ${counts.pastDue} past-due` },
    { label: `${plan._count.versions} versions`, tone: "neutral", title: "Published versions" },
    ...(plan._count.overrides > 0 ? [{ label: `${plan._count.overrides} overrides`, tone: "accent" as const, title: "Per-tenant price overrides on this plan" }] : []),
  ];

  // Quick action cluster — Publish / Unpublish / Archive / Delete.
  const headerActions = canWrite ? (
    <>
      {plan.status !== "PUBLISHED" && (
        <form action={publishPlan.bind(null, plan.id)}>
          <ActionButton tone="accent">Publish</ActionButton>
        </form>
      )}
      {plan.status === "PUBLISHED" && (
        <form action={unpublishPlan.bind(null, plan.id)}>
          <ActionButton tone="neutral">Unpublish</ActionButton>
        </form>
      )}
      {plan.status !== "ARCHIVED" && (
        <form action={archivePlan.bind(null, plan.id)}>
          <ActionButton tone="neutral">Archive</ActionButton>
        </form>
      )}
      {plan.status === "DRAFT" &&
        plan._count.tenants === 0 &&
        plan._count.versions === 0 &&
        plan._count.overrides === 0 && (
          <form action={deletePlan.bind(null, plan.id)}>
            <ActionButton tone="danger">Delete</ActionButton>
          </form>
      )}
    </>
  ) : null;

  // Tab bar with attention badges.
  const missingDescription = !plan.description && !plan.marketingCopy;
  const tabs: PlanTab[] = [
    { key: "overview", label: "Overview" },
    {
      key: "pricing",
      label: "Pricing & billing",
      badge: !plan.isContactSales && monthly == null ? "!" : undefined,
      badgeTone: "warning",
    },
    {
      key: "features",
      label: "Features & limits",
      badge: plan._count.tenants > 0 && plan.featureValues.length === 0 ? "!" : undefined,
      badgeTone: "warning",
    },
    {
      key: "addons",
      label: "Add-ons",
      badge: plan.addOns.length > 0 ? plan.addOns.length : undefined,
      badgeTone: "neutral",
    },
    { key: "lifecycle", label: "Lifecycle & tax" },
    {
      key: "marketing",
      label: "Marketing",
      badge: missingDescription ? "!" : undefined,
      badgeTone: "warning",
    },
    { key: "auditlog", label: "Audit log" },
    { key: "advanced", label: "Advanced" },
  ];

  return (
    <div>
      <PlanHeaderBar
        name={plan.name}
        slug={plan.slug}
        badge={plan.badge}
        highlighted={plan.highlight}
        chips={headerChips}
        subline={`Last updated ${plan.updatedAt.toISOString().slice(0, 10)}${plan.publishedAt ? ` · Published ${plan.publishedAt.toISOString().slice(0, 10)}` : ""}`}
        actions={headerActions}
      />

      {/* Banners */}
      <div className="mt-4 space-y-2">
        {sp.ok && (
          <Banner tone="success" title="Saved" body={
            sp.published === "1"
              ? "Plan published. Marketing pages have been flushed."
              : sp.ok === "stripe-synced"
              ? "Synced to Stripe. Product and Price IDs updated."
              : "Changes saved."
          } />
        )}
        {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

        {plan.status !== "PUBLISHED" && !plan.isContactSales && monthly == null && (
          <Banner
            tone="warning"
            title="Plan can't be published yet"
            body="Set a monthly price on the Pricing tab, or mark as contact-sales."
          />
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6">
        <PlanTabs planId={plan.id} active={activeTab} tabs={tabs} />
      </div>

      {/* Tab body */}
      {activeTab === "overview"  && (
        <OverviewTab plan={plan} counts={counts} mrr={mrr} cardData={cardData} canWrite={canWrite} />
      )}
      {activeTab === "pricing"   && (
        <PricingTab plan={plan} cardData={cardData} canWrite={canWrite} />
      )}
      {activeTab === "features"  && (
        <PlanFeaturesEditor
          planId={plan.id}
          features={allFeatures}
          valueByFeature={valueByFeature}
          canWrite={canWrite}
        />
      )}
      {activeTab === "addons"    && (
        <AddOnsTab plan={plan} addOns={plan.addOns} canWrite={canWrite} />
      )}
      {activeTab === "lifecycle" && (
        <LifecycleTab plan={plan} canWrite={canWrite} />
      )}
      {activeTab === "marketing" && (
        <MarketingTab plan={plan} cardData={cardData} canWrite={canWrite} />
      )}
      {activeTab === "auditlog"  && (
        <AuditLogTab planId={plan.id} />
      )}
      {activeTab === "advanced"  && (
        <AdvancedTab plan={plan} canWrite={canWrite} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ────────────────────────────────────────────────────────────────

function OverviewTab({
  plan,
  counts,
  mrr,
  cardData,
  canWrite,
}: {
  plan: {
    id: string;
    slug: string;
    name: string;
    subtitle: string | null;
    description: string | null;
    badge: string | null;
    highlight: boolean;
    sortOrder: number;
    trialDays: number | null;
    ctaLabel: string | null;
    ctaHref: string | null;
    currency: string;
    _count: { tenants: number; versions: number; overrides: number };
  };
  counts: { active: number; trial: number; pastDue: number };
  mrr: number;
  cardData: PlanCardData;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-6">
      {/* KPI mini-band */}
      <div className="grid gap-3 md:grid-cols-4">
        <MiniKpi label="MRR contribution" value={formatMoney(mrr, plan.currency || "USD")} hint={`${counts.active} active tenants`} tone="success" />
        <MiniKpi label="Tenants on plan"  value={plan._count.tenants.toString()} hint={`${counts.trial} trial · ${counts.pastDue} past-due`} />
        <MiniKpi label="Versions"          value={plan._count.versions.toString()} hint="Published snapshots" />
        <MiniKpi label="Price overrides"   value={plan._count.overrides.toString()} hint="Negotiated deals" tone={plan._count.overrides > 0 ? "accent" : "default"} />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        {/* Identity & copy form */}
        <Section
          title="Identity & copy"
          description="What prospects see on the plan card. Slug powers /signup?plan=… URLs."
        >
          <form action={savePlanDetails.bind(null, plan.id)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Slug" name="slug" defaultValue={plan.slug} required hint="Lowercase letters, digits, hyphens." disabled={!canWrite} />
              <FormField label="Name" name="name" defaultValue={plan.name} required maxLength={80} disabled={!canWrite} />
              <FormField label="Subtitle" name="subtitle" defaultValue={plan.subtitle ?? ""} hint="One-line positioning under the name." maxLength={200} disabled={!canWrite} />
              <FormField label="Badge" name="badge" defaultValue={plan.badge ?? ""} hint='e.g. "Most popular", "Save 20%"' maxLength={40} disabled={!canWrite} />
              <FormField label="Sort order" name="sortOrder" type="number" defaultValue={String(plan.sortOrder)} hint="Lower = earlier." disabled={!canWrite} />
              <FormField label="Trial days" name="trialDays" type="number" defaultValue={plan.trialDays == null ? "" : String(plan.trialDays)} hint="Blank = platform default (14)." disabled={!canWrite} />
              <FormField label="CTA label" name="ctaLabel" defaultValue={plan.ctaLabel ?? ""} hint='Blank = "Start free trial".' maxLength={40} disabled={!canWrite} />
              <FormField label="CTA href"  name="ctaHref"  defaultValue={plan.ctaHref ?? ""} hint="Blank = /signup?plan=<slug>." maxLength={300} disabled={!canWrite} />
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
                Long description
              </span>
              <textarea
                name="description"
                defaultValue={plan.description ?? ""}
                rows={4}
                maxLength={2000}
                disabled={!canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Shown on /pricing detail expansion. 2,000 chars max.
              </span>
            </label>

            <CheckboxField
              label="Highlight this plan (accent border on /pricing)"
              name="highlight"
              defaultChecked={plan.highlight}
              disabled={!canWrite}
            />

            {canWrite && <SaveRow />}
          </form>
        </Section>

        {/* Live preview */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Live preview
          </h3>
          <PlanCardPreview plan={cardData} />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// PRICING TAB
// ────────────────────────────────────────────────────────────────

function PricingTab({
  plan,
  cardData,
  canWrite,
}: {
  plan: {
    id: string;
    priceMonthly: unknown;
    priceAnnual: unknown;
    currency: string;
    isContactSales: boolean;
    stripeProductId: string | null;
    stripePriceMonthly: string | null;
    stripePriceAnnual: string | null;
    stripeSyncedAt: Date | null;
  };
  cardData: PlanCardData;
  canWrite: boolean;
}) {
  const monthly = plan.priceMonthly == null ? "" : String(plan.priceMonthly);
  const annual  = plan.priceAnnual  == null ? "" : String(plan.priceAnnual);
  const monthlyN = plan.priceMonthly == null ? null : Number(plan.priceMonthly);
  const annualN  = plan.priceAnnual  == null ? null : Number(plan.priceAnnual);
  const annualSavingsPct =
    monthlyN != null && annualN != null && monthlyN > 0
      ? Math.max(0, Math.round((1 - (annualN / 12) / monthlyN) * 100))
      : null;

  const hasStripeSync = !!plan.stripeProductId;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Section
          title="Sticker price"
          description="What appears on /pricing. Stripe drives actual checkout — keep them in sync."
          right={canWrite ? (
            <form action={syncPlanToStripe.bind(null, plan.id)}>
              <button
                type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  background: hasStripeSync ? "var(--surface-2)" : "var(--accent-primary)",
                  color:      hasStripeSync ? "var(--text-default)" : "var(--accent-fg)",
                  border: `1px solid ${hasStripeSync ? "var(--border-default)" : "var(--accent-primary)"}`,
                }}
                title="Create / update the Stripe Product and Price objects to match these values."
              >
                {hasStripeSync ? "Re-sync to Stripe" : "Sync to Stripe"}
              </button>
            </form>
          ) : null}
        >
          <form action={savePlanPricing.bind(null, plan.id)} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="Monthly price" name="priceMonthly" defaultValue={monthly} placeholder="79" hint="Dollars or dollars.cents." disabled={!canWrite} />
              <FormField label="Annual price"  name="priceAnnual"  defaultValue={annual}  placeholder="756" hint="Full-year total. Card divides by 12." disabled={!canWrite} />
              <FormField label="Currency"      name="currency"     defaultValue={plan.currency || "USD"} maxLength={3} hint="ISO-4217." disabled={!canWrite} />
            </div>

            <CheckboxField
              label="Contact-sales only — hides price; card shows 'Custom'."
              name="isContactSales"
              defaultChecked={plan.isContactSales}
              disabled={!canWrite}
            />

            {annualSavingsPct != null && annualSavingsPct > 0 && !plan.isContactSales && (
              <div
                className="rounded-md px-3 py-2 text-xs"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}
              >
                Annual saves customers ~{annualSavingsPct}% vs paying monthly.
              </div>
            )}

            <fieldset
              className="rounded-md p-4"
              style={{ border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
            >
              <legend className="px-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Stripe linkage
              </legend>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField label="Product ID"        name="stripeProductId"   defaultValue={plan.stripeProductId   ?? ""} placeholder="prod_…"  maxLength={120} disabled={!canWrite} />
                <FormField label="Monthly price ID"  name="stripePriceMonthly" defaultValue={plan.stripePriceMonthly ?? ""} placeholder="price_…" maxLength={120} disabled={!canWrite} />
                <FormField label="Annual price ID"   name="stripePriceAnnual"  defaultValue={plan.stripePriceAnnual  ?? ""} placeholder="price_…" maxLength={120} disabled={!canWrite} />
              </div>
              {plan.stripeSyncedAt && (
                <div className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Last synced: {plan.stripeSyncedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </div>
              )}
              {!hasStripeSync && (
                <div className="mt-3 text-xs" style={{ color: "var(--warning-fg)" }}>
                  ⚠ Not yet linked to Stripe — checkout will fall back to env-mapped IDs if available.
                </div>
              )}
            </fieldset>

            {canWrite && <SaveRow />}
          </form>
        </Section>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Pricing preview
          </h3>
          <PlanCardPreview plan={cardData} />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// ADD-ONS TAB
// ────────────────────────────────────────────────────────────────

type PlanAddOnRow = {
  id: string;
  planId: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: unknown;
  priceAnnual: unknown;
  unitLabel: string | null;
  stripePriceId: string | null;
  sortOrder: number;
  active: boolean;
};

function AddOnsTab({
  plan,
  addOns,
  canWrite,
}: {
  plan: { id: string };
  addOns: PlanAddOnRow[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      <Section
        title="Add-ons"
        description="Optional line items billed alongside the base plan — seat overages, API access, etc. Scoped to this plan."
        right={canWrite ? (
          <form action={createPlanAddOn.bind(null, plan.id)}>
            <button
              type="submit"
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              + New add-on
            </button>
          </form>
        ) : null}
      >
        {addOns.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No add-ons yet.{canWrite ? ' Click "+ New add-on" to create one.' : ""}
          </p>
        ) : (
          <div className="space-y-4">
            {addOns.map((a) => (
              <AddOnRow key={a.id} addOn={a} canWrite={canWrite} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function AddOnRow({ addOn, canWrite }: { addOn: PlanAddOnRow; canWrite: boolean }) {
  const monthly = addOn.priceMonthly == null ? "" : String(addOn.priceMonthly);
  const annual  = addOn.priceAnnual  == null ? "" : String(addOn.priceAnnual);
  return (
    <div
      className="rounded-lg"
      style={{
        background: addOn.active ? "var(--surface-1)" : "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
        opacity: addOn.active ? 1 : 0.85,
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {addOn.name || <span style={{ color: "var(--text-faint)" }}>Untitled</span>}
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
            {addOn.slug}
          </span>
          {addOn.active ? (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
            >
              active
            </span>
          ) : (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              inactive
            </span>
          )}
          {addOn.priceMonthly != null && (
            <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
              {formatMoney(Number(addOn.priceMonthly), "USD")}/mo{addOn.unitLabel ? ` · ${addOn.unitLabel}` : ""}
            </span>
          )}
        </div>
        {canWrite && (
          <form action={deletePlanAddOn.bind(null, addOn.id)}>
            <button
              type="submit"
              className="ts-focus rounded-md px-2 py-1 text-xs font-medium"
              style={{
                background: "var(--danger-surface)",
                color: "var(--danger-fg)",
                border: "1px solid var(--danger-fg)",
              }}
            >
              Delete
            </button>
          </form>
        )}
      </div>

      <form action={updatePlanAddOn.bind(null, addOn.id)} className="space-y-4 px-4 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Slug" name="slug" defaultValue={addOn.slug} required hint="Unique per plan." disabled={!canWrite} />
          <FormField label="Name" name="name" defaultValue={addOn.name} required maxLength={80} disabled={!canWrite} />
          <FormField label="Sort order" name="sortOrder" type="number" defaultValue={String(addOn.sortOrder)} hint="Lower = earlier." disabled={!canWrite} />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>Description</span>
          <textarea
            name="description"
            defaultValue={addOn.description ?? ""}
            rows={2}
            maxLength={400}
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Monthly price" name="priceMonthly" defaultValue={monthly} placeholder="12" disabled={!canWrite} />
          <FormField label="Annual price"  name="priceAnnual"  defaultValue={annual}  placeholder="120" disabled={!canWrite} />
          <FormField label="Unit label"    name="unitLabel"    defaultValue={addOn.unitLabel ?? ""} placeholder="per seat / mo" maxLength={40} disabled={!canWrite} />
        </div>

        <FormField
          label="Stripe price ID"
          name="stripePriceId"
          defaultValue={addOn.stripePriceId ?? ""}
          placeholder="price_…"
          maxLength={120}
          hint="Optional. Plan-level Sync to Stripe doesn't yet cover add-ons."
          disabled={!canWrite}
        />

        <div className="flex items-center justify-between">
          <CheckboxField
            label="Active — visible on /pricing and selectable at checkout"
            name="active"
            defaultChecked={addOn.active}
            disabled={!canWrite}
          />
          {canWrite && (
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// MARKETING TAB
// ────────────────────────────────────────────────────────────────

function MarketingTab({
  plan,
  cardData,
  canWrite,
}: {
  plan: {
    id: string;
    landingCopy: string | null;
    marketingCopy: string | null;
    showOnLanding: boolean;
    showOnPricing: boolean;
    showOnSignup: boolean;
  };
  cardData: PlanCardData;
  canWrite: boolean;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Section title="Landing & pricing copy" description="Visible on the marketing site. Edits flush the marketing cache on save.">
          <form action={savePlanMarketing.bind(null, plan.id)} className="space-y-5">
            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
                Home-page blurb
              </span>
              <textarea
                name="landingCopy"
                defaultValue={plan.landingCopy ?? ""}
                rows={3}
                maxLength={400}
                disabled={!canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Short blurb on the home page pricing grid. 400 chars max.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
                Pricing-page detail copy
              </span>
              <textarea
                name="marketingCopy"
                defaultValue={plan.marketingCopy ?? ""}
                rows={6}
                maxLength={4000}
                disabled={!canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Fuller description on the /pricing detail. 4,000 chars max.
              </span>
            </label>

            <fieldset
              className="rounded-md p-4"
              style={{ border: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
            >
              <legend className="px-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Visibility
              </legend>
              <div className="space-y-2 pt-1">
                <CheckboxField label="Home page (/) — shown in the landing grid" name="showOnLanding" defaultChecked={plan.showOnLanding} disabled={!canWrite} />
                <CheckboxField label="Pricing page (/pricing) — full comparison table" name="showOnPricing" defaultChecked={plan.showOnPricing} disabled={!canWrite} />
                <CheckboxField label="Signup page (/signup) — selectable tier at checkout" name="showOnSignup" defaultChecked={plan.showOnSignup} disabled={!canWrite} />
              </div>
            </fieldset>

            {canWrite && <SaveRow />}
          </form>
        </Section>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Live preview
        </h3>
        <PlanCardPreview plan={cardData} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// ADVANCED TAB
// ────────────────────────────────────────────────────────────────

function AdvancedTab({
  plan,
  canWrite,
}: {
  plan: {
    id: string;
    slug: string;
    status: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    stripeProductId: string | null;
    stripePriceMonthly: string | null;
    stripePriceAnnual: string | null;
    stripeSyncedAt: Date | null;
    _count: { tenants: number; versions: number; overrides: number };
  };
  canWrite: boolean;
}) {
  const eligibleForDelete =
    plan.status === "DRAFT" &&
    plan._count.tenants === 0 &&
    plan._count.versions === 0 &&
    plan._count.overrides === 0;

  return (
    <div className="space-y-6">
      <Section title="Internal metadata" description="Read-only audit info for support / engineering.">
        <dl className="grid gap-y-2 text-sm md:grid-cols-2">
          <DT label="Plan ID"             value={plan.id} mono />
          <DT label="Slug"                value={plan.slug} mono />
          <DT label="Created"             value={plan.createdAt.toISOString().slice(0, 16).replace("T", " ")} />
          <DT label="Updated"             value={plan.updatedAt.toISOString().slice(0, 16).replace("T", " ")} />
          <DT label="Published"           value={plan.publishedAt ? plan.publishedAt.toISOString().slice(0, 16).replace("T", " ") : null} />
          <DT label="Sort order"          value={String(plan.sortOrder)} />
          <DT label="Stripe product"      value={plan.stripeProductId} mono />
          <DT label="Stripe price ID (m)" value={plan.stripePriceMonthly} mono />
          <DT label="Stripe price ID (y)" value={plan.stripePriceAnnual} mono />
          <DT label="Stripe last synced"  value={plan.stripeSyncedAt ? plan.stripeSyncedAt.toISOString().slice(0, 16).replace("T", " ") : null} />
        </dl>
      </Section>

      <Section title="Versioning" description="Each Publish snapshots a PlanVersion. Older versions can be diffed and rolled back.">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            <b style={{ color: "var(--text-default)" }}>{plan._count.versions}</b> version{plan._count.versions === 1 ? "" : "s"} on file.
          </div>
          <Link
            href={`/platform/plans/${plan.id}/versions`}
            className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            View versions →
          </Link>
        </div>
      </Section>

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
        <div className="space-y-3 p-5">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              Delete plan
            </h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              Permanent. Only allowed for DRAFT plans with no tenants, no versions, and no overrides.
            </p>
          </div>
          {eligibleForDelete && canWrite ? (
            <form action={deletePlan.bind(null, plan.id)}>
              <button
                type="submit"
                className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
                style={{
                  background: "var(--danger-surface)",
                  color: "var(--danger-fg)",
                  border: "1px solid var(--danger-fg)",
                }}
              >
                Delete plan permanently
              </button>
            </form>
          ) : (
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Can't delete:{" "}
              {plan.status !== "DRAFT" && <>not a draft · </>}
              {plan._count.tenants > 0 && <>{plan._count.tenants} tenant{plan._count.tenants === 1 ? "" : "s"} · </>}
              {plan._count.versions > 0 && <>{plan._count.versions} version{plan._count.versions === 1 ? "" : "s"} · </>}
              {plan._count.overrides > 0 && <>{plan._count.overrides} override{plan._count.overrides === 1 ? "" : "s"} · </>}
              archive instead.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// LIFECYCLE & TAX TAB — Page 19 alignment.
// ────────────────────────────────────────────────────────────────

function LifecycleTab({
  plan, canWrite,
}: {
  plan: {
    id: string;
    trialDays: number | null;
    trialRequiresCard: boolean;
    trialCtaLabel: string | null;
    migrationOnUpgrade: "PRORATE_IMMEDIATE" | "END_OF_PERIOD";
    migrationOnDowngrade: "END_OF_PERIOD" | "PRORATE_REFUND";
    defaultCycle: "MONTHLY" | "ANNUAL";
    taxBehavior: "EXCLUSIVE" | "INCLUSIVE";
    taxCode: string | null;
  };
  canWrite: boolean;
}) {
  return (
    <form action={savePlanLifecycle.bind(null, plan.id)} className="space-y-6">
      <Section
        title="Trial settings"
        description="How long does the trial run? Should we require a card up front?"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label="Trial length (days)" name="trialDays" type="number"
            defaultValue={plan.trialDays == null ? "" : String(plan.trialDays)}
            hint="Blank = platform default (14)."
            disabled={!canWrite}
          />
          <FormField
            label="Trial-end CTA copy" name="trialCtaLabel"
            defaultValue={plan.trialCtaLabel ?? ""}
            hint='Override the default "Add card to keep access" copy.'
            disabled={!canWrite} maxLength={80}
          />
        </div>
        <div className="mt-3">
          <CheckboxField
            label="Require a card on file before the trial starts"
            name="trialRequiresCard"
            defaultChecked={plan.trialRequiresCard}
            disabled={!canWrite}
          />
        </div>
      </Section>

      <Section
        title="Migration rules"
        description="What happens when a tenant changes plans? Default cycle picks which cadence renders first at signup."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="On upgrade" name="migrationOnUpgrade"
            defaultValue={plan.migrationOnUpgrade}
            options={[
              { value: "PRORATE_IMMEDIATE", label: "Prorate now — charge diff today" },
              { value: "END_OF_PERIOD",     label: "Wait until next renewal" },
            ]}
            disabled={!canWrite}
          />
          <SelectField
            label="On downgrade" name="migrationOnDowngrade"
            defaultValue={plan.migrationOnDowngrade}
            options={[
              { value: "END_OF_PERIOD",  label: "Switch at next renewal (no refund)" },
              { value: "PRORATE_REFUND", label: "Switch now — prorate refund" },
            ]}
            disabled={!canWrite}
          />
          <SelectField
            label="Default billing cycle" name="defaultCycle"
            defaultValue={plan.defaultCycle}
            options={[
              { value: "MONTHLY", label: "Monthly" },
              { value: "ANNUAL",  label: "Annual" },
            ]}
            hint="Picked first on the pricing card if both prices exist."
            disabled={!canWrite}
          />
        </div>
      </Section>

      <Section
        title="Tax behavior"
        description="Inclusive prices already contain tax. Exclusive prices add tax on top at checkout. Tax code maps to Stripe Tax (e.g. txcd_10000000)."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="Tax behavior" name="taxBehavior"
            defaultValue={plan.taxBehavior}
            options={[
              { value: "EXCLUSIVE", label: "Exclusive — tax added at checkout" },
              { value: "INCLUSIVE", label: "Inclusive — tax baked into price" },
            ]}
            disabled={!canWrite}
          />
          <FormField
            label="Tax code" name="taxCode"
            defaultValue={plan.taxCode ?? ""}
            hint='Stripe Tax code, e.g. "txcd_10000000".'
            disabled={!canWrite} maxLength={80}
          />
        </div>
      </Section>

      {canWrite && <SaveRow />}
    </form>
  );
}

// ────────────────────────────────────────────────────────────────
// AUDIT LOG TAB — Page 19 alignment. Plan-scoped events from the
// platform audit chain (entityType = "PricingPlan" + entityId).
// ────────────────────────────────────────────────────────────────

async function AuditLogTab({ planId }: { planId: string }) {
  const events = await db.auditLog.findMany({
    where: { entityType: "PricingPlan", entityId: planId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
      userId: true,
      severity: true,
    },
  });

  // Resolve user emails for display.
  const userIds = Array.from(new Set(events.map((e) => e.userId).filter((x): x is string => !!x)));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <Section
      title="Plan-scoped audit log"
      description="Every mutation against this plan, newest first. Limited to the most recent 100 events."
    >
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No events yet.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {events.map((e) => {
            const u = e.userId ? userById.get(e.userId) : undefined;
            const actor = u?.name ?? u?.email ?? "system";
            return (
              <li key={e.id} className="grid grid-cols-[140px_1fr_auto] gap-3 py-2.5 text-sm">
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-[12px]" style={{ color: "var(--text-default)" }}>
                    {e.action}
                  </span>
                  <span className="ml-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    by {actor}
                  </span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{ color:
                        e.severity === "CRITICAL" ? "var(--rose-700)"
                        : e.severity === "WARNING" ? "var(--amber-700)"
                        : "var(--text-muted)",
                      }}>
                  {e.severity ?? "INFO"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function SelectField({
  label, name, defaultValue, options, hint, disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue} disabled={disabled}
              className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
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

function MiniKpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const palette =
    tone === "accent"  ? { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" } :
    tone === "success" ? { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     } :
    tone === "warning" ? { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     } :
                         { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     };
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, boxShadow: "var(--shadow-sm)" }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: palette.label }}>
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </div>
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
                          { bg: "var(--surface-2)",      fg: "var(--text-default)",   border: "var(--border-default)" };
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

function FormField({
  label,
  hint,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  maxLength,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function CheckboxField({
  label,
  name,
  defaultChecked,
  disabled,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-default)" }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

function SaveRow() {
  return (
    <div
      className="flex justify-end pt-4"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <button
        type="submit"
        className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
      >
        Save changes
      </button>
    </div>
  );
}

function ActionButton({
  tone,
  children,
}: {
  tone: "accent" | "neutral" | "danger";
  children: React.ReactNode;
}) {
  const style: React.CSSProperties =
    tone === "accent"
      ? { background: "var(--accent-primary)", color: "var(--accent-fg)" }
      : tone === "danger"
      ? {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-default)",
        };
  return (
    <button
      type="submit"
      className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
      style={style}
    >
      {children}
    </button>
  );
}

function DT({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="w-32 shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>
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
