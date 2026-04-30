"use server";

// Manual provisioning + CSV import server actions for the Page 4
// Tenants list. Both paths converge on the same `provisionTenant`
// helper that creates the Tenant + OWNER User + Membership and emits
// the relevant audit + subscription events.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { BusinessType, Plan, Prisma, TenantSource } from "@prisma/client";
import { db } from "@/lib/db";
import { isReservedSlug, slugify } from "@/lib/slug";
import { logAudit } from "@/lib/audit";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import { recordTenantCreated } from "@/server/billing/subscription-events";

const PLANS = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"] as const;
const SOURCES = ["ORGANIC", "REFERRAL", "PAID", "PARTNER", "OTHER"] as const;
const INDUSTRIES = [
  "SIGN_SHOP", "PRINT_SHOP", "HYBRID", "APPAREL_SCREEN_PRINT",
  "EMBROIDERY", "PROMO_PRODUCTS", "TRADE_PRINTER",
  "WIDE_FORMAT_ONLY", "MULTI_DISCIPLINE", "OTHER",
] as const;

const provisionSchema = z.object({
  shopName:    z.string().min(1).max(120),
  slug:        z.string().min(2).max(40),
  ownerName:   z.string().min(1).max(120),
  ownerEmail:  z.string().email().max(254),
  /** Optional bootstrap password. When omitted we send an invite
   *  email with a one-time link. Today we generate a placeholder
   *  password and bcrypt it; the owner can reset on first login. */
  ownerPassword: z.string().min(8).max(200).optional(),
  plan:        z.enum(PLANS).default("STARTER"),
  status:      z.enum(["TRIAL", "ACTIVE"]).default("TRIAL"),
  trialDays:   z.coerce.number().int().min(0).max(365).default(14),
  country:     z.string().max(120).optional(),
  industry:    z.enum(INDUSTRIES).optional(),
  source:      z.enum(SOURCES).default("ORGANIC"),
  notes:       z.string().max(2_000).optional(),
});

export interface ProvisionResult {
  ok: true;
  tenantId: string;
  tenantSlug: string;
  ownerEmail: string;
  /** True when the email already existed in the User table — we
   *  attach the new tenant as an additional membership instead of
   *  creating a new User. */
  reusedExistingUser: boolean;
}

export interface ProvisionFailure { ok: false; error: string }

/** Internal helper used by both the wizard form and the CSV import.
 *  Idempotent on slug — caller must ensure uniqueness. */
async function provisionTenantInner(
  args: z.infer<typeof provisionSchema>,
  actor: { userId: string; email: string },
): Promise<ProvisionResult | ProvisionFailure> {
  const slug = slugify(args.slug);
  if (isReservedSlug(slug) || slug.length < 2) {
    return { ok: false, error: `Reserved or invalid slug: ${slug}` };
  }

  // Slug uniqueness is a hard constraint at the DB level too, but we
  // pre-check so we can return a helpful per-row error during CSV import.
  const slugExists = await db.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (slugExists) {
    return { ok: false, error: `Slug already taken: ${slug}` };
  }

  const trialEndsAt = args.status === "TRIAL"
    ? new Date(Date.now() + args.trialDays * 24 * 60 * 60 * 1000)
    : null;

  // Reuse existing user if email matches; otherwise create.
  const existing = await db.user.findUnique({
    where: { email: args.ownerEmail },
    select: { id: true, email: true, name: true },
  });
  let userId: string;
  let reused = false;
  if (existing) {
    reused = true;
    userId = existing.id;
  } else {
    // Generate a placeholder password — the owner can reset via the
    // standard "forgot password" flow on first sign-in.
    const placeholder = args.ownerPassword ?? generatePlaceholderPassword();
    const hash = await bcrypt.hash(placeholder, 12);
    const user = await db.user.create({
      data: { email: args.ownerEmail, name: args.ownerName, passwordHash: hash },
      select: { id: true },
    });
    userId = user.id;
  }

  const tenant = await db.tenant.create({
    data: {
      slug,
      name: args.shopName,
      status: args.status,
      plan: args.plan as Plan,
      trialEndsAt,
      country: args.country ?? null,
      businessType: (args.industry as BusinessType | undefined) ?? null,
      signupSource: args.source as TenantSource,
      notes: args.notes ?? null,
    },
    select: { id: true, slug: true, plan: true, status: true, createdAt: true },
  });
  await db.membership.create({
    data: { userId, tenantId: tenant.id, role: "OWNER" },
  });

  await logAudit({
    tenantId: tenant.id,
    userId,
    action: "tenant.created",
    entityType: "Tenant",
    entityId: tenant.id,
    metadata: { provisionedBy: actor.email, source: "manual_admin" },
  });
  await recordTenantCreated({
    tenantId: tenant.id,
    plan: tenant.plan,
    isTrial: tenant.status === "TRIAL",
    source: "MANUAL",
    actorUserId: actor.userId,
    occurredAt: tenant.createdAt,
    metadata: { provisionedBy: actor.email },
  });
  await logPlatformAudit({
    userId: actor.userId,
    tenantId: tenant.id,
    action: "platform.tenant_provisioned",
    entityType: "Tenant",
    entityId: tenant.id,
    metadata: { actor: actor.email, slug, ownerEmail: args.ownerEmail, plan: args.plan, status: args.status, reusedExistingUser: reused },
  });

  return {
    ok: true,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ownerEmail: args.ownerEmail,
    reusedExistingUser: reused,
  };
}

