"use client";

import * as React from "react";
import { useActionState } from "react";
import { submitNewsletter, type NewsletterState } from "@/app/actions/marketing";

// NewsletterForm — the footer subscribe box.
//
// Small, inline, and fail-closed: if the server rejects (invalid
// email), we show a single-line error under the input. On success we
// replace the input with a thank-you — no toast, no modal.
//
// We intentionally don't ask for name or company in the footer; every
// extra field here kills the conversion rate and we already have the
// email, which is what we need.

const INITIAL: NewsletterState = { ok: false };

export function NewsletterForm() {
  const [state, formAction, pending] = useActionState(submitNewsletter, INITIAL);

  if (state.ok) {
    return (
      <p
        className="text-xs leading-relaxed"
        role="status"
        style={{ color: "var(--success-fg)" }}
      >
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2" id="newsletter">
      {/* Honeypot */}
      <div className="hidden" aria-hidden>
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder="you@shop.com"
          aria-label="Email"
          aria-invalid={state.fieldError ? true : undefined}
          className="ts-focus flex-1 rounded-md px-3 py-2 text-xs outline-none"
          style={{
            background: "var(--surface-0)",
            border: `1px solid ${state.fieldError ? "var(--danger-fg)" : "var(--border-default)"}`,
            color: "var(--text-default)",
          }}
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md px-3 py-2 text-xs font-semibold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          {pending ? "…" : "Subscribe"}
        </button>
      </div>
      {state.fieldError && (
        <p className="text-xs" style={{ color: "var(--danger-fg)" }}>
          {state.fieldError}
        </p>
      )}
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        Monthly-ish. Product updates, shop-running tips. Unsubscribe anytime.
      </p>
    </form>
  );
}
