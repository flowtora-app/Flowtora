// Page 50 — Security Center data layer.
//
// Single-pane-of-glass for platform security posture. Aggregates
// findings (vuln scan / secret scan / dependency / cloud / pen test /
// bug bounty / manual), suspicious-activity feed, encryption status,
// password policy compliance, and recent privileged-admin actions.

import { db } from "@/lib/db";
import type {
  SecurityFindingSource,
  SecurityFindingSeverity,
  SecurityFindingStatus,
  SuspiciousActivityKind,
  SuspiciousActivityStatus,
  VulnerabilityScanSource,
  PenTestStatus,
  BugBountyPlatform,
  BugBountyStatus,
  EncryptionState,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Status / severity tone palette ──────────────────────── */

export const SEVERITY_TONE: Record<
  SecurityFindingSeverity,
  { bg: string; fg: string; label: string; rank: number }
> = {
  CRITICAL: { bg: "var(--rose-100)",   fg: "var(--rose-700)",    label: "Critical", rank: 0 },
  HIGH:     { bg: "var(--amber-100)",  fg: "var(--amber-700)",   label: "High",     rank: 1 },
  MEDIUM:   { bg: "var(--sky-100)",    fg: "var(--sky-700)",     label: "Medium",   rank: 2 },
  LOW:      { bg: "var(--slate-100)",  fg: "var(--slate-700)",   label: "Low",      rank: 3 },
  INFO:     { bg: "var(--surface-2)",  fg: "var(--text-muted)",  label: "Info",     rank: 4 },
};

export const FINDING_STATUS_TONE: Record<SecurityFindingStatus, { bg: string; fg: string }> = {
  OPEN:           { bg: "var(--rose-100)",   fg: "var(--rose-700)" },
  IN_PROGRESS:    { bg: "var(--amber-100)",  fg: "var(--amber-700)" },
  REMEDIATED:     { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  ACCEPTED_RISK:  { bg: "var(--violet-100)", fg: "var(--violet-700)" },
  FALSE_POSITIVE: { bg: "var(--surface-2)",  fg: "var(--text-muted)" },
  WONT_FIX:       { bg: "var(--surface-2)",  fg: "var(--text-muted)" },
};

export const SUSPICIOUS_KIND_LABEL: Record<SuspiciousActivityKind, string> = {
  FAILED_LOGIN_BURST:    "Failed-login burst",
  UNUSUAL_GEO:           "Unusual geo",
  CONCURRENT_SESSIONS:   "Concurrent sessions",
  BRUTE_FORCE:           "Brute-force",
  LEAKED_CREDENTIAL:     "Leaked credential",
  IMPOSSIBLE_TRAVEL:     "Impossible travel",
  TOR_EXIT_NODE:         "Tor exit node",
  NEW_DEVICE:            "New device",
};

export const SCAN_SOURCE_LABEL: Record<VulnerabilityScanSource, string> = {
  SNYK:                     "Snyk",
  DEPENDABOT:               "Dependabot",
  GITHUB_ADVANCED_SECURITY: "GitHub Adv. Security",
  SEMGREP:                  "Semgrep",
  TRUFFLEHOG:               "TruffleHog",
  AWS_INSPECTOR:            "AWS Inspector",
  INTERNAL:                 "Internal scan",
};

export const FINDING_SOURCE_LABEL: Record<SecurityFindingSource, string> = {
  VULNERABILITY_SCAN: "Vulnerability scan",
  SECRET_SCAN:        "Secret scan",
  DEPENDENCY_SCAN:    "Dependency scan",
  CLOUD_POSTURE:      "Cloud posture",
  PENETRATION_TEST:   "Pen test",
  BUG_BOUNTY:         "Bug bounty",
  MANUAL:             "Manual",
};

export const ENCRYPTION_STATE_TONE: Record<EncryptionState, { bg: string; fg: string; label: string }> = {
  HEALTHY: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Healthy" },
  WARNING: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Warning" },
  STALE:   { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Stale" },
  FAILED:  { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
};

export const BUG_BOUNTY_LABEL: Record<BugBountyPlatform, string> = {
  HACKERONE: "HackerOne",
  INTIGRITI: "Intigriti",
  BUGCROWD:  "Bugcrowd",
  YESWEHACK: "YesWeHack",
  PRIVATE:   "Private program",
};

export const BUG_BOUNTY_STATUS_LABEL: Record<BugBountyStatus, string> = {
  TRIAGE:       "Triage",
  CONFIRMED:    "Confirmed",
  RESOLVED:     "Resolved",
  DUPLICATE:    "Duplicate",
  N_A:          "N/A",
  INFORMATIVE:  "Informative",
};

export const PEN_TEST_STATUS_LABEL: Record<PenTestStatus, string> = {
  SCHEDULED:        "Scheduled",
  IN_PROGRESS:      "In progress",
  COMPLETE:         "Complete",
  RETEST_REQUIRED:  "Retest required",
  RETEST_PASSED:    "Retest passed",
};

/* ── Hero score + KPIs ───────────────────────────────────── */

export interface SecurityHero {
  score: number;
  grade: string;
  scoreComputedAt: Date | null;
  /** Components contributing to the score, for the gauge tooltip. */
  breakdown: { label: string; weight: number; ok: boolean }[];
}

export interface SecurityKpis {
  mfaEnforcedPct: number;          // % of platform admins with MFA
  totalAdmins: number;
  mfaAdmins: number;
  ssoTenantAdoptionPct: number;
  enterpriseTenants: number;
  ssoTenants: number;
  openCritical: number;
  openHigh: number;
  openMedium: number;
  openLow: number;
  mttrDays: number | null;         // mean time to remediate
  mttrTargetDays: number;
  mttrTrend: "good" | "warning" | "danger";
}

export async function loadSecurityHeroAndKpis(): Promise<{
  hero: SecurityHero;
  kpis: SecurityKpis;
}> {
  const [
    settings,
    totalAdmins,
    mfaAdmins,
    ssoEnabledTenants,
    enterpriseTenants,
    findingsByStatus,
    remediated,
    encryption,
  ] = await Promise.all([
    db.securityCenterSettings.findUnique({ where: { id: "default" } }),
    db.user.count({ where: { platformRole: { not: null } } }),
    db.user.count({ where: { platformRole: { not: null }, twoFactorEnabled: true } }),
    db.ssoTenantConfig.findMany({
      where: { status: "ACTIVE" },
      select: { tenantId: true },
      distinct: ["tenantId"],
    }),
    db.tenant.count({ where: { plan: "ENTERPRISE" } }),
    db.securityFinding.groupBy({
      by: ["severity"],
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      _count: { _all: true },
    }),
    db.securityFinding.findMany({
      where: { remediatedAt: { not: null }, daysToRemediate: { not: null } },
      orderBy: { remediatedAt: "desc" },
      take: 30,
      select: { daysToRemediate: true },
    }),
    db.encryptionStatus.findUnique({ where: { id: "default" } }),
  ]);

  const sevMap = new Map<SecurityFindingSeverity, number>();
  for (const r of findingsByStatus) sevMap.set(r.severity, r._count._all);

  const mfaPct = totalAdmins === 0 ? 100 : Math.round((mfaAdmins / totalAdmins) * 100);
  const ssoPct = enterpriseTenants === 0
    ? 0
    : Math.round((ssoEnabledTenants.length / enterpriseTenants) * 100);

  const mttrTarget = settings?.mttrTargetDays ?? 14;
  const mttr = remediated.length === 0
    ? null
    : Math.round(
        remediated.reduce((s, r) => s + (r.daysToRemediate ?? 0), 0) / remediated.length,
      );

  // Score computation — 6 weighted components.
  const components = [
    { label: "MFA on platform admins", weight: 20, ok: mfaPct >= 100 },
    { label: "Enterprise SSO adoption", weight: 15, ok: ssoPct >= 75 },
    { label: "No critical findings",    weight: 25, ok: (sevMap.get("CRITICAL") ?? 0) === 0 },
    { label: "MTTR within target",      weight: 15, ok: mttr == null || mttr <= mttrTarget },
    { label: "Encryption posture",      weight: 15, ok:
      (encryption?.atRestState === "HEALTHY") &&
      (encryption?.inTransitState === "HEALTHY") &&
      (encryption?.kmsState === "HEALTHY") },
    { label: "Recent vuln scan green",  weight: 10, ok: (sevMap.get("HIGH") ?? 0) <= 5 },
  ];
  const computedScore = components.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const score = settings?.cachedScore ?? computedScore;
  const grade = scoreToGrade(score);

  let mttrTrend: SecurityKpis["mttrTrend"] = "good";
  if (mttr != null) {
    if (mttr > mttrTarget * 1.5)   mttrTrend = "danger";
    else if (mttr > mttrTarget)    mttrTrend = "warning";
  }

  return {
    hero: {
      score,
      grade,
      scoreComputedAt: settings?.scoreComputedAt ?? null,
      breakdown: components,
    },
    kpis: {
      mfaEnforcedPct: mfaPct,
      totalAdmins,
      mfaAdmins,
      ssoTenantAdoptionPct: ssoPct,
      enterpriseTenants,
      ssoTenants: ssoEnabledTenants.length,
      openCritical: sevMap.get("CRITICAL") ?? 0,
      openHigh:     sevMap.get("HIGH")     ?? 0,
      openMedium:   sevMap.get("MEDIUM")   ?? 0,
      openLow:      sevMap.get("LOW")      ?? 0,
      mttrDays: mttr,
      mttrTargetDays: mttrTarget,
      mttrTrend,
    },
  };
}

export function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/* ── Suspicious activity feed ─────────────────────────────── */

export interface SuspiciousActivityRow {
  id: string;
  kind: SuspiciousActivityKind;
  kindLabel: string;
  severity: SecurityFindingSeverity;
  status: SuspiciousActivityStatus;
  userEmail: string | null;
  userDisplayName: string | null;
  ipAddress: string | null;
  geoLocation: string | null;
  summary: string;
  occurredAt: Date;
  resolvedAt: Date | null;
}

export async function loadSuspiciousActivity(limit = 20): Promise<SuspiciousActivityRow[]> {
  const rows = await db.suspiciousActivity.findMany({
    orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindLabel: SUSPICIOUS_KIND_LABEL[r.kind],
    severity: r.severity,
    status: r.status,
    userEmail: r.userEmail,
    userDisplayName: r.userDisplayName,
    ipAddress: r.ipAddress,
    geoLocation: r.geoLocation,
    summary: r.summary,
    occurredAt: r.occurredAt,
    resolvedAt: r.resolvedAt,
  }));
}

/* ── Vulnerability scanner widget ─────────────────────────── */

export interface ScanSummary {
  id: string;
  source: VulnerabilityScanSource;
  sourceLabel: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  summary: string | null;
  scope: string | null;
}

export interface VulnerabilityScannerWidget {
  recent: ScanSummary[];
  topFindings: FindingRow[];
}

export async function loadVulnerabilityScannerWidget(): Promise<VulnerabilityScannerWidget> {
  const [recent, topFindings] = await Promise.all([
    db.vulnerabilityScan.findMany({
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
    db.securityFinding.findMany({
      where: {
        source: { in: ["VULNERABILITY_SCAN", "DEPENDENCY_SCAN"] },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
      take: 10,
    }),
  ]);
  return {
    recent: recent.map((r) => ({
      id: r.id,
      source: r.source,
      sourceLabel: SCAN_SOURCE_LABEL[r.source],
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      totalFindings: r.totalFindings,
      critical: r.critical,
      high: r.high,
      medium: r.medium,
      low: r.low,
      summary: r.summary,
      scope: r.scope,
    })),
    topFindings: topFindings.map(toFindingRow),
  };
}

/* ── Penetration test widget ──────────────────────────────── */

export interface PenTestRow {
  id: string;
  vendor: string;
  scope: string;
  startedAt: Date;
  completedAt: Date | null;
  status: PenTestStatus;
  statusLabel: string;
  executiveSummaryUrl: string | null;
  critical: number;
  high: number;
  medium: number;
  low: number;
  retestPassed: number;
}

export async function loadPenTests(): Promise<PenTestRow[]> {
  const rows = await db.penetrationTest.findMany({
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    take: 10,
  });
  return rows.map((r) => ({
    id: r.id,
    vendor: r.vendor,
    scope: r.scope,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    status: r.status,
    statusLabel: PEN_TEST_STATUS_LABEL[r.status],
    executiveSummaryUrl: r.executiveSummaryUrl,
    critical: r.critical,
    high: r.high,
    medium: r.medium,
    low: r.low,
    retestPassed: r.retestPassed,
  }));
}

/* ── Bug bounty widget ────────────────────────────────────── */

export interface BugBountyWidget {
  reports: {
    id: string;
    platform: BugBountyPlatform;
    platformLabel: string;
    externalId: string;
    reporter: string;
    title: string;
    severity: SecurityFindingSeverity;
    status: BugBountyStatus;
    statusLabel: string;
    payoutCents: number;
    submittedAt: Date;
    resolvedAt: Date | null;
  }[];
  openByPlatform: { platform: BugBountyPlatform; label: string; count: number }[];
  payoutYtdCents: number;
  payoutAllTimeCents: number;
}

export async function loadBugBountyWidget(): Promise<BugBountyWidget> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const [reports, openCounts, ytdAgg, allTimeAgg] = await Promise.all([
    db.bugBountyReport.findMany({
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      take: 10,
    }),
    db.bugBountyReport.groupBy({
      by: ["platform"],
      where: { status: { in: ["TRIAGE", "CONFIRMED"] } },
      _count: { _all: true },
    }),
    db.bugBountyReport.aggregate({
      where: { resolvedAt: { gte: yearStart } },
      _sum: { payoutCents: true },
    }),
    db.bugBountyReport.aggregate({
      _sum: { payoutCents: true },
    }),
  ]);
  return {
    reports: reports.map((r) => ({
      id: r.id,
      platform: r.platform,
      platformLabel: BUG_BOUNTY_LABEL[r.platform],
      externalId: r.externalId,
      reporter: r.reporter,
      title: r.title,
      severity: r.severity,
      status: r.status,
      statusLabel: BUG_BOUNTY_STATUS_LABEL[r.status],
      payoutCents: r.payoutCents,
      submittedAt: r.submittedAt,
      resolvedAt: r.resolvedAt,
    })),
    openByPlatform: openCounts.map((c) => ({
      platform: c.platform,
      label: BUG_BOUNTY_LABEL[c.platform],
      count: c._count._all,
    })),
    payoutYtdCents: ytdAgg._sum.payoutCents ?? 0,
    payoutAllTimeCents: allTimeAgg._sum.payoutCents ?? 0,
  };
}

/* ── Password policy compliance widget ────────────────────── */

export interface PasswordPolicyWidget {
  totalAudited: number;
  compliantCount: number;
  compliantPct: number;
  perRule: { label: string; passing: number; pct: number }[];
  failingAdmins: {
    id: string;
    email: string | null;
    name: string | null;
    failingRules: string[];
    passwordAgeDays: number | null;
    mfaEnabled: boolean;
  }[];
}

export async function loadPasswordPolicyWidget(): Promise<PasswordPolicyWidget> {
  const audits = await db.passwordPolicyAudit.findMany({
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { checkedAt: "desc" },
  });

  const total = audits.length;
  if (total === 0) {
    return {
      totalAudited: 0,
      compliantCount: 0,
      compliantPct: 0,
      perRule: [
        { label: "Length",       passing: 0, pct: 0 },
        { label: "Complexity",   passing: 0, pct: 0 },
        { label: "Age",          passing: 0, pct: 0 },
        { label: "History",      passing: 0, pct: 0 },
        { label: "Breach check", passing: 0, pct: 0 },
        { label: "MFA enabled",  passing: 0, pct: 0 },
      ],
      failingAdmins: [],
    };
  }

  const lenOk        = audits.filter((a) => a.meetsLength).length;
  const complexityOk = audits.filter((a) => a.meetsComplexity).length;
  const ageOk        = audits.filter((a) => a.meetsAge).length;
  const historyOk    = audits.filter((a) => a.meetsHistory).length;
  const breachOk     = audits.filter((a) => a.passesBreachCheck).length;
  const mfaOk        = audits.filter((a) => a.mfaEnabled).length;

  const fullyCompliant = audits.filter((a) =>
    a.meetsLength && a.meetsComplexity && a.meetsAge && a.meetsHistory &&
    a.passesBreachCheck && a.mfaEnabled,
  ).length;

  const failingAdmins = audits
    .filter((a) =>
      !a.meetsLength || !a.meetsComplexity || !a.meetsAge || !a.meetsHistory ||
      !a.passesBreachCheck || !a.mfaEnabled,
    )
    .slice(0, 8)
    .map((a) => {
      const failing: string[] = [];
      if (!a.meetsLength)        failing.push("Length");
      if (!a.meetsComplexity)    failing.push("Complexity");
      if (!a.meetsAge)           failing.push("Age");
      if (!a.meetsHistory)       failing.push("History");
      if (!a.passesBreachCheck)  failing.push("Breach");
      if (!a.mfaEnabled)         failing.push("MFA");
      return {
        id: a.user.id,
        email: a.user.email,
        name: a.user.name,
        failingRules: failing,
        passwordAgeDays: a.passwordAgeDays,
        mfaEnabled: a.mfaEnabled,
      };
    });

  return {
    totalAudited: total,
    compliantCount: fullyCompliant,
    compliantPct: Math.round((fullyCompliant / total) * 100),
    perRule: [
      { label: "Length",       passing: lenOk,        pct: Math.round((lenOk / total) * 100) },
      { label: "Complexity",   passing: complexityOk, pct: Math.round((complexityOk / total) * 100) },
      { label: "Age",          passing: ageOk,        pct: Math.round((ageOk / total) * 100) },
      { label: "History",      passing: historyOk,    pct: Math.round((historyOk / total) * 100) },
      { label: "Breach check", passing: breachOk,     pct: Math.round((breachOk / total) * 100) },
      { label: "MFA enabled",  passing: mfaOk,        pct: Math.round((mfaOk / total) * 100) },
    ],
    failingAdmins,
  };
}

/* ── Encryption posture ───────────────────────────────────── */

export async function loadEncryptionStatus() {
  const e = await db.encryptionStatus.findUnique({ where: { id: "default" } });
  if (!e) return null;
  return {
    atRestAlgorithm:   e.atRestAlgorithm,
    atRestState:       e.atRestState,
    inTransitProtocol: e.inTransitProtocol,
    inTransitState:    e.inTransitState,
    kmsProvider:       e.kmsProvider,
    kmsState:          e.kmsState,
    keyLastRotatedAt:  e.keyLastRotatedAt,
    keyRotationDueIn:  e.keyRotationDueIn,
    encryptedSecrets:  e.encryptedSecrets,
    pendingMigrations: e.pendingMigrations,
    notes:             e.notes,
  };
}

/* ── Secret scanning + dependency + cloud widget ──────────── */

export async function loadFindingsBySource(source: SecurityFindingSource, limit = 8) {
  const rows = await db.securityFinding.findMany({
    where: { source, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
    take: limit,
    include: {
      assignedTo: { select: { id: true, email: true, name: true } },
    },
  });
  return rows.map(toFindingRow);
}

export interface FindingRow {
  id: string;
  source: SecurityFindingSource;
  sourceLabel: string;
  title: string;
  description: string | null;
  severity: SecurityFindingSeverity;
  status: SecurityFindingStatus;
  externalRef: string | null;
  component: string | null;
  version: string | null;
  fixVersion: string | null;
  detectedAt: Date;
  remediatedAt: Date | null;
  daysToRemediate: number | null;
  assignedToEmail: string | null;
  assignedToName: string | null;
}

function toFindingRow(r: {
  id: string;
  source: SecurityFindingSource;
  title: string;
  description: string | null;
  severity: SecurityFindingSeverity;
  status: SecurityFindingStatus;
  externalRef: string | null;
  component: string | null;
  version: string | null;
  fixVersion: string | null;
  detectedAt: Date;
  remediatedAt: Date | null;
  daysToRemediate: number | null;
  assignedTo?: { id: string; email: string | null; name: string | null } | null;
}): FindingRow {
  return {
    id: r.id,
    source: r.source,
    sourceLabel: FINDING_SOURCE_LABEL[r.source],
    title: r.title,
    description: r.description,
    severity: r.severity,
    status: r.status,
    externalRef: r.externalRef,
    component: r.component,
    version: r.version,
    fixVersion: r.fixVersion,
    detectedAt: r.detectedAt,
    remediatedAt: r.remediatedAt,
    daysToRemediate: r.daysToRemediate,
    assignedToEmail: r.assignedTo?.email ?? null,
    assignedToName:  r.assignedTo?.name  ?? null,
  };
}

/* ── Recent admin actions of interest ─────────────────────── */

export interface PrivilegedActionRow {
  id: string;
  kind: string;
  actorEmail: string | null;
  actorName: string | null;
  targetEmail: string | null;
  targetTenantSlug: string | null;
  occurredAt: Date;
  ipAddress: string | null;
  summary: string;
}

export async function loadPrivilegedActions(limit = 12): Promise<PrivilegedActionRow[]> {
  // Pull the last N audit-log rows whose action falls inside the
  // privileged set + severity is CRITICAL. AuditLog has no `actor`
  // relation defined, so we fetch the user roster separately.
  const rows = await db.auditLog.findMany({
    where: {
      OR: [
        { severity: "CRITICAL" },
        {
          action: {
            in: [
              "platform.role.changed",
              "platform.elevation.granted",
              "platform.elevation.revoked",
              "tenant.impersonation.started",
              "tenant.impersonation.ended",
              "tenant.suspended",
              "tenant.archived",
              "tenant.deleted",
              "apiKey.created",
              "apiKey.revoked",
            ],
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { tenant: { select: { slug: true } } },
  });
  const actorIds = Array.from(new Set(rows.map((r) => r.userId).filter((u): u is string => !!u)));
  const actors = actorIds.length === 0
    ? []
    : await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true, name: true },
      });
  const actorMap = new Map(actors.map((a) => [a.id, a]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.action,
    actorEmail: r.userId ? actorMap.get(r.userId)?.email ?? null : null,
    actorName:  r.userId ? actorMap.get(r.userId)?.name ?? null  : null,
    targetEmail: null,
    targetTenantSlug: r.tenant?.slug ?? null,
    occurredAt: r.createdAt,
    ipAddress: r.ipAddress,
    summary: humanizeAction(r.action),
  }));
}

function humanizeAction(a: string): string {
  return a.toLowerCase().replace(/_/g, " ");
}

/* ── Settings ─────────────────────────────────────────────── */

export async function loadSecurityCenterSettings() {
  return db.securityCenterSettings.findUnique({ where: { id: "default" } });
}

/* ── Helpers for relative-time labels ─────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function moneyFormat(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ── Page-load aggregator ─────────────────────────────────── */

export async function loadSecurityCenterPage() {
  const [
    { hero, kpis },
    suspicious,
    scanner,
    penTests,
    bugBounty,
    passwordPolicy,
    encryption,
    secretFindings,
    cloudFindings,
    dependencyFindings,
    privilegedActions,
    settings,
  ] = await Promise.all([
    loadSecurityHeroAndKpis(),
    loadSuspiciousActivity(20),
    loadVulnerabilityScannerWidget(),
    loadPenTests(),
    loadBugBountyWidget(),
    loadPasswordPolicyWidget(),
    loadEncryptionStatus(),
    loadFindingsBySource("SECRET_SCAN", 6),
    loadFindingsBySource("CLOUD_POSTURE", 6),
    loadFindingsBySource("DEPENDENCY_SCAN", 6),
    loadPrivilegedActions(12),
    loadSecurityCenterSettings(),
  ]);
  return {
    hero, kpis, suspicious, scanner, penTests, bugBounty,
    passwordPolicy, encryption,
    secretFindings, cloudFindings, dependencyFindings,
    privilegedActions, settings,
  };
}
