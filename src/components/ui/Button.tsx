"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

// Button — Spec Page 0 §0.5.1.
//
// Variants:
//   primary     — main action (brand-600 bg, white text)
//   secondary   — neutral outline + surface bg
//   tertiary    — transparent bg, hover surface (subtle in toolbars)
//   outline     — transparent bg, strong border
//   ghost       — low-emphasis text-button (table row actions)
//   destructive — rose-600 bg, white text (was: danger; alias kept)
//   link        — looks like a link, behaves like a button
//
// Sizes: xs (24px), sm (32px), md (36px, default), lg (40px), xl (48px).
//
// Backward-compat: `danger` accepted as alias for `destructive`,
// `success` accepted as legacy non-spec variant. Existing call sites
// keep working.
//
// Icons via `leftIcon` / `rightIcon`. When `loading` is true the button
// is disabled and a spinner overlays the content — we keep the content
// mounted-but-invisible so the button doesn't shift width mid-click.
//
// Auto-loading: when this Button is `type="submit"` and a parent form
// is currently submitting, we read `useFormStatus()` and flip `loading`
// to `true` automatically.
//
// Hover is driven by CSS classes (.ts-btn-*) defined in globals.css.

type Variant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link"
  // Legacy aliases — kept so existing call sites compile.
  | "danger"
  | "success";
type Size = "xs" | "sm" | "md" | "lg" | "xl";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:     "ts-btn-primary",
  secondary:   "ts-btn-secondary",
  tertiary:    "ts-btn-tertiary",
  outline:     "ts-btn-outline",
  ghost:       "ts-btn-ghost",
  destructive: "ts-btn-danger",
  link:        "ts-btn-link",
  danger:      "ts-btn-danger",   // legacy alias
  success:     "ts-btn-success",  // legacy non-spec
};

// Sizes from spec §0.5.1: xs 24, sm 32, md 36, lg 40, xl 48.
const SIZE_CLASS: Record<Size, string> = {
  xs: "h-6  px-2   text-[12px] gap-1",
  sm: "h-8  px-3   text-[13px] gap-1.5",
  md: "h-9  px-3.5 text-[14px] gap-2",
  lg: "h-10 px-4   text-[14px] gap-2",
  xl: "h-12 px-5   text-[16px] gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  /** Trailing kbd shortcut chip per spec §0.5.1. */
  kbd?: string;
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
    kbd,
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
          gap: size === "xs" || size === "sm" ? "0.375rem" : "0.5rem",
          visibility: isLoading ? "hidden" : "visible",
        }}
      >
        {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
        {kbd && (
          <kbd
            className="ml-1 inline-flex items-center rounded px-1.5 font-mono"
            style={{
              background: "rgba(255,255,255,0.18)",
              color: "inherit",
              fontSize: "0.7em",
              height: "1.5em",
            }}
          >
            {kbd}
          </kbd>
        )}
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
