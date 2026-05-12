"use server";

// Page 66 — Branding & White-Label actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type { PoweredByMode } from "@prisma/client";

const ROUTE = "/platform/settings/branding";
const PERM_MANAGE        = "branding.manage" as const;
const PERM_TENANT_MANAGE = "branding.tenant_manage" as const;

const POWERED_BY_MODES = ["ALWAYS_ON", "ALWAYS_OFF", "BY_PLAN", "BY_PROFILE"] as const;

async function ensureBrandSettings() {
  const row = await db.brandSettings.findUnique({ where: { id: "default" } });
  if (row) return row;
  return db.brandSettings.create({ data: { id: "default" } });
}

async function audit(args: {
  kind: "BRAND_SETTINGS" | "PROFILE_CREATED" | "PROFILE_UPDATED" | "PROFILE_DELETED" | "PROFILE_APPLIED" | "TENANT_BRANDING" | "POWERED_BY" | "EMAIL_FOOTER" | "LOGIN_PAGE";
  entityId?: string;
  entityLabel?: string;
  actorEmail: string;
  summary: string;
  changedFields?: string[];
  diff?: unknown;
}) {
  await db.brandingChange.create({
    data: {
      kind: args.kind,
      entityId: args.entityId ?? null,
      entityLabel: args.entityLabel ?? null,
      actorEmail: args.actorEmail,
      summary: args.summary,
      changedFields: args.changedFields ?? [],
      diffJson: args.diff as never ?? null,
    },
  });
}

/* ── Brand Settings (Flowtora) ────────────────────────── */

const brandSchema = z.object({
  logoFullColorUrl:  z.string().url().or(z.literal("")).optional(),
  logoMonochromeUrl: z.string().url().or(z.literal("")).optional(),
  faviconUrl:        z.string().url().or(z.literal("")).optional(),
  socialCardUrl:     z.string().url().or(z.literal("")).optional(),
  appIconUrl:        z.string().url().or(z.literal("")).optional(),
  primaryColor:      z.string().min(3).max(20),
  accentColor:       z.string().min(3).max(20),
  backgroundColor:   z.string().min(3).max(20),
  textColor:         z.string().min(3).max(20),
  primaryFont:       z.string().min(1).max(60),
  headingFont:       z.string().min(1).max(60),
  bodyFont:          z.string().min(1).max(60),
  brandKitZipUrl:    z.string().url().or(z.literal("")).optional(),
  brandGuidelinesUrl: z.string().url().or(z.literal("")).optional(),
  notes:             z.string().max(1000).optional(),
});

export async function saveBrand(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = brandSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}#brand`);
  }
  const d = parsed.data;
  const data = {
    logoFullColorUrl:  d.logoFullColorUrl  || null,
    logoMonochromeUrl: d.logoMonochromeUrl || null,
    faviconUrl:        d.faviconUrl        || null,
    socialCardUrl:     d.socialCardUrl     || null,
    appIconUrl:        d.appIconUrl        || null,
    primaryColor:      d.primaryColor,
    accentColor:       d.accentColor,
    backgroundColor:   d.backgroundColor,
    textColor:         d.textColor,
    primaryFont:       d.primaryFont,
    headingFont:       d.headingFont,
    bodyFont:          d.bodyFont,
    brandKitZipUrl:    d.brandKitZipUrl    || null,
    brandGuidelinesUrl: d.brandGuidelinesUrl || null,
    notes:             d.notes || null,
    updatedByEmail:    ctx.email ?? null,
  };
  await ensureBrandSettings();
  await db.brandSettings.update({ where: { id: "default" }, data });
  await audit({ kind: "BRAND_SETTINGS", actorEmail: ctx.email ?? "platform",
    summary: "Updated Flowtora brand", entityLabel: "Flowtora Brand" });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.branding.brand_saved",
    entityType: "BrandSettings", entityId: "default",
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=brand-saved#brand`);
}

/* ── Email Footer ─────────────────────────────────────── */

const emailFooterSchema = z.object({
  emailFooterMjml: z.string().max(20000).optional(),
  emailFooterHtml: z.string().max(60000).optional(),
});

export async function saveEmailFooter(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = emailFooterSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=email-footer&error=Invalid#email-footer`);
  await ensureBrandSettings();
  await db.brandSettings.update({
    where: { id: "default" },
    data: {
      emailFooterMjml: parsed.data.emailFooterMjml || null,
      emailFooterHtml: parsed.data.emailFooterHtml || null,
      updatedByEmail: ctx.email ?? null,
    },
  });
  await audit({ kind: "EMAIL_FOOTER", actorEmail: ctx.email ?? "platform",
    summary: "Updated email footer template", entityLabel: "Email Footer" });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=email-footer&ok=footer-saved#email-footer`);
}

