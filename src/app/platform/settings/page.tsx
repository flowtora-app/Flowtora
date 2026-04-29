import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { listRegistrations } from "@/lib/notifications";
import { getPlatformSettings } from "@/lib/platform-settings";
import { updatePlatformSettings } from "@/app/actions/platform";
import { SettingsKPIBand, type SettingsKpi } from "@/components/platform/SettingsKPIBand";

// /platform/settings — platform control center (transformation rewrite).
//
// Read-only by design. Env vars and most config live outside the DB
// (hosting provider). This page surfaces:
//   1. KPI band — env health %, critical missing, integration health,
//      admin actions in last 24h, deployment env
//   2. Grouped environment variables by domain + severity
//   3. Integration health row (Stripe / Email / Storage / Sentry)
//   4. Modules grid — live counts pulled from DB
//   5. Security & access card
//   6. Deployment metadata
//
// No mutations on this page. The flag-flips, plan edits, etc. live
// on their dedicated surfaces — this is the "what's the world look
// like right now" surface.

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

interface EnvVar {
  key: string;
  label: string;
  group: "core" | "auth" | "billing" | "email" | "storage" | "monitoring";
  required: boolean; // critical = required, optional = nice-to-have
  description: string;
  sensitive?: boolean; // hide value when shown
  hint?: string;
}

const ENV_VARS: EnvVar[] = [
  // Core
  { key: "DATABASE_URL",        label: "Database (pooled)",      group: "core",       required: true,  sensitive: true,
    description: "Connection string used by all queries. Lose this and the platform is down." },
  { key: "DIRECT_URL",          label: "Direct DB",              group: "core",       required: true,  sensitive: true,
    description: "Non-pooled connection for `prisma migrate` / `db push`. Required for schema changes." },
  // Auth
  { key: "NEXTAUTH_SECRET",     label: "Session secret",         group: "auth",       required: true,  sensitive: true,
    description: "Signs every session JWT. Rotating it logs everyone out." },
  { key: "NEXTAUTH_URL",        label: "Canonical URL",          group: "auth",       required: true,
    description: "The URL NextAuth uses for callbacks. Mismatch breaks Google / Stripe redirects." },
  // Billing
  { key: "STRIPE_SECRET_KEY",   label: "Stripe secret",          group: "billing",    required: true,  sensitive: true,
    description: "Server-side Stripe API key. Required for checkout, webhooks, customer ops." },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook secret", group: "billing",   required: true,  sensitive: true,
    description: "Verifies webhook signatures. Without this, payment events are silently dropped." },
  // Email
  { key: "RESEND_API_KEY",      label: "Resend API key",         group: "email",      required: true,  sensitive: true,
    description: "Outgoing email — every transactional notification goes through Resend." },
  { key: "EMAIL_FROM",          label: "Email from address",     group: "email",      required: true,
    description: "All transactional emails are sent from this address. Must match a verified domain in Resend." },
  // Storage
  { key: "BLOB_READ_WRITE_TOKEN", label: "Blob storage token",   group: "storage",    required: true,  sensitive: true,
    description: "R2 / Vercel Blob token. Required for file uploads (logos, attachments, exports)." },
  // Monitoring
  { key: "SENTRY_DSN",          label: "Sentry DSN",             group: "monitoring", required: false,
    description: "Optional. Routes uncaught errors + perf traces to Sentry. Strongly recommended in production." },
];

const GROUP_META: Record<EnvVar["group"], { label: string; description: string; icon: string }> = {
  core:       { label: "Core infrastructure", description: "Database connections — without these, nothing works.",          icon: "🗄" },
  auth:       { label: "Authentication",      description: "Session signing + canonical URL.",                              icon: "🔐" },
  billing:    { label: "Billing",             description: "Stripe credentials for checkout + webhooks.",                   icon: "💳" },
  email:      { label: "Email",               description: "Resend creds for transactional notifications.",                 icon: "✉" },
  storage:    { label: "File storage",        description: "Object storage for uploads (logos, exports, attachments).",     icon: "📦" },
  monitoring: { label: "Monitoring",          description: "Optional but strongly recommended in production.",              icon: "📡" },
};

