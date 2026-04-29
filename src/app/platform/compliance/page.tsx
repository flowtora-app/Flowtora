import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  fulfillDataExport,
  regenerateDataExport,
  cancelDataExportAsStaff,
  executeAccountDeletion,
  cancelAccountDeletionAsStaff,
  extendDeletionGracePeriod,
} from "@/app/actions/compliance";
import type { DataExportStatus, AccountDeletionStatus, Prisma } from "@prisma/client";
import { ComplianceKPIBand, type ComplianceKpi } from "@/components/platform/ComplianceKPIBand";
import { HealthInsights, type HealthInsight } from "@/components/platform/HealthInsights";

// /platform/compliance — data governance control center (rewrite).
//
// Layout:
//   1. KPI band — Open exports · Pending deletions · Completed (30d) ·
//      Avg fulfillment · SLA risk
//   2. Auto-generated insights (overdue items / volume spikes)
//   3. Export requests section (open + recent)
//   4. Deletion queue (scheduled + recent outcomes)
//   5. Compliance activity history (audit-derived)
//
// Filtering: ?type= (export|deletion) toggles which queue is open by
// default; ?q= searches tenant name/slug; status filter via ?status=.

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

const EXPORT_FILTER_OPTIONS = ["all", "open", "completed", "failed"] as const;
type ExportFilter = (typeof EXPORT_FILTER_OPTIONS)[number];
const DELETION_FILTER_OPTIONS = ["all", "scheduled", "executable", "completed", "canceled"] as const;
type DeletionFilter = (typeof DELETION_FILTER_OPTIONS)[number];

