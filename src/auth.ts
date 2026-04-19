import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  clearLoginAttempts,
  hashToken,
  lockoutActive,
  recordSecurityEvent,
  registerFailedLogin,
} from "@/lib/security";
import type { PlatformRole } from "@prisma/client";
import { authConfig } from "@/auth.config";

// Phase 3.5 — NextAuth config split for the Edge runtime.
//
// Module augmentations (Session / JWT shapes) live in `auth.config.ts`
// so both the edge-safe base and this full config share the same types.
// This file spreads `authConfig` and layers on the Node-only pieces:
// the PrismaAdapter, the Credentials provider's `authorize` function,
// and the DB-backed `jwt` callback that enforces sessionVersion
// revocation. Middleware uses `auth.config.ts` directly; every other
// caller imports from `@/auth` and gets the full behavior.

// Phase 2 — credentials schema accepts an optional `totpCode` so one form
// can carry both password and 2FA challenge responses. When the user has
// 2FA enabled but hasn't supplied a code, we reject with a sentinel error
// and the client redirects to the 2FA challenge step.
// Phase 2 — credentials schema accepts four optional shapes:
//   1. email + password                         → normal sign-in
//   2. email + password + totpCode              → sign-in with 2FA in one shot
//   3. pendingLoginToken                        → 2FA challenge completion
//      (password was verified upstream; the action layer minted the token
//       and already validated the TOTP code before calling signIn)
const credentialsSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  totpCode: z.string().optional(),
  pendingLoginToken: z.string().optional(),
});

