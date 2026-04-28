"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Radio + RadioGroup — custom-styled radios built on hidden native inputs
// so form submissions still surface a `name=value` pair to the server.
//
//   <RadioGroup name="plan" value={value} onValueChange={setValue}>
//     <Radio value="starter" label="Starter" />
//     <Radio value="growth"  label="Growth" />
//   </RadioGroup>
//
// You can also use individual Radios outside a RadioGroup if you want
// React Hook Form / native form behavior to do the work; pass `name`
// directly to each Radio in that case.

type Size = "sm" | "md" | "lg";
const SIZE_PX: Record<Size, number> = { sm: 14, md: 16, lg: 20 };
const DOT_PX: Record<Size, number> = { sm: 6, md: 7, lg: 9 };

interface RadioGroupContextValue {
  name?: string;
  value?: string;
  onValueChange?: (next: string) => void;
}
const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (next: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function RadioGroup({
  name,
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: RadioGroupProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<string | undefined>(defaultValue);
  const current = isControlled ? value : internal;

  const ctx = React.useMemo<RadioGroupContextValue>(
    () => ({
      name,
      value: current,
      onValueChange: (next) => {
        if (!isControlled) setInternal(next);
        onValueChange?.(next);
      },
    }),
    [name, current, isControlled, onValueChange],
  );

  return (
    <div role="radiogroup" className={cn("flex flex-col gap-2", className)}>
      <RadioGroupContext.Provider value={ctx}>
        {children}
      </RadioGroupContext.Provider>
    </div>
  );
}

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "onChange"> {
  value: string;
  size?: Size;
  label?: React.ReactNode;
  description?: React.ReactNode;
  wrapperClassName?: string;
}

export function Radio({
  value,
  size = "md",
  label,
  description,
  disabled,
  wrapperClassName,
  className,
  id,
  name: nameProp,
  checked: checkedProp,
  ...rest
}: RadioProps) {
  const ctx = React.useContext(RadioGroupContext);
  const reactId = React.useId();
  const inputId = id ?? `radio-${reactId}`;
  const name = nameProp ?? ctx?.name;
  const isChecked = checkedProp ?? (ctx ? ctx.value === value : undefined);
  const px = SIZE_PX[size];
  const dot = DOT_PX[size];

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
        type="radio"
        name={name}
        value={value}
        checked={isChecked}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          if (e.target.checked) ctx?.onValueChange?.(value);
        }}
        {...rest}
      />
      <span
        aria-hidden
        className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full transition-colors", className)}
        style={{
          width: px,
          height: px,
          marginTop: 1,
          background: "var(--surface-1)",
          border: `1px solid ${isChecked ? "var(--accent-primary)" : "var(--border-default)"}`,
          transitionDuration: "var(--duration-fast)",
        }}
      >
        {isChecked && (
          <span
            className="block rounded-full"
            style={{
              width: dot,
              height: dot,
              background: "var(--accent-primary)",
            }}
          />
        )}
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
