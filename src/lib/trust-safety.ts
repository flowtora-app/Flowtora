// Phase 4 — Trust & Safety helpers.
//
// Centralizes ban-checking logic so both the auth path (every sign-in)
// and the admin UI use the same rules. The auth path needs to be FAST,
// so we keep the queries minimal and indexed (see schema).

import { db } from "@/lib/db";

export type BanCheckResult =
  | { banned: false }
  | { banned: true; kind: "USER" | "IP" | "EMAIL_DOMAIN"; reason: string };

/**
 * Normalize an IP address for comparison + storage. Lowercases v6 and
 * strips v6 zone identifiers. Returns null for obviously bad input.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // v6 zone id (e.g. fe80::1%eth0) is a host-local construct — drop.
  const noZone = trimmed.split("%")[0]!;
  // Crude sanity check — reject anything that doesn't look like an IP.
  // Don't validate strictly here; the admin form does.
  if (!/^[0-9a-f.:]+$/.test(noZone)) return null;
  return noZone;
}

/**
 * Extract the lower-case email domain. Returns null for invalid input.
 *   normalizeEmailDomain("Foo@BAR.com") => "bar.com"
 */
export function normalizeEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const dom = email.slice(at + 1).trim().toLowerCase();
  return dom || null;
}

/**
 * Check whether a sign-in attempt is blocked by any active ban. Active =
 * not lifted AND not past expiresAt. Caller passes the userId (resolved
 * by email lookup), the IP from the request, and the email itself.
 *
 * Auth-path semantics:
 *   - User-row level checks (`bannedAt`, `mergedIntoId`) are done in
 *     the credentials authorize() because that path already has the
 *     User row in hand. This helper covers IP + domain bans (which
 *     don't depend on the User row) and re-checks the active BanRecord
 *     for the user as a belt-and-suspenders safety net.
 */
export async function checkBan(opts: {
  userId?: string | null;
  ipAddress?: string | null;
  email?: string | null;
}): Promise<BanCheckResult> {
  const ip = normalizeIp(opts.ipAddress ?? null);
  const domain = normalizeEmailDomain(opts.email ?? null);
  const now = new Date();

  // Active = not lifted, not past expiry.
  const activeFilter = {
    liftedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  // Single OR query so we hit one trip to the DB.
  const ors: Array<Record<string, unknown>> = [];
  if (opts.userId) ors.push({ kind: "USER" as const, userId: opts.userId });
  if (ip)          ors.push({ kind: "IP" as const, ipAddress: ip });
  if (domain)      ors.push({ kind: "EMAIL_DOMAIN" as const, emailDomain: domain });
  if (ors.length === 0) return { banned: false };

  const row = await db.banRecord.findFirst({
    where: { AND: [{ OR: ors }, activeFilter] },
    select: { kind: true, reason: true },
  });
  if (!row) return { banned: false };
  return { banned: true, kind: row.kind, reason: row.reason };
}

/**
 * Validate an IP string strictly (used by the admin form).
 *
 * We accept v4 (a.b.c.d), simple v6 forms, and the "0.0.0.0/0"-style
 * suffix-less single host. CIDR ranges are NOT supported in this slice
 * — we ban exact addresses, not nets. Add that when we have data telling
 * us bot networks come from cohesive ranges.
 */
export function validateIp(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (!v) return null;
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    const parts = v.split(".").map((p) => parseInt(p, 10));
    if (parts.every((p) => Number.isFinite(p) && p >= 0 && p <= 255)) return v;
    return null;
  }
  // Coarse IPv6 — at least one colon, no spaces, hex chars only.
  if (v.includes(":") && /^[0-9a-f:]+$/.test(v)) return v;
  return null;
}

/**
 * Validate a domain string. Lower-cased; no leading "@".
 *   "Bar.com" => "bar.com"; "@bar.com" => "bar.com"; "" => null
 */
export function validateDomain(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (v.startsWith("@")) v = v.slice(1);
  if (!v) return null;
  // Must contain a dot, only safe domain chars. Slightly permissive
  // (allow underscore for niche internal TLDs).
  if (!/^[a-z0-9.\-_]+\.[a-z]{2,}$/i.test(v)) return null;
  return v;
}
