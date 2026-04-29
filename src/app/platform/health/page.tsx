import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { HealthKPIBand, type HealthKpi } from "@/components/platform/HealthKPIBand";
import { ServiceStatusGrid, type ServiceCard, type ServiceStatus } from "@/components/platform/ServiceStatusGrid";
import { HealthInsights, type HealthInsight } from "@/components/platform/HealthInsights";
import { ServiceMetricsChart, type MetricsBucket } from "@/components/platform/ServiceMetricsChart";
import { HealthAdminActions } from "@/components/platform/HealthAdminActions";
import { HealthLogsPanel, type LogEntry } from "@/components/platform/HealthLogsPanel";

export const dynamic = "force-dynamic";

// /platform/health — operational mission control (transformation rewrite).
//
// Layout:
//   1. Global health banner — Healthy / Degraded / Down
//   2. KPI band — overall status, active sessions, errors (1h), failed
//      jobs (24h), login fails (24h), open incidents proxy
//   3. Auto-generated insights (warning / info / positive)
//   4. Service status grid — Auth / Email / Stripe / Storage /
//      Background / Database with status pills + headline metric
//   5. Service drill-downs — Email delivery card + recent failures,
//      Auth telemetry + spiking-user table
//   6. Impersonation table (active sessions)
//   7. Critical action timeline (audit-derived)
//
// Time range is URL-driven via ?range=1h|24h|7d|30d.

const RANGE_OPTIONS = ["1h", "24h", "7d", "30d"] as const;
type Range = (typeof RANGE_OPTIONS)[number];

const HOUR_MS = 3_600_000;
const DAY_MS  = 86_400_000;

function rangeToMs(r: Range): number {
  return r === "1h" ? HOUR_MS : r === "24h" ? DAY_MS : r === "7d" ? 7 * DAY_MS : 30 * DAY_MS;
}
function rangeLabel(r: Range): string {
  return r === "1h" ? "Last hour" : r === "24h" ? "Last 24 hours" : r === "7d" ? "Last 7 days" : "Last 30 days";
}

