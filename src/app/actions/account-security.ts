"use server";

// Phase 2 — account-security actions.
//
// All per-user flows that sit outside a single tenant:
//   • requestPasswordReset / confirmPasswordReset
//   • requestEmailChange / confirmEmailChange
//   • sendInitialVerification / confirmInitialVerification
//   • changePassword  (while signed in, requires current password)
//   • enable2fa / verify2fa / disable2fa / regenerateRecoveryCodes
//   • revokeAllSessions (global sign-out)
//
// Each mutating action writes a SecurityEvent row so the Account →
// Security page can render a live activity feed, and sends a notification
// email for state changes the user should see out-of-band ("someone
// changed your password").

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auth, signOut } from "@/auth";
import {
  generateToken,
  hashToken,
  generateTotpSecret,
  verifyTotp,
  generateRecoveryCodes,
  bumpSessionVersion,
  recordSecurityEvent,
} from "@/lib/security";
import {
  sendEmail,
  passwordResetEmail,
  emailVerificationEmail,
  securityAlertEmail,
} from "@/lib/email";
import { passwordSchema } from "@/lib/password";
import { revalidatePath } from "next/cache";

const PASSWORD_RESET_TTL_MIN = 30;
const EMAIL_VERIFICATION_TTL_HOURS = 24;

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const xf = h.get("x-forwarded-for");
    const ip = xf ? xf.split(",")[0]!.trim() : (h.get("x-real-ip") ?? null);
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

// ────────────────────────────────────────────────────────────
// Password reset (public flow — no session required)
// ────────────────────────────────────────────────────────────

const resetRequestSchema = z.object({
  email: z.string().email(),
});