/* ── Login Pages defaults ─────────────────────────────── */

const loginPageSchema = z.object({
  loginHeroImageUrl:       z.string().url().or(z.literal("")).optional(),
  loginHeadline:           z.string().max(200).optional(),
  loginSubtext:            z.string().max(500).optional(),
  loginBackgroundColor:    z.string().max(20).optional(),
  loginBackgroundImageUrl: z.string().url().or(z.literal("")).optional(),
  loginCtaText:            z.string().max(60).optional(),
  loginMarketingCopy:      z.string().max(2000).optional(),
  loginSocialProofJson:    z.string().max(8000).optional(),
});

export async function saveLoginPage(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = loginPageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=login-pages&error=${msg}#login-pages`);
  }
  const d = parsed.data;
  let social: unknown = [];
  if (d.loginSocialProofJson && d.loginSocialProofJson.trim()) {
    try { social = JSON.parse(d.loginSocialProofJson); }
    catch { redirect(`${ROUTE}?tab=login-pages&error=${encodeURIComponent("Invalid social proof JSON")}#login-pages`); }
  }
  await ensureBrandSettings();
  await db.brandSettings.update({
    where: { id: "default" },
    data: {
      loginHeroImageUrl:       d.loginHeroImageUrl       || null,
      loginHeadline:           d.loginHeadline           || null,
      loginSubtext:            d.loginSubtext            || null,
      loginBackgroundColor:    d.loginBackgroundColor    || null,
      loginBackgroundImageUrl: d.loginBackgroundImageUrl || null,
      loginCtaText:            d.loginCtaText            || null,
      loginMarketingCopy:      d.loginMarketingCopy      || null,
      loginSocialProofJson:    social as never,
      updatedByEmail: ctx.email ?? null,
    },
  });
  await audit({ kind: "LOGIN_PAGE", actorEmail: ctx.email ?? "platform",
    summary: "Updated default login page template", entityLabel: "Login Page Default" });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=login-pages&ok=login-saved#login-pages`);
}

/* ── Powered-By ───────────────────────────────────────── */

const poweredBySchema = z.object({
  poweredByMode:         z.enum(POWERED_BY_MODES),
  poweredByEnabledPlans: z.string().max(500).optional(),
  poweredByBadgeVariant: z.string().max(40),
});

export async function savePoweredBy(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = poweredBySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=powered-by&error=${msg}#powered-by`);
  }
  const d = parsed.data;
  const plans = (d.poweredByEnabledPlans ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  await ensureBrandSettings();
  await db.brandSettings.update({
    where: { id: "default" },
    data: {
      poweredByMode: d.poweredByMode as PoweredByMode,
      poweredByEnabledPlans: plans,
      poweredByBadgeVariant: d.poweredByBadgeVariant,
      updatedByEmail: ctx.email ?? null,
    },
  });
  await audit({ kind: "POWERED_BY", actorEmail: ctx.email ?? "platform",
    summary: `Powered-By → ${d.poweredByMode}`, entityLabel: "Powered-By policy" });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.branding.powered_by_saved",
    entityType: "BrandSettings", entityId: "default",
    metadata: { actor: ctx.email, mode: d.poweredByMode },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=powered-by&ok=powered-by-saved#powered-by`);
}

/* ── White-Label Profile ──────────────────────────────── */

