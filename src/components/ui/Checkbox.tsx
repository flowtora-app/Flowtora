"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Checkbox — custom-styled checkbox built on top of a hidden native
// <input type=checkbox>. Supports indeterminate state plus optional
// label + description inline. Form behavior is identical to a native
// checkbox so server actions read it the usual way.

type Size = "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = {
  sm: 14,
  md: 16,
  lg: 20,
};

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "onChange"> {
  size?: Size;
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Show the indeterminate visual (`-`) regardless of checked state. */
  indeterminate?: boolean;
  /** Controlled. */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  wrapperClassName?: string;
}

export function Checkbox({
  size = "md",
  label,
  description,
  indeterminate = false,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  wrapperClassName,
  className,
  id,
  ...rest
}: CheckboxProps) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState<boolean>(!!defaultChecked);
  const isChecked = isControlled ? !!checked : internal;
  const reactId = React.useId();
  const inputId = id ?? `checkbox-${reactId}`;
  const px = SIZE_PX[size];
  const showFilled = isChecked || indeterminate;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex items-start gap-2",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        wrapperClassName,
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="sr-only"
        checked={isChecked}
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : isChecked}
        onChange={(e) => {
          const next = e.target.checked;
          if (!isControlled) setInternal(next);
          onCheckedChange?.(next);
        }}
        {...rest}
      />
      <span
        aria-hidden
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded transition-colors",
          className,
        )}
        style={{
          width: px,
          height: px,
          marginTop: 1,
          background: showFilled ? "var(--accent-primary)" : "var(--surface-1)",
          border: `1px solid ${showFilled ? "var(--accent-primary)" : "var(--border-default)"}`,
          transitionDuration: "var(--duration-fast)",
          color: "var(--accent-fg)",
        }}
      >
        {indeterminate ? (
          <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="8" x2="12" y2="8" />
          </svg>
        ) : isChecked ? (
          <svg width={px} height={px} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
          </svg>
        ) : null}
      </span>
      {(label || description) && (
        <span className="flex flex-col">
          {label && (
            <span className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}
