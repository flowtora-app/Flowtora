// Phase 17 Slice B — impersonation session helpers.
//
// See the ImpersonationSession model for the storage model. This file is
// where the cookie <-> DB row plumbing lives so pages / actions / layouts
// don't have to repeat it.
//
// Cookie: `ts_imp` (ts = flowtora, imp = impersonation). HTTP-only so a
// page script can't lift it, `sameSite: "lax"` so it survives a redirect
// from /platform into /t, Secure in production.

import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const IMPERSONATION_COOKIE = "ts_imp";

export type ActiveImpersonation = {
  id: string;
  platformUserId: string;
  tenantId: string;
  reason: string | null;
  startedAt: Date;
};

/**
 * Returns the current user's active impersonation session, if any.
 *
 * Validates ownership: a session that belongs to someone else (copy-paste
 * cookie from a dev machine, stale cookie after sign-out-and-back-in as a
 * different user) is treated as not present and the cookie is cleared so
 * the next render doesn't repeat the lookup.
 */
export async function getActiveImpersonation(
  currentUserId: string | null,
): Promise<ActiveImpersonation | null> {
  if (!currentUserId) return null;
  const jar = await cookies();
  const sessionId = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await db.impersonationSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true, platformUserId: true, tenantId: true,
      reason: true, startedAt: true, endedAt: true,
    },
  });

  // Cookie doesn't match a live row — stale or someone else's. Ignore.
  if (!session || session.endedAt || session.platformUserId !== currentUserId) {
    return null;
  }

  return {
    id: session.id,
    platformUserId: session.platformUserId,
    tenantId: session.tenantId,
    reason: session.reason,
    startedAt: session.startedAt,
  };
}

/**
 * Create an ImpersonationSession row and set the cookie. Caller is
 * expected to redirect to the tenant workspace afterward.
 */
export async function startImpersonationSession(params: {
  platformUserId: string;
  tenantId: string;
  reason: string | null;
}): Promise<{ id: string }> {
  // Close any still-open sessions this admin left dangling. Simpler than
  // tracking multiple concurrent impersonations (which would be a separate
  // UX anyway — auditors get one tab, not several).
  await db.impersonationSession.updateMany({
    where: { platformUserId: params.platformUserId, endedAt: null },
    data: { endedAt: new Date() },
  });

  const session = await db.impersonationSession.create({
    data: {
      platformUserId: params.platformUserId,
      tenantId: params.tenantId,
      reason: params.reason,
    },
    select: { id: true },
  });

  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // 8 hours — long enough for a support session, short enough that a
    // forgotten tab doesn't keep the audit trail open overnight.
    maxAge: 60 * 60 * 8,
  });

  return session;
}

/**
 * Stamp `endedAt` and clear the cookie. Safe to call if there's no active
 * session — used as both "explicit stop" and "cleanup on sign out".
 */
export async function stopImpersonationSession(currentUserId: string | null): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(IMPERSONATION_COOKIE)?.value;
  // Only stamp the DB row if we know whose session it is. Without a
  // currentUserId we'd be letting an unauthenticated caller close sessions
  // by id alone — the cookie would have to be leaked first, but tightening
  // the invariant costs us nothing. The cookie clear stays unconditional;
  // that's local to the calling browser, no collateral damage.
  if (sessionId && currentUserId) {
    await db.impersonationSession.updateMany({
      where: {
        id: sessionId,
        platformUserId: currentUserId,
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
  }
  jar.delete(IMPERSONATION_COOKIE);
}
