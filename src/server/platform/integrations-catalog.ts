// Page 45 — Integrations Catalog data layer.
//
// Surfaces:
//   - loadCatalogKpis()        — strip across the top
//   - loadCatalogList()        — grid w/ category + status + region + plan + adoption filter
//   - loadCatalogDetail()      — full detail page (with all tabs)
//   - loadCatalogAdoption()    — adoption tab data
//   - loadCatalogHealth()      — health tab metrics + recent incidents

import { db } from "@/lib/db";
import type {
  IntegrationCatalogStatus,
  IntegrationCategory,
  IntegrationAuthType,
  IntegrationRegion,
  IntegrationIncidentSeverity,
  IntegrationIncidentStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPI strip ───────────────────────────────────────── */

export interface CatalogKpis {
  total: number;
  active: number;
  /** Integration names sorted by connectedTenantCount, top 1 used as "Most adopted". */
  mostAdoptedName: string | null;
  mostAdoptedPct: number | null;
  /** Average uptimePct90d across non-deprecated integrations. */
  avgUptimePct: number | null;
  /** Counter delta vs 90 days ago — total catalog entries created in last 90d. */
  newSinceQuarter: number;
  /** 7-day sync counts across all integrations, point per day. */
  syncSparkline: number[];
}

export async function loadCatalogKpis(): Promise<CatalogKpis> {
  const since90 = new Date(Date.now() - 90 * DAY);
  const since7 = new Date(Date.now() - 7 * DAY);

  const [total, active, leader, uptimeAgg, recentlyCreated, totalTenantsAgg] = await Promise.all([
    db.integrationCatalog.count(),
    db.integrationCatalog.count({ where: { status: "ACTIVE" } }),
    db.integrationCatalog.findFirst({
      where: { status: { in: ["ACTIVE", "BETA"] } },
      orderBy: { connectedTenantCount: "desc" },
      select: { name: true, connectedTenantCount: true },
    }),
    db.integrationCatalog.aggregate({
      where: { status: { not: "DEPRECATED" }, uptimePct90d: { not: null } },
      _avg: { uptimePct90d: true },
    }),
    db.integrationCatalog.count({ where: { createdAt: { gte: since90 } } }),
    db.tenant.count({ where: { status: { in: ["ACTIVE", "TRIAL"] } } }),
  ]);

  // Build a 7-day sync sparkline from sync events.
  const syncEvents = await db.integrationSyncEvent.findMany({
    where: { occurredAt: { gte: since7 } },
    select: { occurredAt: true },
  });
  const buckets = new Array<number>(7).fill(0);
  for (const e of syncEvents) {
    const idx = Math.min(6, Math.floor((e.occurredAt.getTime() - since7.getTime()) / DAY));
    if (idx >= 0 && idx < 7) buckets[idx]!++;
  }

  const totalTenants = totalTenantsAgg || 1;
  return {
    total,
    active,
    mostAdoptedName: leader?.name ?? null,
    mostAdoptedPct: leader == null ? null : leader.connectedTenantCount / totalTenants,
    avgUptimePct: uptimeAgg._avg.uptimePct90d ?? null,
    newSinceQuarter: recentlyCreated,
    syncSparkline: buckets,
  };
}

/* ── List ────────────────────────────────────────────── */

export interface CatalogListRow {
  id: string;
  slug: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationCatalogStatus;
  authType: IntegrationAuthType;
  shortDescription: string;
  logoUrl: string | null;
  regions: IntegrationRegion[];
  availablePlans: string[];
  connectedTenantCount: number;
  uptimePct90d: number | null;
  syncCount7d: number;
  errorCount30d: number;
  /** Adoption bucket — "high" >50%, "medium" 10-50%, "low" <10%. */
  adoptionTier: "high" | "medium" | "low";
}

export interface CatalogListFilters {
  q?: string;
  status?: IntegrationCatalogStatus | "ALL";
  categories?: IntegrationCategory[];
  authType?: IntegrationAuthType;
  region?: IntegrationRegion;
  plan?: string;
  adoption?: "high" | "medium" | "low";
}

export async function loadCatalogList(
  filters: CatalogListFilters,
  totalTenants: number,
): Promise<CatalogListRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { name:             { contains: filters.q, mode: "insensitive" } },
        { slug:             { contains: filters.q, mode: "insensitive" } },
        { shortDescription: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status && filters.status !== "ALL") {
    conditions.push({ status: filters.status });
  }
  if (filters.categories && filters.categories.length > 0) {
    conditions.push({ category: { in: filters.categories } });
  }
  if (filters.authType) conditions.push({ authType: filters.authType });
  if (filters.region)   conditions.push({ regions: { has: filters.region } });
  if (filters.plan)     conditions.push({ availablePlans: { has: filters.plan } });

  const where = conditions.length === 0 ? {} : { AND: conditions };

  const rows = await db.integrationCatalog.findMany({
    where,
    orderBy: [{ connectedTenantCount: "desc" }, { name: "asc" }],
    take: 500,
  });

  const tier = (count: number): "high" | "medium" | "low" => {
    const pct = count / Math.max(totalTenants, 1);
    if (pct > 0.5) return "high";
    if (pct >= 0.1) return "medium";
    return "low";
  };

  let mapped = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    status: r.status,
    authType: r.authType,
    shortDescription: r.shortDescription,
    logoUrl: r.logoUrl,
    regions: r.regions,
    availablePlans: r.availablePlans,
    connectedTenantCount: r.connectedTenantCount,
    uptimePct90d: r.uptimePct90d,
    syncCount7d: r.syncCount7d,
    errorCount30d: r.errorCount30d,
    adoptionTier: tier(r.connectedTenantCount),
  }));

  if (filters.adoption) {
    mapped = mapped.filter((r) => r.adoptionTier === filters.adoption);
  }
  return mapped;
}

