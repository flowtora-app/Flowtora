"use client";

import * as React from "react";
import Link from "next/link";
import { useConsent } from "./CookieConsentProvider";
import {
  ALL_CATEGORIES,
  ALL_OFF,
  CATEGORY_META,
  type CategoryKey,
  type ConsentCategories,
} from "@/lib/cookie-consent";

// Three-button GDPR consent banner.
//
//   [Reject all]  [Customize]   [Accept all]
//
// Visible only when the visitor hasn't decided yet (or after they
// withdraw consent). Hidden as soon as a stored decision exists at
// the current policy version. The "Customize" button opens the
// PreferencesModal which renders the per-category toggles.
//
// Compliance posture:
//   - Reject is just as visually weighted as Accept (no dark patterns)
//   - All optional toggles default OFF inside the modal
//   - Decision is stored on click; user can revisit any time via
//     ManageCookiesButton in the footer
//   - Banner persists across navigation until a decision is made

export function CookieBanner() {
  const { consent, hydrated, preferencesOpen, acceptAll, rejectAll, openPreferences } =
    useConsent();

  // Render-suppress until we've synced with localStorage so we don't
  // flash the banner on hydration for visitors who already consented.
  if (!hydrated) return null;
  if (consent !== null) return null;
  if (preferencesOpen) return null; // modal takes over while open

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[var(--z-modal)] px-4 pb-4"
    >
      <div
        className="mx-auto max-w-4xl rounded-2xl px-6 py-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="min-w-0 flex-1">
            <p
              className="text-base font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              We use cookies
            </p>
            <p
              className="mt-1.5 text-sm leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              We use a small set of first-party cookies to keep you signed in
              and (optionally) understand which marketing pages help most.
              No third-party trackers, no advertising cookies, no cross-site
              profiling.{" "}
              <Link
                href="/legal/cookies"
                className="underline"
                style={{ color: "var(--text-default)" }}
              >
                Cookie policy
              </Link>
              .
            </p>
          </div>

          <div
            className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center"
            role="group"
            aria-label="Consent choices"
          >
            <button
              type="button"
              onClick={rejectAll}
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Reject all
            </button>
            <button
              type="button"
              onClick={openPreferences}
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: "transparent",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              Customize
            </button>
            <button
              type="button"
              onClick={acceptAll}
              className="ts-focus rounded-md px-4 py-2 text-sm font-semibold transition-colors"
              style={{
                background: "var(--accent-primary)",
                color: "var(--accent-fg)",
                border: "1px solid var(--accent-primary)",
              }}
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Preferences modal — per-category toggles. Opens from "Customize"
// on the banner OR from the "Manage cookies" footer link.
// ───────────────────────────────────────────────────────────────────

export function PreferencesModal() {
  const { consent, preferencesOpen, closePreferences, saveCustom } = useConsent();

  // Local pending state so toggles can be flipped without committing
  // until the user clicks "Save". Defaults: existing decision if any,
  // otherwise everything OFF (compliant — no pre-checked optionals).
  const [pending, setPending] = React.useState<ConsentCategories>(() =>
    consent?.categories ?? { ...ALL_OFF },
  );

  // Re-sync on open: if the user opens the modal a second time, show
  // their current saved state, not stale local pending state.
  React.useEffect(() => {
    if (preferencesOpen) {
      setPending(consent?.categories ?? { ...ALL_OFF });
    }
  }, [preferencesOpen, consent]);

  // Body scroll lock + Esc-to-close while open.
  React.useEffect(() => {
    if (!preferencesOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreferences();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [preferencesOpen, closePreferences]);

  if (!preferencesOpen) return null;

  const toggle = (k: CategoryKey) => {
    if (k === "necessary") return; // can't disable
    setPending((p) => ({ ...p, [k]: !p[k] }));
  };

  const acceptAllInModal = () => {
    setPending({ necessary: true, analytics: true, marketing: true, preferences: true });
  };
  const rejectAllInModal = () => {
    setPending({ ...ALL_OFF });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-prefs-title"
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center px-4 py-6"
    >
      <button
        type="button"
        aria-label="Close preferences"
        onClick={closePreferences}
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.55)" }}
      />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-6 py-5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div>
            <h2
              id="cookie-prefs-title"
              className="text-base font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              Cookie preferences
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Choose which categories of cookies you allow. You can change this any time
              from the footer of every page.
            </p>
          </div>
          <button
            type="button"
            onClick={closePreferences}
            aria-label="Close"
            className="ts-focus inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors"
            style={{
              color: "var(--text-muted)",
              background: "transparent",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={rejectAllInModal}
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Reject all optional
            </button>
            <button
              type="button"
              onClick={acceptAllInModal}
              className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Accept all
            </button>
          </div>

          <ul className="space-y-3">
            {ALL_CATEGORIES.map((key) => {
              const meta = CATEGORY_META[key];
              const checked = pending[key];
              const required = meta.required === true;
              return (
                <li
                  key={key}
                  className="rounded-lg p-4"
                  style={{
                    background: "var(--surface-0)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-default)" }}
                        >
                          {meta.label}
                        </span>
                        {required && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                            style={{
                              background: "var(--surface-2)",
                              color: "var(--text-muted)",
                            }}
                          >
                            Always on
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {meta.description}
                      </p>
                    </div>
                    <Toggle
                      ariaLabel={`Toggle ${meta.label}`}
                      disabled={required}
                      checked={checked}
                      onChange={() => toggle(key)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <footer
          className="flex items-center justify-between gap-3 px-6 py-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <Link
            href="/legal/cookies"
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
            onClick={closePreferences}
          >
            Read the full cookie policy
          </Link>
          <button
            type="button"
            onClick={() => saveCustom(pending)}
            className="ts-focus rounded-md px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
              border: "1px solid var(--accent-primary)",
            }}
          >
            Save preferences
          </button>
        </footer>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  // Visual state: accent-filled track + slid thumb when on; muted
  // outline + left thumb when off; opacity dim + cursor not-allowed
  // when "Always on" (necessary).
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      disabled={disabled}
      className="ts-focus relative inline-flex shrink-0 items-center rounded-full transition-colors"
      style={{
        width: 36,
        height: 20,
        background: checked ? "var(--accent-primary)" : "var(--surface-3)",
        border: `1px solid ${checked ? "var(--accent-primary)" : "var(--border-default)"}`,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        aria-hidden
        className="absolute top-1/2 block rounded-full transition-transform"
        style={{
          width: 14,
          height: 14,
          left: 2,
          transform: `translate(${checked ? 14 : 0}px, -50%)`,
          background: checked ? "var(--accent-fg)" : "var(--surface-1)",
          boxShadow: "var(--shadow-sm)",
        }}
      />
    </button>
  );
}
