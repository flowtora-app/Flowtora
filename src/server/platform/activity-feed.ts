// Activity feed server data layer — Page 2 of the admin spec.
//
// The feed is a unified read-side view over `AuditLog` (the
// append-only event store) decorated with severity, source, and
// human-readable verb summaries. Filters parse from a URL
// querystring so deep links + saved views + subscriptions all
// share one source of truth.
//
// We do NOT mirror events into a second table. AuditLog already has
// the tenantId, userId, action, metadata, and ipAddress/userAgent we
// need; this module just decorates them.

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────────── */
/* Filter shape                                                   */
/* ────────────────────────────────────────────────────────────── */

export type ActivitySeverity = "info" | "notice" | "warning" | "critical";
export type ActivitySource = "web" | "api" | "webhook" | "system" | "background";

export interface ActivityFilters {
  /** Free-text search — matches action prefix, tenant name (decorated
   *  client-side after fetch), or entity id. We keep server-side match
   *  to action + ip for speed; tenant-name matching is filtered after
   *  the join. */
  q?: string;
  /** Action prefixes to include (multi). e.g. ["tenant.", "billing."]. */
  types?: string[];
  /** Severities to include. */
  severities?: ActivitySeverity[];
  /** Sources to include. */
  sources?: ActivitySource[];
  /** Tenant IDs (multi). */
  tenantIds?: string[];
  /** User / actor IDs (multi). */
  userIds?: string[];
  /** Lower bound — events created at or after this time. */
  since?: Date;
  /** Upper bound — events created strictly before this time. */
  until?: Date;
  /** IP or CIDR. CIDR ranges checked client-side post-fetch
   *  (Postgres + Prisma don't have native CIDR helpers in our schema). */
  ip?: string;
  /** ISO2 country code. AuditLog doesn't store country, so the
   *  filter resolves through the tenant's country at fetch time. */
  country?: string;
}

/** Parse the URL search params into a normalized ActivityFilters
 *  shape. Empty/invalid values are dropped silently — we never
 *  reject a URL. */
export function parseActivityFilters(sp: URLSearchParams | Record<string, string | string[] | undefined>): ActivityFilters {
  const get = (key: string): string | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
    const v = sp[key];
    if (Array.isArray(v)) return v[0];
    return v ?? undefined;
  };
  const getAll = (key: string): string[] | undefined => {
    if (sp instanceof URLSearchParams) {
      const all = sp.getAll(key);
      return all.length > 0 ? all : undefined;
    }
    const v = sp[key];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
    return undefined;
  };

  const f: ActivityFilters = {};
  const q = get("q");
  if (q && q.trim()) f.q = q.trim();
  const types = getAll("types");
  if (types?.length) f.types = types;
  const sev = getAll("severities");
  if (sev?.length) f.severities = sev.filter(isSeverity);
  const sources = getAll("sources");
  if (sources?.length) f.sources = sources.filter(isSource);
  const tenantIds = getAll("tenantIds");
  if (tenantIds?.length) f.tenantIds = tenantIds;
  const userIds = getAll("userIds");
  if (userIds?.length) f.userIds = userIds;
  const since = get("since");
  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) f.since = d;
  }
  const until = get("until");
  if (until) {
    const d = new Date(until);
    if (!Number.isNaN(d.getTime())) f.until = d;
  }
  const ip = get("ip");
  if (ip && ip.trim()) f.ip = ip.trim();
  const country = get("country");
  if (country && country.trim()) f.country = country.trim().toUpperCase();
  return f;
}

/** Serialize ActivityFilters back to a querystring (the same form
 *  the saved-view + subscription rows persist). */
export function serializeActivityFilters(f: ActivityFilters): string {
  const u = new URLSearchParams();
  if (f.q) u.set("q", f.q);
  if (f.types?.length) for (const t of f.types) u.append("types", t);
  if (f.severities?.length) for (const s of f.severities) u.append("severities", s);
  if (f.sources?.length) for (const s of f.sources) u.append("sources", s);
  if (f.tenantIds?.length) for (const id of f.tenantIds) u.append("tenantIds", id);
  if (f.userIds?.length) for (const id of f.userIds) u.append("userIds", id);
  if (f.since) u.set("since", f.since.toISOString());
  if (f.until) u.set("until", f.until.toISOString());
  if (f.ip) u.set("ip", f.ip);
  if (f.country) u.set("country", f.country);
  return u.toString();
}

function isSeverity(s: string): s is ActivitySeverity {
  return s === "info" || s === "notice" || s === "warning" || s === "critical";
}
function isSource(s: string): s is ActivitySource {
  return s === "web" || s === "api" || s === "webhook" || s === "system" || s === "background";
}

