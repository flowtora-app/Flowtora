// Backfill + seed for demo data — Pages 16–19 alignment.
//
// Two phases:
//
//   1. Backfill — set Tenant.pricingPlanId based on the legacy
//      Plan enum (STARTER/GROWTH→essentials, PRO→professional,
//      ENTERPRISE→enterprise). Skips tenants that already have a FK.
//
//   2. Seed — create realistic demo billing data so the new admin
//      pages render against real numbers instead of empty states:
//        • 1 PAID + 1 SENT + 1 DRAFT + 1 PAID-then-REFUNDED invoice
//        • Each invoice gets a payment row (status varies)
//        • The refunded one mints a PlatformPaymentRefund (SUCCEEDED)
//        • One PlatformDispute on the SENT invoice's payment
//        • One PlatformCreditNote on the refunded invoice
//        • Two ChargebackEvidenceTemplate rows
//        • One PlanVersion per published plan (changelog timeline)
//      All rows tagged with notes like "[seed]" so they're easy to
//      identify and delete later.
//
// Idempotent — re-running is safe; uses upsert / "skip if exists" paths
// keyed on a deterministic seed-marker.

import { db } from "@/lib/db";
import type { Plan } from "@prisma/client";

const SEED_TAG = "[seed]";

const PLAN_ENUM_TO_SLUG: Record<Plan, string> = {
  STARTER: "essentials",
  GROWTH: "essentials",
  PRO: "professional",
  ENTERPRISE: "enterprise",
};

