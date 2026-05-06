// Page 46 — API Keys & Webhooks data layer.

import { db } from "@/lib/db";
import type {
  ApiKeyEnvironment,
  ApiKeyStatus,
  WebhookEndpointStatus,
  WebhookEventCategory,
  WebhookEventStability,
  WebhookDeliveryStatus,
  WebhookRetryPolicy,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPI strip across the top ─────────────────────────── */

export interface ApiKpis {
  activeKeys: number;
  expiringSoon: number; // < 14d
  endpointsActive: number;
  endpointsFailing: number;
  deliveriesLast24h: number;
  successRate24h: number | null;
  deadLetterCount: number;
  rateLimitedRequests24h: number;
}

export async function loadApiKpis(): Promise<ApiKpis> {
  const since24 = new Date(Date.now() - DAY);
  const soon = new Date(Date.now() + 14 * DAY);

  const [
    activeKeys, expiringSoon,
    endpointsActive, endpointsFailing,
    deliveriesLast24h, successLast24h,
    deadLetterCount,
    rateLimited,
  ] = await Promise.all([
    db.platformApiKey.count({ where: { status: "ACTIVE" } }),
    db.platformApiKey.count({
      where: { status: "ACTIVE", expiresAt: { not: null, lte: soon, gte: new Date() } },
    }),
    db.webhookEndpoint.count({ where: { status: "ACTIVE" } }),
    db.webhookEndpoint.count({ where: { status: "FAILING" } }),
    db.webhookDelivery.count({ where: { attemptedAt: { gte: since24 } } }),
    db.webhookDelivery.count({ where: { attemptedAt: { gte: since24 }, status: "SUCCEEDED" } }),
    db.webhookDelivery.count({ where: { status: "DEAD_LETTER" } }),
    db.platformApiKeyUsage.count({
      where: { occurredAt: { gte: since24 }, statusCode: 429 },
    }),
  ]);

  return {
    activeKeys,
    expiringSoon,
    endpointsActive,
    endpointsFailing,
    deliveriesLast24h,
    successRate24h: deliveriesLast24h === 0 ? null : successLast24h / deliveriesLast24h,
    deadLetterCount,
    rateLimitedRequests24h: rateLimited,
  };
}

/* ── Settings ──────────────────────────────────────────── */

export interface WebhookSettingsView {
  id: string;
  defaultRetryPolicy: WebhookRetryPolicy;
  defaultMaxAttempts: number;
  defaultTimeoutSec: number;
  deadLetterRetentionDays: number;
  defaultAutoDisableThreshold: number | null;
  egressIps: string[];
  encryptionVerifiedAt: Date | null;
  encryptionAlgorithm: string | null;
  updatedAt: Date;
}

export async function loadWebhookSettings(): Promise<WebhookSettingsView> {
  const existing = await db.webhookSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const created = await db.webhookSettings.create({
    data: {
      id: "default",
      egressIps: ["52.0.10.10/29", "54.0.10.10/29", "13.0.10.10/29"],
      encryptionAlgorithm: "AES-256-GCM",
      encryptionVerifiedAt: new Date(),
    },
  });
  return created;
}

/* ── API keys ──────────────────────────────────────────── */

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  description: string | null;
  ownerTeam: string | null;
  scopes: string[];
  environment: ApiKeyEnvironment;
  status: ApiKeyStatus;
  ipAllowlist: string[];
  rateLimitPerMin: number | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
  /** 7-day usage count for the row sparkline. */
  usage7d: number;
}

export interface ApiKeyFilters {
  q?: string;
  status?: ApiKeyStatus | "ALL";
  environment?: ApiKeyEnvironment | "ALL";
  team?: string;
  scope?: string;
}

export async function loadApiKeys(filters: ApiKeyFilters): Promise<ApiKeyRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
        { keyPrefix: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.environment && filters.environment !== "ALL") conditions.push({ environment: filters.environment });
  if (filters.team)  conditions.push({ ownerTeam: filters.team });
  if (filters.scope) conditions.push({ scopes: { has: filters.scope } });

  const where = conditions.length === 0 ? {} : { AND: conditions };
  const since7 = new Date(Date.now() - 7 * DAY);

  const keys = await db.platformApiKey.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  if (keys.length === 0) return [];

  const usage = await db.platformApiKeyUsage.groupBy({
    by: ["apiKeyId"],
    where: { apiKeyId: { in: keys.map((k) => k.id) }, occurredAt: { gte: since7 } },
    _count: { _all: true },
  });
  const usageMap = new Map(usage.map((u) => [u.apiKeyId, u._count._all]));

  const creatorIds = Array.from(new Set(keys.map((k) => k.createdById).filter((x): x is string => Boolean(x))));
  const creators = creatorIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: creatorIds } }, select: { id: true, name: true, email: true },
  });
  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    description: k.description,
    ownerTeam: k.ownerTeam,
    scopes: k.scopes,
    environment: k.environment,
    status: k.status,
    ipAllowlist: k.ipAllowlist,
    rateLimitPerMin: k.rateLimitPerMin,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
    createdByName: k.createdById
      ? creatorMap.get(k.createdById)?.name ?? creatorMap.get(k.createdById)?.email ?? null
      : null,
    usage7d: usageMap.get(k.id) ?? 0,
  }));
}