/* ── Detail ──────────────────────────────────────────── */

export interface CatalogDetailView {
  id: string;
  slug: string;
  name: string;
  category: IntegrationCategory;
  status: IntegrationCatalogStatus;
  authType: IntegrationAuthType;
  logoUrl: string | null;
  vendorUrl: string | null;
  supportEmail: string | null;
  description: string;
  shortDescription: string;
  screenshots: string[];

  oauthScopes: Array<{ scope: string; justification?: string; capability?: string }>;
  redirectUri: string | null;
  webhookEndpoint: string | null;
  envVarsRequired: string[];
  configSchema: unknown;

  capabilities: Array<{ entity: string; read: boolean; write: boolean; sync: boolean; webhook: boolean }>;

  availablePlans: string[];
  regions: IntegrationRegion[];

  requiresUpgrade: boolean;
  perCallCents: number | null;
  passThroughFees: string | null;

  documentation: string | null;
  faq: string | null;
  codeSamples: Record<string, string>;

  outboundWebhooks: Array<{ event: string; url?: string; description?: string }>;
  inboundWebhooks:  Array<{ event: string; description?: string }>;
  defaultFieldMappings: Array<{ flowtoraField: string; partnerField: string; direction: "IN" | "OUT" | "BOTH" }>;

  defaultVersion: string;
  deprecatedAt: Date | null;
  sunsetAt: Date | null;
  internalOnly: boolean;

  connectedTenantCount: number;
  uptimePct90d: number | null;
  syncCount7d: number;
  errorCount30d: number;
  createdAt: Date;
  updatedAt: Date;

  versions: Array<{
    id: string;
    version: string;
    changes: string | null;
    isDefault: boolean;
    deprecatedAt: Date | null;
    releasedAt: Date;
    tenantCount: number;
  }>;

  recentIncidents: Array<{
    id: string;
    title: string;
    description: string | null;
    severity: IntegrationIncidentSeverity;
    status: IntegrationIncidentStatus;
    startedAt: Date;
    resolvedAt: Date | null;
  }>;

  auditLog: Array<{ id: string; action: string; detail: string | null; authorName: string | null; occurredAt: Date }>;
}

