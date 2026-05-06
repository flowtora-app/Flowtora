"use server";

// Page 41 — Tenant-to-tenant Referral Program actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type {
  ReferralRewardKind,
  TenantReferralFraudFlag,
} from "@prisma/client";

const ROUTE = "/platform/marketing/referrals";
const PERM = "referrals.manage" as const;

const REWARD_KINDS = ["CREDIT", "FREE_MONTHS", "CASH"] as const;
const FRAUD_FLAGS = [
  "SELF_REFERRAL", "SAME_IP", "SAME_FINGERPRINT",
  "BURST_SIGNUPS", "BLACKLISTED_DOMAIN", "RAPID_CLICKS",
  "PAYMENT_REVERSED",
] as const;

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  active: z.coerce.boolean().optional().default(false),
  referrerRewardKind:        z.enum(REWARD_KINDS).default("CREDIT"),
  referrerRewardCreditCents: z.coerce.number().int().min(0).max(1_000_000).default(10_000),
  referrerRewardFreeMonths:  z.coerce.number().int().min(0).max(24).default(1),
  referrerRewardCashCents:   z.coerce.number().int().min(0).max(1_000_000).default(5_000),
  refereeDiscountPct:        z.coerce.number().int().min(0).max(100).default(20),
  refereeDiscountMonths:     z.coerce.number().int().min(0).max(24).default(3),
  minimumSpendCents:         z.coerce.number().int().min(0).max(10_000_000).default(10_000),
  attributionWindowDays:     z.coerce.number().int().min(1).max(365).default(60),
  signupToPaidWindowDays:    z.coerce.number().int().min(1).max(365).default(45),
  rewardHoldDays:            z.coerce.number().int().min(0).max(120).default(14),
});

export async function saveReferralSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  // The HTML checkbox produces "on" when checked, nothing when not — coerce
  // both shapes to a boolean.
  const raw = Object.fromEntries(formData.entries());
  raw.active = raw.active === "on" || raw.active === "true" ? "true" : "false";
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;

  await db.referralProgramSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...d, updatedById: ctx.userId },
    update: { ...d, updatedById: ctx.userId },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.referrals.settings_saved",
    entityType: "ReferralProgramSettings",
    entityId: "default",
    metadata: {
      actor: ctx.email,
      active: d.active,
      kind: d.referrerRewardKind,
      minimumSpendCents: d.minimumSpendCents,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

/* ── Generate codes for tenants who don't have one yet ── */

export async function generateReferralCodes() {
  const ctx = await requirePlatformPermission(PERM);
  const tenants = await db.tenant.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      referralCode: { is: null },
    },
    select: { id: true, slug: true },
    take: 500, // safety cap
  });
  let created = 0;
  for (const t of tenants) {
    const code = await pickUniqueCode(t.slug);
    await db.tenantReferralCode.create({
      data: { tenantId: t.id, code },
    });
    created++;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.referrals.codes_generated",
    entityType: "TenantReferralCode",
    entityId: "*",
    metadata: { actor: ctx.email, created },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=top&ok=${created === 0 ? "no-new-codes" : `generated-${created}`}`);
}

async function pickUniqueCode(slugSeed: string): Promise<string> {
  // Slug-prefix + random tail for memorability + collision resistance.
  // Fall back to pure-random if slug is too short.
  const safe = slugSeed.replace(/[^a-z0-9]+/gi, "").toUpperCase().slice(0, 6) || "FT";
  for (let attempt = 0; attempt < 6; attempt++) {
    const tail = randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
    const candidate = `${safe}-${tail}`;
    const collision = await db.tenantReferralCode.findUnique({ where: { code: candidate } });
    if (!collision) return candidate;
  }
  // Pathological fallback — pure random, 8 chars.
  return `R-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/* ── Fraud queue actions ──────────────────────────────── */

const reviewSchema = z.object({
  id:   z.string().min(1),
  note: z.string().max(500).optional().or(z.literal("")),
});

export async function approveFraudFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=fraud&error=invalid`);
  }
  const { id, note } = parsed.data;
  const row = await db.tenantReferral.findUnique({ where: { id } });
  if (!row) redirect(`${ROUTE}?tab=fraud&error=not-found`);

  // Approving the flag means: this referral was legitimate after review.
  // We clear the FRAUD status, restore it to whatever stage it had hit,
  // and (if it had crossed PAID) release the reward.
  const wasPaid = row.paidAt != null;
  await db.tenantReferral.update({
    where: { id },
    data: {
      fraudResolution: "APPROVED",
      fraudReviewedAt: new Date(),
      fraudReviewerId: ctx.userId,
      fraudReviewerNote: note || null,
      // Status moves back to whatever the funnel reached most recently.
      status: wasPaid ? "REWARDED" : row.signedUpAt ? "SIGNED_UP" : "CLICKED",
      rewardReleasedAt: wasPaid ? new Date() : null,
    },
  });

  // Bump the leaderboard counters when we just released a reward.
  if (wasPaid) {
    await db.tenantReferralCode.update({
      where: { id: row.codeId },
      data: {
        conversions: { increment: 1 },
        earnedCents: { increment: row.rewardAmountCents },
      },
    });
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.referrals.fraud_approved",
    entityType: "TenantReferral",
    entityId: id,
    metadata: {
      actor: ctx.email,
      flag: row.fraudFlag,
      releasedReward: wasPaid,
      rewardCents: row.rewardAmountCents,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=fraud&ok=approved`);
}

export async function denyFraudFlag(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=fraud&error=invalid`);
  }
  const { id, note } = parsed.data;
  const row = await db.tenantReferral.findUnique({ where: { id } });
  if (!row) redirect(`${ROUTE}?tab=fraud&error=not-found`);

  await db.tenantReferral.update({
    where: { id },
    data: {
      fraudResolution: "DENIED",
      fraudReviewedAt: new Date(),
      fraudReviewerId: ctx.userId,
      fraudReviewerNote: note || null,
      // Stays in FRAUD; reward NEVER releases.
      rewardAmountCents: 0,
      rewardReleasedAt: null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.referrals.fraud_denied",
    entityType: "TenantReferral",
    entityId: id,
    metadata: { actor: ctx.email, flag: row.fraudFlag },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=fraud&ok=denied`);
}

/* ── Manual flag (rarely needed; for the demo + admin override) ── */

const manualFlagSchema = z.object({
  id:     z.string().min(1),
  flag:   z.enum(FRAUD_FLAGS),
  reason: z.string().max(500).optional().or(z.literal("")),
});

export async function flagReferralAsFraud(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = manualFlagSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=fraud&error=invalid`);
  }
  const { id, flag, reason } = parsed.data;
  await db.tenantReferral.update({
    where: { id },
    data: {
      fraudFlag: flag as TenantReferralFraudFlag,
      fraudReason: reason || null,
      fraudResolution: "PENDING",
      status: "FRAUD",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.referrals.flagged",
    entityType: "TenantReferral",
    entityId: id,
    metadata: { actor: ctx.email, flag, reason: reason || null },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=fraud&ok=flagged`);
}

/* ── Helpers exported for type inference inside forms ───── */

export type ReferralRewardKindLiteral = ReferralRewardKind;
