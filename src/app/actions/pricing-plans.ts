"use server";

// M3 — pricing plan admin actions used from /platform/plans.
//
// Every mutation is gated by `requirePlatformAdmin` (SUPER_ADMIN or
// SITE_MANAGER). Support agents can read the plan list; their submit
// redirects back with ?error=forbidden via the guard.
//
// After any mutation we bust the `pricing:published` / `pricing:all`
// cache tags so the marketing pages + admin list re-fetch, and
// revalidate the public paths so Next's static cache doesn't serve
// stale marketing copy.
//
// Audit trail: every write logs under `platform.plan_*` with
// tenantId=null (plans are platform-scoped, not tenant-scoped).

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin, logPlatformAudit } from "@/lib/platform";
import { PRICING_CACHE_TAGS } from "@/lib/plans";

// After any plan write: flush both caches + both public pages. Cheap
// enough to do eagerly; the alternative (flushing only on publish) led
// to confusion during testing ("why isn't my edit showing up?").
function flushPricingCaches() {
  revalidateTag(PRICING_CACHE_TAGS.published);
  revalidateTag(PRICING_CACHE_TAGS.all);
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/platform/plans");
}

// Slug rules: lowercase, hyphens, digits only. Matches what marketing
// URLs can carry in `/signup?plan=<slug>` without URL-encoding.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─────────────────────────────────────────────────────────────
// Create a new DRAFT plan.
//
// Picks a placeholder slug ("new-plan-N") so the row exists and can
// be edited without blocking the admin on a name decision. Redirects
// straight to the editor.
// ─────────────────────────────────────────────────────────────

