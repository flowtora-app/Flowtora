import { db } from "@/lib/db";

async function main() {
  const [
    invoices, payments, refunds, disputes, creditNotes,
    publicPlans, planVersions, evidenceTpls,
  ] = await Promise.all([
    db.platformBillingInvoice.count(),
    db.platformInvoicePayment.count(),
    db.platformPaymentRefund.count(),
    db.platformDispute.count(),
    db.platformCreditNote.count(),
    db.pricingPlan.count(),
    db.planVersion.count(),
    db.chargebackEvidenceTemplate.count(),
  ]);

  console.log("Page 16 — Invoices:", invoices, "rows");
  console.log("Page 17 — InvoicePayments:", payments, "rows");
  console.log("Page 18 — Refunds:", refunds, "rows");
  console.log("Page 18 — Disputes:", disputes, "rows");
  console.log("        — CreditNotes:", creditNotes, "rows");
  console.log("        — EvidenceTemplates:", evidenceTpls, "rows");
  console.log("Page 19 — PricingPlans:", publicPlans, "rows");
  console.log("        — PlanVersions:", planVersions, "rows");

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