const profileSchema = z.object({
  id:               z.string().optional(),
  key:              z.string().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase + hyphens"),
  name:             z.string().min(1).max(120),
  description:      z.string().max(500).optional(),
  resellerTenantId: z.string().optional(),
  logoLightUrl:     z.string().url().or(z.literal("")).optional(),
  logoDarkUrl:      z.string().url().or(z.literal("")).optional(),
  faviconUrl:       z.string().url().or(z.literal("")).optional(),
  emailLogoUrl:     z.string().url().or(z.literal("")).optional(),
  pwaFaviconUrl:    z.string().url().or(z.literal("")).optional(),
  primaryColor:     z.string().min(3).max(20),
  accentColor:      z.string().min(3).max(20),
  backgroundColor:  z.string().min(3).max(20),
  textColor:        z.string().min(3).max(20),
  primaryFont:      z.string().min(1).max(60),
  headingFont:      z.string().min(1).max(60),
  customDomain:     z.string().max(200).optional(),
  subdomain:        z.string().max(100).optional(),
  loginUrlSlug:     z.string().max(60).optional(),
  emailFromName:    z.string().max(80).optional(),
  emailFromDomain:  z.string().max(120).optional(),
  footerText:       z.string().max(500).optional(),
  socialLinksJson:  z.string().max(2000).optional(),
  loginHeadline:    z.string().max(160).optional(),
  loginSubtext:     z.string().max(400).optional(),
  loginBackgroundColor: z.string().max(20).optional(),
  loginBackgroundImageUrl: z.string().url().or(z.literal("")).optional(),
  loginCtaText:     z.string().max(60).optional(),
  loginMarketingCopy: z.string().max(2000).optional(),
  removeFlowtoraMentions: z.union([z.literal("on"), z.literal("")]).optional(),
  smsSenderName:    z.string().max(11).optional(),
  active:           z.union([z.literal("on"), z.literal("")]).optional(),
});

export async function saveProfile(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=profiles&error=${msg}#profiles`);
  }
  const d = parsed.data;
  let socialLinks: unknown = null;
  if (d.socialLinksJson && d.socialLinksJson.trim()) {
    try { socialLinks = JSON.parse(d.socialLinksJson); }
    catch { redirect(`${ROUTE}?tab=profiles&error=${encodeURIComponent("Invalid social links JSON")}#profiles`); }
  }
  const data = {
    name: d.name,
    description: d.description || null,
    resellerTenantId: d.resellerTenantId || null,
    logoLightUrl: d.logoLightUrl || null,
    logoDarkUrl:  d.logoDarkUrl  || null,
    faviconUrl:   d.faviconUrl   || null,
    emailLogoUrl: d.emailLogoUrl || null,
    pwaFaviconUrl: d.pwaFaviconUrl || null,
    primaryColor: d.primaryColor,
    accentColor:  d.accentColor,
    backgroundColor: d.backgroundColor,
    textColor:    d.textColor,
    primaryFont:  d.primaryFont,
    headingFont:  d.headingFont,
    customDomain: d.customDomain || null,
    subdomain:    d.subdomain    || null,
    loginUrlSlug: d.loginUrlSlug || null,
    emailFromName:   d.emailFromName   || null,
    emailFromDomain: d.emailFromDomain || null,
    footerText:      d.footerText || null,
    socialLinksJson: socialLinks as never,
    loginHeadline:   d.loginHeadline || null,
    loginSubtext:    d.loginSubtext  || null,
    loginBackgroundColor:    d.loginBackgroundColor || null,
    loginBackgroundImageUrl: d.loginBackgroundImageUrl || null,
    loginCtaText:    d.loginCtaText || null,
    loginMarketingCopy: d.loginMarketingCopy || null,
    removeFlowtoraMentions: d.removeFlowtoraMentions === "on",
    smsSenderName: d.smsSenderName || null,
    active: d.active === "on",
  };
  // Validate: removeFlowtoraMentions requires resellerTenantId (Enterprise reseller)
  if (data.removeFlowtoraMentions && !data.resellerTenantId) {
    redirect(`${ROUTE}?tab=profiles&error=${encodeURIComponent("Removing Flowtora mentions requires a reseller tenant")}#profiles`);
  }
  const existing = await db.whiteLabelProfile.findUnique({ where: { key: d.key } });
  const row = await db.whiteLabelProfile.upsert({
    where: { key: d.key },
    create: { key: d.key, ...data },
    update: data,
  });
  await audit({
    kind: existing ? "PROFILE_UPDATED" : "PROFILE_CREATED",
    entityId: row.id, entityLabel: row.name,
    actorEmail: ctx.email ?? "platform",
    summary: existing ? `Updated profile ${row.name}` : `Created profile ${row.name}`,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.branding.profile_saved",
    entityType: "WhiteLabelProfile", entityId: row.id,
    metadata: { actor: ctx.email, key: d.key, created: !existing },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=profiles&profile=${row.key}&ok=profile-saved#profiles`);
}

const idSchema = z.object({ id: z.string().min(1) });

export async function deleteProfile(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_MANAGE);
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=profiles&error=Invalid#profiles`);
  const row = await db.whiteLabelProfile.findUnique({
    where: { id: parsed.data.id },
    include: { _count: { select: { tenants: true } } },
  });
  if (!row) redirect(`${ROUTE}?tab=profiles&error=Not%20found#profiles`);
  if (row.isDefault) {
    redirect(`${ROUTE}?tab=profiles&error=${encodeURIComponent("Cannot delete the default profile")}#profiles`);
  }
  if (row._count.tenants > 0) {
    redirect(`${ROUTE}?tab=profiles&error=${encodeURIComponent(`Cannot delete — ${row._count.tenants} tenant(s) still applied`)}#profiles`);
  }
  await db.whiteLabelProfile.delete({ where: { id: parsed.data.id } });
  await audit({ kind: "PROFILE_DELETED", entityId: row.id, entityLabel: row.name,
    actorEmail: ctx.email ?? "platform",
    summary: `Deleted profile ${row.name}` });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.branding.profile_deleted",
    entityType: "WhiteLabelProfile", entityId: row.id,
    metadata: { actor: ctx.email, key: row.key },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=profiles&ok=profile-deleted#profiles`);
}

