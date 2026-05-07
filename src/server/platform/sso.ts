// Page 49 — SSO Providers data layer.

import { db } from "@/lib/db";
import type {
  SsoProviderKey,
  SsoConfigType,
  SsoConfigStatus,
  ScimOperation,
  ScimLogStatus,
  SamlSignatureAlgorithm,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPIs ───────────────────────────────────────────────── */

export interface SsoKpis {
  activeProviders: number;
  totalConfigs: number;
  activeConfigs: number;
  pendingConfigs: number;
  failedConfigs: number;
  scimEnabled: number;
  /** Last 24h SCIM error rate (errors / total). */
  scimErrorRate24h: number | null;
  scimEvents24h: number;
  forcedSsoTenants: number;
}

export async function loadSsoKpis(): Promise<SsoKpis> {
  const since24 = new Date(Date.now() - DAY);
  const [providers, byStatus, scimEnabled, forcedSso, scimAgg, scimErrors] = await Promise.all([
    db.ssoProvider.count({ where: { active: true } }),
    db.ssoTenantConfig.groupBy({ by: ["status"], _count: { _all: true } }),
    db.ssoTenantConfig.count({ where: { scimEnabled: true } }),
    db.ssoTenantConfig.count({ where: { forceSso: true } }),
    db.scimLog.count({ where: { occurredAt: { gte: since24 } } }),
    db.scimLog.count({ where: { occurredAt: { gte: since24 }, status: "ERROR" } }),
  ]);
  const map = new Map<SsoConfigStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  return {
    activeProviders: providers,
    totalConfigs: Array.from(map.values()).reduce((s, n) => s + n, 0),
    activeConfigs: map.get("ACTIVE") ?? 0,
    pendingConfigs: (map.get("PENDING") ?? 0) + (map.get("TEST") ?? 0),
    failedConfigs: map.get("FAILED") ?? 0,
    scimEnabled,
    scimErrorRate24h: scimAgg === 0 ? null : scimErrors / scimAgg,
    scimEvents24h: scimAgg,
    forcedSsoTenants: forcedSso,
  };
}

/* ── Provider catalog ──────────────────────────────────── */

export interface ProviderCatalogTile {
  id: string;
  key: SsoProviderKey;
  name: string;
  description: string | null;
  iconKey: string | null;
  defaultScopes: string[];
  defaultType: SsoConfigType;
  active: boolean;
  setupDocsUrl: string | null;
  notes: string | null;
  connectedTenantCount: number;
  configsActiveCount: number;
}

export async function loadProviderCatalog(): Promise<ProviderCatalogTile[]> {
  const providers = await db.ssoProvider.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { configs: true } },
      configs: { where: { status: "ACTIVE" }, select: { id: true } },
    },
  });
  return providers.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description,
    iconKey: p.iconKey,
    defaultScopes: p.defaultScopes,
    defaultType: p.defaultType,
    active: p.active,
    setupDocsUrl: p.setupDocsUrl,
    notes: p.notes,
    connectedTenantCount: p._count.configs,
    configsActiveCount: p.configs.length,
  }));
}

/* ── Per-tenant config table ──────────────────────────── */

export interface TenantConfigRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  providerKey: SsoProviderKey;
  providerName: string;
  type: SsoConfigType;
  status: SsoConfigStatus;
  displayName: string;
  acsUrl: string | null;
  metadataLastRefreshedAt: Date | null;
  scimEnabled: boolean;
  forceSso: boolean;
  jit: boolean;
  lastLoginAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

export interface TenantConfigFilters {
  q?: string;
  providerId?: string;
  status?: SsoConfigStatus | "ALL";
  scimOnly?: boolean;
}