export default async function PlatformHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const rangeRaw = (sp.range ?? "24h").toLowerCase();
  const range: Range = (RANGE_OPTIONS as readonly string[]).includes(rangeRaw)
    ? (rangeRaw as Range)
    : "24h";
  const windowMs = rangeToMs(range);

  const now = new Date();
  const lastHour    = new Date(now.getTime() - HOUR_MS);
  const last24h     = new Date(now.getTime() - DAY_MS);
  const last7d      = new Date(now.getTime() - 7 * DAY_MS);
  const last30d     = new Date(now.getTime() - 30 * DAY_MS);
  const windowStart = new Date(now.getTime() - windowMs);

  // ── Parallel data fetch ──────────────────────────────────────
  const [
    // Email
    sentWindow, failedWindow, sent7d, failed7d, bounced7d, failedSample,
    // Auth / security
    loginSuccessWindow, loginFailedWindow, loginFailedHour,
    locked24h, twoFactorFailed7d, failedLoginsByUser,
    // Impersonation
    activeImpersonations, recentImpersonations,
    // Stripe / billing — pastDue tenant count is the rolling proxy
    pastDueTenants, stripeMissingLive,
    // Storage — uploads in window (signal: storage write path is alive)
    uploadsWindow, uploadsPriorWindow,
    // Background jobs — cron audit events in 24h
    cronEventsWindow,
    // Sessions (active)
    activeSessions,
    // Errors aggregate (email + 2FA + login locked) for the "errors in window" tile
    errorsWindow,
    // Pending ops
    pendingExports, scheduledDeletions,
    // Recent critical actions
    criticalAudits,
    // Open incidents — surface CRITICAL announcements that are live
    criticalAnnouncements,
  ] = await Promise.all([
    db.emailEvent.count({ where: { sentAt:    { gte: windowStart } } }),
    db.emailEvent.count({ where: { failedAt:  { gte: windowStart } } }),
    db.emailEvent.count({ where: { sentAt:    { gte: last7d } } }),
    db.emailEvent.count({ where: { failedAt:  { gte: last7d } } }),
    db.emailEvent.count({ where: { failedAt:  { gte: last7d }, failReason: { contains: "bounce", mode: "insensitive" } } }),
    db.emailEvent.findMany({
      where: { failedAt: { gte: windowStart } },
      orderBy: { failedAt: "desc" },
      take: 8,
      select: { id: true, toAddress: true, subject: true, failedAt: true, failReason: true, kind: true, tenantId: true },
    }),
    db.securityEvent.count({ where: { kind: "LOGIN_SUCCESS", createdAt: { gte: windowStart } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_FAILED",  createdAt: { gte: windowStart } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_FAILED",  createdAt: { gte: lastHour } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_LOCKED",  createdAt: { gte: last24h } } }),
    db.securityEvent.count({ where: { kind: "TWO_FACTOR_CHALLENGE_FAILED", createdAt: { gte: last7d } } }),
    db.securityEvent.groupBy({
      by: ["userId"],
      where: { kind: "LOGIN_FAILED", createdAt: { gte: last24h } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }),
    db.impersonationSession.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, startedAt: true, reason: true, tenantId: true, platformUserId: true },
    }),
    db.impersonationSession.count({ where: { startedAt: { gte: last7d } } }),
    db.tenant.count({ where: { status: "PAST_DUE" } }),
    db.tenant.count({ where: { status: { in: ["ACTIVE", "PAST_DUE", "TRIAL"] }, environment: "LIVE", stripeCustomerId: null } }),
    db.file.count({ where: { createdAt: { gte: windowStart } } }),
    db.file.count({ where: { createdAt: { gte: new Date(windowStart.getTime() - windowMs), lt: windowStart } } }),
    db.auditLog.count({
      where: {
        createdAt: { gte: last24h },
        action: { startsWith: "cron." },
      },
    }),
    db.session.count({ where: { expires: { gt: now } } }),
    db.emailEvent.count({ where: { failedAt: { gte: lastHour } } }),
    db.dataExportRequest.count({ where: { status: "PENDING" } }),
    db.accountDeletionRequest.count({
      where: { status: "SCHEDULED", scheduledFor: { lte: new Date(now.getTime() + 7 * DAY_MS) } },
    }),
    db.auditLog.findMany({
      where: {
        createdAt: { gte: last30d },
        OR: [
          { action: { startsWith: "platform." } },
          { action: { contains: "suspended" } },
          { action: { contains: "impersonat" } },
          { action: { contains: "deleted" } },
          { action: { contains: "feature_flag" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, createdAt: true, entityType: true, entityId: true, tenant: { select: { id: true, name: true } } },
    }),
    db.platformAnnouncement.count({
      where: {
        priority: "CRITICAL",
        OR: [
          { status: "PUBLISHED" },
          { status: "SCHEDULED", publishAt: { lte: now } },
        ],
        AND: [{ OR: [{ expireAt: null }, { expireAt: { gt: now } }] }],
      },
    }),
  ]);

  // ── Time-series fetches for the charts (separate await — depends
  // on `windowStart` already being computed). Pull just the
  // timestamps so we can bucket them in JS. Cheap for windowed
  // counts and avoids needing date_trunc in raw SQL.
  const [errorTimestamps, loginFailTimestamps] = await Promise.all([
    db.emailEvent.findMany({
      where:    { failedAt: { gte: windowStart } },
      select:   { failedAt: true },
      take:     1000,
    }),
    db.securityEvent.findMany({
      where:    { kind: "LOGIN_FAILED", createdAt: { gte: windowStart } },
      select:   { createdAt: true },
      take:     1000,
    }),
  ]);

  // ── Pull raw rows for the unified log feed (latest 50).
  // Three sources merged into one timeline; severity derived per-source.
  const [auditFeed, securityFeed, emailFailFeed] = await Promise.all([
    db.auditLog.findMany({
      where: {
        createdAt: { gte: last30d },
        OR: [
          { action: { startsWith: "platform." } },
          { action: { contains: "suspended" } },
          { action: { contains: "impersonat" } },
          { action: { contains: "deleted" } },
          { action: { contains: "feature_flag" } },
          { action: { startsWith: "cron." } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        createdAt: true,
        entityType: true,
        entityId: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
    db.securityEvent.findMany({
      where: {
        createdAt: { gte: windowStart },
        kind: { in: ["LOGIN_FAILED", "LOGIN_LOCKED", "TWO_FACTOR_CHALLENGE_FAILED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, kind: true, createdAt: true, userId: true, ipAddress: true },
    }),
    db.emailEvent.findMany({
      where:   { failedAt: { gte: windowStart } },
      orderBy: { failedAt: "desc" },
      take: 15,
      select: { id: true, kind: true, failedAt: true, toAddress: true, failReason: true },
    }),
  ]);

  // Resolve security-event user names in bulk for the log feed.
  const secUserIds = Array.from(new Set(securityFeed.map((s) => s.userId).filter((x): x is string => Boolean(x))));
  const secUsers = secUserIds.length
    ? await db.user.findMany({ where: { id: { in: secUserIds } }, select: { id: true, email: true } })
    : [];
  const secUserById = new Map(secUsers.map((u) => [u.id, u]));

  // ── Resolve names ───────────────────────────────────────────
  const impUserIds   = Array.from(new Set(activeImpersonations.map((s) => s.platformUserId)));
  const impTenantIds = Array.from(new Set(activeImpersonations.map((s) => s.tenantId)));
  const spikeIds     = failedLoginsByUser.map((r) => r.userId);
  const [impUsers, impTenants, spikeUsers] = await Promise.all([
    impUserIds.length   ? db.user.findMany({ where: { id: { in: impUserIds } },   select: { id: true, email: true, name: true } }) : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
    impTenantIds.length ? db.tenant.findMany({ where: { id: { in: impTenantIds } }, select: { id: true, name: true } })             : Promise.resolve([] as { id: string; name: string }[]),
    spikeIds.length     ? db.user.findMany({ where: { id: { in: spikeIds } },     select: { id: true, email: true } })            : Promise.resolve([] as { id: string; email: string }[]),
  ]);
  const impUserById   = new Map(impUsers.map((u) => [u.id, u]));
  const impTenantById = new Map(impTenants.map((t) => [t.id, t]));
  const spikeUserById = new Map(spikeUsers.map((u) => [u.id, u]));

  // ── Time-series buckets for the charts ───────────────────────
  // Pick a bucket size that keeps the chart legible: hour buckets for
  // <= 24h windows, day buckets for longer windows.
  const bucketSizeMs = range === "1h" ? 5 * 60_000 // 5-minute buckets for "last hour"
    : range === "24h" ? HOUR_MS                     // hourly for 24h
    : DAY_MS;                                       // daily for 7d / 30d
  const errorBuckets        = bucketize(errorTimestamps.map((e) => e.failedAt!),     windowStart, now, bucketSizeMs, range);
  const loginFailBuckets    = bucketize(loginFailTimestamps.map((s) => s.createdAt), windowStart, now, bucketSizeMs, range);

  // ── Unified log feed ─────────────────────────────────────────
  // Merge audit / security / email-fail rows into a single LogEntry[],
  // sorted by createdAt desc, capped at 50.
  const logEntries: LogEntry[] = [
    ...auditFeed.map<LogEntry>((a) => ({
      id: `audit-${a.id}`,
      source: "AUDIT",
      action: a.action,
      summary: a.tenant?.name
        ? `${a.tenant.name} · ${a.action.split(".").pop()}`
        : a.action,
      detail: a.entityType ? `${a.entityType}${a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}` : undefined,
      severity:
        a.action.includes("suspended") || a.action.includes("deleted") ? "danger" :
        a.action.includes("impersonat") || a.action.includes("feature_flag") ? "warning" :
        "info",
      createdAt: a.createdAt.toISOString(),
    })),
    ...securityFeed.map<LogEntry>((s) => {
      const u = s.userId ? secUserById.get(s.userId) : null;
      return {
        id: `sec-${s.id}`,
        source: "SECURITY",
        action: s.kind,
        summary: u?.email ?? "unknown user",
        detail: s.ipAddress ? `from ${s.ipAddress}` : undefined,
        severity:
          s.kind === "LOGIN_LOCKED" || s.kind === "TWO_FACTOR_CHALLENGE_FAILED" ? "danger" :
          "warning",
        createdAt: s.createdAt.toISOString(),
      };
    }),
    ...emailFailFeed.map<LogEntry>((e) => ({
      id: `email-${e.id}`,
      source: "EMAIL",
      action: `email.${e.kind}.failed`,
      summary: `to ${e.toAddress}`,
      detail: e.failReason ?? undefined,
      severity: "danger",
      createdAt: e.failedAt!.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  // ── Derived metrics ─────────────────────────────────────────
  const deliveryRateWindow = sentWindow === 0 ? 100 : ((sentWindow - failedWindow) / sentWindow) * 100;
  const deliveryRate7d     = sent7d      === 0 ? 100 : ((sent7d - failed7d) / sent7d)         * 100;
  const loginFailureRate   = (loginSuccessWindow + loginFailedWindow) === 0
    ? 0
    : (loginFailedWindow / (loginSuccessWindow + loginFailedWindow)) * 100;

  // ── Service status derivation ───────────────────────────────
  const authStatus: ServiceStatus =
    locked24h > 5 || loginFailedHour > 50         ? "degraded"
    : loginFailureRate > 60                       ? "degraded"
    : "operational";
  const emailStatus: ServiceStatus =
    deliveryRate7d < 90                           ? "down"
    : deliveryRate7d < 97 || failedWindow > 10    ? "degraded"
    : "operational";
  const stripeStatus: ServiceStatus =
    pastDueTenants > 5 || stripeMissingLive > 0   ? "degraded"
    : "operational";
  const storageStatus: ServiceStatus =
    uploadsWindow === 0 && uploadsPriorWindow > 0 ? "degraded"
    : "operational";
  const jobsStatus: ServiceStatus =
    cronEventsWindow === 0                        ? "degraded"
    : "operational";
  const dbStatus: ServiceStatus = "operational"; // we just queried it successfully

  const services: ServiceCard[] = [
    {
      id: "auth",
      name: "Authentication",
      status: authStatus,
      primary: `${loginFailureRate.toFixed(1)}% fail rate`,
      secondary: `${loginSuccessWindow} OK · ${loginFailedWindow} failed (${rangeLabel(range).toLowerCase()})`,
      footnote: `${locked24h} lockouts · ${twoFactorFailed7d} 2FA fails (7d)`,
    },
    {
      id: "email",
      name: "Email delivery",
      status: emailStatus,
      primary: `${deliveryRate7d.toFixed(1)}% delivered`,
      secondary: `${sent7d} sent · ${failed7d} failed (7d)`,
      footnote: `${bounced7d} bounces · ${sentWindow} sent in window`,
    },
    {
      id: "stripe",
      name: "Stripe billing",
      status: stripeStatus,
      primary: `${pastDueTenants} past-due`,
      secondary: stripeMissingLive > 0
        ? `${stripeMissingLive} live tenant${stripeMissingLive === 1 ? "" : "s"} missing Stripe linkage`
        : "All live tenants linked",
      footnote: "Derived from Tenant.status + Tenant.stripeCustomerId",
    },
    {
      id: "storage",
      name: "File storage",
      status: storageStatus,
      primary: uploadsWindow.toLocaleString() + " uploads",
      secondary: `In window · ${uploadsPriorWindow} prior`,
      footnote: "Cloudflare R2 (write path inferred from File table)",
    },
    {
      id: "jobs",
      name: "Background jobs",
      status: jobsStatus,
      primary: cronEventsWindow.toLocaleString() + " events",
      secondary: cronEventsWindow === 0 ? "No cron activity in 24h" : "Cron heartbeat OK",
      footnote: "AuditLog where action LIKE 'cron.*'",
    },
    {
      id: "db",
      name: "Database",
      status: dbStatus,
      primary: "Reachable",
      secondary: `${activeSessions} active session${activeSessions === 1 ? "" : "s"}`,
      footnote: "Postgres on Neon · query path proven by this page",
    },
  ];

  // ── Global health derivation ─────────────────────────────────
  const allStatuses = services.map((s) => s.status);
  const overall: ServiceStatus =
    allStatuses.includes("down")     ? "down"
    : allStatuses.includes("degraded") ? "degraded"
    : "operational";

  // ── KPI tiles ────────────────────────────────────────────────
  const overallToneKpi: HealthKpi["tone"] =
    overall === "down" ? "danger" : overall === "degraded" ? "warning" : "success";
  const overallLabel = overall === "operational" ? "All systems normal" : overall === "degraded" ? "Degraded" : "Down";

  const kpis: HealthKpi[] = [
    {
      label: "Status",
      value: overallLabel,
      hint: rangeLabel(range),
      tone: overallToneKpi,
      dot: true,
    },
    {
      label: "Active sessions",
      value: activeSessions.toLocaleString(),
      hint: "Currently signed-in users",
      tone: "default",
    },
    {
      label: "Errors (1h)",
      value: errorsWindow.toLocaleString(),
      hint: errorsWindow === 0 ? "Clean" : "Email failures last hour",
      tone: errorsWindow === 0 ? "default" : errorsWindow > 5 ? "danger" : "warning",
      deltaInvert: true,
    },
    {
      label: "Login fails (1h)",
      value: loginFailedHour.toLocaleString(),
      hint: loginFailedHour > 30 ? "Possible brute-force" : "Last 60 minutes",
      tone: loginFailedHour > 30 ? "danger" : loginFailedHour > 10 ? "warning" : "default",
    },
    {
      label: "Open ops backlog",
      value: (pendingExports + scheduledDeletions).toString(),
      hint: `${pendingExports} exports · ${scheduledDeletions} deletions`,
      tone: pendingExports + scheduledDeletions > 5 ? "warning" : "default",
    },
    {
      label: "Open incidents",
      value: criticalAnnouncements.toString(),
      hint: criticalAnnouncements === 0 ? "No active alerts" : "Critical announcements live",
      tone: criticalAnnouncements > 0 ? "danger" : "success",
    },
  ];

  // ── Auto-generated insights ─────────────────────────────────
  const insights: HealthInsight[] = [];
  if (deliveryRate7d < 95) {
    insights.push({
      id: "email-low",
      tone: deliveryRate7d < 90 ? "danger" : "warning",
      text: `Email delivery dipped to ${deliveryRate7d.toFixed(1)}% over 7 days — investigate failed events.`,
    });
  }
  if (loginFailedHour > 30) {
    insights.push({
      id: "login-spike",
      tone: "warning",
      text: `${loginFailedHour} failed logins in the last hour. Check for brute-force or credential-stuffing attempts.`,
    });
  }
  if (locked24h > 3) {
    insights.push({
      id: "lockouts",
      tone: "warning",
      text: `${locked24h} accounts have been auto-locked in the last 24 hours.`,
    });
  }
  if (activeImpersonations.length > 0) {
    insights.push({
      id: "imp-active",
      tone: "info",
      text: `${activeImpersonations.length} active impersonation session${activeImpersonations.length === 1 ? "" : "s"} running right now.`,
    });
  }
  if (cronEventsWindow === 0) {
    insights.push({
      id: "cron-silent",
      tone: "warning",
      text: "No cron events in the last 24 hours — background jobs may not be firing.",
    });
  }
  if (stripeMissingLive > 0) {
    insights.push({
      id: "stripe-missing",
      tone: "warning",
      text: `${stripeMissingLive} live tenant${stripeMissingLive === 1 ? "" : "s"} have no Stripe customer — billing won't run.`,
    });
  }
  if (insights.length === 0 && overall === "operational") {
    insights.push({
      id: "all-good",
      tone: "positive",
      text: "All monitored services healthy. No action needed.",
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Platform health
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Mission control across authentication, email, billing, storage, background jobs, and the database.
            Status derived from observable signals; ranges aggregate across the selected window.
          </p>
        </div>
        <RangeSelector active={range} />
      </div>

      {/* ── Global banner ──────────────────────────────── */}
      <GlobalStatusBanner status={overall} />

      {/* ── KPI band ───────────────────────────────────── */}
      <HealthKPIBand kpis={kpis} />

      {/* ── Insights strip ─────────────────────────────── */}
      <HealthInsights insights={insights.slice(0, 4)} />

      {/* ── Service grid ───────────────────────────────── */}
      <div>
        <SectionHeader title="Service status" />
        <div className="mt-3">
          <ServiceStatusGrid services={services} />
        </div>
      </div>

      {/* ── Service monitoring charts ──────────────────── */}
      <div>
        <SectionHeader title="Service monitoring" />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Section
            title="Email failures over time"
            description={`Bucket size: ${bucketSizeLabel(range)}. ${errorTimestamps.length} event${errorTimestamps.length === 1 ? "" : "s"} in window.`}
          >
            <ServiceMetricsChart buckets={errorBuckets} tone="danger" yLabel="failures" />
          </Section>
          <Section
            title="Failed logins over time"
            description={`Bucket size: ${bucketSizeLabel(range)}. ${loginFailTimestamps.length} attempt${loginFailTimestamps.length === 1 ? "" : "s"} in window.`}
          >
            <ServiceMetricsChart buckets={loginFailBuckets} tone="warning" yLabel="failures" />
          </Section>
        </div>
      </div>

      {/* ── Admin actions ──────────────────────────────── */}
      <div>
        <SectionHeader title="Admin actions" />
        <div className="mt-3">
          <HealthAdminActions
            activeImpersonationCount={activeImpersonations.length}
            canMutate={true /* requirePlatformAdmin gates the action server-side */}
          />
        </div>
      </div>

      {/* ── Logs & diagnostics ─────────────────────────── */}
      <div>
        <SectionHeader title="Logs &amp; diagnostics" />
        <div className="mt-3">
          <HealthLogsPanel entries={logEntries} />
        </div>
      </div>

      {/* ── Email + auth detail ────────────────────────── */}
      <div>
        <SectionHeader title="Drill-downs" />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Section title="Email failures" description={`Most recent ${failedSample.length} failures in the active window.`}>
            {failedSample.length === 0 ? (
              <Empty icon="✉" body="No email failures in the selected window." />
            ) : (
              <ul>
                {failedSample.map((e, idx) => (
                  <li
                    key={e.id}
                    className="px-1 py-3"
                    style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" style={{ color: "var(--text-default)" }}>
                          {e.subject ?? e.kind}
                        </div>
                        <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          to {e.toAddress}
                        </div>
                        {e.failReason && (
                          <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--danger-fg)" }}>
                            {e.failReason}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {ageLabel(e.failedAt!)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Top failed-login users (24h)" description="Users with the most LOGIN_FAILED events in the last day.">
            {failedLoginsByUser.length === 0 ? (
              <Empty icon="🔒" body="No failed logins in the last 24 hours." />
            ) : (
              <ul>
                {failedLoginsByUser.map((row, idx) => {
                  const u = spikeUserById.get(row.userId);
                  const dangerous = row._count._all > 5;
                  return (
                    <li
                      key={row.userId}
                      className="flex items-center justify-between px-1 py-2.5 text-sm"
                      style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <span className="truncate" style={{ color: "var(--text-default)" }}>
                        {u?.email ?? row.userId}
                      </span>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                        style={{
                          background: dangerous ? "var(--danger-surface)" : "var(--surface-2)",
                          color: dangerous ? "var(--danger-fg)" : "var(--text-muted)",
                          border: `1px solid ${dangerous ? "var(--danger-fg)" : "var(--border-subtle)"}`,
                        }}
                      >
                        {row._count._all} attempts
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>

      {/* ── Impersonation ──────────────────────────────── */}
      <div>
        <SectionHeader title="Impersonation" />
        <Section className="mt-3" title="Active sessions" description={`${activeImpersonations.length} now · ${recentImpersonations} in the last 7 days.`}>
          {activeImpersonations.length === 0 ? (
            <Empty icon="👥" body="No platform staff are currently signed in as a tenant." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <Th>Admin</Th>
                  <Th>Tenant</Th>
                  <Th>Reason</Th>
                  <Th>Started</Th>
                </tr>
              </thead>
              <tbody>
                {activeImpersonations.map((s, idx) => {
                  const u = impUserById.get(s.platformUserId);
                  const t = impTenantById.get(s.tenantId);
                  const mins = Math.round((Date.now() - s.startedAt.getTime()) / 60000);
                  return (
                    <tr key={s.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                      <Td>{u?.name ?? u?.email ?? "unknown"}</Td>
                      <Td>
                        {t ? (
                          <Link href={`/platform/tenants/${t.id}`} className="underline">{t.name}</Link>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>deleted</span>
                        )}
                      </Td>
                      <Td muted>{s.reason ?? "—"}</Td>
                      <Td muted>{mins < 1 ? "just now" : `${mins}m ago`}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      {/* ── Critical actions audit ─────────────────────── */}
      <div>
        <SectionHeader title="Critical actions (30d)" />
        <Section className="mt-3" title="Audit-derived event log" description="Suspensions, archives, impersonations, deletions, and feature-flag flips across the platform.">
          {criticalAudits.length === 0 ? (
            <Empty icon="📜" body="No suspensions, impersonations, deletions, or flag flips in the last 30 days." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <Th>Action</Th>
                  <Th>Tenant</Th>
                  <Th>Entity</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {criticalAudits.map((a, idx) => (
                  <tr key={a.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                    <Td className="font-mono text-xs">{a.action}</Td>
                    <Td>
                      {a.tenant ? (
                        <Link href={`/platform/tenants/${a.tenant.id}`} className="underline">{a.tenant.name}</Link>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>platform</span>
                      )}
                    </Td>
                    <Td muted>{a.entityType ?? "—"}</Td>
                    <Td muted>{ageLabel(a.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="border-t pt-3 text-xs" style={{ borderColor: "var(--border-subtle)" }}>
            <Link href="/platform/audit" className="underline" style={{ color: "var(--accent-primary)" }}>
              Full audit log →
            </Link>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function RangeSelector({ active }: { active: Range }) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md p-1"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
    >
      {RANGE_OPTIONS.map((r) => {
        const isActive = r === active;
        return (
          <Link
            key={r}
            href={`/platform/health?range=${r}`}
            className="ts-focus rounded px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              background: isActive ? "var(--surface-1)" : "transparent",
              color:      isActive ? "var(--text-default)" : "var(--text-muted)",
              border: `1px solid ${isActive ? "var(--border-default)" : "transparent"}`,
            }}
          >
            {r}
          </Link>
        );
      })}
    </div>
  );
}

function GlobalStatusBanner({ status }: { status: ServiceStatus }) {
  const meta: Record<ServiceStatus, { bg: string; fg: string; border: string; icon: string; title: string; body: string }> = {
    operational: {
      bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)",
      icon: "✓", title: "All systems operational",
      body: "No critical anomalies detected across monitored services.",
    },
    degraded: {
      bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "var(--warning-fg)",
      icon: "⚠", title: "Degraded performance",
      body: "At least one service is showing elevated failure rates. Investigate the service grid below.",
    },
    down: {
      bg: "var(--danger-surface)", fg: "var(--danger-fg)", border: "var(--danger-fg)",
      icon: "✖", title: "Major incident",
      body: "A critical service is failing above tolerated thresholds. Open incident response.",
    },
    unknown: {
      bg: "var(--surface-2)", fg: "var(--text-muted)", border: "var(--border-default)",
      icon: "?", title: "Status unknown", body: "Health probes haven't reported yet.",
    },
  };
  const m = meta[status];
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-5 py-4"
      style={{ background: m.bg, border: `1px solid ${m.border}` }}
    >
      <span
        aria-hidden
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold"
        style={{ background: m.fg, color: m.bg }}
      >
        {m.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold" style={{ color: m.fg }}>
          {m.title}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-default)" }}>
          {m.body}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2
      className="text-xs font-semibold uppercase tracking-wide"
      style={{ color: "var(--text-muted)" }}
    >
      {title}
    </h2>
  );
}

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl ${className ?? ""}`}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Empty({ icon, body }: { icon: string; body: string }) {
  return (
    <div className="text-center" style={{ color: "var(--text-muted)" }}>
      <div className="mb-1 text-xl" aria-hidden>{icon}</div>
      <div className="text-sm">{body}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children, muted, className }: { children: React.ReactNode; muted?: boolean; className?: string }) {
  return (
    <td
      className={`px-2 py-2 ${className ?? ""}`}
      style={muted ? { color: "var(--text-muted)" } : undefined}
    >
      {children}
    </td>
  );
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

// Bucket a list of Date timestamps into fixed-size time buckets across
// [start, end]. Empty buckets are filled with count=0 so the chart
// shows continuous time. Labels are formatted per range so the x-axis
// stays legible: "14:30" for sub-day windows, "Mon 28" for day buckets.
function bucketize(
  timestamps: Date[],
  start: Date,
  end: Date,
  bucketMs: number,
  range: Range,
): MetricsBucket[] {
  const startMs = Math.floor(start.getTime() / bucketMs) * bucketMs;
  const endMs   = Math.ceil(end.getTime() / bucketMs) * bucketMs;
  const counts = new Map<number, number>();
  for (const t of timestamps) {
    const bucket = Math.floor(t.getTime() / bucketMs) * bucketMs;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const out: MetricsBucket[] = [];
  for (let t = startMs; t < endMs; t += bucketMs) {
    out.push({
      t,
      label: formatBucketLabel(new Date(t), range),
      count: counts.get(t) ?? 0,
    });
  }
  return out;
}

function formatBucketLabel(d: Date, range: Range): string {
  if (range === "1h") {
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  }
  if (range === "24h") {
    return `${pad2(d.getUTCHours())}:00`;
  }
  // Day buckets — short weekday + day-of-month for 7d / 30d.
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
  return `${wd} ${d.getUTCDate()}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function bucketSizeLabel(range: Range): string {
  return range === "1h"  ? "5 minutes"
    : range === "24h"   ? "1 hour"
    : range === "7d"    ? "1 day"
    : "1 day";
}
