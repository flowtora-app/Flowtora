"use server";

// Page 55 — IP Allowlist / Geo Restrictions actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  NetworkRuleScope,
  TenantNetworkMode,
  GeoRestrictionMode,
  GeoRestrictionSource,
  NetworkFeedKind,
  DdosVector,
  DdosStatus,
  WafRuleType,
  WafRuleAction,
} from "@prisma/client";

const ROUTE = "/platform/security/network";
const PERM_READ = "network.read" as const;
const PERM_MANAGE = "network.manage" as const;
const PERM_WAF = "network.waf.write" as const;

const SCOPES = ["GLOBAL_ALLOW", "GLOBAL_BLOCK", "TENANT_ALLOW", "TENANT_BLOCK"] as const;
const TENANT_MODES = ["ALLOWLIST_ONLY", "BLOCKLIST", "DISABLED"] as const;
const GEO_MODES = ["ALLOW", "BLOCK", "CHALLENGE"] as const;
const GEO_SOURCES = ["MANUAL", "OFAC", "EU_SANCTIONS", "UN_SANCTIONS", "CUSTOM_FEED"] as const;
const FEED_KINDS = ["TOR", "VPN_COMMERCIAL", "OPEN_PROXY", "DATACENTER", "KNOWN_SCANNER", "CRYPTO_MINER"] as const;
const DDOS_VECTORS = ["HTTP_FLOOD", "SYN_FLOOD", "UDP_AMPLIFICATION", "DNS_AMPLIFICATION", "SLOWLORIS", "APPLICATION_LAYER", "GENERIC"] as const;
const DDOS_STATUSES = ["ACTIVE", "MITIGATED", "ESCALATED", "ARCHIVED"] as const;
const WAF_TYPES = ["OWASP_CRS", "MANAGED_BOT", "RATE_LIMIT", "CUSTOM_REGEX", "IP_REPUTATION", "GEOFENCE"] as const;
const WAF_ACTIONS = ["ALLOW", "CHALLENGE", "BLOCK", "LOG"] as const;

/* ── CIDR rule CRUD ────────────────────────────────────── */

const ruleSchema = z.object({
  id:          z.string().optional(),
  scope:       z.enum(SCOPES),
  tenantId:    z.string().optional().or(z.literal("")),
  cidr:        z.string().min(1).max(45),
  description: z.string().max(500).optional(),
  tag:         z.string().max(40).optional(),
  active:      z.union([z.literal("on"), z.literal("")]).optional(),
  expiresAt:   z.string().optional(),
});

export async function saveNetworkRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const isTenantScope = d.scope === "TENANT_ALLOW" || d.scope === "TENANT_BLOCK";
  if (isTenantScope && !d.tenantId) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Tenant required for tenant-scoped rules")}`);
  }
  const data = {
    scope: d.scope as NetworkRuleScope,
    tenantId: isTenantScope ? d.tenantId : null,
    cidr: d.cidr,
    description: d.description || null,
    tag: d.tag || null,
    active: d.active === "on",
    expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    createdById: ctx.userId,
    createdByEmail: ctx.email,
  };
  const saved = await db.networkRule.upsert({
    where: {
      scope_cidr_tenantId: {
        scope: d.scope as NetworkRuleScope,
        cidr: d.cidr,
        tenantId: isTenantScope ? d.tenantId! : "",
      },
    },
    create: { ...data, tenantId: isTenantScope ? d.tenantId! : null },
    update: {
      description: data.description, tag: data.tag, active: data.active,
      expiresAt: data.expiresAt,
    },
  }).catch(async () => {
    // Fall back to simple create/update without unique constraint (when tenantId is null
    // the unique with empty string above won't match — handle separately).
    if (d.id) {
      return db.networkRule.update({
        where: { id: d.id },
        data: {
          ...data,
          tenantId: isTenantScope ? d.tenantId! : null,
        },
      });
    }
    return db.networkRule.create({
      data: {
        ...data,
        tenantId: isTenantScope ? d.tenantId! : null,
      },
    });
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.rule_saved",
    entityType: "NetworkRule", entityId: saved.id,
    metadata: { actor: ctx.email, scope: d.scope, cidr: d.cidr },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=rule-saved`);
}

const deleteRuleSchema = z.object({ id: z.string().min(1) });

export async function deleteNetworkRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = deleteRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.networkRule.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.rule_deleted",
    entityType: "NetworkRule", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=rule-deleted`);
}

const toggleRuleSchema = z.object({ id: z.string().min(1), active: z.union([z.literal("0"), z.literal("1")]) });

