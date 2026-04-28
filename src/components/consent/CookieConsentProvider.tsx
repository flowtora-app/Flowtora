"use client";

import * as React from "react";
import {
  readConsent,
  writeConsent,
  buildAcceptAll,
  buildRejectAll,
  buildCustom,
  logConsentToServer,
  ALL_OFF,
  type ConsentCategories,
  type StoredConsent,
  type CategoryKey,
} from "@/lib/cookie-consent";

// React context wrapping the cookie-consent state machine.
//
// Mounted once, near the root of every public-facing layout (marketing,
// auth, portal, share). All consent-aware components read state via
// `useConsent()` instead of poking localStorage directly so:
//   1. SSR + hydration are consistent
//   2. State changes propagate in the same tab without a reload
//   3. Cross-tab sync is centralized (one storage listener)

interface ConsentContextValue {
  /** Resolved decision; null means the visitor hasn't decided yet. */
  consent: StoredConsent | null;
  /** True after the initial localStorage read has happened. */
  hydrated: boolean;
  /** True when the preferences modal is open. */
  preferencesOpen: boolean;

  /** Open the preferences modal — used by ManageCookies button. */
  openPreferences: () => void;
  /** Close the preferences modal without saving. */
  closePreferences: () => void;

  acceptAll: () => void;
  rejectAll: () => void;
  saveCustom: (cats: ConsentCategories) => void;
  /** Wipe the decision so the banner shows again. Used by "Withdraw consent". */
  withdraw: () => void;

  /** Convenience predicate. Necessary always returns true. */
  isAllowed: (k: CategoryKey) => boolean;
}

const ConsentContext = React.createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const ctx = React.useContext(ConsentContext);
  if (!ctx) {
    // Falls through gracefully when accessed outside a provider —
    // returns a "no consent yet, no-op" object so SSR and any stray
    // call sites don't crash.
    return {
      consent: null,
      hydrated: false,
      preferencesOpen: false,
      openPreferences: () => {},
      closePreferences: () => {},
      acceptAll: () => {},
      rejectAll: () => {},
      saveCustom: () => {},
      withdraw: () => {},
      isAllowed: (k) => k === "necessary",
    };
  }
  return ctx;
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = React.useState<StoredConsent | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);

  // Initial load + cross-tab sync.
  React.useEffect(() => {
    setConsent(readConsent());
    setHydrated(true);

    const onLocalChange = (e: Event) => {
      const detail = (e as CustomEvent<StoredConsent>).detail;
      setConsent(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ts.cookieConsent") setConsent(readConsent());
    };
    window.addEventListener("ts:consent-changed", onLocalChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ts:consent-changed", onLocalChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const apply = React.useCallback((next: StoredConsent) => {
    writeConsent(next);
    setConsent(next);
    logConsentToServer(next);
  }, []);

  const value: ConsentContextValue = React.useMemo(() => ({
    consent,
    hydrated,
    preferencesOpen,
    openPreferences: () => setPreferencesOpen(true),
    closePreferences: () => setPreferencesOpen(false),
    acceptAll: () => {
      apply(buildAcceptAll());
      setPreferencesOpen(false);
    },
    rejectAll: () => {
      apply(buildRejectAll());
      setPreferencesOpen(false);
    },
    saveCustom: (cats) => {
      apply(buildCustom(cats));
      setPreferencesOpen(false);
    },
    withdraw: () => {
      // Record a "withdrawn" decision in the audit log, then wipe the
      // local state so the banner reappears on next render. We log
      // the withdrawal as a snapshot of "all off" + a special
      // decision label so the DB row says "they took it back" rather
      // than disappearing from history entirely.
      const stamp: StoredConsent = {
        ...buildRejectAll(),
        decision: "withdrawn",
        categories: { ...ALL_OFF },
      };
      logConsentToServer(stamp);
      try { window.localStorage.removeItem("ts.cookieConsent"); } catch {}
      try {
        document.cookie = "ts_consent=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      } catch {}
      setConsent(null);
      setPreferencesOpen(false);
    },
    isAllowed: (k) => {
      if (k === "necessary") return true;
      if (!consent) return false;
      return Boolean(consent.categories[k]);
    },
  }), [consent, hydrated, preferencesOpen, apply]);

  return (
    <ConsentContext.Provider value={value}>
      {children}
    </ConsentContext.Provider>
  );
}
