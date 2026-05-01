import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  loadAtRiskRows,
  loadChurnedRows,
  loadWinbackCampaigns,
  type AtRiskFilters,
  type ChurnedFilters,
  type RiskWindowDays,
} from "@/server/platform/churn";
import type { ArchiveReasonCode } from "@prisma/client";
import { AtRiskTab } from "./_components/AtRiskTab";
import { ChurnedTab } from "./_components/ChurnedTab";
import { WinbackTab } from "./_components/WinbackTab";

export const dynamic = "force-dynamic";

// Page 7 — Churned & At-Risk.
//
// Three tabs over related but distinct datasets:
//   • At-Risk: live tenants with low health.
//   • Churned: CANCELED/ARCHIVED tenants with reason analytics.
//   • Win-back: outbound email campaigns to lapsed tenants.

type SearchParams = Record<string, string | string[] | undefined>;
const TABS = ["at-risk", "churned", "winback"] as const;
type Tab = (typeof TABS)[number];

const REASON_CODES: ArchiveReasonCode[] = [
  "NOT_A_FIT", "TOO_EXPENSIVE", "MISSING_FEATURES", "SWITCHED_TO_COMPETITOR",
  "BUSINESS_CLOSED", "TEMPORARY_PAUSE", "TECHNICAL_ISSUES", "POOR_SUPPORT",
  "DIFFICULT_TO_USE", "ADMIN_DECISION", "OTHER",
];

function parseAtRiskFilters(sp: SearchParams): AtRiskFilters {
  const f: AtRiskFilters = {};
  const w = Number(typeof sp.window === "string" ? sp.window : "");
  if ([30, 60, 90, 180].includes(w)) f.window = w as RiskWindowDays;
  const min = Number(typeof sp.min === "string" ? sp.min : "");
  if (!Number.isNaN(min)) f.scoreMin = Math.max(0, Math.min(100, min));
  const max = Number(typeof sp.max === "string" ? sp.max : "");
  if (!Number.isNaN(max)) f.scoreMax = Math.max(0, Math.min(100, max));
  if (typeof sp.plan === "string" && sp.plan) f.plan = sp.plan;
  if (typeof sp.csm === "string" && sp.csm) f.csmId = sp.csm;
  if (typeof sp.reason === "string" && sp.reason) f.reasonKey = sp.reason;
  if (sp.includeSuppressed === "1") f.includeSuppressed = true;
  return f;
}

function parseChurnedFilters(sp: SearchParams): ChurnedFilters {
  const f: ChurnedFilters = {};
  const code = typeof sp.code === "string" ? sp.code : "";
  if (REASON_CODES.includes(code as ArchiveReasonCode)) f.reasonCode = code as ArchiveReasonCode;
  if (typeof sp.plan === "string" && sp.plan) f.plan = sp.plan;
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  return f;
}

function buildQs(sp: SearchParams, override: Record<string, string | null> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in override) continue;
    if (typeof v === "string") u.set(k, v);
    else if (Array.isArray(v)) for (const x of v) u.append(k, x);
  }
  for (const [k, v] of Object.entries(override)) {
    if (v != null && v !== "") u.set(k, v);
  }
  const q = u.toString();
  return q ? `?${q}` : "";
}

export default async function ChurnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(typeof sp.tab === "string" ? sp.tab : "")
    ? (sp.tab as Tab) : "at-risk";

  const canEdit = ctx.can("tenant.tag");
  const canCoupon = ctx.can("billing.coupon");
  const canImpersonate = ctx.can("tenant.impersonate");
  const canCampaigns = ctx.can("announcement.write");

  const [atRisk, churned, campaigns, plans, csms, coupons] = await Promise.all([
    tab === "at-risk" ? loadAtRiskRows(parseAtRiskFilters(sp)) : Promise.resolve(null),
    tab === "churned" ? loadChurnedRows(parseChurnedFilters(sp)) : Promise.resolve(null),
    tab === "winback" ? loadWinbackCampaigns() : Promise.resolve([]),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { plan: true },
      distinct: ["plan"],
    }),
    db.user.findMany({
      where: { csmTenants: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    db.coupon.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, discountType: true, amount: true, currency: true },
      take: 50,
    }),
  ]);

  const planOptions = plans.map((p) => p.plan).sort();

  const tabHref = (id: Tab) =>
    `/platform/tenants/churn${buildQs(sp, { tab: id === "at-risk" ? null : id, plan: null, code: null, since: null, until: null, window: null, min: null, max: null, csm: null, reason: null, includeSuppressed: null })}`;

  // Tab counts (best-effort). For tabs we didn't load, leave undefined.
  const tabBadges: Record<Tab, number | undefined> = {
    "at-risk": atRisk?.kpi.total,
    churned: churned?.kpi.total,
    winback: campaigns.length,
  };

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Tenants", href: "/platform/tenants" },
          { label: "Churned & At-Risk" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Churned & At-Risk"
            description="Predict, retain, and win back."
            actions={
              <Link href={`/api/platform/tenants/churn/export${buildQs(sp)}`}>
                <Button size="sm" variant="secondary">Export</Button>
              </Link>
            }
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        variant="pill"
        activeHref={tabHref(tab)}
        items={(["at-risk", "churned", "winback"] as Tab[]).map((id) => ({
          label: id === "at-risk" ? "At-Risk" : id === "churned" ? "Churned" : "Win-back Campaigns",
          href: tabHref(id),
          badge: tabBadges[id],
        }))}
      />

      {tab === "at-risk" && atRisk && (
        <AtRiskTab
          rows={atRisk.rows}
          kpi={atRisk.kpi}
          planOptions={planOptions}
          csmOptions={csms.map((u) => ({ id: u.id, label: u.name?.trim() || u.email }))}
          campaigns={campaigns.length === 0
            ? await loadWinbackCampaigns().then((cs) => cs.filter((c) => c.status === "ACTIVE" || c.status === "DRAFT"))
            : campaigns.filter((c) => c.status === "ACTIVE" || c.status === "DRAFT")}
          coupons={coupons.map((c) => ({
            id: c.id,
            label: c.discountType === "PERCENT"
              ? `${c.code} (${c.amount}% off)`
              : `${c.code} (${(c.amount / 100).toLocaleString(undefined, { style: "currency", currency: c.currency ?? "USD" })} off)`,
          }))}
          canEdit={canEdit}
          canCoupon={canCoupon}
          canImpersonate={canImpersonate}
        />
      )}

      {tab === "churned" && churned && (
        <ChurnedTab
          rows={churned.rows}
          kpi={churned.kpi}
          planOptions={planOptions}
          reasonCodes={REASON_CODES}
          canEdit={canEdit}
        />
      )}

      {tab === "winback" && (
        <WinbackTab
          campaigns={campaigns}
          reasonCodes={REASON_CODES}
          canEdit={canCampaigns}
        />
      )}

      {!canEdit && (
        <Card padding="md">
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Read-only mode — your role can&apos;t apply retention actions or run campaigns.
          </div>
        </Card>
      )}
    </div>
  );
}
