"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { isReservedSlug, slugify } from "@/lib/slug";
import { passwordSchema } from "@/lib/password";
import { logAudit } from "@/lib/audit";
import {
  generateToken,
  hashToken,
  recordSecurityEvent,
} from "@/lib/security";
import { sendNotification } from "@/lib/notifications";
import { getPublishedPlanBySlug } from "@/lib/plans";
import { LOGIN_ERRORS } from "@/auth";

const PENDING_2FA_COOKIE = "ts_2fa_pending";
const PENDING_2FA_TTL_SECONDS = 5 * 60; // 5 minutes

// Sign-out action. Wrapped so client components (like the TopBar user
// menu) can bind a <form action={signOutAction}> without importing
// server-only NextAuth helpers directly.
export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

const signupSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: passwordSchema,
  shopName: z.string().min(1).max(120),
  slug: z.string().min(2).max(40),
  // Optional purchase-intent fields. When present, the new tenant is
  // routed through /t/{slug}/checkout-direct after sign-in so Stripe
  // checkout opens immediately instead of the trial onboarding. The
  // slug is validated against the published plan catalog below — any
  // unknown / non-purchasable slug falls back to the trial flow.
  plan: z.string().min(1).max(64).optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
});

export async function signupAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const { name, email, password, shopName, plan, cycle } = parsed.data;
  const slug = slugify(parsed.data.slug);

  if (isReservedSlug(slug) || slug.length < 2) {
    redirect(`/signup?error=${encodeURIComponent("That shop URL is reserved. Pick another.")}`);
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    redirect(`/signup?error=${encodeURIComponent("An account with that email already exists.")}`);
  }
  const existingTenant = await db.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    redirect(`/signup?error=${encodeURIComponent("That shop URL is taken.")}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const { user, tenant } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name, passwordHash },
    });
    const tenant = await tx.tenant.create({
      data: { slug, name: shopName, status: "TRIAL", trialEndsAt },
    });
    await tx.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: "OWNER" },
    });
    return { user, tenant };
  });

  await logAudit({
    tenantId: tenant.id,
    userId: user.id,
    action: "tenant.created",
    entityType: "Tenant",
    entityId: tenant.id,
  });

  // Phase 2 — fire off the initial email-verification token. Failures
  // here don't block signup (the user can re-send from the banner
  // inside the shell) so we swallow any thrown errors.
  try {
    const raw = generateToken();
    await db.emailVerificationToken.create({
      data: {
        userId: user.id,
        email: user.email,
        purpose: "INITIAL",
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    // Platform-managed template — content is editable at
    // /platform/notifications under kind "auth.email_verification".
    // Caller supplies tokens; the dispatcher renders through the
    // branded layout and falls back to the compile-time default if
    // no DB row exists yet.
    await sendNotification({
      kind: "auth.email_verification",
      to: user.email,
      userId: user.id,
      tenantId: tenant.id,
      tokens: {
        user_name: user.name ?? "",
        verification_url: `${base}/verify/${raw}`,
      },
    });
  } catch {
    // Swallow — verification can always be re-issued from the workspace banner.
  }

  // Purchase-intent fork: the user clicked a tier CTA on /pricing (or
  // the home pricing preview) and wants to subscribe now. Route them
  // into the checkout-direct page which creates a Stripe session and
  // 302s to it. Trial users fall through to the onboarding wizard.
  //
  // A brand-new tenant has `onboardingCompletedAt = null`, so for the
  // trial path the tenant layout would bounce /dashboard → /onboarding
  // anyway. Skipping the hop avoids an intermittent RSC-flush issue
  // where the chained redirect after `signIn` lands on a blank view
  // until the user manually refreshes.
  const resolvedCycle = cycle ?? "annual";

  // Validate the purchase-intent slug against the live plan catalog.
  // Any unknown / unpublished / contact-sales / unpriced slug falls
  // back to onboarding so marketing CTAs can never strand a user on a
  // broken checkout. `planRow.slug` is authoritative — we echo it
  // lowercased into the checkout-direct URL.
  const normalizedPlan = plan?.trim().toLowerCase();
  const planRow = normalizedPlan ? await getPublishedPlanBySlug(normalizedPlan) : null;
  const isPurchasable =
    planRow !== null &&
    planRow.showOnSignup &&
    !planRow.isContactSales &&
    (planRow.priceMonthly != null || planRow.priceAnnual != null);

  const redirectTo = isPurchasable
    ? `/t/${tenant.slug}/checkout-direct?plan=${planRow!.slug}&cycle=${resolvedCycle}`
    : `/t/${tenant.slug}/onboarding`;

  await signIn("credentials", {
    email,
    password,
    redirectTo,
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

// Phase 2 — login with lockout + 2FA awareness.
//
// Flow:
//   1. POST /login with email + password.
//   2. NextAuth.authorize() checks lockout, bcrypt, and whether 2FA is on.
//        • Lockout       → throws LOCKED      → redirect /login?error=locked
//        • Bad password  → returns null        → redirect /login?error=credentials
//        • 2FA enabled + no code → throws TWO_FACTOR_REQUIRED.
//        • 2FA disabled  → completes sign-in and redirects.
//   3. On TWO_FACTOR_REQUIRED we know the password was correct. We mint
//      a short-lived pending token, write its raw value to an httpOnly
//      cookie, and redirect to /two-factor. The challenge page never
//      sees the password.

async function decodeAuthError(err: unknown): Promise<string> {
  const e = err as { message?: string; cause?: { err?: { message?: string } } };
  const direct = e?.message;
  const nested = e?.cause?.err?.message;
  const msg = nested ?? direct ?? "";
  if (msg.includes(LOGIN_ERRORS.LOCKED)) return LOGIN_ERRORS.LOCKED;
  if (msg.includes(LOGIN_ERRORS.TWO_FACTOR_REQUIRED)) return LOGIN_ERRORS.TWO_FACTOR_REQUIRED;
  if (msg.includes(LOGIN_ERRORS.TWO_FACTOR_BAD)) return LOGIN_ERRORS.TWO_FACTOR_BAD;
  if (msg.includes(LOGIN_ERRORS.BANNED)) return LOGIN_ERRORS.BANNED;
  return LOGIN_ERRORS.CREDENTIALS;
}

async function mintPending2faToken(email: string, next: string | undefined) {
  // NextAuth's authorize() doesn't give us the userId in the throw chain,
  // but we can look it up — password was correct, user definitely exists.
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return;
  const h = await headers();
  const ipHeader = h.get("x-forwarded-for");
  const ip = ipHeader ? ipHeader.split(",")[0]!.trim() : h.get("x-real-ip");
  const ua = h.get("user-agent");
  const raw = generateToken();
  await db.twoFactorPendingLogin.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + PENDING_2FA_TTL_SECONDS * 1000),
      ipAddress: ip,
      userAgent: ua,
    },
  });
  const jar = await cookies();
  jar.set(PENDING_2FA_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_2FA_TTL_SECONDS,
  });
  // Stash `next` in a sibling cookie so the challenge page knows where
  // to land after completion without putting it in the URL.
  if (next) {
    jar.set(`${PENDING_2FA_COOKIE}_next`, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_2FA_TTL_SECONDS,
    });
  }
}

export async function loginAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) redirect("/login?error=credentials");

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: parsed.data.next || "/select-tenant",
    });
  } catch (err) {
    // NextAuth throws a redirect on success — re-throw so Next can handle it.
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;

    const sentinel = await decodeAuthError(err);

    if (sentinel === LOGIN_ERRORS.LOCKED) {
      redirect(`/login?error=locked&email=${encodeURIComponent(parsed.data.email)}`);
    }
    if (sentinel === LOGIN_ERRORS.TWO_FACTOR_REQUIRED) {
      await mintPending2faToken(parsed.data.email, parsed.data.next);
      redirect("/two-factor");
    }
    if (sentinel === LOGIN_ERRORS.BANNED) {
      redirect("/login?error=banned");
    }
    redirect("/login?error=credentials");
  }
}

// ── 2FA challenge completion ──
//
// Reads the pending-login cookie, validates the TOTP (or recovery) code
// against the user that cookie points at, then passes the raw pending
// token into signIn() so authorize() can consume it and mint the JWT.

const twoFactorSchema = z.object({
  totpCode: z.string().min(1),
});

export async function twoFactorChallengeAction(formData: FormData) {
  const parsed = twoFactorSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/two-factor?error=bad`);
  }
  const jar = await cookies();
  const rawToken = jar.get(PENDING_2FA_COOKIE)?.value;
  if (!rawToken) {
    redirect("/login?error=credentials");
  }
  const next = jar.get(`${PENDING_2FA_COOKIE}_next`)?.value;

  const row = await db.twoFactorPendingLogin.findUnique({
    where: { tokenHash: hashToken(rawToken!) },
    include: { user: { include: { twoFactor: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.twoFactor) {
    jar.delete(PENDING_2FA_COOKIE);
    jar.delete(`${PENDING_2FA_COOKIE}_next`);
    redirect("/login?error=credentials");
  }

  // Local import to avoid a cycle with @/lib/security when building
  // actions that are imported transitively through @/auth.
  const { verifyTotp, consumeRecoveryCode } = await import("@/lib/security");

  const code = parsed.data.totpCode.trim();
  const totpOk = verifyTotp(row!.user.twoFactor!.secret, code);
  let recoveryRemaining: string[] | null = null;
  if (!totpOk) {
    recoveryRemaining = consumeRecoveryCode(row!.user.twoFactor!.recoveryCodeHashes, code);
  }
  if (!totpOk && !recoveryRemaining) {
    await recordSecurityEvent({
      userId: row!.userId,
      kind: "TWO_FACTOR_CHALLENGE_FAILED",
    });
    redirect("/two-factor?error=bad");
  }
  if (recoveryRemaining) {
    await db.userTwoFactor.update({
      where: { userId: row!.userId },
      data: { recoveryCodeHashes: recoveryRemaining, lastUsedAt: new Date() },
    });
    await recordSecurityEvent({ userId: row!.userId, kind: "RECOVERY_CODE_USED" });
  } else {
    await db.userTwoFactor.update({
      where: { userId: row!.userId },
      data: { lastUsedAt: new Date() },
    });
    await recordSecurityEvent({ userId: row!.userId, kind: "TWO_FACTOR_CHALLENGE_OK" });
  }

  // Hand the raw pending token to authorize() so it consumes the row
  // atomically and returns a user payload. Clear cookies first so a
  // failure-after-partial-redirect doesn't leave them dangling.
  jar.delete(PENDING_2FA_COOKIE);
  jar.delete(`${PENDING_2FA_COOKIE}_next`);

  try {
    await signIn("credentials", {
      pendingLoginToken: rawToken,
      redirectTo: next || "/select-tenant",
    });
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    redirect("/login?error=credentials");
  }
}

export async function cancelTwoFactorChallenge() {
  const jar = await cookies();
  jar.delete(PENDING_2FA_COOKIE);
  jar.delete(`${PENDING_2FA_COOKIE}_next`);
  redirect("/login");
}

/** Helper used by the /two-factor page to render role-appropriate copy. */
export async function readPendingTwoFactor(): Promise<{
  email: string;
  expiresAt: Date;
} | null> {
  const jar = await cookies();
  const rawToken = jar.get(PENDING_2FA_COOKIE)?.value;
  if (!rawToken) return null;
  const row = await db.twoFactorPendingLogin.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: { select: { email: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  return { email: row.user.email, expiresAt: row.expiresAt };
}