export async function loadApiKeyTeams(): Promise<string[]> {
  const rows = await db.platformApiKey.findMany({
    where: { ownerTeam: { not: null } },
    select: { ownerTeam: true },
    distinct: ["ownerTeam"],
  });
  return rows.map((r) => r.ownerTeam!).filter(Boolean).sort();
}

/* ── Webhook endpoints ───────────────────────────────── */

export interface EndpointRow {
  id: string;
  url: string;
  description: string | null;
  status: WebhookEndpointStatus;
  subscribedEvents: string[];
  retryPolicy: WebhookRetryPolicy;
  maxAttempts: number;
  timeoutSec: number;
  filterExpression: string | null;
  customHeaders: Array<{ key: string; value: string }>;
  signingSecret: string;
  signingSecretRotatesAt: Date | null;
  hasPreviousSecret: boolean;
  autoDisableThreshold: number | null;
  consecutiveFailures: number;
  successRate24h: number | null;
  lastDeliveryAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export async function loadWebhookEndpoints(): Promise<EndpointRow[]> {
  const rows = await db.webhookEndpoint.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    description: r.description,
    status: r.status,
    subscribedEvents: r.subscribedEvents,
    retryPolicy: r.retryPolicy,
    maxAttempts: r.maxAttempts,
    timeoutSec: r.timeoutSec,
    filterExpression: r.filterExpression,
    customHeaders: parseCustomHeaders(r.customHeaders),
    signingSecret: r.signingSecret,
    signingSecretRotatesAt: r.signingSecretRotatesAt,
    hasPreviousSecret: !!r.previousSigningSecret,
    autoDisableThreshold: r.autoDisableThreshold,
    consecutiveFailures: r.consecutiveFailures,
    successRate24h: r.successRate24h,
    lastDeliveryAt: r.lastDeliveryAt,
    lastErrorAt: r.lastErrorAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
  }));
}

function parseCustomHeaders(raw: unknown): Array<{ key: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object" && "key" in r && "value" in r)
    .map((r) => {
      const o = r as Record<string, unknown>;
      return { key: String(o.key), value: String(o.value) };
    })
    .filter((h) => h.key);
}

/* ── Event catalog ───────────────────────────────────── */

export interface EventCatalogRow {
  id: string;
  name: string;
  category: WebhookEventCategory;
  description: string;
  schemaUrl: string | null;
  samplePayload: unknown;
  introducedVersion: string;
  stability: WebhookEventStability;
  deprecationNotice: string | null;
  subscriberCount: number;
  versions: Array<{ id: string; version: string; changes: string | null; breaking: boolean; releasedAt: Date }>;
  codeSamples: Record<string, string>;
}

