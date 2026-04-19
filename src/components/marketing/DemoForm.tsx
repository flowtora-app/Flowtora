"use client";

import * as React from "react";
import { useActionState } from "react";
import { submitDemoRequest, type DemoRequestState } from "@/app/actions/marketing";

// DemoForm — the client surface of /book-demo.
//
// Longer than ContactForm because we're asking for enough info to
// propose a time slot without a follow-up email: name, email, company,
// role, team size, business type, preferred time window, and timezone.
// Everything past the first two is nice-to-have so we don't gate the
// conversion on perfect data.
//
// We detect the timezone from the browser and prefill it. If the user
// is wrong (traveling, VPN) they can edit.

const INITIAL: DemoRequestState = { ok: false };

export function DemoForm() {
  const [state, formAction, pending] = useActionState(submitDemoRequest, INITIAL);
  const [detectedTz, setDetectedTz] = React.useState<string>("");

  React.useEffect(() => {
    try {
      // Fall back to UTC if the browser refuses to cough up a zone.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setDetectedTz(tz);
    } catch {
      /* noop */
    }
  }, []);

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-xl p-10 text-center"
        style={{
          background: "var(--success-surface)",
          border: "1px solid var(--success-fg)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{ background: "var(--success-fg)", color: "var(--accent-fg)" }}
        >
          ✓
        </div>
        <h3 className="text-2xl font-semibold" style={{ color: "var(--text-default)" }}>
          Demo request received
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {state.message}
        </p>
        <p className="mx-auto mt-4 max-w-md text-xs" style={{ color: "var(--text-faint)" }}>
          Can&apos;t wait? Start the{" "}
          <a href="/signup" className="underline" style={{ color: "var(--accent-primary)" }}>
            free 14-day trial
          </a>{" "}
          now — your demo call will build on the workspace you set up.
        </p>
      </div>
    );
  }

  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {/* Honeypot — bots fill it, real users never see it. */}
      <div className="hidden" aria-hidden>
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Your name" name="name" required error={err.name} />
        <Field label="Work email" name="email" type="email" required error={err.email} />
        <Field label="Company" name="company" required error={err.company} />
        <Field label="Your role" name="role" placeholder="Owner, Operations Manager…" error={err.role} />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SelectField
          label="Team size"
          name="employees"
          error={err.employees}
          options={[
            { value: "", label: "Select a range" },
            { value: "1-5", label: "1–5 employees" },
            { value: "6-25", label: "6–25 employees" },
            { value: "26-100", label: "26–100 employees" },
            { value: "100+", label: "100+ employees" },
          ]}
        />
        <SelectField
          label="Type of shop"
          name="businessType"
          options={[
            { value: "", label: "Choose one" },
            { value: "SIGN_SHOP", label: "Sign shop" },
            { value: "PRINT_SHOP", label: "Print shop" },
            { value: "HYBRID", label: "Sign + print hybrid" },
            { value: "OTHER", label: "Other / custom fab" },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <SelectField
          label="Preferred time window"
          name="preferredTime"
          required
          error={err.preferredTime}
          options={[
            { value: "", label: "Pick one" },
            { value: "morning", label: "Morning (8–11am)" },
            { value: "afternoon", label: "Afternoon (12–3pm)" },
            { value: "evening", label: "Late afternoon (3–5pm)" },
            { value: "flexible", label: "I'm flexible" },
          ]}
        />
        <Field
          label="Timezone"
          name="timezone"
          defaultValue={detectedTz}
          key={detectedTz /* re-render once detection runs */}
          required
          error={err.timezone}
          placeholder="America/Los_Angeles"
        />
      </div>

      <TextareaField
        label="Anything specific you want to see? (optional)"
        name="message"
        rows={4}
        error={err.message}
        placeholder="e.g. 'We run 3 locations and need to see multi-branch reporting.'"
      />

      {/* Attribution — URL + referrer snapshot. Read once from the
          browser; the server action reads them from formData. */}
      <AttributionFields />

      {state.message && !state.ok && (
        <div
          role="alert"
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md px-6 text-sm font-medium transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
      >
        {pending ? "Sending…" : "Request demo"}
      </button>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        No credit card. No pushy sales follow-ups. We&apos;ll propose 2–3 times
        that fit your window and stop emailing if the timing isn&apos;t right.
      </p>
    </form>
  );
}

/**
 * Tiny helper that stashes the current URL + referrer as hidden fields
 * so the server action can persist attribution without client state.
 */
function AttributionFields() {
  const [source, setSource] = React.useState<string>("");
  const [referrer, setReferrer] = React.useState<string>("");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setSource(window.location.pathname);
    setReferrer(document.referrer || "");
  }, []);

  return (
    <>
      <input type="hidden" name="_source" value={source} />
      <input type="hidden" name="_referrer" value={referrer} />
    </>
  );
}

// ── Field primitives (duplicated from ContactForm on purpose — tiny,
//    stable, and extracting a shared library just to share a label
//    pattern is premature abstraction). ──

interface FieldBase {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
}

function Field({
  label,
  name,
  error,
  required,
  type = "text",
  placeholder,
  defaultValue,
}: FieldBase & { type?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
        {required && (
          <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
            *
          </span>
        )}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: `1px solid ${error ? "var(--danger-fg)" : "var(--border-default)"}`,
          color: "var(--text-default)",
        }}
      />
      {error && (
        <span className="mt-1 block text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function SelectField({
  label,
  name,
  error,
  required,
  options,
}: FieldBase & { options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
        {required && (
          <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
            *
          </span>
        )}
      </span>
      <select
        name={name}
        required={required}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: `1px solid ${error ? "var(--danger-fg)" : "var(--border-default)"}`,
          color: "var(--text-default)",
        }}
        defaultValue=""
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="mt-1 block text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function TextareaField({
  label,
  name,
  rows = 4,
  required,
  placeholder,
  error,
}: FieldBase & { rows?: number; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
        {required && (
          <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
            *
          </span>
        )}
      </span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: `1px solid ${error ? "var(--danger-fg)" : "var(--border-default)"}`,
          color: "var(--text-default)",
          resize: "vertical",
        }}
      />
      {error && (
        <span className="mt-1 block text-xs" style={{ color: "var(--danger-fg)" }}>
          {error}
        </span>
      )}
    </label>
  );
}