export async function loadCatalogDetail(slug: string): Promise<CatalogDetailView | null> {
  const row = await db.integrationCatalog.findUnique({
    where: { slug },
    include: {
      versions: { orderBy: { releasedAt: "desc" }, take: 50 },
      incidents: { orderBy: { startedAt: "desc" }, take: 25 },
      auditLog: { orderBy: { occurredAt: "desc" }, take: 50 },
    },
  });
  if (!row) return null;

  const authorIds = Array.from(new Set(row.auditLog.map((a) => a.authorId).filter((x): x is string => Boolean(x))));
  const authors = authorIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true },
  });
  const authorMap = new Map(authors.map((u) => [u.id, u]));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    status: row.status,
    authType: row.authType,
    logoUrl: row.logoUrl,
    vendorUrl: row.vendorUrl,
    supportEmail: row.supportEmail,
    description: row.description,
    shortDescription: row.shortDescription,
    screenshots: row.screenshots,

    oauthScopes: parseScopes(row.oauthScopes),
    redirectUri: row.redirectUri,
    webhookEndpoint: row.webhookEndpoint,
    envVarsRequired: row.envVarsRequired,
    configSchema: row.configSchema,

    capabilities: parseCapabilities(row.capabilities),

    availablePlans: row.availablePlans,
    regions: row.regions,

    requiresUpgrade: row.requiresUpgrade,
    perCallCents: row.perCallCents,
    passThroughFees: row.passThroughFees,

    documentation: row.documentation,
    faq: row.faq,
    codeSamples: parseCodeSamples(row.codeSamples),

    outboundWebhooks: parseOutboundWebhooks(row.outboundWebhooks),
    inboundWebhooks:  parseInboundWebhooks(row.inboundWebhooks),
    defaultFieldMappings: parseFieldMappings(row.defaultFieldMappings),

    defaultVersion: row.defaultVersion,
    deprecatedAt: row.deprecatedAt,
    sunsetAt: row.sunsetAt,
    internalOnly: row.internalOnly,

    connectedTenantCount: row.connectedTenantCount,
    uptimePct90d: row.uptimePct90d,
    syncCount7d: row.syncCount7d,
    errorCount30d: row.errorCount30d,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,

    versions: row.versions.map((v) => ({
      id: v.id,
      version: v.version,
      changes: v.changes,
      isDefault: v.isDefault,
      deprecatedAt: v.deprecatedAt,
      releasedAt: v.releasedAt,
      tenantCount: v.tenantCount,
    })),
    recentIncidents: row.incidents.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      severity: i.severity,
      status: i.status,
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt,
    })),
    auditLog: row.auditLog.map((a) => {
      const author = a.authorId ? authorMap.get(a.authorId) : undefined;
      return {
        id: a.id,
        action: a.action,
        detail: a.detail,
        authorName: author?.name ?? author?.email ?? null,
        occurredAt: a.occurredAt,
      };
    }),
  };
}

/* ── Adoption tab ────────────────────────────────────── */

export interface AdoptionTenantRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  plan: string;
  status: string;
  connectedAt: Date;
  lastSyncAt: Date | null;
  errors30d: number;
}

export interface AdoptionView {
  /** Daily connections over last 90 days. */
  trend: Array<{ date: string; connections: number }>;
  /** Top 100 tenants connected. */
  tenants: AdoptionTenantRow[];
  totalConnected: number;
}

