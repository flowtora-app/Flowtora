// Page 66 — Branding & White-Label data layer.

import { db } from "@/lib/db";
import type { PoweredByMode, BrandingChangeKind } from "@prisma/client";

/* ── Labels & palettes ────────────────────────────────── */

export const POWERED_BY_MODE_LABEL: Record<PoweredByMode, string> = {
  ALWAYS_ON:  "Always on",
  ALWAYS_OFF: "Always off (white-label)",
  BY_PLAN:    "By plan",
  BY_PROFILE: "By profile",
};

export const POWERED_BY_MODE_TONE: Record<
  PoweredByMode,
  { bg: string; fg: string }
> = {
  ALWAYS_ON:  { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  ALWAYS_OFF: { bg: "var(--surface-2)",   fg: "var(--text-muted)" },
  BY_PLAN:    { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  BY_PROFILE: { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
};

export const BRANDING_CHANGE_LABEL: Record<BrandingChangeKind, string> = {
  BRAND_SETTINGS:   "Brand settings",
  PROFILE_CREATED:  "Profile created",
  PROFILE_UPDATED:  "Profile updated",
  PROFILE_DELETED:  "Profile deleted",
  PROFILE_APPLIED:  "Profile applied",
  TENANT_BRANDING:  "Tenant branding",
  POWERED_BY:       "Powered-by policy",
  EMAIL_FOOTER:     "Email footer",
  LOGIN_PAGE:       "Login page",
};

export const BRANDING_CHANGE_TONE: Record<
  BrandingChangeKind,
  { bg: string; fg: string }
> = {
  BRAND_SETTINGS:  { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  PROFILE_CREATED: { bg: "var(--emerald-100)", fg: "var(--emerald-700)" },
  PROFILE_UPDATED: { bg: "var(--sky-100)",     fg: "var(--sky-700)" },
  PROFILE_DELETED: { bg: "var(--rose-100)",    fg: "var(--rose-700)" },
  PROFILE_APPLIED: { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
  TENANT_BRANDING: { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
  POWERED_BY:      { bg: "var(--surface-2)",   fg: "var(--text-default)" },
  EMAIL_FOOTER:    { bg: "var(--violet-100)",  fg: "var(--violet-700)" },
  LOGIN_PAGE:      { bg: "var(--amber-100)",   fg: "var(--amber-700)" },
};

export const ALLOWED_GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Source Sans Pro", "Raleway", "Nunito", "Plus Jakarta Sans",
  "DM Sans", "Manrope", "Outfit", "Public Sans", "Work Sans",
];

export const POWERED_BY_VARIANTS = [
  "default",
  "minimal",
  "footer-only",
  "tagline",
];

/* ── Types ────────────────────────────────────────────── */

export interface SocialLinks {
  twitter?: string;
  linkedin?: string;
  github?: string;
  instagram?: string;
  youtube?: string;
}

export interface SocialProofItem {
  name: string;
  role: string;
  quote: string;
  avatarUrl?: string;
}

export function parseSocialLinks(raw: unknown): SocialLinks {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SocialLinks = {};
  for (const k of ["twitter", "linkedin", "github", "instagram", "youtube"] as const) {
    if (typeof r[k] === "string") out[k] = r[k] as string;
  }
  return out;
}

export function parseSocialProof(raw: unknown): SocialProofItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is SocialProofItem =>
    x && typeof x === "object" && typeof x.name === "string" && typeof x.role === "string" && typeof x.quote === "string",
  );
}

/* ── Loaders ──────────────────────────────────────────── */

export async function loadBrandSettings() {
  let row = await db.brandSettings.findUnique({ where: { id: "default" } });
  if (!row) row = await db.brandSettings.create({ data: { id: "default" } });
  return row;
}

export async function loadProfiles() {
  return db.whiteLabelProfile.findMany({
    orderBy: [{ isDefault: "desc" }, { active: "desc" }, { name: "asc" }],
    include: {
      resellerTenant: { select: { id: true, name: true, slug: true } },
      _count: { select: { tenants: true } },
    },
  });
}

export async function loadProfileDetail(id: string) {
  return db.whiteLabelProfile.findUnique({
    where: { id },
    include: {
      resellerTenant: { select: { id: true, name: true, slug: true } },
      tenants: {
        include: { tenant: { select: { id: true, name: true, slug: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
}

export async function loadTenantBrandings() {
  return db.tenantBranding.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      tenant:  { select: { id: true, name: true, slug: true, plan: true } },
      profile: { select: { id: true, name: true, key: true } },
    },
  });
}

export async function loadBrandingChanges(limit = 60) {
  return db.brandingChange.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function loadAllTenants() {
  return db.tenant.findMany({
    select: { id: true, name: true, slug: true, plan: true },
    orderBy: { name: "asc" },
  });
}

/* ── KPIs ─────────────────────────────────────────────── */

export interface BrandingKpis {
  totalProfiles: number;
  activeProfiles: number;
  resellerProfiles: number;
  brandedTenants: number;
  defaultTenants: number;
  poweredByMode: PoweredByMode;
  whiteLabelTenants: number;
}

export async function loadBrandingKpis(): Promise<BrandingKpis> {
  const [profiles, tenantsCount, brandings, settings] = await Promise.all([
    db.whiteLabelProfile.findMany({ select: { active: true, resellerTenantId: true, removeFlowtoraMentions: true, _count: { select: { tenants: true } } } }),
    db.tenant.count(),
    db.tenantBranding.findMany({ select: { profileId: true, profile: { select: { removeFlowtoraMentions: true } } } }),
    loadBrandSettings(),
  ]);
  const totalProfiles    = profiles.length;
  const activeProfiles   = profiles.filter((p) => p.active).length;
  const resellerProfiles = profiles.filter((p) => p.resellerTenantId).length;
  const brandedTenants   = brandings.filter((b) => b.profileId).length;
  const whiteLabelTenants = brandings.filter((b) => b.profile?.removeFlowtoraMentions).length;
  return {
    totalProfiles,
    activeProfiles,
    resellerProfiles,
    brandedTenants,
    defaultTenants: tenantsCount - brandedTenants,
    poweredByMode: settings.poweredByMode,
    whiteLabelTenants,
  };
}

/* ── Helpers ──────────────────────────────────────────── */

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

/* ── Aggregate page loader ────────────────────────────── */

export async function loadBrandingPage() {
  const [kpis, brandSettings, profiles, tenantBrandings, changes, allTenants] = await Promise.all([
    loadBrandingKpis(),
    loadBrandSettings(),
    loadProfiles(),
    loadTenantBrandings(),
    loadBrandingChanges(60),
    loadAllTenants(),
  ]);
  return { kpis, brandSettings, profiles, tenantBrandings, changes, allTenants };
}
