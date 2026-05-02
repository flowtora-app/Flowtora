// Page 21 — seed demo tax data so the new tabs render real numbers.
//
// Idempotent: checks marker rows before minting.
//   • Tax config: upsert "default" row with EXCLUSIVE behavior + EU
//     reverse-charge on
//   • Tax rates: 4 jurisdictions (US-CA, US-NY, GB, AU)
//   • Tax exemptions: 1 tenant gets a verified RESALE exemption,
//     1 tenant gets an unverified REVERSE_CHARGE
//   • Tax filings: 3 filings (1 draft due soon, 1 submitted, 1 accepted)

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

async function seedConfig(adminId: string) {
  console.log("\n── Seeding tax config ──");
  await db.platformTaxConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      provider: "NONE",
      defaultBehavior: "EXCLUSIVE",
      defaultRounding: "ROUND_HALF_UP",
      reverseChargeEU: true,
      defaultTaxCodes: { subscription: "txcd_10000000", metered: "txcd_10103001" },
      updatedBy: adminId,
    },
    update: {
      // No-op if exists; keep the existing config intact.
      updatedBy: adminId,
    },
  });
  console.log("  ✓ tax config ensured");
}

async function seedRates(adminId: string) {
  console.log("\n── Seeding tax rates ──");
  const existing = await db.taxRate.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} rates — skipping.`);
    return;
  }
  const data = [
    { country: "US", region: "US-CA", label: "California state sales tax",
      rate: "0.0875", nexusThreshold: 50000000, taxId: "EIN-CA-DEMO",
      notes: "Includes county avg" },
    { country: "US", region: "US-NY", label: "New York state sales tax",
      rate: "0.0825", nexusThreshold: 50000000, taxId: "EIN-NY-DEMO",
      notes: null },
    { country: "GB", region: null, label: "UK VAT (standard rate)",
      rate: "0.2000", nexusThreshold: 0, taxId: "GB123456789",
      notes: "Reverse-charge for B2B EU" },
    { country: "AU", region: null, label: "Australia GST",
      rate: "0.1000", nexusThreshold: 0, taxId: "ABN-DEMO",
      notes: null },
  ];
  for (const r of data) {
    await db.taxRate.create({ data: { ...r, createdById: adminId } });
    console.log(`  ✓ ${r.country}${r.region ? "/" + r.region : ""} ${r.label} @ ${(Number(r.rate) * 100).toFixed(2)}%`);
  }
}

async function seedExemptions(adminId: string) {
  console.log("\n── Seeding tax exemptions ──");
  const existing = await db.taxExemption.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} exemptions — skipping.`);
    return;
  }
  const tenants = await db.tenant.findMany({
    take: 2,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (tenants.length < 2) {
    console.log("  Need at least 2 tenants — skipping.");
    return;
  }
  const day = 86_400_000;
  // Tenant 0 — verified RESALE
  await db.taxExemption.create({
    data: {
      tenantId: tenants[0].id,
      exemptionType: "RESALE",
      taxId: "RES-DEMO-001",
      jurisdictions: ["US-CA"],
      certificateUrl: "https://storage.flowtora.com/demo/resale-cert.pdf",
      certificateName: "California_Resale_Certificate.pdf",
      verifiedAt: new Date(Date.now() - 30 * day),
      verifiedBy: adminId,
      expiresAt: new Date(Date.now() + 365 * day),
      notes: "Verified Q1 2026; renews annually",
      createdById: adminId,
    },
  });
  console.log(`  ✓ ${tenants[0].name}: verified RESALE (US-CA)`);
  // Tenant 1 — unverified REVERSE_CHARGE
  await db.taxExemption.create({
    data: {
      tenantId: tenants[1].id,
      exemptionType: "REVERSE_CHARGE",
      taxId: "GB987654321",
      jurisdictions: ["GB"],
      certificateUrl: null,
      certificateName: null,
      verifiedAt: null,
      verifiedBy: null,
      expiresAt: null,
      notes: "Pending VAT-number validation against HMRC",
      createdById: adminId,
    },
  });
  console.log(`  ✓ ${tenants[1].name}: pending REVERSE_CHARGE (GB)`);
}

async function seedFilings(adminId: string) {
  console.log("\n── Seeding tax filings ──");
  const existing = await db.taxFiling.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} filings — skipping.`);
    return;
  }
  const day = 86_400_000;
  const filings = [
    {
      jurisdiction: "US-CA",
      period: "2026-Q1",
      taxableSales: 4500000,
      taxCollected: 393750,
      dueAt: new Date(Date.now() + 21 * day),
      status: "DRAFT" as const,
      notes: "Quarterly Cal Sales & Use Tax filing — pending finance review",
    },
    {
      jurisdiction: "US-NY",
      period: "2026-Q1",
      taxableSales: 1800000,
      taxCollected: 148500,
      dueAt: new Date(Date.now() - 7 * day),
      submittedAt: new Date(Date.now() - 9 * day),
      externalRef: "NY-2026Q1-887234",
      status: "SUBMITTED" as const,
      notes: "Awaiting acceptance from NY DTF",
    },
    {
      jurisdiction: "GB",
      period: "2025-Q4",
      taxableSales: 12000000,
      taxCollected: 2400000,
      dueAt: new Date(Date.now() - 60 * day),
      submittedAt: new Date(Date.now() - 65 * day),
      externalRef: "HMRC-VAT-Q4-2025-44291",
      pdfUrl: "https://storage.flowtora.com/demo/uk-vat-q4-2025.pdf",
      status: "ACCEPTED" as const,
      notes: "Filed via MTD; HMRC accepted same day",
    },
  ];
  for (const f of filings) {
    await db.taxFiling.create({ data: { ...f, createdById: adminId } });
    console.log(`  ✓ ${f.jurisdiction} ${f.period} — ${f.status}`);
  }
}

async function summary() {
  const [config, rates, exempt, filings] = await Promise.all([
    db.platformTaxConfig.findUnique({ where: { id: "default" } }),
    db.taxRate.count(),
    db.taxExemption.count(),
    db.taxFiling.count(),
  ]);
  console.log("\n── Summary ──");
  console.log(`  config: ${config ? "set" : "missing"} (provider=${config?.provider})`);
  console.log(`  rates: ${rates}, exemptions: ${exempt}, filings: ${filings}`);
}

async function main() {
  const adminId = await pickAdminId();
  await seedConfig(adminId);
  await seedRates(adminId);
  await seedExemptions(adminId);
  await seedFilings(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
