import * as React from "react";
import { cn } from "@/lib/cn";

// Textarea — label/hint/error handling mirrors Input. Defaults to
// autosize-free (fixed rows) because predictable heights are easier to
// reason about inside a form grid. Pass `rows` to adjust.

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, containerClassName, id, required, rows = 4, style, ...rest },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const describedById = error || hint ? `${inputId}-desc` : undefined;

  const field = (
    <textarea
      ref={ref}
      id={inputId}
      required={required}
      rows={rows}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedById}
      className={cn(
        "w-full rounded-md px-3 py-2 text-sm outline-none placeholder:text-[color:var(--text-faint)]",
        "focus:shadow-[var(--shadow-focus)]",
        "resize-y",
        className,
      )}
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${error ? "var(--danger-border)" : "var(--border-default)"}`,
        color: "var(--text-default)",
        ...style,
      }}
      {...rest}
    />
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
