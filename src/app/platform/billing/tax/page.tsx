// Page 21 — Tax & Compliance.
//
// Five tabs at /platform/billing/tax: Configuration, Tax-Exempt Tenants,
// Tax Reports, Filings, Settings. URL-driven via ?tab= so deep links and
// bookmarks work. All five render against real DB rows; Stripe Tax /
// Avalara / TaxJar SDK calls are honestly deferred — saving the
// provider field flips local config but doesn't round-trip.

import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  loadRefundsAndAdjustments,
  loadReverseChargeSales,
  loadTaxByJurisdiction,
  loadTaxByMonth,
  loadTaxExemptSales,
  parseTaxReportPeriod,
} from "@/server/platform/tax-reports";
import { ConfigurationTab } from "./_components/ConfigurationTab";
import { ExemptionsTab } from "./_components/ExemptionsTab";
import { ReportsTab } from "./_components/ReportsTab";
import { FilingsTab } from "./_components/FilingsTab";
import { SettingsTab } from "./_components/SettingsTab";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey = "config" | "exemptions" | "reports" | "filings" | "settings";
const TAB_KEYS: TabKey[] = ["config", "exemptions", "reports", "filings", "settings"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  rate_saved: "Rate saved.",
  rate_deleted: "Rate deleted.",
  verified: "Verification toggled.",
  revoked: "Exemption revoked.",
  deleted: "Filing deleted.",
};

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("compliance.manage");

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "config";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw)
    ? (tabRaw as TabKey)
    : "config";

  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Tax & Compliance" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Tax & Compliance"
            description="Tax rates, exemptions, reports, and filings across every jurisdiction we sell into."
          />
        </div>
      </div>

      {okMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--success-surface)", color: "var(--success-fg)", borderColor: "var(--success-fg)" }}>
          {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", borderColor: "var(--danger-fg)" }}>
          {errMsg}
        </div>
      )}

      <TabBar active={tab} />

      {tab === "config"     && (await renderConfigurationTab(canManage))}
      {tab === "exemptions" && (await renderExemptionsTab(canManage))}
      {tab === "reports"    && (await renderReportsTab(sp))}
      {tab === "filings"    && (await renderFilingsTab(canManage))}
      {tab === "settings"   && (await renderSettingsTab(canManage))}
    </div>
  );
}

function TabBar({ active }: { active: TabKey }) {
  const items: { key: TabKey; label: string }[] = [
    { key: "config",     label: "Tax Configuration" },
    { key: "exemptions", label: "Tax-Exempt Tenants" },
    { key: "reports",    label: "Tax Reports" },
    { key: "filings",    label: "Filings" },
    { key: "settings",   label: "Settings" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-0 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.key === "config" ? "/platform/billing/tax" : `/platform/billing/tax?tab=${it.key}`}
            className="ts-focus relative px-4 py-2 text-[13px] font-medium"
            style={{
              color: isActive ? "var(--text-default)" : "var(--text-muted)",
              borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ── Tab loaders ────────────────────────────────────────── */

async function renderConfigurationTab(canManage: boolean) {
  const [config, rates] = await Promise.all([
    db.platformTaxConfig.findUnique({ where: { id: "default" } }),
    db.taxRate.findMany({
      orderBy: [{ country: "asc" }, { region: "asc" }, { effectiveAt: "desc" }],
      take: 200,
    }),
  ]);
  return (
    <ConfigurationTab
      config={config}
      rates={rates.map((r) => ({
        id: r.id,
        country: r.country,
        region: r.region,
        label: r.label,
        ratePct: Number(r.rate) * 100,
        nexusThreshold: r.nexusThreshold,
        taxId: r.taxId,
        effectiveAt: r.effectiveAt,
        notes: r.notes,
      }))}
      canManage={canManage}
    />
  );
}

async function renderExemptionsTab(canManage: boolean) {
  const [exemptions, tenants] = await Promise.all([
    db.taxExemption.findMany({
      orderBy: [{ verifiedAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  const verifierIds = Array.from(new Set(
    exemptions.map((e) => e.verifiedBy).filter((x): x is string => !!x),
  ));
  const verifiers = verifierIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: verifierIds } },
    select: { id: true, name: true, email: true },
  });
  const verifierById = new Map(verifiers.map((u) => [u.id, u.name ?? u.email ?? null]));

  return (
    <ExemptionsTab
      exemptions={exemptions.map((e) => ({
        id: e.id,
        tenant: e.tenant,
        exemptionType: e.exemptionType,
        taxId: e.taxId,
        jurisdictions: e.jurisdictions,
        certificateUrl: e.certificateUrl,
        certificateName: e.certificateName,
        verifiedAt: e.verifiedAt,
        verifiedByName: e.verifiedBy ? verifierById.get(e.verifiedBy) ?? null : null,
        expiresAt: e.expiresAt,
        notes: e.notes,
      }))}
      tenants={tenants}
      canManage={canManage}
    />
  );
}

async function renderReportsTab(sp: SP) {
  const period = parseTaxReportPeriod(sp);
  const [byJurisdiction, byMonth, exemptSales, reverseCharge, refundsAdj] = await Promise.all([
    loadTaxByJurisdiction(period),
    loadTaxByMonth(),
    loadTaxExemptSales(period),
    loadReverseChargeSales(period),
    loadRefundsAndAdjustments(period),
  ]);
  return (
    <ReportsTab
      period={period}
      byJurisdiction={byJurisdiction}
      byMonth={byMonth}
      exemptSales={exemptSales}
      reverseCharge={reverseCharge}
      refundsAdj={refundsAdj}
    />
  );
}

async function renderFilingsTab(canManage: boolean) {
  const filings = await db.taxFiling.findMany({
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 200,
  });
  return (
    <FilingsTab
      filings={filings.map((f) => ({
        id: f.id,
        jurisdiction: f.jurisdiction,
        period: f.period,
        taxableSales: f.taxableSales,
        taxCollected: f.taxCollected,
        dueAt: f.dueAt,
        submittedAt: f.submittedAt,
        externalRef: f.externalRef,
        pdfUrl: f.pdfUrl,
        status: f.status,
        notes: f.notes,
      }))}
      canManage={canManage}
    />
  );
}

async function renderSettingsTab(canManage: boolean) {
  const config = await db.platformTaxConfig.findUnique({ where: { id: "default" } });
  if (!canManage && !config) {
    return (
      <Card padding="lg">
        <EmptyState
          title="Tax not configured"
          description="An admin needs to configure default tax behavior on the Configuration tab."
        />
      </Card>
    );
  }
  return <SettingsTab config={config} canManage={canManage} />;
}
