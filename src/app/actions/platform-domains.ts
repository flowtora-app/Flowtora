"use server";

// Page 70 — Domain Management server actions.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  CustomDomainStatus,
  CustomDomainType,
  SslIssuer,
  AcmeChallengeType,
} from "@prisma/client";

const ROUTE = "/platform/settings/domains";
const PERM_MANAGE = "domains.manage" as const;
const PERM_VERIFY = "domains.verify" as const;

const TYPES = ["APEX", "SUBDOMAIN"] as const;
const STATUSES = ["PENDING_DNS", "VERIFYING", "ISSUING_SSL", "ACTIVE", "EXPIRING", "FAILED", "DISABLED"] as const;
const ISSUERS = ["LETS_ENCRYPT", "ZEROSSL", "GOOGLE_TRUST_SERVICES", "CUSTOM_UPLOAD"] as const;
const CHALLENGES = ["HTTP_01", "DNS_01"] as const;

/* ── Domain CRUD ───────────────────────────────────────── */

const domainSchema = z.object({
  id:                z.string().optional(),
  tenantId:          z.string().min(1, "Tenant required"),
  domain:            z.string().min(3).max(253)
                       .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, "Must be a fully-qualified domain name"),
  type:              z.enum(TYPES),
  isPrimary:         z.union([z.literal("on"), z.literal("")]).optional(),
  dnsRecordType:     z.string().max(20),
  dnsRecordValue:    z.string().min(1).max(400),
  sslIssuer:         z.enum(ISSUERS),
  acmeChallenge:     z.enum(CHALLENGES),
  sanList:           z.string().max(1000).optional(),
  forceHttps:        z.union([z.literal("on"), z.literal("")]).optional(),
  hstsEnabled:       z.union([z.literal("on"), z.literal("")]).optional(),
  hstsPreload:       z.union([z.literal("on"), z.literal("")]).optional(),
  redirectFromWww:   z.union([z.literal("on"), z.literal("")]).optional(),
  notes:             z.string().max(2000).optional(),
});

