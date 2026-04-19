"use client";

import { useState } from "react";
import { sendInitialVerification } from "@/app/actions/account-security";

// Phase 2 — "please confirm your email" banner.
//
// Lives above workspace content until the user clicks the link in their
// inbox. We keep it client-side so it can show a "Sent — check your
// inbox" confirmation without navigating, and can be dismissed for the
// current tab (we don't persist the dismissal — the next tenant load
// reasserts the nudge, which is the point).

export function UnverifiedEmailBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function resend() {
    if (pending || sent) return;
    setPending(true);
    try {
      await sendInitialVerification();
      setSent(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="mb-6 flex items-start justify-between gap-4 rounded-md px-4 py-3 text-sm"
      style={{
        background: "var(--warning-surface)",
        color: "var(--warning-fg)",
        border: "1px solid var(--warning-fg)",
      }}
    >
      <div className="min-w-0">
        <div className="font-medium">Confirm your email address</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          We sent a link to <strong>{email}</strong>. Some features stay
          read-only until you confirm — and password recovery won&apos;t reach
          you without it.
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={pending || sent}
          className="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60"
          style={{
            background: "var(--warning-fg)",
            color: "white",
            border: "1px solid var(--warning-fg)",
          }}
        >
          {sent ? "Sent ✓" : pending ? "Sending…" : "Resend link"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md px-2 py-1.5 text-xs"
          style={{ color: "var(--text-muted)" }}
          aria-label="Dismiss"
          title="Dismiss for this tab"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
