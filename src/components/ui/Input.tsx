import * as React from "react";
import { cn } from "@/lib/cn";

// Input — the core text field primitive. Supports labels, hints, errors,
// and optional prefix/suffix slots (for icons, units, currency symbols).
//
// We expose a few variants via props rather than a visual mode:
//   - `label`/`hint`/`error` wrap the input in a label stack
//   - `prefix`/`suffix` drop inline decorations (e.g. "$", search icon)
//   - `size` matches the Button primitive (sm / md / lg)
//
// When `error` is truthy the border turns danger-colored and the hint is
// replaced with the error text. `aria-invalid` is set for screen readers.

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-7 text-xs px-2",
  md: "h-9 text-sm px-3",
  lg: "h-11 text-sm px-3.5",
};

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  size?: Size;
  containerClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    prefix,
    suffix,
    size = "md",
    className,
    containerClassName,
    id,
    required,
    style,
    ...rest
  },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const describedById = error || hint ? `${inputId}-desc` : undefined;

  const field = (
    <div
      className={cn(
        "flex items-center rounded-md transition-colors",
        "focus-within:shadow-[var(--shadow-focus)]",
      )}
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${error ? "var(--danger-border)" : "var(--border-default)"}`,
        color: "var(--text-default)",
      }}
    >
      {prefix && (
        <span
          className="flex shrink-0 items-center pl-3 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
        className={cn(
          "w-full bg-transparent outline-none placeholder:text-[color:var(--text-faint)]",
          SIZE_CLASS[size],
          prefix ? "pl-1.5" : null,
          suffix ? "pr-1.5" : null,
          className,
        )}
        style={style}
        {...rest}
      />
      {suffix && (
        <span
          className="flex shrink-0 items-center pr-3 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {suffix}
        </span>
      )}
    </div>
  );

  if (!label && !hint && !error) {
    return <div className={containerClassName}>{field}</div>;
  }

  return (
    <div className={cn("flex flex-col gap-1", containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
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