/* ────────────────────────────────────────────────────────────── */
/* Severity + source classifiers                                  */
/* ────────────────────────────────────────────────────────────── */

/** Map an AuditLog action string to a severity bucket. Heuristic —
 *  we don't store severity on AuditLog, so this is the canonical
 *  classifier reused by the feed UI, the cron digest, and any
 *  notification routing that needs to escalate criticals. */
export function classifySeverity(action: string): ActivitySeverity {
  if (/(deleted|hard_delete|breach|incident|fraud|chargeback|webhook_failed|payment.*failed)/i.test(action)) {
    return "critical";
  }
  if (/(suspended|archive|password|2fa|mfa|impersonat|feature_flag|role|sso|api_key|export|cancel|refund|coupon)/i.test(action)) {
    return "warning";
  }
  if (/(login|logout|verified|invite|note)/i.test(action)) {
    return "notice";
  }
  return "info";
}

/** Source classification — heuristic from the action namespace.
 *  Roughly "where did this event originate". */
export function classifySource(action: string, hasUser: boolean): ActivitySource {
  if (action.startsWith("stripe.") || action.startsWith("webhook.")) return "webhook";
  if (action.startsWith("system.") || action.startsWith("cron.")) return "system";
  if (action.startsWith("api.")) return "api";
  if (action.startsWith("background.") || action.startsWith("job.")) return "background";
  return hasUser ? "web" : "system";
}

/** Verb-led human summary. Keeps things skimmable in the feed
 *  ("Tenant suspended" beats "platform.tenant_suspended"). */
export function formatActionLabel(action: string): string {
  const parts = action.split(".");
  const subject = parts[0] ?? action;
  const verb = parts.slice(1).join(" ").replace(/_/g, " ");
  const s = subject.charAt(0).toUpperCase() + subject.slice(1);
  return verb ? `${s} ${verb}` : s;
}

/* ────────────────────────────────────────────────────────────── */
/* Query                                                          */
/* ────────────────────────────────────────────────────────────── */

export type ActivityRow = {
  id: string;
  action: string;
  actionLabel: string;
  severity: ActivitySeverity;
  source: ActivitySource;
  createdAt: Date;
  /** Stringified ISO so client polling can compare without timezone
   *  rounding. */
  createdAtIso: string;
  tenantId: string | null;
  tenant: { id: string; name: string; slug: string; country: string | null } | null;
  userId: string | null;
  actor: { id: string; name: string | null; email: string; platformRole: string | null } | null;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
};

export interface LoadActivityPageArgs {
  filters: ActivityFilters;
  /** Page size — caller-controlled so infinite scroll can ask for
   *  fewer rows than export. */
  take?: number;
  /** Cursor — last seen createdAt. Strict-less-than so we never
   *  duplicate the boundary row. */
  before?: Date;
  /** Cursor — first seen createdAt. Strict-greater-than for the
   *  "show new events since X" live-poll case. */
  after?: Date;
}

/** Fetch a page of activity rows matching the given filters. */
export async function loadActivityPage(args: LoadActivityPageArgs): Promise<ActivityRow[]> {
  const take = Math.min(500, Math.max(1, args.take ?? 50));
  const where = buildPrismaWhere(args.filters);
  if (args.before) {
    where.createdAt = where.createdAt
      ? { ...(where.createdAt as Prisma.DateTimeFilter), lt: args.before }
      : { lt: args.before };
  }
  if (args.after) {
    where.createdAt = where.createdAt
      ? { ...(where.createdAt as Prisma.DateTimeFilter), gt: args.after }
      : { gt: args.after };
  }

  const rows = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });

  return decorate(rows, args.filters);
}

/** Count rows for a filter set — used by the "X new events" live pill. */
export async function countActivity(filters: ActivityFilters, since: Date): Promise<number> {
  const where = buildPrismaWhere(filters);
  where.createdAt = where.createdAt
    ? { ...(where.createdAt as Prisma.DateTimeFilter), gt: since }
    : { gt: since };
  return db.auditLog.count({ where });
}

/* ── Helpers ───────────────────────────────────────────────── */