export async function saveDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = domainSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=domains&error=${msg}#domains`);
  }
  const d = parsed.data;
  const sanList = (d.sanList ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const isPrimary = d.isPrimary === "on";
  // If marked primary, unset other primaries for this tenant.
  if (isPrimary) {
    await db.customDomain.updateMany({
      where: { tenantId: d.tenantId, isPrimary: true, ...(d.id ? { NOT: { id: d.id } } : {}) },
      data: { isPrimary: false },
    });
  }
  const data = {
    tenantId: d.tenantId,
    domain: d.domain.toLowerCase(),
    type: d.type as CustomDomainType,
    isPrimary,
    dnsRecordType: d.dnsRecordType,
    dnsRecordValue: d.dnsRecordValue,
    sslIssuer: d.sslIssuer as SslIssuer,
    acmeChallenge: d.acmeChallenge as AcmeChallengeType,
    sanList,
    forceHttps: d.forceHttps === "on",
    hstsEnabled: d.hstsEnabled === "on",
    hstsPreload: d.hstsPreload === "on",
    redirectFromWww: d.redirectFromWww === "on",
    notes: d.notes || null,
  };
  let row;
  if (d.id) {
    row = await db.customDomain.update({ where: { id: d.id }, data });
  } else {
    row = await db.customDomain.create({
      data: {
        ...data,
        status: "PENDING_DNS",
        verificationToken: randomBytes(16).toString("hex"),
      },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.domains.saved",
    entityType: "CustomDomain",
    entityId: row.id,
    metadata: { actor: ctx.email, domain: d.domain, tenantId: d.tenantId },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=domains&domain=${encodeURIComponent(row.domain)}&ok=domain-saved#domains`);
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=domains&error=Invalid#domains`);
  const row = await db.customDomain.findUnique({ where: { id: parsed.data.id } });
  await db.customDomain.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.deleted",
    entityType: "CustomDomain", entityId: parsed.data.id,
    metadata: { actor: ctx.email, domain: row?.domain },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=domains&ok=domain-deleted#domains`);
}

/* ── Re-verify DNS ────────────────────────────────────── */

export async function reverifyDomain(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_VERIFY);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid#domains`);
  // Simulated verification: in real life we'd run a DNS resolver lookup
  // for the expected record. Here we flip state forward by one step.
  const row = await db.customDomain.findUnique({ where: { id: parsed.data.id } });
  if (!row) redirect(`${ROUTE}?error=${encodeURIComponent("Not found")}#domains`);
  let nextStatus: CustomDomainStatus = row!.status;
  let dnsVerified = row!.dnsVerified;
  let verifiedAt = row!.verifiedAt;
  if (row!.status === "PENDING_DNS" || row!.status === "VERIFYING") {
    // Assume verification succeeded (in production: real DNS check).
    nextStatus = row!.dnsVerified ? "ISSUING_SSL" : "VERIFYING";
    dnsVerified = true;
    verifiedAt  = new Date();
  } else if (row!.status === "FAILED") {
    nextStatus = "VERIFYING";
  }
  await db.customDomain.update({
    where: { id: parsed.data.id },
    data: { status: nextStatus, dnsVerified, verifiedAt, dnsLastCheckedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.reverified",
    entityType: "CustomDomain", entityId: parsed.data.id,
    metadata: { actor: ctx.email, domain: row!.domain, nextStatus },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=domains&domain=${encodeURIComponent(row!.domain)}&ok=reverified#domains`);
}

/* ── Reissue SSL certificate ───────────────────────────── */

export async function reissueCert(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid#certs`);
  const row = await db.customDomain.findUnique({ where: { id: parsed.data.id } });
  if (!row) redirect(`${ROUTE}?error=${encodeURIComponent("Not found")}#certs`);
  // Retire existing active certs for this domain.
  await db.customDomainCert.updateMany({
    where: { domainId: parsed.data.id, status: "ACTIVE" },
    data: { status: "REVOKED", retiredAt: new Date() },
  });
  // Mint a new cert row (simulated — production: kick off ACME flow).
  const now = new Date();
  await db.customDomainCert.create({
    data: {
      domainId: parsed.data.id,
      issuer: row!.sslIssuer,
      status: "ACTIVE",
      commonName: row!.domain,
      sanList: row!.sanList.length > 0 ? row!.sanList : [row!.domain],
      fingerprint: `sha256:${randomBytes(16).toString("hex")}`,
      serialNumber: randomBytes(8).toString("hex").toUpperCase(),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 90 * 86_400_000),
      renewalLog: "Manual reissue — ACME challenge passed in 8s",
    },
  });
  await db.customDomain.update({
    where: { id: parsed.data.id },
    data: {
      sslLastRenewedAt: now,
      sslExpiresAt: new Date(now.getTime() + 90 * 86_400_000),
      status: "ACTIVE",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.cert_reissued",
    entityType: "CustomDomain", entityId: parsed.data.id,
    metadata: { actor: ctx.email, domain: row!.domain },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=certs&ok=cert-reissued#certs`);
}

/* ── Toggle disabled ───────────────────────────────────── */

export async function toggleDomainDisabled(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=Invalid#domains`);
  const row = await db.customDomain.findUnique({ where: { id: parsed.data.id } });
  if (!row) redirect(`${ROUTE}?error=${encodeURIComponent("Not found")}#domains`);
  const nextStatus: CustomDomainStatus = row!.status === "DISABLED" ? "PENDING_DNS" : "DISABLED";
  await db.customDomain.update({ where: { id: parsed.data.id }, data: { status: nextStatus } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.toggle_disabled",
    entityType: "CustomDomain", entityId: parsed.data.id,
    metadata: { actor: ctx.email, domain: row!.domain, status: nextStatus },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=domains&ok=disabled-toggled#domains`);
}

/* ── DNS Template CRUD ────────────────────────────────── */

const dnsTemplateSchema = z.object({
  id:              z.string().optional(),
  key:             z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "Use lower-case letters, digits, hyphens"),
  label:           z.string().min(1).max(120),
  description:     z.string().min(1).max(2000),
  recordType:      z.string().min(1).max(20),
  hostnamePattern: z.string().min(1).max(200),
  valuePattern:    z.string().min(1).max(400),
  envScope:        z.string().max(40).optional(),
  sortOrder:       z.coerce.number().int().min(0).max(1000),
});

export async function saveDnsTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = dnsTemplateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=dns&error=${msg}#dns`);
  }
  const d = parsed.data;
  const data = {
    label: d.label, description: d.description,
    recordType: d.recordType,
    hostnamePattern: d.hostnamePattern, valuePattern: d.valuePattern,
    envScope: d.envScope || null,
    sortOrder: d.sortOrder,
  };
  const row = await db.dnsTemplate.upsert({
    where: { key: d.key },
    create: { key: d.key, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.dns_template_saved",
    entityType: "DnsTemplate", entityId: row.id,
    metadata: { actor: ctx.email, key: d.key },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=dns&ok=template-saved#dns`);
}

export async function deleteDnsTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=dns&error=Invalid#dns`);
  await db.dnsTemplate.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.dns_template_deleted",
    entityType: "DnsTemplate", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=dns&ok=template-deleted#dns`);
}

/* ── Apex guide CRUD ──────────────────────────────────── */

const apexSchema = z.object({
  id:           z.string().optional(),
  providerKey:  z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "lowercase + hyphens"),
  providerName: z.string().min(1).max(120),
  bodyMarkdown: z.string().min(1).max(8000),
  supportsAlias: z.union([z.literal("on"), z.literal("")]).optional(),
  sortOrder:    z.coerce.number().int().min(0).max(1000),
});

export async function saveApexGuide(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = apexSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=apex&error=${msg}#apex`);
  }
  const d = parsed.data;
  const data = {
    providerName: d.providerName,
    bodyMarkdown: d.bodyMarkdown,
    supportsAlias: d.supportsAlias === "on",
    sortOrder: d.sortOrder,
  };
  const row = await db.apexSetupGuide.upsert({
    where: { providerKey: d.providerKey },
    create: { providerKey: d.providerKey, ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.apex_guide_saved",
    entityType: "ApexSetupGuide", entityId: row.id,
    metadata: { actor: ctx.email, providerKey: d.providerKey },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=apex&ok=guide-saved#apex`);
}

export async function deleteApexGuide(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=apex&error=Invalid#apex`);
  await db.apexSetupGuide.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.apex_guide_deleted",
    entityType: "ApexSetupGuide", entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=apex&ok=guide-deleted#apex`);
}

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  defaultIssuer:     z.enum(ISSUERS),
  acmeAccountEmail:  z.string().email(),
  caFallbackList:    z.string().max(500).optional(),
  hstsDefaultMaxAge: z.coerce.number().int().min(0).max(63072000),
  hstsDefaultPreload: z.union([z.literal("on"), z.literal("")]).optional(),
  certRevocationProcedure: z.string().max(4000).optional(),
  notes:             z.string().max(2000).optional(),
});

export async function saveDomainSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=settings&error=${msg}#settings`);
  }
  const d = parsed.data;
  const caFallback = (d.caFallbackList ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const data = {
    defaultIssuer: d.defaultIssuer as SslIssuer,
    acmeAccountEmail: d.acmeAccountEmail,
    caFallbackList: caFallback,
    hstsDefaultMaxAge: d.hstsDefaultMaxAge,
    hstsDefaultPreload: d.hstsDefaultPreload === "on",
    certRevocationProcedure: d.certRevocationProcedure || null,
    notes: d.notes || null,
    updatedById: ctx.userId,
  };
  await db.domainSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.domains.settings_saved",
    entityType: "DomainSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=settings-saved#settings`);
}