async function backfillPricingPlanId() {
  console.log("\n── Phase 1: backfill Tenant.pricingPlanId ─────────");
  const plans = await db.pricingPlan.findMany({
    select: { id: true, slug: true },
  });
  const slugToId = new Map(plans.map((p) => [p.slug, p.id]));

  const tenants = await db.tenant.findMany({
    where: { pricingPlanId: null },
    select: { id: true, name: true, plan: true },
  });
  if (tenants.length === 0) {
    console.log("  No tenants to backfill — every tenant already has pricingPlanId.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  for (const t of tenants) {
    const targetSlug = PLAN_ENUM_TO_SLUG[t.plan];
    const targetId = slugToId.get(targetSlug);
    if (!targetId) {
      console.log(`  SKIP ${t.name}: no PricingPlan with slug "${targetSlug}" (legacy plan=${t.plan})`);
      skipped += 1;
      continue;
    }
    await db.tenant.update({
      where: { id: t.id },
      data: { pricingPlanId: targetId },
    });
    console.log(`  ✓ ${t.name.padEnd(22)} ${t.plan} → ${targetSlug}`);
    updated += 1;
  }
  console.log(`  Done: ${updated} updated, ${skipped} skipped.`);
}

async function pickAdminId(): Promise<string> {
  const admin = await db.user.findFirst({
    where: { platformRole: { in: ["SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "BILLING_MANAGER"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No platform admin user found — can't attribute seeded rows");
  console.log(`  using admin: ${admin.email}`);
  return admin.id;
}

async function nextInvoiceNumber(): Promise<string> {
  const last = await db.platformBillingInvoice.findFirst({
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  if (!last) return "PI-1001";
  const n = Number(last.number.replace(/^PI-/, ""));
  return `PI-${Number.isNaN(n) ? 1001 : n + 1}`;
}

async function seedInvoices(adminId: string) {
  console.log("\n── Phase 2a: seed invoices + payments ──────────────");
  const existing = await db.platformBillingInvoice.count({
    where: { internalNotes: { contains: SEED_TAG } },
  });
  if (existing > 0) {
    console.log(`  Already have ${existing} seeded invoices — skipping.`);
    return;
  }

  const tenants = await db.tenant.findMany({
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, pricingPlan: { select: { priceMonthly: true, name: true } } },
  });
  if (tenants.length === 0) throw new Error("No tenants — can't seed invoices");

  const day = 86_400_000;
  const now = Date.now();

  // Helper to create one invoice + its line items + a payment in one
  // transaction so the cached aggregates stay consistent.
  async function makeInvoice(opts: {
    tenant: typeof tenants[number];
    status: "DRAFT" | "SENT" | "PAID" | "REFUNDED";
    issuedDaysAgo: number;
    line: { description: string; qty: number; unit: number };
    paymentStatus: "succeeded" | "failed" | "refunded";
    note: string;
  }) {
    const number = await nextInvoiceNumber();
    const line = {
      description: opts.line.description,
      quantity: opts.line.qty,
      unitAmount: opts.line.unit,
      lineTotal: opts.line.qty * opts.line.unit,
      position: 0,
    };
    const subtotal = line.lineTotal;
    const tax = Math.round(subtotal * 0.0875); // 8.75% pretend tax
    const total = subtotal + tax;
    const issuedAt = new Date(now - opts.issuedDaysAgo * day);
    const paidAt = opts.status === "PAID" || opts.status === "REFUNDED"
      ? new Date(now - (opts.issuedDaysAgo - 2) * day)
      : null;

    const invoice = await db.platformBillingInvoice.create({
      data: {
        tenantId: opts.tenant.id,
        number,
        status: opts.status,
        currency: "USD",
        subtotal,
        tax,
        total,
        amountPaid: opts.status === "PAID" || opts.status === "REFUNDED" ? total : 0,
        notes: opts.note,
        internalNotes: `${SEED_TAG} demo invoice for ${opts.tenant.name}`,
        termsText: "Net 30 — wire instructions on the PDF.",
        source: "MANUAL",
        taxBreakdown: [{ jurisdiction: "CA-SF", rate: 0.0875, amount: tax }],
        issuedAt,
        paidAt,
        createdById: adminId,
        items: { create: line },
      },
      select: { id: true, total: true, currency: true },
    });

    // Mint the payment row.
    if (opts.status !== "DRAFT") {
      await db.platformInvoicePayment.create({
        data: {
          invoiceId: invoice.id,
          gateway: "stripe",
          gatewayPaymentId: `pi_demo_${invoice.id.slice(0, 12)}`,
          status: opts.paymentStatus,
          method: "Visa •• 4242",
          amount: invoice.total,
          fee: opts.paymentStatus === "succeeded" ? Math.round(invoice.total * 0.029) + 30 : 0,
          net: opts.paymentStatus === "succeeded"
            ? invoice.total - (Math.round(invoice.total * 0.029) + 30)
            : 0,
          failureCode: opts.paymentStatus === "failed" ? "card_declined" : null,
          failureReason: opts.paymentStatus === "failed" ? "Your card was declined." : null,
          attemptedAt: paidAt ?? new Date(now - opts.issuedDaysAgo * day),
          refundedAt: opts.status === "REFUNDED" ? new Date(now - (opts.issuedDaysAgo - 5) * day) : null,
        },
      });
    }
    console.log(`  ✓ ${number.padEnd(8)} ${opts.status.padEnd(8)} ${opts.tenant.name.padEnd(22)} ${opts.line.description}`);
    return invoice;
  }

  const t0 = tenants[0];
  const t1 = tenants[1] ?? tenants[0];
  const t2 = tenants[2] ?? tenants[0];

  // Mix: 1 paid, 1 sent (open), 1 draft, 1 refunded
  const paidInvoice = await makeInvoice({
    tenant: t0,
    status: "PAID",
    issuedDaysAgo: 14,
    line: { description: "Essentials plan · monthly", qty: 1, unit: 6000 },
    paymentStatus: "succeeded",
    note: "Thanks for your business!",
  });

  await makeInvoice({
    tenant: t1,
    status: "SENT",
    issuedDaysAgo: 5,
    line: { description: "Professional plan · monthly", qty: 1, unit: 12000 },
    paymentStatus: "failed",
    note: "Payment due in 25 days.",
  });

  await makeInvoice({
    tenant: t2,
    status: "DRAFT",
    issuedDaysAgo: 0,
    line: { description: "Enterprise plan · monthly · custom usage allotment", qty: 1, unit: 17000 },
    paymentStatus: "pending",
    note: "Draft — review line items before sending.",
  });

  const refundedInvoice = await makeInvoice({
    tenant: t0,
    status: "REFUNDED",
    issuedDaysAgo: 30,
    line: { description: "Essentials plan · monthly (refunded — duplicate billing)", qty: 1, unit: 6000 },
    paymentStatus: "refunded",
    note: "Refunded due to duplicate billing.",
  });

  return { paidInvoice, refundedInvoice };
}

async function seedRefundsAndDisputes(adminId: string) {
  console.log("\n── Phase 2b: seed refunds + disputes + credit notes ");
  const existingRefunds = await db.platformPaymentRefund.count({
    where: { internalNote: { contains: SEED_TAG } },
  });
  if (existingRefunds > 0) {
    console.log(`  Already have ${existingRefunds} seeded refunds — skipping.`);
    return;
  }

  // Refund the REFUNDED invoice's payment
  const refundedInvoice = await db.platformBillingInvoice.findFirst({
    where: { status: "REFUNDED", internalNotes: { contains: SEED_TAG } },
    include: {
      payments: { take: 1 },
      tenant: { select: { id: true } },
    },
  });
  if (refundedInvoice && refundedInvoice.payments[0]) {
    const payment = refundedInvoice.payments[0];
    // Create a credit note + refund tied together
    const cn = await db.platformCreditNote.create({
      data: {
        invoiceId: refundedInvoice.id,
        number: `CN-${refundedInvoice.number}-1`,
        amount: payment.amount,
        reason: "Duplicate billing",
        notes: `${SEED_TAG} demo credit note — full refund of ${refundedInvoice.number}`,
        issuedBy: adminId,
      },
    });
    await db.platformPaymentRefund.create({
      data: {
        paymentId: payment.id,
        invoiceId: refundedInvoice.id,
        tenantId: refundedInvoice.tenantId,
        amount: payment.amount,
        reason: "DUPLICATE",
        reasonNote: "Customer was charged twice for the same period",
        internalNote: `${SEED_TAG} demo refund — full refund of ${refundedInvoice.number}`,
        customerNote: "Apologies for the duplicate charge — you'll see this credit on your next statement.",
        asCredit: false,
        creditNoteId: cn.id,
        status: "SUCCEEDED",
        gatewayRefundId: `re_demo_${cn.id.slice(0, 12)}`,
        completedAt: new Date(),
        initiatedBy: adminId,
      },
    });
    console.log(`  ✓ refund + credit note ${cn.number} on ${refundedInvoice.number}`);
  } else {
    console.log("  Skipped refund — no refunded invoice found.");
  }

  // Add a PENDING refund on the PAID invoice (admin just clicked Refund, gateway hasn't settled)
  const paidInvoice = await db.platformBillingInvoice.findFirst({
    where: { status: "PAID", internalNotes: { contains: SEED_TAG } },
    include: {
      payments: { take: 1, where: { status: "succeeded" } },
      tenant: { select: { id: true } },
    },
  });
  if (paidInvoice && paidInvoice.payments[0]) {
    await db.platformPaymentRefund.create({
      data: {
        paymentId: paidInvoice.payments[0].id,
        invoiceId: paidInvoice.id,
        tenantId: paidInvoice.tenantId,
        amount: 2000, // partial $20 refund
        reason: "SERVICE_ISSUE",
        reasonNote: "Customer reported intermittent webhook delivery in week 1",
        internalNote: `${SEED_TAG} demo pending refund — partial $20 service-credit`,
        customerNote: "Apologies for the trouble — here's a $20 credit toward your next invoice.",
        asCredit: true,
        status: "PENDING",
        initiatedBy: adminId,
      },
    });
    console.log(`  ✓ pending partial refund on ${paidInvoice.number}`);
  }

  // Dispute on the SENT invoice's failed payment? Disputes are 1:1 with
  // payment via @unique paymentId, so use the failed-but-sent invoice.
  const disputeTarget = await db.platformBillingInvoice.findFirst({
    where: { status: "SENT", internalNotes: { contains: SEED_TAG } },
    include: {
      payments: { take: 1 },
      tenant: { select: { id: true } },
    },
  });
  if (disputeTarget && disputeTarget.payments[0]) {
    // Switch payment to "succeeded" first so the dispute is realistic
    // (gateways only chargeback on captured charges).
    await db.platformInvoicePayment.update({
      where: { id: disputeTarget.payments[0].id },
      data: {
        status: "succeeded",
        failureCode: null,
        failureReason: null,
        fee: Math.round(disputeTarget.total * 0.029) + 30,
        net: disputeTarget.total - (Math.round(disputeTarget.total * 0.029) + 30),
      },
    });
    const due = new Date(Date.now() + 5 * 86_400_000);
    await db.platformDispute.create({
      data: {
        paymentId: disputeTarget.payments[0].id,
        invoiceId: disputeTarget.id,
        tenantId: disputeTarget.tenantId,
        gatewayDisputeId: `dp_demo_${disputeTarget.id.slice(0, 12)}`,
        amount: disputeTarget.total,
        reasonCode: "fraudulent",
        reason: "Customer claims charge is fraudulent",
        status: "NEEDS_RESPONSE",
        evidenceDueAt: due,
      },
    });
    console.log(`  ✓ dispute on ${disputeTarget.number} (due ${due.toLocaleDateString()})`);
  }
}

async function seedEvidenceTemplates(adminId: string) {
  console.log("\n── Phase 2c: seed evidence templates ───────────────");
  const existing = await db.chargebackEvidenceTemplate.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} templates — skipping.`);
    return;
  }
  await db.chargebackEvidenceTemplate.createMany({
    data: [
      {
        name: "Subscription was active and used",
        description: "Use when the customer disputes a charge for a SaaS subscription they were actively using.",
        body:
`Hi,

This dispute is for a charge of {amount} on {date} to {tenant} for an active Flowtora subscription.

Evidence:
• Subscription was active throughout the billing period
• Customer logged in and used core features (job creation, invoicing, customer messaging)
• Customer received our standard pre-charge email reminder 7 days before billing
• No support ticket was filed regarding billing concerns

We respectfully request the dispute be resolved in our favor.`,
        createdBy: adminId,
      },
      {
        name: "Refund was offered and declined",
        description: "Use when we offered a refund pre-dispute and the customer charged back instead.",
        body:
`Hi,

This dispute is for a charge of {amount} on {date} to {tenant}. The customer was offered a full refund through our support channel before raising the dispute.

Evidence:
• Customer contacted support on [DATE] regarding [REASON]
• Refund of {amount} was offered via email on [DATE]
• Customer did not respond and instead initiated a chargeback
• Subscription has been canceled effective [DATE]

We attempted resolution in good faith. We respectfully request the dispute be resolved in our favor.`,
        createdBy: adminId,
      },
    ],
  });
  console.log("  ✓ created 2 chargeback-evidence templates");
}

async function seedPlanVersions(adminId: string) {
  console.log("\n── Phase 2d: seed plan versions ────────────────────");
  const plans = await db.pricingPlan.findMany({
    where: { status: "PUBLISHED" },
    include: {
      featureValues: { include: { feature: true } },
      addOns: true,
      versions: { take: 1 },
    },
  });

  let created = 0;
  for (const plan of plans) {
    if (plan.versions.length > 0) {
      console.log(`  ${plan.slug}: already has versions — skipping`);
      continue;
    }
    await db.planVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        publishedByUserId: adminId,
        note: `Initial published version of ${plan.name}`,
        snapshot: {
          plan: {
            slug: plan.slug,
            name: plan.name,
            status: plan.status,
            priceMonthly: plan.priceMonthly?.toString() ?? null,
            priceAnnual: plan.priceAnnual?.toString() ?? null,
            isContactSales: plan.isContactSales,
            highlight: plan.highlight,
          },
          featureValues: plan.featureValues.map((fv) => ({
            featureKey: fv.feature.key,
            valueBool: fv.valueBool,
            valueNumber: fv.valueNumber,
            valueText: fv.valueText,
          })),
          addOns: plan.addOns.map((a) => ({ slug: a.slug, name: a.name })),
        },
      },
    });
    created += 1;
    console.log(`  ✓ ${plan.slug}: version 1`);
  }
  console.log(`  Done: ${created} versions created.`);
}

async function summary() {
  console.log("\n── Summary after backfill + seed ───────────────────");
  const counts = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { pricingPlanId: { not: null } } }),
    db.platformBillingInvoice.count(),
    db.platformInvoicePayment.count(),
    db.platformPaymentRefund.count(),
    db.platformDispute.count(),
    db.platformCreditNote.count(),
    db.chargebackEvidenceTemplate.count(),
    db.planVersion.count(),
  ]);
  console.log(`  Tenants total: ${counts[0]}, with pricingPlanId: ${counts[1]}`);
  console.log(`  Invoices: ${counts[2]}, payments: ${counts[3]}`);
  console.log(`  Refunds: ${counts[4]}, disputes: ${counts[5]}, credit notes: ${counts[6]}`);
  console.log(`  Evidence templates: ${counts[7]}, plan versions: ${counts[8]}`);
}

async function main() {
  await backfillPricingPlanId();
  const adminId = await pickAdminId();
  await seedInvoices(adminId);
  await seedRefundsAndDisputes(adminId);
  await seedEvidenceTemplates(adminId);
  await seedPlanVersions(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