function buildPrismaWhere(f: ActivityFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  const ANDs: Prisma.AuditLogWhereInput[] = [];

  if (f.q) {
    ANDs.push({
      OR: [
        { action: { contains: f.q, mode: "insensitive" } },
        { entityType: { contains: f.q, mode: "insensitive" } },
        { entityId: { contains: f.q, mode: "insensitive" } },
        { ipAddress: { contains: f.q, mode: "insensitive" } },
      ],
    });
  }

  if (f.types?.length) {
    // Type filter is a list of action prefixes — match any.
    ANDs.push({
      OR: f.types.map((prefix) => ({ action: { startsWith: prefix } })),
    });
  }

  if (f.tenantIds?.length) where.tenantId = { in: f.tenantIds };
  if (f.userIds?.length)   where.userId   = { in: f.userIds };

  const createdAt: Prisma.DateTimeFilter = {};
  if (f.since) createdAt.gte = f.since;
  if (f.until) createdAt.lt  = f.until;
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;

  if (f.ip) {
    // Plain CIDR matching needs the inet datatype which we don't
    // use; for `/24` style CIDRs we substring-match the network
    // prefix. Exact IPs match exact.
    if (f.ip.includes("/")) {
      const [base] = f.ip.split("/");
      const trunk = base?.split(".").slice(0, 3).join(".") + ".";
      ANDs.push({ ipAddress: { startsWith: trunk } });
    } else {
      ANDs.push({ ipAddress: f.ip });
    }
  }

  if (f.country) {
    where.tenant = { country: { equals: f.country, mode: "insensitive" } };
  }

  if (ANDs.length) where.AND = ANDs;
  return where;
}

