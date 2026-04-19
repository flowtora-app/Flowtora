import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Phase D — System / platform health.
//
// Flowtora doesn't self-instrument external services (that's Vercel's
// job), so this page surfaces the health signals we can observe from
// our own database:
//
//   • Email delivery            — EmailEvent.failedAt hit rate (24 h / 7 d)
//   • Auth / security posture   — SecurityEvent login-failed spikes, lockouts,
//                                 2FA challenges failed
//   • Impersonation activity    — active + recent sessions
//   • Data exports / deletions  — pending ops count (SLA signal)
//   • Critical audit actions    — platform.* / tenant.* suspensions, flag flips
//
// Each block answers one question: is this subsystem OK today? If the
// numbers are clean, the block renders as "healthy" with a soft green;
// if something's spiking it goes amber/red with a drill-down link.

type HealthTone = "good" | "warning" | "danger" | "info";

export default async function PlatformHealthPage() {
  await requirePlatformStaff();

  const now = new Date();
  const day = 86_400_000;
  const last24h = new Date(now.getTime() - day);
  const last7d = new Date(now.getTime() - 7 * day);
  const last30d = new Date(now.getTime() - 30 * day);

  const [
    sent24h,
    failed24h,
    sent7d,
    failed7d,
    bounced7d,
    failed24hSample,
    loginFailed24h,
    loginSuccess24h,
    locked24h,
    twoFactorFailed7d,
    failedLoginsByUser,
    activeImpersonations,
    recentImpersonations,
    pendingExports,
    scheduledDeletions,
    criticalAudits,
  ] = await Promise.all([
    db.emailEvent.count({ where: { sentAt: { gte: last24h } } }),
    db.emailEvent.count({ where: { failedAt: { gte: last24h } } }),
    db.emailEvent.count({ where: { sentAt: { gte: last7d } } }),
    db.emailEvent.count({ where: { failedAt: { gte: last7d } } }),
    db.emailEvent.count({
      where: {
        failedAt: { gte: last7d },
        failReason: { contains: "bounce", mode: "insensitive" },
      },
    }),
    db.emailEvent.findMany({
      where: { failedAt: { gte: last24h } },
      orderBy: { failedAt: "desc" },
      take: 8,
      select: {
        id: true, toAddress: true, subject: true, failedAt: true,
        failReason: true, kind: true, tenantId: true,
      },
    }),
    db.securityEvent.count({ where: { kind: "LOGIN_FAILED", createdAt: { gte: last24h } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_SUCCESS", createdAt: { gte: last24h } } }),
    db.securityEvent.count({ where: { kind: "LOGIN_LOCKED", createdAt: { gte: last24h } } }),
    db.securityEvent.count({
      where: { kind: "TWO_FACTOR_CHALLENGE_FAILED", createdAt: { gte: last7d } },
    }),
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
      select: {
        id: true, startedAt: true, reason: true,
        tenantId: true, platformUserId: true,
      },
    }),
    db.impersonationSession.count({
      where: { startedAt: { gte: last7d } },
    }),
    db.dataExportRequest.count({ where: { status: "PENDING" } }),
    db.accountDeletionRequest.count({
      where: { status: "SCHEDULED", scheduledFor: { lte: new Date(now.getTime() + 7 * day) } },
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
      take: 10,
      select: {
        id: true, action: true, createdAt: true, entityType: true, entityId: true,
        tenant: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Hydrate names for impersonations + spiking users
  const impersonationUserIds = Array.from(new Set(activeImpersonations.map((s) => s.platformUserId)));
  const impersonationTenantIds = Array.from(new Set(activeImpersonations.map((s) => s.tenantId)));
  const loginSpikeUserIds = failedLoginsByUser.map((r) => r.userId);
  const [impUsers, impTenants, spikeUsers] = await Promise.all([
    impersonationUserIds.length
      ? db.user.findMany({
          where: { id: { in: impersonationUserIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
    impersonationTenantIds.length
      ? db.tenant.findMany({
          where: { id: { in: impersonationTenantIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    loginSpikeUserIds.length
      ? db.user.findMany({
          where: { id: { in: loginSpikeUserIds } },
          select: { id: true, email: true },
        })
      : Promise.resolve([] as { id: string; email: string }[]),
  ]);
  const impUserById = new Map(impUsers.map((u) => [u.id, u]));
  const impTenantById = new Map(impTenants.map((t) => [t.id, t]));
  const spikeUserById = new Map(spikeUsers.map((u) => [u.id, u]));

  // ── Derived metrics ────────────────────────────────────────────
  const deliveryRate24 = sent24h === 0 ? 100 : Math.round(((sent24h - failed24h) / sent24h) * 1000) / 10;
  const deliveryRate7 = sent7d === 0 ? 100 : Math.round(((sent7d - failed7d) / sent7d) * 1000) / 10;
  const loginFailureRate = loginSuccess24h + loginFailed24h === 0
    ? 0
    : Math.round((loginFailed24h / (loginSuccess24h + loginFailed24h)) * 1000) / 10;

  const emailTone: HealthTone = deliveryRate7 >= 98 ? "good" : deliveryRate7 >= 92 ? "warning" : "danger";
  const authTone: HealthTone = locked24h > 3 || loginFailureRate > 40 ? "warning" : "good";
  const impersonationTone: HealthTone = activeImpersonations.length > 3 ? "warning" : "good";

  // Overall banner: worst of the three
  const worst: HealthTone = [emailTone, authTone, impersonationTone].includes("danger")
    ? "danger"
    : [emailTone, authTone, impersonationTone].includes("warning")
      ? "warning"
      : "good";

  return (
    <div className="space-y-10">
      <PageHeader
        title="Platform health"
        description="Operational view across email delivery, authentication, impersonation, and critical admin actions."
      />

      {/* ── Overall status banner ──────────────────────────────── */}
      <StatusBanner tone={worst} />

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi
          label="Email delivery (7 d)"
          value={`${deliveryRate7}%`}
          sub={`${sent7d} sent · ${failed7d} failed`}
          tone={emailTone}
        />
        <Kpi
          label="Login failure rate (24 h)"
          value={`${loginFailureRate}%`}
          sub={`${loginFailed24h} failed / ${loginSuccess24h} OK`}
          tone={loginFailureRate > 40 ? "warning" : "good"}
        />
        <Kpi
          label="Active impersonations"
          value={String(activeImpersonations.length)}
          sub={`${recentImpersonations} in last 7 d`}
          tone={impersonationTone}
        />
        <Kpi
          label="Ops backlog"
          value={String(pendingExports + scheduledDeletions)}
          sub={`${pendingExports} exports · ${scheduledDeletions} deletions`}
          tone={pendingExports + scheduledDeletions > 5 ? "warning" : "good"}
        />
      </div>

      {/* ── Email delivery detail ───────────────────────────────── */}
      <section>
        <SectionHeader title="Email delivery" />
        <div
          className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <Panel>
            <PanelTitle>Delivery summary</PanelTitle>
            <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
              <Dt>Sent 24 h</Dt><Dd>{sent24h}</Dd>
              <Dt>Failed 24 h</Dt><Dd danger={failed24h > 0}>{failed24h}</Dd>
              <Dt>Delivery rate 24 h</Dt><Dd>{deliveryRate24}%</Dd>
              <Dt>Bounces 7 d</Dt><Dd danger={bounced7d > 0}>{bounced7d}</Dd>
              <Dt>Sent 7 d</Dt><Dd>{sent7d}</Dd>
              <Dt>Delivery rate 7 d</Dt><Dd>{deliveryRate7}%</Dd>
            </dl>
          </Panel>
          <Panel>
            <PanelTitle>Recent failures</PanelTitle>
            {failed24hSample.length === 0 ? (
              <Empty>No email failures in the last 24 hours.</Empty>
            ) : (
              <ul className="mt-1">
                {failed24hSample.map((e) => (
                  <li key={e.id} className="py-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm">
                        <div className="truncate font-medium">{e.subject ?? e.kind}</div>
                        <div className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          to {e.toAddress}
                        </div>
                      </div>
                      <div className="text-[11px] text-right" style={{ color: "var(--text-faint)" }}>
                        {ageLabel(e.failedAt!)}
                      </div>
                    </div>
                    {e.failReason && (
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--danger-fg)" }}>
                        {e.failReason}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </section>

      {/* ── Auth / security posture ─────────────────────────────── */}
      <section>
        <SectionHeader title="Authentication & security" />
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel>
            <PanelTitle>Login telemetry (24 h)</PanelTitle>
            <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
              <Dt>Successful</Dt><Dd>{loginSuccess24h}</Dd>
              <Dt>Failed</Dt><Dd danger={loginFailed24h > 50}>{loginFailed24h}</Dd>
              <Dt>Lockouts</Dt><Dd danger={locked24h > 0}>{locked24h}</Dd>
              <Dt>2FA fails (7 d)</Dt><Dd danger={twoFactorFailed7d > 5}>{twoFactorFailed7d}</Dd>
            </dl>
          </Panel>
          <Panel>
            <PanelTitle>Users with most failed logins (24 h)</PanelTitle>
            {failedLoginsByUser.length === 0 ? (
              <Empty>No failed logins today.</Empty>
            ) : (
              <ul className="mt-1">
                {failedLoginsByUser.map((row) => {
                  const u = spikeUserById.get(row.userId);
                  return (
                    <li
                      key={row.userId}
                      className="flex items-center justify-between py-2 text-sm"
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <span className="truncate">{u?.email ?? row.userId}</span>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: row._count._all > 5 ? "var(--danger-surface)" : "var(--surface-2)",
                          color: row._count._all > 5 ? "var(--danger-fg)" : "var(--text-muted)",
                          border: row._count._all > 5 ? "1px solid var(--danger-border)" : "1px solid var(--border-subtle)",
                        }}
                      >
                        {row._count._all} attempts
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </section>

      {/* ── Impersonation ───────────────────────────────────────── */}
      <section>
        <SectionHeader title="Impersonation" />
        <Panel className="mt-3">
          {activeImpersonations.length === 0 ? (
            <Empty>No platform staff are currently signed in as a tenant.</Empty>
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
                {activeImpersonations.map((s) => {
                  const u = impUserById.get(s.platformUserId);
                  const t = impTenantById.get(s.tenantId);
                  const mins = Math.round((Date.now() - s.startedAt.getTime()) / 60000);
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
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
        </Panel>
      </section>

      {/* ── Critical audit actions ──────────────────────────────── */}
      <section>
        <SectionHeader title="Recent critical actions (30 d)" />
        <Panel className="mt-3">
          {criticalAudits.length === 0 ? (
            <Empty>No suspensions, impersonations, deletions, or feature-flag flips in the last 30 days.</Empty>
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
                {criticalAudits.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
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
          <div className="px-4 pb-3 pt-2 text-xs">
            <Link href="/platform/audit" className="underline" style={{ color: "var(--text-muted)" }}>
              Full audit log →
            </Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────

function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && (
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

function StatusBanner({ tone }: { tone: HealthTone }) {
  const meta: Record<HealthTone, { bg: string; fg: string; border: string; label: string; desc: string }> = {
    good:   { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "1px solid var(--success)", label: "All systems operational", desc: "No critical anomalies detected in the last 24 hours." },
    info:   { bg: "var(--info-surface)",    fg: "var(--info-fg)",    border: "1px solid var(--info)",    label: "Operational",             desc: "Nothing urgent." },
    warning:{ bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "1px solid var(--warning)", label: "Watch a signal",          desc: "At least one subsystem is showing elevated failure rates." },
    danger: { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "1px solid var(--danger)",  label: "Incident-worthy signal",  desc: "A subsystem is failing above tolerated thresholds. Investigate." },
  };
  const m = meta[tone];
  return (
    <div className="rounded-lg px-4 py-3 text-sm" style={{ background: m.bg, color: m.fg, border: m.border }}>
      <div className="font-semibold">{m.label}</div>
      <div className="text-xs opacity-90">{m.desc}</div>
    </div>
  );
}

function Kpi({ label, value, sub, tone = "good" }: { label: string; value: string; sub?: string; tone?: HealthTone }) {
  const subColor: Record<HealthTone, string> = {
    good: "var(--success-fg)",
    info: "var(--info-fg)",
    warning: "var(--warning-fg)",
    danger: "var(--danger-fg)",
  };
  return (
    <div className="rounded-lg px-4 py-4" style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: subColor[tone] }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
      {title}
    </h2>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg ${className ?? ""}`}
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold">{children}</div>;
}
function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{children}</dt>;
}
function Dd({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return <dd className="text-sm font-medium" style={danger ? { color: "var(--danger-fg)" } : undefined}>{children}</dd>;
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-normal uppercase tracking-wider">{children}</th>;
}
function Td({ children, muted, className }: { children: React.ReactNode; muted?: boolean; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`} style={muted ? { color: "var(--text-muted)" } : undefined}>{children}</td>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>{children}</p>;
}

function ageLabel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
