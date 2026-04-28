"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// Switch — toggle with sliding thumb. A thin wrapper around a hidden
// checkbox so the form posts a boolean exactly like a native control,
// but the visible UI is the rounded pill with a thumb.
//
// Both controlled and uncontrolled forms work:
//   <Switch checked={on} onCheckedChange={setOn} label="Notifications" />
//   <Switch defaultChecked name="emailDigest" label="Weekly digest" />

type Size = "sm" | "md" | "lg";

const SIZE_TRACK: Record<Size, { w: number; h: number; pad: number }> = {
  sm: { w: 28, h: 16, pad: 2 },
  md: { w: 36, h: 20, pad: 2 },
  lg: { w: 44, h: 24, pad: 3 },
};

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "onChange"> {
  size?: Size;
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Where to render the label relative to the switch. */
  labelPosition?: "left" | "right";
  /** Controlled state. */
  checked?: boolean;
  /** Called when the user flips the switch. */
  onCheckedChange?: (checked: boolean) => void;
  /** Style override for the wrapping <label>. */
  wrapperClassName?: string;
}

export function Switch({
  size = "md",
  label,
  description,
  labelPosition = "right",
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  wrapperClassName,
  className,
  id,
  ...rest
}: SwitchProps) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState<boolean>(!!defaultChecked);
  const isOn = isControlled ? !!checked : internal;
  const reactId = React.useId();
  const inputId = id ?? `switch-${reactId}`;

  const dims = SIZE_TRACK[size];
  const thumbSize = dims.h - dims.pad * 2;
  const offsetOn = dims.w - dims.pad * 2 - thumbSize;

  const track = (
    <span
      aria-hidden
      className={cn(
        "relative inline-block shrink-0 rounded-full transition-colors",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      style={{
        width: dims.w,
        height: dims.h,
        background: isOn ? "var(--accent-primary)" : "var(--surface-3)",
        border: `1px solid ${isOn ? "var(--accent-primary)" : "var(--border-default)"}`,
        transitionDuration: "var(--duration-fast)",
      }}
    >
      <span
        className="absolute top-1/2 block rounded-full transition-transform"
        style={{
          width: thumbSize,
          height: thumbSize,
          transform: `translate(${isOn ? offsetOn : 0}px, -50%)`,
          left: dims.pad,
          background: isOn ? "var(--accent-fg)" : "var(--surface-1)",
          boxShadow: "var(--shadow-sm)",
          transitionDuration: "var(--duration-fast)",
        }}
      />
    </span>
  );

  const labelEl = (label || description) && (
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
  );

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex select-none items-center gap-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        wrapperClassName,
      )}
    >
      {labelPosition === "left" && labelEl}
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className="sr-only"
        checked={isOn}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.checked;
          if (!isControlled) setInternal(next);
          onCheckedChange?.(next);
        }}
        {...rest}
      />
      {track}
      {labelPosition === "right" && labelEl}
    </label>
  );
}
