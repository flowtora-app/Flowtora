"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

// Button — the single source of truth for any clickable action in the
// app. Six variants cover every use case we've seen:
//
//   primary   — the main action (submit, confirm, save)
//   secondary — the "also valid" action (neutral outline)
//   ghost     — low-emphasis (toolbars, table row actions)
//   danger    — destructive confirmation
//   success   — positive confirmation (rare; usually primary is enough)
//   link      — looks like a link, behaves like a button
//
// Three sizes: sm / md / lg. md is the default.
//
// Icons via `leftIcon` / `rightIcon`. When `loading` is true the button
// is disabled and a spinner overlays the content — we keep the content
// mounted-but-invisible so the button doesn't shift width mid-click.
//
// Auto-loading: when this Button is `type="submit"` and a parent form
// is currently submitting, we read `useFormStatus()` and flip `loading`
// to `true` automatically. This means every form submit across the app
// shows a spinner without each call site wiring up state. Pass an
// explicit `loading={false}` if you ever need to opt out.
//
// Hover is driven by CSS classes (.ts-btn-*) instead of a brightness
// filter — filter doesn't move pure-white surfaces in light mode, so
// we use theme-aware tokens (accent-hover, surface-3) via real CSS.

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "ts-btn-primary",
  secondary: "ts-btn-secondary",
  ghost: "ts-btn-ghost",
  danger: "ts-btn-danger",
  success: "ts-btn-success",
  link: "ts-btn-link",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    leftIcon,
    rightIcon,
    fullWidth,
    disabled,
    className,
    children,
    style,
    type,
    ...rest
  },
  ref,
) {
  // useFormStatus() returns pending=false when this button isn't inside
  // a submitting form, so calling it unconditionally is safe. We only
  // surface that pending state for submit buttons — other types (e.g. a
  // Cancel button rendered alongside) shouldn't spin while the form
  // submits.
  const formStatus = useFormStatus();
  const autoPending = type === "submit" && formStatus.pending;
  const isLoading = loading ?? autoPending;
  const isDisabled = disabled || isLoading;
  const isLink = variant === "link";

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={cn(
        "ts-focus ts-btn relative inline-flex items-center justify-center rounded-md font-medium select-none transition-colors",
        VARIANT_CLASS[variant],
        isLink ? "" : SIZE_CLASS[size],
        fullWidth && "w-full",
        isDisabled && "cursor-not-allowed opacity-60",
        className,
      )}
      style={{
        transitionDuration: "var(--duration-fast)",
        ...style,
      }}
      {...rest}
    >
      {isLoading && (
        <span className="absolute inset-0 inline-flex items-center justify-center" aria-hidden>
          <Spinner />
        </span>
      )}
      <span
        className="inline-flex items-center"
        style={{
          gap: size === "sm" ? "0.375rem" : "0.5rem",
          visibility: isLoading ? "hidden" : "visible",
        }}
      >
        {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
      </span>
    </button>
  );
});

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ animation: "ts-spin 0.7s linear infinite" }}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <style>{`@keyframes ts-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
