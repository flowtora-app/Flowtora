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
 *
 * IP matching: exact-match rows are looked up via index in the same
 * query as user/domain. CIDR rows fall back to a JS-side range check
 * because Postgres doesn't index `inet` operations cleanly without an
 * extension. Active CIDR-ban list is small in practice (cap at 1000)
 * so the second query is cheap.
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

  // Single OR query for indexed lookups (user, domain, exact-IP).
  const ors: Array<Record<string, unknown>> = [];
  if (opts.userId) ors.push({ kind: "USER" as const, userId: opts.userId });
  if (ip)          ors.push({ kind: "IP" as const, ipAddress: ip });
  if (domain)      ors.push({ kind: "EMAIL_DOMAIN" as const, emailDomain: domain });
  if (ors.length > 0) {
    const row = await db.banRecord.findFirst({
      where: { AND: [{ OR: ors }, activeFilter] },
      select: { kind: true, reason: true },
    });
    if (row) return { banned: true, kind: row.kind, reason: row.reason };
  }

  // CIDR range check (only if the request had an IP). Pull all active
  // IP bans whose ipAddress contains a `/` (i.e. CIDR-shaped) and walk
  // them. The list is tiny in practice; we skip when no IP given.
  if (ip) {
    const cidrRows = await db.banRecord.findMany({
      where: {
        AND: [
          { kind: "IP", ipAddress: { contains: "/" } },
          activeFilter,
        ],
      },
      select: { ipAddress: true, reason: true },
      take: 1000,
    });
    for (const row of cidrRows) {
      if (row.ipAddress && ipInCidr(ip, row.ipAddress)) {
        return { banned: true, kind: "IP", reason: row.reason };
      }
    }
  }

  return { banned: false };
}

/**
 * Test whether an IP address falls inside a CIDR block. Returns false
 * for malformed input rather than throwing. Supports v4 and v6.
 *
 *   ipInCidr("192.168.1.5", "192.168.1.0/24") => true
 *   ipInCidr("2001:db8::1", "2001:db8::/32")  => true
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.lastIndexOf("/");
  if (slash < 0) return ip === cidr;  // not actually a CIDR, fall back to exact match
  const network = cidr.slice(0, slash).trim().toLowerCase();
  const prefix = parseInt(cidr.slice(slash + 1), 10);
  if (!Number.isFinite(prefix)) return false;

  const ipIsV6 = ip.includes(":");
  const netIsV6 = network.includes(":");
  if (ipIsV6 !== netIsV6) return false;  // family mismatch
  if (ipIsV6 ? prefix < 0 || prefix > 128 : prefix < 0 || prefix > 32) return false;

  if (ipIsV6) {
    return ipv6InCidr(ip, network, prefix);
  }
  return ipv4InCidr(ip, network, prefix);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    const x = parseInt(part, 10);
    if (!Number.isFinite(x) || x < 0 || x > 255) return null;
    n = (n * 256) + x;
  }
  // Use unsigned shift to ensure 32-bit positive result.
  return n >>> 0;
}

function ipv4InCidr(ip: string, network: string, prefix: number): boolean {
  const ipN = ipv4ToInt(ip);
  const netN = ipv4ToInt(network);
  if (ipN === null || netN === null) return false;
  if (prefix === 0) return true;   // 0.0.0.0/0 — match all
  // Build mask. Shift can't be >=32 in JS (becomes 0); special-case 32.
  const mask = prefix === 32 ? 0xFFFFFFFF : (~((1 << (32 - prefix)) - 1) >>> 0);
  return (ipN & mask) === (netN & mask);
}

function ipv6ToBigInt(ip: string): bigint | null {
  // Accept compressed (::) and full forms; reject mixed v4/v6 and zone IDs.
  const cleaned = ip.split("%")[0]!.toLowerCase().trim();
  if (!/^[0-9a-f:]+$/.test(cleaned)) return null;

  let head: string[] = [];
  let tail: string[] = [];
  if (cleaned.includes("::")) {
    const [h, t] = cleaned.split("::") as [string, string];
    head = h ? h.split(":") : [];
    tail = t ? t.split(":") : [];
    if (head.length + tail.length > 8) return null;
    while (head.length + tail.length < 8) head.push("0");
  } else {
    head = cleaned.split(":");
    if (head.length !== 8) return null;
  }
  const groups = [...head, ...tail];

  let n = 0n;
  for (const g of groups) {
    if (g.length === 0 || g.length > 4) return null;
    const x = parseInt(g, 16);
    if (!Number.isFinite(x) || x < 0 || x > 0xFFFF) return null;
    n = (n << 16n) | BigInt(x);
  }
  return n;
}

function ipv6InCidr(ip: string, network: string, prefix: number): boolean {
  const ipN = ipv6ToBigInt(ip);
  const netN = ipv6ToBigInt(network);
  if (ipN === null || netN === null) return false;
  if (prefix === 0) return true;
  const shift = BigInt(128 - prefix);
  // Mask off low (128 - prefix) bits and compare.
  return (ipN >> shift) === (netN >> shift);
}

/**
 * Validate an IP or CIDR block. Single hosts pass through unchanged;
 * CIDR blocks are normalized (network address re-computed from the
 * provided IP + prefix) so two admins entering "192.168.1.5/24" and
 * "192.168.1.0/24" don't end up with two different rows for the same
 * range.
 *
 *   validateIp("192.168.1.5")      => "192.168.1.5"
 *   validateIp("192.168.1.5/24")   => "192.168.1.0/24"   (canonicalized)
 *   validateIp("2001:db8::5/48")   => "2001:db8::/48"
 *   validateIp("garbage")          => null
 */
