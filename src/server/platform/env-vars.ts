// Page 63 — Environment Variables data layer.

import { db } from "@/lib/db";
import type {
  EnvVarType,
  EnvVarSource,
  EnvVarSyncStatus,
  EnvVarChangeKind,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const ENV_VAR_TYPE_LABEL: Record<EnvVarType, string> = {
  SECRET: "Secret",
  CONFIG: "Config",
};

export const ENV_VAR_TYPE_TONE: Record<
  EnvVarType,
  { bg: string; fg: string }
> = {
  SECRET: { bg: "var(--rose-100)", fg: "var(--rose-700)" },
  CONFIG: { bg: "var(--sky-100)",  fg: "var(--sky-700)" },
};

export const ENV_VAR_SOURCE_LABEL: Record<EnvVarSource, string> = {
  VAULT:                "HashiCorp Vault",
  DOPPLER:              "Doppler",
  AWS_SECRETS_MANAGER:  "AWS Secrets Manager",
  GCP_SECRET_MANAGER:   "GCP Secret Manager",
  AZURE_KEY_VAULT:      "Azure Key Vault",
  ENV_FILE:             ".env file",
  KUBERNETES:           "Kubernetes Secret",
  VERCEL:               "Vercel Env",
  OTHER:                "Other",
};

export const ENV_VAR_SYNC_TONE: Record<
  EnvVarSyncStatus,
  { bg: string; fg: string; label: string }
> = {
  SYNCED:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Synced" },
  OUT_OF_SYNC: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Out of sync" },
  PENDING:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Pending" },
  FAILED:      { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  NOT_SET:     { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Not set" },
};

export const ENV_LABEL = {
  PRODUCTION: "Production",
  STAGING:    "Staging",
  SANDBOX:    "Sandbox",
  PREVIEW:    "Preview",
} as const;

export const ENV_TONE = {
  PRODUCTION: { bg: "var(--rose-100)",   fg: "var(--rose-700)" },
  STAGING:    { bg: "var(--amber-100)",  fg: "var(--amber-700)" },
  SANDBOX:    { bg: "var(--sky-100)",    fg: "var(--sky-700)" },
  PREVIEW:    { bg: "var(--violet-100)", fg: "var(--violet-700)" },
} as const;

export const ENV_VAR_CHANGE_LABEL: Record<EnvVarChangeKind, string> = {
  CREATED:        "Created",
  UPDATED:        "Updated",
  ROTATED:        "Rotated",
  REVEALED:       "Revealed",
  DELETED:        "Deleted",
  SYNC_TRIGGERED: "Sync triggered",
};

export const ENV_VAR_CHANGE_TONE: Record<
  EnvVarChangeKind,
  { bg: string; fg: string }
> = {
  CREATED:        { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  UPDATED:        { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  ROTATED:        { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
  REVEALED:       { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  DELETED:        { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  SYNC_TRIGGERED: { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface EnvVarKpis {
  totalVars: number;
  secrets: number;
  configs: number;
  outOfSync: number;
  overdueRotation: number;
  recentReveals24h: number;
  services: number;
  sources: number;
}

export async function loadEnvVarKpis(): Promise<EnvVarKpis> {
  const since24 = new Date(Date.now() - DAY);
  const now = new Date();
  const [rows, reveals] = await Promise.all([
    db.platformEnvVar.findMany({
      select: {
        type: true, service: true, source: true,
        prodSyncStatus: true, stagingSyncStatus: true,
        sandboxSyncStatus: true, previewSyncStatus: true,
        rotationPolicyDays: true, lastRotatedAt: true,
      },
    }),
    db.envVarChange.count({
      where: { kind: "REVEALED", createdAt: { gte: since24 } },
    }),
  ]);
  const secrets = rows.filter((r) => r.type === "SECRET").length;
  const configs = rows.filter((r) => r.type === "CONFIG").length;
  const outOfSync = rows.filter((r) =>
    r.prodSyncStatus === "OUT_OF_SYNC" || r.prodSyncStatus === "FAILED" ||
    r.stagingSyncStatus === "OUT_OF_SYNC" || r.stagingSyncStatus === "FAILED",
  ).length;
  const overdueRotation = rows.filter((r) => {
    if (!r.rotationPolicyDays || !r.lastRotatedAt) return false;
    const next = new Date(r.lastRotatedAt.getTime() + r.rotationPolicyDays * DAY);
    return next < now;
  }).length;
  return {
    totalVars:        rows.length,
    secrets,
    configs,
    outOfSync,
    overdueRotation,
    recentReveals24h: reveals,
    services:         new Set(rows.map((r) => r.service)).size,
    sources:          new Set(rows.map((r) => r.source)).size,
  };
}

/* ── Vars (table) ──────────────────────────────────────── */

export async function loadEnvVars() {
  return db.platformEnvVar.findMany({
    orderBy: [{ service: "asc" }, { key: "asc" }],
    include: {
      _count: { select: { changes: true, codeRefs: true } },
    },
  });
}

/* ── Variable detail ───────────────────────────────────── */

export async function loadEnvVarDetail(id: string) {
  return db.platformEnvVar.findUnique({
    where: { id },
    include: {
      changes:  { orderBy: { createdAt: "desc" }, take: 50 },
      codeRefs: { orderBy: { lastSeenAt: "desc" }, take: 50 },
    },
  });
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadEnvVarSettings() {
  return db.envVarSettings.findUnique({ where: { id: "default" } });
}

/* ── Diff between two envs ─────────────────────────────── */

export type EnvKey = "prod" | "staging" | "sandbox" | "preview";

export interface DiffRow {
  id: string;
  key: string;
  service: string;
  type: EnvVarType;
  source: EnvVarSource;
  leftValue: string | null;
  rightValue: string | null;
  /** true if values differ (or one side is missing). */
  different: boolean;
  /** true if either side is set. */
  anySet: boolean;
}

/** Build a diff between two environments. Secret values are redacted. */
export function buildDiff(
  rows: Awaited<ReturnType<typeof loadEnvVars>>,
  left: EnvKey,
  right: EnvKey,
  redact: boolean,
): DiffRow[] {
  const pick = (r: typeof rows[number], k: EnvKey): string | null => {
    const raw = k === "prod"     ? r.prodValue
              : k === "staging"  ? r.stagingValue
              : k === "sandbox"  ? r.sandboxValue
              : r.previewValue;
    if (raw == null) return null;
    if (redact && r.type === "SECRET") return "••••••••••";
    return raw;
  };
  const out: DiffRow[] = [];
  for (const r of rows) {
    const leftValue = pick(r, left);
    const rightValue = pick(r, right);
    const anySet = leftValue != null || rightValue != null;
    if (!anySet) continue;
    const different = leftValue !== rightValue;
    out.push({
      id: r.id, key: r.key, service: r.service, type: r.type, source: r.source,
      leftValue, rightValue, different, anySet,
    });
  }
  // Differences first.
  out.sort((a, b) => Number(b.different) - Number(a.different));
  return out;
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

/** Days until next scheduled rotation (negative = overdue, null = no policy). */
export function rotationCountdownDays(
  lastRotatedAt: Date | null | undefined,
  rotationPolicyDays: number | null | undefined,
): number | null {
  if (!rotationPolicyDays || !lastRotatedAt) return null;
  const next = new Date(lastRotatedAt.getTime() + rotationPolicyDays * DAY);
  const diffDays = Math.floor((next.getTime() - Date.now()) / DAY);
  return diffDays;
}

/** Mask a value with bullets matching its length (or 10 if null). */
export function mask(raw: string | null): string {
  if (raw == null) return "—";
  const len = Math.min(raw.length, 20);
  return "•".repeat(Math.max(len, 8));
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadEnvVarsPage() {
  const [kpis, vars, settings] = await Promise.all([
    loadEnvVarKpis(),
    loadEnvVars(),
    loadEnvVarSettings(),
  ]);
  return { kpis, vars, settings };
}
