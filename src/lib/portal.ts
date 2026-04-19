import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { Customer, PortalToken, Tenant } from "@prisma/client";

export type PortalContext = {
  token: PortalToken;
  tenant: Tenant;
  customer: Customer;
};

/**
 * Resolve a raw portal token string from the URL.
 *
 * Portal access is capability-based: the token IS the credential. We reject
 * revoked and expired tokens. On success we "touch" `lastUsedAt` so staff
 * can see which tokens are active — best-effort, never throws.
 *
 * Returns null on any failure so the caller can choose between 404 / a
 * friendly "link expired" screen.
 */
export async function resolvePortalToken(raw: string | undefined | null): Promise<PortalContext | null> {
  if (!raw || typeof raw !== "string") return null;
  // cuid() is ~25 chars; be generous but bounded to keep bogus lookups cheap.
  if (raw.length < 10 || raw.length > 200) return null;

  const token = await db.portalToken.findUnique({
    where: { token: raw },
    include: { tenant: true, customer: true },
  });
  if (!token) return null;
  if (token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) return null;

  // Refuse if the tenant itself is suspended — the portal shouldn't be a
  // back-door around account status.
  if (token.tenant.status === "SUSPENDED" || token.tenant.status === "CANCELED") return null;

  // Best-effort touch. Don't await — we don't care if the write races, and
  // we never want a read failure to kill the render.
  db.portalToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const { tenant, customer, ...rest } = token;
  return { token: rest as PortalToken, tenant, customer };
}

/**
 * Page-component helper. Calls `notFound()` on any invalid token so the
 * route renders the app's standard 404 instead of leaking "expired" vs
 * "revoked" vs "never existed."
 */
export async function requirePortalToken(raw: string | undefined | null): Promise<PortalContext> {
  const ctx = await resolvePortalToken(raw);
  if (!ctx) notFound();
  return ctx;
}

/**
 * Guard: assert a given entity belongs to the portal customer's tenant AND
 * customer. Use on every quote / order / invoice / proof / install lookup
 * in the portal — skipping this is the easy way to leak another customer's
 * data.
 */
export function assertBelongsToPortal(
  ctx: PortalContext,
  entity: { tenantId: string; customerId: string } | null | undefined,
): void {
  if (!entity) notFound();
  if (entity.tenantId !== ctx.tenant.id) notFound();
  if (entity.customerId !== ctx.customer.id) notFound();
}

/** Build a portal URL: portalPath(token, "quotes/abc123") -> "/portal/<token>/quotes/abc123". */
export function portalPath(token: string, sub?: string): string {
  const clean = sub?.replace(/^\/+/, "") ?? "";
  return clean ? `/portal/${token}/${clean}` : `/portal/${token}`;
}

/** Display helper: is the token effectively active (not revoked, not expired)? */
export function isPortalTokenActive(t: Pick<PortalToken, "revokedAt" | "expiresAt">): boolean {
  if (t.revokedAt) return false;
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export function portalTokenStatusLabel(t: Pick<PortalToken, "revokedAt" | "expiresAt">): string {
  if (t.revokedAt) return "Revoked";
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return "Expired";
  if (t.expiresAt) return "Active";
  return "Active (no expiry)";
}