export async function loadTenantConfigs(filters: TenantConfigFilters): Promise<TenantConfigRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { displayName: { contains: filters.q, mode: "insensitive" } },
        { tenant: { name: { contains: filters.q, mode: "insensitive" } } },
        { tenant: { slug: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  if (filters.providerId)                          conditions.push({ providerId: filters.providerId });
  if (filters.status && filters.status !== "ALL") conditions.push({ status: filters.status });
  if (filters.scimOnly)                            conditions.push({ scimEnabled: true });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const rows = await db.ssoTenantConfig.findMany({
    where,
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      provider: { select: { key: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenant.id,
    tenantName: r.tenant.name,
    tenantSlug: r.tenant.slug,
    providerKey: r.provider.key,
    providerName: r.provider.name,
    type: r.type,
    status: r.status,
    displayName: r.displayName,
    acsUrl: r.acsUrl,
    metadataLastRefreshedAt: r.metadataLastRefreshedAt,
    scimEnabled: r.scimEnabled,
    forceSso: r.forceSso,
    jit: r.jitProvisioningEnabled,
    lastLoginAt: r.lastLoginAt,
    lastSyncAt: r.lastSyncAt,
    lastError: r.lastError,
    createdAt: r.createdAt,
  }));
}

/* ── Tenant config detail (edit form) ─────────────────── */

export interface TenantConfigDetail {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  providerId: string;
  providerKey: SsoProviderKey;
  providerName: string;
  displayName: string;
  type: SsoConfigType;
  status: SsoConfigStatus;

  // SAML
  metadataUrl: string | null;
  metadataXml: string | null;
  entityId: string | null;
  acsUrl: string | null;
  sloUrl: string | null;
  signatureAlgorithm: SamlSignatureAlgorithm;
  encryptionCertPem: string | null;
  attributeMappings: Record<string, string>;
  defaultRoleId: string | null;
  groupRules: Array<{ group: string; roleId: string }>;

  // OIDC
  issuer: string | null;
  clientId: string | null;
  /** Hashed presence — never returns the raw value. */
  hasClientSecret: boolean;
  discoveryUrl: string | null;
  authorizeUrl: string | null;
  tokenUrl: string | null;
  userInfoUrl: string | null;
  scopes: string[];
  pkceEnabled: boolean;

  // Common
  jitProvisioningEnabled: boolean;
  forceSso: boolean;
  allowedEmailDomains: string[];
  scimEnabled: boolean;
  hasScimToken: boolean;

  lastLoginAt: Date | null;
  lastSyncAt: Date | null;
  metadataLastRefreshedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;

  scimRecent: ScimLogRow[];
}

export async function loadTenantConfig(id: string): Promise<TenantConfigDetail | null> {
  const cfg = await db.ssoTenantConfig.findUnique({
    where: { id },
    include: {
      tenant: { select: { name: true, slug: true } },
      provider: { select: { key: true, name: true } },
      scimLogs: { orderBy: { occurredAt: "desc" }, take: 30 },
    },
  });
  if (!cfg) return null;

  const attrs = parseAttributes(cfg.attributeMappings);
  const groupRules = parseGroupRules(cfg.groupRules);

  return {
    id: cfg.id,
    tenantId: cfg.tenantId,
    tenantName: cfg.tenant.name,
    tenantSlug: cfg.tenant.slug,
    providerId: cfg.providerId,
    providerKey: cfg.provider.key,
    providerName: cfg.provider.name,
    displayName: cfg.displayName,
    type: cfg.type,
    status: cfg.status,

    metadataUrl: cfg.metadataUrl,
    metadataXml: cfg.metadataXml,
    entityId: cfg.entityId,
    acsUrl: cfg.acsUrl,
    sloUrl: cfg.sloUrl,
    signatureAlgorithm: cfg.signatureAlgorithm,
    encryptionCertPem: cfg.encryptionCertPem,
    attributeMappings: attrs,
    defaultRoleId: cfg.defaultRoleId,
    groupRules,

    issuer: cfg.issuer,
    clientId: cfg.clientId,
    hasClientSecret: !!cfg.clientSecret,
    discoveryUrl: cfg.discoveryUrl,
    authorizeUrl: cfg.authorizeUrl,
    tokenUrl: cfg.tokenUrl,
    userInfoUrl: cfg.userInfoUrl,
    scopes: cfg.scopes,
    pkceEnabled: cfg.pkceEnabled,

    jitProvisioningEnabled: cfg.jitProvisioningEnabled,
    forceSso: cfg.forceSso,
    allowedEmailDomains: cfg.allowedEmailDomains,
    scimEnabled: cfg.scimEnabled,
    hasScimToken: !!cfg.scimBearerToken,

    lastLoginAt: cfg.lastLoginAt,
    lastSyncAt: cfg.lastSyncAt,
    metadataLastRefreshedAt: cfg.metadataLastRefreshedAt,
    lastError: cfg.lastError,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,

    scimRecent: cfg.scimLogs.map(mapScimRow),
  };
}

/* ── SCIM logs ─────────────────────────────────────────── */

export interface ScimLogRow {
  id: string;
  occurredAt: Date;
  tenantId: string;
  tenantName?: string | null;
  configId: string | null;
  operation: ScimOperation;
  resourceType: string;
  resourceId: string | null;
  externalId: string | null;
  status: ScimLogStatus;
  httpCode: number | null;
  payload: unknown;
  responseBody: string | null;
  errorMessage: string | null;
  attempts: number;
}

function mapScimRow(r: {
  id: string; occurredAt: Date; tenantId: string; ssoConfigId: string | null;
  operation: ScimOperation; resourceType: string; resourceId: string | null;
  externalId: string | null; status: ScimLogStatus; httpCode: number | null;
  payload: unknown; responseBody: string | null; errorMessage: string | null; attempts: number;
}): ScimLogRow {
  return {
    id: r.id,
    occurredAt: r.occurredAt,
    tenantId: r.tenantId,
    configId: r.ssoConfigId,
    operation: r.operation,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    externalId: r.externalId,
    status: r.status,
    httpCode: r.httpCode,
    payload: r.payload,
    responseBody: r.responseBody,
    errorMessage: r.errorMessage,
    attempts: r.attempts,
  };
}

export interface ScimLogFilters {
  tenantId?: string;
  operation?: ScimOperation;
  status?: ScimLogStatus | "ALL";
  from?: Date;
  to?: Date;
  configId?: string;
}

export async function loadScimLogs(
  filters: ScimLogFilters,
  opts: { page?: number; pageSize?: number } = {},
): Promise<{ rows: ScimLogRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = opts.pageSize ?? 100;
  const page = Math.max(1, opts.page ?? 1);

  const conditions: Record<string, unknown>[] = [];
  if (filters.tenantId)                              conditions.push({ tenantId: filters.tenantId });
  if (filters.operation)                             conditions.push({ operation: filters.operation });
  if (filters.status && filters.status !== "ALL")  conditions.push({ status: filters.status });
  if (filters.from)                                  conditions.push({ occurredAt: { gte: filters.from } });
  if (filters.to)                                    conditions.push({ occurredAt: { lte: filters.to } });
  if (filters.configId)                              conditions.push({ ssoConfigId: filters.configId });
  const where = conditions.length === 0 ? {} : { AND: conditions };

  const [rows, total] = await Promise.all([
    db.scimLog.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.scimLog.count({ where }),
  ]);
  // Resolve tenant names in one batch.
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)));
  const tenants = tenantIds.length === 0 ? [] : await db.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true },
  });
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  return {
    rows: rows.map((r) => ({ ...mapScimRow(r), tenantName: tenantMap.get(r.tenantId) ?? null })),
    total,
    page,
    pageSize,
  };
}

