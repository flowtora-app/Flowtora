// Page 62 — Feature Flags data layer.

import { db } from "@/lib/db";
import type {
  PlatformFlagType,
  PlatformFlagEnv,
  PlatformFlagChangeKind,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const FLAG_TYPE_LABEL: Record<PlatformFlagType, string> = {
  BOOLEAN:      "Boolean",
  MULTIVARIATE: "Multivariate",
  STRING:       "String",
  NUMBER:       "Number",
  JSON_VALUE:   "JSON",
};

export const FLAG_TYPE_TONE: Record<
  PlatformFlagType,
  { bg: string; fg: string }
> = {
  BOOLEAN:      { bg: "var(--sky-100)",    fg: "var(--sky-700)" },
  MULTIVARIATE: { bg: "var(--violet-100)", fg: "var(--violet-700)" },
  STRING:       { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  NUMBER:       { bg: "var(--amber-100)",  fg: "var(--amber-700)" },
  JSON_VALUE:   { bg: "var(--surface-2)",  fg: "var(--text-default)" },
};

export const FLAG_ENV_LABEL: Record<PlatformFlagEnv, string> = {
  PRODUCTION: "Production",
  STAGING:    "Staging",
  SANDBOX:    "Sandbox",
  PREVIEW:    "Preview",
};

export const FLAG_ENV_TONE: Record<
  PlatformFlagEnv,
  { bg: string; fg: string }
> = {
  PRODUCTION: { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  STAGING:    { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  SANDBOX:    { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  PREVIEW:    { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
};

export const FLAG_CHANGE_LABEL: Record<PlatformFlagChangeKind, string> = {
  CREATED:           "Created",
  UPDATED:           "Updated",
  ROLLOUT_CHANGED:   "Rollout changed",
  KILL_SWITCH:       "Kill switch",
  ENABLED:           "Enabled",
  DISABLED:          "Disabled",
  VARIANT_CHANGED:   "Variant changed",
  RULE_ADDED:        "Rule added",
  RULE_REMOVED:      "Rule removed",
  SEGMENT_CHANGED:   "Segment changed",
  SCHEDULED:         "Scheduled step",
  DEPENDENCY_ADDED:  "Dependency added",
  ROLLED_BACK:       "Rolled back",
  ARCHIVED:          "Archived",
};

export const FLAG_CHANGE_TONE: Record<
  PlatformFlagChangeKind,
  { bg: string; fg: string }
> = {
  CREATED:           { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  UPDATED:           { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  ROLLOUT_CHANGED:   { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
  KILL_SWITCH:       { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  ENABLED:           { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  DISABLED:          { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
  VARIANT_CHANGED:   { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  RULE_ADDED:        { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  RULE_REMOVED:      { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
  SEGMENT_CHANGED:   { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
  SCHEDULED:         { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  DEPENDENCY_ADDED:  { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  ROLLED_BACK:       { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  ARCHIVED:          { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface FlagKpis {
  totalFlags: number;
  liveInProd: number;
  partialInProd: number;
  killSwitched: number;
  archived: number;
  segments: number;
  evaluations24h: number;
  scheduledChanges: number;
}

export async function loadFlagKpis(): Promise<FlagKpis> {
  const since24 = new Date(Date.now() - DAY);
  const [flags, segments, stats24, schedules] = await Promise.all([
    db.platformFlag.findMany({
      select: {
        archived: true,
        prodEnabled: true,
        prodRolloutPct: true,
        killSwitchActive: true,
      },
    }),
    db.platformFlagSegment.count(),
    db.platformFlagEvalStat.aggregate({
      _sum: { evaluations: true },
      where: { day: { gte: since24 } },
    }),
    db.platformFlagScheduleStep.count({
      where: { appliedAt: null, scheduledAt: { gt: new Date() } },
    }),
  ]);
  return {
    totalFlags:       flags.length,
    liveInProd:       flags.filter((f) => f.prodEnabled && f.prodRolloutPct >= 100 && !f.killSwitchActive && !f.archived).length,
    partialInProd:    flags.filter((f) => f.prodEnabled && f.prodRolloutPct > 0 && f.prodRolloutPct < 100 && !f.killSwitchActive && !f.archived).length,
    killSwitched:     flags.filter((f) => f.killSwitchActive).length,
    archived:         flags.filter((f) => f.archived).length,
    segments,
    evaluations24h:   stats24._sum.evaluations ?? 0,
    scheduledChanges: schedules,
  };
}

/* ── Flags (table) ─────────────────────────────────────── */

export async function loadFlags() {
  return db.platformFlag.findMany({
    orderBy: [{ archived: "asc" }, { updatedAt: "desc" }],
    include: {
      variants: { orderBy: { weightPct: "desc" } },
      _count: { select: { rules: true, dependents: true, dependsOn: true, codeRefs: true } },
    },
  });
}

/* ── Flag detail ──────────────────────────────────────── */

export async function loadFlagDetail(key: string) {
  const flag = await db.platformFlag.findUnique({
    where: { key },
    include: {
      variants: { orderBy: { weightPct: "desc" } },
      rules:    { orderBy: [{ env: "asc" }, { order: "asc" }] },
      scheduleSteps: { orderBy: { scheduledAt: "asc" } },
      codeRefs: { orderBy: { lastSeenAt: "desc" }, take: 50 },
      changeHistory: { orderBy: { createdAt: "desc" }, take: 50 },
      dependsOn: { include: { dependsOn: { select: { key: true, name: true } } } },
      dependents: { include: { flag:      { select: { key: true, name: true } } } },
      evaluationStats: {
        where: { day: { gte: new Date(Date.now() - 30 * DAY) } },
        orderBy: { day: "asc" },
      },
    },
  });
  return flag;
}

/* ── Segments ──────────────────────────────────────────── */

export async function loadSegments() {
  return db.platformFlagSegment.findMany({
    orderBy: { key: "asc" },
  });
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadFlagSettings() {
  return db.platformFlagSettings.findUnique({ where: { id: "default" } });
}

/* ── 30-day evaluation series ─────────────────────────── */

export interface EvaluationSeries {
  series: Array<{ day: string; evaluations: number }>;
  topFlags: Array<{ key: string; name: string; evaluations: number }>;
}

export async function loadEvaluationSeries(days = 30): Promise<EvaluationSeries> {
  const since = new Date(Date.now() - days * DAY);
  const rows = await db.platformFlagEvalStat.findMany({
    where: { day: { gte: since } },
    include: { flag: { select: { key: true, name: true } } },
    orderBy: { day: "asc" },
  });
  const byDay = new Map<string, number>();
  const byFlag = new Map<string, { key: string; name: string; evaluations: number }>();
  for (const r of rows) {
    const day = r.day.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + r.evaluations);
    const f = r.flag;
    if (!f) continue;
    const cur = byFlag.get(f.key) ?? { key: f.key, name: f.name, evaluations: 0 };
    cur.evaluations += r.evaluations;
    byFlag.set(f.key, cur);
  }
  const series = Array.from(byDay.entries()).map(([day, evaluations]) => ({ day, evaluations }));
  const topFlags = Array.from(byFlag.values()).sort((a, b) => b.evaluations - a.evaluations).slice(0, 10);
  return { series, topFlags };
}

/* ── Helpers ───────────────────────────────────────────── */

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

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

/** Effective rollout for an env. */
export function effectiveRollout(
  prodEnabled: boolean, stagingEnabled: boolean, sandboxEnabled: boolean,
  prodPct: number, stagingPct: number, sandboxPct: number,
  killSwitchActive: boolean,
  env: PlatformFlagEnv,
): { active: boolean; pct: number } {
  if (env === "PRODUCTION") {
    if (killSwitchActive) return { active: false, pct: 0 };
    return { active: prodEnabled, pct: prodEnabled ? prodPct : 0 };
  }
  if (env === "STAGING") return { active: stagingEnabled, pct: stagingEnabled ? stagingPct : 0 };
  if (env === "SANDBOX") return { active: sandboxEnabled, pct: sandboxEnabled ? sandboxPct : 0 };
  return { active: false, pct: 0 };
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadFlagsPage() {
  const [kpis, flags, segments, settings, evals] = await Promise.all([
    loadFlagKpis(),
    loadFlags(),
    loadSegments(),
    loadFlagSettings(),
    loadEvaluationSeries(30),
  ]);
  return { kpis, flags, segments, settings, evals };
}
