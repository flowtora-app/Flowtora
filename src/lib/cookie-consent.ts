// Cookie-consent storage + helpers — the single source of truth
// for the granular GDPR consent system.
//
// Storage hierarchy:
//   1. localStorage   → primary; survives reloads, available to client JS
//   2. document.cookie → mirror; allows the document layer to read the
//                        decision before React mounts (e.g. inline
//                        third-party scripts can branch on the cookie)
//   3. ConsentLog DB  → server-side audit trail for legal proof
//
// All three are best-effort and stay loosely consistent. localStorage
// is the user-facing source; the cookie + DB are derived. If they
// diverge for any reason (private mode, blocked cookies, network
// error on the audit POST) the visible UX still works — the user is
// never blocked, and consent state is never silently weakened.

// ── Versioning ─────────────────────────────────────────────────────
//
// Bump CONSENT_VERSION when cookie-policy text materially changes
// (new categories, new third parties, scope expansion, etc.). Stored
// decisions older than the current version get treated as "no
// decision" so the visitor sees the banner again — required by GDPR.
export const CONSENT_VERSION = "2";

// ── Categories ─────────────────────────────────────────────────────

export type CategoryKey =
  | "necessary"
  | "analytics"
  | "marketing"
  | "preferences";

export interface ConsentCategories {
  /** Necessary cookies are always on — no consent required by GDPR. */
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

export const CATEGORY_META: Record<
  CategoryKey,
  { label: string; description: string; required?: boolean }
> = {
  necessary: {
    label: "Strictly necessary",
    description:
      "Required for the site to work — auth sessions, security, and remembering your cookie choice. Always on; can't be disabled.",
    required: true,
  },
  analytics: {
    label: "Analytics",
    description:
      "Helps us understand which marketing pages are most useful so we can improve the site. First-party only — no Google Analytics, no third-party trackers.",
  },
  marketing: {
    label: "Marketing",
    description:
      "Tracking pixels and remarketing tags. Currently unused on Flowtora; reserved for if we add a paid-ads campaign later.",
  },
  preferences: {
    label: "Preferences",
    description:
      "Remembers UI choices like theme and language between visits. Disabling means those reset every time you return.",
  },
};

export const ALL_CATEGORIES: CategoryKey[] = [
  "necessary",
  "analytics",
  "marketing",
  "preferences",
];

// ── Stored shape ───────────────────────────────────────────────────

export type ConsentDecision =
  | "accepted-all"
  | "rejected-all"
  | "custom"
  | "withdrawn";

export interface StoredConsent {
  version: string;
  decision: ConsentDecision;
  categories: ConsentCategories;
  /** Epoch ms when the decision was recorded. */
  at: number;
  /** Browser-stable UUID, used to correlate decisions in the audit log. */
  anonymousId: string;
}

// Helper preset constructors.
export const ALL_OFF: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

export const ALL_ON: ConsentCategories = {
  necessary: true,
  analytics: true,
  marketing: true,
  preferences: true,
};

// ── Storage keys ───────────────────────────────────────────────────

const LS_KEY = "ts.cookieConsent";
const LS_ANON_KEY = "ts.cookieConsent.anonId";
const COOKIE_NAME = "ts_consent";
const COOKIE_MAX_AGE_DAYS = 365;

// ── Anonymous ID ───────────────────────────────────────────────────

/**
 * Get-or-create a stable browser-scoped UUID. Used as the
 * `anonymousId` on consent log rows so the same browser's full
 * consent history is queryable without identifying the person.
 */
export function getOrCreateAnonymousId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(LS_ANON_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(LS_ANON_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

// ── Read ───────────────────────────────────────────────────────────

/**
 * Load the visitor's consent decision from localStorage. Returns
 * `null` for first-time visitors and for stale-version decisions
 * (which need re-consent under GDPR).
 *
 * Quietly migrates v1 entries (the previous bare "accepted"/"rejected"
 * shape) to the v2 categorical shape so existing visitors don't get
 * re-prompted just because we changed our internal representation.
 */
export function readConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | StoredConsent
      | { version: "1"; value: "accepted" | "rejected"; at?: number };

    // v1 → v2 migration. v1 only had a single global decision; we
    // map it to the equivalent v2 categorical state and rewrite.
    if (parsed.version === "1" && "value" in parsed) {
      const migrated: StoredConsent = {
        version: CONSENT_VERSION,
        decision: parsed.value === "accepted" ? "accepted-all" : "rejected-all",
        categories: parsed.value === "accepted" ? { ...ALL_ON } : { ...ALL_OFF },
        at: parsed.at ?? Date.now(),
        anonymousId: getOrCreateAnonymousId(),
      };
      writeConsent(migrated);
      return migrated;
    }

    if ((parsed as StoredConsent).version !== CONSENT_VERSION) return null;
    return parsed as StoredConsent;
  } catch {
    return null;
  }
}

// ── Write ──────────────────────────────────────────────────────────

/**
 * Persist a decision to localStorage + the mirror cookie. Broadcasts
 * a `ts:consent-changed` custom event so listeners (the analytics
 * Tracker, ConsentGate, etc.) react in the same tab without needing
 * a reload.
 */
export function writeConsent(consent: StoredConsent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(consent));
  } catch { /* private mode etc. */ }

  // Mirror to a cookie so server-rendered code can read decision
  // state without round-tripping through the client. Lax SameSite
  // because we want it sent on top-level navigations from external
  // links (so the marketing site honors the choice on first SSR).
  try {
    const expires = new Date(
      Date.now() + COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    ).toUTCString();
    document.cookie =
      `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(consent))}; ` +
      `path=/; expires=${expires}; SameSite=Lax`;
  } catch { /* fall through */ }

  try {
    window.dispatchEvent(
      new CustomEvent<StoredConsent>("ts:consent-changed", { detail: consent }),
    );
  } catch { /* ignore */ }
}