const EXPORT_STATUS_TONE: Record<DataExportStatus, { bg: string; fg: string; label: string }> = {
  PENDING:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Pending" },
  PROCESSING: { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "Processing" },
  COMPLETED:  { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Completed" },
  FAILED:     { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      label: "Failed" },
  EXPIRED:    { bg: "var(--surface-2)",       fg: "var(--text-faint)",     label: "Expired" },
};
const DELETION_STATUS_TONE: Record<AccountDeletionStatus, { bg: string; fg: string; label: string }> = {
  SCHEDULED: { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "Scheduled" },
  CANCELED:  { bg: "var(--surface-2)",       fg: "var(--text-muted)", label: "Canceled" },
  COMPLETED: { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  label: "Completed" },
};

export default async function PlatformCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    ok?: string;
    exportFilter?: string;
    deletionFilter?: string;
    q?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  const exportFilterRaw = (sp.exportFilter ?? "open").toLowerCase();
  const exportFilter: ExportFilter = (EXPORT_FILTER_OPTIONS as readonly string[]).includes(exportFilterRaw)
    ? (exportFilterRaw as ExportFilter)
    : "open";
  const deletionFilterRaw = (sp.deletionFilter ?? "scheduled").toLowerCase();
  const deletionFilter: DeletionFilter = (DELETION_FILTER_OPTIONS as readonly string[]).includes(deletionFilterRaw)
    ? (deletionFilterRaw as DeletionFilter)
    : "scheduled";
  const q = (sp.q ?? "").trim();

  // ── Build filter clauses ─────────────────────────────────────
  const exportWhere: Prisma.DataExportRequestWhereInput =
    exportFilter === "open"      ? { status: { in: ["PENDING", "PROCESSING", "FAILED"] } }
    : exportFilter === "completed" ? { status: "COMPLETED" }
    : exportFilter === "failed"  ? { status: "FAILED" }
    : {};

  const deletionWhere: Prisma.AccountDeletionRequestWhereInput =
    deletionFilter === "scheduled"  ? { status: "SCHEDULED" }
    : deletionFilter === "executable" ? { status: "SCHEDULED", scheduledFor: { lte: new Date() } }
    : deletionFilter === "completed" ? { status: "COMPLETED" }
    : deletionFilter === "canceled"  ? { status: "CANCELED" }
    : {};

  // Time windows.
  const now = new Date();
  const last7d  = new Date(now.getTime() -  7 * DAY_MS);
  const last30d = new Date(now.getTime() - 30 * DAY_MS);
  const last60d = new Date(now.getTime() - 60 * DAY_MS);

  // ── Parallel data fetch ─────────────────────────────────────
  const [
    exports,
    deletions,
    completedRecent,
    deletionRecent,
    // KPI counts
    openExportCount, scheduledDeletionCount,
    completed30d, completedPrior30d,
    completedExportTimings,    // for avg fulfillment
    overdueDeletions,
    spikeExports7d, spikeExportsPrior7d,
    // Compliance audit history
    auditHistory,
  ] = await Promise.all([
    db.dataExportRequest.findMany({
      where:   exportWhere,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take:    50,
    }),
    db.accountDeletionRequest.findMany({
      where:   deletionWhere,
      orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
      take:    50,
    }),
    db.dataExportRequest.findMany({
      where:   { status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take:    10,
    }),
    db.accountDeletionRequest.findMany({
      where:   { status: { in: ["CANCELED", "COMPLETED"] } },
      orderBy: { updatedAt: "desc" },
      take:    10,
    }),
    db.dataExportRequest.count({ where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } } }),
    db.accountDeletionRequest.count({ where: { status: "SCHEDULED" } }),
    db.dataExportRequest.count({ where: { status: "COMPLETED", completedAt: { gte: last30d } } }),
    db.dataExportRequest.count({ where: { status: "COMPLETED", completedAt: { gte: last60d, lt: last30d } } }),
    db.dataExportRequest.findMany({
      where: { status: "COMPLETED", completedAt: { gte: last30d } },
      select: { createdAt: true, completedAt: true },
      take: 200,
    }),
    db.accountDeletionRequest.count({
      where: { status: "SCHEDULED", scheduledFor: { lt: now } },
    }),
    db.dataExportRequest.count({ where: { createdAt: { gte: last7d } } }),
    db.dataExportRequest.count({ where: { createdAt: { gte: new Date(now.getTime() - 14 * DAY_MS), lt: last7d } } }),
    db.auditLog.findMany({
      where: {
        createdAt: { gte: last30d },
        OR: [
          { action: { startsWith: "platform.export_" } },
          { action: { startsWith: "platform.deletion_" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // ── Decorate with tenant + user ─────────────────────────────
  const tenantIds = Array.from(new Set([
    ...exports.map((e) => e.tenantId),
    ...deletions.map((d) => d.tenantId),
    ...completedRecent.map((e) => e.tenantId),
    ...deletionRecent.map((d) => d.tenantId),
    ...auditHistory.map((a) => a.tenantId).filter((x): x is string => Boolean(x)),
  ]));
  const userIds = Array.from(new Set([
    ...exports.map((e) => e.requestedBy),
    ...deletions.map((d) => d.requestedBy),
    ...auditHistory.map((a) => a.userId).filter((x): x is string => Boolean(x)),
  ]));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({
          where:  { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, plan: true, status: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string; plan: string; status: string }[]),
    userIds.length
      ? db.user.findMany({
          where:  { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  // ── Apply tenant search to the visible exports + deletions ───
  const matchTenant = (tenantId: string): boolean => {
    if (!q) return true;
    const t = tenantById.get(tenantId);
    if (!t) return false;
    const haystack = `${t.name} ${t.slug}`.toLowerCase();
    return haystack.includes(q.toLowerCase());
  };
  const visibleExports   = exports.filter((e) => matchTenant(e.tenantId));
  const visibleDeletions = deletions.filter((d) => matchTenant(d.tenantId));

  // ── Compute avg fulfillment (median of last 30d completions) ─
  const fulfillmentMs = completedExportTimings
    .filter((e) => e.completedAt)
    .map((e) => e.completedAt!.getTime() - e.createdAt.getTime())
    .sort((a, b) => a - b);
  const avgFulfillmentMs = fulfillmentMs.length === 0
    ? null
    : fulfillmentMs[Math.floor(fulfillmentMs.length / 2)]; // median

  // ── KPI tiles ───────────────────────────────────────────────
  const kpis: ComplianceKpi[] = [
    {
      label: "Open exports",
      value: openExportCount.toLocaleString(),
      hint: openExportCount === 0 ? "Inbox zero" : "Awaiting fulfillment",
      tone: openExportCount === 0 ? "success" : openExportCount > 5 ? "warning" : "default",
      deltaInvert: true,
    },
    {
      label: "Pending deletions",
      value: scheduledDeletionCount.toLocaleString(),
      hint: scheduledDeletionCount === 0 ? "Nothing scheduled" : "Tenants in grace window",
      tone: scheduledDeletionCount > 0 ? "warning" : "default",
      deltaInvert: true,
    },
    {
      label: "Completed (30d)",
      value: completed30d.toLocaleString(),
      hint: `vs ${completedPrior30d} prior 30d`,
      deltaPct: pctDelta(completed30d, completedPrior30d),
      tone: "default",
    },
    {
      label: "Median fulfillment",
      value: avgFulfillmentMs == null ? "—" : formatDuration(avgFulfillmentMs),
      hint: avgFulfillmentMs == null ? "Not enough data" : "Last 30 days",
      tone: "default",
    },
    {
      label: "SLA risk",
      value: overdueDeletions.toLocaleString(),
      hint: overdueDeletions === 0 ? "Within target" : "Deletions past scheduled date",
      tone: overdueDeletions > 0 ? "danger" : "success",
      deltaInvert: true,
    },
  ];

  // ── Auto-generated insights ─────────────────────────────────
  const insights: HealthInsight[] = [];
  if (overdueDeletions > 0) {
    insights.push({
      id: "overdue-deletions",
      tone: "danger",
      text: `${overdueDeletions} deletion${overdueDeletions === 1 ? "" : "s"} past scheduled date — execute or extend grace.`,
    });
  }
  if (openExportCount > 5) {
    insights.push({
      id: "export-backlog",
      tone: "warning",
      text: `${openExportCount} export request${openExportCount === 1 ? "" : "s"} awaiting fulfillment. Median wait climbs as the queue grows.`,
    });
  }
  const exportSpikeDelta = pctDelta(spikeExports7d, spikeExportsPrior7d);
  if (exportSpikeDelta !== undefined && exportSpikeDelta >= 0.3 && spikeExports7d >= 3) {
    insights.push({
      id: "export-spike",
      tone: "warning",
      text: `Export requests up ${(exportSpikeDelta * 100).toFixed(0)}% week-over-week.`,
    });
  }
  if (avgFulfillmentMs != null && avgFulfillmentMs > 24 * 60 * 60 * 1000) {
    insights.push({
      id: "slow-fulfillment",
      tone: "warning",
      text: `Median fulfillment time is ${formatDuration(avgFulfillmentMs)} — try to keep this under 24 hours.`,
    });
  }
  if (insights.length === 0) {
    insights.push({
      id: "all-clear",
      tone: "positive",
      text: "Compliance queues are healthy — nothing overdue or spiking.",
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Compliance
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Data governance control center — GDPR exports, account deletions, and the activity log
          tying every fulfillment to the staff member who ran it.
        </p>
      </div>

      {/* ── Banners ────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body={
          sp.ok === "fulfilled" ? "Export generated."
          : sp.ok === "regenerated" ? "Export regenerated with current data."
          : sp.ok === "canceled" ? "Request canceled."
          : sp.ok === "executed" ? "Tenant deletion executed."
          : sp.ok === "extended" ? "Grace period extended."
          : "Action completed."
        } />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── KPI band ───────────────────────────────────── */}
      <ComplianceKPIBand kpis={kpis} />

      {/* ── Insights ───────────────────────────────────── */}
      <HealthInsights insights={insights.slice(0, 4)} />

      {/* ── Search ─────────────────────────────────────── */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        {exportFilter !== "open"   && <input type="hidden" name="exportFilter"   value={exportFilter} />}
        {deletionFilter !== "scheduled" && <input type="hidden" name="deletionFilter" value={deletionFilter} />}
        <label className="block flex-1 min-w-[260px]">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Search by tenant
          </span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Tenant name or slug"
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || exportFilter !== "open" || deletionFilter !== "scheduled") && (
          <Link
            href="/platform/compliance"
            className="self-center text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Export requests section ────────────────────── */}
      <Section
        title="Data export requests"
        description="JSON bundles per tenant. Download URL signed via /api/exports/[id]; expires after retention window."
        right={
          <FilterChips
            paramKey="exportFilter"
            current={exportFilter}
            options={[
              { value: "open",      label: "Open" },
              { value: "completed", label: "Completed" },
              { value: "failed",    label: "Failed/canceled" },
              { value: "all",       label: "All" },
            ]}
          />
        }
      >
        {visibleExports.length === 0 ? (
          <Empty icon="📤" title="No export requests match." body={
            exportFilter === "open"
              ? "No requests are pending fulfillment. New requests come through the tenant's settings → danger zone."
              : "Adjust the filter or clear search."
          } />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <Th>Tenant</Th>
                  <Th>Requested by</Th>
                  <Th>Created</Th>
                  <Th>Status</Th>
                  <Th>Expires</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visibleExports.map((e, idx) => {
                  const t = tenantById.get(e.tenantId);
                  const u = userById.get(e.requestedBy);
                  const statusTone = EXPORT_STATUS_TONE[e.status];
                  // "Canceled by admin" rows show a "Canceled" pill via errorMessage prefix.
                  const isCanceled = e.errorMessage?.startsWith("Canceled");
                  const display = isCanceled
                    ? { ...statusTone, label: "Canceled" }
                    : statusTone;
                  const expired = e.expiresAt && e.expiresAt.getTime() < Date.now();
                  return (
                    <tr
                      key={e.id}
                      style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <Td>
                        {t ? (
                          <Link
                            href={`/platform/tenants/${t.id}`}
                            className="text-sm font-medium hover:underline"
                            style={{ color: "var(--text-default)" }}
                          >
                            {t.name}
                          </Link>
                        ) : <span style={{ color: "var(--text-faint)" }}>deleted tenant</span>}
                        <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                          #{e.id.slice(0, 8)}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-xs" style={{ color: "var(--text-default)" }}>
                          {u?.name ?? u?.email ?? <span style={{ color: "var(--text-faint)" }}>unknown</span>}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {ageLabel(e.createdAt)}
                        </div>
                        <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                          {e.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                        </div>
                      </Td>
                      <Td>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: display.bg, color: display.fg, border: `1px solid ${display.fg}` }}
                        >
                          {display.label}
                        </span>
                        {e.errorMessage && !isCanceled && (
                          <div className="mt-0.5 truncate text-[10px]" style={{ color: "var(--danger-fg)", maxWidth: 220 }}>
                            {e.errorMessage}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {e.expiresAt ? (
                          <span className="text-xs" style={{ color: expired ? "var(--text-faint)" : "var(--text-muted)" }}>
                            {expired ? "expired " : "expires "}{e.expiresAt.toISOString().slice(0, 10)}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {(e.status === "PENDING" || e.status === "FAILED") && !isCanceled && (
                            <form action={fulfillDataExport.bind(null, e.id)}>
                              <ActionButton tone="accent">
                                {e.status === "FAILED" ? "Retry" : "Fulfill"}
                              </ActionButton>
                            </form>
                          )}
                          {(e.status === "COMPLETED" || e.status === "EXPIRED") && (
                            <>
                              {!expired && e.status === "COMPLETED" && (
                                <a
                                  href={`/api/exports/${e.id}`}
                                  className="ts-focus rounded-md px-2.5 py-1 text-xs font-medium"
                                  style={{
                                    background: "var(--surface-2)",
                                    color: "var(--text-default)",
                                    border: "1px solid var(--border-default)",
                                  }}
                                >
                                  Download
                                </a>
                              )}
                              <form action={regenerateDataExport.bind(null, e.id)}>
                                <ActionButton tone="neutral">Regenerate</ActionButton>
                              </form>
                            </>
                          )}
                          {(e.status === "PENDING" || e.status === "PROCESSING" || e.status === "FAILED") && !isCanceled && (
                            <form action={cancelDataExportAsStaff.bind(null, e.id)}>
                              <input type="hidden" name="reason" value="Canceled by admin" />
                              <ActionButton tone="danger">Cancel</ActionButton>
                            </form>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Recent completed exports ───────────────────── */}
      {completedRecent.length > 0 && exportFilter !== "completed" && (
        <Section
          title="Recently completed exports"
          description="Latest 10 fulfilled exports — for quick re-download or regenerate."
        >
          <ul className="-mx-5 -mb-5">
            {completedRecent.map((e, idx) => {
              const t = tenantById.get(e.tenantId);
              const expired = e.expiresAt && e.expiresAt.getTime() < Date.now();
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium" style={{ color: "var(--text-default)" }}>
                      {t ? t.name : <span style={{ color: "var(--text-faint)" }}>deleted tenant</span>}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      completed {e.completedAt?.toISOString().slice(0, 10)}{" "}
                      {expired
                        ? "· link expired"
                        : e.expiresAt && `· expires ${e.expiresAt.toISOString().slice(0, 10)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!expired && (
                      <a
                        href={`/api/exports/${e.id}`}
                        className="ts-focus rounded-md px-2.5 py-1 text-xs font-medium"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-default)",
                          border: "1px solid var(--border-default)",
                        }}
                      >
                        Download
                      </a>
                    )}
                    <form action={regenerateDataExport.bind(null, e.id)}>
                      <ActionButton tone="neutral">Regenerate</ActionButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ── Deletion queue ─────────────────────────────── */}
      <Section
        title="Account deletion queue"
        description="Tenant-initiated deletions cool off through a grace window before being executable. Cancel any time; extend if a tenant asks."
        right={
          <FilterChips
            paramKey="deletionFilter"
            current={deletionFilter}
            options={[
              { value: "scheduled",  label: "Scheduled" },
              { value: "executable", label: "Executable now" },
              { value: "completed",  label: "Completed" },
              { value: "canceled",   label: "Canceled" },
              { value: "all",        label: "All" },
            ]}
          />
        }
      >
        {visibleDeletions.length === 0 ? (
          <Empty
            icon="🗑️"
            title="No deletion requests match."
            body={
              deletionFilter === "scheduled"
                ? "Tenants haven't asked to delete their accounts. They go through a 30-day grace by default."
                : "Adjust the filter or clear search."
            }
          />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <Th>Tenant</Th>
                  <Th>Requested by</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th>Scheduled</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {visibleDeletions.map((d, idx) => {
                  const t = tenantById.get(d.tenantId);
                  const u = userById.get(d.requestedBy);
                  const tone = DELETION_STATUS_TONE[d.status];
                  const daysLeft = Math.ceil((d.scheduledFor.getTime() - Date.now()) / DAY_MS);
                  const executable = d.status === "SCHEDULED" && daysLeft <= 0;
                  return (
                    <tr
                      key={d.id}
                      style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <Td>
                        {t ? (
                          <Link
                            href={`/platform/tenants/${t.id}`}
                            className="text-sm font-medium hover:underline"
                            style={{ color: "var(--text-default)" }}
                          >
                            {t.name}
                          </Link>
                        ) : <span style={{ color: "var(--text-faint)" }}>deleted tenant</span>}
                        <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                          #{d.id.slice(0, 8)}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-xs" style={{ color: "var(--text-default)" }}>
                          {u?.name ?? u?.email ?? <span style={{ color: "var(--text-faint)" }}>unknown</span>}
                        </div>
                      </Td>
                      <Td>
                        {d.reason ? (
                          <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>
                            "{d.reason.slice(0, 80)}{d.reason.length > 80 ? "…" : ""}"
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </Td>
                      <Td>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}
                        >
                          {tone.label}
                        </span>
                      </Td>
                      <Td>
                        <div className="text-xs" style={{ color: "var(--text-default)" }}>
                          {d.scheduledFor.toISOString().slice(0, 10)}
                        </div>
                        {d.status === "SCHEDULED" && (
                          <div
                            className="mt-0.5 text-[10px]"
                            style={{ color: executable ? "var(--danger-fg)" : "var(--text-muted)" }}
                          >
                            {executable ? "grace elapsed — executable" : `${daysLeft}d remaining`}
                          </div>
                        )}
                        {d.status === "COMPLETED" && d.completedAt && (
                          <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                            executed {d.completedAt.toISOString().slice(0, 10)}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {d.status === "SCHEDULED" && (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <ExtendForm requestId={d.id} />
                            <form action={cancelAccountDeletionAsStaff.bind(null, d.id)}>
                              <ActionButton tone="neutral">Cancel</ActionButton>
                            </form>
                            <form action={executeAccountDeletion.bind(null, d.id)}>
                              <ActionButton tone="danger" disabled={!executable}>Execute</ActionButton>
                            </form>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Recent deletion outcomes ───────────────────── */}
      {deletionRecent.length > 0 && deletionFilter === "scheduled" && (
        <Section
          title="Recent deletion outcomes"
          description="Last 10 completed or canceled deletions."
        >
          <ul className="-mx-5 -mb-5">
            {deletionRecent.map((d, idx) => {
              const t = tenantById.get(d.tenantId);
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between px-5 py-2.5 text-sm"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <span style={{ color: "var(--text-default)" }}>
                    {t ? t.name : <span style={{ color: "var(--text-faint)" }}>deleted tenant</span>}
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                      style={{
                        background: d.status === "COMPLETED" ? "var(--danger-surface)" : "var(--surface-2)",
                        color:      d.status === "COMPLETED" ? "var(--danger-fg)"      : "var(--text-muted)",
                      }}
                    >
                      {d.status.toLowerCase()}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {(d.completedAt ?? d.canceledAt ?? d.updatedAt).toISOString().slice(0, 10)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ── Compliance activity history ────────────────── */}
      <Section
        title="Compliance activity (30d)"
        description="Audit-derived. Every fulfillment / cancellation / execution writes to platform.* actions."
      >
        {auditHistory.length === 0 ? (
          <Empty icon="📜" title="No compliance activity yet." body="Once an export or deletion happens, it'll show up here." />
        ) : (
          <ol className="-mx-5 -mb-5">
            {auditHistory.map((a, idx) => {
              const t = a.tenantId ? tenantById.get(a.tenantId) : null;
              const u = a.userId ? userById.get(a.userId) : null;
              const isDeletion = a.action.startsWith("platform.deletion_");
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[16px_1fr] gap-3 px-5 py-2.5"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: isDeletion ? "var(--danger-fg)" : "var(--accent-primary)" }}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="font-mono" style={{ color: "var(--text-default)" }}>
                        {a.action}
                      </span>
                      <span className="ml-auto whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {ageLabel(a.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {t ? (
                        <Link href={`/platform/tenants/${t.id}`} className="underline">{t.name}</Link>
                      ) : "platform"}
                      {u && <> · by {u.name ?? u.email}</>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Every action on this page is audit-logged.{" "}
        <Link href="/platform/audit?scope=platform" className="underline">View the full platform audit log →</Link>
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function ExtendForm({ requestId }: { requestId: string }) {
  return (
    <form action={extendDeletionGracePeriod.bind(null, requestId)} className="inline-flex items-center gap-1">
      <select
        name="days"
        defaultValue="30"
        className="ts-focus rounded-md px-2 py-1 text-xs outline-none"
        style={{
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-default)",
        }}
      >
        <option value="7">+7d</option>
        <option value="14">+14d</option>
        <option value="30">+30d</option>
        <option value="90">+90d</option>
      </select>
      <ActionButton tone="neutral">Extend</ActionButton>
    </form>
  );
}

function FilterChips({
  paramKey,
  current,
  options,
}: {
  paramKey: string;
  current: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={{ query: { [paramKey]: o.value } }}
            className="ts-focus rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              background: active ? "var(--accent-primary)" : "var(--surface-1)",
              color:      active ? "var(--accent-fg)"      : "var(--text-muted)",
              border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
            }}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

function ActionButton({
  tone,
  children,
  disabled,
}: {
  tone: "accent" | "neutral" | "danger";
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const style: React.CSSProperties =
    tone === "accent"
      ? { background: "var(--accent-primary)", color: "var(--accent-fg)" }
      : tone === "danger"
      ? {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-default)",
          border: "1px solid var(--border-default)",
        };
  return (
    <button
      type="submit"
      disabled={disabled}
      className="ts-focus rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
          )}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="px-2 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
      <div className="mb-1 text-2xl" aria-hidden>{icon}</div>
      <div className="font-medium" style={{ color: "var(--text-default)" }}>{title}</div>
      <div className="mt-1 text-xs">{body}</div>
    </div>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3 align-top">{children}</td>;
}

function pctDelta(current: number, prior: number): number | undefined {
  if (prior <= 0) return current > 0 ? 1 : undefined;
  return (current - prior) / prior;
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;
  const days = hrs / 24;
  return `${days.toFixed(days < 10 ? 1 : 0)}d`;
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
