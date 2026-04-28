"use client";

import * as React from "react";
import Link from "next/link";

// GDPR-style cookie consent banner.
//
// Stores the visitor's choice in localStorage so it doesn't reappear
// on every navigation. Two-tier consent:
//
//   "accepted"  → analytics beacon fires (page views recorded)
//   "rejected"  → analytics never fires; banner stays dismissed
//
// The Tracker component reads the same localStorage key before
// posting to /api/track, so visitors who click "Reject" are never
// tracked anywhere.
//
// Privacy posture:
//   - No cookies are actually set by us — we use localStorage only.
//   - Strictly necessary tech (auth session cookie) is unaffected by
//     the banner, since it's required for using the service at all.
//   - The banner only governs OPTIONAL analytics tracking.

const STORAGE_KEY = "ts.cookieConsent";
const VERSION = "1";

type Consent = "accepted" | "rejected";
type StoredConsent = { value: Consent; version: string; at: number };

export function getStoredConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.version !== VERSION) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function storeConsent(value: Consent) {
  try {
    const payload: StoredConsent = { value, version: VERSION, at: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    // Same-tab listeners (the Tracker) need a manual cue —
    // localStorage events don't fire in the tab that wrote them.
    window.dispatchEvent(new CustomEvent("ts:consent-changed", { detail: value }));
  } catch {
    // Private mode etc — fail silently; user can re-consent next visit.
  }
}

export function CookieBanner() {
  // Render-suppress until mount so SSR + first paint don't flash the
  // banner for users who already consented (the localStorage check
  // can only happen client-side).
  const [mounted, setMounted] = React.useState(false);
  const [decision, setDecision] = React.useState<Consent | null>(null);

  React.useEffect(() => {
    setDecision(getStoredConsent());
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (decision !== null) return null;

  const accept = () => {
    storeConsent("accepted");
    setDecision("accepted");
  };
  const reject = () => {
    storeConsent("rejected");
    setDecision("rejected");
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[var(--z-modal)] px-4 pb-4"
    >
      <div
        className="mx-auto max-w-3xl rounded-xl px-5 py-4 shadow-xl sm:flex sm:items-start sm:gap-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="min-w-0 flex-1 text-sm">
          <p style={{ color: "var(--text-default)" }} className="font-medium">
            We use cookies & analytics.
          </p>
          <p
            className="mt-1 leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Flowtora uses a small first-party analytics tool to understand
            which marketing pages are most useful — no third-party trackers,
            no advertising cookies, no cross-site profiling. You can decline
            and the site will still work the same.{" "}
            <Link
              href="/legal/privacy"
              className="underline"
              style={{ color: "var(--text-default)" }}
            >
              Privacy policy
            </Link>
            .
          </p>
        </div>
        <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
          <button
            type="button"
            onClick={reject}
            className="ts-focus rounded-md px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
            }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="ts-focus rounded-md px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
              border: "1px solid var(--accent-primary)",
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