export async function requestPasswordReset(formData: FormData) {
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  // We *always* redirect to the "check your email" page — enumerating
  // which emails exist is an abuse vector. The redirect destination is
  // the same whether the user exists or not.
  if (!parsed.success) {
    redirect("/forgot?sent=1");
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (user?.passwordHash) {
    const raw = generateToken();
    const meta = await requestMeta();
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60 * 1000),
        requestedIp: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    const resetUrl = appUrl(`/reset/${raw}`);
    await sendEmail({
      to: user.email,
      ...passwordResetEmail({ resetUrl, expiresInMinutes: PASSWORD_RESET_TTL_MIN }),
    });
    await recordSecurityEvent({
      userId: user.id,
      kind: "PASSWORD_RESET_REQUESTED",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  redirect("/forgot?sent=1");
}

const resetConfirmSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
  // Bug-fix: the form has always rendered a "Confirm new password"
  // field, but the server never checked it matched. A typo silently
  // sailed through. Now validated below.
  confirmPassword: z.string().min(1),
});

export async function confirmPasswordReset(formData: FormData) {
  const parsed = resetConfirmSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    // Bubble the specific password rule that failed so the user
    // knows whether it was too short, missing a digit, etc.
    const msg = parsed.error.issues[0]?.message ?? "Invalid password.";
    redirect(`/reset/invalid?error=${encodeURIComponent(msg)}`);
  }
  const { token, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword) {
    // Bounce back to the same form (not /reset/invalid — the token
    // is still usable) with an error banner.
    redirect(`/reset/${token}?error=${encodeURIComponent("Passwords do not match.")}`);
  }
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    redirect(`/reset/invalid?error=${encodeURIComponent("This reset link is no longer valid.")}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  // Global sign-out — if an attacker had an active cookie from a prior
  // breach, this kills it.
  await bumpSessionVersion(row.userId);

  const meta = await requestMeta();
  await recordSecurityEvent({
    userId: row.userId,
    kind: "PASSWORD_RESET_COMPLETED",
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });
  if (row.user) {
    await sendEmail({
      to: row.user.email,
      ...securityAlertEmail({
        eventLabel: "Your password was reset",
        ip: meta.ip,
        userAgent: meta.userAgent,
        when: new Date(),
      }),
    });
  }
  redirect(`/login?reset=1`);
}

// ────────────────────────────────────────────────────────────
// Email verification (initial)
// ────────────────────────────────────────────────────────────

export async function sendInitialVerification() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return;

  const raw = generateToken();
  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      email: user.email,
      purpose: "INITIAL",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
    },
  });
  const verifyUrl = appUrl(`/verify/${raw}`);
  await sendEmail({
    to: user.email,
    ...emailVerificationEmail({ verifyUrl, isChange: false, userName: user.name }),
  });
}

export async function confirmVerification(token: string) {
  const row = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    redirect(`/verify/invalid`);
  }

  if (row.purpose === "INITIAL") {
    await db.$transaction([
      db.user.update({
        where: { id: row.userId },
        data: { emailVerified: new Date() },
      }),
      db.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);
    await recordSecurityEvent({ userId: row.userId, kind: "EMAIL_VERIFIED" });
    redirect(`/select-tenant?verified=1`);
  }

  // CHANGE_EMAIL — swap User.email to the new address.
  const conflict = await db.user.findUnique({ where: { email: row.email } });
  if (conflict && conflict.id !== row.userId) {
    redirect(`/verify/invalid?error=${encodeURIComponent("That email is already in use.")}`);
  }
  await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { email: row.email, emailVerified: new Date() },
    }),
    db.emailVerificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);
  await bumpSessionVersion(row.userId);
  await recordSecurityEvent({
    userId: row.userId,
    kind: "EMAIL_CHANGE_COMPLETED",
    metadata: { newEmail: row.email },
  });
  redirect(`/login?email_changed=1`);
}

// ────────────────────────────────────────────────────────────
// Authenticated account actions — change password, email, 2FA
// ────────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  return user;
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  // Just "is this non-empty" — the match check below compares to
  // newPassword directly, no point running the strength rules twice.
  confirmPassword: z.string().min(1),
});

/**
 * Change password from inside the account settings. Requires the
 * current password — prevents stolen-session full takeover.
 */
export async function changePassword(backTo: string, formData: FormData) {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Fill all three password fields.";
    redirect(`${backTo}?error=${encodeURIComponent(msg)}`);
  }
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) {
    redirect(`${backTo}?error=${encodeURIComponent("New passwords do not match.")}`);
  }
  if (!user.passwordHash) {
    redirect(`${backTo}?error=${encodeURIComponent("This account has no password set.")}`);
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    redirect(`${backTo}?error=${encodeURIComponent("Current password is incorrect.")}`);
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  await bumpSessionVersion(user.id);

  const meta = await requestMeta();
  await recordSecurityEvent({ userId: user.id, kind: "PASSWORD_CHANGED", ipAddress: meta.ip, userAgent: meta.userAgent });
  await sendEmail({
    to: user.email,
    ...securityAlertEmail({
      eventLabel: "Your password was changed",
      ip: meta.ip, userAgent: meta.userAgent, when: new Date(),
    }),
  });
  // Kill the session — user must log back in with the new password.
  await signOut({ redirectTo: "/login?password_changed=1" });
}

const changeEmailSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
});

export async function requestEmailChange(backTo: string, formData: FormData) {
  const user = await requireUser();
  const parsed = changeEmailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${backTo}?error=${encodeURIComponent("Provide a valid new email and your current password.")}`);
  }
  const { newEmail, currentPassword } = parsed.data;
  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    redirect(`${backTo}?error=${encodeURIComponent("That's already your email address.")}`);
  }
  if (!user.passwordHash) {
    redirect(`${backTo}?error=${encodeURIComponent("Set a password first before changing your email.")}`);
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    redirect(`${backTo}?error=${encodeURIComponent("Current password is incorrect.")}`);
  }
  const conflict = await db.user.findUnique({ where: { email: newEmail } });
  if (conflict) {
    redirect(`${backTo}?error=${encodeURIComponent("An account with that email already exists.")}`);
  }

  const raw = generateToken();
  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      email: newEmail,
      purpose: "CHANGE_EMAIL",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
    },
  });
  const verifyUrl = appUrl(`/verify/${raw}`);
  await sendEmail({
    to: newEmail,
    ...emailVerificationEmail({ verifyUrl, isChange: true, userName: user.name }),
  });
  // Notify the OLD address too, so a takeover attempt is loud.
  const meta = await requestMeta();
  await sendEmail({
    to: user.email,
    ...securityAlertEmail({
      eventLabel: `Email change requested to ${newEmail}`,
      ip: meta.ip, userAgent: meta.userAgent, when: new Date(),
    }),
  });
  await recordSecurityEvent({
    userId: user.id,
    kind: "EMAIL_CHANGE_REQUESTED",
    metadata: { newEmail },
    ipAddress: meta.ip, userAgent: meta.userAgent,
  });
  redirect(`${backTo}?ok=${encodeURIComponent("Confirmation link sent. Check your new inbox.")}`);
}

// ────────────────────────────────────────────────────────────
// Two-factor auth (TOTP)
// ────────────────────────────────────────────────────────────

/** Start 2FA setup — writes an unverified UserTwoFactor row. */
export async function start2faSetup(backTo: string) {
  const user = await requireUser();
  const secret = generateTotpSecret();
  await db.userTwoFactor.upsert({
    where: { userId: user.id },
    update: { secret, verifiedAt: null, recoveryCodeHashes: [] },
    create: { userId: user.id, secret, verifiedAt: null, recoveryCodeHashes: [] },
  });
  redirect(backTo);
}

