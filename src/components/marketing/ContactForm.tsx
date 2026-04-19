"use client";

import * as React from "react";
import { useActionState } from "react";
import { submitInquiry, type InquiryState } from "@/app/actions/marketing";

// ContactForm — the client side of /contact.
//
// Uses React's useActionState to drive the server action, so we can
// show inline field errors and a success panel without pulling in
// react-hook-form or similar. Intentionally no JS validation beyond
// `required` — the authoritative checks live in the server action so
// bots + JS-disabled browsers get the same behavior as everyone else.

const INITIAL: InquiryState = { ok: false };

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitInquiry, INITIAL);

  if (state.ok) {
    return (
      <div
        role="status"
        className="rounded-xl p-8 text-center"
        style={{
          background: "var(--success-surface)",
          border: "1px solid var(--success-border, var(--success-fg))",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl"
          style={{ background: "var(--success-fg)", color: "var(--accent-fg)" }}
        >
          ✓
        </div>
        <h3
          className="text-xl font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Message sent
        </h3>
        <p
          className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {state.message}
        </p>
      </div>
    );
  }

  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {/* Honeypot — hidden from real users via CSS; bots fill it. */}
      <div className="hidden" aria-hidden>
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Your name" name="name" required error={err.name} />
        <Field
          label="Work email"
          name="email"
          type="email"
          required
          error={err.email}
        />
        <Field label="Company" name="company" required error={err.company} />
        <Field label="Your role" name="role" placeholder="Owner, Operations Manager…" error={err.role} />
      </div>

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

      <TextareaField
        label="What are you hoping to solve?"
        name="message"
        rows={5}
        required
        error={err.message}
        placeholder="Tell us a bit about your shop and what's brought you here today."
      />

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
        style={{
          background: "var(--accent-primary)",
          color: "var(--accent-fg)",
        }}
      >
        {pending ? "Sending…" : "Send message"}
      </button>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        By submitting, you agree to our privacy policy. We&apos;ll never share
        your email.
      </p>
    </form>
  );
}

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
}: FieldBase & { type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
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
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--danger-fg)" }}
        >
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
  options,
}: FieldBase & { options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
        {label}
      </span>
      <select
        name={name}
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
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--danger-fg)" }}
        >
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
      <span
        className="mb-1 block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
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
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--danger-fg)" }}
        >
          {error}
        </span>
      )}
    </label>
  );
}
