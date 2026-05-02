// Page 23 — seed demo dunning data so the new tabs render real numbers.
//
// Idempotent — checks for sentinel rows before minting:
//   • Default sequence "Default monthly" with 4 stages
//   • DunningConfig singleton pointed at it
//   • A failed PlatformInvoicePayment on one tenant + a queue entry
//   • A second failed-then-recovered scenario for performance metrics

import { db } from "@/lib/db";

async function pickAdminId(): Promise<string> {
  const admin = await db.user.findFirst({
    where: { platformRole: { in: ["SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "BILLING_MANAGER"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No platform admin user found");
  console.log(`  using admin: ${admin.email}`);
  return admin.id;
}

async function seedSequences(adminId: string) {
  console.log("\n── Seeding dunning sequences ──");
  const existing = await db.dunningSequence.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} sequences — skipping.`);
    return await db.dunningSequence.findFirst({ where: { active: true } });
  }
  const seq = await db.dunningSequence.create({
    data: {
      name: "Default monthly",
      description: "Standard 4-stage cadence for monthly subscriptions: reminder → retry → final notice → surrender.",
      planSlug: null,
      smartRetries: false,
      active: true,
      createdById: adminId,
      stages: {
        create: [
          { position: 1, triggerDays: 0, action: "SEND_EMAIL",
            templateKind: "billing.dunning_reminder_1", label: "Friendly reminder",
            notes: "First touch — same day as failure" },
          { position: 2, triggerDays: 3, action: "RETRY_PAYMENT",
            templateKind: null, label: "Auto retry",
            notes: "Retry the same card after 3 days" },
          { position: 3, triggerDays: 7, action: "SEND_EMAIL",
            templateKind: "billing.dunning_final_notice", label: "Final notice",
            notes: "Last chance email before suspension" },
          { position: 4, triggerDays: 14, action: "SURRENDER",
            templateKind: null, label: "Surrender",
            notes: "Mark invoice uncollectible + exit funnel" },
        ],
      },
    },
  });
  console.log(`  ✓ ${seq.name} created with 4 stages`);
  return seq;
}

async function seedConfig(adminId: string, defaultSequenceId: string | null) {
  console.log("\n── Seeding dunning config ──");
  await db.dunningConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultSequenceId,
      maxRetries: 4,
      autoCancelAfterDays: 30,
      ccBillingEmail: true,
      maxRetriesPerDay: 2,
      smartRetriesEnabled: false,
      updatedBy: adminId,
    },
    update: {
      defaultSequenceId,
      updatedBy: adminId,
    },
  });
  console.log("  ✓ config singleton ensured");
}

async function seedFailedPaymentAndEvent(sequenceId: string) {
  console.log("\n── Seeding failed payment + queue entry ──");
  // Find an existing seeded SENT/OPEN invoice we can attach a failed
  // payment to (skip ones that already have a dunning event).
  const invoice = await db.platformBillingInvoice.findFirst({
    where: { status: { in: ["SENT", "OPEN"] }, dunningEvents: { none: {} } },
    select: { id: true, tenantId: true, total: true, number: true },
  });
  if (!invoice) {
    console.log("  No eligible invoice — skipping queue seed.");
    return;
  }
  const day = 86_400_000;
  const failed = await db.platformInvoicePayment.create({
    data: {
      invoiceId: invoice.id,
      gateway: "stripe",
      gatewayPaymentId: `pi_demo_failed_${invoice.id.slice(0, 10)}`,
      status: "failed",
      method: "Visa •• 4000 (insufficient_funds)",
      amount: invoice.total,
      failureCode: "insufficient_funds",
      failureReason: "Your card has insufficient funds.",
      attemptedAt: new Date(Date.now() - 2 * day),
    },
  });
  await db.dunningEvent.create({
    data: {
      paymentId: failed.id,
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      sequenceId,
      currentStage: 1, // already on the auto-retry stage
      nextActionAt: new Date(Date.now() + 1 * day), // due tomorrow
      lastActionAt: new Date(Date.now() - 2 * day),
      retriesAttempted: 0,
      lastOutcome: "Initial fail — reminder email sent",
      status: "IN_PROGRESS",
    },
  });
  console.log(`  ✓ failed payment + IN_PROGRESS queue entry on ${invoice.number}`);
}

async function seedRecoveredScenario() {
  console.log("\n── Seeding recovered failed-then-paid scenario ──");
  // For real recovery metrics, mint a failed payment + a later succeeded
  // payment on the same invoice. Use one of the PAID invoices.
  const paidInvoice = await db.platformBillingInvoice.findFirst({
    where: { status: "PAID", number: "PI-1001" },
    select: { id: true, total: true, number: true },
  });
  if (!paidInvoice) {
    console.log("  PI-1001 not found — skipping.");
    return;
  }
  // Avoid duplicates
  const existingFailed = await db.platformInvoicePayment.findFirst({
    where: { invoiceId: paidInvoice.id, status: "failed" },
    select: { id: true },
  });
  if (existingFailed) {
    console.log("  Already has a failed-then-recovered scenario — skipping.");
    return;
  }
  const day = 86_400_000;
  await db.platformInvoicePayment.create({
    data: {
      invoiceId: paidInvoice.id,
      gateway: "stripe",
      gatewayPaymentId: `pi_demo_failed_recover_${paidInvoice.id.slice(0, 10)}`,
      status: "failed",
      method: "Visa •• 4242 (card_declined)",
      amount: paidInvoice.total,
      failureCode: "card_declined",
      failureReason: "Your card was declined.",
      attemptedAt: new Date(Date.now() - 16 * day),
    },
  });
  console.log(`  ✓ failed attempt added 16d ago on ${paidInvoice.number} (then recovered 2d ago)`);
}

async function summary() {
  const [seqCount, configRow, eventCount, failedCount] = await Promise.all([
    db.dunningSequence.count(),
    db.dunningConfig.findUnique({ where: { id: "default" } }),
    db.dunningEvent.count(),
    db.platformInvoicePayment.count({ where: { status: "failed" } }),
  ]);
  console.log("\n── Summary ──");
  console.log(`  sequences: ${seqCount}`);
  console.log(`  config: ${configRow ? "set" : "missing"} (default seq=${configRow?.defaultSequenceId ?? "—"})`);
  console.log(`  queue entries: ${eventCount}, failed payments total: ${failedCount}`);
}

async function main() {
  const adminId = await pickAdminId();
  const seq = await seedSequences(adminId);
  await seedConfig(adminId, seq?.id ?? null);
  if (seq) {
    await seedFailedPaymentAndEvent(seq.id);
  }
  await seedRecoveredScenario();
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
