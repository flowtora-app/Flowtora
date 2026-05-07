"use server";

// Page 49 — SSO Providers actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  SsoConfigType,
  SsoConfigStatus,
  SamlSignatureAlgorithm,
  SsoProviderKey,
  ScimOperation,
  ScimLogStatus,
} from "@prisma/client";

const ROUTE = "/platform/integrations/sso";
const PERM = "sso.manage" as const;

const TYPES = ["SAML", "OIDC"] as const;
const STATUSES = ["PENDING", "TEST", "ACTIVE", "FAILED", "DISABLED"] as const;
const SIGN_ALGS = ["RSA_SHA1", "RSA_SHA256", "RSA_SHA512"] as const;
const PROVIDER_KEYS = [
  "OKTA", "AZURE_AD", "GOOGLE", "ONELOGIN", "JUMPCLOUD",
  "PING", "AUTH0", "DUO", "ADFS", "GENERIC_SAML", "GENERIC_OIDC",
] as const;

/* ── Tenant config CRUD ─────────────────────────────── */

const createConfigSchema = z.object({
  tenantId:    z.string().min(1),
  providerId:  z.string().min(1),
  type:        z.enum(TYPES),
  displayName: z.string().min(1).max(120),
});

export async function createTenantConfig(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = createConfigSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=configs&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  // Compute the Flowtora-side ACS URL for SAML configs.
  const acsUrl = d.type === "SAML"
    ? `https://app.flowtora.com/api/sso/saml/${d.providerId}/acs?cfg=${d.tenantId}`
    : null;
  const created = await db.ssoTenantConfig.upsert({
    where: { tenantId_providerId: { tenantId: d.tenantId, providerId: d.providerId } },
    create: {
      tenantId: d.tenantId,
      providerId: d.providerId,
      type: d.type as SsoConfigType,
      displayName: d.displayName,
      acsUrl,
      status: "PENDING",
      createdById: ctx.userId,
    },
    update: {
      type: d.type as SsoConfigType,
      displayName: d.displayName,
      acsUrl: acsUrl ?? undefined,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.config_created",
    entityType: "SsoTenantConfig",
    entityId: created.id,
    metadata: { actor: ctx.email, tenantId: d.tenantId, providerId: d.providerId, type: d.type },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${created.id}?ok=created`);
}

const samlSchema = z.object({
  id:                 z.string().min(1),
  displayName:        z.string().min(1).max(120),
  status:             z.enum(STATUSES),
  metadataUrl:        z.string().max(500).optional().or(z.literal("")),
  metadataXml:        z.string().max(200_000).optional().or(z.literal("")),
  entityId:           z.string().max(500).optional().or(z.literal("")),
  sloUrl:             z.string().max(500).optional().or(z.literal("")),
  signatureAlgorithm: z.enum(SIGN_ALGS).default("RSA_SHA256"),
  encryptionCertPem:  z.string().max(20_000).optional().or(z.literal("")),
  attrEmail:          z.string().max(200).optional().or(z.literal("")),
  attrGivenName:      z.string().max(200).optional().or(z.literal("")),
  attrFamilyName:     z.string().max(200).optional().or(z.literal("")),
  attrGroups:         z.string().max(200).optional().or(z.literal("")),
  defaultRoleId:      z.string().max(120).optional().or(z.literal("")),
  groupRulesRaw:      z.string().max(5000).optional().or(z.literal("")),
  jitProvisioning:    z.coerce.boolean().optional().default(false),
  forceSso:           z.coerce.boolean().optional().default(false),
  scimEnabled:        z.coerce.boolean().optional().default(false),
  rotateScimToken:    z.coerce.boolean().optional().default(false),
  allowedEmailDomainsRaw: z.string().max(2000).optional().or(z.literal("")),
});

export async function saveSamlConfig(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["jitProvisioning", "forceSso", "scimEnabled", "rotateScimToken"]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  const parsed = samlSchema.safeParse(raw);
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${ROUTE}/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;

  // Parse group rules from "Group | roleId" lines.
  const groupRules = (d.groupRulesRaw ?? "")
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .map((line) => {
      const [g, ...rest] = line.split("|");
      return { group: (g ?? "").trim(), roleId: rest.join("|").trim() };
    })
    .filter((r) => r.group && r.roleId);

  const attributeMappings: Record<string, string> = {};
  if (d.attrEmail)      attributeMappings.email       = d.attrEmail;
  if (d.attrGivenName)  attributeMappings.given_name  = d.attrGivenName;
  if (d.attrFamilyName) attributeMappings.family_name = d.attrFamilyName;
  if (d.attrGroups)     attributeMappings.groups      = d.attrGroups;

  const allowedEmailDomains = (d.allowedEmailDomainsRaw ?? "")
    .split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  const data: Record<string, unknown> = {
    displayName: d.displayName,
    status: d.status as SsoConfigStatus,
    metadataUrl: d.metadataUrl || null,
    metadataXml: d.metadataXml || null,
    entityId: d.entityId || null,
    sloUrl: d.sloUrl || null,
    signatureAlgorithm: d.signatureAlgorithm as SamlSignatureAlgorithm,
    encryptionCertPem: d.encryptionCertPem || null,
    attributeMappings,
    defaultRoleId: d.defaultRoleId || null,
    groupRules,
    jitProvisioningEnabled: d.jitProvisioning,
    forceSso: d.forceSso,
    scimEnabled: d.scimEnabled,
    allowedEmailDomains,
    metadataLastRefreshedAt: d.metadataUrl || d.metadataXml ? new Date() : undefined,
  };
  if (d.rotateScimToken && d.scimEnabled) {
    data.scimBearerToken = `scim_${randomBytes(24).toString("hex")}`;
  } else if (!d.scimEnabled) {
    data.scimBearerToken = null;
  }

  await db.ssoTenantConfig.update({ where: { id: d.id }, data });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.config_saved",
    entityType: "SsoTenantConfig",
    entityId: d.id,
    metadata: { actor: ctx.email, type: "SAML", status: d.status, scimEnabled: d.scimEnabled },
  });
  revalidatePath(`${ROUTE}/${d.id}`);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=saved`);
}

const oidcSchema = z.object({
  id:                z.string().min(1),
  displayName:       z.string().min(1).max(120),
  status:            z.enum(STATUSES),
  issuer:            z.string().max(500).optional().or(z.literal("")),
  clientId:          z.string().max(500).optional().or(z.literal("")),
  clientSecret:      z.string().max(2000).optional().or(z.literal("")),
  discoveryUrl:      z.string().max(500).optional().or(z.literal("")),
  authorizeUrl:      z.string().max(500).optional().or(z.literal("")),
  tokenUrl:          z.string().max(500).optional().or(z.literal("")),
  userInfoUrl:       z.string().max(500).optional().or(z.literal("")),
  scopesRaw:         z.string().max(2000).optional().or(z.literal("")),
  pkceEnabled:       z.coerce.boolean().optional().default(false),
  jitProvisioning:   z.coerce.boolean().optional().default(false),
  forceSso:          z.coerce.boolean().optional().default(false),
  scimEnabled:       z.coerce.boolean().optional().default(false),
  rotateScimToken:   z.coerce.boolean().optional().default(false),
  allowedEmailDomainsRaw: z.string().max(2000).optional().or(z.literal("")),
  defaultRoleId:     z.string().max(120).optional().or(z.literal("")),
});

export async function saveOidcConfig(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["pkceEnabled", "jitProvisioning", "forceSso", "scimEnabled", "rotateScimToken"]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  const parsed = oidcSchema.safeParse(raw);
  if (!parsed.success) {
    const id = formData.get("id");
    redirect(`${ROUTE}/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const scopes = (d.scopesRaw ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const allowedEmailDomains = (d.allowedEmailDomainsRaw ?? "")
    .split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

  const data: Record<string, unknown> = {
    displayName: d.displayName,
    status: d.status as SsoConfigStatus,
    issuer: d.issuer || null,
    clientId: d.clientId || null,
    discoveryUrl: d.discoveryUrl || null,
    authorizeUrl: d.authorizeUrl || null,
    tokenUrl: d.tokenUrl || null,
    userInfoUrl: d.userInfoUrl || null,
    scopes,
    pkceEnabled: d.pkceEnabled,
    jitProvisioningEnabled: d.jitProvisioning,
    forceSso: d.forceSso,
    scimEnabled: d.scimEnabled,
    allowedEmailDomains,
    defaultRoleId: d.defaultRoleId || null,
  };
  // Only update the secret if the user typed something — never clear it accidentally.
  if (d.clientSecret && d.clientSecret.length > 0) {
    data.clientSecret = createHash("sha256").update(d.clientSecret).digest("hex");
  }
  if (d.rotateScimToken && d.scimEnabled) {
    data.scimBearerToken = `scim_${randomBytes(24).toString("hex")}`;
  } else if (!d.scimEnabled) {
    data.scimBearerToken = null;
  }

  await db.ssoTenantConfig.update({ where: { id: d.id }, data });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.config_saved",
    entityType: "SsoTenantConfig",
    entityId: d.id,
    metadata: { actor: ctx.email, type: "OIDC", status: d.status, scimEnabled: d.scimEnabled },
  });
  revalidatePath(`${ROUTE}/${d.id}`);
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${d.id}?ok=saved`);
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteTenantConfig(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  await db.ssoTenantConfig.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.config_deleted",
    entityType: "SsoTenantConfig",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=configs&ok=deleted`);
}

/* ── Test login (read-permission) ───────────────────── */

const testLoginSchema = z.object({
  id:     z.string().min(1),
  reason: z.string().max(500).optional().or(z.literal("")),
});
export async function runTestLogin(formData: FormData) {
  const ctx = await requirePlatformPermission("sso.test_login");
  const parsed = testLoginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const cfg = await db.ssoTenantConfig.findUnique({ where: { id: parsed.data.id } });
  if (!cfg) redirect(`${ROUTE}?error=not-found`);
  // Simulate the test login — flip status to TEST and stamp lastLoginAt.
  await db.ssoTenantConfig.update({
    where: { id: parsed.data.id },
    data: { status: "TEST", lastLoginAt: new Date(), lastError: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.test_login",
    entityType: "SsoTenantConfig",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, reason: parsed.data.reason ?? null },
  });
  revalidatePath(`${ROUTE}/${parsed.data.id}`);
  redirect(`${ROUTE}/${parsed.data.id}?ok=test-login-ran`);
}

/* ── Refresh metadata ───────────────────────────────── */

export async function refreshSamlMetadata(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const cfg = await db.ssoTenantConfig.findUnique({ where: { id: parsed.data.id } });
  if (!cfg) redirect(`${ROUTE}?error=not-found`);
  if (!cfg.metadataUrl) {
    redirect(`${ROUTE}/${parsed.data.id}?error=${encodeURIComponent("No metadata URL configured")}`);
  }
  await db.ssoTenantConfig.update({
    where: { id: parsed.data.id },
    data: { metadataLastRefreshedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.metadata_refreshed",
    entityType: "SsoTenantConfig",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(`${ROUTE}/${parsed.data.id}`);
  redirect(`${ROUTE}/${parsed.data.id}?ok=metadata-refreshed`);
}

/* ── SCIM log retry ─────────────────────────────────── */

const retryScimSchema = z.object({ id: z.string().min(1) });
export async function retryScimEvent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = retryScimSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=invalid`);
  const log = await db.scimLog.findUnique({ where: { id: parsed.data.id } });
  if (!log) redirect(`${ROUTE}?error=not-found`);
  // Pretend retry — flip status to RETRYING and bump attempts; in production
  // a worker would pick this up and run the actual SCIM op.
  await db.scimLog.update({
    where: { id: parsed.data.id },
    data: {
      status: "RETRYING",
      attempts: { increment: 1 },
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.scim_retry",
    entityType: "ScimLog",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email, operation: log.operation },
  });
  revalidatePath(`${ROUTE}?tab=scim`);
  redirect(`${ROUTE}?tab=scim&ok=retry-queued`);
}

/* ── Provider catalog ──────────────────────────────── */

const providerSchema = z.object({
  id:           z.string().optional().or(z.literal("")),
  key:          z.enum(PROVIDER_KEYS),
  name:         z.string().min(1).max(120),
  description:  z.string().max(500).optional().or(z.literal("")),
  iconKey:      z.string().max(80).optional().or(z.literal("")),
  defaultType:  z.enum(TYPES).default("SAML"),
  defaultScopesRaw: z.string().max(1000).optional().or(z.literal("")),
  setupDocsUrl: z.string().max(500).optional().or(z.literal("")),
  notes:        z.string().max(2000).optional().or(z.literal("")),
  active:       z.coerce.boolean().optional().default(false),
});

export async function saveProvider(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.active = raw.active === "on" || raw.active === "true" ? "true" : "false";
  const parsed = providerSchema.safeParse(raw);
  if (!parsed.success) redirect(`${ROUTE}?tab=providers&error=invalid`);
  const d = parsed.data;
  const defaultScopes = (d.defaultScopesRaw ?? "")
    .split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const data = {
    key: d.key as SsoProviderKey,
    name: d.name,
    description: d.description || null,
    iconKey: d.iconKey || null,
    defaultType: d.defaultType as SsoConfigType,
    defaultScopes,
    setupDocsUrl: d.setupDocsUrl || null,
    notes: d.notes || null,
    active: d.active,
  };
  if (d.id) {
    await db.ssoProvider.update({ where: { id: d.id }, data });
  } else {
    await db.ssoProvider.upsert({
      where: { key: d.key as SsoProviderKey },
      create: data,
      update: data,
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: d.id ? "platform.sso.provider_updated" : "platform.sso.provider_upserted",
    entityType: "SsoProvider",
    entityId: d.id || d.key,
    metadata: { actor: ctx.email, key: d.key, name: d.name },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=providers&ok=provider-saved`);
}

const providerIdSchema = z.object({ id: z.string().min(1) });
export async function deleteProvider(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = providerIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=providers&error=invalid`);
  // Block delete when configs depend on it.
  const inUse = await db.ssoTenantConfig.count({ where: { providerId: parsed.data.id } });
  if (inUse > 0) {
    redirect(`${ROUTE}?tab=providers&error=${encodeURIComponent(`Provider has ${inUse} active config(s)`)}`);
  }
  await db.ssoProvider.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.provider_deleted",
    entityType: "SsoProvider",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=providers&ok=provider-deleted`);
}

/* ── Templates ─────────────────────────────────────── */

const templateSchema = z.object({
  id:          z.string().optional().or(z.literal("")),
  providerId:  z.string().min(1),
  name:        z.string().min(1).max(120),
  type:        z.enum(TYPES),
  snippet:     z.string().min(1).max(20_000),
  description: z.string().max(500).optional().or(z.literal("")),
});

export async function saveTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=templates&error=invalid`);
  const d = parsed.data;
  if (d.id) {
    await db.ssoIdpTemplate.update({
      where: { id: d.id },
      data: {
        providerId: d.providerId,
        name: d.name,
        type: d.type as SsoConfigType,
        snippet: d.snippet,
        description: d.description || null,
      },
    });
  } else {
    await db.ssoIdpTemplate.create({
      data: {
        providerId: d.providerId,
        name: d.name,
        type: d.type as SsoConfigType,
        snippet: d.snippet,
        description: d.description || null,
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: d.id ? "platform.sso.template_updated" : "platform.sso.template_created",
    entityType: "SsoIdpTemplate",
    entityId: d.id || d.name,
    metadata: { actor: ctx.email, name: d.name, type: d.type },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=templates&ok=template-saved`);
}

export async function deleteTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = providerIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=templates&error=invalid`);
  await db.ssoIdpTemplate.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.template_deleted",
    entityType: "SsoIdpTemplate",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=templates&ok=template-deleted`);
}

/* ── Settings ──────────────────────────────────────── */

const settingsSchema = z.object({
  enforceMfaWithSso:      z.coerce.boolean().optional().default(false),
  idpInitiatedSsoAllowed: z.coerce.boolean().optional().default(false),
  sessionLifetimeHours:   z.coerce.number().int().min(1).max(720).optional(),
  jitDeprovisionEnabled:  z.coerce.boolean().optional().default(false),
});

export async function saveSsoSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["enforceMfaWithSso", "idpInitiatedSsoAllowed", "jitDeprovisionEnabled"]) {
    raw[k] = raw[k] === "on" || raw[k] === "true" ? "true" : "false";
  }
  if (raw.sessionLifetimeHours === "") delete raw.sessionLifetimeHours;
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) redirect(`${ROUTE}?tab=settings&error=invalid`);
  const d = parsed.data;
  await db.ssoSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      enforceMfaWithSso: d.enforceMfaWithSso,
      idpInitiatedSsoAllowed: d.idpInitiatedSsoAllowed,
      sessionLifetimeHours: d.sessionLifetimeHours ?? null,
      jitDeprovisionEnabled: d.jitDeprovisionEnabled,
      updatedById: ctx.userId,
    },
    update: {
      enforceMfaWithSso: d.enforceMfaWithSso,
      idpInitiatedSsoAllowed: d.idpInitiatedSsoAllowed,
      sessionLifetimeHours: d.sessionLifetimeHours ?? null,
      jitDeprovisionEnabled: d.jitDeprovisionEnabled,
      updatedById: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sso.settings_saved",
    entityType: "SsoSettings",
    entityId: "default",
    metadata: { actor: ctx.email, enforceMfa: d.enforceMfaWithSso, jitDeprovision: d.jitDeprovisionEnabled },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Type helpers re-exported ─────────────────────── */
export type ScimOperationLiteral = ScimOperation;
export type ScimStatusLiteral = ScimLogStatus;