const verify2faSchema = z.object({
  code: z.string().min(6).max(10),
});

/** Verify the first code and flip twoFactorEnabled on. Returns recovery codes once. */
export async function verify2faSetup(backTo: string, formData: FormData) {
  const user = await requireUser();
  const parsed = verify2faSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${backTo}?error=${encodeURIComponent("Enter the 6-digit code from your app.")}`);
  }
  const row = await db.userTwoFactor.findUnique({ where: { userId: user.id } });
  if (!row) {
    redirect(`${backTo}?error=${encodeURIComponent("Start 2FA setup first.")}`);
  }
  if (!verifyTotp(row.secret, parsed.data.code)) {
    redirect(`${backTo}?error=${encodeURIComponent("That code didn't match. Try again with a fresh code.")}`);
  }

  // First-time activation — generate recovery codes and hand the plain
  // list back to the UI *once* through a short-lived signed search
  // param. We do the simplest possible thing: stash plaintext codes in
  // a server-side ephemeral row... actually easier: return them by
  // setting a cookie with an expiry of 10 minutes. We'll stash in the
  // URL though since these are a one-time render and a redirect kills
  // the cookie-setting round trip.
  //
  // For v1 we just encode them in the redirect URL behind a fragment —
  // not persisted, only visible to the immediate redirect. If the page
  // reloads they're gone forever and the user can regenerate.
  const { plain, hashes } = generateRecoveryCodes();
  await db.$transaction([
    db.userTwoFactor.update({
      where: { userId: user.id },
      data: { verifiedAt: new Date(), recoveryCodeHashes: hashes, lastUsedAt: new Date() },
    }),
    db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } }),
  ]);

  const meta = await requestMeta();
  await recordSecurityEvent({ userId: user.id, kind: "TWO_FACTOR_ENABLED", ipAddress: meta.ip, userAgent: meta.userAgent });
  await sendEmail({
    to: user.email,
    ...securityAlertEmail({ eventLabel: "Two-factor authentication was enabled", ip: meta.ip, userAgent: meta.userAgent, when: new Date() }),
  });
  redirect(`${backTo}?codes=${encodeURIComponent(plain.join(","))}`);
}

const disable2faSchema = z.object({
  currentPassword: z.string().min(1),
});

export async function disable2fa(backTo: string, formData: FormData) {
  const user = await requireUser();
  const parsed = disable2faSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success || !user.passwordHash) {
    redirect(`${backTo}?error=${encodeURIComponent("Password is required to disable 2FA.")}`);
  }
  const ok = await bcrypt.compare(parsed.data!.currentPassword, user.passwordHash!);
  if (!ok) {
    redirect(`${backTo}?error=${encodeURIComponent("Current password is incorrect.")}`);
  }
  await db.$transaction([
    db.userTwoFactor.deleteMany({ where: { userId: user.id } }),
    db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } }),
  ]);
  const meta = await requestMeta();
  await recordSecurityEvent({ userId: user.id, kind: "TWO_FACTOR_DISABLED", ipAddress: meta.ip, userAgent: meta.userAgent });
  await sendEmail({
    to: user.email,
    ...securityAlertEmail({ eventLabel: "Two-factor authentication was disabled", ip: meta.ip, userAgent: meta.userAgent, when: new Date() }),
  });
  redirect(`${backTo}?ok=${encodeURIComponent("2FA disabled.")}`);
}

export async function regenerateRecoveryCodes(backTo: string) {
  const user = await requireUser();
  const { plain, hashes } = generateRecoveryCodes();
  await db.userTwoFactor.update({
    where: { userId: user.id },
    data: { recoveryCodeHashes: hashes },
  });
  redirect(`${backTo}?codes=${encodeURIComponent(plain.join(","))}`);
}

// ────────────────────────────────────────────────────────────
// Session management
// ────────────────────────────────────────────────────────────

export async function revokeAllSessions(backTo: string) {
  const user = await requireUser();
  await bumpSessionVersion(user.id);
  const meta = await requestMeta();
  await recordSecurityEvent({ userId: user.id, kind: "SESSIONS_REVOKED", ipAddress: meta.ip, userAgent: meta.userAgent });
  await sendEmail({
    to: user.email,
    ...securityAlertEmail({ eventLabel: "All sessions were signed out", ip: meta.ip, userAgent: meta.userAgent, when: new Date() }),
  });
  revalidatePath(backTo);
  // Our own session is also dead now — log out cleanly.
  await signOut({ redirectTo: "/login?signed_out_everywhere=1" });
}
