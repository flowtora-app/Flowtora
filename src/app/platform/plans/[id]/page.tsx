import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import {
  savePlanDetails,
  savePlanPricing,
  savePlanFeatures,
  savePlanMarketing,
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

// /platform/plans/[id] — plan editor (M3).
//
// Four tabs surface different slices of the PricingPlan row:
//   • details    — identity (slug, name, copy, CTA, highlight, order)
//   • pricing    — numeric prices + Stripe linkage
//   • features   — matrix of PlanFeatureValue cells, grouped
//   • marketing  — landing / pricing copy + visibility toggles
//
// Tab is selected via `?tab=…`; every form posts through a server
// action that redirects back with `?ok=1` or `?error=…`. The action
// already flushes both the marketing cache tags and the static route
// cache — no client-side dance required.
//
// Publish / Unpublish / Archive / Delete live in the page header, each
// behind its own tiny form so we get CSRF-safe server-action posts
// without any JS.

export const dynamic = "force-dynamic";

type Tab = "details" | "pricing" | "features" | "addons" | "marketing";
const TABS: { id: Tab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "pricing", label: "Pricing" },
  { id: "features", label: "Features" },
  { id: "addons", label: "Add-ons" },
  { id: "marketing", label: "Marketing" },
];

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

  // Validate tab, default to details if missing/bogus.
  const activeTab: Tab = (TABS.find((t) => t.id === sp.tab)?.id ?? "details") as Tab;

  // Fetch the plan + all the nested state the editor tabs need.
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

  // Feature library (master list) — used by the features tab to render
  // a cell for every feature even if the plan has no value yet.
  const allFeatures = await db.planFeature.findMany({
    orderBy: [{ groupSortOrder: "asc" }, { sortOrder: "asc" }],
  });

  // Cell lookup: featureId → PlanFeatureValue (or undefined).
  const valueByFeature = new Map(plan.featureValues.map((fv) => [fv.featureId, fv]));

  const canWrite = ctx.canWrite;

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb + header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/platform/plans"
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            ← Plans
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {plan.name}
            <StatusChip status={plan.status} />
            {plan.highlight && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
              >
                Highlighted
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono text-xs">{plan.slug}</span>
            {" · "}
            {plan._count.tenants} tenant{plan._count.tenants === 1 ? "" : "s"}
            {" · "}
            <Link
              href={`/platform/plans/${plan.id}/versions`}
              className="underline"
              style={{ color: "var(--text-muted)" }}
            >
              {plan._count.versions} version{plan._count.versions === 1 ? "" : "s"}
            </Link>
            {plan._count.overrides > 0 && ` · ${plan._count.overrides} price override${plan._count.overrides === 1 ? "" : "s"}`}
          </p>
        </div>

        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {plan.status !== "PUBLISHED" && (
              <form action={publishPlan.bind(null, plan.id)}>
                <SolidButton tone="accent">Publish</SolidButton>
              </form>
            )}
            {plan.status === "PUBLISHED" && (
              <form action={unpublishPlan.bind(null, plan.id)}>
                <SolidButton tone="neutral">Unpublish</SolidButton>
              </form>
            )}
            {plan.status !== "ARCHIVED" && (
              <form action={archivePlan.bind(null, plan.id)}>
                <SolidButton tone="neutral">Archive</SolidButton>
              </form>
            )}
            {plan.status === "DRAFT" &&
              plan._count.tenants === 0 &&
              plan._count.versions === 0 &&
              plan._count.overrides === 0 && (
                <form action={deletePlan.bind(null, plan.id)}>
                  <SolidButton tone="danger">Delete</SolidButton>
                </form>
              )}
          </div>
        )}
      </div>

      {/* ── Banners ── */}
      {sp.ok && (
        <Banner tone="ok">
          {sp.published === "1"
            ? `Plan published. Marketing pages have been flushed.`
            : sp.ok === "stripe-synced"
            ? `Synced to Stripe. Product and Price IDs updated.`
            : "Saved."}
        </Banner>
      )}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      {/* ── Publish-blocker hint when price missing ── */}
      {plan.status !== "PUBLISHED" &&
        !plan.isContactSales &&
        plan.priceMonthly == null && (
          <div
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--warning-surface)",
              color: "var(--warning-fg)",
              border: "1px solid var(--warning-fg)",
            }}
          >
            This plan can&apos;t be published yet — set a monthly price on the{" "}
            <Link
              href={`/platform/plans/${plan.id}?tab=pricing`}
              className="underline"
            >
              Pricing tab
            </Link>
            , or mark it as contact-sales.
          </div>
        )}

      {/* ── Tabs ── */}
      <div
        className="flex gap-1 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <Link
              key={t.id}
              href={`/platform/plans/${plan.id}?tab=${t.id}`}
              scroll={false}
              className="px-4 py-2 text-sm font-medium"
              style={{
                color: active ? "var(--text-default)" : "var(--text-muted)",
                borderBottom: active
                  ? "2px solid var(--accent-primary)"
                  : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* ── Tab bodies ── */}
      {activeTab === "details" && (
        <DetailsTab plan={plan} canWrite={canWrite} />
      )}
      {activeTab === "pricing" && (
        <PricingTab plan={plan} canWrite={canWrite} />
      )}
      {activeTab === "features" && (
        <FeaturesTab
          plan={plan}
          features={allFeatures}
          valueByFeature={valueByFeature}
          canWrite={canWrite}
        />
      )}
      {activeTab === "addons" && (
        <AddOnsTab plan={plan} addOns={plan.addOns} canWrite={canWrite} />
      )}
      {activeTab === "marketing" && (
        <MarketingTab plan={plan} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Details tab
   ────────────────────────────────────────────────────────────── */

function DetailsTab({
  plan,
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
  };
  canWrite: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Identity & copy"
        description="What prospects see on the plan card. Slug powers /signup?plan=… URLs and stays stable across rebrands."
      />
      <form action={savePlanDetails.bind(null, plan.id)} className="space-y-5 px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label="Slug"
            name="slug"
            defaultValue={plan.slug}
            required
            hint="Lowercase letters, digits, hyphens. Used in URLs and Stripe metadata."
            disabled={!canWrite}
          />
          <FormField
            label="Name"
            name="name"
            defaultValue={plan.name}
            required
            maxLength={80}
            disabled={!canWrite}
          />
          <FormField
            label="Subtitle"
            name="subtitle"
            defaultValue={plan.subtitle ?? ""}
            hint="One-line positioning under the name on cards."
            maxLength={200}
            disabled={!canWrite}
          />
          <FormField
            label="Badge"
            name="badge"
            defaultValue={plan.badge ?? ""}
            hint={'Chip shown on the card. e.g. "Most popular", "Save 20%".'}
            maxLength={40}
            disabled={!canWrite}
          />
          <FormField
            label="Sort order"
            name="sortOrder"
            type="number"
            defaultValue={String(plan.sortOrder)}
            hint="Lower numbers come first on marketing + admin."
            disabled={!canWrite}
          />
          <FormField
            label="Trial days"
            name="trialDays"
            type="number"
            defaultValue={plan.trialDays == null ? "" : String(plan.trialDays)}
            hint="Blank = use platform default (14)."
            disabled={!canWrite}
          />
          <FormField
            label="CTA label"
            name="ctaLabel"
            defaultValue={plan.ctaLabel ?? ""}
            hint={'Blank = "Start free trial". Contact-sales: "Talk to sales".'}
            maxLength={40}
            disabled={!canWrite}
          />
          <FormField
            label="CTA href"
            name="ctaHref"
            defaultValue={plan.ctaHref ?? ""}
            hint={'Blank = /signup?plan=<slug>. Absolute URL ok.'}
            maxLength={300}
            disabled={!canWrite}
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm">Long description</span>
          <textarea
            name="description"
            defaultValue={plan.description ?? ""}
            rows={4}
            maxLength={2000}
            disabled={!canWrite}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
            Shown on /pricing detail expansion. Plain text; markdown renders where supported.
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
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────
   Pricing tab
   ────────────────────────────────────────────────────────────── */

function PricingTab({
  plan,
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
  canWrite: boolean;
}) {
  // Decimals come back as Prisma.Decimal; stringify for the input.
  const monthly = plan.priceMonthly == null ? "" : String(plan.priceMonthly);
  const annual = plan.priceAnnual == null ? "" : String(plan.priceAnnual);

  return (
    <Card>
      <CardHeader
        title="Pricing & billing"
        description="Sticker prices shown on marketing. Stripe linkage drives checkout when set; otherwise the legacy PRICE_IDS env map is used."
        right={
          canWrite ? (
            <form action={syncPlanToStripe.bind(null, plan.id)}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-subtle)",
                }}
                title="Create / update Stripe Product and Price objects to match these values, then write the IDs back."
              >
                Sync to Stripe
              </button>
            </form>
          ) : null
        }
      />
      <form action={savePlanPricing.bind(null, plan.id)} className="space-y-5 px-5 py-5">
        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            label="Monthly price"
            name="priceMonthly"
            defaultValue={monthly}
            placeholder="79"
            hint="Dollars (or dollars.cents). Blank = no monthly price."
            disabled={!canWrite}
          />
          <FormField
            label="Annual price"
            name="priceAnnual"
            defaultValue={annual}
            placeholder="790"
            hint="Full year total, not /12. Blank = no annual option."
            disabled={!canWrite}
          />
          <FormField
            label="Currency"
            name="currency"
            defaultValue={plan.currency || "USD"}
            maxLength={3}
            hint="ISO-4217 code. We only display USD today."
            disabled={!canWrite}
          />
        </div>

        <CheckboxField
          label="Contact-sales only (hides price, card shows “Contact sales”)"
          name="isContactSales"
          defaultChecked={plan.isContactSales}
          disabled={!canWrite}
        />

        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <div className="mb-2 font-medium uppercase tracking-wider" style={{ color: "var(--text-default)" }}>
            Stripe linkage
          </div>
          Click <strong>Sync to Stripe</strong> above to create or update the Product + Price objects and auto-fill
          these fields. Manual edits are fine for advanced cases, but the sync button is the happy path.
          {plan.stripeSyncedAt && (
            <div className="mt-1">
              Last synced: {plan.stripeSyncedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FormField
            label="Stripe product ID"
            name="stripeProductId"
            defaultValue={plan.stripeProductId ?? ""}
            placeholder="prod_…"
            maxLength={120}
            disabled={!canWrite}
          />
          <FormField
            label="Stripe monthly price ID"
            name="stripePriceMonthly"
            defaultValue={plan.stripePriceMonthly ?? ""}
            placeholder="price_…"
            maxLength={120}
            disabled={!canWrite}
          />
          <FormField
            label="Stripe annual price ID"
            name="stripePriceAnnual"
            defaultValue={plan.stripePriceAnnual ?? ""}
            placeholder="price_…"
            maxLength={120}
            disabled={!canWrite}
          />
        </div>

        {canWrite && <SaveRow />}
      </form>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────
   Features tab
   ────────────────────────────────────────────────────────────── */

type PlanFeatureRow = {
  id: string;
  key: string;
  label: string;
  groupLabel: string | null;
  description: string | null;
  valueType: "BOOLEAN" | "NUMBER" | "TEXT";
  enforcement: "GATE" | "MARKETING_ONLY";
  sortOrder: number;
  groupSortOrder: number;
};

type PlanFeatureValueRow = {
  id: string;
  planId: string;
  featureId: string;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
  footnote: string | null;
  highlight: boolean;
};

function FeaturesTab({
  plan,
  features,
  valueByFeature,
  canWrite,
}: {
  plan: { id: string };
  features: PlanFeatureRow[];
  valueByFeature: Map<string, PlanFeatureValueRow>;
  canWrite: boolean;
}) {
  // Group features by groupLabel in the order we fetched them (already
  // sorted by groupSortOrder then sortOrder). Use a Map so the first
  // seen group wins insertion order.
  const groups = new Map<string, PlanFeatureRow[]>();
  for (const f of features) {
    const key = f.groupLabel ?? "Other";
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  if (features.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Features"
          description="No feature library defined yet."
        />
        <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Run the pricing seed script to populate the feature library, or add features via the Prisma
          console (admin UI for this comes in M4).
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Features"
        description="Per-feature value for this plan. Boolean = checkbox; numeric = cap (-1 means unlimited); text = free-form label. Highlight flags the cell to render in accent color on /pricing."
      />
      <form action={savePlanFeatures.bind(null, plan.id)} className="px-5 py-5">
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([group, rows]) => (
            <div key={group}>
              <div
                className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                {group}
              </div>
              <div
                className="overflow-hidden rounded-md"
                style={{ border: "1px solid var(--border-subtle)" }}
              >
                <table className="w-full text-sm">
                  <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                    <tr className="text-left">
                      <th className="px-4 py-2 font-normal">Feature</th>
                      <th className="px-4 py-2 font-normal" style={{ width: "220px" }}>Value</th>
                      <th className="px-4 py-2 font-normal" style={{ width: "220px" }}>Footnote</th>
                      <th className="px-4 py-2 font-normal text-center" style={{ width: "80px" }}>
                        Highlight
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => {
                      const v = valueByFeature.get(f.id);
                      return (
                        <tr
                          key={f.id}
                          style={{ borderTop: "1px solid var(--border-subtle)" }}
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium">{f.label}</div>
                            <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                              {f.key}
                              {" · "}
                              {f.valueType.toLowerCase()}
                              {" · "}
                              {f.enforcement === "GATE" ? "gate" : "marketing-only"}
                            </div>
                            {f.description && (
                              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                                {f.description}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <FeatureValueInput feature={f} value={v} disabled={!canWrite} />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <input
                              type="text"
                              name={`feature[${f.id}][footnote]`}
                              defaultValue={v?.footnote ?? ""}
                              maxLength={120}
                              disabled={!canWrite}
                              placeholder={'e.g. "+$12/seat after 15"'}
                              className="w-full rounded-md px-2 py-1 text-xs outline-none"
                              style={{
                                background: "var(--panel)",
                                border: "1px solid var(--border)",
                                color: "var(--text)",
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 align-top text-center">
                            <input
                              type="checkbox"
                              name={`feature[${f.id}][highlight]`}
                              defaultChecked={v?.highlight ?? false}
                              disabled={!canWrite}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {canWrite && (
          <div className="mt-6">
            <SaveRow />
          </div>
        )}
      </form>
    </Card>
  );
}

function FeatureValueInput({
  feature,
  value,
  disabled,
}: {
  feature: PlanFeatureRow;
  value: PlanFeatureValueRow | undefined;
  disabled: boolean;
}) {
  const inputStyle: React.CSSProperties = {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  if (feature.valueType === "BOOLEAN") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name={`feature[${feature.id}][bool]`}
          defaultChecked={value?.valueBool ?? false}
          disabled={disabled}
        />
        <span style={{ color: "var(--text-muted)" }}>Included</span>
      </label>
    );
  }
  if (feature.valueType === "NUMBER") {
    return (
      <input
        type="number"
        name={`feature[${feature.id}][number]`}
        defaultValue={value?.valueNumber == null ? "" : String(value.valueNumber)}
        placeholder="e.g. 5 (or -1 for unlimited)"
        disabled={disabled}
        className="w-full rounded-md px-2 py-1 text-xs outline-none"
        style={inputStyle}
      />
    );
  }
  // TEXT
  return (
    <input
      type="text"
      name={`feature[${feature.id}][text]`}
      defaultValue={value?.valueText ?? ""}
      placeholder={'e.g. "Priority + chat"'}
      maxLength={120}
      disabled={disabled}
      className="w-full rounded-md px-2 py-1 text-xs outline-none"
      style={inputStyle}
    />
  );
}

/* ──────────────────────────────────────────────────────────────
   Add-ons tab
   ────────────────────────────────────────────────────────────── */

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
    <Card>
      <CardHeader
        title="Add-ons"
        description="Optional line items billed alongside the base plan — seat overages, API access, etc. Each add-on is scoped to this plan so copy and pricing can differ per tier."
        right={
          canWrite ? (
            <form action={createPlanAddOn.bind(null, plan.id)}>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                + New add-on
              </button>
            </form>
          ) : null
        }
      />
      {addOns.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No add-ons yet. {canWrite && 'Click "+ New add-on" to create one.'}
        </p>
      ) : (
        <div className="space-y-4 px-5 py-5">
          {addOns.map((a) => (
            <AddOnRow key={a.id} addOn={a} canWrite={canWrite} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AddOnRow({ addOn, canWrite }: { addOn: PlanAddOnRow; canWrite: boolean }) {
  const monthly = addOn.priceMonthly == null ? "" : String(addOn.priceMonthly);
  const annual = addOn.priceAnnual == null ? "" : String(addOn.priceAnnual);

  return (
    <div
      className="rounded-md"
      style={{
        border: "1px solid var(--border-subtle)",
        background: addOn.active ? "var(--panel)" : "var(--surface-2)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium">{addOn.name}</span>
          <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
            {addOn.slug}
          </span>
          {addOn.active ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={{
                background: "var(--success-surface)",
                color: "var(--success-fg)",
                border: "1px solid var(--success-fg)",
              }}
            >
              active
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              inactive
            </span>
          )}
        </div>
        {canWrite && (
          <form action={deletePlanAddOn.bind(null, addOn.id)}>
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{
                background: "var(--danger-surface)",
                color: "var(--danger-fg)",
                border: "1px solid var(--danger-border)",
              }}
            >
              Delete
            </button>
          </form>
        )}
      </div>

      <form action={updatePlanAddOn.bind(null, addOn.id)} className="space-y-4 px-4 py-4">
        <div className="grid gap-3 md:grid-cols-3">
          <FormField
            label="Slug"
            name="slug"
            defaultValue={addOn.slug}
            required
            hint="Unique per plan."
            disabled={!canWrite}
          />
          <FormField
            label="Name"
            name="name"
            defaultValue={addOn.name}
            required
            maxLength={80}
            disabled={!canWrite}
          />
          <FormField
            label="Sort order"
            name="sortOrder"
            type="number"
            defaultValue={String(addOn.sortOrder)}
            hint="Lower = shown first."
            disabled={!canWrite}
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm">Description</span>
          <textarea
            name="description"
            defaultValue={addOn.description ?? ""}
            rows={2}
            maxLength={400}
            disabled={!canWrite}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <FormField
            label="Monthly price"
            name="priceMonthly"
            defaultValue={monthly}
            placeholder="12"
            disabled={!canWrite}
          />
          <FormField
            label="Annual price"
            name="priceAnnual"
            defaultValue={annual}
            placeholder="120"
            disabled={!canWrite}
          />
          <FormField
            label="Unit label"
            name="unitLabel"
            defaultValue={addOn.unitLabel ?? ""}
            placeholder="per seat / mo"
            maxLength={40}
            disabled={!canWrite}
          />
        </div>

        <FormField
          label="Stripe price ID"
          name="stripePriceId"
          defaultValue={addOn.stripePriceId ?? ""}
          placeholder="price_…"
          maxLength={120}
          hint="Optional. Populated manually today; the plan-level “Sync to Stripe” button does not yet cover add-ons."
          disabled={!canWrite}
        />

        <div className="flex items-center justify-between">
          <CheckboxField
            label="Active (visible on /pricing and selectable at checkout)"
            name="active"
            defaultChecked={addOn.active}
            disabled={!canWrite}
          />
          {canWrite && (
            <button
              type="submit"
              className="rounded-md px-4 py-2 text-sm font-medium"
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

/* ──────────────────────────────────────────────────────────────
   Marketing tab
   ────────────────────────────────────────────────────────────── */

function MarketingTab({
  plan,
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
  canWrite: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Marketing surfaces"
        description="Where this plan appears and what copy it carries. Toggles take effect after save — marketing cache is flushed automatically."
      />
      <form action={savePlanMarketing.bind(null, plan.id)} className="space-y-5 px-5 py-5">
        <label className="block">
          <span className="mb-1 block text-sm">Landing copy</span>
          <textarea
            name="landingCopy"
            defaultValue={plan.landingCopy ?? ""}
            rows={3}
            maxLength={400}
            disabled={!canWrite}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
            Short blurb on the home page pricing grid. 400 chars max.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm">Marketing copy (detail page)</span>
          <textarea
            name="marketingCopy"
            defaultValue={plan.marketingCopy ?? ""}
            rows={6}
            maxLength={4000}
            disabled={!canWrite}
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
            Fuller description on /pricing detail. 4,000 chars max.
          </span>
        </label>

        <div className="space-y-2">
          <div className="text-sm font-medium">Show on…</div>
          <CheckboxField
            label="Home page (/) — shown in the 3-up landing grid"
            name="showOnLanding"
            defaultChecked={plan.showOnLanding}
            disabled={!canWrite}
          />
          <CheckboxField
            label="Pricing page (/pricing) — full comparison table"
            name="showOnPricing"
            defaultChecked={plan.showOnPricing}
            disabled={!canWrite}
          />
          <CheckboxField
            label="Signup page (/signup) — selectable tier at checkout"
            name="showOnSignup"
            defaultChecked={plan.showOnSignup}
            disabled={!canWrite}
          />
        </div>

        {canWrite && <SaveRow />}
      </form>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────
   Shared UI bits
   ────────────────────────────────────────────────────────────── */

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
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
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
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}

function SaveRow() {
  return (
    <div className="flex justify-end pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <button
        type="submit"
        className="mt-4 rounded-md px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
      >
        Save changes
      </button>
    </div>
  );
}

function SolidButton({
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
          border: "1px solid var(--danger-border)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-subtle)",
        };
  return (
    <button
      type="submit"
      className="rounded-md px-3 py-2 text-xs font-medium"
      style={style}
    >
      {children}
    </button>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        };
  return (
    <div className="rounded-md px-4 py-3 text-sm" style={style}>
      {children}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    PUBLISHED: {
      background: "var(--success-surface)",
      color: "var(--success-fg)",
      border: "1px solid var(--success-fg)",
    },
    DRAFT: {
      background: "var(--surface-2)",
      color: "var(--text-muted)",
      border: "1px solid var(--border-subtle)",
    },
    HIDDEN: {
      background: "var(--warning-surface)",
      color: "var(--warning-fg)",
      border: "1px solid var(--warning-fg)",
    },
    ARCHIVED: {
      background: "var(--surface-2)",
      color: "var(--text-faint)",
      border: "1px solid var(--border-subtle)",
    },
  };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={styles[status] ?? styles.DRAFT}
    >
      {status.toLowerCase()}
    </span>
  );
}
