import * as React from "react";
import { cn } from "@/lib/cn";

// Select — native <select>. We deliberately don't ship a custom popup
// yet; native is accessible, keyboard-friendly, and works in forms
// without extra wiring. When we need combobox/typeahead we'll build a
// separate `Combobox` primitive on top of this.
//
// `options` accepts `{ value, label, disabled? }` or just strings.

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-7 text-xs px-2 pr-7",
  md: "h-9 text-sm px-3 pr-8",
  lg: "h-11 text-sm px-3.5 pr-9",
};

type Option =
  | string
  | { value: string; label: string; disabled?: boolean };

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  hint?: string;
  error?: string;
  options?: Option[];
  size?: Size;
  containerClassName?: string;
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    options,
    size = "md",
    className,
    containerClassName,
    id,
    required,
    placeholder,
    children,
    style,
    ...rest
  },
  ref,
) {
  const autoId = React.useId();
  const selectId = id ?? autoId;
  const describedById = error || hint ? `${selectId}-desc` : undefined;

  const field = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          "w-full appearance-none rounded-md outline-none",
          "focus:shadow-[var(--shadow-focus)]",
          SIZE_CLASS[size],
          className,
        )}
        style={{
          background: "var(--surface-1)",
          border: `1px solid ${error ? "var(--danger-border)" : "var(--border-default)"}`,
          color: "var(--text-default)",
          ...style,
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options?.map((opt) => {
          if (typeof opt === "string") {
            return <option key={opt} value={opt}>{opt}</option>;
          }
          return (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          );
        })}
        {children}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        style={{ color: "var(--text-muted)" }}
      >
        <path d="M2 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );

  if (!label && !hint && !error) {
    return <div className={containerClassName}>{field}</div>;
  }

  return (
    <div className={cn("flex flex-col gap-1", containerClassName)}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
          {required && <span aria-hidden style={{ color: "var(--danger-fg)" }}> *</span>}
        </label>
      )}
      {field}
      {(error || hint) && (
        <span
          id={describedById}
          className="text-xs"
          style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}
        >
          {error ?? hint}
        </span>
      )}
    </div>
  );
});
