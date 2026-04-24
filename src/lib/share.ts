// Phase 15 Slice A — public share token helpers.
//
// A ShareToken is an unauthenticated capability: anyone with the URL can
// view (and for proofs respond to) the attached entity. We treat the raw
// token string like an opaque secret — no hashing, no replay protection,
// just validation that the row exists, isn't revoked, isn't expired.
//
// This mirrors src/lib/portal.ts intentionally: the two systems are
// parallel (portal = per-customer inbox, share = per-entity forwardable
// link) and staff should be able to revoke either without touching the
// other.

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { checkPublicTokenRate, readClientIp } from "@/lib/public-rate-limit";
import type { ShareToken, ShareTokenKind } from "@prisma/client";

export type ShareContext = {
  token: ShareToken;
  tenant: {
    id: string;
    slug: string;
    name: string;
    currency: string;
    logoUrl: string | null;
    phone: string | null;
    // Phase 15 Slice D — brand accent color, null when unset.
    brandPrimaryColor: string | null;
  };
};

/**
 * Resolve a raw share-token string from the URL.
 *
 * Returns null on any failure (revoked / expired / wrong tenant status) so
 * the caller can render a friendly "link expired" screen without leaking
 * whether the token ever existed.
 */
export async function resolveShareToken(
  raw: string | undefined | null,
): Promise<ShareContext | null> {
  if (!raw || typeof raw !== "string") return null;
  if (raw.length < 10 || raw.length > 200) return null;

  // Phase 1 — public-token rate limit. Brute-force scanners get the
  // same `null` outcome as an invalid token, preserving the no-leak
  // property this resolver already had. See
  // src/lib/public-rate-limit.ts.
  try {
    const hdrs = await headers();
    const ip = readClientIp(hdrs);
    const rate = checkPublicTokenRate({ ip, kind: "share" });
    if (!rate.ok) return null;
  } catch {
    // Outside a request scope — best-effort; fall through.
  }

  const row = await db.shareToken.findUnique({
    where: { token: raw },
    include: {
      tenant: {
        select: {
          id: true, slug: true, name: true, currency: true,
          logoUrl: true, phone: true, status: true,
          brandPrimaryColor: true,
        },
      },
    },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  if (row.tenant.status === "SUSPENDED" || row.tenant.status === "CANCELED") return null;

  // Best-effort usage stats. Don't block the render on the write.
  db.shareToken
    .update({
      where: { id: row.id },
      data: { lastUsedAt: new Date(), viewCount: { increment: 1 } },
    })
    .catch(() => {});

  const { tenant, ...rest } = row;
  return {
    token: rest as ShareToken,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.currency,
      logoUrl: tenant.logoUrl,
      phone: tenant.phone,
      brandPrimaryColor: tenant.brandPrimaryColor,
    },
  };
}

/**
 * Page-component helper: 404 on any invalid token.
 */
export async function requireShareToken(
  raw: string | undefined | null,
): Promise<ShareContext> {
  const ctx = await resolveShareToken(raw);
  if (!ctx) notFound();
  return ctx;
}

/** Build the canonical public URL path for a share token. */
export function sharePath(token: string): string {
  return `/share/${token}`;
}

/** Read the configured public origin. Server-only. */
export function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/** Build the full URL (including origin) for a share token. Server-only. */
export function shareUrl(token: string): string {
  return `${appOrigin()}${sharePath(token)}`;
}

/** Display helper — matches the portal token equivalents in `/lib/portal`. */
export function isShareTokenActive(
  t: Pick<ShareToken, "revokedAt" | "expiresAt">,
): boolean {
  if (t.revokedAt) return false;
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export function shareTokenStatusLabel(
  t: Pick<ShareToken, "revokedAt" | "expiresAt">,
): string {
  if (t.revokedAt) return "Revoked";
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return "Expired";
  if (t.expiresAt) return "Active";
  return "Active (no expiry)";
}

export function shareKindLabel(kind: ShareTokenKind): string {
  switch (kind) {
    case "PROOF":   return "Proof";
    case "INVOICE": return "Invoice";
    default:        return kind;
  }
}

/**
 * How long before a newly-issued share token expires, by kind.
 *
 * Proofs: 30 days — most approvals happen within a week; 30 days is a
 *   comfortable buffer that still invalidates forgotten links.
 * Invoices: 90 days — some shops send on net-60 terms, and we don't want
 *   the link to die before the due date.
 *
 * Staff can override this in the creation form with a custom expiry.
 */
export function defaultExpiryDaysFor(kind: ShareTokenKind): number {
  return kind === "INVOICE" ? 90 : 30;
}
