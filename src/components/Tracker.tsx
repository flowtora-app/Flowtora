"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useConsent } from "@/components/consent/CookieConsentProvider";

// Page-view beacon — mounted only inside public marketing-style
// layouts (marketing site, auth pages, customer portal, share links).
// Authenticated tenant app and platform-admin layouts never include
// the Tracker, so internal navigation isn't recorded as visitor data.
//
// Behavior:
//   - On mount + every pathname change, POST to /api/track
//   - Only fires when the visitor has consented to ANALYTICS
//     specifically — necessary-only or all-rejected visitors are
//     never tracked
//   - Reactive to consent changes via the CookieConsentProvider
//     context (no manual storage listeners needed)
//   - Generates a UUIDv4 sessionId on first call, persists in
//     localStorage so the same browser session de-dups on the server
//
// We use sendBeacon when available (more reliable on tab close) and
// fall back to fetch with keepalive everywhere else.

const SESSION_KEY = "ts.sessionId";
const ENDPOINT = "/api/track";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / blocked storage — fall back to a per-call id
    // (loses session continuity but the row still records).
    return crypto.randomUUID();
  }
}

function sendBeacon(payload: { path: string; referrer: string; sessionId: string }) {
  const body = JSON.stringify(payload);
  // navigator.sendBeacon survives tab-close races; preferred when
  // available. Falls back to keepalive fetch (also tab-close safe in
  // modern browsers) — both queue the request without blocking the
  // page's continuation.
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    } catch {
      // Fallthrough to fetch.
    }
  }
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function Tracker() {
  const pathname = usePathname();
  const { isAllowed, hydrated } = useConsent();
  const allowed = hydrated && isAllowed("analytics");

  // Beacon on every consented pathname change. Two guards:
  //   - hydrated, so we don't fire before the localStorage read
  //   - isAllowed("analytics"), so a visitor who accepted only
  //     necessary cookies is never tracked
  React.useEffect(() => {
    if (!allowed) return;
    if (!pathname) return;
    sendBeacon({
      path: pathname,
      referrer: typeof document !== "undefined" ? document.referrer : "",
      sessionId: getOrCreateSessionId(),
    });
  }, [pathname, allowed]);

  return null;
}