/* ── Apply profile to tenant ──────────────────────────── */

const applySchema = z.object({
  tenantId:  z.string().min(1),
  profileId: z.string().optional(),
  primaryColorOverride:  z.string().max(20).optional(),
  accentColorOverride:   z.string().max(20).optional(),
  logoOverrideUrl:       z.string().url().or(z.literal("")).optional(),
  loginHeadlineOverride: z.string().max(200).optional(),
  poweredByEnabled:      z.enum(["follow", "on", "off"]).optional(),
});

export async function applyProfileToTenant(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TENANT_MANAGE);
  const parsed = applySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?tab=tenants&error=${msg}#tenants`);
  }
  const d = parsed.data;
  const hasOverrides = !!(d.primaryColorOverride || d.accentColorOverride || d.logoOverrideUrl || d.loginHeadlineOverride);
  const poweredByEnabled =
    d.poweredByEnabled === "on"  ? true  :
    d.poweredByEnabled === "off" ? false :
    null;
  const data = {
    tenantId: d.tenantId,
    profileId: d.profileId || null,
    hasCustomOverrides: hasOverrides,
    primaryColorOverride: d.primaryColorOverride || null,
    accentColorOverride:  d.accentColorOverride  || null,
    logoOverrideUrl:      d.logoOverrideUrl      || null,
    loginHeadlineOverride: d.loginHeadlineOverride || null,
    poweredByEnabled,
    lastEditByEmail: ctx.email ?? null,
    lastEditAt: new Date(),
  };
  await db.tenantBranding.upsert({
    where: { tenantId: d.tenantId },
    create: data,
    update: data,
  });
  const tenant  = await db.tenant.findUnique({ where: { id: d.tenantId },  select: { name: true } });
  const profile = d.profileId ? await db.whiteLabelProfile.findUnique({ where: { id: d.profileId }, select: { name: true } }) : null;
  await audit({
    kind: "PROFILE_APPLIED",
    entityId: d.tenantId,
    entityLabel: tenant?.name ?? d.tenantId,
    actorEmail: ctx.email ?? "platform",
    summary: profile
      ? `Applied profile "${profile.name}" to ${tenant?.name ?? "tenant"}${hasOverrides ? " (with overrides)" : ""}`
      : `Removed branding profile from ${tenant?.name ?? "tenant"}`,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.branding.profile_applied",
    entityType: "TenantBranding", entityId: d.tenantId,
    metadata: { actor: ctx.email, profile: profile?.name ?? null, overrides: hasOverrides },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenants&ok=applied#tenants`);
}

const tenantIdSchema = z.object({ tenantId: z.string().min(1) });

export async function revertTenantBranding(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM_TENANT_MANAGE);
  const parsed = tenantIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=tenants&error=Invalid#tenants`);
  const tenant = await db.tenant.findUnique({ where: { id: parsed.data.tenantId }, select: { name: true } });
  await db.tenantBranding.delete({ where: { tenantId: parsed.data.tenantId } }).catch(() => null);
  await audit({
    kind: "TENANT_BRANDING",
    entityId: parsed.data.tenantId,
    entityLabel: tenant?.name ?? parsed.data.tenantId,
    actorEmail: ctx.email ?? "platform",
    summary: `Force-reverted ${tenant?.name ?? "tenant"} to default branding`,
  });
  await logPlatformAudit({
    userId: ctx.userId, action: "platform.branding.tenant_reverted",
    entityType: "TenantBranding", entityId: parsed.data.tenantId,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=tenants&ok=reverted#tenants`);
}