export async function loadEventCatalog(opts: { q?: string; category?: WebhookEventCategory } = {}): Promise<{
  groups: Array<{ category: WebhookEventCategory; rows: EventCatalogRow[] }>;
  total: number;
}> {
  const conditions: Record<string, unknown>[] = [];
  if (opts.q) conditions.push({
    OR: [
      { name: { contains: opts.q, mode: "insensitive" } },
      { description: { contains: opts.q, mode: "insensitive" } },
    ],
  });
  if (opts.category) conditions.push({ category: opts.category });

  const where = conditions.length === 0 ? {} : { AND: conditions };

  const events = await db.webhookEvent.findMany({
    where,
    include: { versions: { orderBy: { releasedAt: "desc" }, take: 10 } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    take: 500,
  });

  // Group by category preserving order.
  const groupMap = new Map<WebhookEventCategory, EventCatalogRow[]>();
  for (const e of events) {
    const row: EventCatalogRow = {
      id: e.id,
      name: e.name,
      category: e.category,
      description: e.description,
      schemaUrl: e.schemaUrl,
      samplePayload: e.samplePayload,
      introducedVersion: e.introducedVersion,
      stability: e.stability,
      deprecationNotice: e.deprecationNotice,
      subscriberCount: e.subscriberCount,
      versions: e.versions.map((v) => ({
        id: v.id, version: v.version, changes: v.changes,
        breaking: v.breaking, releasedAt: v.releasedAt,
      })),
      codeSamples: parseCodeSamples(e.codeSamples),
    };
    const list = groupMap.get(e.category) ?? [];
    list.push(row);
    groupMap.set(e.category, list);
  }
  const groups = Array.from(groupMap.entries()).map(([category, rows]) => ({ category, rows }));
  return { groups, total: events.length };
}

function parseCodeSamples(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

/* ── Deliveries ──────────────────────────────────────── */

export interface DeliveryRow {
  id: string;
  eventName: string;
  endpointId: string;
  endpointUrl: string;
  tenantId: string | null;
  tenantName: string | null;
  status: WebhookDeliveryStatus;
  httpCode: number | null;
  latencyMs: number | null;
  attempts: number;
  nextRetryAt: Date | null;
  attemptedAt: Date;
  errorMessage: string | null;
  hasRetries: boolean;
}

export interface DeliveryFilters {
  endpointId?: string;
  eventName?: string;
  status?: WebhookDeliveryStatus | "ALL";
  httpCode?: number;
  tenantId?: string;
  hasRetries?: boolean;
  from?: Date;
  to?: Date;
}

export async function loadDeliveries(
  filters: DeliveryFilters,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ rows: DeliveryRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = opts.pageSize ?? 100;
  const page = Math.max(1, opts.page ?? 1);

  const conditions: Record<string, unknown>[] = [];
  if (filters.endpointId)             conditions.push({ endpointId: filters.endpointId });
  if (filters.eventName)              conditions.push({ eventName:  filters.eventName });
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.httpCode)               conditions.push({ httpCode: filters.httpCode });
  if (filters.tenantId)               conditions.push({ tenantId: filters.tenantId });
  if (filters.hasRetries)             conditions.push({ attempts: { gt: 1 } });
  if (filters.from)                   conditions.push({ attemptedAt: { gte: filters.from } });
  if (filters.to)                     conditions.push({ attemptedAt: { lte: filters.to } });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const [total, rows] = await Promise.all([
    db.webhookDelivery.count({ where }),
    db.webhookDelivery.findMany({
      where,
      orderBy: { attemptedAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: { endpoint: { select: { url: true } } },
    }),
  ]);

  // Resolve tenants in one batch (when present).
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => Boolean(x))));
  const tenants = tenantIds.length === 0 ? [] : await db.tenant.findMany({
    where: { id: { in: tenantIds } }, select: { id: true, name: true },
  });
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  return {
    rows: rows.map((d) => ({
      id: d.id,
      eventName: d.eventName,
      endpointId: d.endpointId,
      endpointUrl: d.endpoint.url,
      tenantId: d.tenantId,
      tenantName: d.tenantId ? tenantMap.get(d.tenantId) ?? null : null,
      status: d.status,
      httpCode: d.httpCode,
      latencyMs: d.latencyMs,
      attempts: d.attempts,
      nextRetryAt: d.nextRetryAt,
      attemptedAt: d.attemptedAt,
      errorMessage: d.errorMessage,
      hasRetries: d.attempts > 1,
    })),
    total,
    page,
    pageSize,
  };
}

export async function loadDeliveryDetail(id: string): Promise<{
  row: DeliveryRow;
  payload: unknown;
  responseBody: string | null;
  requestHeaders: unknown;
  responseHeaders: unknown;
} | null> {
  const d = await db.webhookDelivery.findUnique({
    where: { id },
    include: { endpoint: { select: { url: true } } },
  });
  if (!d) return null;

  const tenantName = d.tenantId
    ? (await db.tenant.findUnique({ where: { id: d.tenantId }, select: { name: true } }))?.name ?? null
    : null;
  return {
    row: {
      id: d.id,
      eventName: d.eventName,
      endpointId: d.endpointId,
      endpointUrl: d.endpoint.url,
      tenantId: d.tenantId,
      tenantName,
      status: d.status,
      httpCode: d.httpCode,
      latencyMs: d.latencyMs,
      attempts: d.attempts,
      nextRetryAt: d.nextRetryAt,
      attemptedAt: d.attemptedAt,
      errorMessage: d.errorMessage,
      hasRetries: d.attempts > 1,
    },
    payload: d.payload,
    responseBody: d.responseBody,
    requestHeaders: d.requestHeaders,
    responseHeaders: d.responseHeaders,
  };
}