export function validateIp(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const slash = trimmed.lastIndexOf("/");
  if (slash >= 0) {
    const ipPart = trimmed.slice(0, slash);
    const prefixStr = trimmed.slice(slash + 1);
    const prefix = parseInt(prefixStr, 10);
    if (!Number.isFinite(prefix) || prefix < 0) return null;
    if (ipPart.includes(":")) {
      if (prefix > 128) return null;
      const n = ipv6ToBigInt(ipPart);
      if (n === null) return null;
      // Canonicalize to network address.
      const shift = BigInt(128 - prefix);
      const netN = prefix === 0 ? 0n : (n >> shift) << shift;
      return `${bigIntToIpv6(netN)}/${prefix}`;
    }
    if (prefix > 32) return null;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipPart)) return null;
    const ipN = ipv4ToInt(ipPart);
    if (ipN === null) return null;
    const mask = prefix === 0 ? 0 : prefix === 32 ? 0xFFFFFFFF : (~((1 << (32 - prefix)) - 1) >>> 0);
    const netN = (ipN & mask) >>> 0;
    return `${intToIpv4(netN)}/${prefix}`;
  }

  // No CIDR — single host.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) {
    const parts = trimmed.split(".").map((p) => parseInt(p, 10));
    if (parts.every((p) => Number.isFinite(p) && p >= 0 && p <= 255)) return trimmed;
    return null;
  }
  // Coarse IPv6 single host.
  if (trimmed.includes(":") && /^[0-9a-f:]+$/.test(trimmed)) {
    if (ipv6ToBigInt(trimmed) === null) return null;
    return trimmed;
  }
  return null;
}

function intToIpv4(n: number): string {
  return [
    (n >>> 24) & 0xFF,
    (n >>> 16) & 0xFF,
    (n >>> 8) & 0xFF,
    n & 0xFF,
  ].join(".");
}

function bigIntToIpv6(n: bigint): string {
  // Render as 8 hex groups. We don't bother running RFC 5952 ::-compaction
  // here — the canonical full form is unambiguous for storage. Display
  // code can pretty-print if desired.
  const groups: string[] = [];
  let x = n;
  for (let i = 0; i < 8; i++) {
    groups.unshift(((x & 0xFFFFn).toString(16)).padStart(0, "0") || "0");
    x >>= 16n;
  }
  return groups.join(":");
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
