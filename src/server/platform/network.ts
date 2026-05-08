// Page 55 — IP Allowlist / Geo Restrictions data layer.

import { db } from "@/lib/db";
import type {
  NetworkRuleScope,
  NetworkRuleAction,
  TenantNetworkMode,
  GeoRestrictionMode,
  GeoRestrictionSource,
  NetworkFeedKind,
  DdosVector,
  DdosStatus,
  WafRuleType,
  WafRuleAction,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const SCOPE_LABEL: Record<NetworkRuleScope, string> = {
  GLOBAL_ALLOW: "Global allow",
  GLOBAL_BLOCK: "Global block",
  TENANT_ALLOW: "Tenant allow",
  TENANT_BLOCK: "Tenant block",
};

export const SCOPE_TONE: Record<
  NetworkRuleScope,
  { bg: string; fg: string; label: string }
> = {
  GLOBAL_ALLOW: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Allow" },
  GLOBAL_BLOCK: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Block" },
  TENANT_ALLOW: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Allow" },
  TENANT_BLOCK: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Block" },
};

export const TENANT_MODE_TONE: Record<
  TenantNetworkMode,
  { bg: string; fg: string; label: string }
> = {
  ALLOWLIST_ONLY: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Allowlist only" },
  BLOCKLIST:      { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Blocklist" },
  DISABLED:       { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Disabled" },
};

export const GEO_MODE_TONE: Record<
  GeoRestrictionMode,
  { bg: string; fg: string; label: string }
> = {
  ALLOW:     { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Allow" },
  CHALLENGE: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Challenge" },
  BLOCK:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Block" },
};

export const GEO_SOURCE_LABEL: Record<GeoRestrictionSource, string> = {
  MANUAL:        "Manual",
  OFAC:          "OFAC",
  EU_SANCTIONS:  "EU sanctions",
  UN_SANCTIONS:  "UN sanctions",
  CUSTOM_FEED:   "Custom feed",
};

export const FEED_KIND_LABEL: Record<NetworkFeedKind, string> = {
  TOR:             "Tor exit nodes",
  VPN_COMMERCIAL:  "Commercial VPNs",
  OPEN_PROXY:      "Open proxies",
  DATACENTER:      "Datacenter ranges",
  KNOWN_SCANNER:   "Known scanners",
  CRYPTO_MINER:    "Crypto-miner pools",
};

export const DDOS_VECTOR_LABEL: Record<DdosVector, string> = {
  HTTP_FLOOD:        "HTTP flood",
  SYN_FLOOD:         "SYN flood",
  UDP_AMPLIFICATION: "UDP amplification",
  DNS_AMPLIFICATION: "DNS amplification",
  SLOWLORIS:         "Slowloris",
  APPLICATION_LAYER: "Application layer",
  GENERIC:           "Generic",
};

export const DDOS_STATUS_TONE: Record<
  DdosStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:    { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Active" },
  MITIGATED: { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Mitigated" },
  ESCALATED: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Escalated" },
  ARCHIVED:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Archived" },
};

export const WAF_TYPE_LABEL: Record<WafRuleType, string> = {
  OWASP_CRS:     "OWASP CRS",
  MANAGED_BOT:   "Managed bot",
  RATE_LIMIT:    "Rate limit",
  CUSTOM_REGEX:  "Custom regex",
  IP_REPUTATION: "IP reputation",
  GEOFENCE:      "Geofence",
};

export const WAF_ACTION_TONE: Record<
  WafRuleAction,
  { bg: string; fg: string; label: string }
> = {
  ALLOW:     { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Allow" },
  CHALLENGE: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Challenge" },
  BLOCK:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Block" },
  LOG:       { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Log" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface NetworkKpis {
  globalAllowCount: number;
  globalBlockCount: number;
  tenantsWithRules: number;
  blocked24h: number;
  challenged24h: number;
  geoBlockedCountries: number;
  feedsEnabled: number;
  activeWafRules: number;
  activeDdosCount: number;
}

export async function loadNetworkKpis(): Promise<NetworkKpis> {
  const [scopeAgg, tenantsWithRules, blocked24h, challenged24h, geoBlocked, feedsEnabled, activeWafRules, activeDdos] = await Promise.all([
    db.networkRule.groupBy({ by: ["scope"], _count: { _all: true } }),
    db.networkRule.findMany({
      where: { scope: { in: ["TENANT_ALLOW", "TENANT_BLOCK"] }, tenantId: { not: null } },
      select: { tenantId: true },
      distinct: ["tenantId"],
    }),
    db.networkRule.aggregate({
      where: { scope: { in: ["GLOBAL_BLOCK", "TENANT_BLOCK"] } },
      _sum: { hits24h: true },
    }),
    db.wafRule.aggregate({
      where: { action: "CHALLENGE" },
      _sum: { hits24h: true },
    }),
    db.geoRestriction.count({ where: { mode: "BLOCK" } }),
    db.networkFeedToggle.count({ where: { enabled: true } }),
    db.wafRule.count({ where: { enabled: true } }),
    db.ddosEvent.count({ where: { status: "ACTIVE" } }),
  ]);
  const scopeMap = new Map<NetworkRuleScope, number>();
  for (const r of scopeAgg) scopeMap.set(r.scope, r._count._all);
  return {
    globalAllowCount: scopeMap.get("GLOBAL_ALLOW") ?? 0,
    globalBlockCount: scopeMap.get("GLOBAL_BLOCK") ?? 0,
    tenantsWithRules: tenantsWithRules.length,
    blocked24h: blocked24h._sum.hits24h ?? 0,
    challenged24h: challenged24h._sum.hits24h ?? 0,
    geoBlockedCountries: geoBlocked,
    feedsEnabled,
    activeWafRules,
    activeDdosCount: activeDdos,
  };
}

/* ── Rule list ──────────────────────────────────────────── */

export interface RuleListFilters {
  q?: string;
  active?: boolean;
}

export interface RuleRow {
  id: string;
  scope: NetworkRuleScope;
  cidr: string;
  description: string | null;
  tag: string | null;
  active: boolean;
  expiresAt: Date | null;
  hits24h: number;
  lastHitAt: Date | null;
  createdByEmail: string | null;
  createdAt: Date;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
}

export async function loadRules(scope: NetworkRuleScope | "ALL_GLOBAL" | "ALL_TENANT", filters: RuleListFilters): Promise<RuleRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (scope === "ALL_GLOBAL")  conditions.push({ scope: { in: ["GLOBAL_ALLOW", "GLOBAL_BLOCK"] } });
  else if (scope === "ALL_TENANT") conditions.push({ scope: { in: ["TENANT_ALLOW", "TENANT_BLOCK"] } });
  else                         conditions.push({ scope });
  if (filters.q) {
    conditions.push({
      OR: [
        { cidr:        { contains: filters.q, mode: "insensitive" } },
        { description: { contains: filters.q, mode: "insensitive" } },
        { tag:         { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.active != null) conditions.push({ active: filters.active });
  const rows = await db.networkRule.findMany({
    where: { AND: conditions },
    orderBy: [{ active: "desc" }, { hits24h: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { tenant: { select: { name: true, slug: true } } },
  });
  return rows.map((r) => ({
    id: r.id, scope: r.scope, cidr: r.cidr,
    description: r.description, tag: r.tag,
    active: r.active, expiresAt: r.expiresAt,
    hits24h: r.hits24h, lastHitAt: r.lastHitAt,
    createdByEmail: r.createdByEmail, createdAt: r.createdAt,
    tenantId: r.tenantId,
    tenantName: r.tenant?.name ?? null,
    tenantSlug: r.tenant?.slug ?? null,
  }));
}

/* ── Per-tenant config table ───────────────────────────── */

export interface TenantConfigRow {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  mode: TenantNetworkMode;
  ruleCount: number;
  supportBypass: boolean;
  notes: string | null;
  updatedAt: Date;
}

export async function loadTenantConfigs(): Promise<TenantConfigRow[]> {
  const cfgs = await db.tenantNetworkConfig.findMany({
    include: { tenant: { select: { id: true, name: true, slug: true } } },
    orderBy: { updatedAt: "desc" },
  });
  // Count per-tenant rules in one go.
  const counts = await db.networkRule.groupBy({
    by: ["tenantId"],
    where: { tenantId: { not: null }, scope: { in: ["TENANT_ALLOW", "TENANT_BLOCK"] } },
    _count: { _all: true },
  });
  const countMap = new Map<string, number>();
  for (const c of counts) if (c.tenantId) countMap.set(c.tenantId, c._count._all);
  return cfgs.map((c) => ({
    id: c.id,
    tenantId: c.tenant.id,
    tenantName: c.tenant.name,
    tenantSlug: c.tenant.slug,
    mode: c.mode,
    ruleCount: countMap.get(c.tenant.id) ?? 0,
    supportBypass: c.supportBypass,
    notes: c.notes,
    updatedAt: c.updatedAt,
  }));
}

/* ── Geo restrictions ──────────────────────────────────── */

export interface GeoRow {
  id: string;
  countryCode: string;
  countryName: string;
  iso3: string | null;
  mode: GeoRestrictionMode;
  source: GeoRestrictionSource;
  hits24h: number;
  lastHitAt: Date | null;
  notes: string | null;
}

export async function loadGeoRestrictions(): Promise<GeoRow[]> {
  const rows = await db.geoRestriction.findMany({
    orderBy: [{ mode: "desc" }, { countryName: "asc" }],
  });
  return rows.map((g) => ({
    id: g.id, countryCode: g.countryCode, countryName: g.countryName, iso3: g.iso3,
    mode: g.mode, source: g.source,
    hits24h: g.hits24h, lastHitAt: g.lastHitAt, notes: g.notes,
  }));
}

/* ── Network feeds ─────────────────────────────────────── */

export async function loadFeeds() {
  return db.networkFeedToggle.findMany({ orderBy: { kind: "asc" } });
}

/* ── Bot mitigation ────────────────────────────────────── */

export async function loadBotSettings() {
  return db.botMitigationSettings.findUnique({ where: { id: "default" } });
}

/* ── DDoS events ───────────────────────────────────────── */

export async function loadDdosEvents() {
  return db.ddosEvent.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
}

/* ── WAF rules ─────────────────────────────────────────── */

export async function loadWafRules() {
  return db.wafRule.findMany({
    orderBy: [{ enabled: "desc" }, { priority: "asc" }, { name: "asc" }],
    take: 200,
  });
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

export function shortDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadNetworkPage() {
  const [kpis, globalAllow, globalBlock, tenantConfigs, geo, feeds, botSettings, ddos, waf, tenants] = await Promise.all([
    loadNetworkKpis(),
    loadRules("GLOBAL_ALLOW", {}),
    loadRules("GLOBAL_BLOCK", {}),
    loadTenantConfigs(),
    loadGeoRestrictions(),
    loadFeeds(),
    loadBotSettings(),
    loadDdosEvents(),
    loadWafRules(),
    db.tenant.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);
  return { kpis, globalAllow, globalBlock, tenantConfigs, geo, feeds, botSettings, ddos, waf, tenants };
}