export async function createPricingPlan() {
  const ctx = await requirePlatformAdmin();

  // Pick a unique placeholder slug — bump a counter if the default
  // already exists. Capped at 50 attempts to prevent runaway loops
  // if something goes weird.
  let slug = "new-plan";
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? slug : `${slug}-${i}`;
    const exists = await db.pricingPlan.findUnique({ where: { slug: trial }, select: { id: true } });
    if (!exists) {
      slug = trial;
      break;
    }
  }

  const plan = await db.pricingPlan.create({
    data: {
      slug,
      name: "Untitled plan",
      subtitle: "Edit me — this plan was just created.",
      status: "DRAFT",
      sortOrder: 100,
      currency: "USD",
      isContactSales: false,
      // Default visibility off until admin publishes — keeps
      // unfinished drafts from leaking into marketing pages if the
      // status is later toggled to PUBLISHED without review.
      showOnLanding: false,
      showOnPricing: false,
      showOnSignup: false,
    },
    select: { id: true },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_created",
    entityType: "PricingPlan",
    entityId: plan.id,
    metadata: { slug, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${plan.id}`);
}

// ─────────────────────────────────────────────────────────────
// Details tab — identity + copy + CTA + sort/highlight.
// ─────────────────────────────────────────────────────────────

const detailsSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(SLUG_RE, "Slug must be lowercase letters, digits, and hyphens."),
  name: z.string().min(1).max(80),
  subtitle: z.string().max(200).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  badge: z.string().max(40).optional().or(z.literal("")),
  highlight: z.union([z.literal("on"), z.literal("")]).optional(),
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
  ctaLabel: z.string().max(40).optional().or(z.literal("")),
  ctaHref: z.string().max(300).optional().or(z.literal("")),
});

export async function savePlanDetails(planId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = detailsSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/plans/${planId}?tab=details&error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, slug: true },
  });
  if (!existing) {
    redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);
  }

  // Slug collision check — allow keeping your own slug, reject only
  // collisions with *other* rows.
  if (parsed.data.slug !== existing.slug) {
    const taken = await db.pricingPlan.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true },
    });
    if (taken && taken.id !== planId) {
      redirect(
        `/platform/plans/${planId}?tab=details&error=${encodeURIComponent("Slug already in use.")}`,
      );
    }
  }

  await db.pricingPlan.update({
    where: { id: planId },
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      subtitle: parsed.data.subtitle || null,
      description: parsed.data.description || null,
      badge: parsed.data.badge || null,
      highlight: parsed.data.highlight === "on",
      sortOrder: parsed.data.sortOrder,
      trialDays: parsed.data.trialDays ?? null,
      ctaLabel: parsed.data.ctaLabel || null,
      ctaHref: parsed.data.ctaHref || null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_details_updated",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { slug: parsed.data.slug, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=details&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Pricing tab — numeric price + Stripe linkage.
//
// Decimals arrive as strings from HTML inputs; Zod coerce works for
// simple numbers. Prisma accepts `Decimal | number | string` so we
// pass the string through unchanged to avoid float-drift.
// ─────────────────────────────────────────────────────────────

const priceStrSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Use dollars.cents, e.g. 79 or 79.50")
  .optional()
  .or(z.literal(""));

const pricingSchema = z.object({
  priceMonthly: priceStrSchema,
  priceAnnual: priceStrSchema,
  currency: z.string().length(3).toUpperCase().default("USD"),
  isContactSales: z.union([z.literal("on"), z.literal("")]).optional(),
  stripeProductId: z.string().max(120).optional().or(z.literal("")),
  stripePriceMonthly: z.string().max(120).optional().or(z.literal("")),
  stripePriceAnnual: z.string().max(120).optional().or(z.literal("")),
});

export async function savePlanPricing(planId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/plans/${planId}?tab=pricing&error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.pricingPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!existing) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  await db.pricingPlan.update({
    where: { id: planId },
    data: {
      priceMonthly: parsed.data.priceMonthly ? parsed.data.priceMonthly : null,
      priceAnnual: parsed.data.priceAnnual ? parsed.data.priceAnnual : null,
      currency: parsed.data.currency || "USD",
      isContactSales: parsed.data.isContactSales === "on",
      stripeProductId: parsed.data.stripeProductId || null,
      stripePriceMonthly: parsed.data.stripePriceMonthly || null,
      stripePriceAnnual: parsed.data.stripePriceAnnual || null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_pricing_updated",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: {
      priceMonthly: parsed.data.priceMonthly || null,
      priceAnnual: parsed.data.priceAnnual || null,
      actor: ctx.email,
    },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=pricing&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Features tab — bulk upsert of PlanFeatureValue cells.
//
// The form submits ALL feature values in one go. For each feature we
// expect three named inputs:
//   feature[<featureId>][bool]   — "on" | "" (or missing)
//   feature[<featureId>][number] — numeric string or ""
//   feature[<featureId>][text]   — string or ""
//   feature[<featureId>][footnote] — string or ""
//   feature[<featureId>][highlight] — "on" | ""
//
// We look up the feature by id to know its valueType and only write
// the field that matches. Other fields come along as null so a mode
// change on the feature doesn't strand stale data.
// ─────────────────────────────────────────────────────────────

export async function savePlanFeatures(planId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();

  const plan = await db.pricingPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  const features = await db.planFeature.findMany({
    select: { id: true, valueType: true },
  });

  // Walk every feature and compute the target cell. Batch into a
  // single transaction so a partial save doesn't leave the matrix
  // half-updated.
  const ops = features.map((f) => {
    const boolRaw = formData.get(`feature[${f.id}][bool]`);
    const numberRaw = formData.get(`feature[${f.id}][number]`);
    const textRaw = formData.get(`feature[${f.id}][text]`);
    const footnoteRaw = formData.get(`feature[${f.id}][footnote]`);
    const highlightRaw = formData.get(`feature[${f.id}][highlight]`);

    let valueBool: boolean | null = null;
    let valueNumber: number | null = null;
    let valueText: string | null = null;

    if (f.valueType === "BOOLEAN") {
      valueBool = boolRaw === "on";
    } else if (f.valueType === "NUMBER") {
      const s = typeof numberRaw === "string" ? numberRaw.trim() : "";
      if (s !== "") {
        const n = Number(s);
        if (Number.isFinite(n)) valueNumber = Math.trunc(n);
      }
    } else if (f.valueType === "TEXT") {
      const s = typeof textRaw === "string" ? textRaw.trim() : "";
      if (s) valueText = s;
    }

    const footnote = typeof footnoteRaw === "string" && footnoteRaw.trim()
      ? footnoteRaw.trim().slice(0, 120)
      : null;
    const highlight = highlightRaw === "on";

    return db.planFeatureValue.upsert({
      where: { planId_featureId: { planId, featureId: f.id } },
      create: {
        planId,
        featureId: f.id,
        valueBool,
        valueNumber,
        valueText,
        footnote,
        highlight,
      },
      update: {
        valueBool,
        valueNumber,
        valueText,
        footnote,
        highlight,
      },
    });
  });

  await db.$transaction(ops);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_features_updated",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { count: features.length, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=features&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Marketing tab — copy + visibility toggles.
// ─────────────────────────────────────────────────────────────

const marketingSchema = z.object({
  landingCopy: z.string().max(400).optional().or(z.literal("")),
  marketingCopy: z.string().max(4000).optional().or(z.literal("")),
  showOnLanding: z.union([z.literal("on"), z.literal("")]).optional(),
  showOnPricing: z.union([z.literal("on"), z.literal("")]).optional(),
  showOnSignup: z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function savePlanMarketing(planId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = marketingSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/plans/${planId}?tab=marketing&error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.pricingPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!existing) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  await db.pricingPlan.update({
    where: { id: planId },
    data: {
      landingCopy: parsed.data.landingCopy || null,
      marketingCopy: parsed.data.marketingCopy || null,
      showOnLanding: parsed.data.showOnLanding === "on",
      showOnPricing: parsed.data.showOnPricing === "on",
      showOnSignup: parsed.data.showOnSignup === "on",
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_marketing_updated",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=marketing&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Publish / unpublish / archive.
//
// Publish also takes a version snapshot (PlanVersion row) so we have
// rollback history. The snapshot shape is loose Json — the M4 history
// viewer will know how to walk it; M3 just needs the row written.
// ─────────────────────────────────────────────────────────────

export async function publishPlan(planId: string) {
  const ctx = await requirePlatformAdmin();

  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    include: { featureValues: { include: { feature: true } }, addOns: true },
  });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  // Minimal sanity: contact-sales plans don't need prices, everyone
  // else does. Reject rather than silently publishing a tier with
  // undefined price (which would render as "$0 /mo" to prospects).
  if (!plan.isContactSales && plan.priceMonthly == null) {
    redirect(
      `/platform/plans/${planId}?tab=pricing&error=${encodeURIComponent(
        "Set a monthly price or mark this plan as contact-sales before publishing.",
      )}`,
    );
  }

  // Version snapshot. Stored as loose Json so the shape can evolve
  // without migration churn; the viewer in M4 will know the fields
  // at play when the snapshot was written.
  const latestVersion = await db.planVersion.findFirst({
    where: { planId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const snapshot = {
    plan: {
      ...plan,
      // Decimals don't round-trip through JSON cleanly — stringify
      // them here so the snapshot is readable/restorable later.
      priceMonthly: plan.priceMonthly == null ? null : plan.priceMonthly.toString(),
      priceAnnual: plan.priceAnnual == null ? null : plan.priceAnnual.toString(),
    },
    featureValues: plan.featureValues.map((fv) => ({
      ...fv,
      feature: fv.feature,
    })),
    addOns: plan.addOns.map((a) => ({
      ...a,
      priceMonthly: a.priceMonthly == null ? null : a.priceMonthly.toString(),
      priceAnnual: a.priceAnnual == null ? null : a.priceAnnual.toString(),
    })),
  };

  await db.$transaction([
    db.pricingPlan.update({
      where: { id: planId },
      data: {
        status: "PUBLISHED",
        publishedAt: plan.publishedAt ?? new Date(),
      },
    }),
    db.planVersion.create({
      data: {
        planId,
        version: nextVersion,
        snapshot: snapshot as never,
        publishedByUserId: ctx.userId,
      },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_published",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { slug: plan.slug, version: nextVersion, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?ok=1&published=1`);
}

export async function unpublishPlan(planId: string) {
  const ctx = await requirePlatformAdmin();
  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, slug: true, status: true },
  });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  // HIDDEN is the right landing pad: tenants already on the plan
  // keep working (the FK doesn't care about status), but new signups
  // don't see the row in /signup or /pricing.
  await db.pricingPlan.update({
    where: { id: planId },
    data: { status: "HIDDEN" },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_unpublished",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { slug: plan.slug, from: plan.status, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?ok=1`);
}

export async function archivePlan(planId: string) {
  const ctx = await requirePlatformAdmin();
  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, slug: true, _count: { select: { tenants: true } } },
  });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  if (plan._count.tenants > 0) {
    redirect(
      `/platform/plans/${planId}?error=${encodeURIComponent(
        `Can't archive — ${plan._count.tenants} tenant(s) still on this plan. Move them first.`,
      )}`,
    );
  }

  await db.pricingPlan.update({
    where: { id: planId },
    data: { status: "ARCHIVED" },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_archived",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { slug: plan.slug, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans?ok=archived`);
}

