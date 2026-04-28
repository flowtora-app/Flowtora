"use client";

import * as React from "react";
import { useConsent } from "./CookieConsentProvider";
import type { CategoryKey } from "@/lib/cookie-consent";

// Conditionally renders its children based on whether the visitor
// has consented to a specific category. Use this to gate non-essential
// scripts and components — they simply don't mount until the user
// opts in, and they unmount cleanly if consent is revoked.
//
// Examples:
//
//   <ConsentGate category="analytics">
//     <Script src="https://example.com/analytics.js" strategy="afterInteractive" />
//   </ConsentGate>
//
//   <ConsentGate category="marketing">
//     <MetaPixel />
//   </ConsentGate>
//
//   <ConsentGate category="preferences" fallback={<DefaultThemeProvider />}>
//     <RememberThemeProvider />
//   </ConsentGate>
//
// "necessary" gates always render their children since necessary
// cookies don't require consent under GDPR.

export interface ConsentGateProps {
  category: CategoryKey;
  children: React.ReactNode;
  /** Optional fallback rendered when consent is missing or revoked. */
  fallback?: React.ReactNode;
}

export function ConsentGate({ category, children, fallback }: ConsentGateProps) {
  const { isAllowed, hydrated } = useConsent();

  // Pre-hydration we don't yet know what the visitor consented to.
  // Render the fallback (or null) rather than briefly loading a
  // tracker that would have to be unloaded on hydration. Better safe.
  if (!hydrated) return <>{fallback ?? null}</>;
  if (!isAllowed(category)) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