function generatePlaceholderPassword(): string {
  // 32 random hex chars. The owner won't know it; they'll go through
  // /reset on first sign-in. We could send an email here instead but
  // delivery + template work belongs in a follow-up.
  const arr = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ── Wizard action ───────────────────────────────────────── */

export async function provisionTenant(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false as const, error: "Your role can't create tenants" };
  }
  const parsed = provisionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    return { ok: false as const, error: msg };
  }
  const result = await provisionTenantInner(parsed.data, ctx);
  if (!result.ok) return result;
  revalidatePath("/platform/tenants");
  redirect(`/platform/tenants/${result.tenantId}?ok=provisioned`);
}

/* ── CSV import ──────────────────────────────────────────── */

export interface CsvImportRow {
  rowIndex: number;       // 1-based, excluding header
  shopName?: string;
  slug?: string;
  ownerName?: string;
  ownerEmail?: string;
  plan?: string;
  status?: string;
  trialDays?: string;
  country?: string;
  industry?: string;
  source?: string;
  notes?: string;
}

export interface CsvImportPreviewItem {
  rowIndex: number;
  /** "create" / "update-skip" (slug exists) / "error". */
  decision: "create" | "skip" | "error";
  reason?: string;
  shopName: string;
  slug: string;
  ownerEmail: string;
  plan: string;
  status: string;
}

export interface CsvImportPreviewResult {
  ok: true;
  rows: CsvImportPreviewItem[];
  totals: { create: number; skip: number; error: number };
}

/** Dry-run: parses the rows, validates each, and returns a per-row
 *  decision. Doesn't write anything. */
