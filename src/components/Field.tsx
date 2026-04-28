"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

const inputStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

export function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string },
) {
  const { label, hint, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input
        {...rest}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={inputStyle}
      />
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>{hint}</span>}
    </label>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

/** SelectField renders either a flat `options` list or a nested
 *  `groups` list (mapped to <optgroup>). Pass one or the other; when
 *  both are supplied, `groups` wins so a caller can preserve old
 *  `options` code while switching incrementally. */
export function SelectField(
  props: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
    label: string;
    options?: SelectOption[];
    groups?: SelectOptionGroup[];
  },
) {
  const { label, options, groups, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <select
        {...rest}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={inputStyle}
      >
        {groups
          ? groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))
          : (options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
      </select>
    </label>
  );
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string },
) {
  const { label, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <textarea
        {...rest}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={inputStyle}
      />
    </label>
  );
}

export function Button({
  variant = "primary",
  className = "",
  loading,
  type,
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  // Auto-pick up the parent form's pending state when this is a submit
  // button — every server-action form in the app gets a free spinner
  // without each call site wiring up loading state by hand.
  const { pending } = useFormStatus();
  const isLoading = loading ?? (type === "submit" && pending);
  const isDisabled = disabled || isLoading;

  const style: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--accent)", color: "white" }
      : variant === "danger"
      ? { background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }
      : { border: "1px solid var(--border)", color: "var(--text)" };

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={`relative rounded-md px-4 py-2 text-sm font-medium ${isDisabled ? "cursor-not-allowed opacity-60" : ""} ${className}`}
      style={style}
    >
      {isLoading && (
        <span className="absolute inset-0 inline-flex items-center justify-center" aria-hidden>
          <FieldSpinner />
        </span>
      )}
      <span style={{ visibility: isLoading ? "hidden" : "visible" }}>
        {children}
      </span>
    </button>
  );
}

function FieldSpinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Checkbox({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}