/* ── Rate limits tab data ─────────────────────────────── */

export interface RateLimitRow {
  id: string;
  name: string;
  ownerTeam: string | null;
  rateLimitPerMin: number | null;
  /** Calls in the most recent minute. */
  callsLastMin: number;
  /** Calls in the last hour. */
  callsLastHour: number;
  /** 429 count last 24h. */
  throttled24h: number;
  /** Consumption % vs rateLimitPerMin (for the gauge). */
  consumptionPct: number;
}

export async function loadRateLimitData(): Promise<{ rows: RateLimitRow[]; throttled24hTotal: number }> {
  const sinceMin = new Date(Date.now() - 60 * 1000);
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000);
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const keys = await db.platformApiKey.findMany({
    where: { status: "ACTIVE" },
    take: 100,
  });
  if (keys.length === 0) return { rows: [], throttled24hTotal: 0 };

  const [minAgg, hourAgg, throttledAgg] = await Promise.all([
    db.platformApiKeyUsage.groupBy({
      by: ["apiKeyId"],
      where: { apiKeyId: { in: keys.map((k) => k.id) }, occurredAt: { gte: sinceMin } },
      _count: { _all: true },
    }),
    db.platformApiKeyUsage.groupBy({
      by: ["apiKeyId"],
      where: { apiKeyId: { in: keys.map((k) => k.id) }, occurredAt: { gte: sinceHour } },
      _count: { _all: true },
    }),
    db.platformApiKeyUsage.groupBy({
      by: ["apiKeyId"],
      where: { apiKeyId: { in: keys.map((k) => k.id) }, occurredAt: { gte: since24 }, statusCode: 429 },
      _count: { _all: true },
    }),
  ]);
  const minMap = new Map(minAgg.map((u) => [u.apiKeyId, u._count._all]));
  const hourMap = new Map(hourAgg.map((u) => [u.apiKeyId, u._count._all]));
  const throttleMap = new Map(throttledAgg.map((u) => [u.apiKeyId, u._count._all]));

  let throttled24hTotal = 0;
  const rows: RateLimitRow[] = keys.map((k) => {
    const callsLastMin = minMap.get(k.id) ?? 0;
    const callsLastHour = hourMap.get(k.id) ?? 0;
    const throttled = throttleMap.get(k.id) ?? 0;
    throttled24hTotal += throttled;
    const consumptionPct = k.rateLimitPerMin && k.rateLimitPerMin > 0
      ? Math.min(100, (callsLastMin / k.rateLimitPerMin) * 100)
      : 0;
    return {
      id: k.id,
      name: k.name,
      ownerTeam: k.ownerTeam,
      rateLimitPerMin: k.rateLimitPerMin,
      callsLastMin,
      callsLastHour,
      throttled24h: throttled,
      consumptionPct,
    };
  })
  .sort((a, b) => b.callsLastHour - a.callsLastHour);

  return { rows, throttled24hTotal };
}

/* ── Helpers ────────────────────────────────────── */

export const KEY_STATUS_TONE: Record<ApiKeyStatus, { bg: string; fg: string }> = {
  ACTIVE:  { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  REVOKED: { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  EXPIRED: { bg: "var(--surface-2)", fg: "var(--text-muted)" },
};

export const ENDPOINT_STATUS_TONE: Record<WebhookEndpointStatus, { bg: string; fg: string }> = {
  ACTIVE:   { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  PAUSED:   { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  FAILING:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  DISABLED: { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const DELIVERY_STATUS_TONE: Record<WebhookDeliveryStatus, { bg: string; fg: string }> = {
  PENDING:     { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  SUCCEEDED:   { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  FAILED:      { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  DEAD_LETTER: { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  RESOLVED:    { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
};

export const STABILITY_TONE: Record<WebhookEventStability, { bg: string; fg: string }> = {
  STABLE:     { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  BETA:       { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  DEPRECATED: { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const CATEGORY_LABELS: Record<WebhookEventCategory, string> = {
  TENANT_LIFECYCLE: "Tenant Lifecycle",
  SUBSCRIPTION:     "Subscription",
  INVOICE:          "Invoice",
  PAYMENT:          "Payment",
  USER:             "User",
  JOB:              "Job",
  INTEGRATION:      "Integration",
  SYSTEM:           "System",
  SECURITY:         "Security",
  MARKETING:        "Marketing",
};