const GROUP_ORDER: EnvVar["group"][] = ["core", "auth", "billing", "email", "storage", "monitoring"];

export default async function PlatformSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const now = new Date();
  const last24h = new Date(now.getTime() - DAY_MS);

  // ── Platform settings singleton (maintenance + freeze) ──────
  const platformSettings = await getPlatformSettings();

  // ── Env evaluation (server-only, never sent to client) ──────
  type EnvStatus = "set" | "missing" | "n/a";
  const envStatus = (key: string): EnvStatus =>
    process.env[key] && process.env[key]!.length > 0 ? "set" : "missing";
  const envValue = (key: string): string | null =>
    process.env[key] && process.env[key]!.length > 0 ? process.env[key]! : null;

  const envWithStatus = ENV_VARS.map((e) => ({
    ...e,
    status: envStatus(e.key) as EnvStatus,
    value: e.sensitive ? null : envValue(e.key),
  }));

  const totalEnv = envWithStatus.length;
  const setEnv = envWithStatus.filter((e) => e.status === "set").length;
  const criticalMissing = envWithStatus.filter((e) => e.required && e.status === "missing").length;

  // ── Module live counts ──────────────────────────────────────
  const [
    plansCount,
    publishedPlans,
    flagsCount,
    globalFlags,
    announcementsLive,
    announcementsCritical,
    pendingExports,
    scheduledDeletions,
    auditLast24h,
    auditPlatformLast24h,
    feedbackOpen,
    feedbackTotal,
    supportOpen,
    notificationKindCount,
    publishedTemplates,
  ] = await Promise.all([
    db.pricingPlan.count(),
    db.pricingPlan.count({ where: { status: "PUBLISHED" } }),
    db.featureFlag.count(),
    db.featureFlag.count({ where: { tenantId: null } }),
    db.platformAnnouncement.count({
      where: {
        OR: [
          { status: "PUBLISHED" },
          { status: "SCHEDULED", publishAt: { lte: now } },
        ],
        AND: [{ OR: [{ expireAt: null }, { expireAt: { gt: now } }] }],
      },
    }),
    db.platformAnnouncement.count({
      where: { priority: "CRITICAL", status: "PUBLISHED" },
    }),
    db.dataExportRequest.count({ where: { status: "PENDING" } }),
    db.accountDeletionRequest.count({ where: { status: "SCHEDULED" } }),
    db.auditLog.count({ where: { createdAt: { gte: last24h } } }),
    db.auditLog.count({ where: { createdAt: { gte: last24h }, action: { startsWith: "platform." } } }),
    db.feedback.count({ where: { status: { in: ["NEW", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS"] } } }),
    db.feedback.count(),
    db.supportTicket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } },
    }),
    Promise.resolve(listRegistrations().length),
    db.notificationTemplate.count({ where: { status: "PUBLISHED", channel: "EMAIL", locale: "en" } }),
  ]);

  // ── Integration health derivation ───────────────────────────
  // Integrations are healthy when: env vars are set + recent activity
  // shows the integration is actually working. We derive activity
  // from the same DB signals the health page uses.
  const [
    emailFails7d, emailSent7d, fileWrites24h,
    // Settings change history (audit-derived).
    settingsAudit,
    // Abuse signals — for the "rate limiting / abuse" summary card.
    lockedLastHour, failedLogins24h, lockedTotal,
    // Compliance signals for the backup card — proxy for "how big is
    // the last manual export?" + "any pending requests?".
    completedExports30d,
    pendingExportsBackup,
  ] = await Promise.all([
    db.emailEvent.count({ where: { failedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    db.emailEvent.count({ where: { sentAt:   { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    db.file.count({ where: { createdAt: { gte: last24h } } }),
    db.auditLog.findMany({
      where: { action: { startsWith: "platform.setting_" } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    db.securityEvent.count({ where: { kind: "LOGIN_LOCKED", createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_FAILED", createdAt: { gte: last24h } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_LOCKED" } }),
    db.dataExportRequest.count({ where: { status: "COMPLETED", completedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } } }),
    db.dataExportRequest.count({ where: { status: "PENDING" } }),
  ]);
  // Resolve actor names for the settings audit timeline.
  const settingsActorIds = Array.from(new Set(settingsAudit.map((a) => a.userId).filter((x): x is string => Boolean(x))));
  const settingsActors = settingsActorIds.length
    ? await db.user.findMany({ where: { id: { in: settingsActorIds } }, select: { id: true, email: true, name: true } })
    : [];
  const settingsActorById = new Map(settingsActors.map((u) => [u.id, u]));

  const integrations = [
    {
      id: "stripe",
      name: "Stripe billing",
      icon: "💳",
      envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      status: criticalMissingFor(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], envStatus) ? "missing" : "operational",
      detail: criticalMissingFor(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], envStatus)
        ? "Configure both keys to enable checkout."
        : "Webhook signing + secret key configured.",
    },
    {
      id: "email",
      name: "Email (Resend)",
      icon: "✉",
      envKeys: ["RESEND_API_KEY", "EMAIL_FROM"],
      status: criticalMissingFor(["RESEND_API_KEY", "EMAIL_FROM"], envStatus)
        ? "missing"
        : emailSent7d === 0
        ? "idle"
        : (emailFails7d / Math.max(1, emailSent7d) > 0.05 ? "degraded" : "operational"),
      detail: criticalMissingFor(["RESEND_API_KEY", "EMAIL_FROM"], envStatus)
        ? "Configure API key + from address."
        : `${emailSent7d} sent / ${emailFails7d} failed (7d).`,
    },
    {
      id: "storage",
      name: "File storage",
      icon: "📦",
      envKeys: ["BLOB_READ_WRITE_TOKEN"],
      status: criticalMissingFor(["BLOB_READ_WRITE_TOKEN"], envStatus)
        ? "missing"
        : fileWrites24h === 0
        ? "idle"
        : "operational",
      detail: criticalMissingFor(["BLOB_READ_WRITE_TOKEN"], envStatus)
        ? "Set the blob token to enable uploads."
        : `${fileWrites24h} uploads in 24h.`,
    },
    {
      id: "sentry",
      name: "Error tracking",
      icon: "📡",
      envKeys: ["SENTRY_DSN"],
      status: envStatus("SENTRY_DSN") === "set" ? "operational" : "optional",
      detail: envStatus("SENTRY_DSN") === "set" ? "DSN configured." : "Optional — not configured.",
    },
  ];
  const integrationsOk = integrations.filter((i) => i.status === "operational").length;
  const integrationsTotal = integrations.length;

  // ── KPI band ────────────────────────────────────────────────
  const envHealthPct = totalEnv === 0 ? 0 : Math.round((setEnv / totalEnv) * 100);
  const deploymentEnv =
    process.env.VERCEL_ENV === "production"  ? "Production"
    : process.env.VERCEL_ENV === "preview"   ? "Preview"
    : process.env.VERCEL_ENV === "development" ? "Development"
    : process.env.NODE_ENV === "production"  ? "Production"
    : "Development";
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "—";
  const commitBranch = process.env.VERCEL_GIT_COMMIT_REF ?? "—";

  const kpis: SettingsKpi[] = [
    {
      label: "Env health",
      value: `${setEnv}/${totalEnv}`,
      hint: `${envHealthPct}% configured`,
      tone: criticalMissing > 0 ? "danger" : envHealthPct === 100 ? "success" : "warning",
      dot: true,
    },
    {
      label: "Critical missing",
      value: criticalMissing.toLocaleString(),
      hint: criticalMissing === 0 ? "All required secrets set" : "Required env vars missing",
      tone: criticalMissing > 0 ? "danger" : "success",
    },
    {
      label: "Integrations",
      value: `${integrationsOk}/${integrationsTotal}`,
      hint: integrationsOk === integrationsTotal ? "All wired up" : "Some not yet configured",
      tone: integrationsOk === integrationsTotal ? "success" : "warning",
    },
    {
      label: "Admin actions (24h)",
      value: auditPlatformLast24h.toLocaleString(),
      hint: `of ${auditLast24h.toLocaleString()} total events`,
      tone: "default",
    },
    {
      label: "Environment",
      value: deploymentEnv,
      hint: commitSha !== "—" ? `${commitBranch} · ${commitSha}` : "Local",
      tone: deploymentEnv === "Production" ? "accent" : "default",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Platform settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Control center for platform-wide configuration. Read-only by design — env vars are managed in
          the hosting provider; first-class settings live on their dedicated pages.
        </p>
      </div>

      {/* ── Save banners ────────────────────────────────── */}
      {sp.ok === "settings_saved" && (
        <Banner tone="success" title="Saved" body="Platform settings updated. Tenants pick up changes immediately." />
      )}
      {sp.error && (
        <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />
      )}

      {/* ── KPI band ───────────────────────────────────── */}
      <SettingsKPIBand kpis={kpis} />

      {/* ── Critical-missing alert ─────────────────────── */}
      {criticalMissing > 0 && (
        <Banner
          tone="danger"
          title={`${criticalMissing} critical environment variable${criticalMissing === 1 ? "" : "s"} missing`}
          body="The platform may not function correctly until these are set in your hosting provider and the app is redeployed."
        />
      )}

      {/* ── System controls (maintenance + freeze) ─────── */}
      <Section
        title="System controls"
        description="Platform-wide kill switches. Both flags audit-log every change. Maintenance redirects every tenant to /maintenance — admins (you) bypass."
      >
        <form action={updatePlatformSettings} className="space-y-5">
          {/* Maintenance mode */}
          <div
            className="rounded-lg p-4"
            style={{
              background: platformSettings.maintenanceMode ? "var(--danger-surface)" : "var(--surface-2)",
              border: `1px solid ${platformSettings.maintenanceMode ? "var(--danger-fg)" : "var(--border-subtle)"}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-base">🛠</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                    Maintenance mode
                  </span>
                  {platformSettings.maintenanceMode && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: "var(--danger-fg)", color: "var(--text-inverse)" }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  When ON, every tenant request bounces to /maintenance with the message below.
                  Platform staff bypass via their role. Use during deploys or incident response.
                </p>
              </div>
              <ToggleSwitch
                name="maintenanceMode"
                checked={platformSettings.maintenanceMode}
                disabled={!ctx.canWrite}
              />
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Message shown to tenants (optional)
              </span>
              <textarea
                name="maintenanceMessage"
                defaultValue={platformSettings.maintenanceMessage ?? ""}
                rows={2}
                maxLength={500}
                placeholder='e.g. "Back online by 02:30 UTC. Sorry for the interruption."'
                disabled={!ctx.canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
            </label>
          </div>

          {/* Feature freeze */}
          <div
            className="rounded-lg p-4"
            style={{
              background: platformSettings.featureFreezeMode ? "var(--warning-surface)" : "var(--surface-2)",
              border: `1px solid ${platformSettings.featureFreezeMode ? "var(--warning-fg)" : "var(--border-subtle)"}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-base">❄</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                    Feature freeze
                  </span>
                  {platformSettings.featureFreezeMode && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: "var(--warning-fg)", color: "var(--text-inverse)" }}
                    >
                      FROZEN
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Advisory flag. Surfaces a banner on every platform admin page so the team knows
                  not to ship more during a release window. Does NOT block writes — it's a reminder.
                </p>
              </div>
              <ToggleSwitch
                name="featureFreezeMode"
                checked={platformSettings.featureFreezeMode}
                disabled={!ctx.canWrite}
              />
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Reason (optional, shown to platform admins)
              </span>
              <input
                type="text"
                name="featureFreezeReason"
                defaultValue={platformSettings.featureFreezeReason ?? ""}
                maxLength={500}
                placeholder='e.g. "Q2 release window — no merges through 2026-05-05"'
                disabled={!ctx.canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {platformSettings.updatedBy
                ? <>Last edited by <b style={{ color: "var(--text-default)" }}>{platformSettings.updatedBy.slice(0, 8)}</b> · {platformSettings.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</>
                : "No changes recorded yet"}
            </p>
            <button
              type="submit"
              disabled={!ctx.canWrite}
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              {ctx.canWrite ? "Save controls" : "Read-only"}
            </button>
          </div>
        </form>
      </Section>

      {/* ── Environment configuration (grouped) ────────── */}
      <Section
        title="Environment variables"
        description="Whether each required secret / setting is present in this deployment. Sensitive values are never displayed."
      >
        <div className="space-y-4">
          {GROUP_ORDER.map((group) => {
            const meta = GROUP_META[group];
            const inGroup = envWithStatus.filter((e) => e.group === group);
            if (inGroup.length === 0) return null;
            const groupSet = inGroup.filter((e) => e.status === "set").length;
            const groupCritical = inGroup.filter((e) => e.required && e.status === "missing").length;
            return (
              <div
                key={group}
                className="overflow-hidden rounded-lg"
                style={{
                  background: "var(--surface-2)",
                  border: `1px solid ${groupCritical > 0 ? "var(--danger-fg)" : "var(--border-subtle)"}`,
                }}
              >
                <header className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="text-base">{meta.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                        {meta.label}
                      </h3>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{meta.description}</p>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums"
                    style={{
                      background: groupCritical > 0
                        ? "var(--danger-surface)"
                        : groupSet === inGroup.length
                        ? "var(--success-surface)"
                        : "var(--warning-surface)",
                      color: groupCritical > 0
                        ? "var(--danger-fg)"
                        : groupSet === inGroup.length
                        ? "var(--success-fg)"
                        : "var(--warning-fg)",
                    }}
                  >
                    {groupSet}/{inGroup.length}
                  </span>
                </header>
                <ul>
                  {inGroup.map((e, idx) => (
                    <li
                      key={e.key}
                      className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_180px_80px] md:items-center"
                      style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                            {e.label}
                          </span>
                          {e.required ? (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                              style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                              title="Required for the platform to operate"
                            >
                              critical
                            </span>
                          ) : (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                            >
                              optional
                            </span>
                          )}
                          {e.sensitive && (
                            <span
                              className="text-[10px]"
                              style={{ color: "var(--text-faint)" }}
                              title="Value is hidden — never displayed in this UI"
                            >
                              🔒 sensitive
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                          {e.key}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {e.description}
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {!e.sensitive && e.value ? (
                          <span className="font-mono break-all" style={{ color: "var(--text-default)" }}>
                            {e.value}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </div>
                      <div className="text-right">
                        <EnvStatusPill status={e.status} required={e.required} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
          Changing environment variables requires a redeploy. Manage them in your hosting provider's
          dashboard (Vercel project settings).
        </p>
      </Section>

      {/* ── Integration health ─────────────────────────── */}
      <Section
        title="Integration health"
        description="Live status of each external service the platform depends on. Combines env presence with recent activity."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {integrations.map((i) => (
            <IntegrationCard key={i.id} integration={i} />
          ))}
        </div>
      </Section>

      {/* ── Modules grid ───────────────────────────────── */}
      <Section
        title="Platform modules"
        description="Live counts pulled from the database. Click into any to manage."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <ModuleCard
            href="/platform/plans"
            title="Plans & pricing"
            icon="💲"
            primary={`${publishedPlans} published`}
            secondary={`${plansCount} total`}
            tone={publishedPlans > 0 ? "success" : "warning"}
          />
          <ModuleCard
            href="/platform/feature-flags"
            title="Feature flags"
            icon="⚑"
            primary={`${flagsCount} overrides`}
            secondary={`${globalFlags} global · ${flagsCount - globalFlags} per-tenant`}
            tone="default"
          />
          <ModuleCard
            href="/platform/notifications"
            title="Notifications"
            icon="📨"
            primary={`${publishedTemplates}/${notificationKindCount} published`}
            secondary={`${notificationKindCount} kinds registered`}
            tone={publishedTemplates > 0 ? "success" : "default"}
          />
          <ModuleCard
            href="/platform/announcements"
            title="Announcements"
            icon="📢"
            primary={`${announcementsLive} live`}
            secondary={announcementsCritical > 0 ? `${announcementsCritical} critical` : "No urgent posts"}
            tone={announcementsCritical > 0 ? "danger" : announcementsLive > 0 ? "accent" : "default"}
          />
          <ModuleCard
            href="/platform/compliance"
            title="Compliance"
            icon="📤"
            primary={`${pendingExports + scheduledDeletions} open`}
            secondary={`${pendingExports} exports · ${scheduledDeletions} deletions`}
            tone={(pendingExports + scheduledDeletions) > 0 ? "warning" : "success"}
          />
          <ModuleCard
            href="/platform/audit"
            title="Audit log"
            icon="📜"
            primary={`${auditLast24h.toLocaleString()} events`}
            secondary="Last 24 hours"
            tone="default"
          />
          <ModuleCard
            href="/platform/readiness"
            title="Launch readiness"
            icon="🚀"
            primary="Per-tenant"
            secondary="Onboarding scorecard"
            tone="default"
          />
          <ModuleCard
            href="/platform/health"
            title="Platform health"
            icon="🩺"
            primary={`${integrationsOk}/${integrationsTotal} services`}
            secondary="Real-time monitoring"
            tone={integrationsOk === integrationsTotal ? "success" : "warning"}
          />
          <ModuleCard
            href="/platform/feedback"
            title="Feedback hub"
            icon="💡"
            primary={`${feedbackOpen} open`}
            secondary={`${feedbackTotal} total`}
            tone="default"
          />
          <ModuleCard
            href="/platform/support"
            title="Support queue"
            icon="🎫"
            primary={`${supportOpen} open`}
            secondary="Tenant support tickets"
            tone={supportOpen > 5 ? "warning" : "default"}
          />
        </div>
      </Section>

      {/* ── Abuse + backup row ──────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Rate limiting & abuse"
          description="Read-only summary derived from SecurityEvent. There's no app-level rate limit engine yet — this surfaces what we'd want to act on if we built one."
        >
          <dl className="space-y-3 text-sm">
            <DT label="Locked (1h)" value={lockedLastHour.toString()} success={lockedLastHour === 0} />
            <DT label="Failed logins (24h)" value={failedLogins24h.toLocaleString()} success={failedLogins24h < 50} />
            <DT label="Lockouts (lifetime)" value={lockedTotal.toLocaleString()} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/platform/health"
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Open Health dashboard →
            </Link>
            <Link
              href="/platform/audit?action=login"
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Audit login events →
            </Link>
          </div>
          <div
            className="mt-3 rounded-md px-3 py-2 text-[11px]"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <b style={{ color: "var(--text-default)" }}>Heads-up:</b> auth lockouts work today (5
            failed attempts → temporary lock recorded as <code>LOGIN_LOCKED</code>). A full per-IP /
            per-tenant rate-limit engine would need Upstash/Redis or similar — flag if you want it.
          </div>
        </Section>

        <Section
          title="Backups & recovery"
          description="Postgres lives on Neon (managed). Continuous PITR is provided by the host; manual exports run from /platform/compliance."
        >
          <dl className="space-y-3 text-sm">
            <DT label="DB host" value="Neon (managed Postgres)" mono />
            <DT label="PITR window" value="7-day point-in-time recovery (Neon free tier)" />
            <DT label="Manual exports (30d)" value={completedExports30d.toLocaleString()} />
            <DT
              label="Pending exports"
              value={pendingExportsBackup.toLocaleString()}
              success={pendingExportsBackup === 0}
            />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/platform/compliance"
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Manage exports & deletions →
            </Link>
            <a
              href="https://console.neon.tech"
              target="_blank"
              rel="noreferrer"
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Open Neon console ↗
            </a>
          </div>
          <div
            className="mt-3 rounded-md px-3 py-2 text-[11px]"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <b style={{ color: "var(--text-default)" }}>Restore procedure:</b> for a full restore,
            use Neon's PITR UI (not exposed here on purpose — restore is destructive and deserves
            a separate process). Manual JSON exports are tenant-scoped via the compliance flow.
          </div>
        </Section>
      </div>

      {/* ── API & webhooks (forward-looking stub) ───────── */}
      <Section
        title="API & webhooks"
        description="Public API tokens, webhook endpoints, and per-key rate limits. Not yet built — Flowtora's app surface is fully internal today."
      >
        <div
          className="rounded-md p-4 text-sm"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-muted)",
            border: "1px dashed var(--border-default)",
          }}
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-base leading-none">🔌</span>
            <div className="min-w-0">
              <div className="font-semibold" style={{ color: "var(--text-default)" }}>
                No public API exists yet — by design, not by accident
              </div>
              <p className="mt-1 text-xs">
                Tenants reach Flowtora through the web UI; partner integrations don't have a stable contract
                to depend on yet. The infra to add later (issued API keys, scoped tokens, per-key rate
                limits, webhook signing) is straightforward — but there's nothing meaningful to ship
                until there's an API surface to gate.
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <BulletCard title="When this is needed" body="When a tenant or partner asks to programmatically read/write their data — e.g. a Zapier-style integration." />
                <BulletCard title="What we'd add" body="PlatformApiKey table with hashed secret, scopes, expiresAt, lastUsedAt + a /api/v1/* surface that auths via Bearer." />
                <BulletCard title="What we'd need" body="A per-key rate limit (Upstash/Redis), webhook delivery service for outbound events, public API docs." />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Config change history ──────────────────────── */}
      <Section
        title="Configuration change history"
        description="Every flip of a maintenance / freeze toggle is audit-logged. Env-var changes happen in your hosting provider and aren't visible here."
      >
        {settingsAudit.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No platform-setting changes recorded yet.
          </p>
        ) : (
          <ol className="-mx-5 -mb-5">
            {settingsAudit.map((a, idx) => {
              const u = a.userId ? settingsActorById.get(a.userId) : null;
              const tone =
                a.action === "platform.setting_maintenance_on"  ? { fg: "var(--danger-fg)",   label: "Maintenance ON" } :
                a.action === "platform.setting_maintenance_off" ? { fg: "var(--success-fg)", label: "Maintenance OFF" } :
                a.action === "platform.setting_freeze_on"       ? { fg: "var(--warning-fg)", label: "Freeze ON" } :
                a.action === "platform.setting_freeze_off"      ? { fg: "var(--success-fg)", label: "Freeze OFF" } :
                a.action === "platform.setting_text_updated"    ? { fg: "var(--text-muted)", label: "Text updated" } :
                                                                   { fg: "var(--text-muted)", label: a.action };
              return (
                <li
                  key={a.id}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tone.fg }}>
                      {tone.label}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {u ? `by ${u.name ?? u.email}` : "by system"}
                    </span>
                  </div>
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {/* ── Security & access + Deployment ─────────────── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Your platform access" description="Read-only view of your own session context.">
          <dl className="space-y-3 text-sm">
            <DT label="Email"            value={ctx.email} mono />
            <DT label="Role"             value={ctx.role.replace(/_/g, " ").toLowerCase()} accent />
            <DT label="Can write"        value={ctx.canWrite ? "yes" : "read-only"} success={ctx.canWrite} />
            <DT label="Can impersonate"  value={ctx.canImpersonate ? "yes" : "no"} success={ctx.canImpersonate} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/platform/audit?userId=${encodeURIComponent(ctx.userId)}`}
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              View my actions →
            </Link>
            <Link
              href="/platform/audit?scope=platform"
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              All staff actions →
            </Link>
          </div>
        </Section>

        <Section title="Deployment" description="Build metadata pulled from environment at runtime.">
          <dl className="space-y-3 text-sm">
            <DT label="Environment" value={deploymentEnv} accent />
            <DT label="Branch"      value={commitBranch} mono />
            <DT label="Commit"      value={commitSha} mono />
            <DT
              label="Region"
              value={process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "—"}
              mono
            />
          </dl>
          <div
            className="mt-4 rounded-md px-3 py-2 text-xs"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <b style={{ color: "var(--text-default)" }}>Note:</b> Environment variable changes
            require a redeploy. Edit them in your hosting provider's dashboard, then trigger a
            new build.
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function criticalMissingFor(keys: string[], statusOf: (k: string) => "set" | "missing" | "n/a"): boolean {
  return keys.some((k) => statusOf(k) === "missing");
}

function IntegrationCard({
  integration,
}: {
  integration: { id: string; name: string; icon: string; envKeys: string[]; status: string; detail: string };
}) {
  const palette =
    integration.status === "operational" ? { bg: "var(--success-surface)", fg: "var(--success-fg)",     label: "Operational" } :
    integration.status === "degraded"    ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "Degraded"    } :
    integration.status === "missing"     ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      label: "Missing config" } :
    integration.status === "idle"        ? { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "Idle" } :
                                            { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "Optional" };
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${integration.status === "operational" ? "var(--border-subtle)" : palette.fg}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">{integration.icon}</span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {integration.name}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}
        >
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.fg }} />
          {palette.label}
        </span>
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {integration.detail}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {integration.envKeys.map((k) => (
          <span
            key={k}
            className="rounded-full px-1.5 py-0.5 font-mono text-[9px]"
            style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  href,
  title,
  icon,
  primary,
  secondary,
  tone,
}: {
  href: string;
  title: string;
  icon: string;
  primary: string;
  secondary: string;
  tone: "default" | "accent" | "success" | "warning" | "danger";
}) {
  const palette =
    tone === "accent"  ? { bar: "var(--accent-primary)" } :
    tone === "success" ? { bar: "var(--success-fg)"    } :
    tone === "warning" ? { bar: "var(--warning-fg)"    } :
    tone === "danger"  ? { bar: "var(--danger-fg)"     } :
                          { bar: "var(--border-default)" };
  return (
    <Link
      href={href}
      className="ts-focus group block rounded-xl p-4 transition-colors hover:opacity-95"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">{icon}</span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </span>
        </div>
        <span style={{ color: "var(--text-faint)" }}>→</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette.bar }} />
        <span className="text-base font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
          {primary}
        </span>
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {secondary}
      </div>
    </Link>
  );
}

function EnvStatusPill({ status, required }: { status: "set" | "missing" | "n/a"; required: boolean }) {
  if (status === "set") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
      >
        <span aria-hidden>✓</span> Set
      </span>
    );
  }
  if (status === "missing") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          background: required ? "var(--danger-surface)" : "var(--surface-2)",
          color:      required ? "var(--danger-fg)"      : "var(--text-muted)",
        }}
      >
        <span aria-hidden>{required ? "⚠" : "—"}</span>
        {required ? "Missing" : "Not set"}
      </span>
    );
  }
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
    >
      —
    </span>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
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
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "warning" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  } :
    tone === "warning" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "var(--warning-fg)" } :
                          { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="flex items-start gap-3 rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <span aria-hidden className="text-base leading-none">⚠</span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
      </div>
    </div>
  );
}

function ToggleSwitch({
  name,
  checked,
  disabled,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
}) {
  // Native checkbox styled as a toggle. Submits with the form, no JS
  // required. Browsers send `on` when checked + nothing when not.
  return (
    <label
      className="inline-flex cursor-pointer items-center"
      style={{ cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        className="relative inline-block h-6 w-11 rounded-full transition-colors"
        style={{
          background: checked ? "var(--accent-primary)" : "var(--surface-3)",
          border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-default)"}`,
          opacity: disabled ? 0.5 : 1,
        }}
        aria-hidden
      >
        <span
          className="absolute top-0.5 inline-block h-4 w-4 rounded-full transition-all"
          style={{
            left: checked ? "calc(100% - 18px)" : "2px",
            background: checked ? "var(--accent-fg)" : "var(--text-muted)",
            transitionDuration: "var(--duration-base)",
          }}
        />
      </span>
    </label>
  );
}

function BulletCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-md p-3 text-xs"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        color: "var(--text-muted)",
      }}
    >
      <div className="font-semibold" style={{ color: "var(--text-default)" }}>{title}</div>
      <div className="mt-1">{body}</div>
    </div>
  );
}

function DT({
  label,
  value,
  mono,
  accent,
  success,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  success?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd
        className={`break-all ${mono ? "font-mono text-xs" : "text-sm"}`}
        style={{
          color:
            accent ? "var(--accent-primary)" :
            success === true ? "var(--success-fg)" :
            success === false ? "var(--text-muted)" :
            "var(--text-default)",
        }}
      >
        {value}
      </dd>
    </div>
  );
}