export async function previewTenantsImport(rows: CsvImportRow[]): Promise<CsvImportPreviewResult | ProvisionFailure> {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false, error: "Your role can't import tenants" };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import" };
  }
  if (rows.length > 5_000) {
    return { ok: false, error: "Import capped at 5,000 rows per file" };
  }

  // Pre-fetch existing slugs in one round trip so the per-row check
  // doesn't N+1 the DB.
  const candidateSlugs = rows
    .map((r) => slugify(r.slug ?? ""))
    .filter(Boolean);
  const existingSlugs = candidateSlugs.length === 0 ? [] : await db.tenant.findMany({
    where: { slug: { in: candidateSlugs } },
    select: { slug: true },
  });
  const taken = new Set(existingSlugs.map((t) => t.slug));

  const out: CsvImportPreviewItem[] = [];
  const totals = { create: 0, skip: 0, error: 0 };
  const seenSlugsThisFile = new Set<string>();
  for (const r of rows) {
    const validated = validateRow(r);
    if (!validated.ok) {
      out.push({
        rowIndex: r.rowIndex,
        decision: "error",
        reason: validated.error,
        shopName: r.shopName ?? "",
        slug: r.slug ?? "",
        ownerEmail: r.ownerEmail ?? "",
        plan: r.plan ?? "",
        status: r.status ?? "",
      });
      totals.error += 1;
      continue;
    }
    const slug = slugify(validated.data.slug);
    if (taken.has(slug) || seenSlugsThisFile.has(slug)) {
      out.push({
        rowIndex: r.rowIndex,
        decision: "skip",
        reason: taken.has(slug) ? "Slug already exists" : "Duplicate slug in this file",
        shopName: validated.data.shopName,
        slug,
        ownerEmail: validated.data.ownerEmail,
        plan: validated.data.plan,
        status: validated.data.status,
      });
      totals.skip += 1;
      continue;
    }
    seenSlugsThisFile.add(slug);
    out.push({
      rowIndex: r.rowIndex,
      decision: "create",
      shopName: validated.data.shopName,
      slug,
      ownerEmail: validated.data.ownerEmail,
      plan: validated.data.plan,
      status: validated.data.status,
    });
    totals.create += 1;
  }
  return { ok: true, rows: out, totals };
}

export interface CsvImportCommitResult {
  ok: true;
  created: number;
  skipped: number;
  errored: number;
  errors: { rowIndex: number; reason: string }[];
}

/** Live commit. Walks the rows, calls provisionTenantInner per row,
 *  collects errors per-row so a bad row doesn't abort the whole file. */
export async function commitTenantsImport(rows: CsvImportRow[]): Promise<CsvImportCommitResult | ProvisionFailure> {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return { ok: false, error: "Your role can't import tenants" };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import" };
  }
  if (rows.length > 5_000) {
    return { ok: false, error: "Import capped at 5,000 rows per file" };
  }

  let created = 0, skipped = 0, errored = 0;
  const errors: { rowIndex: number; reason: string }[] = [];

  for (const r of rows) {
    const validated = validateRow(r);
    if (!validated.ok) {
      errored += 1;
      errors.push({ rowIndex: r.rowIndex, reason: validated.error });
      continue;
    }
    const result = await provisionTenantInner(validated.data, ctx);
    if (!result.ok) {
      // Slug-collision and other downstream failures land here.
      if (/Slug already taken/i.test(result.error)) {
        skipped += 1;
      } else {
        errored += 1;
        errors.push({ rowIndex: r.rowIndex, reason: result.error });
      }
      continue;
    }
    created += 1;
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_csv_imported",
    entityType: "Tenant",
    metadata: { actor: ctx.email, total: rows.length, created, skipped, errored },
  });
  revalidatePath("/platform/tenants");
  return { ok: true, created, skipped, errored, errors: errors.slice(0, 50) };
}

function validateRow(r: CsvImportRow):
  | { ok: true; data: z.infer<typeof provisionSchema> }
  | { ok: false; error: string } {
  // Shape into the wizard schema.
  const candidate = {
    shopName:    r.shopName,
    slug:        r.slug,
    ownerName:   r.ownerName,
    ownerEmail:  r.ownerEmail,
    plan:        (r.plan ?? "STARTER").toUpperCase(),
    status:      (r.status ?? "TRIAL").toUpperCase(),
    trialDays:   r.trialDays,
    country:     r.country || undefined,
    industry:    r.industry ? r.industry.toUpperCase() : undefined,
    source:      (r.source ?? "ORGANIC").toUpperCase(),
    notes:       r.notes || undefined,
  };
  const parsed = provisionSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") ?? "row"}: ${issue?.message ?? "invalid"}` };
  }
  return { ok: true, data: parsed.data };
}

// Keep Prisma type ref alive so future bumps don't drop it.
type _Keep = Prisma.TenantUncheckedCreateInput;
const _typeKeep: _Keep | undefined = undefined;
void _typeKeep;