// ─────────────────────────────────────────────────────────────
// Rollback — restore a previously-published snapshot onto the live
// plan row. Snapshots the CURRENT state first (so "before rollback"
// is captured as a new version), then replays the target version.
//
// Scope: restores plan scalar fields + featureValues. AddOns are
// intentionally left alone — the PlanAddOn admin UI comes in M5 and
// until then a rollback that stomped add-ons would be surprising.
// ─────────────────────────────────────────────────────────────

export async function rollbackPlan(planId: string, version: number) {
  const ctx = await requirePlatformAdmin();

  const [plan, target] = await Promise.all([
    db.pricingPlan.findUnique({
      where: { id: planId },
      include: { featureValues: true, addOns: true },
    }),
    db.planVersion.findUnique({
      where: { planId_version: { planId, version } },
    }),
  ]);
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);
  if (!target) {
    redirect(
      `/platform/plans/${planId}/versions?error=${encodeURIComponent(
        `Version ${version} not found.`,
      )}`,
    );
  }

  // Snapshot the current state before we overwrite it — symmetric
  // with publishPlan so the version log stays linear and "restore
  // the pre-rollback state" is always one click away.
  const latestVersion = await db.planVersion.findFirst({
    where: { planId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const preSnapshot = {
    plan: {
      ...plan,
      priceMonthly: plan.priceMonthly == null ? null : plan.priceMonthly.toString(),
      priceAnnual: plan.priceAnnual == null ? null : plan.priceAnnual.toString(),
    },
    featureValues: plan.featureValues,
    addOns: plan.addOns.map((a) => ({
      ...a,
      priceMonthly: a.priceMonthly == null ? null : a.priceMonthly.toString(),
      priceAnnual: a.priceAnnual == null ? null : a.priceAnnual.toString(),
    })),
  };

  // Read the target snapshot. Shape matches what publishPlan wrote —
  // if the shape ever changes we'll need a migration here, but Json
  // tolerates the extra fields.
  const snap = target.snapshot as unknown as {
    plan: Record<string, unknown>;
    featureValues: Array<{
      featureId: string;
      valueBool: boolean | null;
      valueNumber: number | null;
      valueText: string | null;
      footnote: string | null;
      highlight: boolean;
    }>;
  };

  // Scalar plan fields we're willing to restore. Omit id / timestamps
  // (Prisma-managed) and tenant/relation fields. Slug is restored —
  // a rollback that kept a renamed slug would quietly desync marketing
  // URLs from the historical state the admin asked for.
  const planFields = snap.plan;
  const planUpdate: Parameters<typeof db.pricingPlan.update>[0]["data"] = {
    slug: planFields.slug as string,
    name: planFields.name as string,
    subtitle: (planFields.subtitle as string | null) ?? null,
    description: (planFields.description as string | null) ?? null,
    badge: (planFields.badge as string | null) ?? null,
    status: planFields.status as "PUBLISHED" | "DRAFT" | "HIDDEN" | "ARCHIVED",
    highlight: Boolean(planFields.highlight),
    sortOrder: Number(planFields.sortOrder ?? 0),
    priceMonthly: planFields.priceMonthly == null ? null : (planFields.priceMonthly as string),
    priceAnnual: planFields.priceAnnual == null ? null : (planFields.priceAnnual as string),
    currency: (planFields.currency as string) ?? "USD",
    isContactSales: Boolean(planFields.isContactSales),
    trialDays: planFields.trialDays == null ? null : Number(planFields.trialDays),
    ctaLabel: (planFields.ctaLabel as string | null) ?? null,
    ctaHref: (planFields.ctaHref as string | null) ?? null,
    landingCopy: (planFields.landingCopy as string | null) ?? null,
    marketingCopy: (planFields.marketingCopy as string | null) ?? null,
    showOnLanding: Boolean(planFields.showOnLanding),
    showOnPricing: Boolean(planFields.showOnPricing),
    showOnSignup: Boolean(planFields.showOnSignup),
    stripeProductId: (planFields.stripeProductId as string | null) ?? null,
    stripePriceMonthly: (planFields.stripePriceMonthly as string | null) ?? null,
    stripePriceAnnual: (planFields.stripePriceAnnual as string | null) ?? null,
  };

  // Defensive filter: snapshot rows whose featureId no longer exists
  // would FK-error on createMany. Silently drop them instead of
  // failing the whole rollback — that feature was deleted post-snapshot
  // and there's nothing we can do about it.
  const liveFeatureIds = new Set(
    (
      await db.planFeature.findMany({
        where: { id: { in: snap.featureValues.map((fv) => fv.featureId) } },
        select: { id: true },
      })
    ).map((f) => f.id),
  );
  const restorableFeatureValues = snap.featureValues
    .filter((fv) => liveFeatureIds.has(fv.featureId))
    .map((fv) => ({
      planId,
      featureId: fv.featureId,
      valueBool: fv.valueBool,
      valueNumber: fv.valueNumber,
      valueText: fv.valueText,
      footnote: fv.footnote,
      highlight: fv.highlight ?? false,
    }));

  // Single transaction: log pre-rollback version, overwrite plan,
  // replace feature cells. If any step fails we leave the DB untouched.
  await db.$transaction([
    db.planVersion.create({
      data: {
        planId,
        version: nextVersion,
        snapshot: preSnapshot as never,
        publishedByUserId: ctx.userId,
        note: `Pre-rollback snapshot (rolling back to v${version})`,
      },
    }),
    db.pricingPlan.update({ where: { id: planId }, data: planUpdate }),
    db.planFeatureValue.deleteMany({ where: { planId } }),
    db.planFeatureValue.createMany({
      data: restorableFeatureValues,
      skipDuplicates: true,
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_rolled_back",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { toVersion: version, preVersion: nextVersion, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?ok=1`);
}

// Hard-delete. Only allowed for rows that have never been published
// (DRAFT status + no tenants + no versions). Anything else goes
// through archive, which preserves history.
export async function deletePlan(planId: string) {
  const ctx = await requirePlatformAdmin();

  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      slug: true,
      status: true,
      _count: { select: { tenants: true, versions: true, overrides: true } },
    },
  });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  if (plan.status !== "DRAFT") {
    redirect(
      `/platform/plans/${planId}?error=${encodeURIComponent(
        "Can't delete a plan that's been published. Archive it instead.",
      )}`,
    );
  }
  if (plan._count.tenants > 0 || plan._count.versions > 0 || plan._count.overrides > 0) {
    redirect(
      `/platform/plans/${planId}?error=${encodeURIComponent(
        "Can't delete — plan has history or active tenants. Archive instead.",
      )}`,
    );
  }

  await db.pricingPlan.delete({ where: { id: planId } });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_deleted",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { slug: plan.slug, actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans?ok=deleted`);
}

// ─────────────────────────────────────────────────────────────
// Page 19 — Lifecycle & tax tab.
//
// Trial settings, migration rules (upgrade/downgrade behavior +
// default cycle), tax behavior (inclusive/exclusive + Stripe Tax
// code). All saved as one batch since the editor groups them.
// ─────────────────────────────────────────────────────────────

const lifecycleSchema = z.object({
  trialDays: z.coerce.number().int().min(0).max(365).optional(),
  trialRequiresCard: z.union([z.literal("on"), z.literal("")]).optional(),
  trialCtaLabel: z.string().max(80).optional().or(z.literal("")),
  migrationOnUpgrade: z.enum(["PRORATE_IMMEDIATE", "END_OF_PERIOD"]).default("PRORATE_IMMEDIATE"),
  migrationOnDowngrade: z.enum(["END_OF_PERIOD", "PRORATE_REFUND"]).default("END_OF_PERIOD"),
  defaultCycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
  taxBehavior: z.enum(["EXCLUSIVE", "INCLUSIVE"]).default("EXCLUSIVE"),
  taxCode: z.string().max(80).optional().or(z.literal("")),
});

export async function savePlanLifecycle(planId: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();
  const raw = Object.fromEntries(formData.entries());
  const parsed = lifecycleSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/platform/plans/${planId}?tab=lifecycle&error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.pricingPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!existing) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  await db.pricingPlan.update({
    where: { id: planId },
    data: {
      trialDays: parsed.data.trialDays ?? null,
      trialRequiresCard: parsed.data.trialRequiresCard === "on",
      trialCtaLabel: parsed.data.trialCtaLabel || null,
      migrationOnUpgrade: parsed.data.migrationOnUpgrade,
      migrationOnDowngrade: parsed.data.migrationOnDowngrade,
      defaultCycle: parsed.data.defaultCycle,
      taxBehavior: parsed.data.taxBehavior,
      taxCode: parsed.data.taxCode || null,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_lifecycle_updated",
    entityType: "PricingPlan",
    entityId: planId,
    metadata: { actor: ctx.email },
  });

  flushPricingCaches();
  redirect(`/platform/plans/${planId}?tab=lifecycle&ok=1`);
}

// ─────────────────────────────────────────────────────────────
// Page 19 — reorder. Plans render in `sortOrder` ascending on the
// public pricing page. Admin can bump a plan up or down; we swap
// `sortOrder` with the neighbor in the same status bucket so the
// list stays compact (no gaps).
// ─────────────────────────────────────────────────────────────

export async function movePlan(planId: string, direction: "up" | "down") {
  const ctx = await requirePlatformAdmin();

  const plan = await db.pricingPlan.findUnique({
    where: { id: planId },
    select: { id: true, status: true, sortOrder: true, slug: true },
  });
  if (!plan) redirect(`/platform/plans?error=${encodeURIComponent("Plan not found")}`);

  // Find the neighbor in the same status bucket.
  const neighbor = await db.pricingPlan.findFirst({
    where: {
      status: plan.status,
      id: { not: plan.id },
      sortOrder: direction === "up"
        ? { lt: plan.sortOrder }
        : { gt: plan.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbor) redirect(`/platform/plans?ok=no-move`);

  // Swap sort orders. If both happen to be the same number (rare but
  // possible after manual edits), bump the neighbor by one and use it
  // as the new sortOrder so they don't tie.
  const newSelf = neighbor.sortOrder;
  const newNeighbor = newSelf === plan.sortOrder
    ? newSelf + (direction === "up" ? 1 : -1)
    : plan.sortOrder;

  await db.$transaction([
    db.pricingPlan.update({ where: { id: plan.id },     data: { sortOrder: newSelf } }),
    db.pricingPlan.update({ where: { id: neighbor.id }, data: { sortOrder: newNeighbor } }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.plan_reordered",
    entityType: "PricingPlan",
    entityId: plan.id,
    metadata: { actor: ctx.email, direction, slug: plan.slug },
  });

  flushPricingCaches();
  redirect(`/platform/plans?ok=reordered`);
}

export async function movePlanUp(planId: string)   { return movePlan(planId, "up"); }
export async function movePlanDown(planId: string) { return movePlan(planId, "down"); }
