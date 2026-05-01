import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  HEALTH_FACTORS,
  applyFilters,
  computeKpis,
  distributionBuckets,
  heatmap,
  loadHealthRows,
  loadModelHistory,
  loadTrend,
  type HealthFilters,
} from "@/server/platform/health-scoring";
import { HealthFiltersBar } from "./_components/HealthFiltersBar";
import { HealthCharts } from "./_components/HealthCharts";
import { HealthTable } from "./_components/HealthTable";
import { ScoringModelEditorButton } from "./_components/ScoringModelEditorButton";
import { RecomputeAllButton } from "./_components/RecomputeAllButton";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Page 6 — Tenant Health Scores.
//
// One server-component shell + a handful of client islands for the
// charts, model editor, and per-row CSM adjustment dialog. Filters
// are URL-driven so deep-linking + sharing works.

type SearchParams = Record<string, string | string[] | undefined>;

const VALID_TRENDS = new Set(["up", "down", "flat"]);

function parseFilters(sp: SearchParams): HealthFilters {
  const f: HealthFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.plan === "string" && sp.plan) f.plan = sp.plan;
  if (typeof sp.csm === "string" && sp.csm) f.csmId = sp.csm;
  const min = typeof sp.min === "string" ? Number(sp.min) : NaN;
  const max = typeof sp.max === "string" ? Number(sp.max) : NaN;
  if (!Number.isNaN(min)) f.scoreMin = Math.max(0, Math.min(100, min));
  if (!Number.isNaN(max)) f.scoreMax = Math.max(0, Math.min(100, max));
  if (typeof sp.trend === "string" && VALID_TRENDS.has(sp.trend)) {
    f.trend = sp.trend as "up" | "down" | "flat";
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

export default async function HealthScoresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const canEditModel = ctx.can("system.write_settings");
  const canAdjust    = ctx.can("tenant.tag");
  const canImpersonate = ctx.can("tenant.impersonate");

  const filters = parseFilters(sp);

  const [{ rows, active, shadow }, history, trend, csms] = await Promise.all([
    loadHealthRows(),
    loadModelHistory(),
    loadTrend(90),
    db.user.findMany({
      where: { csmTenants: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
  ]);

  const filtered = applyFilters(rows, filters);
  if (filters.csmId) {
    const id = filters.csmId;
    // CSM filter is post-filter because csmId isn't in the row's
    // shape (we use csmName / csmEmail). We re-pull the assignment
    // via a Map of tenantId → csmId.
    const csmAssign = new Map(
      (await db.tenant.findMany({
        where: { id: { in: filtered.map((r) => r.tenantId) } },
        select: { id: true, accountManagerId: true },
      })).map((t) => [t.id, t.accountManagerId]),
    );
    for (let i = filtered.length - 1; i >= 0; i -= 1) {
      if (csmAssign.get(filtered[i]!.tenantId) !== id) filtered.splice(i, 1);
    }
  }

  const kpi = computeKpis(filtered, active);
  const dist = distributionBuckets(filtered);
  const heat = heatmap(filtered);

  const planOptions = Array.from(new Set(rows.map((r) => r.plan))).sort();
  const exportQs = buildQs(sp);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Tenants", href: "/platform/tenants" },
          { label: "Health Scores" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Tenant Health Scores"
            description="Predict and prioritise tenants needing attention."
            actions={
              <>
                {canEditModel && <RecomputeAllButton />}
                {canEditModel && (
                  <ScoringModelEditorButton
                    factors={HEALTH_FACTORS}
                    active={active}
                    shadow={shadow}
                    history={history}
                  />
                )}
                <Link href={`/api/platform/tenants/health/export${exportQs}`}>
                  <Button size="sm" variant="secondary">Export</Button>
                </Link>
              </>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Avg score"
                 value={kpi.avgScore.toString()}
                 sub={`${kpi.total.toLocaleString()} tenant${kpi.total === 1 ? "" : "s"}`} />
        <KpiCard label="% Healthy"
                 value={`${kpi.healthyPct}%`}
                 sub="Score ≥ 80"
                 tone="good" />
        <KpiCard label="% At-risk"
                 value={`${kpi.atRiskPct}%`}
                 sub="Score 50–79"
                 tone="warning" />
        <KpiCard label="% Critical"
                 value={`${kpi.criticalPct}%`}
                 sub="Score < 50"
                 tone={kpi.criticalPct > 0 ? "danger" : "default"} />
        <KpiCard label="Scoring model"
                 value={kpi.modelVersionLabel}
                 sub={shadow ? `Shadow: v${shadow.version}` : "No shadow"} />
      </div>

      {/* Charts */}
      <HealthCharts dist={dist} trend={trend} heat={heat} />

      {/* Filters */}
      <Card padding="md">
        <HealthFiltersBar
          planOptions={planOptions}
          csmOptions={csms.map((u) => ({ id: u.id, label: u.name?.trim() || u.email }))}
        />
      </Card>

      {/* Table */}
      <HealthTable
        rows={filtered}
        canAdjust={canAdjust}
        canImpersonate={canImpersonate}
      />
    </div>
  );
}

/* ── KPI card (inline, avoids importing the dashboard one) ─ */

function KpiCard({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div>
          <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
          {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
      </div>
    </Card>
  );
}
