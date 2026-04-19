import * as React from "react";

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

export function SelectField(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    options: { value: string; label: string }[];
  },
) {
  const { label, options, ...rest } = props;
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <select
        {...rest}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={inputStyle}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const style: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--accent)", color: "white" }
      : variant === "danger"
      ? { background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }
      : { border: "1px solid var(--border)", color: "var(--text)" };
  return (
    <button
      {...rest}
      className={`rounded-md px-4 py-2 text-sm font-medium ${className}`}
      style={style}
    />
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