export async function toggleNetworkRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = toggleRuleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid`);
  await db.networkRule.update({
    where: { id: parsed.data.id },
    data: { active: parsed.data.active === "1" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=rule-toggled`);
}

/* ── Tenant network config ─────────────────────────────── */

const tenantCfgSchema = z.object({
  tenantId:      z.string().min(1),
  mode:          z.enum(TENANT_MODES),
  supportBypass: z.union([z.literal("on"), z.literal("")]).optional(),
  notes:         z.string().max(500).optional(),
});

export async function saveTenantNetworkConfig(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = tenantCfgSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=tenants&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.tenantNetworkConfig.upsert({
    where: { tenantId: d.tenantId },
    create: {
      tenantId: d.tenantId,
      mode: d.mode as TenantNetworkMode,
      supportBypass: d.supportBypass === "on",
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      mode: d.mode as TenantNetworkMode,
      supportBypass: d.supportBypass === "on",
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.tenant_config_saved",
    entityType: "TenantNetworkConfig", entityId: d.tenantId,
    metadata: { actor: ctx.email, mode: d.mode },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenants&ok=tenant-config-saved`);
}

/* ── Geo restrictions ──────────────────────────────────── */

const geoSchema = z.object({
  countryCode: z.string().length(2),
  countryName: z.string().min(1).max(120),
  iso3:        z.string().length(3).optional().or(z.literal("")),
  mode:        z.enum(GEO_MODES),
  source:      z.enum(GEO_SOURCES),
  notes:       z.string().max(500).optional(),
});

export async function saveGeoRestriction(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = geoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=geo&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.geoRestriction.upsert({
    where: { countryCode: d.countryCode.toUpperCase() },
    create: {
      countryCode: d.countryCode.toUpperCase(),
      countryName: d.countryName,
      iso3: d.iso3 || null,
      mode: d.mode as GeoRestrictionMode,
      source: d.source as GeoRestrictionSource,
      notes: d.notes || null,
      lastSyncedAt: new Date(),
    },
    update: {
      countryName: d.countryName,
      iso3: d.iso3 || null,
      mode: d.mode as GeoRestrictionMode,
      source: d.source as GeoRestrictionSource,
      notes: d.notes || null,
      lastSyncedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.geo_saved",
    entityType: "GeoRestriction", entityId: d.countryCode,
    metadata: { actor: ctx.email, mode: d.mode, source: d.source },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=geo&ok=geo-saved`);
}

const setGeoModeSchema = z.object({
  countryCode: z.string().length(2),
  mode:        z.enum(GEO_MODES),
});

export async function setGeoMode(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = setGeoModeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=geo&error=Invalid`);
  await db.geoRestriction.update({
    where: { countryCode: parsed.data.countryCode.toUpperCase() },
    data: { mode: parsed.data.mode as GeoRestrictionMode, lastSyncedAt: new Date() },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=geo&ok=geo-mode-set`);
}

/* ── Feeds ─────────────────────────────────────────────── */

const feedSchema = z.object({
  kind:        z.enum(FEED_KINDS),
  enabled:     z.union([z.literal("on"), z.literal("")]).optional(),
  sourceName:  z.string().min(1).max(120),
  feedUrl:     z.string().url().optional().or(z.literal("")),
  overrideCidrs: z.string().optional(),
  notes:       z.string().max(500).optional(),
});

export async function saveFeed(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = feedSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=feeds&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const overrideCidrs = (d.overrideCidrs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  await db.networkFeedToggle.upsert({
    where: { kind: d.kind as NetworkFeedKind },
    create: {
      kind: d.kind as NetworkFeedKind,
      enabled: d.enabled === "on",
      sourceName: d.sourceName,
      feedUrl: d.feedUrl || null,
      overrideCidrs,
      notes: d.notes || null,
      lastSyncedAt: new Date(),
    },
    update: {
      enabled: d.enabled === "on",
      sourceName: d.sourceName,
      feedUrl: d.feedUrl || null,
      overrideCidrs,
      notes: d.notes || null,
      lastSyncedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.feed_saved",
    entityType: "NetworkFeedToggle", entityId: d.kind,
    metadata: { actor: ctx.email, enabled: d.enabled === "on" },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=feeds&ok=feed-saved`);
}

/* ── Bot settings ──────────────────────────────────────── */

const botSchema = z.object({
  enabled:               z.union([z.literal("on"), z.literal("")]).optional(),
  botScoreThreshold:     z.coerce.number().int().min(0).max(100),
  actionAboveThreshold:  z.enum(WAF_ACTIONS),
  challengeProvider:     z.string().min(1).max(40),
  defaultRpmPerIp:       z.coerce.number().int().min(1).max(100_000),
  managedBotAllowlist:   z.union([z.literal("on"), z.literal("")]).optional(),
  notes:                 z.string().max(500).optional(),
});

export async function saveBotSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = botSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=bot&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  await db.botMitigationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enabled: d.enabled === "on",
      botScoreThreshold: d.botScoreThreshold,
      actionAboveThreshold: d.actionAboveThreshold as WafRuleAction,
      challengeProvider: d.challengeProvider,
      defaultRpmPerIp: d.defaultRpmPerIp,
      managedBotAllowlist: d.managedBotAllowlist === "on",
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
    update: {
      enabled: d.enabled === "on",
      botScoreThreshold: d.botScoreThreshold,
      actionAboveThreshold: d.actionAboveThreshold as WafRuleAction,
      challengeProvider: d.challengeProvider,
      defaultRpmPerIp: d.defaultRpmPerIp,
      managedBotAllowlist: d.managedBotAllowlist === "on",
      notes: d.notes || null,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.bot_settings_saved",
    entityType: "BotMitigationSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=bot&ok=bot-saved`);
}

/* ── DDoS events ───────────────────────────────────────── */

const ddosSchema = z.object({
  startedAt:    z.string().min(1),
  endedAt:      z.string().optional(),
  vector:       z.enum(DDOS_VECTORS),
  status:       z.enum(DDOS_STATUSES),
  peakMbps:     z.coerce.number().int().min(0).optional(),
  peakMpps:     z.coerce.number().int().min(0).optional(),
  sourceIpCount: z.coerce.number().int().min(0).optional(),
  attribution:  z.string().max(200).optional(),
  summary:      z.string().max(2000).optional(),
  mitigationLayer: z.string().max(100).optional(),
});

export async function recordDdosEvent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = ddosSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=ddos&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const startedAt = new Date(d.startedAt);
  const endedAt = d.endedAt ? new Date(d.endedAt) : null;
  const durationSec = endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null;
  const created = await db.ddosEvent.create({
    data: {
      startedAt,
      endedAt,
      durationSec,
      vector: d.vector as DdosVector,
      status: d.status as DdosStatus,
      peakMbps: d.peakMbps ?? null,
      peakMpps: d.peakMpps ?? null,
      sourceIpCount: d.sourceIpCount ?? null,
      attribution: d.attribution || null,
      summary: d.summary || null,
      mitigationLayer: d.mitigationLayer || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.ddos_recorded",
    entityType: "DdosEvent", entityId: created.id,
    metadata: { actor: ctx.email, vector: d.vector, status: d.status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=ddos&ok=ddos-recorded`);
}

/* ── WAF rules ─────────────────────────────────────────── */

const wafSchema = z.object({
  id:          z.string().optional(),
  name:        z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  type:        z.enum(WAF_TYPES),
  matchExpr:   z.string().min(1).max(2000),
  action:      z.enum(WAF_ACTIONS),
  enabled:     z.union([z.literal("on"), z.literal("")]).optional(),
  priority:    z.coerce.number().int().min(1).max(9999),
  externalId:  z.string().max(60).optional(),
  tag:         z.string().max(60).optional(),
});

export async function saveWafRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WAF);
  const parsed = wafSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=waf&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    description: d.description || null,
    type: d.type as WafRuleType,
    matchExpr: d.matchExpr,
    action: d.action as WafRuleAction,
    enabled: d.enabled === "on",
    priority: d.priority,
    externalId: d.externalId || null,
    tag: d.tag || null,
  };
  const saved = d.id
    ? await db.wafRule.update({ where: { id: d.id }, data })
    : await db.wafRule.create({ data });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.network.waf_rule_saved",
    entityType: "WafRule", entityId: saved.id,
    metadata: { actor: ctx.email, name: d.name, type: d.type, action: d.action },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=waf&ok=waf-saved`);
}

const toggleWafSchema = z.object({ id: z.string().min(1) });

export async function toggleWafRule(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_WAF);
  const parsed = toggleWafSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=waf&error=Invalid`);
  const r = await db.wafRule.findUnique({ where: { id: parsed.data.id } });
  if (!r) redirect(`${ROUTE}?tab=waf&error=Not-found`);
  await db.wafRule.update({ where: { id: parsed.data.id }, data: { enabled: !r!.enabled } });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=waf&ok=waf-toggled`);
}
