// Page 50 — Security Center.
//
// Single-pane-of-glass: posture score gauge, KPI strip, and a 3-column
// widget grid covering suspicious activity, vulnerability scanner, pen
// tests, bug bounty, password policy, encryption posture, secret
// scanning, dependency vulnerabilities, cloud security, and recent
// privileged admin actions.

import { requirePlatformStaff } from "@/lib/platform";
import {
  loadSecurityCenterPage,
  type FindingRow,
} from "@/server/platform/security-center";
import {
  resolveFinding,
  assignFinding,
  updateSuspiciousActivity,
  saveSecuritySettings,
  recomputeSecurityScore,
  updateEncryptionStatus,
} from "@/app/actions/platform-security";
import {
  Kpi, SeverityPill, StatusPill, EncryptionPill, SourceBadge,
  WidgetCard, PercentBar, ScoreGauge, FormError, FormOk, relativeFromNow,
} from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["overview", "findings", "settings"] as const;
type Tab = typeof TABS[number];

export default async function SecurityCenterPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("security.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view the Security Center.
        </p>
      </main>
    );
  }

  const canManage = ctx.can("security.manage");
  const canResolve = ctx.can("security.findings.resolve");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "overview";

  const data = await loadSecurityCenterPage();
  const {
    hero, kpis, suspicious, scanner, penTests, bugBounty,
    passwordPolicy, encryption,
    secretFindings, cloudFindings, dependencyFindings,
    privilegedActions, settings,
  } = data;

  const criticalAlertOn = hero.score < 70 || kpis.openCritical > 0;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Security Center</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Single-pane view of platform security posture, suspicious activity, and remediation queue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
          {canManage && (
            <form action={recomputeSecurityScore}>
              <button
                type="submit"
                className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
              >
                Recompute score
              </button>
            </form>
          )}
        </div>
      </header>

      {criticalAlertOn && settings?.bannerOnHighSeverity && (
        <div className="mb-5 rounded-lg border px-4 py-3 text-[13px]"
             style={{ borderColor: "var(--rose-300)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
          <strong>High-severity posture alert.</strong>{" "}
          {kpis.openCritical > 0 && <>{kpis.openCritical} critical finding{kpis.openCritical === 1 ? "" : "s"} open. </>}
          {hero.score < 70 && <>Overall score {hero.score} is below threshold. </>}
          Investigate before continued production rollout.
        </div>
      )}

      {/* Tabs */}
      <nav className="mb-5 flex gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {(["overview", "findings", "settings"] as const).map((t) => (
          <a
            key={t}
            href={`?tab=${t}`}
            className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
            style={{
              borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
              color: tab === t ? "var(--text-default)" : "var(--text-muted)",
            }}
          >
            {t === "overview"  ? "Overview" :
             t === "findings"  ? "Findings" :
                                 "Settings"}
          </a>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          {/* Hero strip — score gauge + breakdown */}
          <section className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="rounded-xl border p-5 lg:col-span-5"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Overall security score
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Last computed {relativeFromNow(hero.scoreComputedAt)}
                  </div>
                </div>
              </div>
              <ScoreGauge score={hero.score} grade={hero.grade} />
            </div>
            <div className="rounded-xl border p-5 lg:col-span-7"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="mb-3 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Score breakdown
              </div>
              <ul className="space-y-2.5">
                {hero.breakdown.map((c) => (
                  <li key={c.label} className="flex items-center gap-3">
                    <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold"
                          style={{
                            background: c.ok ? "var(--emerald-100)" : "var(--rose-100)",
                            color: c.ok ? "var(--emerald-700)" : "var(--rose-700)",
                          }}>
                      {c.ok ? "✓" : "!"}
                    </span>
                    <span className="text-[12px] flex-1" style={{ color: "var(--text-default)" }}>{c.label}</span>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>+{c.weight} pts</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* KPI strip */}
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              label="MFA on platform admins"
              value={`${kpis.mfaEnforcedPct}%`}
              sub={`${kpis.mfaAdmins}/${kpis.totalAdmins} enrolled`}
              tone={kpis.mfaEnforcedPct === 100 ? "good" : kpis.mfaEnforcedPct >= 80 ? "warning" : "danger"}
            />
            <Kpi
              label="Enterprise SSO adoption"
              value={`${kpis.ssoTenantAdoptionPct}%`}
              sub={`${kpis.ssoTenants}/${kpis.enterpriseTenants} tenants`}
              tone={kpis.ssoTenantAdoptionPct >= 80 ? "good" : kpis.ssoTenantAdoptionPct >= 50 ? "warning" : "danger"}
            />
            <Kpi
              label="Open findings"
              value={String(kpis.openCritical + kpis.openHigh + kpis.openMedium + kpis.openLow)}
              sub={`Crit ${kpis.openCritical} · Hi ${kpis.openHigh} · Med ${kpis.openMedium} · Lo ${kpis.openLow}`}
              tone={kpis.openCritical > 0 ? "danger" : kpis.openHigh > 0 ? "warning" : "good"}
            />
            <Kpi
              label="Mean time to remediate"
              value={kpis.mttrDays != null ? `${kpis.mttrDays} d` : "—"}
              sub={`Target ≤ ${kpis.mttrTargetDays} d`}
              tone={kpis.mttrTrend}
            />
          </section>

          {/* Widget grid */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Suspicious activity feed */}
            <WidgetCard
              title="Suspicious activity"
              subtitle="Failed-login bursts, geo anomalies, leaked creds"
              tone={suspicious.some((s) => s.severity === "CRITICAL" || s.severity === "HIGH") ? "danger" : "default"}
            >
              {suspicious.length === 0 ? (
                <Empty>No suspicious activity in the last 30 days.</Empty>
              ) : (
                <ul className="-my-2 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {suspicious.slice(0, 6).map((s) => (
                    <li key={s.id} className="py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <SeverityPill severity={s.severity} />
                            <span className="text-[11px] font-medium" style={{ color: "var(--text-default)" }}>
                              {s.kindLabel}
                            </span>
                            {s.status !== "OPEN" && (
                              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                                · {s.status.toLowerCase().replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--text-default)" }}>
                            {s.summary}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {s.userEmail ?? "(no user)"} · {s.geoLocation ?? "—"} · {s.ipAddress ?? "—"} ·{" "}
                            {relativeFromNow(s.occurredAt)}
                          </div>
                        </div>
                        {canResolve && s.status === "OPEN" && (
                          <form action={updateSuspiciousActivity}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="status" value="DISMISSED" />
                            <button
                              type="submit"
                              className="text-[11px] font-medium underline"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Dismiss
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>

            {/* Vulnerability scanner */}
            <WidgetCard
              title="Vulnerability scanner"
              subtitle={
                scanner.recent[0]?.completedAt
                  ? `Last scan ${relativeFromNow(scanner.recent[0].completedAt)} via ${scanner.recent[0].sourceLabel}`
                  : "No completed scans yet"
              }
            >
              {scanner.recent.length === 0 ? (
                <Empty>No recent scans recorded.</Empty>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <ScanCount label="Crit" value={scanner.recent[0]?.critical ?? 0} tone="danger" />
                    <ScanCount label="High" value={scanner.recent[0]?.high ?? 0}     tone="warning" />
                    <ScanCount label="Med"  value={scanner.recent[0]?.medium ?? 0} />
                    <ScanCount label="Low"  value={scanner.recent[0]?.low ?? 0} />
                  </div>
                  {scanner.topFindings.length > 0 && (
                    <FindingTable rows={scanner.topFindings.slice(0, 4)} canResolve={canResolve} />
                  )}
                </>
              )}
            </WidgetCard>

            {/* Penetration test reports */}
            <WidgetCard
              title="Penetration tests"
              subtitle="Annual + quarterly third-party assessments"
            >
              {penTests.length === 0 ? (
                <Empty>No pen-test reports yet.</Empty>
              ) : (
                <ul className="-my-2 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {penTests.slice(0, 5).map((p) => (
                    <li key={p.id} className="py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate" style={{ color: "var(--text-default)" }}>
                            {p.vendor} <span style={{ color: "var(--text-muted)" }}>· {p.scope}</span>
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {p.statusLabel} · {p.completedAt ? relativeFromNow(p.completedAt) : "in progress"}
                            {" · "}
                            <span style={{ color: "var(--rose-700)" }}>{p.critical}C</span>
                            {" "}<span style={{ color: "var(--amber-700)" }}>{p.high}H</span>
                            {" "}<span style={{ color: "var(--sky-700)" }}>{p.medium}M</span>
                            {" "}<span style={{ color: "var(--text-muted)" }}>{p.low}L</span>
                          </div>
                        </div>
                        {p.executiveSummaryUrl && (
                          <a
                            href={p.executiveSummaryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium underline"
                            style={{ color: "var(--accent-default)" }}
                          >
                            PDF
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>

            {/* Bug bounty */}
            <WidgetCard
              title="Bug bounty"
              subtitle="HackerOne / Intigriti / private programs"
            >
              <div className="mb-3 grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Payouts YTD</div>
                  <div className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                    ${(bugBounty.payoutYtdCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)" }}>Open by platform</div>
                  <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
                    {bugBounty.openByPlatform.length === 0
                      ? "—"
                      : bugBounty.openByPlatform.map((o) => `${o.label}: ${o.count}`).join(" · ")}
                  </div>
                </div>
              </div>
              {bugBounty.reports.length === 0 ? (
                <Empty>No reports yet.</Empty>
              ) : (
                <ul className="-my-2 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {bugBounty.reports.slice(0, 4).map((r) => (
                    <li key={r.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <SeverityPill severity={r.severity} />
                        <span className="text-[12px] font-medium truncate flex-1" style={{ color: "var(--text-default)" }}>
                          {r.title}
                        </span>
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          ${(r.payoutCents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {r.platformLabel} #{r.externalId} · {r.reporter} · {r.statusLabel} ·{" "}
                        {relativeFromNow(r.submittedAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </WidgetCard>

            {/* Password policy compliance */}
            <WidgetCard
              title="Password policy compliance"
              subtitle={`${passwordPolicy.compliantCount}/${passwordPolicy.totalAudited} admins fully compliant`}
              tone={passwordPolicy.compliantPct < 80 ? "warning" : "default"}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="text-[28px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                  {passwordPolicy.compliantPct}%
                </div>
                <div className="flex-1">
                  <PercentBar pct={passwordPolicy.compliantPct} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {passwordPolicy.perRule.map((r) => (
                  <div key={r.label}>
                    <div className="flex items-baseline justify-between gap-2 text-[11px]">
                      <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
                      <span className="tabular-nums" style={{ color: "var(--text-default)" }}>{r.pct}%</span>
                    </div>
                    <PercentBar pct={r.pct} />
                  </div>
                ))}
              </div>
              {passwordPolicy.failingAdmins.length > 0 && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                    {passwordPolicy.failingAdmins.length} admin{passwordPolicy.failingAdmins.length === 1 ? "" : "s"} failing rules
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {passwordPolicy.failingAdmins.slice(0, 4).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate" style={{ color: "var(--text-default)" }}>{a.email ?? a.name ?? "—"}</span>
                        <span style={{ color: "var(--rose-700)" }}>{a.failingRules.join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </WidgetCard>

            {/* Encryption posture */}
            <WidgetCard
              title="Encryption status"
              subtitle="At-rest, in-transit, KMS, key rotation"
              tone={
                encryption && (encryption.atRestState !== "HEALTHY" ||
                               encryption.inTransitState !== "HEALTHY" ||
                               encryption.kmsState !== "HEALTHY")
                  ? "warning" : "default"
              }
            >
              {!encryption ? (
                <Empty>Encryption status not yet recorded.</Empty>
              ) : (
                <div className="space-y-2.5">
                  <EncryptionRow label="At-rest"   detail={encryption.atRestAlgorithm}   state={encryption.atRestState} />
                  <EncryptionRow label="In-transit" detail={encryption.inTransitProtocol} state={encryption.inTransitState} />
                  <EncryptionRow label="KMS"        detail={encryption.kmsProvider}        state={encryption.kmsState} />
                  <div className="border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--text-muted)" }}>Last rotation</span>
                      <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                        {encryption.keyLastRotatedAt ? relativeFromNow(encryption.keyLastRotatedAt) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span style={{ color: "var(--text-muted)" }}>Encrypted secrets</span>
                      <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                        {encryption.encryptedSecrets.toLocaleString()}
                      </span>
                    </div>
                    {encryption.pendingMigrations > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span style={{ color: "var(--text-muted)" }}>Pending migrations</span>
                        <span className="tabular-nums" style={{ color: "var(--amber-700)" }}>
                          {encryption.pendingMigrations.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </WidgetCard>

            {/* Secret scanning */}
            <WidgetCard
              title="Secret scanning"
              subtitle="GitHub Adv. Security · TruffleHog · Internal regex"
              tone={secretFindings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH") ? "danger" : "default"}
            >
              {secretFindings.length === 0 ? (
                <Empty>No exposed secrets detected.</Empty>
              ) : (
                <FindingTable rows={secretFindings} canResolve={canResolve} />
              )}
            </WidgetCard>

            {/* Dependency vulnerabilities */}
            <WidgetCard
              title="Dependency vulnerabilities"
              subtitle="Snyk · Dependabot · GitHub Adv. Security"
              tone={dependencyFindings.some((f) => f.severity === "CRITICAL") ? "danger" :
                    dependencyFindings.some((f) => f.severity === "HIGH") ? "warning" : "default"}
            >
              {dependencyFindings.length === 0 ? (
                <Empty>No open dependency CVEs.</Empty>
              ) : (
                <FindingTable rows={dependencyFindings} canResolve={canResolve} />
              )}
            </WidgetCard>

            {/* Cloud security */}
            <WidgetCard
              title="Cloud security"
              subtitle="AWS Config · GCP SCC · Azure Defender"
            >
              {cloudFindings.length === 0 ? (
                <Empty>No open cloud-posture findings.</Empty>
              ) : (
                <FindingTable rows={cloudFindings} canResolve={canResolve} />
              )}
            </WidgetCard>

            {/* Recent privileged actions — span 2 cols */}
            <div className="lg:col-span-2">
              <WidgetCard
                title="Recent admin actions of interest"
                subtitle="Privileged role grants, impersonations, API key changes"
              >
                {privilegedActions.length === 0 ? (
                  <Empty>No privileged actions recorded yet.</Empty>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr style={{ color: "var(--text-muted)" }}>
                        <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">When</th>
                        <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Action</th>
                        <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Actor</th>
                        <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Tenant</th>
                        <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {privilegedActions.map((a) => (
                        <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                          <td className="py-2 pr-2 text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                            {relativeFromNow(a.occurredAt)}
                          </td>
                          <td className="py-2 pr-2 text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                            {a.summary}
                          </td>
                          <td className="py-2 pr-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                            {a.actorEmail ?? a.actorName ?? "—"}
                          </td>
                          <td className="py-2 pr-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                            {a.targetTenantSlug ?? "—"}
                          </td>
                          <td className="py-2 pr-2 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {a.ipAddress ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </WidgetCard>
            </div>
          </section>
        </>
      )}

      {tab === "findings" && (
        <FindingsTab
          rows={[
            ...scanner.topFindings,
            ...secretFindings,
            ...cloudFindings,
            ...dependencyFindings,
          ]}
          canResolve={canResolve}
        />
      )}

      {tab === "settings" && canManage && (
        <SettingsTab settings={settings} encryption={encryption} />
      )}
      {tab === "settings" && !canManage && (
        <main className="rounded-lg border p-6 text-center"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            You have read access only. Settings management requires <code>security.manage</code>.
          </p>
        </main>
      )}
    </main>
  );
}

/* ── Helpers ────────────────────────────────────────────── */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function ScanCount({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  const color =
    tone === "danger"  ? "var(--rose-700)" :
    tone === "warning" ? "var(--amber-700)" :
                          "var(--text-default)";
  return (
    <div className="rounded-md border px-2 py-2"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[18px] font-semibold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function EncryptionRow({ label, detail, state }: { label: string; detail: string; state: "HEALTHY" | "WARNING" | "STALE" | "FAILED" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
        <div className="text-[12px]" style={{ color: "var(--text-default)" }}>{detail}</div>
      </div>
      <EncryptionPill state={state} />
    </div>
  );
}

function FindingTable({ rows, canResolve }: { rows: FindingRow[]; canResolve: boolean }) {
  return (
    <table className="w-full">
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <td className="py-1.5 pr-2 align-top">
              <SeverityPill severity={r.severity} />
            </td>
            <td className="py-1.5 pr-2">
              <div className="text-[12px] font-medium truncate" style={{ color: "var(--text-default)" }}>
                {r.title}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {[r.externalRef, r.component, r.version && `v${r.version}`, r.fixVersion && `fix: v${r.fixVersion}`]
                  .filter(Boolean).join(" · ")}
              </div>
            </td>
            {canResolve && (
              <td className="py-1.5 pl-2 text-right align-top">
                <form action={resolveFinding} className="inline-flex">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="REMEDIATED" />
                  <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                    Mark fixed
                  </button>
                </form>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FindingsTab({ rows, canResolve }: { rows: FindingRow[]; canResolve: boolean }) {
  // Dedupe by id, sort by severity then most recent.
  const seen = new Set<string>();
  const dedup = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const sevRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 } as const;
  dedup.sort((a, b) => {
    const sa = sevRank[a.severity];
    const sb = sevRank[b.severity];
    if (sa !== sb) return sa - sb;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Open findings</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {dedup.length} open · sorted by severity
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {dedup.length === 0 ? (
          <Empty>No open findings — full green.</Empty>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Severity</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Source</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Title</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Component</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Detected</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Status</th>
                {canResolve && <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wide">Action</th>}
              </tr>
            </thead>
            <tbody>
              {dedup.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="py-2 pr-3 align-top"><SeverityPill severity={r.severity} /></td>
                  <td className="py-2 pr-3 align-top"><SourceBadge source={r.source} /></td>
                  <td className="py-2 pr-3 align-top">
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.title}</div>
                    {r.externalRef && (
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.externalRef}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top text-[11px]" style={{ color: "var(--text-default)" }}>
                    {r.component ?? "—"}
                    {r.version && <span style={{ color: "var(--text-muted)" }}> · v{r.version}</span>}
                  </td>
                  <td className="py-2 pr-3 align-top text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(r.detectedAt)}
                  </td>
                  <td className="py-2 pr-3 align-top"><StatusPill status={r.status} /></td>
                  {canResolve && (
                    <td className="py-2 pl-3 align-top text-right">
                      <form action={resolveFinding} className="inline-flex flex-col gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <select name="status"
                                className="rounded-md border px-2 py-1 text-[11px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          <option value="REMEDIATED">Mark fixed</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="ACCEPTED_RISK">Accept risk</option>
                          <option value="FALSE_POSITIVE">False positive</option>
                          <option value="WONT_FIX">Won&apos;t fix</option>
                        </select>
                        <button type="submit"
                                className="rounded-md border px-2 py-1 text-[11px] font-medium"
                                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          Apply
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function SettingsTab({
  settings, encryption,
}: {
  settings: Awaited<ReturnType<typeof loadSecurityCenterPage>>["settings"];
  encryption: Awaited<ReturnType<typeof loadSecurityCenterPage>>["encryption"];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border p-5"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Security Center configuration</h3>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Suspicious-activity thresholds, MTTR target, password policy.
        </p>
        <form action={saveSecuritySettings} className="mt-4 grid grid-cols-2 gap-3">
          <Input name="failedLoginThreshold" label="Failed-login burst threshold" type="number"
                 defaultValue={String(settings?.failedLoginThreshold ?? 5)} />
          <Input name="failedLoginWindowMin" label="Threshold window (minutes)" type="number"
                 defaultValue={String(settings?.failedLoginWindowMin ?? 15)} />
          <Input name="mttrTargetDays" label="MTTR target (days)" type="number"
                 defaultValue={String(settings?.mttrTargetDays ?? 14)} full />
          <Toggle name="bannerOnHighSeverity" label="High-severity banner"
                  defaultChecked={settings?.bannerOnHighSeverity ?? true} />
          <Toggle name="realtimeFeedEnabled" label="Realtime suspicious feed"
                  defaultChecked={settings?.realtimeFeedEnabled ?? true} />

          <div className="col-span-2 mt-2 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Password policy
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input name="passwordMinLength" label="Min length" type="number"
                     defaultValue={String(settings?.passwordMinLength ?? 14)} />
              <Input name="passwordMaxAgeDays" label="Max age (days, 0 = never)" type="number"
                     defaultValue={String(settings?.passwordMaxAgeDays ?? 180)} />
              <Input name="passwordHistoryDepth" label="History depth" type="number"
                     defaultValue={String(settings?.passwordHistoryDepth ?? 8)} />
              <div />
              <Toggle name="passwordRequireMixed" label="Require mixed case + digit + symbol"
                      defaultChecked={settings?.passwordRequireMixed ?? true} />
              <Toggle name="passwordBreachCheck" label="Block known-breached passwords"
                      defaultChecked={settings?.passwordBreachCheck ?? true} />
            </div>
          </div>

          <div className="col-span-2 mt-2 flex justify-end">
            <button type="submit"
                    className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save settings
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border p-5"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Encryption posture</h3>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Manual override for the at-rest / in-transit / KMS state pills + key rotation.
        </p>
        <form action={updateEncryptionStatus} className="mt-4 grid grid-cols-2 gap-3">
          <Select name="atRestState" label="At-rest state" defaultValue={encryption?.atRestState ?? "HEALTHY"}
                  options={["HEALTHY", "WARNING", "STALE", "FAILED"]} />
          <Select name="inTransitState" label="In-transit state" defaultValue={encryption?.inTransitState ?? "HEALTHY"}
                  options={["HEALTHY", "WARNING", "STALE", "FAILED"]} />
          <Select name="kmsState" label="KMS state" defaultValue={encryption?.kmsState ?? "HEALTHY"}
                  options={["HEALTHY", "WARNING", "STALE", "FAILED"]} />
          <Toggle name="rotateNow" label="Rotate KMS data-encryption key now" defaultChecked={false} />
          <label className="col-span-2 block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes (optional)</span>
            <textarea
              name="notes"
              rows={2}
              defaultValue={encryption?.notes ?? ""}
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </label>
          <div className="col-span-2 mt-2 flex justify-end">
            <button type="submit"
                    className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save encryption status
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Input({
  name, label, type, defaultValue, full,
}: { name: string; label: string; type: string; defaultValue: string; full?: boolean }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}

function Select({
  name, label, defaultValue, options,
}: { name: string; label: string; defaultValue: string; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Toggle({
  name, label, defaultChecked,
}: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="col-span-2 inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
