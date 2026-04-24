// Phase 1 — public-token rate limiter.
//
// Best-effort first line of defense against brute-force scanners on
// our three capability-based public endpoints:
//
//   • `/portal/[token]`  — per-customer portal link
//   • `/q/[token]`       — public quote share link
//   • `/share/[token]`   — invoice / proof share link
//
// The tokens are 25+ char cuid strings so the search space is huge,
// but until this phase there was no request-rate gate at all — a
// scripted attacker could hammer `findUnique` as fast as the DB could
// answer. This module caps the request rate per-IP per-kind in a
// sliding window and returns a generic "not found" outcome when the
// cap is exceeded so we don't leak whether any particular token
// existed.
//
// Implementation notes:
//
//   • Module-scoped `Map` — simplest thing that works. On Vercel this
//     means per-lambda-replica state; a determined attacker who lands
//     on a fresh cold container gets a fresh budget. That's acceptable
//     as a first line — real production-grade throttle will be
//     Upstash/Redis and is tracked as a Phase 8+ follow-up.
//
//   • We key on an IP *prefix* (first 3 octets of IPv4, first 64 bits
//     of IPv6) so that shared NAT pools don't accidentally collude to
//     help an attacker while also not giving each user their own
//     independent budget. Good-enough heuristic.
//
//   • We prune timestamps older than the window on every call — no
//     background sweeper needed; the memory is bounded by active
//     callers × window length.
//
//   • `ip` may be null (e.g., unit test, or header missing). In that
//     case we key on a constant `"unknown"` bucket — the bucket fills
//     fast but legitimate callers with proper headers aren't affected.
//
// Tuning: 60 requests per rolling 60s per (kind, ipPrefix). A real
// user navigating the portal issues ~1-5 requests; a browser
// prefetching doesn't cross 20. 60 gives headroom for tabs + reloads
// but chokes a scripted scanner.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 60;

type Kind = "portal" | "quote" | "share";

// Key: `${kind}:${ipPrefix}`. Value: sorted timestamps (ms epoch).
const buckets = new Map<string, number[]>();

export interface RateCheckOk {
  ok: true;
}
export interface RateCheckBlocked {
  ok: false;
  retryAfterMs: number;
}

export type RateCheckResult = RateCheckOk | RateCheckBlocked;

export function checkPublicTokenRate(params: {
  ip: string | null | undefined;
  kind: Kind;
}): RateCheckResult {
  const prefix = ipPrefix(params.ip);
  const key = `${params.kind}:${prefix}`;
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  const existing = buckets.get(key) ?? [];
  // Prune stale entries in-place; the sorted-ascending invariant lets
  // us slice rather than filter once we find the first in-window entry.
  let firstInWindow = 0;
  while (firstInWindow < existing.length && existing[firstInWindow] <= cutoff) {
    firstInWindow++;
  }
  const live = firstInWindow === 0 ? existing : existing.slice(firstInWindow);

  if (live.length >= RATE_MAX_PER_WINDOW) {
    // Oldest live timestamp determines when the caller can try again.
    const retryAfterMs = Math.max(1, RATE_WINDOW_MS - (now - live[0]));
    buckets.set(key, live);
    return { ok: false, retryAfterMs };
  }

  live.push(now);
  buckets.set(key, live);
  return { ok: true };
}

/**
 * Extract an IP prefix suitable for rate-limit keying.
 * IPv4: first 3 octets (`a.b.c`).
 * IPv6: first 4 hextets joined (~first 64 bits).
 * Anything else: the literal `"unknown"` sentinel.
 */
function ipPrefix(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const trimmed = raw.trim();
  if (!trimmed) return "unknown";

  if (trimmed.includes(":")) {
    // IPv6
    const hextets = trimmed.split(":");
    return hextets.slice(0, 4).join(":");
  }
  const parts = trimmed.split(".");
  if (parts.length === 4) return parts.slice(0, 3).join(".");
  return trimmed;
}

/**
 * Read the client IP from a Next.js request-scoped headers bag.
 *
 * Vercel sets `x-forwarded-for` with a comma-separated chain; the
 * first entry is the original client. `x-real-ip` is a fallback used
 * by some edge runtimes and by local dev proxies.
 *
 * Accepts either the `Headers` object or a `ReadonlyHeaders` (which
 * `next/headers`'s async `headers()` returns in Next 15) — both
 * expose a `.get()` method with the same shape.
 */
export function readClientIp(
  headers: { get(name: string): string | null },
): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  return null;
}

// ── Test-only hook ─────────────────────────────────────────────────
// Consumers in tests can reset the store between cases. Not exported
// from a barrel so application code won't stumble on it.
export function __resetPublicRateLimitForTests(): void {
  buckets.clear();
}
