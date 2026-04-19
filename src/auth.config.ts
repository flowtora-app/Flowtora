import type { NextAuthConfig, DefaultSession } from "next-auth";
import type { PlatformRole } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// Edge-safe NextAuth base config.
//
// Middleware in Next.js runs on the Edge runtime, where Prisma Client
// doesn't work without Accelerate / driver adapters. But middleware
// still needs to call `auth()` to know whether a request is signed in
// (so unauthenticated users get bounced to /login).
//
// The solution — also the canonical NextAuth v5 pattern — is to split
// the config:
//
//   • `auth.config.ts` (this file)    → edge-safe: providers = [],
//     no PrismaAdapter, no DB access in callbacks. Just enough to
//     decode the JWT cookie into `req.auth` for the middleware.
//
//   • `auth.ts`                       → node-only: spreads this base,
//     adds PrismaAdapter + Credentials provider (with the full
//     `authorize` function), and overrides the `jwt` callback to
//     re-read `sessionVersion` from the DB for server-side revocation.
//
// Middleware imports THIS file. Server components / API routes / server
// actions import `@/auth` (the node config). `auth()` called from an
// RSC will still perform the DB revocation check — middleware is just
// a first line of defense.
// ─────────────────────────────────────────────────────────────────

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      platformRole: PlatformRole | null;
      /** Phase 2 — mirrors User.sessionVersion for global sign-out. */
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

// NextAuth v5 re-exports JWT types from `@auth/core/jwt`; augmenting
// `next-auth/jwt` directly isn't always picked up under moduleResolution:
// "bundler", so we augment the upstream module.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    platformRole: PlatformRole | null;
    sessionVersion: number;
    // Phase 2 — true after a successful 2FA challenge for users with
    // twoFactorEnabled. When false + enabled, protected routes should
    // bounce to /two-factor.
    twoFactorOk: boolean;
  }
}

export const authConfig = {
  session: { strategy: "jwt" as const },
  pages: { signIn: "/login" },
  // Providers are defined in the full `auth.ts` config so the Credentials
  // `authorize` function (which hits the DB + bcrypt) stays out of the
  // edge bundle. Middleware never runs `authorize` anyway — that only
  // fires when a sign-in is submitted to /api/auth/callback/credentials,
  // which resolves on the node runtime.
  providers: [],
  callbacks: {
    // Edge-safe jwt: identity pass-through. The `user`-is-present branch
    // runs only during the Credentials sign-in flow (node side), and the
    // DB revocation branch lives in the full config. Middleware only
    // hits this file's jwt callback when re-decoding an existing token,
    // so a plain pass-through is correct and safe.
    async jwt({ token }) {
      return token;
    },
    // Edge-safe session: token → session mapping without DB. Identical
    // to the node-side callback; we keep it here so both configs agree
    // on the public session shape and middleware can read session.user.
    async session({ session, token }) {
      const t = token as typeof token & {
        id: string;
        platformRole: PlatformRole | null;
        sessionVersion: number;
      };
      if (!t.id) {
        // Revoked — middleware sees an unauthenticated user and
        // redirects them to /login. The node config sets t.id = "" on
        // revocation; edge just honors what's already in the token.
        return { ...session, user: { ...session.user, id: "" } } as typeof session;
      }
      session.user.id = t.id;
      session.user.platformRole = t.platformRole;
      session.user.sessionVersion = t.sessionVersion;
      return session;
    },
  },
} satisfies NextAuthConfig;
