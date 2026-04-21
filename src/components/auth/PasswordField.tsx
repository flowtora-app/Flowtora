"use client";

import { useId, useState } from "react";
import {
  checkPassword,
  scorePassword,
  PASSWORD_SCORE_LABEL,
  type PasswordScore,
} from "@/lib/password";

// Password input with live UX:
//   - show/hide toggle (eye icon)
//   - 4-segment strength meter driven by scorePassword()
//   - 3-row requirements checklist that ticks off as the user types
// The underlying <input> still fires the same `name="password"` so
// the server action receives it unchanged; validation happens
// server-side via the shared passwordSchema. This component only
// shows what's required so users can pick something valid on the
// first try instead of submitting and bouncing off an error banner.

// Map score → fill color for the meter. Kept as design-token vars
// so the same component works under the light + dark themes.
const METER_COLOR: Record<PasswordScore, string> = {
  0: "var(--border-default)",
  1: "var(--danger-fg)",
  2: "var(--accent-primary)",
  3: "var(--accent-primary)",
  4: "var(--success-fg)",
};

// Fraction of the bar filled per score. We always render 4 segments
// so the geometry stays stable; the filled count communicates progress.
const METER_FILL: Record<PasswordScore, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
};

export function PasswordField({
  name = "password",
  label = "Password",
  required = true,
  autoComplete = "new-password",
  defaultValue = "",
  // When false, renders just the input + show/hide toggle — no
  // meter, no checklist. Used for "confirm password" fields where
  // the UI would be noisy + redundant with the primary field.
  showStrength = true,
  // Disables the 10-char minLength attribute. Useful for the
  // "current password" field inside the change-password form,
  // which might be an OLD password that predates the new rules.
  enforceMinLength = true,
}: {
  name?: string;
  label?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  showStrength?: boolean;
  enforceMinLength?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [show, setShow] = useState(false);

  const checks = checkPassword(value);
  const score = scorePassword(value);
  const hasInput = value.length > 0;

  return (
    <div>
      <label className="block" htmlFor={id}>
        <span
          className="mb-1 block text-sm font-medium"
          style={{ color: "var(--text-default)" }}
        >
          {label}
          {required && (
            <span
              aria-hidden
              className="ml-1"
              style={{ color: "var(--accent-primary)" }}
            >
              *
            </span>
          )}
        </span>

        <div className="relative">
          <input
            id={id}
            type={show ? "text" : "password"}
            name={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required={required}
            minLength={enforceMinLength ? 10 : undefined}
            maxLength={200}
            autoComplete={autoComplete}
            aria-describedby={
              showStrength ? `${id}-strength ${id}-checks` : undefined
            }
            className="ts-focus w-full rounded-md px-3 py-2.5 pr-10 text-sm outline-none transition-colors"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="ts-focus absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </label>

      {/* Strength meter + checklist. Opt-out via showStrength={false}
          for "confirm password" / "current password" fields where the
          UX would be redundant. */}
      {showStrength && (
        <>
      {/* Strength meter — 4 segments that fill progressively. Stays
          grey/hidden-label until the user starts typing so we don't
          scream "Too weak" at an empty field. */}
      <div
        id={`${id}-strength`}
        aria-live="polite"
        className="mt-2 flex items-center gap-2"
      >
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{
                background:
                  i < METER_FILL[score]
                    ? METER_COLOR[score]
                    : "var(--border-subtle)",
              }}
            />
          ))}
        </div>
        {hasInput && (
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: METER_COLOR[score] }}
          >
            {PASSWORD_SCORE_LABEL[score]}
          </span>
        )}
      </div>

      {/* Requirements checklist. `notCommon` only surfaces when it's
          actually failing — no need to brag that "your password isn't
          the literal word 'password'". */}
      <ul
        id={`${id}-checks`}
        className="mt-2 space-y-1 text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <Check ok={checks.minLength} label="At least 10 characters" />
        <Check ok={checks.hasLetter} label="Contains a letter" />
        <Check ok={checks.hasNumber} label="Contains a number" />
        {hasInput && !checks.notCommon && (
          <li
            className="flex items-start gap-1.5"
            style={{ color: "var(--danger-fg)" }}
          >
            <span aria-hidden>✗</span>
            <span>That password is too common — pick something less guessable.</span>
          </li>
        )}
      </ul>
        </>
      )}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className="flex items-start gap-1.5"
      style={{ color: ok ? "var(--success-fg)" : "var(--text-muted)" }}
    >
      <span aria-hidden className="inline-block w-3 text-center">
        {ok ? "✓" : "•"}
      </span>
      <span>{label}</span>
    </li>
  );
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-10-7-10-7a19.77 19.77 0 0 1 4.22-5.94" />
      <path d="M9.9 4.24A10.78 10.78 0 0 1 12 4c7 0 10 7 10 7a19.82 19.82 0 0 1-3.46 4.53" />
      <path d="M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" />
    </svg>
  );
}
