// Phase 2 — Auth/Security helpers.
//
// Keeps the gnarly crypto + state-machine logic out of server actions,
// so action files read like business logic rather than primitive soup.
//
// Exports:
//   • hashToken / generateToken        — one-way hashing for reset/verify tokens
//   • base32Encode / base32Decode      — TOTP secret encoding (RFC 4648)
//   • generateTotpSecret               — crypto-strong random 20-byte secret
//   • totpUri                          — otpauth:// URL for authenticator apps
//   • verifyTotp                       — RFC 6238 with ±1 step tolerance
//   • generateRecoveryCodes            — 10 single-use codes, returns {plain, hashes}
//   • recordSecurityEvent              — writes a SecurityEvent row, best-effort
//   • checkLoginLockout                — returns the lockedUntil if present/valid
//   • registerFailedLogin / clearLoginAttempts — lockout state machine
//
// None of these throw on DB failure — security-adjacent bookkeeping never
// kills the request path (same contract as `lib/audit.ts`).

import crypto from "crypto";
import { db } from "@/lib/db";
import type { SecurityEventKind } from "@prisma/client";

// ────────────────────────────────────────────────────────────
// Tokens (reset / verify)
// ────────────────────────────────────────────────────────────

/** 32 random bytes, url-safe. Used as the raw email-link token. */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Deterministic one-way hash we store server-side. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ────────────────────────────────────────────────────────────
// Base32 (RFC 4648) — needed because authenticator apps expect base32.
// We roll our own to avoid an external dep. Handles only what TOTP needs:
// encode random bytes → base32 string (no padding, uppercase), decode
// a cleaned user-pasted secret → bytes.
// ────────────────────────────────────────────────────────────

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_ALPHABET[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(out);
}

// ────────────────────────────────────────────────────────────
// TOTP (RFC 6238) — SHA1, 30s step, 6 digits. Matches what Google
// Authenticator / 1Password / Authy default to.
// ────────────────────────────────────────────────────────────

const TOTP_STEP_SEC = 30;
const TOTP_DIGITS   = 6;
const TOTP_SKEW     = 1; // accept ±1 step (±30s) for clock drift

export function generateTotpSecret(): string {
  // 20 random bytes → 32 base32 chars, the RFC-recommended length.
  return base32Encode(crypto.randomBytes(20));
}

/**
 * Builds the `otpauth://totp/...` URI authenticator apps understand.
 * We don't render a QR code (that'd pull in another dep); we show the
 * URI + the raw secret and let the user either scan a QR from their
 * preferred tool or type the secret in.
 */
export function totpUri(params: { accountName: string; issuer: string; secret: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const qs = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SEC),
  });
  return `otpauth://totp/${label}?${qs.toString()}`;
}

function totpAt(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  // Dynamic truncation — RFC 6238 §5.3
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff);
  const code = bin % 10 ** TOTP_DIGITS;
  return code.toString().padStart(TOTP_DIGITS, "0");
}

/** True if `code` is valid for `secret` within the skew window. */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  const counter = Math.floor(now / 1000 / TOTP_STEP_SEC);
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  for (let i = -TOTP_SKEW; i <= TOTP_SKEW; i++) {
    if (totpAt(secret, counter + i) === clean) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────
// Recovery codes — 10 one-use-each. We return the plain codes so the UI
// can show them once; only hashes persist.
// ────────────────────────────────────────────────────────────

const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    // 10 chars from a restricted alphabet (no 0/O/1/I collisions) —
    // formatted like `ABCD-EFGH` so users can type them without
    // mis-reading.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let raw = "";
    for (let j = 0; j < 10; j++) raw += alphabet[crypto.randomInt(alphabet.length)];
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plain.push(formatted);
    hashes.push(hashToken(formatted));
  }
  return { plain, hashes };
}

/** Returns the new (reduced) hash array if the code matched; null if not. */
export function consumeRecoveryCode(hashes: string[], plain: string): string[] | null {
  const match = hashToken(plain.trim().toUpperCase());
  if (!hashes.includes(match)) return null;
  return hashes.filter((h) => h !== match);
}

// ────────────────────────────────────────────────────────────
// Security event logging
// ────────────────────────────────────────────────────────────

export async function recordSecurityEvent(params: {
  userId: string;
  kind: SecurityEventKind;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.securityEvent.create({
      data: {
        userId: params.userId,
        kind: params.kind,
        metadata: params.metadata as never,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch {
    // Swallow — security bookkeeping must not kill the request path.
  }
}

// ────────────────────────────────────────────────────────────
// Login rate-limit / lockout state machine
// ────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS   = 5;
const LOCKOUT_MINUTES       = 15;

/** Returns a Date if the account is currently locked; null if clear. */
export function lockoutActive(user: { lockedUntil: Date | null }, now = new Date()): Date | null {
  if (!user.lockedUntil) return null;
  return user.lockedUntil > now ? user.lockedUntil : null;
}

/** Called after a bad credential — increments counters, maybe locks. */
export async function registerFailedLogin(userId: string): Promise<{ locked: boolean; until: Date | null }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedLoginCount: true, lockedUntil: true },
  });
  if (!user) return { locked: false, until: null };

  const nextCount = (user.failedLoginCount ?? 0) + 1;
  if (nextCount >= MAX_FAILED_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await db.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: until },
    });
    return { locked: true, until };
  }
  await db.user.update({
    where: { id: userId },
    data: { failedLoginCount: nextCount },
  });
  return { locked: false, until: null };
}

/** Called after a successful login — clears any accumulated state. */
export async function clearLoginAttempts(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

/** Bump sessionVersion to invalidate existing JWTs. */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const u = await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return u.sessionVersion;
}