export async function loadCatalogAdoption(slug: string): Promise<AdoptionView | null> {
  const integration = await db.integrationCatalog.findUnique({ where: { slug }, select: { slug: true } });
  if (!integration) return null;

  const since90 = new Date(Date.now() - 90 * DAY);

  const [tenantConnections, syncErrors] = await Promise.all([
    db.tenantIntegration.findMany({
      where: { provider: integration.slug },
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true, status: true } } },
      orderBy: { connectedAt: "desc" },
      take: 100,
    }),
    db.integrationSyncEvent.groupBy({
      by: ["tenantId"],
      where: {
        success: false,
        occurredAt: { gte: new Date(Date.now() - 30 * DAY) },
        integration: { slug: integration.slug },
      },
      _count: { _all: true },
    }),
  ]);
  const errCountMap = new Map(syncErrors.filter((s) => s.tenantId).map((s) => [s.tenantId!, s._count._all]));

  // Build daily-connections trend.
  const day = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const buckets = new Map<string, number>();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    buckets.set(day(d), 0);
  }
  for (const t of tenantConnections) {
    if (t.connectedAt < since90) continue;
    const k = day(t.connectedAt);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const trend = Array.from(buckets.entries()).map(([date, connections]) => ({ date, connections }));

  return {
    trend,
    tenants: tenantConnections.map((t) => ({
      tenantId: t.tenant.id,
      tenantName: t.tenant.name,
      tenantSlug: t.tenant.slug,
      plan: t.tenant.plan,
      status: t.status,
      connectedAt: t.connectedAt,
      lastSyncAt: t.lastSyncAt,
      errors30d: errCountMap.get(t.tenant.id) ?? t.errorCount,
    })),
    totalConnected: tenantConnections.length,
  };
}

/* ── Health tab ──────────────────────────────────────── */

export interface HealthView {
  uptimePct30d: number | null;
  uptimePct90d: number | null;
  avgSyncDurationMs: number | null;
  errorRate30d: number | null;
  deadLetterCount: number;
  /** Daily success/error counts for the last 30 days. */
  daily: Array<{ date: string; success: number; error: number; durationP50: number; durationP95: number; durationP99: number }>;
  /** Rate-limit consumption % (mock). */
  rateLimitPct: number;
}

export async function loadCatalogHealth(slug: string): Promise<HealthView | null> {
  const integration = await db.integrationCatalog.findUnique({
    where: { slug },
    select: { id: true, uptimePct90d: true },
  });
  if (!integration) return null;

  const since30 = new Date(Date.now() - 30 * DAY);
  const events = await db.integrationSyncEvent.findMany({
    where: { integrationId: integration.id, occurredAt: { gte: since30 } },
    select: { success: true, durationMs: true, occurredAt: true },
  });

  const day = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  type Bucket = { date: string; success: number; error: number; durations: number[] };
  const buckets = new Map<string, Bucket>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const k = day(d);
    buckets.set(k, { date: k, success: 0, error: 0, durations: [] });
  }
  for (const e of events) {
    const k = day(e.occurredAt);
    const b = buckets.get(k);
    if (!b) continue;
    if (e.success) b.success++; else b.error++;
    b.durations.push(e.durationMs);
  }
  const percentile = (sorted: number[], p: number): number => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
    return sorted[idx]!;
  };
  const daily = Array.from(buckets.values()).map((b) => {
    const sorted = [...b.durations].sort((a, c) => a - c);
    return {
      date: b.date,
      success: b.success,
      error: b.error,
      durationP50: percentile(sorted, 0.5),
      durationP95: percentile(sorted, 0.95),
      durationP99: percentile(sorted, 0.99),
    };
  });

  const totalEvents = events.length;
  const successCount = events.filter((e) => e.success).length;
  const errorCount = totalEvents - successCount;
  const uptime30 = totalEvents === 0 ? null : (successCount / totalEvents) * 100;
  const avgDuration = totalEvents === 0 ? null
    : events.reduce((s, e) => s + e.durationMs, 0) / totalEvents;
  const errorRate = totalEvents === 0 ? null : errorCount / totalEvents;

  return {
    uptimePct30d: uptime30,
    uptimePct90d: integration.uptimePct90d,
    avgSyncDurationMs: avgDuration,
    errorRate30d: errorRate,
    deadLetterCount: errorCount,
    daily,
    // Rate-limit telemetry isn't actually tracked yet — derive a proxy
    // from sync volume so the gauge has a value to render.
    rateLimitPct: Math.min(100, Math.round((totalEvents / 2000) * 100)),
  };
}

/* ── Helpers ───────────────────────────────────────── */