/* ── Templates ─────────────────────────────────────────── */

export interface TemplateRow {
  id: string;
  providerId: string;
  providerName: string;
  providerKey: SsoProviderKey;
  name: string;
  type: SsoConfigType;
  snippet: string;
  description: string | null;
  screenshots: string[];
}

export async function loadIdpTemplates(): Promise<TemplateRow[]> {
  const rows = await db.ssoIdpTemplate.findMany({
    include: { provider: { select: { name: true, key: true } } },
    orderBy: [{ provider: { name: "asc" } }, { name: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    providerId: r.providerId,
    providerName: r.provider.name,
    providerKey: r.provider.key,
    name: r.name,
    type: r.type,
    snippet: r.snippet,
    description: r.description,
    screenshots: r.screenshots,
  }));
}

/* ── Settings ──────────────────────────────────────────── */

export async function loadSsoSettings(): Promise<{
  id: string;
  enforceMfaWithSso: boolean;
  idpInitiatedSsoAllowed: boolean;
  sessionLifetimeHours: number | null;
  jitDeprovisionEnabled: boolean;
  updatedAt: Date;
}> {
  const existing = await db.ssoSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;
  const created = await db.ssoSettings.create({ data: { id: "default" } });
  return created;
}

/* ── Helpers ──────────────────────────────────────────── */

function parseAttributes(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function parseGroupRules(raw: unknown): Array<{ group: string; roleId: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const o = r as Record<string, unknown>;
      return { group: String(o.group ?? ""), roleId: String(o.roleId ?? "") };
    })
    .filter((g) => g.group && g.roleId);
}

export const PROVIDER_LABELS: Record<SsoProviderKey, string> = {
  OKTA:         "Okta",
  AZURE_AD:     "Azure AD / Entra ID",
  GOOGLE:       "Google Workspace",
  ONELOGIN:     "OneLogin",
  JUMPCLOUD:    "JumpCloud",
  PING:         "Ping Identity",
  AUTH0:        "Auth0",
  DUO:          "Duo",
  ADFS:         "Microsoft AD FS",
  GENERIC_SAML: "Generic SAML",
  GENERIC_OIDC: "Generic OIDC",
};

export const PROVIDER_ICONS: Record<SsoProviderKey, string> = {
  OKTA:         "🔵",
  AZURE_AD:     "🪟",
  GOOGLE:       "🅖",
  ONELOGIN:     "🟠",
  JUMPCLOUD:    "☁",
  PING:         "📍",
  AUTH0:        "🛡",
  DUO:          "🔒",
  ADFS:         "🪟",
  GENERIC_SAML: "🔐",
  GENERIC_OIDC: "🔐",
};

export const STATUS_TONE: Record<SsoConfigStatus, { bg: string; fg: string }> = {
  PENDING:  { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  TEST:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  ACTIVE:   { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  FAILED:   { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  DISABLED: { bg: "var(--surface-2)",       fg: "var(--text-faint)" },
};

export const SCIM_STATUS_TONE: Record<ScimLogStatus, { bg: string; fg: string }> = {
  OK:          { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  ERROR:       { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  RETRYING:    { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  DEAD_LETTER: { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const OPERATION_LABELS: Record<ScimOperation, string> = {
  USER_CREATE:  "Create user",
  USER_UPDATE:  "Update user",
  USER_DELETE:  "Delete user",
  USER_PATCH:   "Patch user",
  GROUP_CREATE: "Create group",
  GROUP_UPDATE: "Update group",
  GROUP_DELETE: "Delete group",
  GROUP_PATCH:  "Patch group",
};
