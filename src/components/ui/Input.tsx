import * as React from "react";
import { cn } from "@/lib/cn";

// Input — Spec Page 0 §0.5.3.
//
// Subtypes: text, email, password, number, search, tel, url. We don't
// (yet) bundle a show/hide toggle for password or a clear button for
// search; both are slotted in by the call site via `suffix` for now.
//
// Sizes from spec: sm 32px (h-8), md 36px (h-9, default), lg 40px (h-10).
//
// States: default, hover (border-strong), focus (border-focus +
// shadow-focus), filled, disabled (bg-muted, text-disabled), readonly,
// invalid (border-error, error text), warning (amber border).

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8  text-[13px] px-2.5",
  md: "h-9  text-[14px] px-3",
  lg: "h-10 text-[14px] px-3.5",
};

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  /** Spec §0.5.3 — amber border + warning text-color. Used for soft
   *  validation (e.g. "this field is unusual but not invalid"). Ignored
   *  when `error` is set. */
  warning?: string;
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
    warning,
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

  const borderColor = error
    ? "var(--danger-border, var(--rose-500))"
    : warning
    ? "var(--warning-fg, var(--amber-500))"
    : "var(--border-default)";

  const field = (
    <div
      className={cn(
        "flex items-center rounded-md transition-colors",
        "focus-within:shadow-[var(--shadow-focus)]",
        !error && !warning && "hover:border-[var(--border-strong)]",
      )}
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${borderColor}`,
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

  if (!label && !hint && !error && !warning) {
    return <div className={containerClassName}>{field}</div>;
  }

  return (
    <div className={cn("flex flex-col gap-1", containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
          {label}
          {required && <span aria-hidden style={{ color: "var(--danger-fg)" }}> *</span>}
        </label>
      )}
      {field}
      {(error || warning || hint) && (
        <span
          id={describedById}
          className="text-[12px]"
          style={{
            color: error
              ? "var(--danger-fg, var(--rose-600))"
              : warning
              ? "var(--warning-fg, var(--amber-700))"
              : "var(--text-faint)",
          }}
        >
          {error ?? warning ?? hint}
        </span>
      )}
    </div>
  );
});