function parseCapabilities(raw: unknown): CatalogDetailView["capabilities"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        entity: String(o.entity ?? ""),
        read:   Boolean(o.read),
        write:  Boolean(o.write),
        sync:   Boolean(o.sync),
        webhook: Boolean(o.webhook),
      };
    })
    .filter((r) => r.entity);
}

function parseScopes(raw: unknown): CatalogDetailView["oauthScopes"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const o = r as Record<string, unknown>;
      return {
        scope: String(o.scope ?? ""),
        justification: typeof o.justification === "string" ? o.justification : undefined,
        capability:    typeof o.capability    === "string" ? o.capability    : undefined,
      };
    })
    .filter((s) => s.scope);
}

function parseOutboundWebhooks(raw: unknown): CatalogDetailView["outboundWebhooks"] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object").map((r) => {
    const o = r as Record<string, unknown>;
    return {
      event: String(o.event ?? ""),
      url: typeof o.url === "string" ? o.url : undefined,
      description: typeof o.description === "string" ? o.description : undefined,
    };
  }).filter((w) => w.event);
}

function parseInboundWebhooks(raw: unknown): CatalogDetailView["inboundWebhooks"] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object").map((r) => {
    const o = r as Record<string, unknown>;
    return {
      event: String(o.event ?? ""),
      description: typeof o.description === "string" ? o.description : undefined,
    };
  }).filter((w) => w.event);
}

function parseFieldMappings(raw: unknown): CatalogDetailView["defaultFieldMappings"] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object").map((r) => {
    const o = r as Record<string, unknown>;
    const dir = String(o.direction ?? "OUT");
    const safeDir: "IN" | "OUT" | "BOTH" = dir === "IN" || dir === "BOTH" ? dir : "OUT";
    return {
      flowtoraField: String(o.flowtoraField ?? ""),
      partnerField:  String(o.partnerField ?? ""),
      direction:     safeDir,
    };
  }).filter((m) => m.flowtoraField && m.partnerField);
}

function parseCodeSamples(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  ACCOUNTING:      "Accounting",
  PAYMENTS:        "Payments",
  ECOMMERCE:       "E-commerce",
  MARKETPLACES:    "Marketplaces",
  AUTOMATION:      "Automation",
  COMMUNICATION:   "Communication",
  EMAIL_MARKETING: "Email Marketing",
  CRM:             "CRM",
  TEAM_COLLAB:     "Team Collaboration",
  PRODUCTIVITY:    "Productivity",
  SHIPPING:        "Shipping",
  CARRIERS:        "Carriers",
  DESIGN:          "Design",
  FILE_TRANSFER:   "File Transfer",
  PRINT_INDUSTRY:  "Print Industry",
  EQUIPMENT:       "Equipment",
  ANALYTICS:       "Analytics",
  TELEPHONY:       "Telephony",
  CALENDAR:        "Calendar",
  REVIEWS:         "Reviews",
  OTHER:           "Other",
};

export const STATUS_LABELS: Record<IntegrationCatalogStatus, string> = {
  ACTIVE:        "Active",
  BETA:          "Beta",
  COMING_SOON:   "Coming soon",
  DEPRECATED:    "Deprecated",
  INTERNAL_ONLY: "Internal only",
};

export const STATUS_TONE: Record<IntegrationCatalogStatus, { bg: string; fg: string }> = {
  ACTIVE:        { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  BETA:          { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  COMING_SOON:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  DEPRECATED:    { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  INTERNAL_ONLY: { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
};

export const AUTH_LABELS: Record<IntegrationAuthType, string> = {
  OAUTH2:     "OAuth 2.0",
  API_KEY:    "API key",
  BASIC_AUTH: "Basic auth",
  SAML:       "SAML",
  CUSTOM:     "Custom",
};

export const REGION_LABELS: Record<IntegrationRegion, string> = {
  US:     "US",
  CA:     "Canada",
  EU:     "EU",
  UK:     "UK",
  APAC:   "APAC",
  GLOBAL: "Global",
};