// Sentinel error strings the login UI maps to friendly copy.
export const LOGIN_ERRORS = {
  CREDENTIALS: "credentials",
  LOCKED:      "locked",
  TWO_FACTOR_REQUIRED: "two_factor_required",
  TWO_FACTOR_BAD:      "two_factor_bad",
} as const;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "2FA code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        // ── Pending 2FA token path ──
        // The challenge-handler action has already verified the TOTP code
        // and produced a short-lived pending token. We look it up, mark it
        // used, and return the user. No password compare.
        if (parsed.data.pendingLoginToken) {
          const row = await db.twoFactorPendingLogin.findUnique({
            where: { tokenHash: hashToken(parsed.data.pendingLoginToken) },
            include: { user: true },
          });
          if (!row || row.usedAt || row.expiresAt < new Date()) return null;
          await db.$transaction([
            db.twoFactorPendingLogin.update({
              where: { id: row.id },
              data: { usedAt: new Date() },
            }),
            db.user.update({
              where: { id: row.userId },
              data: {
                lastLoginAt: new Date(),
                failedLoginCount: 0,
                lockedUntil: null,
              },
            }),
          ]);
          await recordSecurityEvent({ userId: row.userId, kind: "LOGIN_SUCCESS" });
          return {
            id: row.user.id,
            email: row.user.email,
            name: row.user.name,
            image: row.user.image,
            platformRole: row.user.platformRole,
            sessionVersion: row.user.sessionVersion,
            twoFactorOk: true,
          } as never;
        }

        if (!parsed.data.email || !parsed.data.password) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          include: { twoFactor: true },
        });
        if (!user?.passwordHash) return null;

        // Lockout check — before we even touch bcrypt we refuse locked
        // accounts. This also means an attacker can't burn CPU hammering
        // bcrypt after the threshold trips.
        if (lockoutActive(user)) {
          await recordSecurityEvent({ userId: user.id, kind: "LOGIN_LOCKED" });
          throw new Error(LOGIN_ERRORS.LOCKED);
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          const { locked } = await registerFailedLogin(user.id);
          await recordSecurityEvent({
            userId: user.id,
            kind: locked ? "LOGIN_LOCKED" : "LOGIN_FAILED",
            metadata: { reason: "bad_password" },
          });
          return null;
        }

        // Password passed — now enforce 2FA if configured.
        if (user.twoFactorEnabled && user.twoFactor?.verifiedAt) {
          const code = parsed.data.totpCode?.trim() ?? "";
          if (!code) {
            // Throw a sentinel so the action layer can redirect to the
            // /two-factor challenge page with the pending email.
            throw new Error(LOGIN_ERRORS.TWO_FACTOR_REQUIRED);
          }
          const { verifyTotp, consumeRecoveryCode } = await import("@/lib/security");
          const totpOk = verifyTotp(user.twoFactor.secret, code);
          let recoveryRemaining: string[] | null = null;
          if (!totpOk) {
            recoveryRemaining = consumeRecoveryCode(user.twoFactor.recoveryCodeHashes, code);
          }
          if (!totpOk && !recoveryRemaining) {
            await recordSecurityEvent({
              userId: user.id,
              kind: "TWO_FACTOR_CHALLENGE_FAILED",
            });
            throw new Error(LOGIN_ERRORS.TWO_FACTOR_BAD);
          }
          if (recoveryRemaining) {
            await db.userTwoFactor.update({
              where: { userId: user.id },
              data: { recoveryCodeHashes: recoveryRemaining, lastUsedAt: new Date() },
            });
            await recordSecurityEvent({ userId: user.id, kind: "RECOVERY_CODE_USED" });
          } else {
            await db.userTwoFactor.update({
              where: { userId: user.id },
              data: { lastUsedAt: new Date() },
            });
            await recordSecurityEvent({ userId: user.id, kind: "TWO_FACTOR_CHALLENGE_OK" });
          }
        }

        // All checks passed — reset lockout counters, stamp last login,
        // write the structured security event.
        await clearLoginAttempts(user.id);
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await recordSecurityEvent({ userId: user.id, kind: "LOGIN_SUCCESS" });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          platformRole: user.platformRole,
          sessionVersion: user.sessionVersion,
          twoFactorOk: true,
        } as never;
      },
    }),
  ],
  callbacks: {
    // Session callback is shared — edge and node agree on the public
    // session shape, so we inherit the pass-through from authConfig.
    ...authConfig.callbacks,
    // jwt is overridden here: the edge version is a pass-through; this
    // Node version handles the user→token merge on sign-in and the
    // DB-backed sessionVersion revocation check on every subsequent
    // request.
    async jwt({ token, user }) {
      // NextAuth v5 types JWT as `Record<string, unknown>`; the module
      // augmentation in auth.config.ts narrows our added fields but the
      // callback parameter still shows through as the base shape in
      // some tsc resolutions. We cast to our extended shape locally to
      // keep the body readable.
      const t = token as typeof token & {
        id: string;
        platformRole: PlatformRole | null;
        sessionVersion: number;
        twoFactorOk: boolean;
      };
      if (user) {
        const u = user as { id: string; platformRole: PlatformRole | null; sessionVersion: number };
        t.id = u.id;
        t.platformRole = u.platformRole;
        t.sessionVersion = u.sessionVersion;
        t.twoFactorOk = true;
      }
      // Phase 2 — on every subsequent hit, re-read sessionVersion. If
      // the DB version has moved past ours, the user invoked "sign out
      // everywhere" (or we force-revoked). Nuke the session by clearing
      // the id so `session()` below returns an anonymous shape.
      //
      // Note — this branch only runs in the Node context (server
      // components, server actions, API routes). Middleware uses the
      // edge config which skips this check; the RSC layer still
      // enforces revocation authoritatively.
      if (t.id && !user) {
        const fresh = await db.user.findUnique({
          where: { id: t.id },
          select: { sessionVersion: true },
        });
        if (!fresh || fresh.sessionVersion !== t.sessionVersion) {
          t.id = "";
        }
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as typeof token & {
        id: string;
        platformRole: PlatformRole | null;
        sessionVersion: number;
      };
      if (!t.id) {
        // Revoked — mark the session so middleware / pages see an
        // unauthenticated state even though the cookie still exists.
        return { ...session, user: { ...session.user, id: "" } } as typeof session;
      }
      session.user.id = t.id;
      session.user.platformRole = t.platformRole;
      session.user.sessionVersion = t.sessionVersion;
      return session;
    },
  },
});
