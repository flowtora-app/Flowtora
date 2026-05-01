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
  loadActiveSessions,
  loadHistory,
  loadImpersonationSettings,
  loadKpi,
  loadSessionDetail,
  type HistoryFilters,
} from "@/server/platform/impersonation";
import type { ImpersonationEndReason } from "@prisma/client";
import { ActiveTab } from "./_components/ActiveTab";
import { HistoryTab } from "./_components/HistoryTab";
import { SettingsTab } from "./_components/SettingsTab";

export const dynamic = "force-dynamic";

// Page 8 — Impersonation Sessions.
// Three tabs (Active / History / Compliance settings) over the same
// ImpersonationSession table.

type SearchParams = Record<string, string | string[] | undefined>;
const TABS = ["active", "history", "settings"] as const;
type Tab = (typeof TABS)[number];

const END_REASONS: ImpersonationEndReason[] = ["COMPLETED", "FORCE_ENDED", "EXPIRED", "IDLE_TIMEOUT"];

function parseHistoryFilters(sp: SearchParams): HistoryFilters {
  const f: HistoryFilters = {};
  if (typeof sp.admin === "string" && sp.admin) f.adminId = sp.admin;
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  if (typeof sp.minDur === "string" && sp.minDur) {
    const n = Number(sp.minDur); if (!Number.isNaN(n)) f.minDurationMin = n;
  }
  if (typeof sp.maxDur === "string" && sp.maxDur) {
    const n = Number(sp.maxDur); if (!Number.isNaN(n)) f.maxDurationMin = n;
  }
  if (sp.hasActions === "1") f.hasActions = true;
  else if (sp.hasActions === "0") f.hasActions = false;
  const er = typeof sp.ended === "string" ? sp.ended : "";
  if (END_REASONS.includes(er as ImpersonationEndReason)) f.endedReason = er as ImpersonationEndReason;
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

export default async function ImpersonationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(typeof sp.tab === "string" ? sp.tab : "")
    ? (sp.tab as Tab) : "active";

  const canEnd = ctx.can("tenant.impersonate");
  const canEditSettings = ctx.can("system.write_settings");

  const settings = await loadImpersonationSettings();

  // Tab-specific data.
  const [active, history, kpi, admins, tenants] = await Promise.all([
    tab === "active"  ? loadActiveSessions(settings) : Promise.resolve([]),
    tab === "history" ? loadHistory(parseHistoryFilters(sp), Number(typeof sp.page === "string" ? sp.page : "1") || 1, 50) : Promise.resolve({ rows: [], total: 0 }),
    loadKpi(),
    db.user.findMany({
      where: { OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }] },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    db.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 1_000,
    }),
  ]);

  // Optional drawer detail (shared between tabs via ?detail=<id>).
  const detailId = typeof sp.detail === "string" ? sp.detail : null;
  const detail = detailId ? await loadSessionDetail(detailId) : null;

  const tabHref = (id: Tab) =>
    `/platform/tenants/impersonation${buildQs(sp, {
      tab: id === "active" ? null : id,
      detail: null,
      // Drop all history-tab filter keys when switching tabs so we
      // don't apply them in tabs that don't render the filter bar.
      admin: null, tenant: null, since: null, until: null,
      minDur: null, maxDur: null, hasActions: null, ended: null, page: null,
    })}`;

  const tabBadges: Record<Tab, number | undefined> = {
    active: kpi.activeCount,
    history: kpi.totalLast30d,
    settings: undefined,
  };

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Tenants", href: "/platform/tenants" },
          { label: "Impersonation" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Impersonation Sessions"
            description="Audit and govern admin-as-tenant sessions for compliance."
            actions={
              <Link href={`/api/platform/tenants/impersonation/export${buildQs(sp)}`}>
                <Button size="sm" variant="secondary">Export</Button>
              </Link>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Active now"      value={kpi.activeCount.toLocaleString()}
                 tone={kpi.activeCount > 0 ? "warning" : "default"} />
        <KpiCard label="Total · 30d"     value={kpi.totalLast30d.toLocaleString()} />
        <KpiCard label="Force-ended · 30d" value={kpi.forceEndedLast30d.toLocaleString()}
                 tone={kpi.forceEndedLast30d > 0 ? "danger" : "default"} />
        <KpiCard label="Expired · 30d"   value={kpi.expiredLast30d.toLocaleString()} />
        <KpiCard label="Avg duration"    value={kpi.avgDurationMin == null ? "—" : `${kpi.avgDurationMin}m`} />
      </div>

      {/* Tabs */}
      <Tabs
        variant="pill"
        activeHref={tabHref(tab)}
        items={(TABS as readonly Tab[]).map((id) => ({
          label: id === "active" ? "Active" : id === "history" ? "History" : "Compliance settings",
          href: tabHref(id),
          badge: tabBadges[id],
        }))}
      />

      {tab === "active" && (
        <ActiveTab
          rows={active}
          settings={settings}
          canEnd={canEnd}
        />
      )}

      {tab === "history" && (
        <HistoryTab
          rows={history.rows}
          total={history.total}
          adminOptions={admins.map((a) => ({ id: a.id, label: a.name?.trim() || a.email }))}
          tenantOptions={tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` }))}
          canEnd={canEnd}
          detail={detail}
        />
      )}

      {tab === "settings" && (
        <SettingsTab
          settings={settings}
          adminOptions={admins.map((a) => ({ id: a.id, label: a.name?.trim() || a.email }))}
          canEdit={canEditSettings}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "default" | "warning" | "danger" }) {
  const palette =
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
        {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </Card>
  );
}