async function decorate(
  rows: { id: string; action: string; createdAt: Date; tenantId: string | null; userId: string | null; entityType: string | null; entityId: string | null; ipAddress: string | null; userAgent: string | null; metadata: unknown }[],
  filters: ActivityFilters,
): Promise<ActivityRow[]> {
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => Boolean(x))));
  const userIds   = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x))));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true, country: true } })
      : Promise.resolve([] as { id: string; name: string; slug: string; country: string | null }[]),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, platformRole: true } })
      : Promise.resolve([] as { id: string; name: string | null; email: string; platformRole: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  let decorated: ActivityRow[] = rows.map((r) => {
    const severity = classifySeverity(r.action);
    const source   = classifySource(r.action, !!r.userId);
    return {
      id: r.id,
      action: r.action,
      actionLabel: formatActionLabel(r.action),
      severity,
      source,
      createdAt: r.createdAt,
      createdAtIso: r.createdAt.toISOString(),
      tenantId: r.tenantId,
      tenant: r.tenantId ? tenantById.get(r.tenantId) ?? null : null,
      userId: r.userId,
      actor: r.userId ? userById.get(r.userId) ?? null : null,
      entityType: r.entityType,
      entityId: r.entityId,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      metadata: r.metadata ?? null,
    };
  });

  // Post-filter on dimensions that don't live in AuditLog directly:
  // severity (derived) + source (derived).
  if (filters.severities?.length) {
    const set = new Set(filters.severities);
    decorated = decorated.filter((d) => set.has(d.severity));
  }
  if (filters.sources?.length) {
    const set = new Set(filters.sources);
    decorated = decorated.filter((d) => set.has(d.source));
  }

  return decorated;
}

/* ────────────────────────────────────────────────────────────── */
/* Quick presets — used by the right-rail and the saved-view defaults */
/* ────────────────────────────────────────────────────────────── */

export const QUICK_PRESETS: { id: string; label: string; filters: ActivityFilters }[] = [
  {
    id: "big-payments-today",
    label: "Big payments today",
    filters: {
      types: ["billing.payment", "stripe.invoice", "stripe.charge"],
      severities: ["notice", "info"],
      since: undefined, // server fills in start-of-day at query time
    },
  },
  {
    id: "failed-payments",
    label: "Failed payments (7d)",
    filters: {
      types: ["billing.payment_failed", "stripe.invoice.payment_failed", "stripe.charge.failed"],
      severities: ["critical", "warning"],
    },
  },
  {
    id: "cancellations-this-week",
    label: "Cancellations (7d)",
    filters: {
      types: ["platform.tenant_archived", "stripe.subscription.canceled", "tenant.canceled"],
      severities: ["warning", "critical"],
    },
  },
  {
    id: "suspicious-logins",
    label: "Suspicious logins",
    filters: {
      types: ["auth.login", "auth.failed", "auth.locked", "platform.impersonation_started"],
      severities: ["critical", "warning"],
    },
  },
];

/** Resolve any "today" dynamic windows on a preset filter. */
export function resolvePresetFilters(f: ActivityFilters, presetId: string): ActivityFilters {
  const out = { ...f };
  const now = new Date();
  if (presetId === "big-payments-today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    out.since = start;
  }
  if (presetId === "failed-payments" || presetId === "cancellations-this-week") {
    out.since = new Date(now.getTime() - 7 * DAY);
  }
  return out;
}

/* ────────────────────────────────────────────────────────────── */
/* Events-per-minute sparkline (right rail)                       */
/* ────────────────────────────────────────────────────────────── */

/** Returns a 60-bucket array of event counts for the last 60
 *  minutes. Last entry is the current minute. */
export async function loadEventsPerMinute(filters: ActivityFilters = {}): Promise<number[]> {
  const now = Date.now();
  const sixtyAgo = new Date(now - 60 * 60_000);
  const where = buildPrismaWhere(filters);
  where.createdAt = where.createdAt
    ? { ...(where.createdAt as Prisma.DateTimeFilter), gte: sixtyAgo }
    : { gte: sixtyAgo };

  const rows = await db.auditLog.findMany({
    where,
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 5_000, // hard cap — anything beyond this for 60min is a fire-hose; the sparkline still draws the shape.
  });

  const buckets = Array.from({ length: 60 }, () => 0);
  for (const r of rows) {
    const minutesAgo = Math.floor((now - r.createdAt.getTime()) / 60_000);
    if (minutesAgo < 0 || minutesAgo >= 60) continue;
    const bucketIndex = 59 - minutesAgo; // 0 = oldest, 59 = current
    buckets[bucketIndex]! += 1;
  }
  return buckets;
}

/* ────────────────────────────────────────────────────────────── */
/* Distinct event types — used by the filter chip multi-select   */
/* ────────────────────────────────────────────────────────────── */

/** All known event-type prefixes the user can filter by, grouped
 *  for display in the multi-select. The `prefix` is what we
 *  startsWith-match in the filter; the `match` shows what concrete
 *  actions roll up under each. */
export const EVENT_TYPE_OPTIONS = [
  // Tenants
  { id: "tenant.created",    label: "Tenant created",        prefix: "tenant.created", group: "Tenants" },
  { id: "tenant.suspended",  label: "Tenant suspended",      prefix: "platform.tenant_suspended", group: "Tenants" },
  { id: "tenant.archived",   label: "Tenant archived",       prefix: "platform.tenant_archived", group: "Tenants" },
  { id: "tenant.plan",       label: "Plan changed",          prefix: "platform.tenant_plan_changed", group: "Tenants" },
  // Subscriptions / billing
  { id: "billing.payment",         label: "Payment succeeded",  prefix: "billing.payment_succeeded", group: "Billing" },
  { id: "billing.payment_failed",  label: "Payment failed",     prefix: "billing.payment_failed",    group: "Billing" },
  { id: "billing.refund",          label: "Refund issued",      prefix: "billing.refund",            group: "Billing" },
  { id: "billing.coupon",          label: "Coupon applied",     prefix: "billing.coupon",            group: "Billing" },
  { id: "stripe.subscription",     label: "Stripe subscription",prefix: "stripe.subscription",       group: "Billing" },
  { id: "stripe.invoice",          label: "Stripe invoice",     prefix: "stripe.invoice",            group: "Billing" },
  // Auth + security
  { id: "auth.login",            label: "User login",          prefix: "auth.login",            group: "Security" },
  { id: "auth.logout",           label: "User logout",         prefix: "auth.logout",           group: "Security" },
  { id: "auth.failed",           label: "Failed login",        prefix: "auth.failed",           group: "Security" },
  { id: "auth.mfa",              label: "MFA toggled",         prefix: "auth.mfa",              group: "Security" },
  { id: "auth.password_changed", label: "Password changed",    prefix: "auth.password_changed", group: "Security" },
  { id: "platform.impersonation",label: "Impersonation",       prefix: "platform.impersonation",group: "Security" },
  { id: "platform.api_key",      label: "API key rotated",     prefix: "platform.api_key",      group: "Security" },
  // Operations
  { id: "platform.feature_flag", label: "Feature flag toggled",prefix: "platform.feature_flag", group: "Operations" },
  { id: "platform.export",       label: "Data export",         prefix: "platform.export",       group: "Operations" },
  { id: "platform.backup",       label: "Backup",              prefix: "platform.backup",       group: "Operations" },
  { id: "platform.incident",     label: "Incident",            prefix: "platform.incident",     group: "Operations" },
  { id: "platform.webhook",      label: "Webhook delivery",    prefix: "platform.webhook",      group: "Operations" },
  { id: "platform.support",      label: "Support ticket",      prefix: "support.",              group: "Operations" },
] as const;
