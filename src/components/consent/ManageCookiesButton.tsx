"use client";

import * as React from "react";
import { useConsent } from "./CookieConsentProvider";

// Footer link that reopens the cookie preferences modal. Shown on
// every public page so visitors can change or revoke their decision
// at any time — a GDPR requirement (easy withdrawal of consent).

export function ManageCookiesButton({
  className,
  label = "Manage cookies",
}: {
  className?: string;
  label?: string;
}) {
  const { openPreferences } = useConsent();
  return (
    <button
      type="button"
      onClick={openPreferences}
      className={className}
      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
