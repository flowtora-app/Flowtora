import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadAuditDetail,
  loadAuditFilterOptions,
  loadAuditKpi,
  loadAuditList,
  loadRetentionPolicy,
  loadWebhookSubscriptions,
  type AuditFilters,
} from "@/server/platform/audit-log";
import type { AuditSeverity, AuditSource } from "@prisma/client";
import { AuditFiltersBar } from "./_components/AuditFiltersBar";
import { AuditTable } from "./_components/AuditTable";
import { AuditDetailDrawer } from "./_components/AuditDetailDrawer";
import { AuditSavedViews } from "./_components/AuditSavedViews";
import { ConfigureRetentionButton } from "./_components/ConfigureRetentionButton";
import { WebhooksButton } from "./_components/WebhooksButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const SEVERITIES: AuditSeverity[] = ["INFO", "WARNING", "CRITICAL"];
const SOURCES: AuditSource[] = ["WEB", "API", "CLI", "SYSTEM"];

function parseFilters(sp: SearchParams): AuditFilters {
  const f: AuditFilters = {};
  if (typeof sp.q === "string" && sp.q.trim()) f.q = sp.q.trim();
  if (typeof sp.actor === "string" && sp.actor) f.actorId = sp.actor;
  if (typeof sp.tenant === "string" && sp.tenant) f.tenantId = sp.tenant;
  if (typeof sp.entity === "string" && sp.entity) f.entityType = sp.entity;
  if (typeof sp.action === "string" && sp.action) f.action = sp.action;
  if (typeof sp.severity === "string" && (SEVERITIES as string[]).includes(sp.severity)) {
    f.severity = sp.severity as AuditSeverity;
  }
  if (typeof sp.source === "string" && (SOURCES as string[]).includes(sp.source)) {
    f.source = sp.source as AuditSource;
  }
  if (typeof sp.ip === "string" && sp.ip) f.ip = sp.ip.trim();
  if (typeof sp.since === "string" && sp.since) {
    const d = new Date(sp.since); if (!Number.isNaN(d.getTime())) f.since = d;
  }
  if (typeof sp.until === "string" && sp.until) {
    const d = new Date(sp.until); if (!Number.isNaN(d.getTime())) f.until = d;
  }
  if (sp.success === "1") f.success = true;
  else if (sp.success === "0") f.success = false;
  if (typeof sp.preset === "string"
      && ["sensitive", "failures", "mine", "super_admin_week"].includes(sp.preset)) {
    f.preset = sp.preset as AuditFilters["preset"];
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

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canConfigure = ctx.can("system.write_settings");
  const canVerify = ctx.can("audit.read");

  const filters = parseFilters(sp);
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : "1") || 1);
  const detailId = typeof sp.detail === "string" ? sp.detail : null;

  const [{ rows, total }, kpi, options, retention, subs, detail] = await Promise.all([
    loadAuditList(filters, page, PAGE_SIZE, ctx.userId),
    loadAuditKpi(),
    loadAuditFilterOptions(),
    loadRetentionPolicy(),
    loadWebhookSubscriptions(),
    detailId ? loadAuditDetail(detailId) : Promise.resolve(null),
  ]);

  const filterQs = buildQs(sp, { detail: null, page: null });

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Audit Log" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Audit Log"
            description="Tamper-evident, append-only log of every admin action."
            actions={
              <>
                <Link href={`/api/platform/audit/export${filterQs}&format=csv`}>
                  <Button size="sm" variant="secondary">Export CSV</Button>
                </Link>
                <Link href={`/api/platform/audit/export${filterQs}&format=ndjson`}>
                  <Button size="sm" variant="ghost">NDJSON</Button>
                </Link>
                {canVerify && (
                  <Link href="/platform/access/audit/verify">
                    <Button size="sm" variant="ghost">Verify chain</Button>
                  </Link>
                )}
                {canConfigure && (
                  <WebhooksButton subscriptions={subs} />
                )}
                {canConfigure && (
                  <ConfigureRetentionButton retention={retention} />
                )}
              </>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Events · 24h"     value={kpi.totalLast24h.toLocaleString()} />
        <Kpi label="Failures · 24h"   value={kpi.failuresLast24h.toLocaleString()}
             tone={kpi.failuresLast24h > 0 ? "warning" : "default"} />
        <Kpi label="Critical · 24h"   value={kpi.criticalLast24h.toLocaleString()}
             tone={kpi.criticalLast24h > 0 ? "danger" : "default"} />
        <Kpi label="Unique actors · 24h" value={kpi.uniqueActorsLast24h.toLocaleString()} />
      </div>

      {/* Saved views + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <AuditSavedViews />
      </div>
      <Card padding="md">
        <AuditFiltersBar
          options={options}
          severities={SEVERITIES}
          sources={SOURCES}
        />
      </Card>

      {/* Table */}
      <AuditTable rows={rows} total={total} page={page} pageSize={PAGE_SIZE} />

      {/* Detail drawer */}
      {detail && (
        <AuditDetailDrawer detail={detail} />
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "default" | "warning" | "danger" }) {
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
      </div>
    </Card>
  );
}