// ── Convenience ────────────────────────────────────────────────────

export function hasConsent(category: CategoryKey, c: StoredConsent | null): boolean {
  if (category === "necessary") return true;
  if (!c) return false;
  return Boolean(c.categories[category]);
}

export function buildAcceptAll(): StoredConsent {
  return {
    version: CONSENT_VERSION,
    decision: "accepted-all",
    categories: { ...ALL_ON },
    at: Date.now(),
    anonymousId: getOrCreateAnonymousId(),
  };
}

export function buildRejectAll(): StoredConsent {
  return {
    version: CONSENT_VERSION,
    decision: "rejected-all",
    categories: { ...ALL_OFF },
    at: Date.now(),
    anonymousId: getOrCreateAnonymousId(),
  };
}

export function buildCustom(categories: ConsentCategories): StoredConsent {
  // Decide which decision label to record — "accepted-all" if every
  // optional category is on, "rejected-all" if all off, "custom" otherwise.
  const optional = (Object.keys(categories) as CategoryKey[])
    .filter((k) => k !== "necessary")
    .map((k) => categories[k]);
  const allOn = optional.every((v) => v === true);
  const allOff = optional.every((v) => v === false);
  return {
    version: CONSENT_VERSION,
    decision: allOn ? "accepted-all" : allOff ? "rejected-all" : "custom",
    categories: { ...categories, necessary: true },
    at: Date.now(),
    anonymousId: getOrCreateAnonymousId(),
  };
}

// ── Audit POST ─────────────────────────────────────────────────────

/**
 * Send a fire-and-forget POST to the audit endpoint so a permanent
 * record exists in the DB. Never throws — analytics and audit code
 * shouldn't poison the visitor's experience if the network blips.
 */
export function logConsentToServer(consent: StoredConsent): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(consent);
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/consent", blob);
      if (ok) return;
    } catch { /* fall through */ }
  }
  void fetch("/api/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
